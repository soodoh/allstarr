import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("package scripts", () => {
	it("runs coverage through Vitest only", () => {
		expect(packageJson.scripts["test:coverage"]).toBe("vitest run --coverage");
	});

	it("does not expose Playwright or merged coverage scripts", () => {
		expect(Object.hasOwn(packageJson.scripts, "test:e2e:coverage")).toBe(false);
		expect(Object.hasOwn(packageJson.scripts, "test:coverage:merged")).toBe(
			false,
		);
		expect(Object.hasOwn(packageJson.scripts, "test:coverage:full")).toBe(
			false,
		);
	});
});
