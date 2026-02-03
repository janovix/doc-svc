import { OpenAPIRoute, Str, Bool } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { generateId } from "../../lib/id-generator";
import { createR2Client, generateMvpUploadUrls } from "../../lib/r2-presign";

/**
 * Schema for MVP initiate upload request body
 */
const InitiateUploadBodySchema = z.object({
	pageCount: z
		.number()
		.int()
		.min(1)
		.max(100)
		.describe("Number of pages/rasterized images"),
	originalPdfCount: z
		.number()
		.int()
		.min(0)
		.max(20)
		.default(0)
		.describe("Number of original PDFs to upload"),
	originalImageCount: z
		.number()
		.int()
		.min(0)
		.max(100)
		.default(0)
		.describe("Number of original images to upload"),
});

/**
 * POST /documents/initiate-upload
 *
 * Initiates a document upload by generating presigned URLs for direct
 * client upload to R2. This avoids sending file data through the worker.
 *
 * MVP File Structure:
 * - original PDFs (optional)
 * - original images (optional)
 * - rasterized images (required) - for viewing
 * - final PDF (required) - compiled from rasterized images
 *
 * Flow:
 * 1. Client calls this endpoint to get presigned URLs
 * 2. Client uploads files directly to R2 using the presigned URLs
 * 3. Client calls POST /documents/:id/confirm to complete the upload
 *
 * Authentication:
 * - Requires a valid JWT token with organizationId claim
 * - User ID and Organization ID are extracted from the JWT
 */
export class InitiateUpload extends OpenAPIRoute {
	schema = {
		tags: ["Documents"],
		summary: "Initiate document upload",
		description:
			"Generate presigned URLs for uploading document files directly to R2. Requires JWT authentication with organization context.",
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				content: {
					"application/json": {
						schema: InitiateUploadBodySchema,
					},
				},
			},
		},
		responses: {
			"200": {
				description: "Upload URLs generated successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							result: z.object({
								documentId: Str({ description: "Generated document ID" }),
								uploadUrls: z.object({
									originalPdfs: z
										.array(Str())
										.describe("Presigned PUT URLs for original PDFs"),
									originalImages: z
										.array(Str())
										.describe("Presigned PUT URLs for original images"),
									rasterizedImages: z
										.array(Str())
										.describe("Presigned PUT URLs for rasterized images"),
									finalPdf: Str().describe("Presigned PUT URL for final PDF"),
								}),
								keys: z.object({
									originalPdfs: z
										.array(Str())
										.describe("R2 keys for original PDFs"),
									originalImages: z
										.array(Str())
										.describe("R2 keys for original images"),
									rasterizedImages: z
										.array(Str())
										.describe("R2 keys for rasterized images"),
									finalPdf: Str().describe("R2 key for final PDF"),
								}),
								expiresAt: Str({ description: "URL expiration timestamp" }),
							}),
						}),
					},
				},
			},
			"401": {
				description: "Unauthorized - Missing or invalid JWT token",
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
			"400": {
				description: "Bad request",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							error: Str(),
						}),
					},
				},
			},
			"503": {
				description: "R2 presigned URLs not configured",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							error: Str(),
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		// Get user and organization from JWT (set by auth middleware)
		const user = c.get("user");
		const organization = c.get("organization");

		// Verify authentication
		if (!user) {
			return c.json(
				{
					success: false,
					error: "Unauthorized",
					message: "Authentication required",
				},
				401,
			);
		}

		// Verify organization is set in JWT
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

		// userId available for future use (e.g., audit logging)
		const _userId = user.id;
		const organizationId = organization.id;

		// Check R2 presign configuration
		const {
			R2_ACCOUNT_ID,
			R2_ACCESS_KEY_ID,
			R2_SECRET_ACCESS_KEY,
			R2_BUCKET_NAME,
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
		const parseResult = InitiateUploadBodySchema.safeParse(body);

		if (!parseResult.success) {
			return c.json({ success: false, error: parseResult.error.message }, 400);
		}

		const { pageCount, originalPdfCount, originalImageCount } =
			parseResult.data;

		// Generate document ID
		const documentId = generateId("DOC");

		// Create R2 client
		const r2Client = createR2Client({
			accountId: R2_ACCOUNT_ID,
			accessKeyId: R2_ACCESS_KEY_ID,
			secretAccessKey: R2_SECRET_ACCESS_KEY,
			bucketName: R2_BUCKET_NAME,
		});

		// Generate presigned URLs (1 hour expiry)
		const expiresIn = 3600;
		const uploadResult = await generateMvpUploadUrls(
			r2Client,
			R2_BUCKET_NAME,
			organizationId,
			documentId,
			{
				originalPdfCount,
				originalImageCount,
				pageCount,
			},
			expiresIn,
		);

		const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

		return c.json({
			success: true,
			result: {
				documentId,
				uploadUrls: {
					originalPdfs: uploadResult.originalPdfUrls,
					originalImages: uploadResult.originalImageUrls,
					rasterizedImages: uploadResult.rasterizedImageUrls,
					finalPdf: uploadResult.finalPdfUrl,
				},
				keys: {
					originalPdfs: uploadResult.originalPdfKeys,
					originalImages: uploadResult.originalImageKeys,
					rasterizedImages: uploadResult.rasterizedImageKeys,
					finalPdf: uploadResult.finalPdfKey,
				},
				expiresAt,
			},
		});
	}
}
