/**
 * Prisma Client for D1 Database
 * Provides singleton instance of PrismaClient with D1 adapter
 */

import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

/**
 * Get or create a Prisma client instance for the given D1 database
 * Note: In Workers, we create a new client per request due to the stateless nature
 */
export function getPrismaClient(db: D1Database): PrismaClient {
	const adapter = new PrismaD1(db);
	return new PrismaClient({ adapter });
}

/**
 * Type-safe wrapper for getting Prisma client from context
 */
export function getPrisma(db: D1Database): PrismaClient {
	return getPrismaClient(db);
}
