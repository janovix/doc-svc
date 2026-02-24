/**
 * Upload Link Domain Types
 *
 * Upload links allow users to create shareable links for document uploads.
 * Each link specifies required document types and has an expiration date.
 */

import type { RequiredDocument, UploadLinkStatus } from "../../types";

export interface UploadLinkEntity {
	id: string;
	organizationId: string;
	createdBy: string;
	expiresAt: Date;
	maxUploads: number | null;
	requiredDocuments: RequiredDocument[];
	uploadedCount: number;
	status: UploadLinkStatus;
	allowMultipleFiles: boolean;
	metadata: UploadLinkMetadata | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface UploadLinkMetadata {
	clientId?: string;
	clientName?: string;
	notes?: string;
	[key: string]: unknown;
}

export interface UploadLinkCreateInput {
	organizationId: string;
	createdBy: string;
	expiresAt: Date;
	maxUploads?: number;
	requiredDocuments: RequiredDocument[];
	allowMultipleFiles?: boolean;
	metadata?: UploadLinkMetadata;
}

export interface UploadLinkUpdateInput {
	status?: UploadLinkStatus;
	uploadedCount?: number;
	metadata?: UploadLinkMetadata;
}

export interface UploadLinkFilters {
	limit?: number;
	offset?: number;
	status?: UploadLinkStatus;
}

export interface ListResult<T> {
	data: T[];
	total: number;
	limit: number;
	offset: number;
}
