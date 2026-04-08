import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

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
];

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		include: testInclude,
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
