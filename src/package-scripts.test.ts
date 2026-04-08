import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("package scripts", () => {
	it("builds before running the e2e test command", () => {
		const script = packageJson.scripts["test:e2e"];
		const buildIndex = script.indexOf("bun run build");
		const playwrightIndex = script.indexOf("bunx playwright test");

		expect(buildIndex).toBeGreaterThanOrEqual(0);
		expect(buildIndex).toBeLessThan(playwrightIndex);
	});
});
