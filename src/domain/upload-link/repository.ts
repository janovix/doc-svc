/**
 * Upload Link Repository
 * Data access layer for upload links
 */

import type { PrismaClient } from "@prisma/client";
import type {
	UploadLinkEntity,
	UploadLinkCreateInput,
	UploadLinkUpdateInput,
	UploadLinkFilters,
	ListResult,
} from "./types";
import type { RequiredDocument, UploadLinkStatus } from "../../types";
import { generateUploadLinkId } from "../../lib/id-generator";

/**
 * Normalizes required documents to always be objects.
 * Handles backward compatibility with old format (array of strings).
 * Old format: ["mx_ine_front", "passport"]
 * New format: [{type: "mx_ine_front"}, {type: "passport", label: "..."}]
 */
function normalizeRequiredDocuments(raw: unknown): RequiredDocument[] {
	if (!Array.isArray(raw)) return [];

	return raw.map((item: unknown) => {
		// New format: already an object with type
		if (typeof item === "object" && item !== null && "type" in item) {
			return item as RequiredDocument;
		}
		// Old format: just a string type
		if (typeof item === "string") {
			return { type: item } as RequiredDocument;
		}
		// Fallback
		return { type: "other" } as RequiredDocument;
	});
}

/**
 * Maps Prisma upload link to domain entity
 */
function mapToEntity(link: {
	id: string;
	organizationId: string;
	createdBy: string;
	expiresAt: Date;
	maxUploads: number | null;
	requiredDocuments: string | null;
	uploadedCount: number;
	status: string;
	allowMultipleFiles: boolean;
	metadata: string | null;
	createdAt: Date;
	updatedAt: Date;
}): UploadLinkEntity {
	const parsedDocs = link.requiredDocuments
		? JSON.parse(link.requiredDocuments)
		: [];

	return {
		id: link.id,
		organizationId: link.organizationId,
		createdBy: link.createdBy,
		expiresAt: link.expiresAt,
		maxUploads: link.maxUploads,
		requiredDocuments: normalizeRequiredDocuments(parsedDocs),
		uploadedCount: link.uploadedCount,
		status: link.status as UploadLinkStatus,
		allowMultipleFiles: link.allowMultipleFiles,
		metadata: link.metadata ? JSON.parse(link.metadata) : null,
		createdAt: link.createdAt,
		updatedAt: link.updatedAt,
	};
}

export class UploadLinkRepository {
	constructor(private readonly prisma: PrismaClient) {}

	/**
	 * Create a new upload link
	 */
	async create(input: UploadLinkCreateInput): Promise<UploadLinkEntity> {
		const id = generateUploadLinkId();
		const now = new Date();

		const link = await this.prisma.uploadLink.create({
			data: {
				id,
				organizationId: input.organizationId,
				createdBy: input.createdBy,
				expiresAt: input.expiresAt,
				maxUploads: input.maxUploads || null,
				requiredDocuments: JSON.stringify(input.requiredDocuments),
				uploadedCount: 0,
				status: "ACTIVE",
				allowMultipleFiles: input.allowMultipleFiles ?? true,
				metadata: input.metadata ? JSON.stringify(input.metadata) : null,
				createdAt: now,
				updatedAt: now,
			},
		});

		return mapToEntity(link);
	}

	/**
	 * Get upload link by ID
	 */
	async getById(id: string): Promise<UploadLinkEntity | null> {
		const link = await this.prisma.uploadLink.findUnique({
			where: { id },
		});

		return link ? mapToEntity(link) : null;
	}

	/**
	 * Get upload link by ID for organization
	 */
	async getByIdForOrg(
		organizationId: string,
		id: string,
	): Promise<UploadLinkEntity | null> {
		const link = await this.prisma.uploadLink.findFirst({
			where: { id, organizationId },
		});

		return link ? mapToEntity(link) : null;
	}

	/**
	 * List upload links for an organization
	 */
	async list(
		organizationId: string,
		filters: UploadLinkFilters,
	): Promise<ListResult<UploadLinkEntity>> {
		const { limit = 20, offset = 0, status } = filters;

		const where: {
			organizationId: string;
			status?: "ACTIVE" | "EXPIRED" | "COMPLETED";
		} = {
			organizationId,
		};
		if (status) {
			where.status = status.toUpperCase() as "ACTIVE" | "EXPIRED" | "COMPLETED";
		}

		const [links, total] = await Promise.all([
			this.prisma.uploadLink.findMany({
				where,
				orderBy: { createdAt: "desc" },
				take: limit,
				skip: offset,
			}),
			this.prisma.uploadLink.count({ where }),
		]);

		return {
			data: links.map(mapToEntity),
			total,
			limit,
			offset,
		};
	}

	/**
	 * Update upload link
	 */
	async update(
		id: string,
		input: UploadLinkUpdateInput,
	): Promise<UploadLinkEntity> {
		const data: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (input.status !== undefined) {
			data.status = input.status.toUpperCase();
		}
		if (input.uploadedCount !== undefined) {
			data.uploadedCount = input.uploadedCount;
		}
		if (input.metadata !== undefined) {
			data.metadata = JSON.stringify(input.metadata);
		}

		const link = await this.prisma.uploadLink.update({
			where: { id },
			data,
		});

		return mapToEntity(link);
	}

	/**
	 * Increment uploaded count
	 */
	async incrementUploadedCount(id: string): Promise<UploadLinkEntity> {
		const link = await this.prisma.uploadLink.update({
			where: { id },
			data: {
				uploadedCount: { increment: 1 },
				updatedAt: new Date(),
			},
		});

		return mapToEntity(link);
	}

	/**
	 * Delete upload link
	 */
	async delete(organizationId: string, id: string): Promise<void> {
		await this.prisma.uploadLink.deleteMany({
			where: { id, organizationId },
		});
	}

	/**
	 * Mark expired links
	 */
	async markExpiredLinks(): Promise<number> {
		const result = await this.prisma.uploadLink.updateMany({
			where: {
				status: "ACTIVE",
				expiresAt: { lt: new Date() },
			},
			data: {
				status: "EXPIRED",
				updatedAt: new Date(),
			},
		});

		return result.count;
	}
}
