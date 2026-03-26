/**
 * Create Upload Link Endpoint
 * POST /upload-links
 *
 * Authentication: JWT Bearer token with organizationId claim
 */

import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { formatZodError } from "../../lib/format-zod-error";
import type { AppContext } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { UploadLinkRepository } from "../../domain/upload-link/repository";
import { UploadLinkService } from "../../domain/upload-link/service";
import {
	UploadLinkCreateInputSchema,
	UploadLinkResponseSchema,
} from "../../domain/upload-link/schemas";
import { getOrganizationId, getUserId } from "../../middleware/auth";

export class CreateUploadLink extends OpenAPIRoute {
	schema = {
		tags: ["Upload Links"],
		summary: "Create upload link",
		description:
			"Create a shareable upload link with required document types. Requires JWT authentication with organization context.",
		operationId: "upload-link-create",
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				content: {
					"application/json": {
						schema: UploadLinkCreateInputSchema,
					},
				},
			},
		},
		responses: {
			"201": {
				description: "Upload link created",
				...contentJson(
					z.object({
						success: z.literal(true),
						result: UploadLinkResponseSchema,
					}),
				),
			},
			"400": {
				description: "Invalid request",
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
			"409": {
				description: "Organization context required",
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
		// Get user and organization from JWT (set by auth middleware)
		const organizationId = getOrganizationId(c);
		const userId = getUserId(c);

		const body = await c.req.json();
		const parseResult = UploadLinkCreateInputSchema.safeParse(body);

		if (!parseResult.success) {
			return c.json(
				{ success: false, error: formatZodError(parseResult.error) },
				400,
			);
		}

		const prisma = getPrisma(c.env.DB);
		const uploadLinkRepo = new UploadLinkRepository(prisma);
		const uploadLinkService = new UploadLinkService(uploadLinkRepo);

		const uploadLink = await uploadLinkService.create({
			organizationId,
			createdBy: userId,
			expiresAt: parseResult.data.expiresAt,
			maxUploads: parseResult.data.maxUploads,
			requiredDocuments: parseResult.data.requiredDocuments,
			allowMultipleFiles: parseResult.data.allowMultipleFiles,
			metadata: parseResult.data.metadata,
		});

		return c.json(
			{
				success: true,
				result: {
					id: uploadLink.id,
					organizationId: uploadLink.organizationId,
					createdBy: uploadLink.createdBy,
					expiresAt: uploadLink.expiresAt.toISOString(),
					maxUploads: uploadLink.maxUploads,
					requiredDocuments: uploadLink.requiredDocuments,
					uploadedCount: uploadLink.uploadedCount,
					status: uploadLink.status,
					allowMultipleFiles: uploadLink.allowMultipleFiles,
					metadata: uploadLink.metadata,
					createdAt: uploadLink.createdAt.toISOString(),
					updatedAt: uploadLink.updatedAt.toISOString(),
				},
			},
			201,
		);
	}
}
