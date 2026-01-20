/**
 * Processing Job Service
 * Business logic for processing jobs
 */

import type { JobRepository } from "./repository";
import type {
	JobEntity,
	JobCreateInput,
	JobUpdateInput,
	JobFilters,
	ListResult,
} from "./types";

export class JobService {
	constructor(private readonly repository: JobRepository) {}

	/**
	 * Create a new processing job for a document
	 */
	async create(input: JobCreateInput): Promise<JobEntity> {
		return this.repository.create(input);
	}

	/**
	 * Get job by ID
	 */
	async get(organizationId: string, id: string): Promise<JobEntity> {
		const job = await this.repository.getById(organizationId, id);
		if (!job) {
			throw new Error("JOB_NOT_FOUND");
		}
		return job;
	}

	/**
	 * Get job by ID (internal - no org check, for worker)
	 */
	async getInternal(id: string): Promise<JobEntity> {
		const job = await this.repository.getByIdInternal(id);
		if (!job) {
			throw new Error("JOB_NOT_FOUND");
		}
		return job;
	}

	/**
	 * Update job (internal - for worker)
	 */
	async updateInternal(id: string, input: JobUpdateInput): Promise<JobEntity> {
		// Verify job exists
		await this.getInternal(id);
		return this.repository.update(id, input);
	}

	/**
	 * Mark job as started (processing)
	 */
	async markStarted(
		id: string,
		workflowInstanceId: string,
	): Promise<JobEntity> {
		return this.repository.update(id, {
			status: "PROCESSING",
			workflowInstanceId,
			startedAt: new Date(),
		});
	}

	/**
	 * Mark job as completed
	 */
	async markCompleted(id: string): Promise<JobEntity> {
		return this.repository.update(id, {
			status: "COMPLETED",
			completedAt: new Date(),
		});
	}

	/**
	 * Mark job as failed
	 */
	async markFailed(id: string, errorMessage: string): Promise<JobEntity> {
		return this.repository.update(id, {
			status: "FAILED",
			errorMessage,
			completedAt: new Date(),
		});
	}

	/**
	 * List jobs for an organization
	 */
	async list(
		organizationId: string,
		filters: JobFilters,
	): Promise<ListResult<JobEntity>> {
		return this.repository.list(organizationId, filters);
	}

	/**
	 * Get jobs for a specific document
	 */
	async getByDocument(documentId: string): Promise<JobEntity[]> {
		return this.repository.getByDocumentId(documentId);
	}
}
