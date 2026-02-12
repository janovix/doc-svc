import { OpenAPIRoute, Str, Bool } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { createR2Client, objectExists } from "../../lib/r2-presign";
import { verifySessionToken } from "../../lib/session-token";
import { DocumentRepository } from "../../domain/document/repository";
import { DocumentService } from "../../domain/document/service";
import { UploadLinkRepository } from "../../domain/upload-link/repository";
import { UploadLinkService } from "../../domain/upload-link/service";
import { DocumentTypeSchema } from "../../domain/document/schemas";

/**
 * Schema for confirm upload request body (MVP)
 * Supports complete file structure: original files + rasterized + final PDF
 */
const ConfirmUploadBodySchema = z
	.object({
		fileName: z.string().describe("Original file name"),
		fileSize: z.number().int().positive().describe("Total file size in bytes"),
		pageCount: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("Number of pages (derived from rasterizedImages if omitted)"),
		sha256Hash: z
			.string()
			.optional()
			.describe("SHA-256 hash of final PDF (optional)"),
		// File structure (R2 keys) — flat format
		originalPdfs: z
			.array(z.string())
			.optional()
			.describe("R2 keys for original PDFs"),
		originalImages: z
			.array(z.string())
			.optional()
			.describe("R2 keys for original images"),
		rasterizedImages: z
			.array(z.string())
			.min(1)
			.optional()
			.describe("R2 keys for rasterized images"),
		finalPdfKey: z
			.string()
			.optional()
			.describe("R2 key for final compiled PDF"),
		// Nested keys format (sent by aml frontend)
		keys: z
			.object({
				originalPdfs: z.array(z.string()).optional(),
				originalImages: z.array(z.string()).optional(),
				rasterizedImages: z.array(z.string()).optional(),
				finalPdf: z.string().optional(),
			})
			.optional()
			.describe("Alternative nested key format"),
		// Metadata
		documentType: DocumentTypeSchema.optional().describe(
			"Document type (mx_ine_front, passport, etc.)",
		),
		uploadLinkId: z
			.string()
			.optional()
			.describe("Upload link ID if uploading via link"),
	})
	.transform((data) => {
		// Normalize: merge nested `keys` into flat fields (flat takes precedence)
		const rasterizedImages =
			data.rasterizedImages ?? data.keys?.rasterizedImages ?? [];
		return {
			fileName: data.fileName,
			fileSize: data.fileSize,
			pageCount: data.pageCount ?? rasterizedImages.length,
			sha256Hash: data.sha256Hash,
			originalPdfs: data.originalPdfs ?? data.keys?.originalPdfs ?? undefined,
			originalImages:
				data.originalImages ?? data.keys?.originalImages ?? undefined,
			rasterizedImages,
			finalPdfKey: data.finalPdfKey ?? data.keys?.finalPdf ?? undefined,
			documentType: data.documentType,
			uploadLinkId: data.uploadLinkId,
		};
	})
	.refine((data) => data.rasterizedImages.length > 0, {
		message: "At least one rasterized image is required",
		path: ["rasterizedImages"],
	})
	.refine((data) => !!data.finalPdfKey, {
		message: "Final PDF key is required (finalPdfKey or keys.finalPdf)",
		path: ["finalPdfKey"],
	});

/**
 * POST /documents/:id/confirm
 *
 * Confirms that the client has completed uploading files to R2 via
 * presigned URLs. Creates the document record with complete file structure.
 *
 * Supports both authenticated (JWT) and public (x-session-token) flows:
 * - JWT: User ID and Organization ID are extracted from the JWT token
 * - Session Token: For public upload links (anonymous users)
 */
export class ConfirmUpload extends OpenAPIRoute {
	schema = {
		tags: ["Documents"],
		summary: "Confirm document upload",
		description:
			"Confirm upload completion. Creates document record with file structure. Supports JWT authentication or session token for public flows.",
		security: [{ bearerAuth: [] }],
		request: {
			params: z.object({
				id: Str({ description: "Document ID" }),
			}),
			headers: z.object({
				"x-session-token": Str({
					description: "Session token (for public flow - alternative to JWT)",
				}).optional(),
			}),
			body: {
				content: {
					"application/json": {
						schema: ConfirmUploadBodySchema,
					},
				},
			},
		},
		responses: {
			"200": {
				description: "Upload confirmed",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							result: z.object({
								documentId: Str(),
								status: Str(),
							}),
						}),
					},
				},
			},
			"400": {
				description: "Bad request or files not found",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							error: Str(),
						}),
					},
				},
			},
			"401": {
				description: "Unauthorized - Missing or invalid authentication",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							error: Str(),
						}),
					},
				},
			},
			"409": {
				description: "Organization required - User must select an organization",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							error: Str(),
							code: Str(),
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		const { id: documentId } = c.req.param() as { id: string };

		// Support both JWT authenticated and public (session token) flows
		let organizationId: string | undefined;
		let userId: string | undefined;
		const sessionToken = c.req.header("x-session-token");

		// Priority 1: Session token (for public upload links)
		if (sessionToken) {
			const { SESSION_TOKEN_SECRET } = c.env;

			if (!SESSION_TOKEN_SECRET) {
				return c.json(
					{
						success: false,
						error: "Session token configuration not available",
					},
					503,
				);
			}

			const tokenData = await verifySessionToken(
				sessionToken,
				SESSION_TOKEN_SECRET,
			);

			if (!tokenData) {
				return c.json(
					{ success: false, error: "Invalid or expired session token" },
					401,
				);
			}

			// Verify token is for this document
			if (tokenData.doc !== documentId) {
				return c.json(
					{
						success: false,
						error: "Session token not valid for this document",
					},
					401,
				);
			}

			organizationId = tokenData.org;
			userId = "anonymous";
		} else {
			// Priority 2: JWT authentication (set by auth middleware)
			const user = c.get("user");
			const organization = c.get("organization");

			if (!user) {
				return c.json(
					{
						success: false,
						error: "Unauthorized",
						message: "Authentication required (JWT or session token)",
					},
					401,
				);
			}

			if (!organization) {
				return c.json(
					{
						success: false,
						error: "Organization Required",
						code: "ORGANIZATION_REQUIRED",
						message:
							"An active organization must be selected. Please switch to an organization first.",
					},
					409,
				);
			}

			organizationId = organization.id;
			userId = user.id;
		}

		if (!organizationId || !userId) {
			return c.json(
				{
					success: false,
					error: "Missing authentication (JWT or session token required)",
				},
				401,
			);
		}

		// Check R2 presign configuration
		const {
			R2_ACCOUNT_ID,
			R2_ACCESS_KEY_ID,
			R2_SECRET_ACCESS_KEY,
			R2_BUCKET_NAME,
			R2_PUBLIC_DOMAIN,
		} = c.env;

		if (
			!R2_ACCOUNT_ID ||
			!R2_ACCESS_KEY_ID ||
			!R2_SECRET_ACCESS_KEY ||
			!R2_BUCKET_NAME
		) {
			return c.json(
				{
					success: false,
					error: "R2 presigned URL configuration not available",
				},
				503,
			);
		}

		// Parse and validate request body
		const body = await c.req.json();
		const parseResult = ConfirmUploadBodySchema.safeParse(body);

		if (!parseResult.success) {
			return c.json({ success: false, error: parseResult.error.message }, 400);
		}

		const {
			fileName,
			fileSize,
			pageCount,
			sha256Hash,
			originalPdfs,
			originalImages,
			rasterizedImages,
			finalPdfKey,
			documentType,
			uploadLinkId,
		} = parseResult.data;

		// Create R2 client
		const r2Client = createR2Client({
			accountId: R2_ACCOUNT_ID,
			accessKeyId: R2_ACCESS_KEY_ID,
			secretAccessKey: R2_SECRET_ACCESS_KEY,
			bucketName: R2_BUCKET_NAME,
			publicDomain: R2_PUBLIC_DOMAIN,
		});

		// Verify final PDF exists (required) — refine() guarantees finalPdfKey is defined
		const finalPdfExists = await objectExists(
			r2Client,
			R2_BUCKET_NAME,
			finalPdfKey!,
		);
		if (!finalPdfExists) {
			return c.json(
				{ success: false, error: `Final PDF not found at key: ${finalPdfKey}` },
				400,
			);
		}

		// Verify rasterized images exist (required)
		for (const imageKey of rasterizedImages) {
			const imageExists = await objectExists(
				r2Client,
				R2_BUCKET_NAME,
				imageKey,
			);
			if (!imageExists) {
				return c.json(
					{
						success: false,
						error: `Rasterized image not found at key: ${imageKey}`,
					},
					400,
				);
			}
		}

		// Verify original PDFs exist if specified
		if (originalPdfs) {
			for (const pdfKey of originalPdfs) {
				const pdfExists = await objectExists(r2Client, R2_BUCKET_NAME, pdfKey);
				if (!pdfExists) {
					return c.json(
						{
							success: false,
							error: `Original PDF not found at key: ${pdfKey}`,
						},
						400,
					);
				}
			}
		}

		// Verify original images exist if specified
		if (originalImages) {
			for (const imageKey of originalImages) {
				const imageExists = await objectExists(
					r2Client,
					R2_BUCKET_NAME,
					imageKey,
				);
				if (!imageExists) {
					return c.json(
						{
							success: false,
							error: `Original image not found at key: ${imageKey}`,
						},
						400,
					);
				}
			}
		}

		const prisma = getPrisma(c.env.DB);

		// If upload link ID provided, validate it
		if (uploadLinkId) {
			const uploadLinkRepo = new UploadLinkRepository(prisma);
			const uploadLinkService = new UploadLinkService(uploadLinkRepo);

			try {
				await uploadLinkService.validateForUpload(uploadLinkId);
			} catch (error) {
				if (error instanceof Error) {
					const errorMessages: Record<string, string> = {
						UPLOAD_LINK_NOT_FOUND: "Upload link not found",
						UPLOAD_LINK_EXPIRED: "Upload link has expired",
						UPLOAD_LINK_COMPLETED: "Upload link has been completed",
						UPLOAD_LINK_MAX_UPLOADS_REACHED:
							"Maximum uploads reached for this link",
					};
					const message = errorMessages[error.message] || error.message;
					return c.json({ success: false, error: message }, 400);
				}
				throw error;
			}
		}

		// Create document record
		const documentRepo = new DocumentRepository(prisma);
		const documentService = new DocumentService(documentRepo);

		await documentService.create({
			id: documentId,
			organizationId,
			uploadLinkId,
			fileName,
			fileSize,
			pageCount,
			// Use placeholder if sha256Hash not provided (client-side hash is optional)
			sha256Hash: sha256Hash || "pending",
			originalPdfs,
			originalImages,
			rasterizedImages,
			finalPdfKey: finalPdfKey!, // refine() guarantees this is defined
			documentType,
			createdBy: userId,
		});

		// If upload link, record the upload and broadcast SSE event
		if (uploadLinkId) {
			const uploadLinkRepo = new UploadLinkRepository(prisma);
			const uploadLinkService = new UploadLinkService(uploadLinkRepo);

			await uploadLinkService.recordUpload(uploadLinkId);

			// Broadcast SSE event via Durable Object
			try {
				const doId = c.env.UPLOAD_LINK_EVENTS.idFromName(uploadLinkId);
				const stub = c.env.UPLOAD_LINK_EVENTS.get(doId);
				await stub.fetch(
					new Request("https://do/broadcast", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							type: "document-confirmed",
							data: {
								documentId,
								documentType,
								fileName,
								uploadLinkId,
								timestamp: new Date().toISOString(),
							},
						}),
					}),
				);
			} catch (error) {
				// SSE broadcast is best-effort, don't fail the upload
				console.error("Failed to broadcast SSE event:", error);
			}
		}

		return c.json({
			success: true,
			result: {
				documentId,
				status: "confirmed",
			},
		});
	}
}
