import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import tsconfigPaths from "vite-tsconfig-paths";

const nodeTestInclude = ["**/*.test.ts", "**/*.test.tsx"];
const browserTestPatterns = ["**/*.browser.test.ts", "**/*.browser.test.tsx"];
const nodeTestExclude = ["**/node_modules/**", ...browserTestPatterns];

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
					exclude: nodeTestExclude,
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
					include: browserTestPatterns,
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
			include: ["src/**/*.{ts,tsx}", "e2e/fixtures/**/*.ts"],
			exclude: coverageExclude,
			reports: ["v8", "console-summary", "html", "raw"],
			outputDir: "coverage/unit",
			thresholds: {
				statements: 90,
				branches: 85,
				functions: 90,
				lines: 90,
				"src/server/**/*.{ts,tsx}": {
					statements: 95,
					branches: 95,
					functions: 95,
					lines: 95,
				},
			},
		} as any,
	},
});
