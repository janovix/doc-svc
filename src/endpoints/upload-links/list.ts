/**
 * List Upload Links Endpoint
 * GET /upload-links
 *
 * Authentication: JWT Bearer token with organizationId claim
 */

import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { UploadLinkRepository } from "../../domain/upload-link/repository";
import { UploadLinkService } from "../../domain/upload-link/service";
import {
	UploadLinkFiltersSchema,
	UploadLinkResponseSchema,
} from "../../domain/upload-link/schemas";
import { getOrganizationId } from "../../middleware/auth";

export class ListUploadLinks extends OpenAPIRoute {
	schema = {
		tags: ["Upload Links"],
		summary: "List upload links",
		description:
			"List upload links for the organization with pagination. Requires JWT authentication with organization context.",
		operationId: "upload-link-list",
		security: [{ bearerAuth: [] }],
		request: {
			query: UploadLinkFiltersSchema,
		},
		responses: {
			"200": {
				description: "List of upload links",
				...contentJson(
					z.object({
						success: z.literal(true),
						result: z.object({
							data: z.array(UploadLinkResponseSchema),
							total: z.number(),
							limit: z.number(),
							offset: z.number(),
						}),
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
		const { limit, offset, status } = data.query;

		const prisma = getPrisma(c.env.DB);
		const uploadLinkRepo = new UploadLinkRepository(prisma);
		const uploadLinkService = new UploadLinkService(uploadLinkRepo);

		const result = await uploadLinkService.list(organizationId, {
			limit,
			offset,
			status,
		});

		return c.json({
			success: true,
			result: {
				data: result.data.map((link) => ({
					id: link.id,
					organizationId: link.organizationId,
					createdBy: link.createdBy,
					expiresAt: link.expiresAt.toISOString(),
					maxUploads: link.maxUploads,
					requiredDocuments: link.requiredDocuments,
					uploadedCount: link.uploadedCount,
					status: link.status,
					allowMultipleFiles: link.allowMultipleFiles,
					metadata: link.metadata,
					createdAt: link.createdAt.toISOString(),
					updatedAt: link.updatedAt.toISOString(),
				})),
				total: result.total,
				limit: result.limit,
				offset: result.offset,
			},
		});
	}
}
