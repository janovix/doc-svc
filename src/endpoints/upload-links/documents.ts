/**
 * List Documents for Upload Link Endpoint
 * GET /upload-links/:id/documents
 *
 * Lists all documents uploaded via the upload link.
 * Authentication: JWT Bearer token with organizationId claim
 */

import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { UploadLinkRepository } from "../../domain/upload-link/repository";
import { UploadLinkService } from "../../domain/upload-link/service";
import { DocumentRepository } from "../../domain/document/repository";
import { DocumentService } from "../../domain/document/service";
import { DocumentResponseSchema } from "../../domain/document/schemas";
import { getOrganizationId } from "../../middleware/auth";

export class ListUploadLinkDocuments extends OpenAPIRoute {
	schema = {
		tags: ["Upload Links"],
		summary: "List documents for upload link",
		description:
			"List all documents uploaded via the upload link. Requires JWT authentication with organization context.",
		operationId: "upload-link-documents",
		security: [{ bearerAuth: [] }],
		request: {
			params: z.object({
				id: z.string().describe("Upload link ID"),
			}),
		},
		responses: {
			"200": {
				description: "List of documents",
				...contentJson(
					z.object({
						success: z.literal(true),
						result: z.object({
							uploadLinkId: z.string(),
							documents: z.array(DocumentResponseSchema),
						}),
					}),
				),
			},
			"404": {
				description: "Upload link not found",
				...contentJson(
					z.object({
						success: z.literal(false),
						error: z.string(),
					}),
				),
			},
			"401": {
				description: "Unauthorized - missing or invalid JWT",
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
		// Get organization from JWT (set by auth middleware)
		const organizationId = getOrganizationId(c);

		const data = await this.getValidatedData<typeof this.schema>();
		const { id } = data.params;

		const prisma = getPrisma(c.env.DB);

		// Verify upload link exists and belongs to organization
		const uploadLinkRepo = new UploadLinkRepository(prisma);
		const uploadLinkService = new UploadLinkService(uploadLinkRepo);

		try {
			await uploadLinkService.get(organizationId, id);
		} catch (error) {
			if (error instanceof Error && error.message === "UPLOAD_LINK_NOT_FOUND") {
				return c.json({ success: false, error: "Upload link not found" }, 404);
			}
			throw error;
		}

		// Get documents for upload link
		const documentRepo = new DocumentRepository(prisma);
		const documentService = new DocumentService(documentRepo);
		const documents = await documentService.listByUploadLink(id);

		return c.json({
			success: true,
			result: {
				uploadLinkId: id,
				documents: documents.map((doc) => ({
					id: doc.id,
					organizationId: doc.organizationId,
					uploadLinkId: doc.uploadLinkId,
					fileName: doc.fileName,
					fileSize: doc.fileSize,
					pageCount: doc.pageCount,
					sha256Hash: doc.sha256Hash,
					originalPdfs: doc.originalPdfs,
					originalImages: doc.originalImages,
					rasterizedImages: doc.rasterizedImages,
					finalPdfKey: doc.finalPdfKey,
					documentType: doc.documentType,
					createdBy: doc.createdBy,
					createdAt: doc.createdAt.toISOString(),
					updatedAt: doc.updatedAt.toISOString(),
				})),
			},
		});
	}
}
