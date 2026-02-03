/**
 * Get Organization Branding Endpoint
 * GET /upload-links/:id/organization
 *
 * Returns organization branding information for the upload link.
 * Used by the scan app to display organization logo and name in onboarding.
 */

import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { UploadLinkRepository } from "../../domain/upload-link/repository";
import { UploadLinkService } from "../../domain/upload-link/service";

// TODO: This should fetch from auth-svc or a dedicated organization service
// For now, we return placeholder data
const OrganizationBrandingSchema = z.object({
	organizationId: z.string(),
	name: z.string(),
	logoUrl: z.string().nullable(),
	termsUrl: z.string().nullable(),
});

export class GetOrganizationBranding extends OpenAPIRoute {
	schema = {
		tags: ["Upload Links"],
		summary: "Get organization branding",
		description:
			"Get organization branding for the upload link (logo, name, terms URL)",
		operationId: "upload-link-organization",
		request: {
			params: z.object({
				id: z.string().describe("Upload link ID"),
			}),
		},
		responses: {
			"200": {
				description: "Organization branding",
				...contentJson(
					z.object({
						success: z.literal(true),
						result: OrganizationBrandingSchema,
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

			// TODO: Fetch actual organization branding from auth-svc
			// For now, return placeholder data
			return c.json({
				success: true,
				result: {
					organizationId: uploadLink.organizationId,
					name: "Janovix Demo", // TODO: Fetch from auth-svc
					logoUrl: null, // TODO: Fetch from auth-svc
					termsUrl: "https://janovix.com/terms", // TODO: Fetch from auth-svc
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
