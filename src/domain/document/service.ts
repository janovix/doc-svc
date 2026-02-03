/**
 * Document Service (MVP)
 * Business logic for document management
 */

import type { DocumentRepository } from "./repository";
import type {
	DocumentEntity,
	DocumentCreateInput,
	DocumentFilters,
	ListResult,
} from "./types";

export class DocumentService {
	constructor(private readonly repository: DocumentRepository) {}

	/**
	 * Create a new document
	 */
	async create(input: DocumentCreateInput): Promise<DocumentEntity> {
		return this.repository.create(input);
	}

	/**
	 * Get document by ID
	 */
	async get(organizationId: string, id: string): Promise<DocumentEntity> {
		const doc = await this.repository.getById(organizationId, id);
		if (!doc) {
			throw new Error("DOCUMENT_NOT_FOUND");
		}
		return doc;
	}

	/**
	 * Get document by ID (without org check - for internal use)
	 */
	async getInternal(id: string): Promise<DocumentEntity> {
		const doc = await this.repository.getByIdInternal(id);
		if (!doc) {
			throw new Error("DOCUMENT_NOT_FOUND");
		}
		return doc;
	}

	/**
	 * Check if a document with the same hash already exists
	 */
	async checkDuplicate(
		organizationId: string,
		hash: string,
	): Promise<DocumentEntity | null> {
		return this.repository.getByHash(organizationId, hash);
	}

	/**
	 * List documents for an organization
	 */
	async list(
		organizationId: string,
		filters: DocumentFilters,
	): Promise<ListResult<DocumentEntity>> {
		return this.repository.list(organizationId, filters);
	}

	/**
	 * List documents for an upload link
	 */
	async listByUploadLink(uploadLinkId: string): Promise<DocumentEntity[]> {
		return this.repository.listByUploadLink(uploadLinkId);
	}

	/**
	 * Count documents for an upload link
	 */
	async countByUploadLink(uploadLinkId: string): Promise<number> {
		return this.repository.countByUploadLink(uploadLinkId);
	}

	/**
	 * Delete a document
	 */
	async delete(organizationId: string, id: string): Promise<void> {
		// Verify document exists
		await this.get(organizationId, id);
		await this.repository.delete(organizationId, id);
	}
}
