import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import tsconfigPaths from "vite-tsconfig-paths";

type CoverageMetric = "statements" | "branches" | "functions" | "lines";

type CoverageMetricSummary = {
	covered: number;
	total: number;
	pct: number | "";
};

type CoverageSummaryLike = Record<CoverageMetric, CoverageMetricSummary>;

type CoverageFileLike = {
	sourcePath: string;
	summary: CoverageSummaryLike;
};

export type CoverageResultsLike = {
	summary: CoverageSummaryLike;
	files: CoverageFileLike[];
};

export const globalCoverageThresholds: Record<CoverageMetric, number> = {
	statements: 90,
	branches: 85,
	functions: 90,
	lines: 90,
};

export const serverCoverageThresholds: Record<CoverageMetric, number> = {
	statements: 95,
	branches: 95,
	functions: 95,
	lines: 95,
};

const coverageMetrics: CoverageMetric[] = [
	"statements",
	"branches",
	"functions",
	"lines",
];

const normalizePath = (path: string) => path.replaceAll("\\", "/");

const toPercent = (covered: number, total: number) => {
	if (total === 0) {
		return 100;
	}

	return Number(((covered / total) * 100).toFixed(2));
};

const assertThresholds = (
	label: string,
	summary: CoverageSummaryLike,
	thresholds: Record<CoverageMetric, number>,
) => {
	const failures = coverageMetrics
		.map((metric) => {
			const actual = summary[metric].pct === "" ? 0 : summary[metric].pct;
			const required = thresholds[metric];

			if (actual >= required) {
				return null;
			}

			return `${label} ${metric}: expected >= ${required}%, got ${actual}%`;
		})
		.filter((failure): failure is string => Boolean(failure));

	if (failures.length > 0) {
		throw new Error(
			["Coverage threshold check failed:", ...failures].join("\n"),
		);
	}
};

export const aggregateCoverageSummary = (
	files: CoverageFileLike[],
): CoverageSummaryLike => {
	return coverageMetrics.reduce((acc, metric) => {
		const covered = files.reduce((sum, file) => {
			return sum + file.summary[metric].covered;
		}, 0);
		const total = files.reduce((sum, file) => {
			return sum + file.summary[metric].total;
		}, 0);

		acc[metric] = {
			covered,
			total,
			pct: toPercent(covered, total),
		};

		return acc;
	}, {} as CoverageSummaryLike);
};

export const enforceCoverageGates = (
	coverageResults: CoverageResultsLike | undefined,
) => {
	if (!coverageResults) {
		throw new Error("Coverage threshold check failed: missing coverage results");
	}

	assertThresholds("global", coverageResults.summary, globalCoverageThresholds);

	const serverFiles = coverageResults.files.filter((file) => {
		return normalizePath(file.sourcePath).includes("src/server/");
	});

	if (serverFiles.length === 0) {
		throw new Error(
			"Coverage threshold check failed: no files matched src/server/",
		);
	}

	const serverSummary = aggregateCoverageSummary(serverFiles);
	assertThresholds("src/server", serverSummary, serverCoverageThresholds);
};

const nodeTestInclude = [
	"**/*.test.ts",
	"**/*.test.tsx",
	"**/*.spec.ts",
	"**/*.spec.tsx",
];
const browserTestPatterns = [
	"**/*.browser.test.ts",
	"**/*.browser.test.tsx",
	"**/*.browser.spec.ts",
	"**/*.browser.spec.tsx",
];
const sharedProjectExclude = [
	"**/node_modules/**",
	"**/.worktrees/**",
	"**/worktrees/**",
];
const nodeTestExclude = [
	...sharedProjectExclude,
	"**/e2e/tests/**/*.spec.ts",
	...browserTestPatterns,
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
					exclude: sharedProjectExclude,
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
			coverageReportOptions: {
				onEnd: async (coverageResults: CoverageResultsLike | undefined) => {
					enforceCoverageGates(coverageResults);
				},
			},
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
					...serverCoverageThresholds,
				},
			},
		} as any,
	},
});
