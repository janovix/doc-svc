/**
 * Upload Link Service
 * Business logic for upload link management
 */

import type { UploadLinkRepository } from "./repository";
import type {
	UploadLinkEntity,
	UploadLinkCreateInput,
	UploadLinkUpdateInput,
	UploadLinkFilters,
	ListResult,
} from "./types";

export class UploadLinkService {
	constructor(private readonly repository: UploadLinkRepository) {}

	/**
	 * Create a new upload link
	 */
	async create(input: UploadLinkCreateInput): Promise<UploadLinkEntity> {
		return this.repository.create(input);
	}

	/**
	 * Get upload link by ID (public - no org check)
	 */
	async getPublic(id: string): Promise<UploadLinkEntity> {
		const link = await this.repository.getById(id);
		if (!link) {
			throw new Error("UPLOAD_LINK_NOT_FOUND");
		}

		// Check if expired
		if (link.status === "active" && link.expiresAt < new Date()) {
			// Mark as expired
			await this.repository.update(id, { status: "expired" });
			link.status = "expired";
		}

		return link;
	}

	/**
	 * Get upload link by ID for organization
	 */
	async get(organizationId: string, id: string): Promise<UploadLinkEntity> {
		const link = await this.repository.getByIdForOrg(organizationId, id);
		if (!link) {
			throw new Error("UPLOAD_LINK_NOT_FOUND");
		}
		return link;
	}

	/**
	 * List upload links for an organization
	 */
	async list(
		organizationId: string,
		filters: UploadLinkFilters,
	): Promise<ListResult<UploadLinkEntity>> {
		return this.repository.list(organizationId, filters);
	}

	/**
	 * Update upload link
	 */
	async update(
		organizationId: string,
		id: string,
		input: UploadLinkUpdateInput,
	): Promise<UploadLinkEntity> {
		// Verify ownership
		await this.get(organizationId, id);
		return this.repository.update(id, input);
	}

	/**
	 * Validate upload link for upload
	 * Returns the link if valid, throws if invalid
	 */
	async validateForUpload(id: string): Promise<UploadLinkEntity> {
		const link = await this.getPublic(id);

		// Check status
		if (link.status === "expired") {
			throw new Error("UPLOAD_LINK_EXPIRED");
		}
		if (link.status === "completed") {
			throw new Error("UPLOAD_LINK_COMPLETED");
		}

		// Check max uploads
		if (link.maxUploads !== null && link.uploadedCount >= link.maxUploads) {
			throw new Error("UPLOAD_LINK_MAX_UPLOADS_REACHED");
		}

		return link;
	}

	/**
	 * Record a document upload
	 */
	async recordUpload(id: string): Promise<UploadLinkEntity> {
		const link = await this.repository.incrementUploadedCount(id);

		// Check if completed (all required documents uploaded or max uploads reached)
		const shouldComplete =
			link.maxUploads !== null && link.uploadedCount >= link.maxUploads;

		if (shouldComplete) {
			return this.repository.update(id, { status: "completed" });
		}

		return link;
	}

	/**
	 * Check if all required documents have been uploaded
	 */
	async checkCompletion(
		id: string,
		uploadedDocTypes: string[],
	): Promise<boolean> {
		const link = await this.getPublic(id);
		// Extract just the type from each required document
		const requiredTypes = new Set(
			link.requiredDocuments.map((doc) => doc.type),
		);
		const uploaded = new Set(uploadedDocTypes);

		for (const docType of requiredTypes) {
			if (!uploaded.has(docType)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Mark upload link as completed
	 */
	async markCompleted(id: string): Promise<UploadLinkEntity> {
		return this.repository.update(id, { status: "completed" });
	}

	/**
	 * Delete upload link
	 */
	async delete(organizationId: string, id: string): Promise<void> {
		// Verify ownership
		await this.get(organizationId, id);
		await this.repository.delete(organizationId, id);
	}

	/**
	 * Mark expired links (for scheduled task)
	 */
	async markExpiredLinks(): Promise<number> {
		return this.repository.markExpiredLinks();
	}
}
