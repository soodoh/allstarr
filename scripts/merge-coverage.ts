import { CoverageReport } from "monocart-coverage-reports";

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
	console.log("Merging coverage from unit + e2e...\n");

	const mcr = new CoverageReport({
		inputDir: ["./coverage/unit/raw", "./coverage/e2e/raw"],
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
