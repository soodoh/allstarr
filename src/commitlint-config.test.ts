import { describe, expect, it } from "vitest";
import commitlintConfig from "../commitlint.config";

describe("commitlint config", () => {
	it("requires commit scopes instead of rejecting them", () => {
		expect(commitlintConfig.rules?.["scope-empty"]).toEqual([2, "never"]);
	});
});
