import { describe, expect, it } from "vitest";
import {
	buildThresholdReport,
	coverageThresholds,
	isThresholdReportPassing,
} from "./merge-coverage";

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
