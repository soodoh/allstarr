import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	selectAll: vi.fn(),
	detectReleaseType: vi.fn(),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				all: mocks.selectAll,
			})),
		})),
	},
}));
vi.mock("src/db/schema", () => ({
	downloadFormats: {},
	settings: {},
}));
vi.mock("src/lib/format-size-calc", () => ({
	computeEffectiveSizes: vi.fn(
		(_mode, min, max, _noMax, _edition, _defaults) => ({
			minSize: min,
			maxSize: max,
		}),
	),
	sizeMode: vi.fn(() => "ebook"),
}));
vi.mock("./release-type-parser", () => ({
	default: mocks.detectReleaseType,
}));

import {
	enrichRelease,
	getDefSizeLimits,
	getFormatType,
	getProfileWeight,
	invalidateFormatDefCache,
	isFormatInProfile,
	matchAllFormats,
	matchFormat,
	parseReleaseGroup,
} from "./format-parser";

beforeEach(() => {
	vi.clearAllMocks();
	invalidateFormatDefCache();
});

// ─── parseReleaseGroup ──────────────────────────────────────────────────────

describe("parseReleaseGroup", () => {
	it("extracts a trailing release group after a hyphen", () => {
		expect(parseReleaseGroup("Some.Book.Title-GROUP")).toBe("GROUP");
	});

	it("returns null when there is no trailing group", () => {
		expect(parseReleaseGroup("Some Book Title")).toBeNull();
	});

	it("returns null for a title ending with a hyphen but no group", () => {
		expect(parseReleaseGroup("Some Book Title-")).toBeNull();
	});

	it("handles underscores and digits in the group name", () => {
		expect(parseReleaseGroup("Title-Release_99")).toBe("Release_99");
	});

	it("returns only the last group if there are multiple hyphens", () => {
		expect(parseReleaseGroup("A-B-C")).toBe("C");
	});

	it("returns null if the group contains special characters", () => {
		expect(parseReleaseGroup("Title-Gr@up")).toBeNull();
	});
});

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

// ─── getDefSizeLimits ───────────────────────────────────────────────────────

describe("getDefSizeLimits", () => {
	it("returns null for qualityId 0", () => {
		expect(getDefSizeLimits(0)).toBeNull();
	});

	it("returns size limits from DB for a known format", () => {
		// First call: downloadFormats rows
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 5,
				title: "EPUB",
				weight: 10,
				color: "blue",
				contentTypes: ["ebook"],
				source: null,
				resolution: 0,
				minSize: 1,
				maxSize: 50,
				noMaxLimit: 0,
			},
		]);
		// Second call: settings rows (for cachedDefaults)
		mocks.selectAll.mockReturnValueOnce([]);

		const result = getDefSizeLimits(5);
		expect(result).toEqual({ minSize: 1, maxSize: 50 });
	});

	it("returns null for an unknown qualityId", () => {
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 5,
				title: "EPUB",
				weight: 10,
				color: "blue",
				contentTypes: ["ebook"],
				source: null,
				resolution: 0,
				minSize: 1,
				maxSize: 50,
				noMaxLimit: 0,
			},
		]);

		expect(getDefSizeLimits(999)).toBeNull();
	});

	it("uses noMaxLimit to zero out maxSize in the cache", () => {
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 7,
				title: "FLAC",
				weight: 5,
				color: "green",
				contentTypes: ["audio"],
				source: null,
				resolution: 0,
				minSize: 10,
				maxSize: 500,
				noMaxLimit: 1,
			},
		]);
		mocks.selectAll.mockReturnValueOnce([]);

		const result = getDefSizeLimits(7);
		// maxSize should be 0 because noMaxLimit is truthy
		expect(result).toEqual({ minSize: 10, maxSize: 0 });
	});
});

// ─── getFormatType ──────────────────────────────────────────────────────────

describe("getFormatType", () => {
	it("returns the first content type for a known format", () => {
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 5,
				title: "EPUB",
				weight: 10,
				color: "blue",
				contentTypes: ["ebook", "audio"],
				source: null,
				resolution: 0,
				minSize: 1,
				maxSize: 50,
				noMaxLimit: 0,
			},
		]);
		mocks.selectAll.mockReturnValueOnce([]);

		expect(getFormatType(5)).toBe("ebook");
	});

	it("returns null for an unknown qualityId", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		expect(getFormatType(999)).toBeNull();
	});
});

// ─── matchFormat / matchAllFormats ───────────────────────────────────────────

describe("matchFormat and matchAllFormats", () => {
	function setupFormatDefs(defs: Array<Record<string, unknown>>) {
		mocks.selectAll.mockReturnValueOnce(defs);
	}

	describe("ebook title matching", () => {
		const ebookDefs = [
			{
				id: 1,
				title: "EPUB",
				weight: 10,
				color: "blue",
				contentTypes: ["ebook"],
				source: null,
				resolution: 0,
			},
			{
				id: 2,
				title: "MOBI",
				weight: 5,
				color: "orange",
				contentTypes: ["ebook"],
				source: null,
				resolution: 0,
			},
			{
				id: 3,
				title: "PDF",
				weight: 3,
				color: "red",
				contentTypes: ["ebook"],
				source: null,
				resolution: 0,
			},
		];

		it("matches a single format in the release title", () => {
			setupFormatDefs(ebookDefs);
			const result = matchFormat({
				title: "Some.Book.EPUB-GROUP",
				size: 1000,
				indexerFlags: null,
			});
			expect(result).toEqual({
				id: 1,
				name: "EPUB",
				weight: 10,
				color: "blue",
			});
		});

		it("returns Unknown when no format matches", () => {
			setupFormatDefs(ebookDefs);
			const result = matchFormat({
				title: "Some.Book.AZW3-GROUP",
				size: 1000,
				indexerFlags: null,
			});
			expect(result).toEqual({
				id: 0,
				name: "Unknown",
				weight: 0,
				color: "gray",
			});
		});

		it("returns all matching formats ordered by weight", () => {
			setupFormatDefs(ebookDefs);
			const results = matchAllFormats({
				title: "Some.Book.EPUB.MOBI.PDF-GROUP",
				size: 1000,
				indexerFlags: null,
			});
			expect(results).toHaveLength(3);
			expect(results[0].name).toBe("EPUB");
			expect(results[1].name).toBe("MOBI");
			expect(results[2].name).toBe("PDF");
		});

		it("is case-insensitive for ebook matching", () => {
			setupFormatDefs(ebookDefs);
			const result = matchFormat({
				title: "Some.Book.epub-GROUP",
				size: 1000,
				indexerFlags: null,
			});
			expect(result.id).toBe(1);
		});

		it("matches at word boundaries only", () => {
			setupFormatDefs(ebookDefs);
			const result = matchFormat({
				title: "Some.Book.XEPUBX-GROUP",
				size: 1000,
				indexerFlags: null,
			});
			expect(result.id).toBe(0);
		});

		it("skips defs whose name starts with Unknown", () => {
			setupFormatDefs([
				{
					id: 99,
					title: "Unknown Format",
					weight: 1,
					color: "gray",
					contentTypes: ["ebook"],
					source: null,
					resolution: 0,
				},
			]);
			const result = matchFormat({
				title: "Unknown Format Book",
				size: 100,
				indexerFlags: null,
			});
			expect(result.id).toBe(0);
		});

		it("strips parenthetical suffixes from def name for matching", () => {
			setupFormatDefs([
				{
					id: 10,
					title: "EPUB (Conservative)",
					weight: 8,
					color: "teal",
					contentTypes: ["ebook"],
					source: null,
					resolution: 0,
				},
			]);
			const result = matchFormat({
				title: "My.Book.EPUB-GROUP",
				size: 100,
				indexerFlags: null,
			});
			expect(result.id).toBe(10);
		});
	});

	describe("video source + resolution matching", () => {
		const videoDefs = [
			{
				id: 20,
				title: "Bluray-1080p",
				weight: 20,
				color: "purple",
				contentTypes: ["movie"],
				source: "Bluray",
				resolution: 1080,
			},
			{
				id: 21,
				title: "HDTV-720p",
				weight: 15,
				color: "green",
				contentTypes: ["tv"],
				source: "Television",
				resolution: 720,
			},
			{
				id: 22,
				title: "WEB-DL-1080p",
				weight: 18,
				color: "cyan",
				contentTypes: ["movie"],
				source: "Web",
				resolution: 1080,
			},
			{
				id: 23,
				title: "WebRip-480p",
				weight: 5,
				color: "yellow",
				contentTypes: ["tv"],
				source: "WebRip",
				resolution: 480,
			},
			{
				id: 24,
				title: "DVD",
				weight: 3,
				color: "brown",
				contentTypes: ["movie"],
				source: "DVD",
				resolution: 0,
			},
			{
				id: 25,
				title: "Remux-1080p",
				weight: 25,
				color: "gold",
				contentTypes: ["movie"],
				source: "BlurayRaw",
				resolution: 1080,
			},
		];

		it("matches Bluray + resolution", () => {
			setupFormatDefs(videoDefs);
			const result = matchFormat({
				title: "Movie.2024.1080p.BluRay.x264-GROUP",
				size: 5000000000,
				indexerFlags: null,
			});
			expect(result.id).toBe(20);
		});

		it("matches HDTV source", () => {
			setupFormatDefs(videoDefs);
			const result = matchFormat({
				title: "Show.S01E01.720p.HDTV.x264-GROUP",
				size: 500000000,
				indexerFlags: null,
			});
			expect(result.id).toBe(21);
		});

		it("matches WEB-DL source with hyphen variations", () => {
			setupFormatDefs(videoDefs);
			const result = matchFormat({
				title: "Movie.2024.1080p.WEB-DL.H264-GROUP",
				size: 3000000000,
				indexerFlags: null,
			});
			expect(result.id).toBe(22);
		});

		it("matches WebRip source", () => {
			setupFormatDefs(videoDefs);
			const result = matchFormat({
				title: "Show.S02E05.480p.WEBRip.x264-GROUP",
				size: 200000000,
				indexerFlags: null,
			});
			expect(result.id).toBe(23);
		});

		it("matches DVD source without resolution", () => {
			setupFormatDefs(videoDefs);
			const result = matchFormat({
				title: "Movie.2024.DVDRip.XviD-GROUP",
				size: 700000000,
				indexerFlags: null,
			});
			expect(result.id).toBe(24);
		});

		it("matches Remux/BlurayRaw source", () => {
			setupFormatDefs(videoDefs);
			const result = matchFormat({
				title: "Movie.2024.1080p.Remux.AVC.DTS-HD-GROUP",
				size: 30000000000,
				indexerFlags: null,
			});
			expect(result.id).toBe(25);
		});

		it("does not match when source is present but resolution is wrong", () => {
			setupFormatDefs([
				{
					id: 30,
					title: "Bluray-2160p",
					weight: 30,
					color: "gold",
					contentTypes: ["movie"],
					source: "Bluray",
					resolution: 2160,
				},
			]);
			const result = matchFormat({
				title: "Movie.2024.1080p.BluRay.x264-GROUP",
				size: 5000000000,
				indexerFlags: null,
			});
			expect(result.id).toBe(0);
		});

		it("returns false for video defs with no source and no resolution", () => {
			setupFormatDefs([
				{
					id: 40,
					title: "Unknown",
					weight: 1,
					color: "gray",
					contentTypes: ["movie"],
					source: null,
					resolution: 0,
				},
			]);
			const result = matchFormat({
				title: "Some.Movie.2024-GROUP",
				size: 1000,
				indexerFlags: null,
			});
			expect(result.id).toBe(0);
		});

		it("returns false for unknown video source", () => {
			setupFormatDefs([
				{
					id: 41,
					title: "Mystery",
					weight: 1,
					color: "gray",
					contentTypes: ["tv"],
					source: "LaserDisc",
					resolution: 0,
				},
			]);
			const result = matchFormat({
				title: "Some.Show.S01E01.LaserDisc-GROUP",
				size: 1000,
				indexerFlags: null,
			});
			// The "LaserDisc" source hits the default case which never matches
			expect(result.id).toBe(0);
		});
	});

	describe("matchAllFormats returns empty array for no matches", () => {
		it("returns [] when nothing matches", () => {
			setupFormatDefs([
				{
					id: 1,
					title: "EPUB",
					weight: 10,
					color: "blue",
					contentTypes: ["ebook"],
					source: null,
					resolution: 0,
				},
			]);
			const results = matchAllFormats({
				title: "Random Title",
				size: 100,
				indexerFlags: null,
			});
			expect(results).toEqual([]);
		});
	});
});

// ─── enrichRelease ──────────────────────────────────────────────────────────

describe("enrichRelease", () => {
	const baseRelease = {
		guid: "guid",
		title: "Title",
		size: 0,
		downloadUrl: "https://example.com",
		allstarrIndexerId: 1,
		indexerSource: "manual" as const,
		infoUrl: null,
		publishDate: null,
		indexerId: 1,
		indexer: null,
		protocol: "usenet" as const,
		seeders: null,
		leechers: null,
		grabs: null,
		categories: null,
		age: null,
		indexerFlags: null,
	};

	it("adds quality, formatted fields, and release type info", () => {
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 1,
				title: "EPUB",
				weight: 10,
				color: "blue",
				contentTypes: ["ebook"],
				source: null,
				resolution: 0,
			},
		]);

		mocks.detectReleaseType.mockReturnValue({
			releaseType: 10,
			packInfo: null,
		});

		const release = {
			...baseRelease,
			guid: "test-guid",
			title: "Some.Book.EPUB-GROUP",
			size: 1048576, // 1 MB
			downloadUrl: "https://example.com/download",
			indexer: "TestIndexer",
		};

		const result = enrichRelease(release);

		expect(result.quality).toEqual({
			id: 1,
			name: "EPUB",
			weight: 10,
			color: "blue",
		});
		expect(result.sizeFormatted).toBe("1 MB");
		expect(result.ageFormatted).toBe("Unknown");
		expect(result.rejections).toEqual([]);
		expect(result.formatScore).toBe(0);
		expect(result.formatScoreDetails).toEqual([]);
		expect(result.cfScore).toBe(0);
		expect(result.cfDetails).toEqual([]);
		expect(result.releaseType).toBe(10);
		expect(result.packInfo).toBeNull();
		expect(result.guid).toBe("test-guid");
	});

	it("calls detectReleaseType with the correct content type", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		enrichRelease({ ...baseRelease, title: "Some.Show.S01E01" }, "tv");

		expect(mocks.detectReleaseType).toHaveBeenCalledWith(
			"Some.Show.S01E01",
			"tv",
		);
	});

	it("defaults contentType to book", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		enrichRelease(baseRelease);

		expect(mocks.detectReleaseType).toHaveBeenCalledWith("Title", "book");
	});

	it("formats 0 bytes as '0 B'", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const result = enrichRelease({ ...baseRelease, size: 0 });
		expect(result.sizeFormatted).toBe("0 B");
	});

	it("formats bytes in KB", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const result = enrichRelease({ ...baseRelease, size: 1536 }); // 1.5 KB
		expect(result.sizeFormatted).toBe("1.5 KB");
	});

	it("formats bytes in MB", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const result = enrichRelease({ ...baseRelease, size: 1048576 }); // 1 MB
		expect(result.sizeFormatted).toBe("1 MB");
	});

	it("formats bytes in GB", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const result = enrichRelease({
			...baseRelease,
			size: 1024 * 1024 * 1024,
		});
		expect(result.sizeFormatted).toBe("1 GB");
	});

	it("formats age as Today for current date", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const result = enrichRelease({
			...baseRelease,
			publishDate: new Date().toISOString(),
		});
		expect(result.ageFormatted).toBe("Today");
	});

	it("formats age as '1 day ago'", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const oneDayAgo = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
		const result = enrichRelease({
			...baseRelease,
			publishDate: oneDayAgo,
		});
		expect(result.ageFormatted).toBe("1 day ago");
	});

	it("formats age as multiple days ago", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const fifteenDaysAgo = new Date(
			Date.now() - 1000 * 60 * 60 * 24 * 15,
		).toISOString();
		const result = enrichRelease({
			...baseRelease,
			publishDate: fifteenDaysAgo,
		});
		expect(result.ageFormatted).toBe("15 days ago");
	});

	it("formats age as '1 month ago'", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const thirtyFiveDaysAgo = new Date(
			Date.now() - 1000 * 60 * 60 * 24 * 35,
		).toISOString();
		const result = enrichRelease({
			...baseRelease,
			publishDate: thirtyFiveDaysAgo,
		});
		expect(result.ageFormatted).toBe("1 month ago");
	});

	it("formats age as multiple months ago", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const fiveMonthsAgo = new Date(
			Date.now() - 1000 * 60 * 60 * 24 * 150,
		).toISOString();
		const result = enrichRelease({
			...baseRelease,
			publishDate: fiveMonthsAgo,
		});
		expect(result.ageFormatted).toBe("5 months ago");
	});

	it("formats age as '1 year ago'", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const oneYearAgo = new Date(
			Date.now() - 1000 * 60 * 60 * 24 * 370,
		).toISOString();
		const result = enrichRelease({
			...baseRelease,
			publishDate: oneYearAgo,
		});
		expect(result.ageFormatted).toBe("1 year ago");
	});

	it("formats age as multiple years ago", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const threeYearsAgo = new Date(
			Date.now() - 1000 * 60 * 60 * 24 * 1100,
		).toISOString();
		const result = enrichRelease({
			...baseRelease,
			publishDate: threeYearsAgo,
		});
		expect(result.ageFormatted).toBe("3 years ago");
	});

	it("formats age as Unknown for future dates", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const futureDate = new Date(
			Date.now() + 1000 * 60 * 60 * 24 * 30,
		).toISOString();
		const result = enrichRelease({
			...baseRelease,
			publishDate: futureDate,
		});
		expect(result.ageFormatted).toBe("Unknown");
	});

	it("formats age as Unknown for null publishDate", () => {
		mocks.selectAll.mockReturnValueOnce([]);
		mocks.detectReleaseType.mockReturnValue({
			releaseType: 0,
			packInfo: null,
		});

		const result = enrichRelease({
			...baseRelease,
			publishDate: null,
		});
		expect(result.ageFormatted).toBe("Unknown");
	});
});

// ─── invalidateFormatDefCache ───────────────────────────────────────────────

describe("invalidateFormatDefCache", () => {
	it("clears caches so subsequent calls re-query the DB", () => {
		// First call: populate cache
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 1,
				title: "EPUB",
				weight: 10,
				color: "blue",
				contentTypes: ["ebook"],
				source: null,
				resolution: 0,
			},
		]);
		matchFormat({
			title: "Some.Book.EPUB-GROUP",
			size: 100,
			indexerFlags: null,
		});

		// Invalidate
		invalidateFormatDefCache();

		// Second call should re-query
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 2,
				title: "PDF",
				weight: 5,
				color: "red",
				contentTypes: ["ebook"],
				source: null,
				resolution: 0,
			},
		]);
		const result = matchFormat({
			title: "Some.Book.PDF-GROUP",
			size: 100,
			indexerFlags: null,
		});
		expect(result.id).toBe(2);
		expect(result.name).toBe("PDF");

		// selectAll should have been called twice (once per getFormatDefs)
		expect(mocks.selectAll).toHaveBeenCalledTimes(2);
	});
});
