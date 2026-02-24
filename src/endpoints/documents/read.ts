/**
 * Document Read Endpoint
 * GET /documents/:id
 *
 * Requires JWT authentication with organization context.
 */

import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { DocumentRepository } from "../../domain/document/repository";
import { DocumentService } from "../../domain/document/service";
import { DocumentResponseSchema } from "../../domain/document/schemas";

export class DocumentRead extends OpenAPIRoute {
	schema = {
		tags: ["Documents"],
		summary: "Get document by ID",
		description:
			"Retrieve document metadata by its ID. Requires JWT authentication.",
		operationId: "document-read",
		security: [{ bearerAuth: [] }],
		request: {
			params: z.object({
				id: z.string().describe("Document ID"),
			}),
		},
		responses: {
			"200": {
				description: "Document found",
				...contentJson(
					z.object({
						success: z.literal(true),
						result: DocumentResponseSchema,
					}),
				),
			},
			"404": {
				description: "Document not found",
				...contentJson(
					z.object({
						success: z.literal(false),
						error: z.string(),
					}),
				),
			},
			"401": {
				description: "Unauthorized - Missing or invalid JWT token",
				...contentJson(
					z.object({
						success: z.literal(false),
						error: z.string(),
					}),
				),
			},
			"409": {
				description: "Organization required - User must select an organization",
				...contentJson(
					z.object({
						success: z.literal(false),
						error: z.string(),
						code: z.string(),
					}),
				),
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

		const organizationId = organization.id;

		const data = await this.getValidatedData<typeof this.schema>();
		const { id } = data.params;

		const prisma = getPrisma(c.env.DB);
		const documentRepo = new DocumentRepository(prisma);
		const documentService = new DocumentService(documentRepo);

		try {
			const document = await documentService.get(organizationId, id);

			return c.json({
				success: true,
				result: {
					id: document.id,
					organizationId: document.organizationId,
					uploadLinkId: document.uploadLinkId,
					fileName: document.fileName,
					fileSize: document.fileSize,
					pageCount: document.pageCount,
					sha256Hash: document.sha256Hash,
					originalPdfs: document.originalPdfs,
					originalImages: document.originalImages,
					rasterizedImages: document.rasterizedImages,
					finalPdfKey: document.finalPdfKey,
					documentType: document.documentType,
					createdBy: document.createdBy,
					createdAt: document.createdAt.toISOString(),
					updatedAt: document.updatedAt.toISOString(),
				},
			});
		} catch (error) {
			if (error instanceof Error && error.message === "DOCUMENT_NOT_FOUND") {
				return c.json({ success: false, error: "Document not found" }, 404);
			}
			throw error;
		}
	}
}
