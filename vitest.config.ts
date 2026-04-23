import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		setupFiles: ["src/test/setup.ts"],
		projects: [
			{
				extends: true,
				test: {
					include: ["src/**/*.test.{ts,tsx}", "e2e/fixtures/**/*.test.ts"],
					exclude: [
						"**/node_modules/**",
						"**/.worktrees/**",
						"**/worktrees/**",
						"src/**/*.browser.test.{ts,tsx}",
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
					include: ["src/**/*.browser.test.{ts,tsx}"],
					exclude: [
						"**/node_modules/**",
						"**/.worktrees/**",
						"**/worktrees/**",
					],
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
			include: ["src/**/*.{ts,tsx}", "e2e/fixtures/**/*.ts"],
			exclude: [
				"**/*.test.*",
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
			],
		},
	},
});
