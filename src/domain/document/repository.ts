/**
 * Document Repository
 * Data access layer for documents
 */

import type { PrismaClient } from "@prisma/client";
import type {
	DocumentEntity,
	DocumentCreateInput,
	DocumentFilters,
	ListResult,
} from "./types";
import { generateDocumentId } from "../../lib/id-generator";

/**
 * Maps Prisma document to domain entity
 */
function mapToEntity(doc: {
	id: string;
	organizationId: string;
	originalFileKey: string;
	fileName: string;
	fileSize: number;
	fileType: string;
	sha256Hash: string;
	previewKeys: string | null;
	createdBy: string;
	createdAt: Date;
	updatedAt: Date;
}): DocumentEntity {
	return {
		id: doc.id,
		organizationId: doc.organizationId,
		originalFileKey: doc.originalFileKey,
		fileName: doc.fileName,
		fileSize: doc.fileSize,
		fileType: doc.fileType,
		sha256Hash: doc.sha256Hash,
		previewKeys: doc.previewKeys ? JSON.parse(doc.previewKeys) : null,
		createdBy: doc.createdBy,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

export class DocumentRepository {
	constructor(private readonly prisma: PrismaClient) {}

	/**
	 * Create a new document
	 */
	async create(input: DocumentCreateInput): Promise<DocumentEntity> {
		const id = generateDocumentId();
		const now = new Date();

		const doc = await this.prisma.document.create({
			data: {
				id,
				organizationId: input.organizationId,
				originalFileKey: input.originalFileKey,
				fileName: input.fileName,
				fileSize: input.fileSize,
				fileType: input.fileType,
				sha256Hash: input.sha256Hash,
				previewKeys: input.previewKeys
					? JSON.stringify(input.previewKeys)
					: null,
				createdBy: input.createdBy,
				createdAt: now,
				updatedAt: now,
			},
		});

		return mapToEntity(doc);
	}

	/**
	 * Get document by ID
	 */
	async getById(
		organizationId: string,
		id: string,
	): Promise<DocumentEntity | null> {
		const doc = await this.prisma.document.findFirst({
			where: {
				id,
				organizationId,
			},
		});

		return doc ? mapToEntity(doc) : null;
	}

	/**
	 * Get document by SHA-256 hash (for deduplication)
	 */
	async getByHash(
		organizationId: string,
		hash: string,
	): Promise<DocumentEntity | null> {
		const doc = await this.prisma.document.findFirst({
			where: {
				organizationId,
				sha256Hash: hash,
			},
		});

		return doc ? mapToEntity(doc) : null;
	}

	/**
	 * List documents for an organization
	 */
	async list(
		organizationId: string,
		filters: DocumentFilters,
	): Promise<ListResult<DocumentEntity>> {
		const { limit = 20, offset = 0 } = filters;

		const [docs, total] = await Promise.all([
			this.prisma.document.findMany({
				where: { organizationId },
				orderBy: { createdAt: "desc" },
				take: limit,
				skip: offset,
			}),
			this.prisma.document.count({
				where: { organizationId },
			}),
		]);

		return {
			data: docs.map(mapToEntity),
			total,
			limit,
			offset,
		};
	}

	/**
	 * Delete a document
	 */
	async delete(organizationId: string, id: string): Promise<void> {
		await this.prisma.document.deleteMany({
			where: {
				id,
				organizationId,
			},
		});
	}
}
