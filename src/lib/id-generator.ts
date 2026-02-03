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
	DOC: "doc_",
	DOCUMENT: "doc_",
	LINK: "lnk_",
	UPLOAD_LINK: "lnk_",
} as const;

export type IdType = keyof typeof ID_PREFIXES;

/**
 * Generate an ID with a specific prefix
 */
export function generateId(type: IdType): string {
	return `${ID_PREFIXES[type]}${generateRandomId(ID_LENGTH)}`;
}

/**
 * Generate a document ID
 */
export function generateDocumentId(): string {
	return generateId("DOC");
}

/**
 * Generate an upload link ID
 */
export function generateUploadLinkId(): string {
	return generateId("LINK");
}
