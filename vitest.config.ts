import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export const nodeTestInclude = [
	"src/**/*.test.ts",
	"src/**/*.spec.ts",
	"src/server/**/*.test.tsx",
	"src/server/**/*.spec.tsx",
	"e2e/fixtures/**/*.test.ts",
	"e2e/fixtures/**/*.spec.ts",
];

export const frontendTestInclude = [
	"src/**/*.test.tsx",
	"src/**/*.spec.tsx",
	"src/components/**/*.test.ts",
	"src/components/**/*.spec.ts",
	"src/hooks/**/*.test.ts",
	"src/hooks/**/*.spec.ts",
];

export const frontendTestExclude = [
	"src/server/**/*.test.tsx",
	"src/server/**/*.spec.tsx",
];

export const testInclude = [
	"src/**/*.test.ts",
	"src/**/*.spec.ts",
	"src/**/*.test.tsx",
	"src/**/*.spec.tsx",
	"e2e/fixtures/**/*.test.ts",
	"e2e/fixtures/**/*.spec.ts",
];

export const fullRepoCoverageInclude = [
	"src/**/*.{ts,tsx}",
	"e2e/fixtures/**/*.ts",
];

export const coverageExclude = [
	"**/*.test.*",
	"**/*.spec.*",
	"src/routeTree.gen.ts",
	"src/db/index.ts",
	"src/db/schema/**",
	"e2e/fixtures/**",
	"**/types.ts",
	"src/lib/auth-client.ts",
	"src/lib/query-client.ts",
	"src/lib/auth.ts",
	"src/lib/queries/index.ts",
	"src/hooks/mutations/index.ts",
	"src/lib/custom-format-preset-data.ts",
	"src/lib/tmdb-validators.ts",
	"src/test/**",
];

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		setupFiles: ["src/test/setup.ts"],
		projects: [
			{
				extends: true,
				test: {
					include: nodeTestInclude,
					exclude: [
						"src/components/**/*.test.ts",
						"src/components/**/*.spec.ts",
						"src/hooks/**/*.test.ts",
						"src/hooks/**/*.spec.ts",
					],
				},
			},
			{
				extends: true,
				test: {
					include: frontendTestInclude,
					exclude: frontendTestExclude,
					environment: "jsdom",
				},
			},
		],
		coverage: {
			provider: "v8",
			all: true,
			include: fullRepoCoverageInclude,
			exclude: coverageExclude,
			reporter: ["text", "json-summary", "html"],
			reportsDirectory: "coverage",
		} as any,
	},
});
