import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexerRelease } from "../indexers/types";
import { ReleaseType } from "../indexers/types";

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	requireAdmin: vi.fn(),
	getProvider: vi.fn(),
	testNewznab: vi.fn(),
	searchNewznab: vi.fn(),
	canQueryIndexer: vi.fn(),
	canGrabIndexer: vi.fn(),
	getAllIndexerStatuses: vi.fn(),
	enrichRelease: vi.fn((r: unknown) => r),
	getDefSizeLimits: vi.fn(),
	getFormatType: vi.fn(),
	getProfileWeight: vi.fn(() => 0),
	isFormatInProfile: vi.fn(() => true),
	matchAllFormats: vi.fn((): unknown[] => []),
	parseReleaseGroup: vi.fn(),
	calculateCFScore: vi.fn(() => ({
		totalScore: 0,
		matchedFormats: [] as unknown[],
	})),
	fetchQueueItems: vi.fn((): unknown => ({ items: [], warnings: [] })),
	selectAll: vi.fn((): unknown[] => []),
	selectGet: vi.fn((): unknown => undefined),
	insertReturningGet: vi.fn((): unknown => undefined),
	insertRun: vi.fn(),
	transactionInsertRun: vi.fn(),
	transaction: vi.fn((fn: (tx: unknown) => unknown): unknown => fn({})),
	updateReturningGet: vi.fn((): unknown => undefined),
	deleteRun: vi.fn(),
	tokenSetRatio: vi.fn((_a: string, _b: string): number => 100),
	partialRatio: vi.fn((_a: string, _b: string): number => 100),
}));

// ─── Module mocks ───────────────────────────────────────────────────────────

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
		inputValidator: (validator: (input: unknown) => unknown) => ({
			handler:
				(handler: (input: { data: unknown }) => unknown) =>
				(input: { data: unknown }) =>
					handler({ data: validator(input.data) }),
		}),
	}),
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
	asc: vi.fn((col: unknown) => ({ col, dir: "asc" })),
	desc: vi.fn((col: unknown) => ({ col, dir: "desc" })),
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
	inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
}));

vi.mock("fuzzball", () => ({
	token_set_ratio: mocks.tokenSetRatio,
	partial_ratio: mocks.partialRatio,
}));

vi.mock("../middleware", () => ({
	requireAdmin: mocks.requireAdmin,
	requireAuth: mocks.requireAuth,
}));

vi.mock("../download-clients/registry", () => ({
	default: mocks.getProvider,
}));

vi.mock("../indexer-rate-limiter", () => ({
	canQueryIndexer: mocks.canQueryIndexer,
	canGrabIndexer: mocks.canGrabIndexer,
	getAllIndexerStatuses: mocks.getAllIndexerStatuses,
}));

vi.mock("../indexers/cf-scoring", () => ({
	calculateCFScore: mocks.calculateCFScore,
}));

vi.mock("../indexers/format-parser", () => ({
	enrichRelease: mocks.enrichRelease,
	getDefSizeLimits: mocks.getDefSizeLimits,
	getFormatType: mocks.getFormatType,
	getProfileWeight: mocks.getProfileWeight,
	isFormatInProfile: mocks.isFormatInProfile,
	matchAllFormats: mocks.matchAllFormats,
	parseReleaseGroup: mocks.parseReleaseGroup,
}));

vi.mock("../indexers/http", () => ({
	searchNewznab: mocks.searchNewznab,
	testNewznab: mocks.testNewznab,
}));

vi.mock("../queue", () => ({
	fetchQueueItems: mocks.fetchQueueItems,
}));

/*
 * DB mock — supports chained builder patterns:
 *   select().from().where().all()
 *   select().from().where().get()
 *   select().from().orderBy().all()
 *   select().from().innerJoin().where().limit().get()
 *   insert().values().returning().get()
 *   insert().values().run()
 *   transaction((tx) => tx.insert().values().run())
 *   update().set().where().returning().get()
 *   delete().where().run()
 */
vi.mock("src/db", () => {
	const makeSelectChain = () => {
		const chain = {
			from: vi.fn(() => chain),
			where: vi.fn(() => chain),
			orderBy: vi.fn(() => chain),
			innerJoin: vi.fn(() => chain),
			leftJoin: vi.fn(() => chain),
			limit: vi.fn(() => chain),
			all: mocks.selectAll,
			get: mocks.selectGet,
		};
		return chain;
	};
	return {
		db: {
			select: vi.fn(makeSelectChain),
			insert: vi.fn(() => ({
				values: vi.fn(() => ({
					returning: vi.fn(() => ({
						get: mocks.insertReturningGet,
					})),
					run: mocks.insertRun,
				})),
			})),
			transaction: vi.fn((fn: (tx: unknown) => unknown) =>
				mocks.transaction(fn),
			),
			update: vi.fn(() => ({
				set: vi.fn(() => ({
					where: vi.fn(() => ({
						returning: vi.fn(() => ({
							get: mocks.updateReturningGet,
						})),
					})),
				})),
			})),
			delete: vi.fn(() => ({
				where: vi.fn(() => ({
					run: mocks.deleteRun,
				})),
			})),
		},
	};
});

vi.mock("src/db/schema", () => ({
	authorDownloadProfiles: {
		authorId: "adp.authorId",
		downloadProfileId: "adp.downloadProfileId",
	},
	blocklist: { id: "bl.id", sourceTitle: "bl.sourceTitle" },
	bookFiles: { bookId: "bf.bookId", quality: "bf.quality" },
	books: { id: "books.id", title: "books.title" },
	booksAuthors: {
		bookId: "ba.bookId",
		authorId: "ba.authorId",
		isPrimary: "ba.isPrimary",
		authorName: "ba.authorName",
	},
	downloadClients: {
		id: "dc.id",
		enabled: "dc.enabled",
		priority: "dc.priority",
		protocol: "dc.protocol",
	},
	downloadProfiles: { id: "dp.id" },
	editionDownloadProfiles: { editionId: "edp.editionId" },
	editions: {
		id: "ed.id",
		bookId: "ed.bookId",
		pageCount: "ed.pageCount",
		audioLength: "ed.audioLength",
	},
	history: { eventType: "h.eventType", bookId: "h.bookId", data: "h.data" },
	indexers: {
		id: "ix.id",
		enableAutomaticSearch: "ix.enableAutomaticSearch",
		priority: "ix.priority",
		downloadClientId: "ix.downloadClientId",
		tag: "ix.tag",
	},
	syncedIndexers: {
		id: "si.id",
		name: "si.name",
		enableSearch: "si.enableSearch",
		priority: "si.priority",
		downloadClientId: "si.downloadClientId",
		tag: "si.tag",
	},
	trackedDownloads: { downloadClientId: "td.downloadClientId" },
}));

beforeEach(() => {
	vi.clearAllMocks();
	// Reset return-value queues that clearAllMocks does not touch
	mocks.selectAll.mockReset();
	mocks.selectGet.mockReset();
	mocks.insertReturningGet.mockReset();
	mocks.transactionInsertRun.mockReset();
	mocks.transaction.mockReset();
	mocks.updateReturningGet.mockReset();
	// Re-apply safe defaults
	mocks.selectAll.mockReturnValue([]);
	mocks.selectGet.mockReturnValue(undefined);
	mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
		fn({
			insert: vi.fn(() => ({
				values: vi.fn(() => ({
					run: mocks.transactionInsertRun,
				})),
			})),
		}),
	);
	mocks.enrichRelease.mockImplementation((r: unknown) => r);
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRelease(overrides: Partial<IndexerRelease> = {}): IndexerRelease {
	return {
		guid: `guid-${Math.random().toString(36).slice(2, 8)}`,
		title: "Robert Jordan - The Eye of the World (epub)",
		size: 5 * 1024 * 1024,
		downloadUrl: "https://example.com/download/123",
		infoUrl: null,
		publishDate: null,
		indexerId: 1,
		indexer: "TestIndexer",
		protocol: "usenet",
		seeders: null,
		leechers: null,
		grabs: null,
		categories: null,
		age: 10,
		indexerFlags: null,
		allstarrIndexerId: 1,
		indexerSource: "manual",
		quality: { id: 1, name: "EPUB", weight: 10, color: "blue" },
		sizeFormatted: "5 MB",
		ageFormatted: "10d",
		rejections: [],
		formatScore: 0,
		formatScoreDetails: [],
		cfScore: 0,
		cfDetails: [],
		releaseType: ReleaseType.SingleBook,
		packInfo: null,
		...overrides,
	};
}

function makeClient(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: "qBit",
		implementation: "qBittorrent",
		protocol: "torrent",
		enabled: true,
		priority: 1,
		host: "localhost",
		port: 8080,
		useSsl: false,
		urlBase: null,
		username: null,
		password: null,
		apiKey: null,
		category: "allstarr",
		tag: null,
		removeCompletedDownloads: true,
		settings: null,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		...overrides,
	};
}

// ─── getCategoriesForProfiles ───────────────────────────────────────────────

describe("getCategoriesForProfiles", () => {
	it("returns empty array for profiles with no categories", async () => {
		const { getCategoriesForProfiles } = await import("../indexers");
		const result = getCategoriesForProfiles([
			{
				id: 1,
				name: "P1",
				items: [[1]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [],
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 0,
			},
		]);
		expect(result).toEqual([]);
	});

	it("returns union of categories across multiple profiles", async () => {
		const { getCategoriesForProfiles } = await import("../indexers");
		const result = getCategoriesForProfiles([
			{
				id: 1,
				name: "P1",
				items: [[1]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [3030, 7020],
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 0,
			},
			{
				id: 2,
				name: "P2",
				items: [[2]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [7020, 8000],
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 0,
			},
		]);
		expect(result.sort()).toEqual([3030, 7020, 8000]);
	});

	it("returns empty array when given empty profiles array", async () => {
		const { getCategoriesForProfiles } = await import("../indexers");
		expect(getCategoriesForProfiles([])).toEqual([]);
	});
});

// ─── getReleaseTypeRank ─────────────────────────────────────────────────────

describe("getReleaseTypeRank", () => {
	it("returns correct ranks for each release type", async () => {
		const { getReleaseTypeRank } = await import("../indexers");

		expect(getReleaseTypeRank(ReleaseType.MultiSeasonPack)).toBe(4);
		expect(getReleaseTypeRank(ReleaseType.SeasonPack)).toBe(3);
		expect(getReleaseTypeRank(ReleaseType.MultiEpisode)).toBe(2);
		expect(getReleaseTypeRank(ReleaseType.AuthorPack)).toBe(2);
		expect(getReleaseTypeRank(ReleaseType.SingleEpisode)).toBe(1);
		expect(getReleaseTypeRank(ReleaseType.SingleBook)).toBe(1);
		expect(getReleaseTypeRank(ReleaseType.Unknown)).toBe(0);
	});
});

// ─── isPackQualified ────────────────────────────────────────────────────────

describe("isPackQualified", () => {
	it("returns true for non-pack releases (SingleBook)", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({ releaseType: ReleaseType.SingleBook });
		expect(isPackQualified(release, null)).toBe(true);
	});

	it("returns true for non-pack releases (SingleEpisode)", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({ releaseType: ReleaseType.SingleEpisode });
		expect(isPackQualified(release, null)).toBe(true);
	});

	it("returns true for pack releases when no context provided", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.SeasonPack,
			packInfo: { seasons: [1] },
		});
		expect(isPackQualified(release, null)).toBe(true);
	});

	it("returns true for pack releases when packInfo is null", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.SeasonPack,
			packInfo: null,
		});
		expect(
			isPackQualified(release, { wantedEpisodesBySeason: new Map() }),
		).toBe(true);
	});

	// MultiSeasonPack
	it("returns true for MultiSeasonPack when all seasons wanted", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.MultiSeasonPack,
			packInfo: { seasons: [1, 2] },
		});
		const ctx = {
			wantedEpisodesBySeason: new Map([
				[1, new Set([1, 2, 3])],
				[2, new Set([1, 2])],
			]),
		};
		expect(isPackQualified(release, ctx)).toBe(true);
	});

	it("returns false for MultiSeasonPack when a season is not wanted", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.MultiSeasonPack,
			packInfo: { seasons: [1, 3] },
		});
		const ctx = {
			wantedEpisodesBySeason: new Map([
				[1, new Set([1, 2])],
				// season 3 not present
			]),
		};
		expect(isPackQualified(release, ctx)).toBe(false);
	});

	it("returns true for MultiSeasonPack with no seasons (Complete Series) when totalWantedSeasons > 0", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.MultiSeasonPack,
			packInfo: { seasons: [] },
		});
		expect(
			isPackQualified(release, {
				wantedEpisodesBySeason: new Map(),
				totalWantedSeasons: 3,
			}),
		).toBe(true);
	});

	it("returns false for MultiSeasonPack with no seasons when totalWantedSeasons is 0", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.MultiSeasonPack,
			packInfo: { seasons: [] },
		});
		expect(
			isPackQualified(release, {
				wantedEpisodesBySeason: new Map(),
				totalWantedSeasons: 0,
			}),
		).toBe(false);
	});

	// SeasonPack
	it("returns true for SeasonPack when season has >= 2 wanted episodes", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.SeasonPack,
			packInfo: { seasons: [1] },
		});
		const ctx = {
			wantedEpisodesBySeason: new Map([[1, new Set([1, 2])]]),
		};
		expect(isPackQualified(release, ctx)).toBe(true);
	});

	it("returns false for SeasonPack when season has < 2 wanted episodes", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.SeasonPack,
			packInfo: { seasons: [1] },
		});
		const ctx = {
			wantedEpisodesBySeason: new Map([[1, new Set([5])]]),
		};
		expect(isPackQualified(release, ctx)).toBe(false);
	});

	// MultiEpisode
	it("returns true for MultiEpisode when all episodes wanted", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.MultiEpisode,
			packInfo: { seasons: [1], episodes: [2, 3] },
		});
		const ctx = {
			wantedEpisodesBySeason: new Map([[1, new Set([1, 2, 3, 4])]]),
		};
		expect(isPackQualified(release, ctx)).toBe(true);
	});

	it("returns false for MultiEpisode when not all episodes wanted", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.MultiEpisode,
			packInfo: { seasons: [1], episodes: [2, 3] },
		});
		const ctx = {
			wantedEpisodesBySeason: new Map([[1, new Set([1, 2])]]),
		};
		expect(isPackQualified(release, ctx)).toBe(false);
	});

	// AuthorPack
	it("returns true for AuthorPack when wanted books exist", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.AuthorPack,
			packInfo: {},
		});
		expect(
			isPackQualified(release, { wantedBookIds: new Set([1, 2, 3]) }),
		).toBe(true);
	});

	it("returns false for AuthorPack when no wanted books", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.AuthorPack,
			packInfo: {},
		});
		expect(isPackQualified(release, { wantedBookIds: new Set() })).toBe(false);
	});
});

// ─── dedupeAndScoreReleases ─────────────────────────────────────────────────

describe("dedupeAndScoreReleases", () => {
	it("deduplicates releases by guid", async () => {
		const { dedupeAndScoreReleases } = await import("../indexers");
		const r1 = makeRelease({ guid: "dup-guid", title: "Release 1" });
		const r2 = makeRelease({ guid: "dup-guid", title: "Release 2" });
		const r3 = makeRelease({ guid: "unique-guid", title: "Release 3" });

		const result = dedupeAndScoreReleases([r1, r2, r3], null, null);

		expect(result).toHaveLength(2);
		expect(result[0].title).toBe("Release 1");
		expect(result[1].title).toBe("Release 3");
	});

	it("filters irrelevant releases when bookInfo provided", async () => {
		// Make fuzzy matching fail for one release
		mocks.tokenSetRatio
			.mockReturnValueOnce(100) // r1 author pass
			.mockReturnValueOnce(100) // r1 title pass
			.mockReturnValueOnce(10) // r2 author fail
			.mockReturnValueOnce(10); // r2 partial also fails
		mocks.partialRatio
			.mockReturnValueOnce(100)
			.mockReturnValueOnce(100)
			.mockReturnValueOnce(10)
			.mockReturnValueOnce(10);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r1 = makeRelease({
			guid: "g1",
			title: "Robert Jordan - Eye of the World",
		});
		const r2 = makeRelease({
			guid: "g2",
			title: "Completely Irrelevant Title",
		});

		const result = dedupeAndScoreReleases([r1, r2], null, {
			title: "Eye of the World",
			authorName: "Robert Jordan",
		});

		expect(result).toHaveLength(1);
		expect(result[0].guid).toBe("g1");
	});

	it("returns all releases when bookInfo is null", async () => {
		const { dedupeAndScoreReleases } = await import("../indexers");
		const r1 = makeRelease({ guid: "g1" });
		const r2 = makeRelease({ guid: "g2" });

		const result = dedupeAndScoreReleases([r1, r2], null, null);
		expect(result).toHaveLength(2);
	});

	it("sorts releases by quality weight descending", async () => {
		const { dedupeAndScoreReleases } = await import("../indexers");
		const r1 = makeRelease({
			guid: "g1",
			quality: { id: 1, name: "EPUB", weight: 5, color: "blue" },
		});
		const r2 = makeRelease({
			guid: "g2",
			quality: { id: 2, name: "MOBI", weight: 10, color: "green" },
		});

		const result = dedupeAndScoreReleases([r1, r2], null, null);

		expect(result[0].guid).toBe("g2"); // higher weight first
		expect(result[1].guid).toBe("g1");
	});

	it("adds blocklist rejection for blocklisted titles", async () => {
		// First call for editions lookup returns undefined, second for blocklist
		mocks.selectAll.mockReturnValueOnce([{ sourceTitle: "Blocked Release" }]);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({ guid: "g1", title: "Blocked Release" });

		const result = dedupeAndScoreReleases([r], null, null);

		expect(result[0].rejections).toContainEqual(
			expect.objectContaining({ reason: "blocklisted" }),
		);
	});
});

// ─── CRUD Server Functions ──────────────────────────────────────────────────

describe("getIndexersFn", () => {
	it("calls requireAdmin and returns indexers", async () => {
		const expectedIndexers = [{ id: 1, name: "Test Indexer" }];
		mocks.selectAll.mockReturnValueOnce(expectedIndexers);

		const { getIndexersFn } = await import("../indexers");
		const result = await getIndexersFn();

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(result).toEqual(expectedIndexers);
	});
});

describe("createIndexerFn", () => {
	it("calls requireAdmin and inserts indexer", async () => {
		const created = { id: 1, name: "New Indexer" };
		mocks.insertReturningGet.mockReturnValueOnce(created);

		const { createIndexerFn } = await import("../indexers");
		const result = await createIndexerFn({
			data: {
				name: "New Indexer",
				implementation: "Newznab",
				protocol: "usenet",
				baseUrl: "https://example.com",
				apiKey: "abc123",
			},
		});

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(result).toEqual(created);
	});
});

describe("updateIndexerFn", () => {
	it("calls requireAdmin and updates indexer", async () => {
		const updated = { id: 1, name: "Updated" };
		mocks.updateReturningGet.mockReturnValueOnce(updated);

		const { updateIndexerFn } = await import("../indexers");
		const result = await updateIndexerFn({
			data: {
				id: 1,
				name: "Updated",
				implementation: "Newznab",
				protocol: "usenet",
				baseUrl: "https://example.com",
				apiKey: "abc123",
			},
		});

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(result).toEqual(updated);
	});
});

describe("deleteIndexerFn", () => {
	it("calls requireAdmin and deletes indexer", async () => {
		const { deleteIndexerFn } = await import("../indexers");
		const result = await deleteIndexerFn({ data: { id: 1 } });

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(mocks.deleteRun).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ success: true });
	});
});

describe("getSyncedIndexersFn", () => {
	it("calls requireAdmin and returns synced indexers", async () => {
		const expected = [{ id: 1, name: "Synced" }];
		mocks.selectAll.mockReturnValueOnce(expected);

		const { getSyncedIndexersFn } = await import("../indexers");
		const result = await getSyncedIndexersFn();

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(result).toEqual(expected);
	});
});

describe("testIndexerFn", () => {
	it("calls requireAdmin and delegates to prowlarrHttp.testNewznab", async () => {
		mocks.testNewznab.mockResolvedValueOnce({ success: true });

		const { testIndexerFn } = await import("../indexers");
		const result = await testIndexerFn({
			data: {
				baseUrl: "https://indexer.com",
				apiPath: "/api",
				apiKey: "key123",
			},
		});

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(mocks.testNewznab).toHaveBeenCalledWith({
			baseUrl: "https://indexer.com",
			apiPath: "/api",
			apiKey: "key123",
		});
		expect(result).toEqual({ success: true });
	});
});

describe("updateSyncedIndexerFn", () => {
	it("calls requireAdmin and updates synced indexer", async () => {
		const updated = { id: 5, tag: "hd" };
		mocks.updateReturningGet.mockReturnValueOnce(updated);

		const { updateSyncedIndexerFn } = await import("../indexers");
		const result = await updateSyncedIndexerFn({
			data: {
				id: 5,
				tag: "hd",
				downloadClientId: 2,
			},
		});

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(result).toEqual(updated);
	});
});

// ─── hasEnabledIndexersFn ───────────────────────────────────────────────────

describe("hasEnabledIndexersFn", () => {
	it("calls requireAuth", async () => {
		const { hasEnabledIndexersFn } = await import("../indexers");
		await hasEnabledIndexersFn();
		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
	});

	it("returns true when manual indexers exist", async () => {
		mocks.selectAll.mockReturnValueOnce([{ id: 1 }]); // manualCount

		const { hasEnabledIndexersFn } = await import("../indexers");
		const result = await hasEnabledIndexersFn();

		expect(result).toBe(true);
	});

	it("returns true when synced indexers exist (no manual)", async () => {
		mocks.selectAll
			.mockReturnValueOnce([]) // manualCount = 0
			.mockReturnValueOnce([{ id: 1 }]); // syncedCount

		const { hasEnabledIndexersFn } = await import("../indexers");
		const result = await hasEnabledIndexersFn();

		expect(result).toBe(true);
	});

	it("returns false when no indexers enabled", async () => {
		mocks.selectAll
			.mockReturnValueOnce([]) // manual
			.mockReturnValueOnce([]); // synced

		const { hasEnabledIndexersFn } = await import("../indexers");
		const result = await hasEnabledIndexersFn();

		expect(result).toBe(false);
	});
});

// ─── getIndexerStatusesFn ───────────────────────────────────────────────────

describe("getIndexerStatusesFn", () => {
	it("calls requireAuth and returns statuses", async () => {
		const statuses = { manual: {}, synced: {} };
		mocks.selectAll
			.mockReturnValueOnce([{ id: 1 }, { id: 2 }]) // manual ids
			.mockReturnValueOnce([{ id: 10 }]); // synced ids
		mocks.getAllIndexerStatuses.mockReturnValueOnce(statuses);

		const { getIndexerStatusesFn } = await import("../indexers");
		const result = await getIndexerStatusesFn();

		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
		expect(mocks.getAllIndexerStatuses).toHaveBeenCalledWith([1, 2], [10]);
		expect(result).toEqual(statuses);
	});
});

// ─── searchIndexersFn ───────────────────────────────────────────────────────

describe("searchIndexersFn", () => {
	it("calls requireAuth", async () => {
		mocks.selectAll
			.mockReturnValueOnce([]) // manual
			.mockReturnValueOnce([]); // synced

		const { searchIndexersFn } = await import("../indexers");
		await searchIndexersFn({
			data: { query: "test book", bookId: null, categories: null },
		});

		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
	});

	it("returns empty results when no indexers enabled", async () => {
		mocks.selectAll
			.mockReturnValueOnce([]) // manual
			.mockReturnValueOnce([]); // synced

		const { searchIndexersFn } = await import("../indexers");
		const result = await searchIndexersFn({
			data: { query: "test", bookId: null, categories: null },
		});

		expect(result).toEqual({ releases: [], warnings: [] });
	});

	it("searches manual indexers and returns results", async () => {
		const manualIndexer = {
			id: 1,
			name: "Manual1",
			baseUrl: "https://indexer.com",
			apiPath: "/api",
			apiKey: "key",
			enableAutomaticSearch: true,
			priority: 1,
		};
		const rawRelease = makeRelease({ guid: "r1" });

		mocks.selectAll
			.mockReturnValueOnce([manualIndexer]) // enabled manual
			.mockReturnValueOnce([]) // enabled synced
			.mockReturnValueOnce([]); // blocklist
		mocks.canQueryIndexer.mockReturnValue({ allowed: true });
		mocks.searchNewznab.mockResolvedValueOnce([rawRelease]);
		mocks.enrichRelease.mockReturnValue(rawRelease);

		const { searchIndexersFn } = await import("../indexers");
		const result = await searchIndexersFn({
			data: { query: "test query", bookId: null, categories: null },
		});

		expect(result.releases).toHaveLength(1);
		expect(mocks.searchNewznab).toHaveBeenCalledTimes(1);
	});

	it("throws when all indexers fail", async () => {
		const manualIndexer = {
			id: 1,
			name: "Manual1",
			baseUrl: "https://indexer.com",
			apiPath: "/api",
			apiKey: "key",
			enableAutomaticSearch: true,
			priority: 1,
		};

		mocks.selectAll
			.mockReturnValueOnce([manualIndexer]) // manual
			.mockReturnValueOnce([]); // synced
		mocks.canQueryIndexer.mockReturnValue({ allowed: true });
		mocks.searchNewznab.mockRejectedValueOnce(new Error("Connection failed"));

		const { searchIndexersFn } = await import("../indexers");

		await expect(
			searchIndexersFn({
				data: { query: "test", bookId: null, categories: null },
			}),
		).rejects.toThrow("All indexers failed");
	});

	it("builds query from bookId when no query override", async () => {
		mocks.selectAll
			.mockReturnValueOnce([]) // manual
			.mockReturnValueOnce([]); // synced

		// Book lookup: first select().from(books).leftJoin().where().get()
		mocks.selectGet.mockReturnValueOnce({
			title: "The Eye of the World",
			authorName: "Robert Jordan",
		});

		const { searchIndexersFn } = await import("../indexers");
		// query is provided but bookId triggers book lookup for bookInfo/bookParams
		const result = await searchIndexersFn({
			data: { query: "search terms", bookId: 42, categories: null },
		});

		// No indexers enabled, so empty results
		expect(result).toEqual({ releases: [], warnings: [] });
	});
});

// ─── getBookReleaseStatusFn ─────────────────────────────────────────────────

describe("getBookReleaseStatusFn", () => {
	it("calls requireAuth and returns status map", async () => {
		// First query: grabbed guids from history
		mocks.selectAll.mockReturnValueOnce([
			{ data: { guid: "guid-1" } },
			{ data: { guid: "guid-2" } },
		]);

		// fetchQueueItems
		mocks.fetchQueueItems.mockResolvedValueOnce({
			items: [{ name: "Downloading.Item" }],
			warnings: [],
		});

		// existing quality ids
		mocks.selectAll.mockReturnValueOnce([
			{ quality: { quality: { id: 5 } } },
			{ quality: { quality: { id: 3 } } },
		]);

		const { getBookReleaseStatusFn } = await import("../indexers");
		const result = await getBookReleaseStatusFn({ data: { bookId: 42 } });

		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
		expect(result.grabbedGuids).toEqual(["guid-1", "guid-2"]);
		expect(result.queueTitles).toEqual(["Downloading.Item"]);
		expect(result.existingQualityIds).toEqual([5, 3]);
	});

	it("filters out null/undefined guids", async () => {
		mocks.selectAll.mockReturnValueOnce([
			{ data: { guid: "guid-1" } },
			{ data: {} }, // no guid
			{ data: null }, // null data
		]);

		mocks.fetchQueueItems.mockResolvedValueOnce({ items: [], warnings: [] });
		mocks.selectAll.mockReturnValueOnce([]); // existing quality ids

		const { getBookReleaseStatusFn } = await import("../indexers");
		const result = await getBookReleaseStatusFn({ data: { bookId: 1 } });

		expect(result.grabbedGuids).toEqual(["guid-1"]);
	});

	it("filters out zero-id qualities", async () => {
		mocks.selectAll.mockReturnValueOnce([]); // history
		mocks.fetchQueueItems.mockResolvedValueOnce({ items: [], warnings: [] });
		mocks.selectAll.mockReturnValueOnce([
			{ quality: { quality: { id: 5 } } },
			{ quality: null }, // no quality
			{ quality: { quality: { id: 0 } } }, // zero id
		]);

		const { getBookReleaseStatusFn } = await import("../indexers");
		const result = await getBookReleaseStatusFn({ data: { bookId: 1 } });

		expect(result.existingQualityIds).toEqual([5]);
	});
});

// ─── grabReleaseFn ──────────────────────────────────────────────────────────

describe("grabReleaseFn", () => {
	it("calls requireAuth", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });
		// resolveGrabClient: no explicit downloadClientId so we go through indexer lookup
		// 1. indexerRow lookup → no downloadClientId
		// 2. fallback via .all() → returns [client]
		// 3. tag lookup → { tag: null }
		// 4. booksAuthors lookup → { authorId: 7 }
		// 5. authorDownloadProfiles lookup → { downloadProfileId: 3 }
		mocks.selectGet
			.mockReturnValueOnce({ downloadClientId: null }) // 1. indexer lookup
			.mockReturnValueOnce({ tag: null }) // 3. indexer tag
			.mockReturnValueOnce({ authorId: 7 }) // 4. booksAuthors
			.mockReturnValueOnce({ downloadProfileId: 3 }); // 5. authorDownloadProfiles

		const client = makeClient();
		mocks.selectAll.mockReturnValueOnce([client]); // 2. fallback client list

		mocks.getProvider.mockResolvedValueOnce({
			addDownload: vi.fn().mockResolvedValue("dl-123"),
		});

		const { grabReleaseFn } = await import("../indexers");
		await grabReleaseFn({
			data: {
				guid: "release-guid",
				indexerId: 1,
				indexerSource: "manual",
				title: "Test Release",
				downloadUrl: "https://example.com/dl",
				protocol: "torrent",
				size: 1000,
				bookId: 42,
				downloadClientId: null,
			},
		});

		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
	});

	it("throws when grab rate limit reached", async () => {
		mocks.canGrabIndexer.mockReturnValue({
			allowed: false,
			reason: "dailyCap",
		});

		const { grabReleaseFn } = await import("../indexers");

		await expect(
			grabReleaseFn({
				data: {
					guid: "release-guid",
					indexerId: 1,
					indexerSource: "manual",
					title: "Test",
					downloadUrl: "https://example.com/dl",
					protocol: "torrent",
					size: 1000,
					bookId: null,
					downloadClientId: null,
				},
			}),
		).rejects.toThrow("Indexer daily grab limit reached");
	});

	it("uses explicit downloadClientId when provided", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });

		const client = makeClient({ id: 5, name: "Explicit Client" });
		// explicit client lookup
		mocks.selectGet.mockReturnValueOnce(client);
		// indexer tag lookup
		mocks.selectGet.mockReturnValueOnce({ tag: "indexer-tag" });

		const addDownload = vi.fn().mockResolvedValue("dl-456");
		mocks.getProvider.mockResolvedValueOnce({ addDownload });

		const { grabReleaseFn } = await import("../indexers");
		const result = await grabReleaseFn({
			data: {
				guid: "g1",
				indexerId: 1,
				indexerSource: "manual",
				title: "Test Release",
				downloadUrl: "https://example.com/dl",
				protocol: "torrent",
				size: 5000,
				bookId: null,
				downloadClientId: 5,
			},
		});

		expect(addDownload).toHaveBeenCalled();
		expect(result).toEqual({
			success: true,
			downloadClientName: "Explicit Client",
		});
	});

	it("throws when explicit download client not found", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });
		mocks.selectGet.mockReturnValueOnce(undefined); // client not found

		const { grabReleaseFn } = await import("../indexers");

		await expect(
			grabReleaseFn({
				data: {
					guid: "g1",
					indexerId: 1,
					indexerSource: "manual",
					title: "Test",
					downloadUrl: "https://example.com/dl",
					protocol: "torrent",
					size: 1000,
					bookId: null,
					downloadClientId: 999,
				},
			}),
		).rejects.toThrow("Download client not found");
	});

	it("throws when no matching protocol clients found", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });
		// No explicit downloadClientId, indexer has no client
		mocks.selectGet.mockReturnValueOnce({ downloadClientId: null });
		// No fallback clients matching protocol
		mocks.selectAll.mockReturnValueOnce([]);

		const { grabReleaseFn } = await import("../indexers");

		await expect(
			grabReleaseFn({
				data: {
					guid: "g1",
					indexerId: 1,
					indexerSource: "manual",
					title: "Test",
					downloadUrl: "https://example.com/dl",
					protocol: "usenet",
					size: 1000,
					bookId: null,
					downloadClientId: null,
				},
			}),
		).rejects.toThrow("No enabled usenet download clients configured");
	});

	it("records history and tracked download after successful grab", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });

		const client = makeClient({ id: 2, name: "SAB" });
		mocks.selectGet.mockReturnValueOnce(client); // explicit client
		mocks.selectGet.mockReturnValueOnce({ tag: null }); // indexer tag

		mocks.getProvider.mockResolvedValueOnce({
			addDownload: vi.fn().mockResolvedValue("dl-789"),
		});

		// bookId is null — no booksAuthors lookup
		const { grabReleaseFn } = await import("../indexers");
		await grabReleaseFn({
			data: {
				guid: "g1",
				indexerId: 1,
				indexerSource: "manual",
				title: "Downloaded Release",
				downloadUrl: "https://example.com/dl",
				protocol: "torrent",
				size: 5000,
				bookId: null,
				downloadClientId: 2,
			},
		});

		// trackedDownloads insert + history insert = 2 transaction runs
		expect(mocks.transactionInsertRun).toHaveBeenCalledTimes(2);
	});

	it("persists tracked download and history in one transaction after provider success", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });

		const client = makeClient({ id: 2, name: "SAB" });
		mocks.selectGet.mockReturnValueOnce(client); // explicit client
		mocks.selectGet.mockReturnValueOnce({ tag: null }); // indexer tag

		mocks.getProvider.mockResolvedValueOnce({
			addDownload: vi.fn().mockResolvedValue("dl-transactional"),
		});

		const { grabReleaseFn } = await import("../indexers");
		await grabReleaseFn({
			data: {
				guid: "g-transactional",
				indexerId: 1,
				indexerSource: "manual",
				title: "Transactional Release",
				downloadUrl: "https://example.com/dl",
				protocol: "torrent",
				size: 5000,
				bookId: null,
				downloadClientId: 2,
			},
		});

		expect(mocks.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.transactionInsertRun).toHaveBeenCalledTimes(2);
		expect(mocks.insertRun).not.toHaveBeenCalled();
	});

	it("rejects when tracked download persistence fails after provider success", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });

		const client = makeClient({ id: 2, name: "SAB" });
		mocks.selectGet.mockReturnValueOnce(client); // explicit client
		mocks.selectGet.mockReturnValueOnce({ tag: null }); // indexer tag

		mocks.getProvider.mockResolvedValueOnce({
			addDownload: vi.fn().mockResolvedValue("dl-tracked-failure"),
		});
		mocks.transactionInsertRun.mockImplementationOnce(() => {
			throw new Error("tracked download insert failed");
		});

		const { grabReleaseFn } = await import("../indexers");
		await expect(
			grabReleaseFn({
				data: {
					guid: "g-tracked-failure",
					indexerId: 1,
					indexerSource: "manual",
					title: "Tracked Failure Release",
					downloadUrl: "https://example.com/dl",
					protocol: "torrent",
					size: 5000,
					bookId: null,
					downloadClientId: 2,
				},
			}),
		).rejects.toThrow("tracked download insert failed");

		expect(mocks.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.transactionInsertRun).toHaveBeenCalledTimes(1);
		expect(mocks.insertRun).not.toHaveBeenCalled();
	});

	it("rejects when history persistence fails after provider success", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });

		const client = makeClient({ id: 2, name: "SAB" });
		mocks.selectGet.mockReturnValueOnce(client); // explicit client
		mocks.selectGet.mockReturnValueOnce({ tag: null }); // indexer tag

		mocks.getProvider.mockResolvedValueOnce({
			addDownload: vi.fn().mockResolvedValue("dl-history-failure"),
		});
		mocks.transactionInsertRun
			.mockImplementationOnce(() => undefined)
			.mockImplementationOnce(() => {
				throw new Error("history insert failed");
			});

		const { grabReleaseFn } = await import("../indexers");
		await expect(
			grabReleaseFn({
				data: {
					guid: "g-history-failure",
					indexerId: 1,
					indexerSource: "manual",
					title: "History Failure Release",
					downloadUrl: "https://example.com/dl",
					protocol: "torrent",
					size: 5000,
					bookId: null,
					downloadClientId: 2,
				},
			}),
		).rejects.toThrow("history insert failed");

		expect(mocks.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.transactionInsertRun).toHaveBeenCalledTimes(2);
		expect(mocks.insertRun).not.toHaveBeenCalled();
	});

	it("combines client and indexer tags", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });

		const client = makeClient({ id: 2, tag: "client-tag" });
		mocks.selectGet.mockReturnValueOnce(client); // explicit client
		mocks.selectGet.mockReturnValueOnce({ tag: "indexer-tag" }); // indexer tag

		const addDownload = vi.fn().mockResolvedValue("dl-combo");
		mocks.getProvider.mockResolvedValueOnce({ addDownload });

		const { grabReleaseFn } = await import("../indexers");
		await grabReleaseFn({
			data: {
				guid: "g1",
				indexerId: 1,
				indexerSource: "manual",
				title: "Test",
				downloadUrl: "https://example.com/dl",
				protocol: "torrent",
				size: 1000,
				bookId: null,
				downloadClientId: 2,
			},
		});

		// The combined tag should be "client-tag,indexer-tag"
		expect(addDownload).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ tag: "client-tag,indexer-tag" }),
		);
	});

	it("resolves client via indexer's downloadClientId when no explicit client", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });

		const client = makeClient({ id: 10, name: "Indexer Client" });
		// 1. indexer row lookup → has downloadClientId
		mocks.selectGet.mockReturnValueOnce({ downloadClientId: 10 });
		// 2. client lookup from indexer's downloadClientId
		mocks.selectGet.mockReturnValueOnce(client);
		// 3. indexer tag lookup
		mocks.selectGet.mockReturnValueOnce({ tag: null });

		const addDownload = vi.fn().mockResolvedValue("dl-indexer");
		mocks.getProvider.mockResolvedValueOnce({ addDownload });

		const { grabReleaseFn } = await import("../indexers");
		const result = await grabReleaseFn({
			data: {
				guid: "g1",
				indexerId: 1,
				indexerSource: "synced",
				title: "Test",
				downloadUrl: "https://example.com/dl",
				protocol: "usenet",
				size: 1000,
				bookId: null,
				downloadClientId: null,
			},
		});

		expect(addDownload).toHaveBeenCalled();
		expect(result).toEqual({
			success: true,
			downloadClientName: "Indexer Client",
		});
	});

	it("looks up author and profile when bookId provided", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });

		const client = makeClient({ id: 3, name: "WithBook" });
		mocks.selectGet.mockReturnValueOnce(client); // explicit client
		mocks.selectGet.mockReturnValueOnce({ tag: null }); // indexer tag
		// booksAuthors lookup
		mocks.selectGet.mockReturnValueOnce({ authorId: 5 });
		// authorDownloadProfiles lookup
		mocks.selectGet.mockReturnValueOnce({ downloadProfileId: 8 });

		mocks.getProvider.mockResolvedValueOnce({
			addDownload: vi.fn().mockResolvedValue("dl-book"),
		});

		const { grabReleaseFn } = await import("../indexers");
		await grabReleaseFn({
			data: {
				guid: "g-book",
				indexerId: 1,
				indexerSource: "manual",
				title: "Book Release",
				downloadUrl: "https://example.com/dl",
				protocol: "torrent",
				size: 2000,
				bookId: 42,
				downloadClientId: 3,
			},
		});

		// trackedDownloads insert + history insert = 2 transaction runs
		expect(mocks.transactionInsertRun).toHaveBeenCalledTimes(2);
	});

	it("handles bookId with no author gracefully", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });

		const client = makeClient({ id: 3, name: "NoAuthor" });
		mocks.selectGet.mockReturnValueOnce(client); // explicit client
		mocks.selectGet.mockReturnValueOnce({ tag: null }); // indexer tag
		// booksAuthors lookup returns nothing
		mocks.selectGet.mockReturnValueOnce(undefined);

		mocks.getProvider.mockResolvedValueOnce({
			addDownload: vi.fn().mockResolvedValue("dl-no-author"),
		});

		const { grabReleaseFn } = await import("../indexers");
		const result = await grabReleaseFn({
			data: {
				guid: "g-noauthor",
				indexerId: 1,
				indexerSource: "manual",
				title: "Orphan Release",
				downloadUrl: "https://example.com/dl",
				protocol: "torrent",
				size: 1500,
				bookId: 99,
				downloadClientId: 3,
			},
		});

		expect(result).toEqual({
			success: true,
			downloadClientName: "NoAuthor",
		});
	});

	it("skips tracked download insert when downloadId is falsy", async () => {
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });

		const client = makeClient({ id: 3, name: "NoTrack" });
		mocks.selectGet.mockReturnValueOnce(client); // explicit client
		mocks.selectGet.mockReturnValueOnce({ tag: null }); // indexer tag

		mocks.getProvider.mockResolvedValueOnce({
			addDownload: vi.fn().mockResolvedValue(null),
		});

		const { grabReleaseFn } = await import("../indexers");
		await grabReleaseFn({
			data: {
				guid: "g-notrack",
				indexerId: 1,
				indexerSource: "manual",
				title: "No Track Release",
				downloadUrl: "https://example.com/dl",
				protocol: "torrent",
				size: 1000,
				bookId: null,
				downloadClientId: 3,
			},
		});

		// Only history insert, no tracked download insert
		expect(mocks.transactionInsertRun).toHaveBeenCalledTimes(1);
	});
});

// ─── searchIndexersFn (additional paths) ───────────────────────────────────

describe("searchIndexersFn (additional paths)", () => {
	it("searches synced indexers and returns results", async () => {
		const syncedIndexer = {
			id: 10,
			name: "Synced1",
			baseUrl: "https://synced.com",
			apiPath: "/api",
			apiKey: "skey",
			enableSearch: true,
			priority: 1,
		};
		const rawRelease = makeRelease({ guid: "s1" });

		mocks.selectAll
			.mockReturnValueOnce([]) // enabled manual
			.mockReturnValueOnce([syncedIndexer]) // enabled synced
			.mockReturnValueOnce([]); // blocklist
		mocks.canQueryIndexer.mockReturnValue({ allowed: true });
		mocks.searchNewznab.mockResolvedValueOnce([rawRelease]);
		mocks.enrichRelease.mockReturnValue(rawRelease);

		const { searchIndexersFn } = await import("../indexers");
		const result = await searchIndexersFn({
			data: { query: "synced test", bookId: null, categories: null },
		});

		expect(result.releases).toHaveLength(1);
		expect(mocks.searchNewznab).toHaveBeenCalledTimes(1);
	});

	it("skips synced indexers without apiKey", async () => {
		const syncedNoKey = {
			id: 10,
			name: "NoKey",
			baseUrl: "https://synced.com",
			apiPath: "/api",
			apiKey: null, // no API key
			enableSearch: true,
			priority: 1,
		};

		mocks.selectAll
			.mockReturnValueOnce([]) // manual
			.mockReturnValueOnce([syncedNoKey]) // synced (no key)
			.mockReturnValueOnce([]); // blocklist

		const { searchIndexersFn } = await import("../indexers");
		const result = await searchIndexersFn({
			data: { query: "test", bookId: null, categories: null },
		});

		// No indexers with apiKey, so no searches
		expect(mocks.searchNewznab).not.toHaveBeenCalled();
		expect(result).toEqual({ releases: [], warnings: [] });
	});

	it("builds bookInfo and bookParams from bookId with author", async () => {
		mocks.selectAll
			.mockReturnValueOnce([]) // manual
			.mockReturnValueOnce([]); // synced

		// Book lookup returns book with author
		mocks.selectGet.mockReturnValueOnce({
			title: "Dune",
			authorName: "Frank Herbert",
		});

		const { searchIndexersFn } = await import("../indexers");
		const result = await searchIndexersFn({
			data: { query: "Dune", bookId: 55, categories: null },
		});

		expect(result).toEqual({ releases: [], warnings: [] });
	});

	it("builds bookInfo from bookId without author", async () => {
		mocks.selectAll
			.mockReturnValueOnce([]) // manual
			.mockReturnValueOnce([]); // synced

		// Book lookup returns book without author
		mocks.selectGet.mockReturnValueOnce({
			title: "Anonymous Book",
			authorName: null,
		});

		const { searchIndexersFn } = await import("../indexers");
		const result = await searchIndexersFn({
			data: { query: "Anonymous Book", bookId: 56, categories: null },
		});

		expect(result).toEqual({ releases: [], warnings: [] });
	});

	it("uses explicit categories when provided", async () => {
		mocks.selectAll
			.mockReturnValueOnce([]) // manual
			.mockReturnValueOnce([]); // synced

		const { searchIndexersFn } = await import("../indexers");
		const result = await searchIndexersFn({
			data: { query: "test", bookId: null, categories: [3030, 7020] },
		});

		expect(result).toEqual({ releases: [], warnings: [] });
	});

	it("captures warning when indexer search throws", async () => {
		const syncedIndexer = {
			id: 10,
			name: "Failing",
			baseUrl: "https://fail.com",
			apiPath: "/api",
			apiKey: "key",
			enableSearch: true,
			priority: 1,
		};
		const manualIndexer = {
			id: 1,
			name: "Working",
			baseUrl: "https://ok.com",
			apiPath: "/api",
			apiKey: "key",
			enableAutomaticSearch: true,
			priority: 1,
		};
		const rawRelease = makeRelease({ guid: "w1" });

		mocks.selectAll
			.mockReturnValueOnce([manualIndexer]) // manual
			.mockReturnValueOnce([syncedIndexer]) // synced
			.mockReturnValueOnce([]); // blocklist
		mocks.canQueryIndexer.mockReturnValue({ allowed: true });
		// synced fails, manual succeeds
		mocks.searchNewznab
			.mockRejectedValueOnce(new Error("Synced connection timeout"))
			.mockResolvedValueOnce([rawRelease]);
		mocks.enrichRelease.mockReturnValue(rawRelease);

		const { searchIndexersFn } = await import("../indexers");
		const result = await searchIndexersFn({
			data: { query: "test", bookId: null, categories: null },
		});

		expect(result.releases).toHaveLength(1);
		expect(result.warnings).toContain("Synced connection timeout");
	});

	it("captures non-Error throw as unknown error warning", async () => {
		const manualIndexer = {
			id: 1,
			name: "Throws",
			baseUrl: "https://indexer.com",
			apiPath: "/api",
			apiKey: "key",
			enableAutomaticSearch: true,
			priority: 2,
		};
		const manual2 = {
			id: 2,
			name: "Working",
			baseUrl: "https://ok.com",
			apiPath: "/api",
			apiKey: "key2",
			enableAutomaticSearch: true,
			priority: 1,
		};
		const rawRelease = makeRelease({ guid: "ok1" });

		mocks.selectAll
			.mockReturnValueOnce([manualIndexer, manual2]) // manual
			.mockReturnValueOnce([]) // synced
			.mockReturnValueOnce([]); // blocklist
		mocks.canQueryIndexer.mockReturnValue({ allowed: true });
		mocks.searchNewznab
			.mockRejectedValueOnce("string-error")
			.mockResolvedValueOnce([rawRelease]);
		mocks.enrichRelease.mockReturnValue(rawRelease);

		const { searchIndexersFn } = await import("../indexers");
		const result = await searchIndexersFn({
			data: { query: "test", bookId: null, categories: null },
		});

		expect(result.releases).toHaveLength(1);
		expect(result.warnings).toContain("Unknown indexer error");
	});

	it("skips indexer when rate limiter returns backoff", async () => {
		const manualIndexer = {
			id: 1,
			name: "BackedOff",
			baseUrl: "https://indexer.com",
			apiPath: "/api",
			apiKey: "key",
			enableAutomaticSearch: true,
			priority: 1,
		};

		mocks.selectAll
			.mockReturnValueOnce([manualIndexer]) // manual
			.mockReturnValueOnce([]); // synced
		mocks.canQueryIndexer.mockReturnValue({
			allowed: false,
			reason: "backoff",
		});

		const { searchIndexersFn } = await import("../indexers");

		await expect(
			searchIndexersFn({
				data: { query: "test", bookId: null, categories: null },
			}),
		).rejects.toThrow("All indexers failed");
	});

	it("proceeds past dailyCap in interactive mode", async () => {
		const manualIndexer = {
			id: 1,
			name: "Capped",
			baseUrl: "https://indexer.com",
			apiPath: "/api",
			apiKey: "key",
			enableAutomaticSearch: true,
			priority: 1,
		};
		const rawRelease = makeRelease({ guid: "cap1" });

		mocks.selectAll
			.mockReturnValueOnce([manualIndexer]) // manual
			.mockReturnValueOnce([]) // synced
			.mockReturnValueOnce([]); // blocklist
		mocks.canQueryIndexer.mockReturnValue({
			allowed: false,
			reason: "dailyCap",
		});
		mocks.searchNewznab.mockResolvedValueOnce([rawRelease]);
		mocks.enrichRelease.mockReturnValue(rawRelease);

		const { searchIndexersFn } = await import("../indexers");

		// dailyCap in interactive mode: not pacing, not !interactive, not backoff → proceed
		const result = await searchIndexersFn({
			data: { query: "test", bookId: null, categories: null },
		});

		expect(result.releases).toHaveLength(1);
		expect(mocks.searchNewznab).toHaveBeenCalledTimes(1);
	});
});

// ─── dedupeAndScoreReleases (additional paths) ────────────────────────────

describe("dedupeAndScoreReleases (additional paths)", () => {
	it("computes rejections for unknown quality releases", async () => {
		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g-unknown",
			quality: { id: 0, name: "Unknown", weight: 0, color: "gray" },
		});

		const result = dedupeAndScoreReleases([r], null, null);

		expect(result[0].rejections).toContainEqual(
			expect.objectContaining({ reason: "unknownQuality" }),
		);
	});

	it("computes size rejection when release is below minimum", async () => {
		mocks.getDefSizeLimits.mockReturnValueOnce({
			minSize: 10,
			maxSize: 100,
		});

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g-small",
			size: 1 * 1024 * 1024, // 1 MB, below 10 MB min
			sizeFormatted: "1 MB",
			quality: { id: 5, name: "EPUB", weight: 10, color: "blue" },
		});

		const result = dedupeAndScoreReleases([r], null, null);

		expect(result[0].rejections).toContainEqual(
			expect.objectContaining({ reason: "belowMinimumSize" }),
		);
	});

	it("computes size rejection when release is above maximum", async () => {
		mocks.getDefSizeLimits.mockReturnValueOnce({
			minSize: 0,
			maxSize: 5,
		});

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g-big",
			size: 50 * 1024 * 1024, // 50 MB, above 5 MB max
			sizeFormatted: "50 MB",
			quality: { id: 5, name: "EPUB", weight: 10, color: "blue" },
		});

		const result = dedupeAndScoreReleases([r], null, null);

		expect(result[0].rejections).toContainEqual(
			expect.objectContaining({ reason: "aboveMaximumSize" }),
		);
	});

	it("adds qualityNotWanted rejection when format not allowed in any profile", async () => {
		// Set up book with profiles
		// getProfilesForBook: booksAuthors → authorId, authorDownloadProfiles → profileId, downloadProfiles → profile
		mocks.selectGet.mockReturnValueOnce({ authorId: 1 }); // booksAuthors
		mocks.selectAll.mockReturnValueOnce([{ downloadProfileId: 1 }]); // authorDownloadProfiles
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 1,
				name: "Profile1",
				items: [[2, 3]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [],
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 0,
			},
		]); // downloadProfiles

		// editionMeta lookup
		mocks.selectGet.mockReturnValueOnce(undefined);

		// matchAllFormats returns single match
		mocks.matchAllFormats.mockReturnValueOnce([]);

		// isFormatInProfile returns false — format not in any profile
		mocks.isFormatInProfile.mockReturnValueOnce(false);

		// blocklist
		mocks.selectAll.mockReturnValueOnce([]);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g-unwanted",
			quality: { id: 99, name: "PDF", weight: 1, color: "red" },
		});

		const result = dedupeAndScoreReleases([r], 42, null);

		expect(result[0].rejections).toContainEqual(
			expect.objectContaining({ reason: "qualityNotWanted" }),
		);
	});

	it("adds belowMinimumCFScore rejection when CF score is too low", async () => {
		// Set up book with profiles
		mocks.selectGet.mockReturnValueOnce({ authorId: 1 });
		mocks.selectAll.mockReturnValueOnce([{ downloadProfileId: 1 }]);
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 1,
				name: "Strict Profile",
				items: [[5]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [],
				minCustomFormatScore: 50,
				upgradeUntilCustomFormatScore: 100,
			},
		]);

		// editionMeta lookup
		mocks.selectGet.mockReturnValueOnce(undefined);

		// matchAllFormats returns single match
		mocks.matchAllFormats.mockReturnValueOnce([]);

		// isFormatInProfile returns true
		mocks.isFormatInProfile.mockReturnValueOnce(true);
		mocks.getProfileWeight.mockReturnValueOnce(10);

		// calculateCFScore returns low score
		mocks.calculateCFScore.mockReturnValueOnce({
			totalScore: 5,
			matchedFormats: [],
		});

		// blocklist
		mocks.selectAll.mockReturnValueOnce([]);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g-lowcf",
			quality: { id: 5, name: "EPUB", weight: 10, color: "blue" },
		});

		const result = dedupeAndScoreReleases([r], 42, null);

		expect(result[0].rejections).toContainEqual(
			expect.objectContaining({ reason: "belowMinimumCFScore" }),
		);
	});

	it("re-ranks quality when multiple formats match and profile items exist", async () => {
		// Set up book with profiles via getProfilesForBook
		mocks.selectGet.mockReturnValueOnce({ authorId: 1 }); // booksAuthors
		mocks.selectAll.mockReturnValueOnce([{ downloadProfileId: 1 }]); // authorDownloadProfiles
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 1,
				name: "Multi Profile",
				items: [[1, 2, 3]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [],
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 0,
			},
		]); // downloadProfiles

		// editionMeta lookup
		mocks.selectGet.mockReturnValueOnce(undefined);

		// matchAllFormats returns multiple matches for re-ranking
		mocks.matchAllFormats.mockReturnValueOnce([
			{ id: 1, name: "EPUB", weight: 5, color: "blue" },
			{ id: 2, name: "MOBI", weight: 3, color: "green" },
		]);

		// getProfileWeight calls:
		// 1. re-ranking: bestWeight for allMatches[0] (EPUB)
		// 2. re-ranking: w for allMatches[1] (MOBI) — higher, so MOBI wins
		// 3. computeReleaseMetrics: getProfileWeight for the winning quality in profile scoring
		mocks.getProfileWeight
			.mockReturnValueOnce(5) // EPUB
			.mockReturnValueOnce(15) // MOBI beats EPUB
			.mockReturnValueOnce(15); // computeReleaseMetrics scoring

		// isFormatInProfile for computeReleaseMetrics
		mocks.isFormatInProfile.mockReturnValueOnce(true);
		mocks.calculateCFScore.mockReturnValueOnce({
			totalScore: 0,
			matchedFormats: [],
		});

		// blocklist
		mocks.selectAll.mockReturnValueOnce([]);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g-multi",
			title: "Book (epub, mobi)",
			quality: { id: 1, name: "EPUB", weight: 5, color: "blue" },
		});

		const result = dedupeAndScoreReleases([r], 42, null);

		// The release should have been re-ranked to MOBI (weight 15)
		expect(result[0].quality.weight).toBe(15);
		expect(result[0].quality.name).toBe("MOBI");
	});

	it("uses edition metadata for size limit calculations", async () => {
		// Set up book with profiles
		mocks.selectGet.mockReturnValueOnce({ authorId: 1 });
		mocks.selectAll.mockReturnValueOnce([{ downloadProfileId: 1 }]);
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 1,
				name: "P1",
				items: [[5]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [],
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 0,
			},
		]);

		// editionMeta lookup returns page count and audio length
		mocks.selectGet.mockReturnValueOnce({
			pageCount: 350,
			audioLength: 600,
		});

		// matchAllFormats
		mocks.matchAllFormats.mockReturnValueOnce([]);

		// isFormatInProfile & scoring
		mocks.isFormatInProfile.mockReturnValueOnce(true);
		mocks.getProfileWeight.mockReturnValueOnce(10);
		mocks.calculateCFScore.mockReturnValueOnce({
			totalScore: 0,
			matchedFormats: [],
		});

		// blocklist
		mocks.selectAll.mockReturnValueOnce([]);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g-edition",
			quality: { id: 5, name: "EPUB", weight: 10, color: "blue" },
		});

		const result = dedupeAndScoreReleases([r], 42, null);

		// Should process without errors; edition metadata was used
		expect(result).toHaveLength(1);
	});

	it("sorts by CF score when quality weights are equal", async () => {
		// Set up book with profiles so computeReleaseMetrics uses calculateCFScore
		mocks.selectGet.mockReturnValueOnce({ authorId: 1 }); // booksAuthors
		mocks.selectAll.mockReturnValueOnce([{ downloadProfileId: 1 }]); // authorDownloadProfiles
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 1,
				name: "P1",
				items: [[1]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [],
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 0,
			},
		]); // downloadProfiles

		// editionMeta
		mocks.selectGet.mockReturnValueOnce(undefined);

		// matchAllFormats for re-ranking — single match each time
		mocks.matchAllFormats.mockReturnValueOnce([]).mockReturnValueOnce([]);

		// isFormatInProfile for both releases
		mocks.isFormatInProfile.mockReturnValueOnce(true).mockReturnValueOnce(true);

		// getProfileWeight for both (same weight)
		mocks.getProfileWeight.mockReturnValueOnce(10).mockReturnValueOnce(10);

		// calculateCFScore: r1 gets low CF, r2 gets high CF
		mocks.calculateCFScore
			.mockReturnValueOnce({ totalScore: 10, matchedFormats: [] })
			.mockReturnValueOnce({ totalScore: 50, matchedFormats: [] });

		// blocklist
		mocks.selectAll.mockReturnValueOnce([]);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r1 = makeRelease({
			guid: "g1",
			quality: { id: 1, name: "EPUB", weight: 10, color: "blue" },
		});
		const r2 = makeRelease({
			guid: "g2",
			quality: { id: 1, name: "EPUB", weight: 10, color: "blue" },
		});

		const result = dedupeAndScoreReleases([r1, r2], 42, null);

		// Higher CF score should come first
		expect(result[0].guid).toBe("g2");
		expect(result[1].guid).toBe("g1");
	});

	it("sorts by release type rank when quality and CF scores are equal", async () => {
		const { dedupeAndScoreReleases } = await import("../indexers");
		const r1 = makeRelease({
			guid: "g1",
			quality: { id: 1, name: "EPUB", weight: 10, color: "blue" },
			releaseType: ReleaseType.SingleBook,
		});
		const r2 = makeRelease({
			guid: "g2",
			quality: { id: 1, name: "EPUB", weight: 10, color: "blue" },
			releaseType: ReleaseType.SeasonPack,
		});

		const result = dedupeAndScoreReleases([r1, r2], null, null);

		// Higher release type rank (SeasonPack=3) should come first
		expect(result[0].guid).toBe("g2");
		expect(result[1].guid).toBe("g1");
	});

	it("sorts by size when quality, CF score, and release type are equal", async () => {
		const { dedupeAndScoreReleases } = await import("../indexers");
		const r1 = makeRelease({
			guid: "g1",
			quality: { id: 1, name: "EPUB", weight: 10, color: "blue" },
			size: 1000,
		});
		const r2 = makeRelease({
			guid: "g2",
			quality: { id: 1, name: "EPUB", weight: 10, color: "blue" },
			size: 5000,
		});

		const result = dedupeAndScoreReleases([r1, r2], null, null);

		// Larger size should come first
		expect(result[0].guid).toBe("g2");
		expect(result[1].guid).toBe("g1");
	});

	it("keeps matching releases via fuzzy relevance check", async () => {
		// mockReset clears leftover mockReturnValueOnce queue from earlier tests
		mocks.tokenSetRatio.mockReset();
		mocks.partialRatio.mockReset();
		mocks.tokenSetRatio.mockImplementation(() => 90);
		mocks.partialRatio.mockImplementation(() => 90);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g1",
			title: "Brandon Sanderson - Mistborn",
		});

		const result = dedupeAndScoreReleases([r], null, {
			title: "Mistborn",
			authorName: "Brandon Sanderson",
		});

		expect(result).toHaveLength(1);
		expect(result[0].guid).toBe("g1");
	});

	it("filters release when author fuzzy score is too low", async () => {
		mocks.tokenSetRatio.mockReset();
		mocks.partialRatio.mockReset();
		mocks.tokenSetRatio.mockImplementation(() => 30);
		mocks.partialRatio.mockImplementation(() => 30);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g1",
			title: "Wrong Author - Wrong Book",
		});

		const result = dedupeAndScoreReleases([r], null, {
			title: "Mistborn",
			authorName: "Brandon Sanderson",
		});

		expect(result).toHaveLength(0);
	});

	it("filters release when title fuzzy score is too low", async () => {
		mocks.tokenSetRatio.mockReset();
		mocks.partialRatio.mockReset();
		// Author passes (long name > 10 chars), title fails
		mocks.tokenSetRatio.mockImplementation((a: string) =>
			a.length > 10 ? 90 : 40,
		);
		mocks.partialRatio.mockImplementation((a: string) =>
			a.length > 10 ? 90 : 40,
		);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g1",
			title: "Brandon Sanderson - Wrong Title",
		});

		const result = dedupeAndScoreReleases([r], null, {
			title: "Mistborn",
			authorName: "Brandon Sanderson",
		});

		expect(result).toHaveLength(0);
	});

	it("skips title check for very short titles", async () => {
		mocks.tokenSetRatio.mockReset();
		mocks.partialRatio.mockReset();
		mocks.tokenSetRatio.mockImplementation(() => 90);
		mocks.partialRatio.mockImplementation(() => 90);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({ guid: "g1", title: "Author - AB" });

		// Title "AB" is < 3 chars, so title check is skipped
		const result = dedupeAndScoreReleases([r], null, {
			title: "AB",
			authorName: "Author",
		});

		expect(result).toHaveLength(1);
	});

	it("passes releases when no authorName in bookInfo", async () => {
		mocks.tokenSetRatio.mockReset();
		mocks.partialRatio.mockReset();
		mocks.tokenSetRatio.mockImplementation(() => 90);
		mocks.partialRatio.mockImplementation(() => 90);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({ guid: "g1", title: "Some Release" });

		const result = dedupeAndScoreReleases([r], null, {
			title: "Some Release",
			authorName: null,
		});

		expect(result).toHaveLength(1);
	});

	it("handles bookId with no profiles (null profiles)", async () => {
		// booksAuthors returns no author
		mocks.selectGet.mockReturnValueOnce(undefined); // booksAuthors
		// editionMeta lookup
		mocks.selectGet.mockReturnValueOnce(undefined);
		// blocklist
		mocks.selectAll.mockReturnValueOnce([]);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g1",
			quality: { id: 5, name: "EPUB", weight: 10, color: "blue" },
		});

		const result = dedupeAndScoreReleases([r], 42, null);

		// No profiles → formatScore = quality weight
		expect(result[0].formatScore).toBe(10);
	});
});

// ─── isPackQualified (additional edge cases) ──────────────────────────────

describe("isPackQualified (additional edge cases)", () => {
	it("returns true for Unknown release type", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({ releaseType: ReleaseType.Unknown });
		expect(isPackQualified(release, null)).toBe(true);
	});

	it("returns false for SeasonPack when no wantedEpisodesBySeason", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.SeasonPack,
			packInfo: { seasons: [1] },
		});
		expect(isPackQualified(release, {})).toBe(false);
	});

	it("returns false for SeasonPack when season not in map", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.SeasonPack,
			packInfo: { seasons: [3] },
		});
		expect(
			isPackQualified(release, {
				wantedEpisodesBySeason: new Map([[1, new Set([1, 2])]]),
			}),
		).toBe(false);
	});

	it("returns false for MultiEpisode when season not in map", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.MultiEpisode,
			packInfo: { seasons: [2], episodes: [1, 2] },
		});
		expect(
			isPackQualified(release, {
				wantedEpisodesBySeason: new Map([[1, new Set([1, 2])]]),
			}),
		).toBe(false);
	});

	it("returns false for MultiEpisode with no episodes in packInfo", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.MultiEpisode,
			packInfo: { seasons: [1] },
		});
		expect(
			isPackQualified(release, {
				wantedEpisodesBySeason: new Map([[1, new Set([1, 2])]]),
			}),
		).toBe(false);
	});

	it("returns false for MultiSeasonPack with no wantedEpisodesBySeason", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.MultiSeasonPack,
			packInfo: { seasons: [1, 2] },
		});
		expect(isPackQualified(release, {})).toBe(false);
	});

	it("returns false for AuthorPack with no wantedBookIds", async () => {
		const { isPackQualified } = await import("../indexers");
		const release = makeRelease({
			releaseType: ReleaseType.AuthorPack,
			packInfo: {},
		});
		expect(isPackQualified(release, {})).toBe(false);
	});
});

// ─── getDimensionContext coverage ──────────────────────────────────────────

describe("dedupeAndScoreReleases dimension context", () => {
	it("includes page-based context for ebook format in size rejection", async () => {
		// Set up profiles for size checking
		mocks.selectGet.mockReturnValueOnce({ authorId: 1 }); // booksAuthors
		mocks.selectAll.mockReturnValueOnce([{ downloadProfileId: 1 }]); // authorDownloadProfiles
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 1,
				name: "P1",
				items: [[5]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [],
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 0,
			},
		]);
		// editionMeta with page count
		mocks.selectGet.mockReturnValueOnce({ pageCount: 300, audioLength: null });
		// matchAllFormats
		mocks.matchAllFormats.mockReturnValueOnce([]);
		// Size limits: release is too small
		mocks.getDefSizeLimits.mockReturnValueOnce({ minSize: 10, maxSize: 100 });
		// getFormatType returns "ebook" for dimension context
		mocks.getFormatType.mockReturnValueOnce("ebook");
		// isFormatInProfile + scoring
		mocks.isFormatInProfile.mockReturnValueOnce(true);
		mocks.getProfileWeight.mockReturnValueOnce(10);
		mocks.calculateCFScore.mockReturnValueOnce({
			totalScore: 0,
			matchedFormats: [],
		});
		// blocklist
		mocks.selectAll.mockReturnValueOnce([]);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g-ebook",
			size: 1 * 1024 * 1024, // 1 MB, below 10 MB min
			sizeFormatted: "1 MB",
			quality: { id: 5, name: "EPUB", weight: 10, color: "blue" },
		});

		const result = dedupeAndScoreReleases([r], 42, null);

		const sizeRejection = result[0].rejections.find(
			(rej) => rej.reason === "belowMinimumSize",
		);
		expect(sizeRejection).toBeDefined();
		expect(sizeRejection?.message).toContain("300 pages");
	});

	it("includes duration-based context for audio format in size rejection", async () => {
		mocks.selectGet.mockReturnValueOnce({ authorId: 1 });
		mocks.selectAll.mockReturnValueOnce([{ downloadProfileId: 1 }]);
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 1,
				name: "P1",
				items: [[5]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [],
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 0,
			},
		]);
		// editionMeta with audio length
		mocks.selectGet.mockReturnValueOnce({
			pageCount: null,
			audioLength: 600,
		});
		mocks.matchAllFormats.mockReturnValueOnce([]);
		mocks.getDefSizeLimits.mockReturnValueOnce({
			minSize: 500,
			maxSize: 5000,
		});
		mocks.getFormatType.mockReturnValueOnce("audio");
		mocks.isFormatInProfile.mockReturnValueOnce(true);
		mocks.getProfileWeight.mockReturnValueOnce(10);
		mocks.calculateCFScore.mockReturnValueOnce({
			totalScore: 0,
			matchedFormats: [],
		});
		mocks.selectAll.mockReturnValueOnce([]);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g-audio",
			size: 100 * 1024 * 1024,
			sizeFormatted: "100 MB",
			quality: { id: 5, name: "M4B", weight: 10, color: "green" },
		});

		const result = dedupeAndScoreReleases([r], 42, null);

		const sizeRejection = result[0].rejections.find(
			(rej) => rej.reason === "belowMinimumSize",
		);
		expect(sizeRejection).toBeDefined();
		expect(sizeRejection?.message).toContain("10h duration");
	});

	it("uses default context when no editionMeta dimensions available", async () => {
		mocks.selectGet.mockReturnValueOnce({ authorId: 1 });
		mocks.selectAll.mockReturnValueOnce([{ downloadProfileId: 1 }]);
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 1,
				name: "P1",
				items: [[5]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [],
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 0,
			},
		]);
		// editionMeta with no dimensions
		mocks.selectGet.mockReturnValueOnce({ pageCount: null, audioLength: null });
		mocks.matchAllFormats.mockReturnValueOnce([]);
		mocks.getDefSizeLimits.mockReturnValueOnce({ minSize: 10, maxSize: 100 });
		mocks.getFormatType.mockReturnValueOnce("ebook");
		mocks.isFormatInProfile.mockReturnValueOnce(true);
		mocks.getProfileWeight.mockReturnValueOnce(10);
		mocks.calculateCFScore.mockReturnValueOnce({
			totalScore: 0,
			matchedFormats: [],
		});
		mocks.selectAll.mockReturnValueOnce([]);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g-default",
			size: 1 * 1024 * 1024,
			sizeFormatted: "1 MB",
			quality: { id: 5, name: "EPUB", weight: 10, color: "blue" },
		});

		const result = dedupeAndScoreReleases([r], 42, null);

		const sizeRejection = result[0].rejections.find(
			(rej) => rej.reason === "belowMinimumSize",
		);
		expect(sizeRejection).toBeDefined();
		expect(sizeRejection?.message).toContain("default page count");
	});
});

// ─── getProfilesForBook edge case ─────────────────────────────────────────

describe("dedupeAndScoreReleases profile lookup edge cases", () => {
	it("returns base quality weight when author has no download profiles", async () => {
		// booksAuthors returns authorId, but no profile links
		mocks.selectGet.mockReturnValueOnce({ authorId: 1 }); // booksAuthors
		mocks.selectAll.mockReturnValueOnce([]); // authorDownloadProfiles returns empty
		// editionMeta
		mocks.selectGet.mockReturnValueOnce(undefined);
		// blocklist
		mocks.selectAll.mockReturnValueOnce([]);

		const { dedupeAndScoreReleases } = await import("../indexers");
		const r = makeRelease({
			guid: "g-noprofile",
			quality: { id: 5, name: "EPUB", weight: 8, color: "blue" },
		});

		const result = dedupeAndScoreReleases([r], 42, null);

		// No profiles means formatScore = quality weight
		expect(result[0].formatScore).toBe(8);
	});
});

// ─── searchIndexersFn with bookId category derivation ──────────────────────

describe("searchIndexersFn category derivation", () => {
	it("derives categories from book profiles when no explicit categories", async () => {
		const manualIndexer = {
			id: 1,
			name: "Manual1",
			baseUrl: "https://indexer.com",
			apiPath: "/api",
			apiKey: "key",
			enableAutomaticSearch: true,
			priority: 1,
		};
		const rawRelease = makeRelease({ guid: "cat1" });

		mocks.selectAll
			.mockReturnValueOnce([manualIndexer]) // enabled manual
			.mockReturnValueOnce([]); // enabled synced

		// bookId lookup
		mocks.selectGet.mockReturnValueOnce({
			title: "Test Book",
			authorName: "Author",
		});

		// getProfilesForBook: booksAuthors, authorDownloadProfiles, downloadProfiles
		mocks.selectGet.mockReturnValueOnce({ authorId: 1 }); // booksAuthors for category derivation
		mocks.selectAll.mockReturnValueOnce([{ downloadProfileId: 1 }]); // authorDownloadProfiles
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 1,
				name: "P1",
				items: [[5]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [3030, 7020],
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 0,
			},
		]); // downloadProfiles

		mocks.canQueryIndexer.mockReturnValue({ allowed: true });
		mocks.searchNewznab.mockResolvedValueOnce([rawRelease]);
		mocks.enrichRelease.mockReturnValue(rawRelease);

		// Mocks for dedupeAndScoreReleases
		mocks.selectGet.mockReturnValueOnce({ authorId: 1 }); // booksAuthors in dedupeAndScoreReleases
		mocks.selectAll.mockReturnValueOnce([{ downloadProfileId: 1 }]); // authorDownloadProfiles
		mocks.selectAll.mockReturnValueOnce([
			{
				id: 1,
				name: "P1",
				items: [[5]],
				cutoff: 0,
				upgradeAllowed: false,
				categories: [3030, 7020],
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 0,
			},
		]);
		mocks.selectGet.mockReturnValueOnce(undefined); // editionMeta
		mocks.matchAllFormats.mockReturnValueOnce([]);
		mocks.isFormatInProfile.mockReturnValueOnce(true);
		mocks.getProfileWeight.mockReturnValueOnce(10);
		mocks.calculateCFScore.mockReturnValueOnce({
			totalScore: 0,
			matchedFormats: [],
		});
		mocks.selectAll.mockReturnValueOnce([]); // blocklist

		const { searchIndexersFn } = await import("../indexers");
		const result = await searchIndexersFn({
			data: { query: "Test Book", bookId: 42, categories: null },
		});

		expect(result.releases).toHaveLength(1);
		// Categories from profile were used in the search
		expect(mocks.searchNewznab).toHaveBeenCalledWith(
			expect.anything(),
			"Test Book",
			[3030, 7020],
			expect.anything(),
			expect.anything(),
		);
	});
});
