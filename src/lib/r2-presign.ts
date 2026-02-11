/**
 * R2 Presigned URL Generator (MVP)
 *
 * Uses the S3-compatible API to generate presigned URLs for direct
 * client uploads and downloads to/from R2.
 *
 * File structure for each document:
 * documents/{orgId}/{docId}/
 * ├── originals/
 * │   ├── pdf_001.pdf       (if user uploaded PDFs)
 * │   ├── pdf_002.pdf
 * │   ├── img_001.jpg       (if user uploaded images)
 * │   └── img_002.png
 * ├── rasterized/
 * │   ├── page_001.jpg      (always present)
 * │   ├── page_002.jpg
 * │   └── page_003.jpg
 * └── final.pdf             (always present)
 */

import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface R2PresignConfig {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucketName: string;
	publicDomain?: string;
}

/**
 * Create an S3 client configured for Cloudflare R2
 *
 * When a custom domain is configured (e.g. doc-storage-dev.janovix.com),
 * the domain is already bound to a specific bucket. The S3 SDK with
 * forcePathStyle adds the bucket name as a path prefix (/{bucket}/key),
 * so we use middleware to strip it before signing. This produces clean
 * URLs like: https://doc-storage-dev.janovix.com/documents/...
 */
export function createR2Client(config: R2PresignConfig): S3Client {
	// Use custom domain if provided, otherwise fallback to default R2 endpoint
	const endpoint = config.publicDomain
		? `https://${config.publicDomain}`
		: `https://${config.accountId}.r2.cloudflarestorage.com`;

	const client = new S3Client({
		region: "auto",
		endpoint,
		forcePathStyle: true,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
	});

	// When using a custom domain, strip the bucket name from the URL path.
	// R2 custom domains are already bound to a specific bucket, so the
	// bucket name must not appear in the path. This runs in the "build"
	// step — after serialization constructs the path but before signing.
	if (config.publicDomain) {
		client.middlewareStack.add(
			(next) => async (args) => {
				const request = args.request as { path?: string };
				if (request.path) {
					const bucketPrefix = `/${config.bucketName}`;
					if (request.path.startsWith(bucketPrefix)) {
						request.path = request.path.slice(bucketPrefix.length) || "/";
					}
				}
				return next(args);
			},
			{ step: "build", name: "r2StripBucketFromPath" },
		);
	}

	return client;
}

/**
 * Generate a presigned URL for uploading a file to R2
 */
export async function getUploadUrl(
	client: S3Client,
	bucket: string,
	key: string,
	contentType: string,
	expiresIn: number = 3600,
): Promise<string> {
	const command = new PutObjectCommand({
		Bucket: bucket,
		Key: key,
		ContentType: contentType,
	});

	return getSignedUrl(client, command, { expiresIn });
}

/**
 * Generate a presigned URL for downloading a file from R2
 */
export async function getDownloadUrl(
	client: S3Client,
	bucket: string,
	key: string,
	expiresIn: number = 3600,
): Promise<string> {
	const command = new GetObjectCommand({
		Bucket: bucket,
		Key: key,
	});

	return getSignedUrl(client, command, { expiresIn });
}

/**
 * Check if an object exists in R2 via S3 API
 */
export async function objectExists(
	client: S3Client,
	bucket: string,
	key: string,
): Promise<boolean> {
	try {
		const command = new HeadObjectCommand({
			Bucket: bucket,
			Key: key,
		});
		await client.send(command);
		return true;
	} catch {
		return false;
	}
}

/**
 * MVP Document Upload URL Request
 */
export interface MvpUploadUrlRequest {
	originalPdfCount: number; // Number of original PDFs (0 if none)
	originalImageCount: number; // Number of original images (0 if none)
	pageCount: number; // Number of rasterized pages (required)
}

/**
 * MVP Document Upload URLs Response
 */
export interface MvpUploadUrls {
	// Original files (optional)
	originalPdfUrls: string[];
	originalPdfKeys: string[];
	originalImageUrls: string[];
	originalImageKeys: string[];
	// Rasterized images (required)
	rasterizedImageUrls: string[];
	rasterizedImageKeys: string[];
	// Final PDF (required)
	finalPdfUrl: string;
	finalPdfKey: string;
}

/**
 * Generate presigned URLs for MVP document upload
 *
 * @param client - S3Client configured for R2
 * @param bucket - Bucket name
 * @param organizationId - Organization ID
 * @param documentId - Document ID
 * @param request - Upload request specifying file counts
 * @param expiresIn - URL expiration time in seconds
 */
export async function generateMvpUploadUrls(
	client: S3Client,
	bucket: string,
	organizationId: string,
	documentId: string,
	request: MvpUploadUrlRequest,
	expiresIn: number = 3600,
): Promise<MvpUploadUrls> {
	const baseKey = `documents/${organizationId}/${documentId}`;

	// Generate URLs for original PDFs
	const originalPdfUrls: string[] = [];
	const originalPdfKeys: string[] = [];
	for (let i = 1; i <= request.originalPdfCount; i++) {
		const key = `${baseKey}/originals/pdf_${String(i).padStart(3, "0")}.pdf`;
		const url = await getUploadUrl(
			client,
			bucket,
			key,
			"application/pdf",
			expiresIn,
		);
		originalPdfUrls.push(url);
		originalPdfKeys.push(key);
	}

	// Generate URLs for original images
	const originalImageUrls: string[] = [];
	const originalImageKeys: string[] = [];
	for (let i = 1; i <= request.originalImageCount; i++) {
		const key = `${baseKey}/originals/img_${String(i).padStart(3, "0")}.jpg`;
		const url = await getUploadUrl(
			client,
			bucket,
			key,
			"image/jpeg",
			expiresIn,
		);
		originalImageUrls.push(url);
		originalImageKeys.push(key);
	}

	// Generate URLs for rasterized images (required)
	const rasterizedImageUrls: string[] = [];
	const rasterizedImageKeys: string[] = [];
	for (let i = 1; i <= request.pageCount; i++) {
		const key = `${baseKey}/rasterized/page_${String(i).padStart(3, "0")}.jpg`;
		const url = await getUploadUrl(
			client,
			bucket,
			key,
			"image/jpeg",
			expiresIn,
		);
		rasterizedImageUrls.push(url);
		rasterizedImageKeys.push(key);
	}

	// Generate URL for final PDF (required)
	const finalPdfKey = `${baseKey}/final.pdf`;
	const finalPdfUrl = await getUploadUrl(
		client,
		bucket,
		finalPdfKey,
		"application/pdf",
		expiresIn,
	);

	return {
		originalPdfUrls,
		originalPdfKeys,
		originalImageUrls,
		originalImageKeys,
		rasterizedImageUrls,
		rasterizedImageKeys,
		finalPdfUrl,
		finalPdfKey,
	};
}

/**
 * Generate presigned URLs for MVP document download
 */
export async function generateMvpDownloadUrls(
	client: S3Client,
	bucket: string,
	document: {
		organizationId: string;
		id: string;
		originalPdfs: string[] | null;
		originalImages: string[] | null;
		rasterizedImages: string[];
		finalPdfKey: string;
	},
	expiresIn: number = 3600,
): Promise<{
	originalPdfUrls: string[];
	originalImageUrls: string[];
	rasterizedImageUrls: string[];
	finalPdfUrl: string;
}> {
	// Generate URLs for original PDFs
	const originalPdfUrls: string[] = [];
	if (document.originalPdfs) {
		for (const key of document.originalPdfs) {
			const url = await getDownloadUrl(client, bucket, key, expiresIn);
			originalPdfUrls.push(url);
		}
	}

	// Generate URLs for original images
	const originalImageUrls: string[] = [];
	if (document.originalImages) {
		for (const key of document.originalImages) {
			const url = await getDownloadUrl(client, bucket, key, expiresIn);
			originalImageUrls.push(url);
		}
	}

	// Generate URLs for rasterized images
	const rasterizedImageUrls: string[] = [];
	for (const key of document.rasterizedImages) {
		const url = await getDownloadUrl(client, bucket, key, expiresIn);
		rasterizedImageUrls.push(url);
	}

	// Generate URL for final PDF
	const finalPdfUrl = await getDownloadUrl(
		client,
		bucket,
		document.finalPdfKey,
		expiresIn,
	);

	return {
		originalPdfUrls,
		originalImageUrls,
		rasterizedImageUrls,
		finalPdfUrl,
	};
}

// Legacy functions for backward compatibility during transition
// TODO: Remove after full migration

export async function generateDocumentUploadUrls(
	client: S3Client,
	bucket: string,
	organizationId: string,
	documentId: string,
	pageCount: number,
	hasPdf: boolean,
	expiresIn: number = 3600,
): Promise<{
	pdfUrl?: string;
	imageUrls: string[];
	keys: {
		pdf?: string;
		images: string[];
	};
}> {
	// Use MVP function internally
	const result = await generateMvpUploadUrls(
		client,
		bucket,
		organizationId,
		documentId,
		{
			originalPdfCount: hasPdf ? 1 : 0,
			originalImageCount: 0,
			pageCount,
		},
		expiresIn,
	);

	return {
		pdfUrl: result.originalPdfUrls[0],
		imageUrls: result.rasterizedImageUrls,
		keys: {
			pdf: result.originalPdfKeys[0],
			images: result.rasterizedImageKeys,
		},
	};
}

export async function generateDocumentDownloadUrls(
	client: S3Client,
	bucket: string,
	organizationId: string,
	documentId: string,
	pageCount: number,
	hasPdf: boolean,
	expiresIn: number = 3600,
): Promise<{
	pdfUrl?: string;
	imageUrls: string[];
}> {
	const baseKey = `documents/${organizationId}/${documentId}`;
	const imageUrls: string[] = [];

	// Generate presigned URLs for each page image
	for (let i = 1; i <= pageCount; i++) {
		const key = `${baseKey}/rasterized/page_${String(i).padStart(3, "0")}.jpg`;
		const url = await getDownloadUrl(client, bucket, key, expiresIn);
		imageUrls.push(url);
	}

	// Generate presigned URL for PDF if it exists
	let pdfUrl: string | undefined;
	if (hasPdf) {
		const pdfKey = `${baseKey}/final.pdf`;
		pdfUrl = await getDownloadUrl(client, bucket, pdfKey, expiresIn);
	}

	return {
		pdfUrl,
		imageUrls,
	};
}
