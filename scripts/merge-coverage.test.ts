import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildThresholdReport,
	coverageThresholds,
	isThresholdReportPassing,
	readCoverageInputSummaries,
} from "./merge-coverage";

let tempDir: string | undefined;

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

describe("merge coverage threshold reporting", () => {
	it("marks every metric with pass/fail status", () => {
		const report = buildThresholdReport(
			{
				lines: { pct: 81.23 },
				statements: { pct: 74.5 },
				functions: { pct: 75 },
				branches: { pct: 44.99 },
			},
			coverageThresholds,
		);

		expect(report).toEqual([
			{ metric: "lines", actual: 81.23, threshold: 80, passed: true },
			{ metric: "statements", actual: 74.5, threshold: 75, passed: false },
			{ metric: "functions", actual: 75, threshold: 75, passed: true },
			{ metric: "branches", actual: 44.99, threshold: 45, passed: false },
		]);
		expect(isThresholdReportPassing(report)).toBe(false);
	});

	it("treats missing summary metrics as zero", () => {
		const report = buildThresholdReport({}, coverageThresholds);

		expect(report.map((entry) => entry.actual)).toEqual([0, 0, 0, 0]);
		expect(isThresholdReportPassing(report)).toBe(false);
	});
});

describe("coverage input summaries", () => {
	it("summarizes coverage input directories", async () => {
		tempDir = await mkdtemp(join(tmpdir(), "coverage-inputs-"));
		const unitRaw = join(tempDir, "unit", "raw");
		const e2eRaw = join(tempDir, "e2e", "raw");
		await mkdir(unitRaw, { recursive: true });
		await mkdir(e2eRaw, { recursive: true });
		await writeFile(join(unitRaw, "unit.json"), "{}");
		await writeFile(join(e2eRaw, "server.json"), "{}");
		await writeFile(join(e2eRaw, "browser.json"), "{}");

		await expect(
			readCoverageInputSummaries([
				{ label: "unit/browser", path: unitRaw },
				{ label: "e2e", path: e2eRaw },
			]),
		).resolves.toEqual([
			{ label: "unit/browser", path: unitRaw, exists: true, fileCount: 1 },
			{ label: "e2e", path: e2eRaw, exists: true, fileCount: 2 },
		]);
	});

	it("reports missing coverage input directories", async () => {
		tempDir = await mkdtemp(join(tmpdir(), "coverage-inputs-"));
		const missingRaw = join(tempDir, "missing", "raw");

		await expect(
			readCoverageInputSummaries([{ label: "e2e", path: missingRaw }]),
		).resolves.toEqual([
			{ label: "e2e", path: missingRaw, exists: false, fileCount: 0 },
		]);
	});
});
