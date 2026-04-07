import { describe, expect, it } from "vitest";
import { detectServerRuntime } from "./runtime";

describe("detectServerRuntime", () => {
	it("returns true when the SSR flag is enabled", () => {
		expect(detectServerRuntime({ SSR: true }, true)).toBe(true);
	});

	it("returns true when SSR is unavailable but window is absent", () => {
		expect(detectServerRuntime(undefined, false)).toBe(true);
	});

	it("returns false in the browser when SSR is not enabled", () => {
		expect(detectServerRuntime({ SSR: false }, true)).toBe(false);
	});
});
