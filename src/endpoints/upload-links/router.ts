/**
 * Upload Links Router
 * Sub-router for upload link endpoints
 *
 * Authentication:
 * - Public routes: GET /:id, GET /:id/organization (for scan app)
 * - Protected routes: All others require JWT with organization context
 *
 * Auth is applied at the main app level (index.ts) with optional: true,
 * allowing public routes to work while protected routes check for auth.
 */

import { Hono } from "hono";
import { fromHono } from "chanfana";
import { CreateUploadLink } from "./create";
import { GetUploadLink } from "./read";
import { ListUploadLinks } from "./list";
import { GetOrganizationBranding } from "./organization";
import { ListUploadLinkDocuments } from "./documents";
import type { Bindings } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { UploadLinkRepository } from "../../domain/upload-link/repository";
import { UploadLinkService } from "../../domain/upload-link/service";
import type { AuthVariables } from "../../middleware/auth";

// Create base Hono app
const app = new Hono<{
	Bindings: Bindings;
	Variables: Partial<AuthVariables>;
}>();

// SSE events endpoint - requires auth (must be registered before OpenAPI routes)
// Note: SSE/EventSource doesn't support custom headers, so we accept token via query param
app.get("/:id/events", async (c) => {
	const { id } = c.req.param();
	let organization = c.get("organization");

	// SSE doesn't support Authorization header, so check for token in query param
	if (!organization) {
		const tokenParam = c.req.query("token");
		if (tokenParam && c.env.AUTH_SERVICE_URL) {
			const { verifyToken } = await import("../../middleware/auth");
			try {
				const payload = await verifyToken(
					tokenParam,
					c.env.AUTH_SERVICE_URL,
					c.env.AUTH_JWKS_CACHE_TTL
						? parseInt(c.env.AUTH_JWKS_CACHE_TTL, 10)
						: 3600,
					c.env.AUTH_SERVICE,
					c.env.ENVIRONMENT,
				);
				if (payload.organizationId) {
					organization = { id: payload.organizationId };
				}
			} catch (error) {
				console.error("SSE token verification failed:", error);
				return c.json(
					{ success: false, error: "Invalid or expired token" },
					401,
				);
			}
		}
	}

	// Check auth - organization must be set by auth middleware or token param
	if (!organization) {
		return c.json(
			{
				success: false,
				error: "Unauthorized - JWT with organization context required",
			},
			401,
		);
	}

	const organizationId = organization.id;

	// Verify upload link exists and belongs to organization
	const prisma = getPrisma(c.env.DB);
	const uploadLinkRepo = new UploadLinkRepository(prisma);
	const uploadLinkService = new UploadLinkService(uploadLinkRepo);

	try {
		const uploadLink = await uploadLinkService.get(organizationId, id);

		// Get Durable Object stub
		const doId = c.env.UPLOAD_LINK_EVENTS.idFromName(uploadLink.id);
		const stub = c.env.UPLOAD_LINK_EVENTS.get(doId);

		// Forward request to Durable Object for SSE handling
		const response = await stub.fetch(
			new Request("https://do/events", {
				method: "GET",
				headers: {
					Accept: "text/event-stream",
				},
				signal: c.req.raw.signal,
			}),
		);

		// Return the SSE response from DO
		return new Response(response.body, {
			headers: response.headers,
		});
	} catch (error) {
		if (error instanceof Error && error.message === "UPLOAD_LINK_NOT_FOUND") {
			return c.json({ success: false, error: "Upload link not found" }, 404);
		}
		throw error;
	}
});

// Connection count endpoint - requires auth
app.get("/:id/connections", async (c) => {
	const { id } = c.req.param();
	const organization = c.get("organization");

	// Check auth - organization must be set by auth middleware
	if (!organization) {
		return c.json(
			{
				success: false,
				error: "Unauthorized - JWT with organization context required",
			},
			401,
		);
	}

	const organizationId = organization.id;

	const prisma = getPrisma(c.env.DB);
	const uploadLinkRepo = new UploadLinkRepository(prisma);
	const uploadLinkService = new UploadLinkService(uploadLinkRepo);

	try {
		const uploadLink = await uploadLinkService.get(organizationId, id);

		const doId = c.env.UPLOAD_LINK_EVENTS.idFromName(uploadLink.id);
		const stub = c.env.UPLOAD_LINK_EVENTS.get(doId);

		const response = await stub.fetch(new Request("https://do/connections"));
		const data = (await response.json()) as { count: number };

		return c.json({
			success: true,
			result: {
				uploadLinkId: uploadLink.id,
				connections: data.count,
			},
		});
	} catch (error) {
		if (error instanceof Error && error.message === "UPLOAD_LINK_NOT_FOUND") {
			return c.json({ success: false, error: "Upload link not found" }, 404);
		}
		throw error;
	}
});

// Create chanfana OpenAPI router from Hono app
export const uploadLinksRouter = fromHono(app);

// Protected routes (require JWT auth - verified in endpoint handlers)
uploadLinksRouter.get("/", ListUploadLinks); // List - auth required
uploadLinksRouter.post("/", CreateUploadLink); // Create - auth required

// Public routes (no auth - for scan app)
uploadLinksRouter.get("/:id", GetUploadLink); // Get public link info
uploadLinksRouter.get("/:id/organization", GetOrganizationBranding); // Get org branding

// Protected routes
uploadLinksRouter.get("/:id/documents", ListUploadLinkDocuments); // List docs - auth required
