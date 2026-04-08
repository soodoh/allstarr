import { defineConfig } from "vitest/config";
import baseConfig, { coverageExclude } from "./vitest.config";
import { serverCoreCoverageAllowlist } from "./vitest.server-core.allowlist";

export default defineConfig({
	...baseConfig,
	test: {
		...(baseConfig.test ?? {}),
		coverage: {
			provider: "v8",
			all: true,
			include: [...serverCoreCoverageAllowlist],
			exclude: [...coverageExclude, "src/db/schema/**"],
			reporter: ["text", "json-summary"],
			reportsDirectory: "coverage/server-core",
			thresholds: {
				statements: 95,
				branches: 95,
				functions: 95,
				lines: 95,
			},
		} as any,
	},
});
