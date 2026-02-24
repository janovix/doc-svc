/**
 * Get Upload Link Endpoint (Public)
 * GET /upload-links/:id
 *
 * This endpoint is public and returns limited information about the upload link.
 * Used by the scan app to display required documents and progress.
 */

import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { UploadLinkRepository } from "../../domain/upload-link/repository";
import { UploadLinkService } from "../../domain/upload-link/service";
import { PublicUploadLinkResponseSchema } from "../../domain/upload-link/schemas";

export class GetUploadLink extends OpenAPIRoute {
	schema = {
		tags: ["Upload Links"],
		summary: "Get upload link (public)",
		description:
			"Get upload link details. This endpoint is public and returns limited information.",
		operationId: "upload-link-read",
		request: {
			params: z.object({
				id: z.string().describe("Upload link ID"),
			}),
		},
		responses: {
			"200": {
				description: "Upload link found",
				...contentJson(
					z.object({
						success: z.literal(true),
						result: PublicUploadLinkResponseSchema,
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
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { id } = data.params;

		const prisma = getPrisma(c.env.DB);
		const uploadLinkRepo = new UploadLinkRepository(prisma);
		const uploadLinkService = new UploadLinkService(uploadLinkRepo);

		try {
			const uploadLink = await uploadLinkService.getPublic(id);

			return c.json({
				success: true,
				result: {
					id: uploadLink.id,
					requiredDocuments: uploadLink.requiredDocuments,
					uploadedCount: uploadLink.uploadedCount,
					maxUploads: uploadLink.maxUploads,
					allowMultipleFiles: uploadLink.allowMultipleFiles,
					expiresAt: uploadLink.expiresAt.toISOString(),
					status: uploadLink.status,
				},
			});
		} catch (error) {
			if (error instanceof Error && error.message === "UPLOAD_LINK_NOT_FOUND") {
				return c.json({ success: false, error: "Upload link not found" }, 404);
			}
			throw error;
		}
	}
}
