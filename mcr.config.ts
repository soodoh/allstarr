import type { CoverageReportOptions } from "monocart-coverage-reports";

const config: CoverageReportOptions = {
	name: "Allstarr Unit Coverage",
	outputDir: "coverage/unit",
	reports: ["v8", "console-summary", "html", "raw"],
};

export default config;
