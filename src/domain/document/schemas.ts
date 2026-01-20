/**
 * Document Domain Schemas (Zod)
 */

import { z } from "zod";

/**
 * Supported file types
 */
export const FileTypeSchema = z.enum(["pdf", "png", "jpg", "jpeg", "webp"]);

/**
 * Document entity schema
 */
export const DocumentSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	originalFileKey: z.string(),
	fileName: z.string(),
	fileSize: z.number().int().positive(),
	fileType: z.string(),
	sha256Hash: z.string(),
	previewKeys: z.array(z.string()).nullable(),
	createdBy: z.string(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

/**
 * Document create input schema
 */
export const DocumentCreateInputSchema = z.object({
	fileName: z.string().min(1),
	fileType: z.string(),
	// Preview keys are required for PDF files
	previewKeys: z.array(z.string()).optional(),
});

/**
 * Document list filters schema
 */
export const DocumentFiltersSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Document response schema for API
 */
export const DocumentResponseSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	fileName: z.string(),
	fileSize: z.number(),
	fileType: z.string(),
	sha256Hash: z.string(),
	previewKeys: z.array(z.string()).nullable(),
	createdBy: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type DocumentResponse = z.infer<typeof DocumentResponseSchema>;
