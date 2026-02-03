/**
 * Cloudflare Turnstile Verification
 *
 * Verifies Turnstile tokens for public (unauthenticated) endpoints.
 */

const TURNSTILE_VERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
	success: boolean;
	error?: string;
	hostname?: string;
}

/**
 * Verify a Turnstile token
 *
 * @param token - The Turnstile token from the client
 * @param secretKey - The Turnstile secret key
 * @param remoteIp - Optional: The client's IP address
 */
export async function verifyTurnstileToken(
	token: string,
	secretKey: string,
	remoteIp?: string,
): Promise<TurnstileVerifyResult> {
	try {
		const formData = new FormData();
		formData.append("secret", secretKey);
		formData.append("response", token);

		if (remoteIp) {
			formData.append("remoteip", remoteIp);
		}

		const response = await fetch(TURNSTILE_VERIFY_URL, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			return {
				success: false,
				error: `Turnstile API error: ${response.status}`,
			};
		}

		const result = (await response.json()) as {
			success: boolean;
			hostname?: string;
			"error-codes"?: string[];
		};

		if (result.success) {
			return {
				success: true,
				hostname: result.hostname,
			};
		}

		return {
			success: false,
			error: result["error-codes"]?.join(", ") || "Verification failed",
		};
	} catch (error) {
		console.error("Error verifying Turnstile token:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Verification error",
		};
	}
}
