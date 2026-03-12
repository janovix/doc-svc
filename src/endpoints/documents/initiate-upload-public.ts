import { OpenAPIRoute, Str, Bool } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { generateId } from "../../lib/id-generator";
import { getPrisma } from "../../lib/prisma";
import { createR2Client, generateMvpUploadUrls } from "../../lib/r2-presign";
import { generateSessionToken } from "../../lib/session-token";
import { verifyTurnstileToken } from "../../lib/turnstile";
import { formatZodError } from "../../lib/format-zod-error";
import { UploadLinkRepository } from "../../domain/upload-link/repository";
import { UploadLinkService } from "../../domain/upload-link/service";

/**
 * Schema for public initiate upload request body (MVP)
 */
const InitiateUploadPublicBodySchema = z.object({
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
	uploadLinkId: z
		.string()
		.optional()
		.describe("Upload link ID (required for scan app uploads)"),
});

/**
 * POST /documents/initiate-upload/public
 *
 * Public endpoint for initiating document uploads without authentication.
 * Requires a valid Cloudflare Turnstile token OR a valid upload link ID.
 *
 * Returns a session token that must be used for subsequent requests
 * (confirm upload, get URLs).
 */
export class InitiateUploadPublic extends OpenAPIRoute {
	schema = {
		tags: ["Documents"],
		summary: "Initiate public document upload",
		description:
			"Generate presigned URLs for public (unauthenticated) document upload. Requires Turnstile verification or valid upload link.",
		request: {
			headers: z.object({
				"x-turnstile-token": Str({
					description: "Cloudflare Turnstile token",
				}).optional(),
				"x-kyc-session-token": Str({
					description:
						"KYC session token (validates via aml-svc; skips Turnstile)",
				}).optional(),
			}),
			body: {
				content: {
					"application/json": {
						schema: InitiateUploadPublicBodySchema,
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
								sessionToken: Str({
									description: "Session token for subsequent requests",
								}),
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
			"401": {
				description: "Turnstile verification failed",
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
				description: "Service not configured",
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
		const turnstileToken = c.req.header("x-turnstile-token");
		const kycSessionToken = c.req.header("x-kyc-session-token");

		// Check configuration
		const {
			R2_ACCOUNT_ID,
			R2_ACCESS_KEY_ID,
			R2_SECRET_ACCESS_KEY,
			R2_BUCKET_NAME,
			R2_PUBLIC_DOMAIN,
			TURNSTILE_SECRET_KEY,
			SESSION_TOKEN_SECRET,
			AML_SERVICE_URL,
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

		if (!SESSION_TOKEN_SECRET) {
			return c.json(
				{
					success: false,
					error: "Session token configuration not available",
				},
				503,
			);
		}

		// Parse and validate request body
		const body = await c.req.json();
		const parseResult = InitiateUploadPublicBodySchema.safeParse(body);

		if (!parseResult.success) {
			return c.json(
				{ success: false, error: formatZodError(parseResult.error) },
				400,
			);
		}

		const { pageCount, originalPdfCount, originalImageCount, uploadLinkId } =
			parseResult.data;

		// Determine organization ID
		let organizationId = "public";

		// KYC session token: validate with aml-svc and skip Turnstile
		if (kycSessionToken && AML_SERVICE_URL) {
			const kycUrl = `${AML_SERVICE_URL}/api/v1/public/kyc/${encodeURIComponent(kycSessionToken)}`;
			let kycRes: Response;
			try {
				kycRes = await fetch(kycUrl);
			} catch (err) {
				console.error("KYC session validation request failed:", err);
				return c.json(
					{
						success: false,
						error: "KYC session validation unavailable",
					},
					503,
				);
			}
			if (!kycRes.ok) {
				const status = kycRes.status;
				let errorMessage = "Invalid or expired KYC session";
				try {
					const body = (await kycRes.json()) as {
						message?: string;
						error?: string;
					};
					if (body.message) {
						errorMessage = body.message;
					} else if (
						body.error === "SESSION_EXPIRED" ||
						body.error === "SESSION_REVOKED"
					) {
						errorMessage =
							body.message ?? "KYC session has expired or been revoked";
					}
				} catch {
					// Use default message if body is not JSON
				}
				return c.json(
					{ success: false, error: errorMessage },
					status === 410 ? 410 : 401,
				);
			}
			const kycData = (await kycRes.json()) as {
				session?: { organizationId?: string };
			};
			const orgId = kycData.session?.organizationId;
			if (!orgId) {
				return c.json(
					{
						success: false,
						error: "Invalid KYC session response",
					},
					401,
				);
			}
			organizationId = orgId;
		} else if (uploadLinkId) {
			// Upload link ID provided, validate and get organization ID
			const prisma = getPrisma(c.env.DB);
			const uploadLinkRepo = new UploadLinkRepository(prisma);
			const uploadLinkService = new UploadLinkService(uploadLinkRepo);

			try {
				const uploadLink =
					await uploadLinkService.validateForUpload(uploadLinkId);
				organizationId = uploadLink.organizationId;
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
		} else {
			// No KYC token and no upload link, require Turnstile verification
			if (!turnstileToken) {
				return c.json(
					{
						success: false,
						error:
							"Missing Turnstile token, KYC session token, or upload link ID",
					},
					400,
				);
			}

			// Verify Turnstile token (skip if no secret configured - dev mode)
			if (TURNSTILE_SECRET_KEY) {
				const clientIp = c.req.header("cf-connecting-ip");
				const turnstileResult = await verifyTurnstileToken(
					turnstileToken,
					TURNSTILE_SECRET_KEY,
					clientIp,
				);

				if (!turnstileResult.success) {
					return c.json(
						{
							success: false,
							error: `Turnstile verification failed: ${turnstileResult.error}`,
						},
						401,
					);
				}
			}
		}

		// Generate document ID
		const documentId = generateId("DOC");

		// Create R2 client
		const r2Client = createR2Client({
			accountId: R2_ACCOUNT_ID,
			accessKeyId: R2_ACCESS_KEY_ID,
			secretAccessKey: R2_SECRET_ACCESS_KEY,
			bucketName: R2_BUCKET_NAME,
			publicDomain: R2_PUBLIC_DOMAIN,
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

		// Generate session token
		const { token: sessionToken } = await generateSessionToken(
			documentId,
			organizationId,
			SESSION_TOKEN_SECRET,
			60, // 1 hour
		);

		const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

		// Broadcast SSE event for upload initiation (if upload link)
		if (uploadLinkId) {
			try {
				const doId = c.env.UPLOAD_LINK_EVENTS.idFromName(uploadLinkId);
				const stub = c.env.UPLOAD_LINK_EVENTS.get(doId);
				await stub.fetch(
					new Request("https://do/broadcast", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							type: "document-initiated",
							data: {
								documentId,
								uploadLinkId,
								timestamp: new Date().toISOString(),
							},
						}),
					}),
				);
			} catch (error) {
				// SSE broadcast is best-effort
				console.error("Failed to broadcast SSE event:", error);
			}
		}

		return c.json({
			success: true,
			result: {
				documentId,
				sessionToken,
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
