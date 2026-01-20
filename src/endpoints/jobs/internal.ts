/**
 * Internal Job Update Endpoint
 * POST /internal/jobs/:id
 *
 * Used by doc-processor-worker to update job status and results
 * This endpoint is not exposed via OpenAPI docs
 */

import { Hono } from "hono";
import type { Bindings } from "../../types";
import { getPrisma } from "../../lib/prisma";
import { JobRepository } from "../../domain/job/repository";
import { JobService } from "../../domain/job/service";
import { JobInternalUpdateSchema } from "../../domain/job/schemas";

const internalJobsRouter = new Hono<{ Bindings: Bindings }>();

/**
 * Update job (internal - from worker)
 */
internalJobsRouter.post("/:id", async (c) => {
	const { id } = c.req.param();

	try {
		const body = await c.req.json();
		const parsed = JobInternalUpdateSchema.safeParse(body);

		if (!parsed.success) {
			return c.json(
				{
					success: false,
					error: "Invalid request body",
					details: parsed.error.errors,
				},
				400,
			);
		}

		const prisma = getPrisma(c.env.DB);
		const jobRepo = new JobRepository(prisma);
		const jobService = new JobService(jobRepo);

		// Convert date strings to Date objects if present
		const updateData = {
			...parsed.data,
			startedAt: parsed.data.startedAt
				? new Date(parsed.data.startedAt)
				: undefined,
			completedAt: parsed.data.completedAt
				? new Date(parsed.data.completedAt)
				: undefined,
		};

		const job = await jobService.updateInternal(id, updateData);

		return c.json({
			success: true,
			result: { id: job.id, status: job.status },
		});
	} catch (error) {
		if (error instanceof Error && error.message === "JOB_NOT_FOUND") {
			return c.json({ success: false, error: "Job not found" }, 404);
		}
		console.error("Error updating job:", error);
		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		);
	}
});

/**
 * Mark job as started
 */
internalJobsRouter.post("/:id/start", async (c) => {
	const { id } = c.req.param();

	try {
		const body = await c.req.json();
		const { workflowInstanceId } = body;

		if (!workflowInstanceId) {
			return c.json(
				{ success: false, error: "workflowInstanceId is required" },
				400,
			);
		}

		const prisma = getPrisma(c.env.DB);
		const jobRepo = new JobRepository(prisma);
		const jobService = new JobService(jobRepo);

		const job = await jobService.markStarted(id, workflowInstanceId);

		return c.json({
			success: true,
			result: { id: job.id, status: job.status },
		});
	} catch (error) {
		if (error instanceof Error && error.message === "JOB_NOT_FOUND") {
			return c.json({ success: false, error: "Job not found" }, 404);
		}
		throw error;
	}
});

/**
 * Mark job as completed
 */
internalJobsRouter.post("/:id/complete", async (c) => {
	const { id } = c.req.param();

	try {
		const prisma = getPrisma(c.env.DB);
		const jobRepo = new JobRepository(prisma);
		const jobService = new JobService(jobRepo);

		const job = await jobService.markCompleted(id);

		return c.json({
			success: true,
			result: { id: job.id, status: job.status },
		});
	} catch (error) {
		if (error instanceof Error && error.message === "JOB_NOT_FOUND") {
			return c.json({ success: false, error: "Job not found" }, 404);
		}
		throw error;
	}
});

/**
 * Mark job as failed
 */
internalJobsRouter.post("/:id/fail", async (c) => {
	const { id } = c.req.param();

	try {
		const body = await c.req.json();
		const { errorMessage } = body;

		const prisma = getPrisma(c.env.DB);
		const jobRepo = new JobRepository(prisma);
		const jobService = new JobService(jobRepo);

		const job = await jobService.markFailed(
			id,
			errorMessage || "Unknown error",
		);

		return c.json({
			success: true,
			result: { id: job.id, status: job.status },
		});
	} catch (error) {
		if (error instanceof Error && error.message === "JOB_NOT_FOUND") {
			return c.json({ success: false, error: "Job not found" }, 404);
		}
		throw error;
	}
});

export { internalJobsRouter };
