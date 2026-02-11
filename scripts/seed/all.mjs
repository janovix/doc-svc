#!/usr/bin/env node
/**
 * Seed All Models
 *
 * Master script that runs all seed scripts to generate synthetic data
 * for dev/preview environments.
 *
 * Note: Seeds are NOT run in production.
 */

import { readdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine if we're running locally or remotely
const isRemote = process.env.CI === "true" || process.env.REMOTE === "true";

// Determine config file based on environment
function getConfigFile() {
	// Check if config is explicitly set (this takes precedence)
	if (process.env.WRANGLER_CONFIG) {
		return process.env.WRANGLER_CONFIG;
	}
	// Check if we're in preview environment
	if (
		process.env.CF_PAGES_BRANCH ||
		(process.env.WORKERS_CI_BRANCH &&
			process.env.WORKERS_CI_BRANCH !== "main") ||
		process.env.PREVIEW === "true"
	) {
		return "wrangler.preview.jsonc";
	}
	return "";
}

async function seedAll() {
	console.log(
		`🌱 Starting seed scripts (${isRemote ? "remote" : "local"})...\n`,
	);

	// Get all seed scripts (excluding validate.mjs and all.mjs)
	const files = await readdir(__dirname);
	const seedScripts = files
		.filter(
			(file) =>
				file.endsWith(".mjs") && file !== "validate.mjs" && file !== "all.mjs",
		)
		.sort();

	if (seedScripts.length === 0) {
		console.log("⚠️  No seed scripts found.");
		console.log("Run 'pnpm seed:validate' to check requirements.\n");
		return;
	}

	console.log(`Found ${seedScripts.length} seed script(s):\n`);

	const configFile = getConfigFile();
	const env = { ...process.env };
	if (configFile) {
		env.WRANGLER_CONFIG = configFile;
	}

	// Determine if we're in a Cloudflare Workers environment (preview or dev)
	// We want to seed in preview and dev, but skip in production
	const isPreviewEnvironment =
		process.env.CF_PAGES_BRANCH ||
		(process.env.WORKERS_CI_BRANCH &&
			process.env.WORKERS_CI_BRANCH !== "main") ||
		process.env.PREVIEW === "true";
	const isDevEnvironment =
		process.env.ENVIRONMENT === "dev" ||
		process.env.WRANGLER_CONFIG === "wrangler.jsonc";
	const isProduction =
		process.env.NODE_ENV === "production" &&
		!isPreviewEnvironment &&
		!isDevEnvironment;

	// Skip seeding only in production, allow it in preview and dev
	if (isProduction) {
		console.log("⏭️  Skipping seeding in production environment.");
		process.exit(0);
	}

	// Run each seed script directly (they handle their own database access via wrangler d1 execute)
	for (const script of seedScripts) {
		const scriptPath = join(__dirname, script);
		console.log(`Running ${script}...`);
		try {
			execSync(`node "${scriptPath}"`, {
				stdio: "inherit",
				env,
			});
			console.log(`✅ ${script} completed\n`);
		} catch (error) {
			console.error(`❌ Failed to run ${script}:`, error);
			process.exit(1);
		}
	}

	console.log("✅ All seed scripts completed successfully!");
}

seedAll().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
