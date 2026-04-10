import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("package scripts", () => {
	it("test:e2e:coverage builds with instrumentation before running e2e", () => {
		const script = packageJson.scripts["test:e2e:coverage"];
		const buildIndex = script.indexOf("INSTRUMENT_COVERAGE=true bun run build");
		const e2eIndex = script.indexOf("test:e2e");

		expect(buildIndex).toBeGreaterThanOrEqual(0);
		expect(buildIndex).toBeLessThan(e2eIndex);
	});

	it("does not expose a separate server-core coverage script", () => {
		expect(packageJson.scripts["test:coverage:server-core"]).toBeUndefined();
	});
});
