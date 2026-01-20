/**
 * Document Domain Types
 */

export interface DocumentEntity {
	id: string;
	organizationId: string;
	originalFileKey: string;
	fileName: string;
	fileSize: number;
	fileType: string;
	sha256Hash: string;
	previewKeys: string[] | null;
	createdBy: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface DocumentCreateInput {
	organizationId: string;
	originalFileKey: string;
	fileName: string;
	fileSize: number;
	fileType: string;
	sha256Hash: string;
	previewKeys?: string[];
	createdBy: string;
}

export interface DocumentFilters {
	limit?: number;
	offset?: number;
	organizationId?: string;
}

export interface ListResult<T> {
	data: T[];
	total: number;
	limit: number;
	offset: number;
}
