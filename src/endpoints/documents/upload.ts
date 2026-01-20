/**
 * Document Upload Endpoint
 * POST /documents/upload
 */

import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { computeSha256 } from "../../lib/hash";
import {
	uploadToR2,
	generateDocumentKey,
	generatePreviewKey,
	getFileExtension,
	isValidFileType,
	isPdfFile,
} from "../../lib/r2-storage";
import { DocumentRepository } from "../../domain/document/repository";
import { DocumentService } from "../../domain/document/service";
import { JobRepository } from "../../domain/job/repository";
import { JobService } from "../../domain/job/service";
import type { DocumentProcessingJob } from "../../types";

/**
 * Response schema for successful upload
 */
const UploadResponseSchema = z.object({
	success: z.literal(true),
	result: z.object({
		documentId: z.string(),
		jobId: z.string(),
		message: z.string(),
	}),
});

/**
 * Response schema for duplicate document
 */
const DuplicateResponseSchema = z.object({
	success: z.literal(true),
	result: z.object({
		documentId: z.string(),
		duplicate: z.literal(true),
		message: z.string(),
	}),
});

export class DocumentUpload extends OpenAPIRoute {
	schema = {
		tags: ["Documents"],
		summary: "Upload a document with optional preview images",
		description: `
Upload a document (PDF or image) for processing. 

**Important**: PDF files MUST include at least one preview image to enable visual validation.
This prevents text-only fake PDFs from bypassing security checks.

The endpoint will:
1. Validate the file type and upload contract
2. Check for duplicate documents (by SHA-256 hash)
3. Store the document and previews in R2
4. Create a processing job
5. Enqueue the job for async processing
`,
		operationId: "document-upload",
		// Note: File uploads are handled via multipart/form-data in the handler
		// Chanfana doesn't fully support file upload schemas, so we document it manually
		responses: {
			"201": {
				description: "Document uploaded and processing job created",
				...contentJson(UploadResponseSchema),
			},
			"200": {
				description: "Duplicate document found",
				...contentJson(DuplicateResponseSchema),
			},
			"400": {
				description:
					"Invalid request (missing file, invalid type, or missing preview for PDF)",
				...contentJson(
					z.object({
						success: z.literal(false),
						error: z.string(),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(
					z.object({
						success: z.literal(false),
						error: z.string(),
					}),
				),
			},
		},
	};

	async handle(c: AppContext) {
		// TODO: Add authentication middleware
		// For now, use placeholder values
		const organizationId = c.req.header("x-organization-id") || "org_demo";
		const userId = c.req.header("x-user-id") || "user_demo";

		// Parse multipart form data
		const formData = await c.req.formData();
		const file = formData.get("file") as File | null;

		if (!file) {
			return c.json({ success: false, error: "No file provided" }, 400);
		}

		// Validate file type
		if (!isValidFileType(file.type)) {
			return c.json(
				{
					success: false,
					error: `Invalid file type: ${file.type}. Supported types: PDF, PNG, JPG, WEBP`,
				},
				400,
			);
		}

		// Collect preview files
		const previews: File[] = [];
		for (let i = 1; i <= 3; i++) {
			const preview = formData.get(`preview_${i}`) as File | null;
			if (preview) {
				previews.push(preview);
			}
		}

		// Enforce preview requirement for PDFs
		if (isPdfFile(file.type) && previews.length === 0) {
			return c.json(
				{
					success: false,
					error:
						"PDF files require at least one preview image (preview_1) for visual validation",
				},
				400,
			);
		}

		// Read file content and compute hash
		const fileBuffer = await file.arrayBuffer();
		const sha256Hash = await computeSha256(fileBuffer);

		// Initialize services
		const prisma = getPrisma(c.env.DB);
		const documentRepo = new DocumentRepository(prisma);
		const documentService = new DocumentService(documentRepo);
		const jobRepo = new JobRepository(prisma);
		const jobService = new JobService(jobRepo);

		// Check for duplicate
		const existingDoc = await documentService.checkDuplicate(
			organizationId,
			sha256Hash,
		);
		if (existingDoc) {
			return c.json(
				{
					success: true,
					result: {
						documentId: existingDoc.id,
						duplicate: true,
						message: "Document already exists",
					},
				},
				200,
			);
		}

		// Generate document ID and upload to R2
		const extension = getFileExtension(file.name, file.type);

		// Create document first to get ID
		const document = await documentService.create({
			organizationId,
			originalFileKey: "", // Will update after upload
			fileName: file.name,
			fileSize: file.size,
			fileType: extension,
			sha256Hash,
			createdBy: userId,
		});

		// Upload original file
		const originalKey = generateDocumentKey(
			organizationId,
			document.id,
			extension,
		);
		await uploadToR2({
			bucket: c.env.R2_BUCKET,
			key: originalKey,
			content: new Uint8Array(fileBuffer),
			contentType: file.type,
		});

		// Upload preview files
		const previewKeys: string[] = [];
		for (let i = 0; i < previews.length; i++) {
			const preview = previews[i];
			const previewBuffer = await preview.arrayBuffer();
			const previewExt = getFileExtension(preview.name, preview.type);
			const previewKey = generatePreviewKey(
				organizationId,
				document.id,
				i + 1,
				previewExt,
			);

			await uploadToR2({
				bucket: c.env.R2_BUCKET,
				key: previewKey,
				content: new Uint8Array(previewBuffer),
				contentType: preview.type,
			});

			previewKeys.push(previewKey);
		}

		// Update document with R2 keys (using raw prisma since we need to update)
		await prisma.document.update({
			where: { id: document.id },
			data: {
				originalFileKey: originalKey,
				previewKeys:
					previewKeys.length > 0 ? JSON.stringify(previewKeys) : null,
			},
		});

		// Create processing job
		const job = await jobService.create({
			documentId: document.id,
			organizationId,
		});

		// Enqueue job for processing
		const queuePayload: DocumentProcessingJob = {
			jobId: job.id,
			documentId: document.id,
			organizationId,
			originalFileKey: originalKey,
			previewKeys,
			createdBy: userId,
		};

		await c.env.DOC_PROCESSING_QUEUE.send(queuePayload);

		return c.json(
			{
				success: true,
				result: {
					documentId: document.id,
					jobId: job.id,
					message: "Document uploaded and processing started",
				},
			},
			201,
		);
	}
}
