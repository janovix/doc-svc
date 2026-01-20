/**
 * Job Read Endpoint
 * GET /jobs/:id
 */

import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { JobRepository } from "../../domain/job/repository";
import { JobService } from "../../domain/job/service";
import { JobResponseSchema } from "../../domain/job/schemas";
import type { JobEntity } from "../../domain/job/types";

/**
 * Maps job entity to API response format
 */
function mapJobToResponse(job: JobEntity) {
	return {
		id: job.id,
		documentId: job.documentId,
		organizationId: job.organizationId,
		status: job.status,
		workflowInstanceId: job.workflowInstanceId,
		classification:
			job.docFamily || job.docType
				? {
						docFamily: job.docFamily,
						docType: job.docType,
						confidence: job.classificationConfidence,
						evidence: job.classificationEvidence,
					}
				: null,
		visualValidation:
			job.visualValidationScore !== null
				? {
						score: job.visualValidationScore,
						threshold: job.visualValidationThreshold,
						pass: job.visualValidationPass,
						signals: job.visualValidationSignals,
						evidence: job.visualValidationEvidence,
					}
				: null,
		extraction: job.extractedFields ? { fields: job.extractedFields } : null,
		validations: job.validations,
		risk:
			job.riskScore !== null
				? {
						score: job.riskScore,
						signals: job.riskSignals,
					}
				: null,
		decision: job.decision,
		decisionReason: job.decisionReason,
		errorMessage: job.errorMessage,
		startedAt: job.startedAt?.toISOString() ?? null,
		completedAt: job.completedAt?.toISOString() ?? null,
		createdAt: job.createdAt.toISOString(),
		updatedAt: job.updatedAt.toISOString(),
	};
}

export class JobRead extends OpenAPIRoute {
	schema = {
		tags: ["Jobs"],
		summary: "Get processing job by ID",
		description:
			"Retrieve processing job details including classification, validation, and extraction results",
		operationId: "job-read",
		request: {
			params: z.object({
				id: z.string().describe("Job ID"),
			}),
		},
		responses: {
			"200": {
				description: "Job found",
				...contentJson(
					z.object({
						success: z.literal(true),
						result: JobResponseSchema,
					}),
				),
			},
			"404": {
				description: "Job not found",
				...contentJson(
					z.object({
						success: z.literal(false),
						error: z.string(),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
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
		// TODO: Add authentication middleware
		const organizationId = c.req.header("x-organization-id") || "org_demo";

		const data = await this.getValidatedData<typeof this.schema>();
		const { id } = data.params;

		const prisma = getPrisma(c.env.DB);
		const jobRepo = new JobRepository(prisma);
		const jobService = new JobService(jobRepo);

		try {
			const job = await jobService.get(organizationId, id);
			return c.json({
				success: true,
				result: mapJobToResponse(job),
			});
		} catch (error) {
			if (error instanceof Error && error.message === "JOB_NOT_FOUND") {
				return c.json({ success: false, error: "Job not found" }, 404);
			}
			throw error;
		}
	}
}

export { mapJobToResponse };
