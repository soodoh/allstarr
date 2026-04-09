import { describe, expect, it, vi } from "vitest";

vi.mock("../tmdb/types", () => ({
	TMDB_IMAGE_BASE: "https://image.tmdb.org/t/p",
}));

import {
	generateSortTitle,
	mapMovieStatus,
	transformImagePath,
} from "./movie-helpers";

describe("mapMovieStatus", () => {
	it('maps "Rumored" to "tba"', () => {
		expect(mapMovieStatus("Rumored")).toBe("tba");
	});

	it('maps "Planned" to "tba"', () => {
		expect(mapMovieStatus("Planned")).toBe("tba");
	});

	it('maps "In Production" to "announced"', () => {
		expect(mapMovieStatus("In Production")).toBe("announced");
	});

	it('maps "Post Production" to "announced"', () => {
		expect(mapMovieStatus("Post Production")).toBe("announced");
	});

	it('maps "Released" to "released"', () => {
		expect(mapMovieStatus("Released")).toBe("released");
	});

	it('maps "Canceled" to "canceled"', () => {
		expect(mapMovieStatus("Canceled")).toBe("canceled");
	});

	it('defaults unknown statuses to "announced"', () => {
		expect(mapMovieStatus("SomeUnknownStatus")).toBe("announced");
	});

	it("defaults empty string to announced", () => {
		expect(mapMovieStatus("")).toBe("announced");
	});
});

describe("transformImagePath", () => {
	it("returns null when path is null", () => {
		expect(transformImagePath(null, "w500")).toBeNull();
	});

	it("prepends TMDB image base URL and size to path", () => {
		expect(transformImagePath("/abc123.jpg", "w500")).toBe(
			"https://image.tmdb.org/t/p/w500/abc123.jpg",
		);
	});

	it("works with different size values", () => {
		expect(transformImagePath("/poster.jpg", "original")).toBe(
			"https://image.tmdb.org/t/p/original/poster.jpg",
		);
	});
});

describe("generateSortTitle", () => {
	it('strips leading "The " from title', () => {
		expect(generateSortTitle("The Matrix")).toBe("Matrix");
	});

	it('strips leading "A " from title', () => {
		expect(generateSortTitle("A Quiet Place")).toBe("Quiet Place");
	});

	it('strips leading "An " from title', () => {
		expect(generateSortTitle("An Officer and a Gentleman")).toBe(
			"Officer and a Gentleman",
		);
	});

	it("is case-insensitive", () => {
		expect(generateSortTitle("the godfather")).toBe("godfather");
		expect(generateSortTitle("THE SHINING")).toBe("SHINING");
		expect(generateSortTitle("a Beautiful Mind")).toBe("Beautiful Mind");
		expect(generateSortTitle("an Education")).toBe("Education");
	});

	it("returns title unchanged when no leading article", () => {
		expect(generateSortTitle("Inception")).toBe("Inception");
	});

	it("does not strip articles that are not at the start", () => {
		expect(generateSortTitle("Into The Wild")).toBe("Into The Wild");
	});

	it("does not strip partial article matches", () => {
		expect(generateSortTitle("Theodore Goes Wild")).toBe("Theodore Goes Wild");
		expect(generateSortTitle("Anatomy of a Murder")).toBe(
			"Anatomy of a Murder",
		);
	});
});
