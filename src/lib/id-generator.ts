/**
 * ID Generator
 * Generates unique IDs with prefixes for different entity types
 */

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 12;

/**
 * Generates a random alphanumeric string of specified length
 */
function generateRandomId(length: number): string {
	const array = new Uint8Array(length);
	crypto.getRandomValues(array);
	return Array.from(array)
		.map((byte) => ALPHABET[byte % ALPHABET.length])
		.join("");
}

/**
 * ID Prefixes for different entity types
 */
export const ID_PREFIXES = {
	DOCUMENT: "doc_",
	JOB: "job_",
} as const;

/**
 * Generate a document ID
 */
export function generateDocumentId(): string {
	return `${ID_PREFIXES.DOCUMENT}${generateRandomId(ID_LENGTH)}`;
}

/**
 * Generate a processing job ID
 */
export function generateJobId(): string {
	return `${ID_PREFIXES.JOB}${generateRandomId(ID_LENGTH)}`;
}
