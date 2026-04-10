import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
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
				resolve: {
					alias: {
						"@tanstack/react-start/server": new URL(
							"./src/test/empty-module.ts",
							import.meta.url,
						).pathname,
						"@tanstack/react-start-server": new URL(
							"./src/test/empty-module.ts",
							import.meta.url,
						).pathname,
						"@tanstack/start-server-core": new URL(
							"./src/test/empty-module.ts",
							import.meta.url,
						).pathname,
					},
				},
				optimizeDeps: {
					include: [
						"react",
						"react/jsx-dev-runtime",
						"react-dom",
						"react-dom/client",
						"react-dom/server",
						"@tanstack/react-query",
						"@tanstack/react-router",
						"vitest-browser-react",
						"clsx",
						"tailwind-merge",
						"class-variance-authority",
						"lucide-react",
						"radix-ui",
						"sonner",
						"better-auth/client/plugins",
						"better-auth/react",
					],
					exclude: [
						"@tanstack/react-start",
						"@tanstack/react-start/server",
						"@tanstack/react-start-server",
						"@tanstack/start-server-core",
					],
				},
				test: {
					include: frontendTestInclude,
					exclude: frontendTestExclude,
					browser: {
						enabled: true,
            headless: true,
						provider: playwright(),
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
		coverage: {
			provider: "custom",
			customProviderModule: "vitest-monocart-coverage/browser",
			all: true,
			include: fullRepoCoverageInclude,
			exclude: coverageExclude,
			reports: ["v8", "console-summary", "html", "raw"],
			outputDir: "coverage/unit",
			thresholds: {
				statements: 90,
				branches: 85,
				functions: 90,
				lines: 90,
			},
		} as any,
	},
});
