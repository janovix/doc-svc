/**
 * Hash Utilities
 * SHA-256 hashing for document deduplication
 */

/**
 * Compute SHA-256 hash of an ArrayBuffer
 * Returns hex-encoded string
 */
export async function computeSha256(data: ArrayBuffer): Promise<string> {
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute SHA-256 hash of a string
 * Returns hex-encoded string
 */
export async function computeSha256String(data: string): Promise<string> {
	const encoder = new TextEncoder();
	const encoded = encoder.encode(data);
	return computeSha256(encoded.buffer as ArrayBuffer);
}
