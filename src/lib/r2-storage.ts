/**
 * R2 Storage Service
 * Handles document and preview storage in Cloudflare R2
 */

export interface R2UploadOptions {
	bucket: R2Bucket;
	key: string;
	content: ArrayBuffer | Uint8Array | string;
	contentType: string;
	metadata?: Record<string, string>;
}

export interface R2UploadResult {
	key: string;
	size: number;
	etag: string;
}

/**
 * Upload content to R2 bucket
 */
export async function uploadToR2(
	options: R2UploadOptions,
): Promise<R2UploadResult> {
	const { bucket, key, content, contentType, metadata } = options;

	// Convert string to ArrayBuffer if needed
	let body: ArrayBuffer | Uint8Array;
	if (typeof content === "string") {
		body = new TextEncoder().encode(content);
	} else {
		body = content;
	}

	const object = await bucket.put(key, body, {
		httpMetadata: {
			contentType,
		},
		customMetadata: metadata,
	});

	return {
		key,
		size: object.size,
		etag: object.etag,
	};
}

/**
 * Download content from R2 bucket
 */
export async function downloadFromR2(
	bucket: R2Bucket,
	key: string,
): Promise<ArrayBuffer | null> {
	const object = await bucket.get(key);
	if (!object) {
		return null;
	}
	return object.arrayBuffer();
}

/**
 * Check if object exists in R2 bucket
 */
export async function existsInR2(
	bucket: R2Bucket,
	key: string,
): Promise<boolean> {
	const object = await bucket.head(key);
	return object !== null;
}

/**
 * Delete object from R2 bucket
 */
export async function deleteFromR2(
	bucket: R2Bucket,
	key: string,
): Promise<void> {
	await bucket.delete(key);
}

/**
 * Generate R2 key for document original file
 * Format: documents/{organizationId}/{documentId}/original.{ext}
 */
export function generateDocumentKey(
	organizationId: string,
	documentId: string,
	extension: string,
): string {
	return `documents/${organizationId}/${documentId}/original.${extension}`;
}

/**
 * Generate R2 key for document preview image
 * Format: documents/{organizationId}/{documentId}/preview_{pageNumber}.{ext}
 */
export function generatePreviewKey(
	organizationId: string,
	documentId: string,
	pageNumber: number,
	extension: string = "png",
): string {
	return `documents/${organizationId}/${documentId}/preview_${pageNumber}.${extension}`;
}

/**
 * Generate R2 key for extracted markdown
 * Format: documents/{organizationId}/{documentId}/extracted.md
 */
export function generateMarkdownKey(
	organizationId: string,
	documentId: string,
): string {
	return `documents/${organizationId}/${documentId}/extracted.md`;
}

/**
 * Get file extension from filename or content type
 */
export function getFileExtension(
	fileName: string,
	contentType?: string,
): string {
	// Try to get from filename first
	const extMatch = fileName.match(/\.([^.]+)$/);
	if (extMatch) {
		return extMatch[1].toLowerCase();
	}

	// Fall back to content type
	if (contentType) {
		const typeMap: Record<string, string> = {
			"application/pdf": "pdf",
			"image/png": "png",
			"image/jpeg": "jpg",
			"image/webp": "webp",
		};
		return typeMap[contentType] || "bin";
	}

	return "bin";
}

/**
 * Validate file type is supported
 */
export function isValidFileType(contentType: string): boolean {
	const validTypes = [
		"application/pdf",
		"image/png",
		"image/jpeg",
		"image/webp",
	];
	return validTypes.includes(contentType);
}

/**
 * Check if file type is PDF (requires preview images)
 */
export function isPdfFile(contentType: string): boolean {
	return contentType === "application/pdf";
}
