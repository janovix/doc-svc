import type { ZodError } from "zod";

/**
 * Formats a ZodError into a concise, human-readable string.
 *
 * Examples:
 *   "pageCount: Number must be greater than or equal to 1"
 *   "pageCount: Required; originalPdfCount: Expected number, received string"
 */
export function formatZodError(error: ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join(".") : "input";
			return `${path}: ${issue.message}`;
		})
		.join("; ");
}
