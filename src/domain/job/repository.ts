/**
 * Processing Job Repository
 * Data access layer for processing jobs
 */

import type { PrismaClient } from "@prisma/client";
import type {
	JobEntity,
	JobCreateInput,
	JobUpdateInput,
	JobFilters,
	ListResult,
	JobStatus,
	Decision,
} from "./types";
import { generateJobId } from "../../lib/id-generator";

/**
 * Maps Prisma job to domain entity
 */
function mapToEntity(job: {
	id: string;
	documentId: string;
	organizationId: string;
	status: string;
	workflowInstanceId: string | null;
	docFamily: string | null;
	docType: string | null;
	classificationConfidence: number | null;
	classificationEvidence: string | null;
	visualValidationScore: number | null;
	visualValidationThreshold: number | null;
	visualValidationPass: boolean | null;
	visualValidationSignals: string | null;
	visualValidationEvidence: string | null;
	extractedFields: string | null;
	validations: string | null;
	riskScore: number | null;
	riskSignals: string | null;
	decision: string | null;
	decisionReason: string | null;
	markdownKey: string | null;
	errorMessage: string | null;
	startedAt: Date | null;
	completedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}): JobEntity {
	return {
		id: job.id,
		documentId: job.documentId,
		organizationId: job.organizationId,
		status: job.status as JobStatus,
		workflowInstanceId: job.workflowInstanceId,
		docFamily: job.docFamily,
		docType: job.docType,
		classificationConfidence: job.classificationConfidence,
		classificationEvidence: job.classificationEvidence
			? JSON.parse(job.classificationEvidence)
			: null,
		visualValidationScore: job.visualValidationScore,
		visualValidationThreshold: job.visualValidationThreshold,
		visualValidationPass: job.visualValidationPass,
		visualValidationSignals: job.visualValidationSignals
			? JSON.parse(job.visualValidationSignals)
			: null,
		visualValidationEvidence: job.visualValidationEvidence
			? JSON.parse(job.visualValidationEvidence)
			: null,
		extractedFields: job.extractedFields
			? JSON.parse(job.extractedFields)
			: null,
		validations: job.validations ? JSON.parse(job.validations) : null,
		riskScore: job.riskScore,
		riskSignals: job.riskSignals ? JSON.parse(job.riskSignals) : null,
		decision: job.decision as Decision | null,
		decisionReason: job.decisionReason,
		markdownKey: job.markdownKey,
		errorMessage: job.errorMessage,
		startedAt: job.startedAt,
		completedAt: job.completedAt,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt,
	};
}

export class JobRepository {
	constructor(private readonly prisma: PrismaClient) {}

	/**
	 * Create a new processing job
	 */
	async create(input: JobCreateInput): Promise<JobEntity> {
		const id = generateJobId();
		const now = new Date();

		const job = await this.prisma.processingJob.create({
			data: {
				id,
				documentId: input.documentId,
				organizationId: input.organizationId,
				status: "PENDING",
				createdAt: now,
				updatedAt: now,
			},
		});

		return mapToEntity(job);
	}

	/**
	 * Get job by ID
	 */
	async getById(organizationId: string, id: string): Promise<JobEntity | null> {
		const job = await this.prisma.processingJob.findFirst({
			where: {
				id,
				organizationId,
			},
		});

		return job ? mapToEntity(job) : null;
	}

	/**
	 * Get job by ID (internal - no org check)
	 */
	async getByIdInternal(id: string): Promise<JobEntity | null> {
		const job = await this.prisma.processingJob.findUnique({
			where: { id },
		});

		return job ? mapToEntity(job) : null;
	}

	/**
	 * Update job
	 */
	async update(id: string, input: JobUpdateInput): Promise<JobEntity> {
		const updateData: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (input.status !== undefined) updateData.status = input.status;
		if (input.workflowInstanceId !== undefined)
			updateData.workflowInstanceId = input.workflowInstanceId;
		if (input.docFamily !== undefined) updateData.docFamily = input.docFamily;
		if (input.docType !== undefined) updateData.docType = input.docType;
		if (input.classificationConfidence !== undefined)
			updateData.classificationConfidence = input.classificationConfidence;
		if (input.classificationEvidence !== undefined)
			updateData.classificationEvidence = JSON.stringify(
				input.classificationEvidence,
			);
		if (input.visualValidationScore !== undefined)
			updateData.visualValidationScore = input.visualValidationScore;
		if (input.visualValidationThreshold !== undefined)
			updateData.visualValidationThreshold = input.visualValidationThreshold;
		if (input.visualValidationPass !== undefined)
			updateData.visualValidationPass = input.visualValidationPass;
		if (input.visualValidationSignals !== undefined)
			updateData.visualValidationSignals = JSON.stringify(
				input.visualValidationSignals,
			);
		if (input.visualValidationEvidence !== undefined)
			updateData.visualValidationEvidence = JSON.stringify(
				input.visualValidationEvidence,
			);
		if (input.extractedFields !== undefined)
			updateData.extractedFields = JSON.stringify(input.extractedFields);
		if (input.validations !== undefined)
			updateData.validations = JSON.stringify(input.validations);
		if (input.riskScore !== undefined) updateData.riskScore = input.riskScore;
		if (input.riskSignals !== undefined)
			updateData.riskSignals = JSON.stringify(input.riskSignals);
		if (input.decision !== undefined) updateData.decision = input.decision;
		if (input.decisionReason !== undefined)
			updateData.decisionReason = input.decisionReason;
		if (input.markdownKey !== undefined)
			updateData.markdownKey = input.markdownKey;
		if (input.errorMessage !== undefined)
			updateData.errorMessage = input.errorMessage;
		if (input.startedAt !== undefined) updateData.startedAt = input.startedAt;
		if (input.completedAt !== undefined)
			updateData.completedAt = input.completedAt;

		const job = await this.prisma.processingJob.update({
			where: { id },
			data: updateData,
		});

		return mapToEntity(job);
	}

	/**
	 * List jobs for an organization
	 */
	async list(
		organizationId: string,
		filters: JobFilters,
	): Promise<ListResult<JobEntity>> {
		const { limit = 20, offset = 0, status, documentId } = filters;

		const where: Record<string, unknown> = { organizationId };
		if (status) where.status = status;
		if (documentId) where.documentId = documentId;

		const [jobs, total] = await Promise.all([
			this.prisma.processingJob.findMany({
				where,
				orderBy: { createdAt: "desc" },
				take: limit,
				skip: offset,
			}),
			this.prisma.processingJob.count({ where }),
		]);

		return {
			data: jobs.map(mapToEntity),
			total,
			limit,
			offset,
		};
	}

	/**
	 * Get jobs by document ID
	 */
	async getByDocumentId(documentId: string): Promise<JobEntity[]> {
		const jobs = await this.prisma.processingJob.findMany({
			where: { documentId },
			orderBy: { createdAt: "desc" },
		});

		return jobs.map(mapToEntity);
	}
}
