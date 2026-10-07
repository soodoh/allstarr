import { describe, expect, it } from "vitest";
import {
	getProfileWeight,
	isFormatInProfile,
} from "./download-profile-quality";

// ─── getProfileWeight ───────────────────────────────────────────────────────

describe("getProfileWeight", () => {
	it("returns highest weight for first group", () => {
		const items = [[1, 2], [3], [4, 5]];
		expect(getProfileWeight(1, items)).toBe(3);
		expect(getProfileWeight(2, items)).toBe(3);
	});

	it("returns decreasing weight for later groups", () => {
		const items = [[1], [2], [3]];
		expect(getProfileWeight(1, items)).toBe(3);
		expect(getProfileWeight(2, items)).toBe(2);
		expect(getProfileWeight(3, items)).toBe(1);
	});

	it("returns 0 for a format not in any group", () => {
		const items = [[1], [2]];
		expect(getProfileWeight(99, items)).toBe(0);
	});

	it("returns 0 for empty items array", () => {
		expect(getProfileWeight(1, [])).toBe(0);
	});
});

// ─── isFormatInProfile ──────────────────────────────────────────────────────

describe("isFormatInProfile", () => {
	it("returns true when qualityId is in any group", () => {
		expect(
			isFormatInProfile(3, [
				[1, 2],
				[3, 4],
			]),
		).toBe(true);
	});

	it("returns false when qualityId is absent", () => {
		expect(
			isFormatInProfile(99, [
				[1, 2],
				[3, 4],
			]),
		).toBe(false);
	});

	it("returns false for an empty items array", () => {
		expect(isFormatInProfile(1, [])).toBe(false);
	});
});
