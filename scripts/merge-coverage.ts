import { CoverageReport } from "monocart-coverage-reports";

const thresholds: Record<string, number> = {
	lines: 100,
	statements: 100,
	functions: 100,
	branches: 95,
};

async function mergeCoverage(): Promise<void> {
	console.log("Merging coverage from unit + e2e...\n");

	const mcr = new CoverageReport({
		inputDir: ["./coverage/unit/raw", "./coverage/e2e/raw"],
		reports: ["v8", "console-summary", "html"],
		outputDir: "./coverage/merged",
	});

	const result = await mcr.generate();
	const summary = result.summary as Record<
		string,
		{ pct: number } | undefined
	>;

	console.log("\n--- Merged Coverage Thresholds ---");
	let failed = false;
	for (const [metric, threshold] of Object.entries(thresholds)) {
		const actual = summary[metric]?.pct ?? 0;
		const status = actual >= threshold ? "PASS" : "FAIL";
		console.log(
			`  ${metric}: ${actual.toFixed(2)}% (threshold: ${threshold}%) [${status}]`,
		);
		if (actual < threshold) {
			failed = true;
		}
	}

	if (failed) {
		console.error("\nMerged coverage thresholds not met.");
		process.exit(1);
	}

	console.log("\nAll merged coverage thresholds passed.");
}

mergeCoverage();
