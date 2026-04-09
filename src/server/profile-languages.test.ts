import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	all: vi.fn(),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				all: mocks.all,
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	downloadProfiles: { language: "downloadProfiles.language" },
}));

import getProfileLanguages from "./profile-languages";

describe("getProfileLanguages", () => {
	it("returns deduplicated language codes", () => {
		mocks.all.mockReturnValue([
			{ language: "en" },
			{ language: "ja" },
			{ language: "en" },
			{ language: "fr" },
			{ language: "ja" },
		]);

		const result = getProfileLanguages();

		expect(result).toEqual(["en", "ja", "fr"]);
	});

	it("returns empty array when no profiles exist", () => {
		mocks.all.mockReturnValue([]);

		const result = getProfileLanguages();

		expect(result).toEqual([]);
	});

	it("handles all duplicate language codes", () => {
		mocks.all.mockReturnValue([
			{ language: "de" },
			{ language: "de" },
			{ language: "de" },
		]);

		const result = getProfileLanguages();

		expect(result).toEqual(["de"]);
	});
});
