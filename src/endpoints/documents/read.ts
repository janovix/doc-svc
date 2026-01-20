/**
 * Document Read Endpoint
 * GET /documents/:id
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
		description: "Retrieve document metadata by its ID",
		operationId: "document-read",
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
					fileName: document.fileName,
					fileSize: document.fileSize,
					fileType: document.fileType,
					sha256Hash: document.sha256Hash,
					previewKeys: document.previewKeys,
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
