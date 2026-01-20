/**
 * Document Service
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
	 * Delete a document
	 */
	async delete(organizationId: string, id: string): Promise<void> {
		// Verify document exists
		await this.get(organizationId, id);
		await this.repository.delete(organizationId, id);
	}
}
