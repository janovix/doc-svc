import type { Context, MiddlewareHandler } from "hono";
import * as jose from "jose";

import type { Bindings } from "../types";

/**
 * JWT payload structure from Better Auth
 */
export interface AuthTokenPayload {
	/** Subject - User ID */
	sub: string;
	/** Issuer - Auth service URL */
	iss?: string;
	/** Audience */
	aud?: string | string[];
	/** Expiration time (Unix timestamp) */
	exp?: number;
	/** Issued at (Unix timestamp) */
	iat?: number;
	/** JWT ID */
	jti?: string;
	/** User email (if included in token) */
	email?: string;
	/** User name (if included in token) */
	name?: string;
	/** Active organization ID (from better-auth organization plugin) */
	organizationId?: string | null;
}

/**
 * Authenticated user context attached to requests
 */
export interface AuthUser {
	id: string;
	email?: string;
	name?: string;
}

/**
 * Organization context extracted from JWT
 */
export interface AuthOrganization {
	id: string;
}

/**
 * Variables attached to request context
 */
export interface AuthVariables {
	user: AuthUser;
	organization: AuthOrganization | null;
	token: string;
	tokenPayload: AuthTokenPayload;
}

const DEFAULT_JWKS_CACHE_TTL = 3600; // 1 hour in seconds

/**
 * In-memory JWKS cache for the worker instance
 */
let cachedJWKS: jose.JSONWebKeySet | null = null;
let cachedJWKSExpiry: number = 0;

/**
 * Fetches JWKS from auth-svc with in-memory caching
 */
async function getJWKS(
	authServiceUrl: string,
	cacheTtl: number,
	authServiceBinding?: Fetcher,
	environment?: string,
): Promise<jose.JSONWebKeySet> {
	const now = Date.now();

	// Check in-memory cache
	if (cachedJWKS && cachedJWKSExpiry > now) {
		return cachedJWKS;
	}

	// Fetch from auth service
	const jwksUrl = `${authServiceUrl}/api/auth/jwks`;
	let response: Response;

	// Service bindings don't work reliably in local development
	const useServiceBinding = authServiceBinding && environment !== "local";

	if (useServiceBinding) {
		response = await authServiceBinding.fetch(
			new Request(jwksUrl, {
				headers: { Accept: "application/json" },
			}),
		);
	} else {
		response = await fetch(jwksUrl, {
			headers: { Accept: "application/json" },
			cf: {
				cacheTtl: 0,
				cacheEverything: false,
			},
		} as RequestInit);
	}

	if (!response.ok) {
		throw new Error(
			`Failed to fetch JWKS from ${jwksUrl}: ${response.status} ${response.statusText}`,
		);
	}

	const jwks = (await response.json()) as jose.JSONWebKeySet;

	// Validate JWKS structure
	if (!jwks.keys || !Array.isArray(jwks.keys) || jwks.keys.length === 0) {
		throw new Error("Invalid JWKS: no keys found");
	}

	// Update in-memory cache
	cachedJWKS = jwks;
	cachedJWKSExpiry = now + cacheTtl * 1000;

	return jwks;
}

/**
 * Verifies a JWT using JWKS from auth-svc
 */
export async function verifyToken(
	token: string,
	authServiceUrl: string,
	cacheTtl: number,
	authServiceBinding?: Fetcher,
	environment?: string,
): Promise<AuthTokenPayload> {
	const jwks = await getJWKS(
		authServiceUrl,
		cacheTtl,
		authServiceBinding,
		environment,
	);

	const jwksInstance = jose.createLocalJWKSet(jwks);
	const { payload } = await jose.jwtVerify(token, jwksInstance);

	if (!payload.sub) {
		throw new Error("Token missing required 'sub' claim");
	}

	return payload as AuthTokenPayload;
}

/**
 * Extracts Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
	if (!authHeader) {
		return null;
	}

	const parts = authHeader.split(" ");
	if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
		return null;
	}

	return parts[1];
}

/**
 * Authentication middleware that verifies JWTs signed by auth-svc
 */
export function authMiddleware(options?: {
	optional?: boolean;
	requireOrganization?: boolean;
}): MiddlewareHandler<{
	Bindings: Bindings;
	Variables: AuthVariables;
}> {
	const { optional = false, requireOrganization = false } = options ?? {};

	return async (c, next) => {
		const authHeader = c.req.header("Authorization");
		const token = extractBearerToken(authHeader);

		if (!token) {
			if (optional) {
				return next();
			}
			return c.json(
				{
					success: false,
					error: "Unauthorized",
					message: "Missing or invalid Authorization header",
				},
				401,
			);
		}

		const authServiceUrl = c.env.AUTH_SERVICE_URL;
		if (!authServiceUrl) {
			console.error("AUTH_SERVICE_URL is not configured");
			return c.json(
				{
					success: false,
					error: "Configuration Error",
					message: "Authentication service not configured",
				},
				500,
			);
		}

		const cacheTtl = c.env.AUTH_JWKS_CACHE_TTL
			? parseInt(c.env.AUTH_JWKS_CACHE_TTL, 10)
			: DEFAULT_JWKS_CACHE_TTL;

		const authServiceBinding = c.env.AUTH_SERVICE;

		try {
			const payload = await verifyToken(
				token,
				authServiceUrl,
				cacheTtl,
				authServiceBinding,
				c.env.ENVIRONMENT,
			);

			const user: AuthUser = {
				id: payload.sub,
				email: payload.email,
				name: payload.name,
			};

			const organization: AuthOrganization | null = payload.organizationId
				? { id: payload.organizationId }
				: null;

			c.set("user", user);
			c.set("organization", organization);
			c.set("token", token);
			c.set("tokenPayload", payload);

			if (requireOrganization && !organization) {
				return c.json(
					{
						success: false,
						error: "Organization Required",
						code: "ORGANIZATION_REQUIRED",
						message: "An active organization must be selected.",
					},
					409,
				);
			}

			return next();
		} catch (error) {
			if (error instanceof jose.errors.JWTExpired) {
				return c.json(
					{
						success: false,
						error: "Token Expired",
						message: "The authentication token has expired",
					},
					401,
				);
			}

			if (error instanceof jose.errors.JWTClaimValidationFailed) {
				return c.json(
					{
						success: false,
						error: "Invalid Token",
						message: "Token validation failed",
					},
					401,
				);
			}

			if (
				error instanceof jose.errors.JWSSignatureVerificationFailed ||
				error instanceof jose.errors.JWSInvalid
			) {
				return c.json(
					{
						success: false,
						error: "Invalid Signature",
						message: "Token signature verification failed",
					},
					401,
				);
			}

			console.error("Auth middleware error:", error);

			if (
				error instanceof Error &&
				error.message.includes("Failed to fetch JWKS")
			) {
				return c.json(
					{
						success: false,
						error: "Service Unavailable",
						message: "Authentication service temporarily unavailable",
					},
					503,
				);
			}

			return c.json(
				{
					success: false,
					error: "Unauthorized",
					message: "Invalid authentication token",
				},
				401,
			);
		}
	};
}

/**
 * Helper to get the authenticated user from context
 */
export function getAuthUser<T extends { Variables: Partial<AuthVariables> }>(
	c: Context<T>,
): AuthUser {
	const user = (c as unknown as Context<{ Variables: AuthVariables }>).get(
		"user",
	);
	if (!user) {
		throw new Error("User not authenticated");
	}
	return user;
}

/**
 * Helper to get the organization context from JWT
 */
export function getAuthOrganization<
	T extends { Variables: Partial<AuthVariables> },
>(c: Context<T>): AuthOrganization {
	const organization = (
		c as unknown as Context<{ Variables: AuthVariables }>
	).get("organization");
	if (!organization) {
		throw new Error(
			"Organization not set. User must select an active organization.",
		);
	}
	return organization;
}

/**
 * Helper to get the organization ID from context
 */
export function getOrganizationId<
	T extends { Variables: Partial<AuthVariables> },
>(c: Context<T>): string {
	return getAuthOrganization(c).id;
}

/**
 * Helper to get the user ID from context
 */
export function getUserId<T extends { Variables: Partial<AuthVariables> }>(
	c: Context<T>,
): string {
	return getAuthUser(c).id;
}

/**
 * Clears the in-memory JWKS cache
 */
export function clearJWKSCache(): void {
	cachedJWKS = null;
	cachedJWKSExpiry = 0;
}
