import { describe, expect, it } from "vitest";
import { AUTHOR_ROLE_FILTER, NON_AUTHOR_ROLES } from "./constants";

describe("NON_AUTHOR_ROLES", () => {
	it("should be a Set", () => {
		expect(NON_AUTHOR_ROLES).toBeInstanceOf(Set);
	});

	it("should contain editorial roles", () => {
		expect(NON_AUTHOR_ROLES.has("Editor")).toBe(true);
		expect(NON_AUTHOR_ROLES.has("Series Editor")).toBe(true);
	});

	it("should contain translation roles", () => {
		expect(NON_AUTHOR_ROLES.has("Translator")).toBe(true);
		expect(NON_AUTHOR_ROLES.has("Adapted by")).toBe(true);
	});

	it("should contain art/production roles", () => {
		expect(NON_AUTHOR_ROLES.has("Illustrator")).toBe(true);
		expect(NON_AUTHOR_ROLES.has("Cover artist")).toBe(true);
		expect(NON_AUTHOR_ROLES.has("Photographer")).toBe(true);
	});

	it("should contain audio roles", () => {
		expect(NON_AUTHOR_ROLES.has("Narrator")).toBe(true);
		expect(NON_AUTHOR_ROLES.has("Reader")).toBe(true);
	});

	it("should contain supplementary content roles", () => {
		expect(NON_AUTHOR_ROLES.has("Introduction")).toBe(true);
		expect(NON_AUTHOR_ROLES.has("Foreword")).toBe(true);
		expect(NON_AUTHOR_ROLES.has("Afterword")).toBe(true);
	});

	it("should contain other non-originating roles", () => {
		expect(NON_AUTHOR_ROLES.has("Compiler")).toBe(true);
		expect(NON_AUTHOR_ROLES.has("Pseudonym")).toBe(true);
	});

	it("should not contain author-like roles", () => {
		expect(NON_AUTHOR_ROLES.has("Author")).toBe(false);
		expect(NON_AUTHOR_ROLES.has("Writer")).toBe(false);
	});
});

describe("AUTHOR_ROLE_FILTER", () => {
	it("should be a non-empty string", () => {
		expect(typeof AUTHOR_ROLE_FILTER).toBe("string");
		expect(AUTHOR_ROLE_FILTER.length).toBeGreaterThan(0);
	});

	it("should include the null check for primary authors", () => {
		expect(AUTHOR_ROLE_FILTER).toContain("contribution: { _is_null: true }");
	});

	it("should include the _nin filter", () => {
		expect(AUTHOR_ROLE_FILTER).toContain("_nin:");
	});

	it("should contain all NON_AUTHOR_ROLES as JSON-encoded strings", () => {
		for (const role of NON_AUTHOR_ROLES) {
			expect(AUTHOR_ROLE_FILTER).toContain(JSON.stringify(role));
		}
	});

	it("should use _or to combine conditions", () => {
		expect(AUTHOR_ROLE_FILTER).toMatch(/^_or:\s*\[/);
	});
});
