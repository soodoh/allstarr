import { describe, expect, it } from "vitest";
import {
	enforceCoverageGates,
	globalCoverageThresholds,
	serverCoverageThresholds,
	type CoverageResultsLike,
} from "../vitest.config";
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

const createSummaryMetric = (pct: number, total = 100) => {
	return {
		covered: Math.round((pct / 100) * total),
		total,
		pct,
	};
};

const createSummary = (
	statements: number,
	branches: number,
	functions: number,
	lines: number,
) => {
	return {
		statements: createSummaryMetric(statements),
		branches: createSummaryMetric(branches),
		functions: createSummaryMetric(functions),
		lines: createSummaryMetric(lines),
	};
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
			...globalCoverageThresholds,
			"src/server/**/*.{ts,tsx}": {
				...serverCoverageThresholds,
			},
		});
	});

	it("enforces coverage gates when thresholds are met", () => {
		const results: CoverageResultsLike = {
			summary: createSummary(91, 86, 91, 91),
			files: [
				{
					sourcePath: "src/server/alpha.ts",
					summary: createSummary(96, 95, 95, 96),
				},
				{
					sourcePath: "src/server/beta.ts",
					summary: createSummary(95, 96, 96, 95),
				},
				{
					sourcePath: "src/lib/other.ts",
					summary: createSummary(90, 85, 90, 90),
				},
			],
		};

		expect(() => enforceCoverageGates(results)).not.toThrow();
	});

	it("fails when aggregated src/server coverage drops below threshold", () => {
		const results: CoverageResultsLike = {
			summary: createSummary(91, 86, 91, 91),
			files: [
				{
					sourcePath: "src/server/alpha.ts",
					summary: createSummary(94, 96, 96, 96),
				},
				{
					sourcePath: "src/server/beta.ts",
					summary: createSummary(94, 96, 96, 96),
				},
			],
		};

		expect(() => enforceCoverageGates(results)).toThrow(/src\/server statements/);
	});
});
