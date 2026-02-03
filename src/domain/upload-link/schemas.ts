/**
 * Upload Link Domain Schemas (Zod)
 */

import { z } from "zod";
import { DocumentTypeSchema } from "../document/schemas";

/**
 * Upload link status schema
 */
export const UploadLinkStatusSchema = z.enum([
	"active",
	"expired",
	"completed",
]);

/**
 * Upload link metadata schema
 */
export const UploadLinkMetadataSchema = z
	.object({
		clientId: z.string().optional(),
		clientName: z.string().optional(),
		notes: z.string().optional(),
	})
	.passthrough();

/**
 * Required document schema - contains type with optional label/description
 * This allows custom document names for "other" type documents
 */
export const RequiredDocumentSchema = z.object({
	type: DocumentTypeSchema,
	label: z.string().optional(),
	description: z.string().optional(),
});

export type RequiredDocument = z.infer<typeof RequiredDocumentSchema>;

/**
 * Upload link entity schema
 */
export const UploadLinkSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	createdBy: z.string(),
	expiresAt: z.date(),
	maxUploads: z.number().int().positive().nullable(),
	requiredDocuments: z.array(RequiredDocumentSchema),
	uploadedCount: z.number().int().min(0),
	status: UploadLinkStatusSchema,
	allowMultipleFiles: z.boolean(),
	metadata: UploadLinkMetadataSchema.nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

/**
 * Upload link create input schema (for API)
 */
export const UploadLinkCreateInputSchema = z.object({
	expiresAt: z.coerce.date().refine((date) => date > new Date(), {
		message: "Expiration date must be in the future",
	}),
	maxUploads: z.number().int().positive().optional(),
	requiredDocuments: z.array(RequiredDocumentSchema).min(1, {
		message: "At least one required document type must be specified",
	}),
	allowMultipleFiles: z.boolean().default(true),
	metadata: UploadLinkMetadataSchema.optional(),
});

/**
 * Upload link list filters schema
 */
export const UploadLinkFiltersSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
	status: UploadLinkStatusSchema.optional(),
});

/**
 * Upload link response schema for API
 */
export const UploadLinkResponseSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	createdBy: z.string(),
	expiresAt: z.string(),
	maxUploads: z.number().nullable(),
	requiredDocuments: z.array(RequiredDocumentSchema),
	uploadedCount: z.number(),
	status: UploadLinkStatusSchema,
	allowMultipleFiles: z.boolean(),
	metadata: UploadLinkMetadataSchema.nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type UploadLinkResponse = z.infer<typeof UploadLinkResponseSchema>;

/**
 * Public upload link response (limited info for clients)
 */
export const PublicUploadLinkResponseSchema = z.object({
	id: z.string(),
	requiredDocuments: z.array(RequiredDocumentSchema),
	uploadedCount: z.number(),
	maxUploads: z.number().nullable(),
	allowMultipleFiles: z.boolean(),
	expiresAt: z.string(),
	status: UploadLinkStatusSchema,
});

export type PublicUploadLinkResponse = z.infer<
	typeof PublicUploadLinkResponseSchema
>;
