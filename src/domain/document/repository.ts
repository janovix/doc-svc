/**
 * Document Repository (MVP)
 * Data access layer for documents
 */

import type { PrismaClient } from "@prisma/client";
import type {
	DocumentEntity,
	DocumentCreateInput,
	DocumentFilters,
	ListResult,
} from "./types";
import type { DocumentType } from "../../types";
import { generateDocumentId } from "../../lib/id-generator";

/**
 * Maps Prisma document to domain entity
 */
function mapToEntity(doc: {
	id: string;
	organizationId: string;
	uploadLinkId: string | null;
	fileName: string;
	fileSize: number;
	pageCount: number;
	sha256Hash: string;
	originalPdfs: string | null;
	originalImages: string | null;
	rasterizedImages: string;
	finalPdfKey: string;
	documentType: string | null;
	createdBy: string;
	createdAt: Date;
	updatedAt: Date;
}): DocumentEntity {
	return {
		id: doc.id,
		organizationId: doc.organizationId,
		uploadLinkId: doc.uploadLinkId,
		fileName: doc.fileName,
		fileSize: doc.fileSize,
		pageCount: doc.pageCount,
		sha256Hash: doc.sha256Hash,
		originalPdfs: doc.originalPdfs ? JSON.parse(doc.originalPdfs) : null,
		originalImages: doc.originalImages ? JSON.parse(doc.originalImages) : null,
		rasterizedImages: JSON.parse(doc.rasterizedImages),
		finalPdfKey: doc.finalPdfKey,
		documentType: doc.documentType as DocumentType | null,
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
		const id = input.id || generateDocumentId();
		const now = new Date();

		const doc = await this.prisma.document.create({
			data: {
				id,
				organizationId: input.organizationId,
				uploadLinkId: input.uploadLinkId || null,
				fileName: input.fileName,
				fileSize: input.fileSize,
				pageCount: input.pageCount,
				// Use placeholder if sha256Hash not provided (client-side hash is optional)
				sha256Hash: input.sha256Hash || "pending",
				originalPdfs: input.originalPdfs
					? JSON.stringify(input.originalPdfs)
					: null,
				originalImages: input.originalImages
					? JSON.stringify(input.originalImages)
					: null,
				rasterizedImages: JSON.stringify(input.rasterizedImages),
				finalPdfKey: input.finalPdfKey,
				documentType: input.documentType || null,
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
	 * Get document by ID (without org check - for internal use)
	 */
	async getByIdInternal(id: string): Promise<DocumentEntity | null> {
		const doc = await this.prisma.document.findUnique({
			where: { id },
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
		const { limit = 20, offset = 0, uploadLinkId } = filters;

		const where = {
			organizationId,
			...(uploadLinkId ? { uploadLinkId } : {}),
		};

		const [docs, total] = await Promise.all([
			this.prisma.document.findMany({
				where,
				orderBy: { createdAt: "desc" },
				take: limit,
				skip: offset,
			}),
			this.prisma.document.count({ where }),
		]);

		return {
			data: docs.map(mapToEntity),
			total,
			limit,
			offset,
		};
	}

	/**
	 * List documents by upload link ID
	 */
	async listByUploadLink(uploadLinkId: string): Promise<DocumentEntity[]> {
		const docs = await this.prisma.document.findMany({
			where: { uploadLinkId },
			orderBy: { createdAt: "desc" },
		});

		return docs.map(mapToEntity);
	}

	/**
	 * Count documents by upload link ID
	 */
	async countByUploadLink(uploadLinkId: string): Promise<number> {
		return this.prisma.document.count({
			where: { uploadLinkId },
		});
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
