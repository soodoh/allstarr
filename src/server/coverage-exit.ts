import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

if (process.env.INSTRUMENT_COVERAGE === "true") {
	const coveragePath = resolve(
		process.cwd(),
		"coverage/e2e/raw/server-istanbul.json",
	);

	const writeCoverage = () => {
		const coverage = (globalThis as { __coverage__?: unknown }).__coverage__;
		if (coverage) {
			mkdirSync(dirname(coveragePath), { recursive: true });
			writeFileSync(coveragePath, JSON.stringify(coverage));
		}
	};

	process.on("SIGTERM", () => {
		writeCoverage();
		process.exit(0);
	});

	process.on("SIGINT", () => {
		writeCoverage();
		process.exit(0);
	});
}
