import { describe, expect, it } from "vitest";
import config from "../vitest.config";

describe("vitest config", () => {
	it("routes node and browser tests by suffix", () => {
		const projects = config.test?.projects;

		expect(projects).toHaveLength(2);
		expect(projects?.[0]?.test?.include).toEqual(["**/*.test.ts", "**/*.test.tsx"]);
		expect(projects?.[0]?.test?.exclude).toEqual([
			"**/*.browser.test.ts",
			"**/*.browser.test.tsx",
		]);
		expect(projects?.[1]?.test?.include).toEqual([
			"**/*.browser.test.ts",
			"**/*.browser.test.tsx",
		]);
	});

	it("keeps stricter coverage thresholds for server source files", () => {
		expect(config.test?.coverage?.thresholds).toMatchObject({
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
		});
	});
});
