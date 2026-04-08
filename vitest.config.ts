import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export const nodeTestInclude = [
	"src/**/*.test.ts",
	"src/**/*.spec.ts",
	"e2e/fixtures/**/*.test.ts",
	"e2e/fixtures/**/*.spec.ts",
];

export const frontendTestInclude = [
	"src/hooks/**/*.test.ts",
	"src/hooks/**/*.spec.ts",
	"src/components/**/*.test.tsx",
	"src/components/**/*.spec.tsx",
];

export const testInclude = [...nodeTestInclude, ...frontendTestInclude];

export const fullRepoCoverageInclude = [
	"src/**/*.{ts,tsx}",
	"e2e/fixtures/**/*.ts",
];

export const coverageExclude = [
	"**/*.test.*",
	"**/*.spec.*",
	"src/routeTree.gen.ts",
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
						"src/hooks/**/*.test.ts",
						"src/hooks/**/*.spec.ts",
						"src/components/**/*.test.tsx",
						"src/components/**/*.spec.tsx",
					],
				},
			},
			{
				extends: true,
				test: {
					include: frontendTestInclude,
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
