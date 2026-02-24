/**
 * Document Domain Schemas (Zod) - MVP
 */

import { z } from "zod";

/**
 * Document type schema
 */
export const DocumentTypeSchema = z.enum([
	"mx_ine_front",
	"mx_ine_back",
	"passport",
	"proof_of_address",
	"proof_of_income",
	"bank_statement",
	"utility_bill",
	"other",
]);

/**
 * Document entity schema
 */
export const DocumentSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	uploadLinkId: z.string().nullable(),
	fileName: z.string(),
	fileSize: z.number().int().positive(),
	pageCount: z.number().int().positive(),
	sha256Hash: z.string(),
	// File structure
	originalPdfs: z.array(z.string()).nullable(),
	originalImages: z.array(z.string()).nullable(),
	rasterizedImages: z.array(z.string()),
	finalPdfKey: z.string(),
	// Metadata
	documentType: DocumentTypeSchema.nullable(),
	createdBy: z.string(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

/**
 * Document create input schema (for API)
 */
export const DocumentCreateInputSchema = z.object({
	fileName: z.string().min(1),
	fileSize: z.number().int().positive(),
	pageCount: z.number().int().positive(),
	sha256Hash: z.string().min(1),
	// File structure
	originalPdfs: z.array(z.string()).optional(),
	originalImages: z.array(z.string()).optional(),
	rasterizedImages: z.array(z.string()).min(1),
	finalPdfKey: z.string().min(1),
	// Metadata
	documentType: DocumentTypeSchema.optional(),
});

/**
 * Document list filters schema
 */
export const DocumentFiltersSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
	uploadLinkId: z.string().optional(),
});

/**
 * Document response schema for API
 */
export const DocumentResponseSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	uploadLinkId: z.string().nullable(),
	fileName: z.string(),
	fileSize: z.number(),
	pageCount: z.number(),
	sha256Hash: z.string(),
	// File structure
	originalPdfs: z.array(z.string()).nullable(),
	originalImages: z.array(z.string()).nullable(),
	rasterizedImages: z.array(z.string()),
	finalPdfKey: z.string(),
	// Metadata
	documentType: DocumentTypeSchema.nullable(),
	createdBy: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type DocumentResponse = z.infer<typeof DocumentResponseSchema>;
