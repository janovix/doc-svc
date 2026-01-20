/**
 * Document List Endpoint
 * GET /documents
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
		description: "List documents for the organization with pagination",
		operationId: "document-list",
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
		const organizationId = c.req.header("x-organization-id") || "org_demo";

		const data = await this.getValidatedData<typeof this.schema>();
		const { limit, offset } = data.query;

		const prisma = getPrisma(c.env.DB);
		const documentRepo = new DocumentRepository(prisma);
		const documentService = new DocumentService(documentRepo);

		const result = await documentService.list(organizationId, {
			limit,
			offset,
		});

		return c.json({
			success: true,
			result: {
				data: result.data.map((doc) => ({
					id: doc.id,
					organizationId: doc.organizationId,
					fileName: doc.fileName,
					fileSize: doc.fileSize,
					fileType: doc.fileType,
					sha256Hash: doc.sha256Hash,
					previewKeys: doc.previewKeys,
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
