/**
 * Processing Job Domain Schemas (Zod)
 */

import { z } from "zod";

/**
 * Job status enum
 */
export const JobStatusSchema = z.enum([
	"PENDING",
	"PROCESSING",
	"COMPLETED",
	"FAILED",
]);

/**
 * Decision enum
 */
export const DecisionSchema = z.enum(["APPROVED", "REVIEW", "REJECTED"]);

/**
 * Document family enum
 */
export const DocFamilySchema = z.enum([
	"valid_id",
	"proof_of_address",
	"corporate",
]);

/**
 * Document type enum
 */
export const DocTypeSchema = z.enum([
	"mx_ine",
	"passport",
	"mx_cartilla_militar",
	"mx_cedula_profesional",
	"proof_utility_bill",
	"proof_telecom_bill",
	"mx_acta_constitutiva",
	"mx_poder_notarial",
	"unknown",
]);

/**
 * Extracted field schema
 */
export const ExtractedFieldSchema = z.object({
	value: z.string().nullable(),
	confidence: z.number().min(0).max(1),
	source: z.string().optional(),
});

/**
 * Validation result schema
 */
export const ValidationResultSchema = z.object({
	rule: z.string(),
	pass: z.boolean(),
	message: z.string().optional(),
});

/**
 * Classification result schema
 */
export const ClassificationResultSchema = z.object({
	docFamily: DocFamilySchema.nullable(),
	docType: DocTypeSchema.nullable(),
	confidence: z.number().min(0).max(1).nullable(),
	evidence: z.record(z.unknown()).nullable(),
});

/**
 * Visual validation result schema
 */
export const VisualValidationResultSchema = z.object({
	score: z.number().min(0).max(1).nullable(),
	threshold: z.number().min(0).max(1).nullable(),
	pass: z.boolean().nullable(),
	signals: z.array(z.string()).nullable(),
	evidence: z.record(z.unknown()).nullable(),
});

/**
 * Job list filters schema
 */
export const JobFiltersSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
	status: JobStatusSchema.optional(),
	documentId: z.string().optional(),
});

/**
 * Job response schema for API
 */
export const JobResponseSchema = z.object({
	id: z.string(),
	documentId: z.string(),
	organizationId: z.string(),
	status: JobStatusSchema,
	workflowInstanceId: z.string().nullable(),

	// Classification
	classification: z
		.object({
			docFamily: z.string().nullable(),
			docType: z.string().nullable(),
			confidence: z.number().nullable(),
			evidence: z.record(z.unknown()).nullable(),
		})
		.nullable(),

	// Visual Validation
	visualValidation: z
		.object({
			score: z.number().nullable(),
			threshold: z.number().nullable(),
			pass: z.boolean().nullable(),
			signals: z.array(z.string()).nullable(),
			evidence: z.record(z.unknown()).nullable(),
		})
		.nullable(),

	// Extraction
	extraction: z
		.object({
			fields: z.record(ExtractedFieldSchema).nullable(),
		})
		.nullable(),

	// Validations
	validations: z.array(ValidationResultSchema).nullable(),

	// Risk & Decision
	risk: z
		.object({
			score: z.number().nullable(),
			signals: z.array(z.string()).nullable(),
		})
		.nullable(),
	decision: DecisionSchema.nullable(),
	decisionReason: z.string().nullable(),

	// Metadata
	errorMessage: z.string().nullable(),
	startedAt: z.string().nullable(),
	completedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

/**
 * Internal job update schema (from worker)
 */
export const JobInternalUpdateSchema = z.object({
	status: JobStatusSchema.optional(),
	workflowInstanceId: z.string().optional(),
	docFamily: z.string().optional(),
	docType: z.string().optional(),
	classificationConfidence: z.number().optional(),
	classificationEvidence: z.record(z.unknown()).optional(),
	visualValidationScore: z.number().optional(),
	visualValidationThreshold: z.number().optional(),
	visualValidationPass: z.boolean().optional(),
	visualValidationSignals: z.array(z.string()).optional(),
	visualValidationEvidence: z.record(z.unknown()).optional(),
	extractedFields: z.record(ExtractedFieldSchema).optional(),
	validations: z.array(ValidationResultSchema).optional(),
	riskScore: z.number().optional(),
	riskSignals: z.array(z.string()).optional(),
	decision: DecisionSchema.optional(),
	decisionReason: z.string().optional(),
	markdownKey: z.string().optional(),
	errorMessage: z.string().optional(),
	startedAt: z.string().optional(),
	completedAt: z.string().optional(),
});

export type JobResponse = z.infer<typeof JobResponseSchema>;
