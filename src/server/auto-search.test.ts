import {
	buildDownloadClient,
	buildManualIndexer,
	buildRelease,
	buildSyncedIndexer,
} from "src/server/auto-search-test-fixtures";
import { requireValue } from "src/test/require-value";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
	selectAll: vi.fn((): unknown[] => []),
	selectGet: vi.fn((): unknown => undefined),
	updateRun: vi.fn(),
	insertRun: vi.fn(),
	logInfo: vi.fn(),
	logWarn: vi.fn(),
	logError: vi.fn(),
	canQueryIndexer: vi.fn(
		(): { allowed: boolean; reason?: string; waitMs?: number } => ({
			allowed: true,
		}),
	),
	anyIndexerAvailable: vi.fn(() => true),
	searchNewznab: vi.fn(
		async (_feed?: unknown, _query?: unknown): Promise<unknown[]> => [],
	),
	enrichRelease: vi.fn((r: unknown) => r),
	getProfileWeight: vi.fn((id: number) => id),
	isFormatInProfile: vi.fn(() => true),
	getCategoriesForProfiles: vi.fn(() => [7020]),
	dedupeAndScoreReleases: vi.fn((r: unknown[]) => r),
	getReleaseTypeRank: vi.fn(() => 0),
	isPackQualified: vi.fn(() => true),
	getProvider: vi.fn(),
}));

// ─── Module mocks ──────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
	asc: vi.fn((col: unknown) => ({ col, dir: "asc" })),
	desc: vi.fn((col: unknown) => ({ col, dir: "desc" })),
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
	inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
	sql: (...args: unknown[]) => ({ args }),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					all: mocks.selectAll,
					get: mocks.selectGet,
					orderBy: vi.fn(() => ({
						all: mocks.selectAll,
					})),
				})),
				innerJoin: vi.fn(() => ({
					where: vi.fn(() => ({
						all: mocks.selectAll,
						get: mocks.selectGet,
					})),
					innerJoin: vi.fn(() => ({
						where: vi.fn(() => ({
							all: mocks.selectAll,
						})),
					})),
				})),
				leftJoin: vi.fn(() => ({
					leftJoin: vi.fn(() => ({
						where: vi.fn(() => ({
							all: mocks.selectAll,
						})),
					})),
					where: vi.fn(() => ({
						all: mocks.selectAll,
					})),
				})),
				all: mocks.selectAll,
				orderBy: vi.fn(() => ({
					all: mocks.selectAll,
				})),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					run: mocks.updateRun,
				})),
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				run: mocks.insertRun,
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	authors: { id: "authors.id", monitored: "authors.monitored" },
	blocklist: {
		bookId: "blocklist.bookId",
		movieId: "blocklist.movieId",
		showId: "blocklist.showId",
		sourceTitle: "blocklist.sourceTitle",
	},
	bookFiles: { bookId: "bookFiles.bookId", quality: "bookFiles.quality" },
	books: {
		id: "books.id",
		title: "books.title",
		lastSearchedAt: "books.lastSearchedAt",
	},
	booksAuthors: {
		bookId: "booksAuthors.bookId",
		authorId: "booksAuthors.authorId",
		authorName: "booksAuthors.authorName",
		isPrimary: "booksAuthors.isPrimary",
	},
	downloadClients: {
		id: "dc.id",
		enabled: "dc.enabled",
		priority: "dc.priority",
	},
	downloadProfiles: { id: "dp.id" },
	editionDownloadProfiles: {
		editionId: "edp.editionId",
		downloadProfileId: "edp.downloadProfileId",
	},
	editions: { id: "editions.id", bookId: "editions.bookId" },
	episodeDownloadProfiles: {
		episodeId: "epdp.episodeId",
		downloadProfileId: "epdp.downloadProfileId",
	},
	episodeFiles: {
		episodeId: "ef.episodeId",
		quality: "ef.quality",
	},
	episodes: {
		id: "episodes.id",
		showId: "episodes.showId",
		seasonId: "episodes.seasonId",
		episodeNumber: "episodes.episodeNumber",
		absoluteNumber: "episodes.absoluteNumber",
		airDate: "episodes.airDate",
		lastSearchedAt: "episodes.lastSearchedAt",
	},
	history: {
		eventType: "history.eventType",
		bookId: "history.bookId",
		movieId: "history.movieId",
		episodeId: "history.episodeId",
		data: "history.data",
	},
	indexers: {
		id: "indexers.id",
		enableRss: "indexers.enableRss",
		priority: "indexers.priority",
		downloadClientId: "indexers.downloadClientId",
		tag: "indexers.tag",
	},
	movieDownloadProfiles: {
		movieId: "mdp.movieId",
		downloadProfileId: "mdp.downloadProfileId",
	},
	movieFiles: { movieId: "mf.movieId", quality: "mf.quality" },
	movies: {
		id: "movies.id",
		title: "movies.title",
		year: "movies.year",
		lastSearchedAt: "movies.lastSearchedAt",
	},
	seasons: {
		id: "seasons.id",
		seasonNumber: "seasons.seasonNumber",
	},
	shows: {
		id: "shows.id",
		title: "shows.title",
		seriesType: "shows.seriesType",
	},
	syncedIndexers: {
		id: "syncedIndexers.id",
		enableRss: "syncedIndexers.enableRss",
		priority: "syncedIndexers.priority",
		downloadClientId: "syncedIndexers.downloadClientId",
		tag: "syncedIndexers.tag",
	},
	trackedDownloads: {
		downloadClientId: "td.downloadClientId",
		downloadProfileId: "td.downloadProfileId",
		bookId: "td.bookId",
		movieId: "td.movieId",
		episodeId: "td.episodeId",
		state: "td.state",
	},
}));

vi.mock("./download-clients/registry", () => ({
	default: mocks.getProvider,
}));

vi.mock("./indexer-rate-limiter", () => ({
	canQueryIndexer: mocks.canQueryIndexer,
	anyIndexerAvailable: mocks.anyIndexerAvailable,
}));

vi.mock("./indexers", () => ({
	dedupeAndScoreReleases: mocks.dedupeAndScoreReleases,
	getCategoriesForProfiles: mocks.getCategoriesForProfiles,
	getReleaseTypeRank: mocks.getReleaseTypeRank,
	isPackQualified: mocks.isPackQualified,
}));

vi.mock("./indexers/format-parser", () => ({
	enrichRelease: mocks.enrichRelease,
	getProfileWeight: mocks.getProfileWeight,
	isFormatInProfile: mocks.isFormatInProfile,
}));

vi.mock("./indexers/http", () => ({
	searchNewznab: mocks.searchNewznab,
}));

vi.mock("./logger", () => ({
	logInfo: mocks.logInfo,
	logWarn: mocks.logWarn,
	logError: mocks.logError,
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────────

import {
	runAutoSearch,
	searchForAuthorBooks,
	searchForBook,
	searchForMovie,
	searchForShow,
} from "./auto-search";

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeRelease(overrides: Record<string, unknown> = {}) {
	return {
		guid: "guid-1",
		title: "Test Release",
		size: 100_000_000,
		downloadUrl: "http://example.com/nzb/1",
		infoUrl: null,
		publishDate: null,
		indexerId: 1,
		indexer: "TestIndexer",
		protocol: "usenet" as const,
		seeders: null,
		leechers: null,
		grabs: null,
		categories: null,
		age: null,
		indexerFlags: null,
		allstarrIndexerId: 1,
		indexerSource: "manual" as const,
		quality: { id: 2, name: "EPUB", weight: 2, color: "#0f0" },
		sizeFormatted: "100 MB",
		ageFormatted: "1d",
		rejections: [],
		formatScore: 0,
		formatScoreDetails: [],
		cfScore: 0,
		cfDetails: [],
		releaseType: 0,
		packInfo: null,
		...overrides,
	};
}

function makeProfile(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: "Default Profile",
		items: [[1, 2, 3]],
		cutoff: 3,
		upgradeAllowed: true,
		categories: "[7020]",
		minCustomFormatScore: 0,
		upgradeUntilCustomFormatScore: 0,
		...overrides,
	};
}

// ─── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
	vi.clearAllMocks();
	// Defaults: no indexers, no wanted items
	mocks.selectAll.mockReturnValue([]);
	mocks.selectGet.mockReturnValue(undefined);
	mocks.canQueryIndexer.mockReturnValue({ allowed: true });
	mocks.anyIndexerAvailable.mockReturnValue(true);
	mocks.searchNewznab.mockResolvedValue([]);
	mocks.enrichRelease.mockImplementation((r: unknown) => r);
	mocks.dedupeAndScoreReleases.mockImplementation((r: unknown[]) => r);
	mocks.getProfileWeight.mockImplementation((id: number) => id);
	mocks.isFormatInProfile.mockReturnValue(true);
	mocks.isPackQualified.mockReturnValue(true);
	mocks.getReleaseTypeRank.mockReturnValue(0);
});

describe("runAutoSearch", () => {
	it("returns zeroed result when no indexers are configured", async () => {
		// selectAll returns [] for indexers (getEnabledIndexers)
		const result = await runAutoSearch();

		expect(result).toEqual({
			searched: 0,
			grabbed: 0,
			errors: 0,
			details: [],
			movieDetails: [],
			episodeDetails: [],
		});
		expect(mocks.logInfo).toHaveBeenCalledWith(
			"auto-search",
			"No RSS-enabled indexers configured",
		);
	});

	it("returns zeroed result when no wanted items exist", async () => {
		// First two selectAll calls return indexers (manual, synced)
		// Then getWantedBooks returns empty
		const callCount = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callCount.n += 1;
			// Calls 1-2 are getEnabledIndexers (manual, synced)
			if (callCount.n === 1) {
				return [{ id: 1, name: "Manual", enableRss: true, priority: 1 }];
			}
			return [];
		});

		const result = await runAutoSearch();

		expect(result.searched).toBe(0);
		expect(result.grabbed).toBe(0);
		expect(result.errors).toBe(0);
	});

	it("filters wanted books by bookIds option", async () => {
		// We just need to verify it runs without error when book IDs filter to nothing
		const callCount = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callCount.n += 1;
			if (callCount.n === 1) {
				return [{ id: 1, name: "ix", enableRss: true, priority: 1 }];
			}
			return [];
		});

		const result = await runAutoSearch({ bookIds: [999] });

		expect(result.searched).toBe(0);
		expect(result.grabbed).toBe(0);
	});

	it("applies maxBooks limit", async () => {
		const callCount = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callCount.n += 1;
			if (callCount.n === 1) {
				return [{ id: 1, name: "ix", enableRss: true, priority: 1 }];
			}
			return [];
		});

		const result = await runAutoSearch({ maxBooks: 0 });

		expect(result.searched).toBe(0);
		expect(result.grabbed).toBe(0);
	});

	it("skips movies and episodes when bookIds is provided", async () => {
		const callCount = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callCount.n += 1;
			if (callCount.n === 1) {
				return [{ id: 1, name: "ix", enableRss: true, priority: 1 }];
			}
			return [];
		});

		const result = await runAutoSearch({ bookIds: [1] });

		// Only book search was attempted, movie/episode details should be empty
		expect(result.movieDetails).toEqual([]);
		expect(result.episodeDetails).toEqual([]);
	});
});

describe("searchForBook", () => {
	it("returns zero counts when book is not wanted", async () => {
		// getEnabledIndexers returns at least one indexer, but getWantedBooks returns nothing matching
		const callCount = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callCount.n += 1;
			if (callCount.n === 1) {
				return [{ id: 1, name: "ix", enableRss: true, priority: 1 }];
			}
			return [];
		});

		const result = await searchForBook(42);

		expect(result).toEqual({ searched: 0, grabbed: 0 });
	});
});

describe("searchForMovie", () => {
	it("returns zero counts when no wanted movies", async () => {
		mocks.selectAll.mockReturnValue([]);
		const result = await searchForMovie(1);
		expect(result).toEqual({ searched: 0, grabbed: 0 });
	});
});

describe("searchForAuthorBooks", () => {
	it("returns zero counts when author has no books", async () => {
		mocks.selectAll.mockReturnValue([]);
		const result = await searchForAuthorBooks(1);
		expect(result).toEqual({ searched: 0, grabbed: 0 });
	});
});

describe("searchForShow", () => {
	it("returns zero counts when no wanted episodes", async () => {
		mocks.selectAll.mockReturnValue([]);
		const result = await searchForShow(1);
		expect(result).toEqual({ searched: 0, grabbed: 0 });
	});
});

describe("findBestReleaseForProfile (via runAutoSearch)", () => {
	// The findBestReleaseForProfile function is not exported, so we test it
	// indirectly through the search flow. We set up a scenario where the
	// search+grab path is exercised for a wanted book.

	function setupBookSearchFlow(
		releases: ReturnType<typeof makeRelease>[],
		existingFileWeights: number[] = [],
	) {
		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				// getEnabledIndexers: manual
				case 1:
					return [
						{
							id: 1,
							name: "TestIndexer",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				// getEnabledIndexers: synced
				case 2:
					return [];
				// getWantedBooks: monitoredBooks
				case 3:
					return [
						{
							id: 10,
							title: "Test Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author Name",
							authorMonitored: true,
						},
					];
				// getEditionProfilesForBook rows
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				// downloadProfiles for the above
				case 5:
					return [profile];
				// activeDownloads (trackedDownloads) for book
				case 6:
					return [];
				// existingFiles (bookFiles)
				case 7:
					return existingFileWeights.map((w) => ({
						quality: { quality: { id: w } },
					}));
				// Blocklist
				case 8:
					return [];
				// History (grabbed guids)
				case 9:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue(releases);
		mocks.dedupeAndScoreReleases.mockReturnValue(releases);

		return { profile };
	}

	it("grabs the best release for a wanted book with no existing files", async () => {
		const release = makeRelease({
			quality: { id: 2, name: "EPUB", weight: 2, color: "#0f0" },
		});
		const mockProvider = { addDownload: vi.fn(async () => "dl-123") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		// grabRelease makes 3 selectGet calls:
		// 1. indexer row (downloadClientId) 2. download client 3. indexer tag
		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			switch (getCallIdx.n) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "books",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		setupBookSearchFlow([release]);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(1);
		expect(result.details.length).toBe(1);
		expect(result.details[0].grabbed).toBe(true);
	});

	it("skips releases with rejections", async () => {
		const rejected = makeRelease({
			rejections: [{ reason: "unknownQuality", message: "Unknown quality" }],
		});
		setupBookSearchFlow([rejected]);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		// Searched but not grabbed because of rejection
		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(0);
	});

	it("skips blocklisted releases", async () => {
		const release = makeRelease({ title: "Blocked Release" });
		const callIdx = { n: 0 };
		const profile = makeProfile();
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "TestIndexer",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Test Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author Name",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return []; // no existing files
				// Blocklist returns the matching title
				case 8:
					return [{ sourceTitle: "Blocked Release" }];
				case 9:
					return [];
				default:
					return [];
			}
		});
		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(0);
	});

	it("skips releases when format is not in profile", async () => {
		const release = makeRelease();
		mocks.isFormatInProfile.mockReturnValue(false);
		setupBookSearchFlow([release]);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(0);
	});

	it("does not grab when existing file meets cutoff and upgrades not allowed", async () => {
		const profile = makeProfile({ upgradeAllowed: false });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Test Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				// Existing files at weight 3 (at cutoff)
				case 7:
					return [{ quality: { quality: { id: 3 } } }];
				default:
					return [];
			}
		});

		// getProfileWeight: cutoff = 3, existing = 3 → no upgrade needed → book not wanted
		mocks.getProfileWeight.mockImplementation((id: number) => id);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		// The book should not even be considered wanted since upgradeAllowed is false
		// and existing file is at cutoff weight
		expect(result.grabbed).toBe(0);
	});

	it("skips releases below minimum custom format score", async () => {
		const release = makeRelease({ cfScore: -5 });
		const profile = makeProfile({ minCustomFormatScore: 0 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Test Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return []; // no existing files
				case 8:
					return []; // blocklist
				case 9:
					return []; // history
				default:
					return [];
			}
		});
		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(0);
	});

	it("selects the higher-weighted release from multiple candidates", async () => {
		const low = makeRelease({
			guid: "low-guid",
			title: "Low Quality",
			quality: { id: 1, name: "TXT", weight: 1, color: "#aaa" },
		});
		const high = makeRelease({
			guid: "high-guid",
			title: "High Quality",
			quality: { id: 3, name: "PDF", weight: 3, color: "#00f" },
		});

		const mockProvider = { addDownload: vi.fn(async () => "dl-456") };
		mocks.getProvider.mockResolvedValue(mockProvider);
		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			switch (getCallIdx.n) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "books",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		setupBookSearchFlow([low, high]);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		expect(result.grabbed).toBe(1);
		expect(result.details[0].releaseTitle).toBe("High Quality");
	});

	it("prefers higher CF score at same quality weight", async () => {
		const lowCF = makeRelease({
			guid: "low-cf",
			title: "Low CF",
			quality: { id: 2, name: "EPUB", weight: 2, color: "#0f0" },
			cfScore: 0,
		});
		const highCF = makeRelease({
			guid: "high-cf",
			title: "High CF",
			quality: { id: 2, name: "EPUB", weight: 2, color: "#0f0" },
			cfScore: 10,
		});

		const mockProvider = { addDownload: vi.fn(async () => "dl-789") };
		mocks.getProvider.mockResolvedValue(mockProvider);
		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			switch (getCallIdx.n) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "books",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		setupBookSearchFlow([lowCF, highCF]);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		expect(result.grabbed).toBe(1);
		expect(result.details[0].releaseTitle).toBe("High CF");
	});

	it("skips disqualified pack releases", async () => {
		const release = makeRelease({ releaseType: 3 });
		mocks.isPackQualified.mockReturnValue(false);
		setupBookSearchFlow([release]);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(0);
	});
});

describe("indexer rate limiting", () => {
	it("skips indexers that are not allowed by rate limiter", async () => {
		mocks.canQueryIndexer.mockReturnValue({
			allowed: false,
			reason: "dailyCap",
		});

		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "LimitedIndexer",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Test Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return []; // no existing files
				default:
					return [];
			}
		});

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		// The search is marked searched but no releases found because the indexer was skipped
		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(0);
		expect(mocks.searchNewznab).not.toHaveBeenCalled();
	});

	it("stops early when all indexers are exhausted", async () => {
		mocks.anyIndexerAvailable.mockReturnValue(false);

		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Book A",
							lastSearchedAt: null,
							authorId: null,
							authorName: null,
							authorMonitored: true,
						},
						{
							id: 11,
							title: "Book B",
							lastSearchedAt: null,
							authorId: null,
							authorName: null,
							authorMonitored: true,
						},
					];
				// Each book calls getEditionProfilesForBook etc.
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				case 8:
					return [{ editionId: 101, profileId: profile.id }];
				case 9:
					return [profile];
				case 10:
					return [];
				case 11:
					return [];
				default:
					return [];
			}
		});

		await runAutoSearch({ bookIds: [10, 11] });

		// Should stop before searching any books since indexers are exhausted
		expect(mocks.searchNewznab).not.toHaveBeenCalled();
	});
});

describe("error handling", () => {
	it("records error when searchNewznab throws", async () => {
		mocks.searchNewznab.mockRejectedValue(new Error("Network timeout"));

		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Test Book",
							lastSearchedAt: null,
							authorId: null,
							authorName: null,
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				default:
					return [];
			}
		});

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		// The search should proceed (error is caught per-indexer), book is searched with 0 releases
		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(0);
		expect(mocks.logError).toHaveBeenCalled();
	});

	it("records error when entire book search throws unexpectedly", async () => {
		// Make dedupeAndScoreReleases throw to simulate an unexpected error
		// that escapes the per-indexer try/catch inside searchAndGrabForBook
		mocks.dedupeAndScoreReleases.mockImplementation(() => {
			throw new Error("Unexpected parse error");
		});
		mocks.searchNewznab.mockResolvedValue([makeRelease()]);

		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Test Book",
							lastSearchedAt: null,
							authorId: null,
							authorName: null,
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				default:
					return [];
			}
		});

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		expect(result.errors).toBe(1);
		expect(result.details[0].error).toBe("Unexpected parse error");
	});
});

describe("grab helper — no download client", () => {
	it("does not grab when no matching download client exists", async () => {
		const release = makeRelease();

		// selectGet returns undefined for download client lookup
		mocks.selectGet.mockReturnValue(undefined);
		// Also need to set up the client query to return no matching clients
		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Test Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return []; // no existing files
				case 8:
					return []; // blocklist
				case 9:
					return []; // history
				// grabRelease: downloadClients.all() — no matching clients
				case 10:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		// Searched but could not grab because no download client
		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(0);
		expect(mocks.logWarn).toHaveBeenCalled();
	});
});

describe("stats accumulation", () => {
	it("accumulates searched and grabbed counts correctly", async () => {
		const r1 = makeRelease({ guid: "g1", title: "Release 1" });
		const r2 = makeRelease({ guid: "g2", title: "Release 2" });

		const mockProvider = { addDownload: vi.fn(async () => "dl-abc") };
		mocks.getProvider.mockResolvedValue(mockProvider);
		// grabRelease: 3 selectGet calls per book (indexer row, client, tag)
		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			// Each book grab requires: indexer row, client, tag
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "books",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		const profile = makeProfile();
		let searchCallIdx = 0;
		mocks.searchNewznab.mockImplementation(async () => {
			searchCallIdx += 1;
			if (searchCallIdx === 1) return [r1];
			if (searchCallIdx === 2) return [r2];
			return [];
		});
		mocks.dedupeAndScoreReleases.mockImplementation((r: unknown[]) => r);

		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Book A",
							lastSearchedAt: null,
							authorId: null,
							authorName: null,
							authorMonitored: true,
						},
						{
							id: 11,
							title: "Book B",
							lastSearchedAt: null,
							authorId: null,
							authorName: null,
							authorMonitored: true,
						},
					];
				// Book A edition profiles
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				// Book B edition profiles
				case 8:
					return [{ editionId: 101, profileId: profile.id }];
				case 9:
					return [profile];
				case 10:
					return [];
				case 11:
					return [];
				// Blocklist + history for each book
				case 12:
					return [];
				case 13:
					return [];
				case 14:
					return [];
				case 15:
					return [];
				default:
					return [];
			}
		});

		const result = await runAutoSearch({
			bookIds: [10, 11],
			delayBetweenBooks: 0,
		});

		expect(result.searched).toBe(2);
		expect(result.grabbed).toBe(2);
		expect(result.details.length).toBe(2);
	});
});

// ─── Movie search paths ──────────────────────────────────────────────────

describe("searchForMovie", () => {
	function setupMovieSearchFlow(
		releases: ReturnType<typeof makeRelease>[],
		existingFileWeights: number[] = [],
	) {
		const profile = makeProfile({ id: 10, name: "MovieProfile" });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				// getWantedMovies: monitoredMovies
				case 1:
					return [
						{
							id: 5,
							title: "Test Movie",
							year: 2024,
							lastSearchedAt: null,
						},
					];
				// getWantedMovies: profileRows for movie
				case 2:
					return [{ profileId: profile.id }];
				// getWantedMovies: profileList
				case 3:
					return [profile];
				// getWantedMovies: activeDownloads (trackedDownloads)
				case 4:
					return [];
				// getWantedMovies: existingFiles (movieFiles)
				case 5:
					return existingFileWeights.map((w) => ({
						quality: { quality: { id: w } },
					}));
				// getEnabledIndexers: manual
				case 6:
					return [
						{
							id: 1,
							name: "TestIndexer",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				// getEnabledIndexers: synced
				case 7:
					return [];
				// grabPerProfileForMovie: blocklist
				case 8:
					return [];
				// grabPerProfileForMovie: history (grabbed guids)
				case 9:
					return [];
				// grabReleaseForMovie: downloadClients.all() (fallback)
				case 10:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue(releases);
		mocks.dedupeAndScoreReleases.mockReturnValue(releases);

		return { profile };
	}

	it("returns zero when no indexers configured", async () => {
		// getWantedMovies returns movie, but getEnabledIndexers returns nothing
		const profile = makeProfile({ id: 10 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [{ id: 5, title: "Movie", year: 2024, lastSearchedAt: null }];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				case 5:
					return []; // no files
				// getEnabledIndexers
				case 6:
					return [];
				case 7:
					return [];
				default:
					return [];
			}
		});

		const result = await searchForMovie(5);
		expect(result).toEqual({ searched: 0, grabbed: 0 });
	});

	it("searches and grabs a release for a wanted movie", async () => {
		const release = makeRelease({
			guid: "movie-guid-1",
			title: "Test.Movie.2024.1080p",
			quality: { id: 7, name: "Bluray-1080p", weight: 7, color: "#0f0" },
		});

		const mockProvider = { addDownload: vi.fn(async () => "dl-movie-1") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			switch (getCallIdx.n) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "qBittorrent",
						implementation: "qbittorrent",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "",
						category: "movies",
						tag: null,
						protocol: "torrent",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		setupMovieSearchFlow([release]);

		const result = await searchForMovie(5);

		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(1);
	});

	it("searches but does not grab when no releases found for movie", async () => {
		setupMovieSearchFlow([]);

		const result = await searchForMovie(5);

		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(0);
	});

	it("skips movie with active tracked download", async () => {
		const profile = makeProfile({ id: 10 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [{ id: 5, title: "Movie", year: 2024, lastSearchedAt: null }];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				// activeDownloads — profile 10 has active download
				case 4:
					return [{ downloadProfileId: 10 }];
				default:
					return [];
			}
		});

		const result = await searchForMovie(5);
		expect(result).toEqual({ searched: 0, grabbed: 0 });
	});

	it("skips movie with existing files when upgrade not allowed", async () => {
		const profile = makeProfile({
			id: 10,
			upgradeAllowed: false,
			cutoff: 7,
		});
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [{ id: 5, title: "Movie", year: 2024, lastSearchedAt: null }];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				// existingFiles with quality at cutoff
				case 5:
					return [{ quality: { quality: { id: 7 } } }];
				default:
					return [];
			}
		});

		const result = await searchForMovie(5);
		expect(result).toEqual({ searched: 0, grabbed: 0 });
	});

	it("includes movie for upgrade when below cutoff", async () => {
		const release = makeRelease({
			guid: "upgrade-guid",
			title: "Movie.Upgrade.2024",
			quality: { id: 7, name: "Bluray-1080p", weight: 7, color: "#0f0" },
		});
		const mockProvider = { addDownload: vi.fn(async () => "dl-up") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "movies",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		const profile = makeProfile({
			id: 10,
			upgradeAllowed: true,
			cutoff: 7,
		});
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [{ id: 5, title: "Movie", year: 2024, lastSearchedAt: null }];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				// existing file at weight 3 (below cutoff 7)
				case 5:
					return [{ quality: { quality: { id: 3 } } }];
				case 6:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 7:
					return [];
				case 8:
					return [];
				case 9:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await searchForMovie(5);

		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(1);
	});

	it("does not grab movie when no download client available", async () => {
		const release = makeRelease({ guid: "no-dc" });

		mocks.selectGet.mockReturnValue(undefined);

		setupMovieSearchFlow([release]);

		const result = await searchForMovie(5);

		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(0);
		expect(mocks.logWarn).toHaveBeenCalled();
	});

	it("filters by movieIds in getWantedMovies", async () => {
		// Movie id 99 does not match any wanted movie
		mocks.selectAll.mockReturnValue([]);

		const result = await searchForMovie(99);
		expect(result).toEqual({ searched: 0, grabbed: 0 });
	});
});

// ─── Show/Episode search paths ────────────────────────────────────────────

describe("searchForShow", () => {
	function makeWantedEpisode(overrides: Record<string, unknown> = {}) {
		return {
			id: 100,
			showId: 1,
			showTitle: "Test Show",
			seasonNumber: 1,
			episodeNumber: 1,
			absoluteNumber: null,
			seriesType: "standard",
			airDate: null,
			lastSearchedAt: null,
			...overrides,
		};
	}

	function setupShowSearchFlow(
		episodes: ReturnType<typeof makeWantedEpisode>[],
		releasesByQuery: ReturnType<typeof makeRelease>[][] = [[]],
	) {
		const profile = makeProfile({ id: 20, name: "ShowProfile" });
		const callIdx = { n: 0 };

		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				// getWantedEpisodes: monitoredEpisodes
				case 1:
					return episodes;
				// For each episode: profileRows, profileList, activeDownloads, existingFiles
				default: {
					// Each episode needs 4 sequential calls
					const epOffset = callIdx.n - 2;
					const epIdx = Math.floor(epOffset / 4);
					const callType = epOffset % 4;

					if (epIdx < episodes.length) {
						switch (callType) {
							case 0:
								return [{ profileId: profile.id }];
							case 1:
								return [profile];
							case 2:
								return []; // activeDownloads
							case 3:
								return []; // existingFiles
						}
					}

					// getEnabledIndexers calls
					const ixOffset = epOffset - episodes.length * 4;
					if (ixOffset === 0) {
						return [
							{
								id: 1,
								name: "ix",
								baseUrl: "http://ix",
								apiPath: "/api",
								apiKey: "key1",
								enableRss: true,
								priority: 1,
							},
						];
					}
					if (ixOffset === 1) {
						return [];
					}

					// blocklist/history for episode grabs
					return [];
				}
			}
		});

		let queryIdx = 0;
		mocks.searchNewznab.mockImplementation(async () => {
			const releases =
				releasesByQuery[queryIdx] ??
				releasesByQuery[releasesByQuery.length - 1];
			queryIdx += 1;
			return releases;
		});
		mocks.dedupeAndScoreReleases.mockImplementation((r: unknown[]) => r);

		return { profile };
	}

	it("returns zero when no indexers configured", async () => {
		const ep = makeWantedEpisode();
		const profile = makeProfile({ id: 20 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [ep];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				case 5:
					return [];
				// getEnabledIndexers
				case 6:
					return [];
				case 7:
					return [];
				default:
					return [];
			}
		});

		const result = await searchForShow(1);
		expect(result).toEqual({ searched: 0, grabbed: 0 });
	});

	it("searches and grabs a release for a single episode", async () => {
		const release = makeRelease({
			guid: "ep-guid-1",
			title: "Test.Show.S01E01.720p",
			quality: { id: 4, name: "HDTV-720p", weight: 4, color: "#0f0" },
		});

		const mockProvider = { addDownload: vi.fn(async () => "dl-ep-1") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "tv",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		const ep = makeWantedEpisode();
		setupShowSearchFlow([ep], [[release]]);

		const result = await searchForShow(1);

		expect(result.searched).toBeGreaterThanOrEqual(1);
		expect(result.grabbed).toBe(1);
	});

	it("handles multiple seasons with show-level search", async () => {
		const ep1 = makeWantedEpisode({
			id: 100,
			seasonNumber: 1,
			episodeNumber: 1,
		});
		const ep2 = makeWantedEpisode({
			id: 101,
			seasonNumber: 2,
			episodeNumber: 1,
		});

		setupShowSearchFlow([ep1, ep2], [[]]);

		const result = await searchForShow(1);

		// Both episodes searched but nothing grabbed (no releases)
		expect(result.searched).toBeGreaterThanOrEqual(2);
		expect(result.grabbed).toBe(0);
	});

	it("does individual episode fallback when season search fails", async () => {
		const ep1 = makeWantedEpisode({
			id: 100,
			seasonNumber: 1,
			episodeNumber: 1,
		});
		const ep2 = makeWantedEpisode({
			id: 101,
			seasonNumber: 1,
			episodeNumber: 2,
		});

		// All queries return empty — season search gets no result, falls back to individual
		setupShowSearchFlow([ep1, ep2], [[]]);

		const result = await searchForShow(1);

		expect(result.searched).toBeGreaterThanOrEqual(2);
		expect(result.grabbed).toBe(0);
		// searchNewznab should be called multiple times (season + individual episodes)
		expect(mocks.searchNewznab).toHaveBeenCalled();
	});

	it("skips episodes with active tracked downloads", async () => {
		const profile = makeProfile({ id: 20 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 100,
							showId: 1,
							showTitle: "Test Show",
							seasonNumber: 1,
							episodeNumber: 1,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
					];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				// activeDownloads — profile has active download
				case 4:
					return [{ downloadProfileId: 20 }];
				default:
					return [];
			}
		});

		const result = await searchForShow(1);
		expect(result).toEqual({ searched: 0, grabbed: 0 });
	});
});

// ─── processWantedMovies — full auto-search integration ───────────────────

describe("runAutoSearch — movies and episodes integration", () => {
	it("processes movies in full auto-search (no bookIds)", async () => {
		const release = makeRelease({
			guid: "movie-auto-1",
			title: "Auto.Movie.2024",
		});

		const mockProvider = { addDownload: vi.fn(async () => "dl-ma") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "movies",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		const movieProfile = makeProfile({ id: 10, name: "MovieProfile" });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				// getEnabledIndexers: manual
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				// getEnabledIndexers: synced
				case 2:
					return [];
				// getWantedBooks: none
				case 3:
					return [];
				// getWantedMovies: monitoredMovies
				case 4:
					return [
						{ id: 5, title: "Auto Movie", year: 2024, lastSearchedAt: null },
					];
				// getWantedMovies: profileRows
				case 5:
					return [{ profileId: movieProfile.id }];
				// getWantedMovies: profileList
				case 6:
					return [movieProfile];
				// getWantedMovies: activeDownloads
				case 7:
					return [];
				// getWantedMovies: existingFiles
				case 8:
					return [];
				// grabPerProfileForMovie: blocklist
				case 9:
					return [];
				// grabPerProfileForMovie: history
				case 10:
					return [];
				// getWantedEpisodes
				case 11:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await runAutoSearch({ delayBetweenBooks: 0 });
		const movieDetails = requireValue(result.movieDetails);

		expect(result.searched).toBeGreaterThanOrEqual(1);
		expect(result.grabbed).toBeGreaterThanOrEqual(1);
		expect(result.movieDetails).toBeDefined();
		expect(movieDetails.length).toBeGreaterThanOrEqual(1);
	});

	it("records movie search error gracefully", async () => {
		mocks.searchNewznab.mockResolvedValue([makeRelease()]);
		mocks.dedupeAndScoreReleases.mockImplementation(() => {
			throw new Error("Movie parse error");
		});

		const movieProfile = makeProfile({ id: 10 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [];
				// getWantedMovies
				case 4:
					return [
						{ id: 5, title: "ErrorMovie", year: 2024, lastSearchedAt: null },
					];
				case 5:
					return [{ profileId: movieProfile.id }];
				case 6:
					return [movieProfile];
				case 7:
					return [];
				case 8:
					return [];
				// getWantedEpisodes
				case 9:
					return [];
				default:
					return [];
			}
		});

		const result = await runAutoSearch({ delayBetweenBooks: 0 });
		const movieDetails = requireValue(result.movieDetails);

		expect(result.errors).toBe(1);
		expect(movieDetails.length).toBe(1);
		expect(movieDetails[0].error).toBe("Movie parse error");
	});

	it("stops movie processing when indexers exhausted", async () => {
		const movieProfile = makeProfile({ id: 10 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [];
				// getWantedMovies
				case 4:
					return [
						{ id: 5, title: "Movie1", year: 2024, lastSearchedAt: null },
						{ id: 6, title: "Movie2", year: 2024, lastSearchedAt: null },
					];
				case 5:
					return [{ profileId: movieProfile.id }];
				case 6:
					return [movieProfile];
				case 7:
					return [];
				case 8:
					return [];
				case 9:
					return [{ profileId: movieProfile.id }];
				case 10:
					return [movieProfile];
				case 11:
					return [];
				case 12:
					return [];
				// getWantedEpisodes
				case 13:
					return [];
				default:
					return [];
			}
		});

		// Indexers exhausted from the start
		mocks.anyIndexerAvailable.mockReturnValue(false);

		await runAutoSearch({ delayBetweenBooks: 0 });

		// Should not search any movies since indexers are exhausted
		expect(mocks.searchNewznab).not.toHaveBeenCalled();
	});
});

// ─── Pack handling logic ──────────────────────────────────────────────────

describe("pack handling — author-level search", () => {
	it("tries author-level search when 2+ books share an author", async () => {
		const release = makeRelease({
			guid: "pack-guid",
			title: "Author Complete Works",
			releaseType: 3, // pack
		});

		// getReleaseTypeRank returns >= 2 for pack
		mocks.getReleaseTypeRank.mockReturnValue(3);

		const mockProvider = { addDownload: vi.fn(async () => "dl-pack") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "books",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				// getEnabledIndexers: manual
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				// getEnabledIndexers: synced
				case 2:
					return [];
				// getWantedBooks: monitoredBooks
				case 3:
					return [
						{
							id: 10,
							title: "Book A",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Same Author",
							authorMonitored: true,
						},
						{
							id: 11,
							title: "Book B",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Same Author",
							authorMonitored: true,
						},
					];
				// Book A: getEditionProfilesForBook
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				// Book B: getEditionProfilesForBook
				case 8:
					return [{ editionId: 101, profileId: profile.id }];
				case 9:
					return [profile];
				case 10:
					return [];
				case 11:
					return [];
				// searchAndGrabForAuthor: blocklist for books
				case 12:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await runAutoSearch({
			bookIds: [10, 11],
			delayBetweenBooks: 0,
		});

		// The author-level search should have been performed
		expect(mocks.searchNewznab).toHaveBeenCalled();
		// Pack grabbed — both books recorded
		expect(result.details.length).toBe(2);
	});

	it("falls back to individual book search when author search finds nothing", async () => {
		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Book A",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "AuthorX",
							authorMonitored: true,
						},
						{
							id: 11,
							title: "Book B",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "AuthorX",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				case 8:
					return [{ editionId: 101, profileId: profile.id }];
				case 9:
					return [profile];
				case 10:
					return [];
				case 11:
					return [];
				default:
					return [];
			}
		});

		// No releases found anywhere
		mocks.searchNewznab.mockResolvedValue([]);

		const result = await runAutoSearch({
			bookIds: [10, 11],
			delayBetweenBooks: 0,
		});

		// Author search + 2 individual book searches = at least 3 calls
		expect(mocks.searchNewznab.mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(result.searched).toBeGreaterThanOrEqual(2);
		expect(result.grabbed).toBe(0);
	});
});

// ─── Release filtering edge cases ─────────────────────────────────────────

describe("release filtering edge cases", () => {
	function setupFilteringFlow(
		releases: ReturnType<typeof makeRelease>[],
		profileOverrides: Record<string, unknown> = {},
		existingFileWeights: number[] = [],
	) {
		const profile = makeProfile(profileOverrides);
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Test Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return existingFileWeights.map((w) => ({
						quality: { quality: { id: w } },
					}));
				case 8:
					return [];
				case 9:
					return [];
				default:
					return [];
			}
		});
		mocks.searchNewznab.mockResolvedValue(releases);
		mocks.dedupeAndScoreReleases.mockReturnValue(releases);
		return { profile };
	}

	it("skips already-grabbed guids", async () => {
		const release = makeRelease({ guid: "already-grabbed-guid" });
		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Test Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				case 8:
					return [];
				// History returns the same guid
				case 9:
					return [{ data: { guid: "already-grabbed-guid" } }];
				default:
					return [];
			}
		});
		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(0);
	});

	it("handles upgrade ceiling with CF score threshold", async () => {
		// Profile with upgrade allowed and CF threshold
		const release = makeRelease({
			quality: { id: 3, name: "PDF", weight: 3, color: "#00f" },
			cfScore: 15,
		});

		// Setup with existing file at cutoff weight AND CF score at threshold
		const profile = makeProfile({
			upgradeAllowed: true,
			cutoff: 3,
			upgradeUntilCustomFormatScore: 10,
		});
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Test Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				// Existing file at cutoff weight (3)
				case 7:
					return [{ quality: { quality: { id: 3 } } }];
				case 8:
					return [];
				case 9:
					return [];
				default:
					return [];
			}
		});
		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		// With CF threshold > 0, the book is still considered wanted
		// because we can't compute CF scores for existing files
		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		// Book should be searched (optimistically included for CF-based upgrades)
		expect(result.searched).toBeGreaterThanOrEqual(1);
	});

	it("does not upgrade when existing file is at ceiling with bestExistingWeight > 0 and upgrade not allowed", async () => {
		const release = makeRelease({
			quality: { id: 5, name: "FLAC", weight: 5, color: "#0f0" },
		});

		setupFilteringFlow([release], { upgradeAllowed: false, cutoff: 3 }, [3]);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		expect(result.grabbed).toBe(0);
	});

	it("selects release with higher CF score as upgrade at same quality weight", async () => {
		const existing = makeRelease({
			guid: "existing",
			quality: { id: 2, name: "EPUB", weight: 2, color: "#0f0" },
			cfScore: 0,
		});
		const upgrade = makeRelease({
			guid: "upgrade-cf",
			title: "Better CF Release",
			quality: { id: 2, name: "EPUB", weight: 2, color: "#0f0" },
			cfScore: 20,
		});

		const mockProvider = { addDownload: vi.fn(async () => "dl-cf") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "books",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		setupFilteringFlow(
			[existing, upgrade],
			{
				upgradeAllowed: true,
				cutoff: 5,
				upgradeUntilCustomFormatScore: 0,
			},
			[1],
		);

		const result = await runAutoSearch({ bookIds: [10], maxBooks: 1 });

		expect(result.grabbed).toBe(1);
		expect(result.details[0].releaseTitle).toBe("Better CF Release");
	});
});

// ─── Synced indexer paths ─────────────────────────────────────────────────

describe("synced indexer paths", () => {
	it("uses synced indexers with API key for book search", async () => {
		const release = buildRelease({
			guid: "network-failure-guid",
			title: "Network Failure Release",
		});
		const manualIndexer = buildManualIndexer({
			id: 10,
			name: "Manual Failure",
		});
		const syncedIndexer = buildSyncedIndexer({
			id: 11,
			name: "Synced Success",
		});
		const downloadClient = buildDownloadClient({ id: 20, name: "SABnzbd" });

		const mockProvider = { addDownload: vi.fn(async () => "dl-sync") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: downloadClient.id };
				case 2:
					return downloadClient;
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				// getEnabledIndexers: manual
				case 1:
					return [manualIndexer];
				// getEnabledIndexers: synced
				case 2:
					return [syncedIndexer];
				// getWantedBooks
				case 3:
					return [
						{
							id: 10,
							title: "Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				case 8:
					return [];
				case 9:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab
			.mockRejectedValueOnce(new Error("Manual indexer network failure"))
			.mockResolvedValueOnce([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await runAutoSearch({
			bookIds: [10],
			maxBooks: 1,
		});

		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(1);
		expect(mocks.searchNewznab).toHaveBeenCalled();
	});

	it("skips synced indexer without API key", async () => {
		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [];
				case 2:
					return [
						{
							id: 10,
							name: "NoKeyIx",
							baseUrl: "http://nokey",
							apiPath: "/api",
							apiKey: null, // no API key
							enableRss: true,
							priority: 1,
						},
					];
				case 3:
					return [
						{
							id: 10,
							title: "Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				default:
					return [];
			}
		});

		const result = await runAutoSearch({
			bookIds: [10],
			maxBooks: 1,
		});

		// Searched but no releases since indexer was skipped
		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(0);
		expect(mocks.searchNewznab).not.toHaveBeenCalled();
	});

	it("handles rate limiter pacing for synced indexer", async () => {
		let callCount = 0;
		mocks.canQueryIndexer.mockImplementation(() => {
			callCount += 1;
			if (callCount === 1) {
				return { allowed: false, reason: "pacing", waitMs: 1 };
			}
			return { allowed: true };
		});

		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [];
				case 2:
					return [
						{
							id: 10,
							name: "PacedIx",
							baseUrl: "http://paced",
							apiPath: "/api",
							apiKey: "key",
							enableRss: true,
							priority: 1,
						},
					];
				case 3:
					return [
						{
							id: 10,
							title: "Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				default:
					return [];
			}
		});

		const result = await runAutoSearch({
			bookIds: [10],
			maxBooks: 1,
		});

		// The search should still proceed after waiting
		expect(result.searched).toBe(1);
	});
});

// ─── Grab flow with tracked downloads ─────────────────────────────────────

describe("grab flow with tracked downloads", () => {
	it("inserts tracked download when downloadId is returned", async () => {
		const release = makeRelease();
		const mockProvider = { addDownload: vi.fn(async () => "tracked-dl-1") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "books",
						tag: "auto",
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: "indexer-tag" };
				default:
					return undefined;
			}
		});

		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				case 8:
					return [];
				case 9:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await runAutoSearch({
			bookIds: [10],
			maxBooks: 1,
		});

		expect(result.grabbed).toBe(1);
		// trackedDownload insert + history insert = at least 2 insert calls
		expect(mocks.insertRun).toHaveBeenCalled();
	});

	it("records history even when addDownload returns null (no downloadId)", async () => {
		const release = makeRelease();
		const mockProvider = { addDownload: vi.fn(async () => null) };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "books",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				case 8:
					return [];
				case 9:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await runAutoSearch({
			bookIds: [10],
			maxBooks: 1,
		});

		// Still grabbed (returns true) and history is recorded
		expect(result.grabbed).toBe(1);
		// At least 1 insert call for history (no tracked download insert since downloadId is null)
		expect(mocks.insertRun).toHaveBeenCalled();
	});

	it("uses fallback download client when indexer has no override", async () => {
		const release = makeRelease();
		const mockProvider = { addDownload: vi.fn(async () => "dl-fallback") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			switch (getCallIdx.n) {
				// indexer row — no downloadClientId
				case 1:
					return { downloadClientId: null };
				// tag
				case 2:
					return { tag: null };
				default:
					return undefined;
			}
		});

		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				case 6:
					return [];
				case 7:
					return [];
				case 8:
					return [];
				case 9:
					return [];
				// downloadClients.all() — fallback client
				case 10:
					return [
						{
							id: 7,
							name: "FallbackClient",
							implementation: "sabnzbd",
							host: "localhost",
							port: 8080,
							useSsl: false,
							urlBase: "",
							username: "",
							password: "",
							apiKey: "abc",
							category: "books",
							tag: null,
							protocol: "usenet",
							enabled: true,
							priority: 1,
							settings: null,
						},
					];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await runAutoSearch({
			bookIds: [10],
			maxBooks: 1,
		});

		expect(result.grabbed).toBe(1);
		expect(mockProvider.addDownload).toHaveBeenCalled();
	});
});

// ─── searchForAuthorBooks integration ─────────────────────────────────────

describe("searchForAuthorBooks — with books", () => {
	it("searches books belonging to an author", async () => {
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				// searchForAuthorBooks: author's book IDs
				case 1:
					return [{ bookId: 10 }, { bookId: 11 }];
				// runAutoSearch → getEnabledIndexers: manual
				case 2:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				// getEnabledIndexers: synced
				case 3:
					return [];
				// getWantedBooks: none matching bookIds [10,11]
				case 4:
					return [];
				default:
					return [];
			}
		});

		const result = await searchForAuthorBooks(1);

		expect(result).toEqual({ searched: 0, grabbed: 0 });
	});
});

// ─── WantedBooks edge cases ───────────────────────────────────────────────

describe("getWantedBooks edge cases (via runAutoSearch)", () => {
	it("skips books whose primary author is not monitored", async () => {
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				// getWantedBooks: author not monitored
				case 3:
					return [
						{
							id: 10,
							title: "Unmonitored Author Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Unmonitored",
							authorMonitored: false,
						},
					];
				default:
					return [];
			}
		});

		const result = await runAutoSearch({ bookIds: [10] });
		expect(result.searched).toBe(0);
		expect(result.grabbed).toBe(0);
	});

	it("skips books with no edition download profiles", async () => {
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "No Profiles Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				// getEditionProfilesForBook returns empty
				case 4:
					return [];
				default:
					return [];
			}
		});

		const result = await runAutoSearch({ bookIds: [10] });
		expect(result.searched).toBe(0);
	});

	it("skips profiles with active tracked downloads", async () => {
		const profile = makeProfile();
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [
						{
							id: 10,
							title: "Active DL Book",
							lastSearchedAt: null,
							authorId: 1,
							authorName: "Author",
							authorMonitored: true,
						},
					];
				case 4:
					return [{ editionId: 100, profileId: profile.id }];
				case 5:
					return [profile];
				// activeDownloads — this profile has an active download
				case 6:
					return [{ downloadProfileId: profile.id }];
				default:
					return [];
			}
		});

		const result = await runAutoSearch({ bookIds: [10] });
		expect(result.searched).toBe(0);
	});
});

// ─── Episode search query builders ───────────────────────────────────────

describe("searchForShow — episode search query variants", () => {
	function setupSingleEpisodeSearch(
		episode: Record<string, unknown>,
		releases: ReturnType<typeof makeRelease>[] = [],
	) {
		const profile = makeProfile({ id: 20, name: "ShowProfile" });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				// getWantedEpisodes
				case 1:
					return [episode];
				// profileRows
				case 2:
					return [{ profileId: profile.id }];
				// profileList
				case 3:
					return [profile];
				// activeDownloads
				case 4:
					return [];
				// existingFiles
				case 5:
					return [];
				// getEnabledIndexers: manual
				case 6:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				// getEnabledIndexers: synced
				case 7:
					return [];
				// blocklist
				case 8:
					return [];
				// history
				case 9:
					return [];
				default:
					return [];
			}
		});
		mocks.searchNewznab.mockResolvedValue(releases);
		mocks.dedupeAndScoreReleases.mockReturnValue(releases);
		return { profile };
	}

	it("builds daily episode search query using air date", async () => {
		setupSingleEpisodeSearch({
			id: 100,
			showId: 1,
			showTitle: "Daily Show",
			seasonNumber: 2024,
			episodeNumber: 1,
			absoluteNumber: null,
			seriesType: "daily",
			airDate: "2024-03-15",
			lastSearchedAt: null,
		});

		await searchForShow(1);

		expect(mocks.searchNewznab).toHaveBeenCalled();
		const searchCall = mocks.searchNewznab.mock.calls[0];
		const query = searchCall[1] as string;
		expect(query).toContain("2024-03-15");
		expect(query).toContain("Daily Show");
	});

	it("builds anime episode search queries with absolute numbering", async () => {
		setupSingleEpisodeSearch({
			id: 100,
			showId: 1,
			showTitle: "Anime Show",
			seasonNumber: 1,
			episodeNumber: 5,
			absoluteNumber: 17,
			seriesType: "anime",
			airDate: null,
			lastSearchedAt: null,
		});

		await searchForShow(1);

		// Anime generates multiple search queries (S##E## and absolute number)
		expect(mocks.searchNewznab).toHaveBeenCalled();
		const allQueries = mocks.searchNewznab.mock.calls.map(
			(c: unknown[]) => c[1] as string,
		);
		// Should have queries for both S01E05 and absolute number 17
		const hasSeasonalQuery = allQueries.some(
			(q: string) => q.includes("S01E05") && q.includes("Anime Show"),
		);
		const hasAbsoluteQuery = allQueries.some(
			(q: string) => q.includes("17") && q.includes("Anime Show"),
		);
		expect(hasSeasonalQuery).toBe(true);
		expect(hasAbsoluteQuery).toBe(true);
	});

	it("builds anime search without absolute number when null", async () => {
		setupSingleEpisodeSearch({
			id: 100,
			showId: 1,
			showTitle: "Anime No Abs",
			seasonNumber: 1,
			episodeNumber: 3,
			absoluteNumber: null,
			seriesType: "anime",
			airDate: null,
			lastSearchedAt: null,
		});

		await searchForShow(1);

		expect(mocks.searchNewznab).toHaveBeenCalled();
		const allQueries = mocks.searchNewznab.mock.calls.map(
			(c: unknown[]) => c[1] as string,
		);
		// Only S01E03 query, no absolute number query
		expect(
			allQueries.some(
				(q: string) => q.includes("S01E03") && q.includes("Anime No Abs"),
			),
		).toBe(true);
	});

	it("builds standard episode search query", async () => {
		setupSingleEpisodeSearch({
			id: 100,
			showId: 1,
			showTitle: "Standard Show",
			seasonNumber: 2,
			episodeNumber: 10,
			absoluteNumber: null,
			seriesType: "standard",
			airDate: null,
			lastSearchedAt: null,
		});

		await searchForShow(1);

		expect(mocks.searchNewznab).toHaveBeenCalled();
		const query = mocks.searchNewznab.mock.calls[0][1] as string;
		expect(query).toContain("S02E10");
		expect(query).toContain("Standard Show");
	});
});

// ─── Episode grab and tracked download flow ───────────────────────────────

describe("searchForShow — episode grab flow", () => {
	it("grabs episode release and records tracked download", async () => {
		const release = makeRelease({
			guid: "ep-grab-guid",
			title: "Show.S01E01.720p",
			quality: { id: 4, name: "HDTV-720p", weight: 4, color: "#0f0" },
		});

		const mockProvider = { addDownload: vi.fn(async () => "dl-ep-track") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "tv",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		const profile = makeProfile({ id: 20 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 100,
							showId: 1,
							showTitle: "Test Show",
							seasonNumber: 1,
							episodeNumber: 1,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
					];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				case 5:
					return [];
				case 6:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 7:
					return [];
				case 8:
					return [];
				case 9:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await searchForShow(1);

		expect(result.grabbed).toBe(1);
		expect(mocks.insertRun).toHaveBeenCalled();
		expect(mockProvider.addDownload).toHaveBeenCalled();
	});

	it("handles episode with no download client", async () => {
		const release = makeRelease({
			guid: "ep-no-dc",
			title: "Show.S01E01.720p",
		});

		mocks.selectGet.mockReturnValue(undefined);

		const profile = makeProfile({ id: 20 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 100,
							showId: 1,
							showTitle: "Test Show",
							seasonNumber: 1,
							episodeNumber: 1,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
					];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				case 5:
					return [];
				case 6:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 7:
					return [];
				// blocklist
				case 8:
					return [];
				// history
				case 9:
					return [];
				// downloadClients — empty
				case 10:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await searchForShow(1);

		expect(result.searched).toBeGreaterThanOrEqual(1);
		expect(result.grabbed).toBe(0);
		expect(mocks.logWarn).toHaveBeenCalled();
	});
});

// ─── Full auto-search with episodes ───────────────────────────────────────

describe("runAutoSearch — episodes in full auto-search", () => {
	it("processes episodes with multi-season show-level search", async () => {
		const profile = makeProfile({ id: 20 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				// getEnabledIndexers: manual
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				// getEnabledIndexers: synced
				case 2:
					return [];
				// getWantedBooks: none
				case 3:
					return [];
				// getWantedMovies: none
				case 4:
					return [];
				// getWantedEpisodes: 2 episodes across 2 seasons
				case 5:
					return [
						{
							id: 100,
							showId: 1,
							showTitle: "Multi Season Show",
							seasonNumber: 1,
							episodeNumber: 1,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
						{
							id: 101,
							showId: 1,
							showTitle: "Multi Season Show",
							seasonNumber: 2,
							episodeNumber: 1,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
					];
				// Episode 1: profileRows, profileList, activeDownloads, existingFiles
				case 6:
					return [{ profileId: profile.id }];
				case 7:
					return [profile];
				case 8:
					return [];
				case 9:
					return [];
				// Episode 2: profileRows, profileList, activeDownloads, existingFiles
				case 10:
					return [{ profileId: profile.id }];
				case 11:
					return [profile];
				case 12:
					return [];
				case 13:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([]);
		mocks.dedupeAndScoreReleases.mockReturnValue([]);

		const result = await runAutoSearch({ delayBetweenBooks: 0 });

		// Episodes should be searched
		expect(result.searched).toBeGreaterThanOrEqual(2);
		expect(result.episodeDetails).toBeDefined();
	});

	it("records episode errors gracefully in full auto-search", async () => {
		mocks.searchNewznab.mockResolvedValue([makeRelease()]);
		mocks.dedupeAndScoreReleases.mockImplementation(() => {
			throw new Error("Episode parse error");
		});

		const profile = makeProfile({ id: 20 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 2:
					return [];
				case 3:
					return [];
				case 4:
					return [];
				// getWantedEpisodes: single episode
				case 5:
					return [
						{
							id: 100,
							showId: 1,
							showTitle: "Error Show",
							seasonNumber: 1,
							episodeNumber: 1,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
					];
				case 6:
					return [{ profileId: profile.id }];
				case 7:
					return [profile];
				case 8:
					return [];
				case 9:
					return [];
				default:
					return [];
			}
		});

		const result = await runAutoSearch({ delayBetweenBooks: 0 });
		const episodeDetails = requireValue(result.episodeDetails);

		expect(result.errors).toBe(1);
		expect(episodeDetails.length).toBe(1);
		expect(episodeDetails[0].error).toBe("Episode parse error");
	});
});

// ─── searchForShow with cutoffUnmet ──────────────────────────────────────

describe("searchForShow — cutoffUnmet", () => {
	it("includes episodes with existing files when cutoffUnmet is true", async () => {
		const profile = makeProfile({
			id: 20,
			upgradeAllowed: true,
			cutoff: 7,
		});
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				// getWantedEpisodes
				case 1:
					return [
						{
							id: 100,
							showId: 1,
							showTitle: "Upgrade Show",
							seasonNumber: 1,
							episodeNumber: 1,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
					];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				// existingFiles — at lower quality
				case 5:
					return [{ quality: { quality: { id: 3 } } }];
				// getEnabledIndexers
				case 6:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 7:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([]);

		const result = await searchForShow(1, true);

		// Episode should be wanted since it has files below cutoff and cutoffUnmet is true
		expect(result.searched).toBeGreaterThanOrEqual(1);
	});

	it("excludes episodes with existing files when cutoffUnmet is false", async () => {
		const profile = makeProfile({
			id: 20,
			upgradeAllowed: true,
			cutoff: 7,
		});
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 100,
							showId: 1,
							showTitle: "No Upgrade Show",
							seasonNumber: 1,
							episodeNumber: 1,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
					];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				// existingFiles — has a file
				case 5:
					return [{ quality: { quality: { id: 3 } } }];
				default:
					return [];
			}
		});

		const result = await searchForShow(1, false);

		// With cutoffUnmet=false, episodes with files are excluded
		expect(result).toEqual({ searched: 0, grabbed: 0 });
	});
});

// ─── searchForShow — season pack handling ────────────────────────────────

describe("searchForShow — season-level pack", () => {
	it("searches season-level first for 2+ episodes in same season", async () => {
		const profile = makeProfile({ id: 20 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				// getWantedEpisodes: 2 episodes in same season
				case 1:
					return [
						{
							id: 100,
							showId: 1,
							showTitle: "Pack Show",
							seasonNumber: 1,
							episodeNumber: 1,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
						{
							id: 101,
							showId: 1,
							showTitle: "Pack Show",
							seasonNumber: 1,
							episodeNumber: 2,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
					];
				// Episode 1: profileRows, profileList, activeDownloads, existingFiles
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				case 5:
					return [];
				// Episode 2
				case 6:
					return [{ profileId: profile.id }];
				case 7:
					return [profile];
				case 8:
					return [];
				case 9:
					return [];
				// getEnabledIndexers
				case 10:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 11:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([]);

		const result = await searchForShow(1);

		// Season-level search + 2 individual episode searches
		expect(mocks.searchNewznab).toHaveBeenCalled();
		expect(result.searched).toBeGreaterThanOrEqual(2);
	});

	it("grabs season pack and skips individual episodes when pack succeeds", async () => {
		const packRelease = makeRelease({
			guid: "season-pack-guid",
			title: "Pack.Show.S01.1080p",
			releaseType: 2, // season pack
		});

		mocks.getReleaseTypeRank.mockReturnValue(2);

		const mockProvider = { addDownload: vi.fn(async () => "dl-pack") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "tv",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		const profile = makeProfile({ id: 20 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 100,
							showId: 1,
							showTitle: "Pack Show",
							seasonNumber: 1,
							episodeNumber: 1,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
						{
							id: 101,
							showId: 1,
							showTitle: "Pack Show",
							seasonNumber: 1,
							episodeNumber: 2,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
					];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				case 5:
					return [];
				case 6:
					return [{ profileId: profile.id }];
				case 7:
					return [profile];
				case 8:
					return [];
				case 9:
					return [];
				case 10:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 11:
					return [];
				// blocklist for show
				case 12:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([packRelease]);
		mocks.dedupeAndScoreReleases.mockReturnValue([packRelease]);

		const result = await searchForShow(1);

		expect(result.grabbed).toBeGreaterThanOrEqual(1);
		expect(mockProvider.addDownload).toHaveBeenCalled();
	});
});

// ─── Movie upgrade with CF score ─────────────────────────────────────────

describe("getWantedMovies — CF upgrade threshold", () => {
	it("includes movie with CF upgrade threshold when at quality cutoff", async () => {
		const release = makeRelease({
			guid: "movie-cf-guid",
			title: "Movie.CF.Upgrade",
			quality: { id: 7, name: "Bluray-1080p", weight: 7, color: "#0f0" },
			cfScore: 20,
		});

		const mockProvider = { addDownload: vi.fn(async () => "dl-cf-movie") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "movies",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		const profile = makeProfile({
			id: 10,
			upgradeAllowed: true,
			cutoff: 7,
			upgradeUntilCustomFormatScore: 25,
		});
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 5,
							title: "CF Movie",
							year: 2024,
							lastSearchedAt: null,
						},
					];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				// existing file at cutoff weight (7) but CF threshold not met
				case 5:
					return [{ quality: { quality: { id: 7 } } }];
				case 6:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 7:
					return [];
				case 8:
					return [];
				case 9:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await searchForMovie(5);

		// Movie should be searched because CF upgrade threshold is set
		expect(result.searched).toBe(1);
	});
});

// ─── Synced indexer for movie/episode searches ───────────────────────────

describe("searchForMovie — synced indexer paths", () => {
	it("uses synced indexer for movie search", async () => {
		const release = makeRelease({
			guid: "synced-movie",
			title: "Synced.Movie.2024",
		});

		const mockProvider = { addDownload: vi.fn(async () => "dl-syn-mov") };
		mocks.getProvider.mockResolvedValue(mockProvider);

		const getCallIdx = { n: 0 };
		mocks.selectGet.mockImplementation(() => {
			getCallIdx.n += 1;
			const cycle = ((getCallIdx.n - 1) % 3) + 1;
			switch (cycle) {
				case 1:
					return { downloadClientId: 5 };
				case 2:
					return {
						id: 5,
						name: "SABnzbd",
						implementation: "sabnzbd",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: "",
						username: "",
						password: "",
						apiKey: "abc",
						category: "movies",
						tag: null,
						protocol: "usenet",
						enabled: true,
						priority: 1,
						settings: null,
					};
				case 3:
					return { tag: null };
				default:
					return undefined;
			}
		});

		const profile = makeProfile({ id: 10 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 5,
							title: "Synced Movie",
							year: 2024,
							lastSearchedAt: null,
						},
					];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				case 5:
					return [];
				// getEnabledIndexers: manual — empty
				case 6:
					return [];
				// getEnabledIndexers: synced — has indexer
				case 7:
					return [
						{
							id: 10,
							name: "SyncedIx",
							baseUrl: "http://synced",
							apiPath: "/api",
							apiKey: "sync-key",
							enableRss: true,
							priority: 1,
						},
					];
				case 8:
					return [];
				case 9:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([release]);
		mocks.dedupeAndScoreReleases.mockReturnValue([release]);

		const result = await searchForMovie(5);

		expect(result.searched).toBe(1);
		expect(result.grabbed).toBe(1);
		expect(mocks.searchNewznab).toHaveBeenCalled();
	});
});

// ─── Episode existing file quality parsing ───────────────────────────────

describe("getWantedEpisodes — quality parsing edge cases", () => {
	it("handles episode file with no quality object", async () => {
		const profile = makeProfile({ id: 20, upgradeAllowed: true, cutoff: 7 });
		const callIdx = { n: 0 };
		mocks.selectAll.mockImplementation(() => {
			callIdx.n += 1;
			switch (callIdx.n) {
				case 1:
					return [
						{
							id: 100,
							showId: 1,
							showTitle: "Quality Edge Show",
							seasonNumber: 1,
							episodeNumber: 1,
							absoluteNumber: null,
							seriesType: "standard",
							airDate: null,
							lastSearchedAt: null,
						},
					];
				case 2:
					return [{ profileId: profile.id }];
				case 3:
					return [profile];
				case 4:
					return [];
				// existingFiles with null quality
				case 5:
					return [{ quality: null }];
				// getEnabledIndexers
				case 6:
					return [
						{
							id: 1,
							name: "ix",
							baseUrl: "http://ix",
							apiPath: "/api",
							apiKey: "key1",
							enableRss: true,
							priority: 1,
						},
					];
				case 7:
					return [];
				default:
					return [];
			}
		});

		mocks.searchNewznab.mockResolvedValue([]);

		// cutoffUnmet = true to exercise upgrade path with null quality
		const result = await searchForShow(1, true);

		// Should still work — episode is wanted because file quality is null (weight 0) and below cutoff
		expect(result.searched).toBeGreaterThanOrEqual(1);
	});
});
