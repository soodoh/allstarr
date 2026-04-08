import { describe, expect, it } from "vitest";
import { parseStoredSettingValue } from "./settings-value";

describe("parseStoredSettingValue", () => {
	it("returns the fallback for nullish values", () => {
		expect(parseStoredSettingValue(undefined, true)).toBe(true);
		expect(parseStoredSettingValue(null, "fallback")).toBe("fallback");
	});

	it("parses JSON strings when possible", () => {
		expect(
			parseStoredSettingValue('{"enabled":true}', { enabled: false }),
		).toEqual({
			enabled: true,
		});
	});

	it("returns non-string values unchanged", () => {
		expect(parseStoredSettingValue(42, 0)).toBe(42);
	});

	it("returns malformed strings as-is", () => {
		expect(parseStoredSettingValue("not-json", "fallback")).toBe("not-json");
	});
});
