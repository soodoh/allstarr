import { readdir } from "node:fs/promises";
import { CoverageReport } from "monocart-coverage-reports";

export type CoverageInput = {
	label: string;
	path: string;
};

export type CoverageInputSummary = CoverageInput & {
	exists: boolean;
	fileCount: number;
};

export const coverageInputs: CoverageInput[] = [
	{ label: "unit/browser", path: "./coverage/unit/raw" },
	{ label: "e2e", path: "./coverage/e2e/raw" },
];

export const coverageThresholds = {
	lines: 80,
	statements: 75,
	functions: 75,
	branches: 45,
} as const;

type CoverageMetric = keyof typeof coverageThresholds;

type CoverageSummary = Partial<Record<CoverageMetric, { pct: number }>>;

export type ThresholdReportEntry = {
	metric: CoverageMetric;
	actual: number;
	threshold: number;
	passed: boolean;
};

function isNodeError(error: unknown): error is Error & { code?: string } {
	return error instanceof Error;
}

async function countFiles(path: string): Promise<number | undefined> {
	try {
		const entries = await readdir(path, {
			recursive: true,
			withFileTypes: true,
		});
		return entries.filter((entry) => entry.isFile()).length;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

export async function readCoverageInputSummaries(
	inputs: CoverageInput[],
): Promise<CoverageInputSummary[]> {
	return Promise.all(
		inputs.map(async (input) => {
			const fileCount = await countFiles(input.path);
			return {
				...input,
				exists: fileCount !== undefined,
				fileCount: fileCount ?? 0,
			};
		}),
	);
}

export function buildThresholdReport(
	summary: CoverageSummary,
	thresholds: typeof coverageThresholds,
): ThresholdReportEntry[] {
	return Object.entries(thresholds).map(([metric, threshold]) => {
		const coverageMetric = metric as CoverageMetric;
		const actual = summary[coverageMetric]?.pct ?? 0;
		return {
			metric: coverageMetric,
			actual,
			threshold,
			passed: actual >= threshold,
		};
	});
}

export function isThresholdReportPassing(report: ThresholdReportEntry[]): boolean {
	return report.every((entry) => entry.passed);
}

async function mergeCoverage(): Promise<void> {
	console.log("Coverage inputs:");
	for (const input of await readCoverageInputSummaries(coverageInputs)) {
		const status = input.exists ? `${input.fileCount} raw file(s)` : "missing";
		console.log(`  ${input.label}: ${input.path} (${status})`);
	}
	console.log("");
	console.log("Merging coverage from unit + e2e...\n");

	const mcr = new CoverageReport({
		inputDir: coverageInputs.map((input) => input.path),
		reports: ["v8", "console-summary", "html"],
		outputDir: "./coverage/merged",
	});

	const result = await mcr.generate();
	const report = buildThresholdReport(
		(result?.summary as CoverageSummary | undefined) ?? {},
		coverageThresholds,
	);

	console.log("\n--- Merged Coverage Thresholds ---");
	for (const entry of report) {
		const status = entry.passed ? "PASS" : "FAIL";
		console.log(
			`  ${entry.metric}: ${entry.actual.toFixed(2)}% (threshold: ${entry.threshold}%) [${status}]`,
		);
	}

	if (!isThresholdReportPassing(report)) {
		console.error("\nMerged coverage thresholds not met.");
		process.exit(1);
	}

	console.log("\nAll merged coverage thresholds passed.");
}

if (import.meta.main) {
	void mergeCoverage();
}
