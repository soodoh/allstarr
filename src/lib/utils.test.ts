import { describe, expect, it } from "vitest";

import { cn, getCoverUrl, resizeTmdbUrl } from "./utils";

describe("utils", () => {
	it("merges class names with tailwind conflict resolution", () => {
		expect(cn("px-2", "text-sm", false && "hidden", "px-4")).toBe(
			"text-sm px-4",
		);
	});

	it("prefers the cover image url and falls back to the first image", () => {
		expect(
			getCoverUrl([
				{ coverType: "banner", url: "https://example.com/banner.jpg" },
				{ coverType: "cover", url: "https://example.com/cover.jpg" },
			]),
		).toBe("https://example.com/cover.jpg");

		expect(
			getCoverUrl([
				{ coverType: "banner", url: "https://example.com/banner.jpg" },
			]),
		).toBe("https://example.com/banner.jpg");
	});

	it("returns null when no image urls are available", () => {
		expect(getCoverUrl(undefined)).toBeNull();
		expect(getCoverUrl([])).toBeNull();
	});

	it("resizes tmdb urls and preserves null values", () => {
		expect(
			resizeTmdbUrl("https://image.tmdb.org/t/p/original/poster.jpg", "w500"),
		).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
		expect(resizeTmdbUrl(null, "w500")).toBeNull();
	});
});
