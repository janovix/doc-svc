import { OpenAPIRoute, Str, Bool } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { getPrisma } from "../../lib/prisma";
import {
	createR2Client,
	getDownloadUrl,
	generateMvpDownloadUrls,
} from "../../lib/r2-presign";
import { verifySessionToken } from "../../lib/session-token";
import { DocumentRepository } from "../../domain/document/repository";
import { DocumentService } from "../../domain/document/service";

/**
 * GET /documents/:id/urls
 *
 * Generate presigned URLs for viewing/downloading document files.
 *
 * Supports two modes:
 * 1. JSON mode (default or ?format=json): Returns all URLs in JSON response
 * 2. Redirect mode (?redirect=true): Returns HTTP 302 redirect to the requested file
 *
 * Redirect mode query params:
 * - type=final (default): Redirect to final PDF
 * - type=rasterized&page=1: Redirect to specific rasterized page
 * - type=original&file=pdf_001.pdf: Redirect to specific original file
 *
 * Supports both JWT authenticated and public (x-session-token) flows:
 * - JWT: Organization ID is extracted from the JWT token
 * - Session Token: For public upload links (anonymous users)
 */
export class GetDocumentUrls extends OpenAPIRoute {
	schema = {
		tags: ["Documents"],
		summary: "Get document URLs",
		description:
			"Generate presigned URLs for viewing document files. Supports JWT authentication or session token for public flows.",
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
			query: z.object({
				format: z
					.enum(["json", "redirect"])
					.optional()
					.default("json")
					.describe(
						"Response format: json (returns all URLs) or redirect (HTTP 302)",
					),
				type: z
					.enum(["final", "rasterized", "original"])
					.optional()
					.default("final")
					.describe("File type for redirect mode"),
				page: z.coerce
					.number()
					.int()
					.min(1)
					.optional()
					.describe("Page number for rasterized images (1-indexed)"),
				file: z
					.string()
					.optional()
					.describe(
						"File name for original files (e.g., pdf_001.pdf, img_001.jpg)",
					),
			}),
		},
		responses: {
			"200": {
				description: "URLs generated successfully (JSON format)",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							result: z.object({
								finalPdfUrl: Str(),
								rasterizedImageUrls: z.array(Str()),
								originalPdfUrls: z.array(Str()),
								originalImageUrls: z.array(Str()),
								expiresAt: Str(),
							}),
						}),
					},
				},
			},
			"302": {
				description: "Redirect to presigned URL (redirect format)",
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
			"404": {
				description: "Document not found",
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
		const { id: documentId } = c.req.param() as { id: string };
		const format = c.req.query("format") || "json";
		const type = c.req.query("type") || "final";
		const page = c.req.query("page")
			? parseInt(c.req.query("page")!)
			: undefined;
		const file = c.req.query("file");

		// Support both JWT authenticated and public (session token) flows
		let organizationId: string | undefined;
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
		}

		if (!organizationId) {
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

		// Get document from database
		const prisma = getPrisma(c.env.DB);
		const documentRepo = new DocumentRepository(prisma);
		const documentService = new DocumentService(documentRepo);

		let document;
		try {
			document = await documentService.get(organizationId, documentId);
		} catch (error) {
			if (error instanceof Error && error.message === "DOCUMENT_NOT_FOUND") {
				return c.json({ success: false, error: "Document not found" }, 404);
			}
			throw error;
		}

		// Create R2 client
		const r2Client = createR2Client({
			accountId: R2_ACCOUNT_ID,
			accessKeyId: R2_ACCESS_KEY_ID,
			secretAccessKey: R2_SECRET_ACCESS_KEY,
			bucketName: R2_BUCKET_NAME,
			publicDomain: R2_PUBLIC_DOMAIN,
		});

		// Presigned URL expiry (1 hour)
		const expiresIn = 3600;

		// Redirect mode: return HTTP 302 to specific file
		if (format === "redirect") {
			let redirectUrl: string;

			switch (type) {
				case "final":
					redirectUrl = await getDownloadUrl(
						r2Client,
						R2_BUCKET_NAME,
						document.finalPdfKey,
						expiresIn,
					);
					break;

				case "rasterized":
					if (!page || page < 1 || page > document.rasterizedImages.length) {
						return c.json(
							{
								success: false,
								error: `Invalid page number. Document has ${document.rasterizedImages.length} pages.`,
							},
							400,
						);
					}
					redirectUrl = await getDownloadUrl(
						r2Client,
						R2_BUCKET_NAME,
						document.rasterizedImages[page - 1],
						expiresIn,
					);
					break;

				case "original": {
					if (!file) {
						return c.json(
							{ success: false, error: "File name required for original type" },
							400,
						);
					}
					// Find the file in originalPdfs or originalImages
					const allOriginals = [
						...(document.originalPdfs || []),
						...(document.originalImages || []),
					];
					const matchingFile = allOriginals.find((key) =>
						key.endsWith(`/${file}`),
					);
					if (!matchingFile) {
						return c.json(
							{ success: false, error: `Original file not found: ${file}` },
							404,
						);
					}
					redirectUrl = await getDownloadUrl(
						r2Client,
						R2_BUCKET_NAME,
						matchingFile,
						expiresIn,
					);
					break;
				}

				default:
					return c.json(
						{ success: false, error: `Invalid type: ${type}` },
						400,
					);
			}

			return c.redirect(redirectUrl, 302);
		}

		// JSON mode: return all URLs
		const urls = await generateMvpDownloadUrls(
			r2Client,
			R2_BUCKET_NAME,
			{
				organizationId: document.organizationId,
				id: document.id,
				originalPdfs: document.originalPdfs,
				originalImages: document.originalImages,
				rasterizedImages: document.rasterizedImages,
				finalPdfKey: document.finalPdfKey,
			},
			expiresIn,
		);

		const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

		return c.json({
			success: true,
			result: {
				finalPdfUrl: urls.finalPdfUrl,
				rasterizedImageUrls: urls.rasterizedImageUrls,
				originalPdfUrls: urls.originalPdfUrls,
				originalImageUrls: urls.originalImageUrls,
				expiresAt,
			},
		});
	}
}
