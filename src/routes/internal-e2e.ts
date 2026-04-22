import { Hono } from "hono";
import { z } from "zod";
import { getPrismaClient } from "../lib/prisma";
import { deleteFromR2 } from "../lib/r2-storage";
import type { Bindings } from "../types";

const PurgeBodySchema = z.object({
	organizationIds: z.array(z.string().min(1)),
});

function collectKeysFromJsonArray(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const arr = JSON.parse(raw) as unknown;
		return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
	} catch {
		return [];
	}
}

function keysForDocument(doc: {
	finalPdfKey: string;
	originalPdfs: string | null;
	originalImages: string | null;
	rasterizedImages: string;
}): string[] {
	const keys = new Set<string>();
	keys.add(doc.finalPdfKey);
	for (const k of collectKeysFromJsonArray(doc.originalPdfs)) keys.add(k);
	for (const k of collectKeysFromJsonArray(doc.originalImages)) keys.add(k);
	for (const k of collectKeysFromJsonArray(doc.rasterizedImages)) keys.add(k);
	return [...keys];
}

export const internalE2eRouter = new Hono<{ Bindings: Bindings }>();

internalE2eRouter.use("*", async (c, next) => {
	const expected = c.env.E2E_API_KEY;
	if (!expected || c.req.header("x-e2e-api-key") !== expected) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	await next();
});

internalE2eRouter.post("/purge", async (c) => {
	const parsed = PurgeBodySchema.safeParse(
		await c.req.json().catch(() => ({})),
	);
	if (!parsed.success) {
		return c.json(
			{ error: "Invalid body", details: parsed.error.flatten() },
			400,
		);
	}

	const prisma = getPrismaClient(c.env.DB);
	const bucket = c.env.R2_BUCKET;
	const errors: string[] = [];
	let r2Deleted = 0;
	let docsDeleted = 0;

	const docs = await prisma.document.findMany({
		where: { organizationId: { in: parsed.data.organizationIds } },
	});

	for (const doc of docs) {
		for (const key of keysForDocument(doc)) {
			try {
				await deleteFromR2(bucket, key);
				r2Deleted++;
			} catch (e) {
				errors.push(`r2 ${key}: ${e instanceof Error ? e.message : String(e)}`);
			}
		}
	}

	const del = await prisma.document.deleteMany({
		where: { organizationId: { in: parsed.data.organizationIds } },
	});
	docsDeleted = del.count;

	await prisma.uploadLink
		.deleteMany({
			where: { organizationId: { in: parsed.data.organizationIds } },
		})
		.catch((e) => errors.push(`uploadLink: ${e}`));

	return c.json({
		purgedDocuments: docsDeleted,
		purgedR2Objects: r2Deleted,
		errors,
	});
});
