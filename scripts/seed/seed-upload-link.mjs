#!/usr/bin/env node
/**
 * Seed Upload Links
 *
 * Generates synthetic upload link data for dev/preview environments.
 * This is SEED data (not real data) and should NOT run in production.
 */

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, unlinkSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function seedUploadLinks() {
	const isRemote = process.env.CI === "true" || process.env.REMOTE === "true";
	// Use WRANGLER_CONFIG if set, otherwise detect preview environment
	let configFile = process.env.WRANGLER_CONFIG;
	if (!configFile) {
		if (
			process.env.CF_PAGES_BRANCH ||
			(process.env.WORKERS_CI_BRANCH &&
				process.env.WORKERS_CI_BRANCH !== "main") ||
			process.env.PREVIEW === "true"
		) {
			configFile = "wrangler.preview.jsonc";
		}
	}
	const configFlag = configFile ? `--config ${configFile}` : "";

	try {
		console.log(
			`🌱 Seeding upload links (${isRemote ? "remote" : "local"})...`,
		);

		// Check if upload links already exist
		const checkSql = "SELECT COUNT(*) as count FROM upload_links;";
		const checkFile = join(
			__dirname,
			`temp-check-upload-links-${Date.now()}.sql`,
		);
		try {
			writeFileSync(checkFile, checkSql);
			const wranglerCmd =
				process.env.CI === "true" ? "pnpm wrangler" : "wrangler";
			const checkCommand = isRemote
				? `${wranglerCmd} d1 execute DB ${configFlag} --remote --file "${checkFile}"`
				: `${wranglerCmd} d1 execute DB ${configFlag} --local --file "${checkFile}"`;
			const checkOutput = execSync(checkCommand, { encoding: "utf-8" });
			// Parse the count from output (format may vary)
			const countMatch = checkOutput.match(/count\s*\|\s*(\d+)/i);
			if (countMatch && parseInt(countMatch[1], 10) > 0) {
				console.log(`⏭️  Upload links already exist. Skipping seed.`);
				return;
			}
		} catch {
			// If check fails, continue with seeding
			console.warn(
				"⚠️  Could not check existing upload links, proceeding with seed...",
			);
		} finally {
			try {
				unlinkSync(checkFile);
			} catch {
				// Ignore cleanup errors
			}
		}

		// Generate synthetic upload links for testing
		const seedSql = generateUploadLinksSeed();
		const seedFile = join(
			__dirname,
			`temp-seed-upload-links-${Date.now()}.sql`,
		);

		try {
			writeFileSync(seedFile, seedSql);
			const wranglerCmd =
				process.env.CI === "true" ? "pnpm wrangler" : "wrangler";
			const seedCommand = isRemote
				? `${wranglerCmd} d1 execute DB ${configFlag} --remote --file "${seedFile}"`
				: `${wranglerCmd} d1 execute DB ${configFlag} --local --file "${seedFile}"`;
			execSync(seedCommand, { stdio: "inherit" });
			console.log("✅ Upload link seeding completed");
		} finally {
			try {
				unlinkSync(seedFile);
			} catch {
				// Ignore cleanup errors
			}
		}
	} catch (error) {
		console.error("❌ Error seeding upload links:", error);
		throw error;
	}
}

/**
 * Generate SQL for seeding upload links
 */
function generateUploadLinksSeed() {
	const now = new Date();
	const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
	const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

	const nowISO = now.toISOString();
	const futureISO = future.toISOString();
	const pastISO = past.toISOString();

	// Seed organization and user IDs (these should match your test setup)
	const testOrgId = "org_test_123456789";
	const testUserId = "user_test_123456789";

	const uploadLinks = [
		{
			id: "UPL_seed_001",
			organizationId: testOrgId,
			createdBy: testUserId,
			expiresAt: futureISO,
			maxUploads: 10,
			requiredDocuments: JSON.stringify([
				{ type: "mx_ine_front", label: "INE Frontal" },
				{ type: "mx_ine_back", label: "INE Reverso" },
				{ type: "proof_of_address", label: "Comprobante de Domicilio" },
			]),
			uploadedCount: 2,
			status: "ACTIVE",
			allowMultipleFiles: true,
			metadata: JSON.stringify({
				client_id: "client_001",
				notes: "KYC documentation upload",
			}),
			createdAt: nowISO,
			updatedAt: nowISO,
		},
		{
			id: "UPL_seed_002",
			organizationId: testOrgId,
			createdBy: testUserId,
			expiresAt: futureISO,
			maxUploads: 5,
			requiredDocuments: JSON.stringify([
				{ type: "passport", label: "Passport" },
				{ type: "proof_of_income", label: "Proof of Income" },
			]),
			uploadedCount: 0,
			status: "ACTIVE",
			allowMultipleFiles: true,
			metadata: JSON.stringify({
				client_id: "client_002",
				notes: "Additional documentation",
			}),
			createdAt: nowISO,
			updatedAt: nowISO,
		},
		{
			id: "UPL_seed_003",
			organizationId: testOrgId,
			createdBy: testUserId,
			expiresAt: pastISO,
			maxUploads: 10,
			requiredDocuments: null,
			uploadedCount: 0,
			status: "EXPIRED",
			allowMultipleFiles: true,
			metadata: JSON.stringify({
				client_id: "client_003",
				notes: "Expired link - testing",
			}),
			createdAt: pastISO,
			updatedAt: pastISO,
		},
		{
			id: "UPL_seed_004",
			organizationId: testOrgId,
			createdBy: testUserId,
			expiresAt: futureISO,
			maxUploads: 3,
			requiredDocuments: null,
			uploadedCount: 3,
			status: "COMPLETED",
			allowMultipleFiles: false,
			metadata: JSON.stringify({
				client_id: "client_004",
				notes: "Completed upload link",
			}),
			createdAt: nowISO,
			updatedAt: nowISO,
		},
	];

	const insertStatements = uploadLinks
		.map(
			(link) => `
INSERT INTO upload_links (
  id, organization_id, created_by, expires_at, max_uploads,
  required_documents, uploaded_count, status, allow_multiple_files,
  metadata, created_at, updated_at
) VALUES (
  '${link.id}',
  '${link.organizationId}',
  '${link.createdBy}',
  '${link.expiresAt}',
  ${link.maxUploads},
  ${link.requiredDocuments ? `'${link.requiredDocuments.replace(/'/g, "''")}'` : "NULL"},
  ${link.uploadedCount},
  '${link.status}',
  ${link.allowMultipleFiles ? 1 : 0},
  '${link.metadata.replace(/'/g, "''")}',
  '${link.createdAt}',
  '${link.updatedAt}'
);`,
		)
		.join("\n");

	return `-- Seed Upload Links
-- Generated: ${nowISO}

BEGIN TRANSACTION;

${insertStatements}

COMMIT;
`;
}

// Export for use in all.mjs
export { seedUploadLinks };

// If run directly, execute seed
// Compare normalized paths for cross-platform compatibility
const isDirectRun =
	process.argv[1] && __filename.toLowerCase() === process.argv[1].toLowerCase();

if (isDirectRun) {
	seedUploadLinks().catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
}
