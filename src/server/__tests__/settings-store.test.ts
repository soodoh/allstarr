import { describe, expect, it } from "vitest";
import { parseStoredSettingValue } from "../settings-value";

describe("parseStoredSettingValue", () => {
	it("unwraps JSON-stringified primitive values", () => {
		expect(parseStoredSettingValue('"viewer"', "requester")).toBe("viewer");
		expect(parseStoredSettingValue("true", false)).toBe(true);
		expect(parseStoredSettingValue("42", 0)).toBe(42);
	});

	it("returns the raw string when parsing fails", () => {
		expect(parseStoredSettingValue("plain-text", "")).toBe("plain-text");
	});

	it("returns the fallback for missing values", () => {
		expect(parseStoredSettingValue(undefined, "fallback")).toBe("fallback");
		expect(parseStoredSettingValue(null, "fallback")).toBe("fallback");
	});
});
