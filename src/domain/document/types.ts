/**
 * Document Domain Types (MVP)
 *
 * Each document maintains a consistent file structure in R2:
 * - originalPdfs: Original PDF files if uploaded
 * - originalImages: Original image files if uploaded
 * - rasterizedImages: Always present - rasterized JPEGs for viewing
 * - finalPdfKey: Always present - compiled PDF from rasterized images
 */

import type { DocumentType } from "../../types";

export interface DocumentEntity {
	id: string;
	organizationId: string;
	uploadLinkId: string | null;
	fileName: string;
	fileSize: number;
	pageCount: number;
	sha256Hash: string;
	// File structure (R2 keys)
	originalPdfs: string[] | null;
	originalImages: string[] | null;
	rasterizedImages: string[];
	finalPdfKey: string;
	// Metadata
	documentType: DocumentType | null;
	createdBy: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface DocumentCreateInput {
	id?: string; // Optional, generated if not provided
	organizationId: string;
	uploadLinkId?: string;
	fileName: string;
	fileSize: number;
	pageCount: number;
	sha256Hash?: string;
	// File structure (R2 keys)
	originalPdfs?: string[];
	originalImages?: string[];
	rasterizedImages: string[];
	finalPdfKey: string;
	// Metadata
	documentType?: DocumentType;
	createdBy: string;
}

export interface DocumentFilters {
	limit?: number;
	offset?: number;
	organizationId?: string;
	uploadLinkId?: string;
}

export interface ListResult<T> {
	data: T[];
	total: number;
	limit: number;
	offset: number;
}
