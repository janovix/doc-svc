/**
 * Processing Job Domain Types
 */

export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type Decision = "APPROVED" | "REVIEW" | "REJECTED";

export interface ClassificationResult {
	docFamily: string | null;
	docType: string | null;
	confidence: number | null;
	evidence: Record<string, unknown> | null;
}

export interface VisualValidationResult {
	score: number | null;
	threshold: number | null;
	pass: boolean | null;
	signals: string[] | null;
	evidence: Record<string, unknown> | null;
}

export interface ExtractedField {
	value: string | null;
	confidence: number;
	source?: string;
}

export interface ValidationResult {
	rule: string;
	pass: boolean;
	message?: string;
}

export interface JobEntity {
	id: string;
	documentId: string;
	organizationId: string;
	status: JobStatus;
	workflowInstanceId: string | null;

	// Classification
	docFamily: string | null;
	docType: string | null;
	classificationConfidence: number | null;
	classificationEvidence: Record<string, unknown> | null;

	// Visual Validation
	visualValidationScore: number | null;
	visualValidationThreshold: number | null;
	visualValidationPass: boolean | null;
	visualValidationSignals: string[] | null;
	visualValidationEvidence: Record<string, unknown> | null;

	// Extraction
	extractedFields: Record<string, ExtractedField> | null;

	// Validations
	validations: ValidationResult[] | null;

	// Risk & Decision
	riskScore: number | null;
	riskSignals: string[] | null;
	decision: Decision | null;
	decisionReason: string | null;

	// Metadata
	markdownKey: string | null;
	errorMessage: string | null;
	startedAt: Date | null;
	completedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface JobCreateInput {
	documentId: string;
	organizationId: string;
}

export interface JobUpdateInput {
	status?: JobStatus;
	workflowInstanceId?: string;
	docFamily?: string;
	docType?: string;
	classificationConfidence?: number;
	classificationEvidence?: Record<string, unknown>;
	visualValidationScore?: number;
	visualValidationThreshold?: number;
	visualValidationPass?: boolean;
	visualValidationSignals?: string[];
	visualValidationEvidence?: Record<string, unknown>;
	extractedFields?: Record<string, ExtractedField>;
	validations?: ValidationResult[];
	riskScore?: number;
	riskSignals?: string[];
	decision?: Decision;
	decisionReason?: string;
	markdownKey?: string;
	errorMessage?: string;
	startedAt?: Date;
	completedAt?: Date;
}

export interface JobFilters {
	limit?: number;
	offset?: number;
	status?: JobStatus;
	documentId?: string;
}

export interface ListResult<T> {
	data: T[];
	total: number;
	limit: number;
	offset: number;
}
