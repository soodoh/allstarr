import { describe, expect, it } from "vitest";
import config from "../vitest.config";

type ProjectConfig = {
	test?: {
		include?: string[];
		exclude?: string[];
	};
};

const getProjectConfigs = () => {
	const projects = config.test?.projects ?? [];

	return projects.filter((project): project is ProjectConfig => {
		return typeof project !== "string";
	});
};

describe("vitest config", () => {
	it("routes node and browser tests by suffix", () => {
		const projects = config.test?.projects ?? [];
		const projectConfigs = getProjectConfigs();
		const nodeProject = projectConfigs[0];
		const browserProject = projectConfigs[1];

		expect(projects).toHaveLength(2);
		expect(projectConfigs).toHaveLength(2);
		expect(nodeProject?.test?.include).toEqual([
			"**/*.test.ts",
			"**/*.test.tsx",
			"**/*.spec.ts",
			"**/*.spec.tsx",
		]);
		expect(nodeProject?.test?.exclude).toEqual([
			"**/node_modules/**",
			"**/e2e/tests/**/*.spec.ts",
			"**/*.browser.test.ts",
			"**/*.browser.test.tsx",
			"**/*.browser.spec.ts",
			"**/*.browser.spec.tsx",
		]);
		expect(browserProject?.test?.include).toEqual([
			"**/*.browser.test.ts",
			"**/*.browser.test.tsx",
			"**/*.browser.spec.ts",
			"**/*.browser.spec.tsx",
		]);
	});

	it("keeps node_modules out of project discovery", () => {
		const projectConfigs = getProjectConfigs();
		const nodeExclude = projectConfigs[0]?.test?.exclude;

		expect(nodeExclude).toContain("**/node_modules/**");
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
