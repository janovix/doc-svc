/**
 * Job List Endpoint
 * GET /jobs
 */

import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { JobRepository } from "../../domain/job/repository";
import { JobService } from "../../domain/job/service";
import { JobFiltersSchema, JobResponseSchema } from "../../domain/job/schemas";
import { mapJobToResponse } from "./read";

export class JobList extends OpenAPIRoute {
	schema = {
		tags: ["Jobs"],
		summary: "List processing jobs",
		description:
			"List processing jobs for the organization with pagination and filtering",
		operationId: "job-list",
		request: {
			query: JobFiltersSchema,
		},
		responses: {
			"200": {
				description: "List of jobs",
				...contentJson(
					z.object({
						success: z.literal(true),
						result: z.object({
							data: z.array(JobResponseSchema),
							total: z.number(),
							limit: z.number(),
							offset: z.number(),
						}),
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
		const { limit, offset, status, documentId } = data.query;

		const prisma = getPrisma(c.env.DB);
		const jobRepo = new JobRepository(prisma);
		const jobService = new JobService(jobRepo);

		const result = await jobService.list(organizationId, {
			limit,
			offset,
			status,
			documentId,
		});

		return c.json({
			success: true,
			result: {
				data: result.data.map(mapJobToResponse),
				total: result.total,
				limit: result.limit,
				offset: result.offset,
			},
		});
	}
}
