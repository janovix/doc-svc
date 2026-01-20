import path from "node:path";
import {
	defineWorkersConfig,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

const migrationsPath = path.join(__dirname, "..", "migrations");
const migrations = await readD1Migrations(migrationsPath);

export default defineWorkersConfig({
	esbuild: {
		target: "esnext",
	},
	// Required for modules that fail to import in Workers runtime on Windows
	// See: https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#module-resolution
	ssr: {
		// Force Vite to bundle these instead of externalizing
		noExternal: [
			"zod",
			"ky",
			"@prisma/adapter-d1",
			"chanfana",
			"@asteasolutions/zod-to-openapi",
		],
	},
	test: {
		coverage: {
			provider: "istanbul",
			reporter: ["text", "lcov"],
			all: true,
			include: ["src/**/*.ts"],
			exclude: [
				"**/*.d.ts",
				"**/node_modules/**",
				"**/tests/**",
				"**/dist/**",
				"**/coverage/**",
			],
			thresholds: {
				// Temporarily lowered - add tests as features are built
				lines: 0,
				functions: 0,
				branches: 0,
				statements: 0,
			},
		},
		setupFiles: ["./tests/apply-migrations.ts"],
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: {
					// Use test-specific config without service bindings
					configPath: "../wrangler.test.jsonc",
				},
				miniflare: {
					compatibilityFlags: ["experimental", "nodejs_compat"],
					bindings: {
						MIGRATIONS: migrations,
					},
				},
			},
		},
	},
});
