/**
 * Document List Endpoint
 * GET /documents
 *
 * Requires JWT authentication with organization context.
 */

import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { DocumentRepository } from "../../domain/document/repository";
import { DocumentService } from "../../domain/document/service";
import {
	DocumentFiltersSchema,
	DocumentResponseSchema,
} from "../../domain/document/schemas";

export class DocumentList extends OpenAPIRoute {
	schema = {
		tags: ["Documents"],
		summary: "List documents",
		description:
			"List documents for the organization with pagination. Requires JWT authentication.",
		operationId: "document-list",
		security: [{ bearerAuth: [] }],
		request: {
			query: DocumentFiltersSchema,
		},
		responses: {
			"200": {
				description: "List of documents",
				...contentJson(
					z.object({
						success: z.literal(true),
						result: z.object({
							data: z.array(DocumentResponseSchema),
							total: z.number(),
							limit: z.number(),
							offset: z.number(),
						}),
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
		const { limit, offset, uploadLinkId } = data.query;

		const prisma = getPrisma(c.env.DB);
		const documentRepo = new DocumentRepository(prisma);
		const documentService = new DocumentService(documentRepo);

		const result = await documentService.list(organizationId, {
			limit,
			offset,
			uploadLinkId,
		});

		return c.json({
			success: true,
			result: {
				data: result.data.map((doc) => ({
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
				total: result.total,
				limit: result.limit,
				offset: result.offset,
			},
		});
	}
}
