import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
	// ─── Static `all` keys ───────────────────────────────────────────────
	it("exposes static `all` keys for every domain", () => {
		expect(queryKeys.authors.all).toEqual(["authors"]);
		expect(queryKeys.books.all).toEqual(["books"]);
		expect(queryKeys.series.all).toEqual(["series"]);
		expect(queryKeys.movies.all).toEqual(["movies"]);
		expect(queryKeys.movieCollections.all).toEqual(["movieCollections"]);
		expect(queryKeys.shows.all).toEqual(["shows"]);
		expect(queryKeys.tmdb.all).toEqual(["tmdb"]);
		expect(queryKeys.history.all).toEqual(["history"]);
		expect(queryKeys.downloadProfiles.all).toEqual(["downloadProfiles"]);
		expect(queryKeys.downloadFormats.all).toEqual(["downloadFormats"]);
		expect(queryKeys.customFormats.all).toEqual(["customFormats"]);
		expect(queryKeys.dashboard.all).toEqual(["dashboard"]);
		expect(queryKeys.settings.all).toEqual(["settings"]);
		expect(queryKeys.importExclusions.all).toEqual(["importExclusions"]);
		expect(queryKeys.metadataProfile.all).toEqual(["metadataProfile"]);
		expect(queryKeys.downloadClients.all).toEqual(["downloadClients"]);
		expect(queryKeys.indexers.all).toEqual(["indexers"]);
		expect(queryKeys.syncedIndexers.all).toEqual(["syncedIndexers"]);
		expect(queryKeys.hardcover.all).toEqual(["hardcover"]);
		expect(queryKeys.queue.all).toEqual(["queue"]);
		expect(queryKeys.blocklist.all).toEqual(["blocklist"]);
		expect(queryKeys.unmappedFiles.all).toEqual(["unmappedFiles"]);
		expect(queryKeys.commands.all).toEqual(["commands"]);
		expect(queryKeys.tasks.all).toEqual(["tasks"]);
		expect(queryKeys.userSettings.all).toEqual(["userSettings"]);
		expect(queryKeys.systemStatus.all).toEqual(["systemStatus"]);
		expect(queryKeys.filesystem.all).toEqual(["filesystem"]);
	});

	// ─── Authors ─────────────────────────────────────────────────────────
	describe("authors", () => {
		it("lists returns correct key", () => {
			expect(queryKeys.authors.lists()).toEqual(["authors", "list"]);
		});

		it("infinite includes search string", () => {
			expect(queryKeys.authors.infinite("tolkien")).toEqual([
				"authors",
				"infinite",
				"tolkien",
			]);
		});

		it("booksInfinite includes all parameters", () => {
			expect(
				queryKeys.authors.booksInfinite(1, "hobbit", "en", "title", "asc"),
			).toEqual([
				"authors",
				"booksInfinite",
				1,
				"hobbit",
				"en",
				"title",
				"asc",
			]);
		});

		it("booksInfinite works with optional parameters omitted", () => {
			expect(queryKeys.authors.booksInfinite(1, "", "en")).toEqual([
				"authors",
				"booksInfinite",
				1,
				"",
				"en",
				undefined,
				undefined,
			]);
		});

		it("detail includes id", () => {
			expect(queryKeys.authors.detail(42)).toEqual(["authors", "detail", 42]);
		});

		it("existence includes foreignId", () => {
			expect(queryKeys.authors.existence("abc")).toEqual([
				"authors",
				"existence",
				"abc",
			]);
		});
	});

	// ─── Books ───────────────────────────────────────────────────────────
	describe("books", () => {
		it("lists returns correct key", () => {
			expect(queryKeys.books.lists()).toEqual(["books", "list"]);
		});

		it("infinite includes all parameters", () => {
			expect(queryKeys.books.infinite("query", true, "title", "desc")).toEqual([
				"books",
				"infinite",
				"query",
				true,
				"title",
				"desc",
			]);
		});

		it("infinite works with optional parameters omitted", () => {
			expect(queryKeys.books.infinite("test")).toEqual([
				"books",
				"infinite",
				"test",
				undefined,
				undefined,
				undefined,
			]);
		});

		it("editionsInfinite includes bookId and sort params", () => {
			expect(queryKeys.books.editionsInfinite(5, "score", "desc")).toEqual([
				"books",
				"editionsInfinite",
				5,
				"score",
				"desc",
			]);
		});

		it("detail includes id", () => {
			expect(queryKeys.books.detail(7)).toEqual(["books", "detail", 7]);
		});

		it("existence spreads foreignBookIds", () => {
			expect(queryKeys.books.existence(["a", "b", "c"])).toEqual([
				"books",
				"existence",
				"a",
				"b",
				"c",
			]);
		});
	});

	// ─── Series ──────────────────────────────────────────────────────────
	describe("series", () => {
		it("list returns correct key", () => {
			expect(queryKeys.series.list()).toEqual(["series", "list"]);
		});
	});

	// ─── Movies ──────────────────────────────────────────────────────────
	describe("movies", () => {
		it("lists returns correct key", () => {
			expect(queryKeys.movies.lists()).toEqual(["movies", "list"]);
		});

		it("detail includes id", () => {
			expect(queryKeys.movies.detail(1)).toEqual(["movies", "detail", 1]);
		});

		it("existence includes tmdbId", () => {
			expect(queryKeys.movies.existence(999)).toEqual([
				"movies",
				"existence",
				999,
			]);
		});
	});

	// ─── Movie Collections ───────────────────────────────────────────────
	describe("movieCollections", () => {
		it("list returns correct key", () => {
			expect(queryKeys.movieCollections.list()).toEqual([
				"movieCollections",
				"list",
			]);
		});
	});

	// ─── Shows ───────────────────────────────────────────────────────────
	describe("shows", () => {
		it("lists returns correct key", () => {
			expect(queryKeys.shows.lists()).toEqual(["shows", "list"]);
		});

		it("detail includes id", () => {
			expect(queryKeys.shows.detail(3)).toEqual(["shows", "detail", 3]);
		});

		it("existence includes tmdbId", () => {
			expect(queryKeys.shows.existence(456)).toEqual([
				"shows",
				"existence",
				456,
			]);
		});
	});

	// ─── TMDB ────────────────────────────────────────────────────────────
	describe("tmdb", () => {
		it("searchMovies includes query", () => {
			expect(queryKeys.tmdb.searchMovies("batman")).toEqual([
				"tmdb",
				"searchMovies",
				"batman",
			]);
		});

		it("searchShows includes query", () => {
			expect(queryKeys.tmdb.searchShows("office")).toEqual([
				"tmdb",
				"searchShows",
				"office",
			]);
		});

		it("searchMulti includes query", () => {
			expect(queryKeys.tmdb.searchMulti("star")).toEqual([
				"tmdb",
				"searchMulti",
				"star",
			]);
		});
	});

	// ─── History ──────────────────────────────────────────────────────────
	describe("history", () => {
		it("list includes params object", () => {
			const params = { page: 1, limit: 25, eventType: "bookAdded" };
			expect(queryKeys.history.list(params)).toEqual([
				"history",
				"list",
				params,
			]);
		});
	});

	// ─── Download Profiles ───────────────────────────────────────────────
	describe("downloadProfiles", () => {
		it("lists returns correct key", () => {
			expect(queryKeys.downloadProfiles.lists()).toEqual([
				"downloadProfiles",
				"list",
			]);
		});

		it("detail includes id", () => {
			expect(queryKeys.downloadProfiles.detail(2)).toEqual([
				"downloadProfiles",
				"detail",
				2,
			]);
		});
	});

	// ─── Download Formats ────────────────────────────────────────────────
	describe("downloadFormats", () => {
		it("lists returns correct key", () => {
			expect(queryKeys.downloadFormats.lists()).toEqual([
				"downloadFormats",
				"list",
			]);
		});
	});

	// ─── Custom Formats (self-referencing) ──────────────────────────────
	describe("customFormats", () => {
		it("lists spreads from all key", () => {
			expect(queryKeys.customFormats.lists()).toEqual([
				"customFormats",
				"list",
			]);
		});

		it("detail spreads from all key and includes id", () => {
			expect(queryKeys.customFormats.detail(5)).toEqual([
				"customFormats",
				"detail",
				5,
			]);
		});

		it("profileScores spreads from all key and includes profileId", () => {
			expect(queryKeys.customFormats.profileScores(3)).toEqual([
				"customFormats",
				"profileScores",
				3,
			]);
		});
	});

	// ─── Dashboard (self-referencing) ───────────────────────────────────
	describe("dashboard", () => {
		it("contentStats spreads from all key", () => {
			expect(queryKeys.dashboard.contentStats()).toEqual([
				"dashboard",
				"contentStats",
			]);
		});

		it("qualityBreakdown spreads from all key", () => {
			expect(queryKeys.dashboard.qualityBreakdown()).toEqual([
				"dashboard",
				"qualityBreakdown",
			]);
		});

		it("storage spreads from all key", () => {
			expect(queryKeys.dashboard.storage()).toEqual(["dashboard", "storage"]);
		});

		it("recentActivity spreads from all key", () => {
			expect(queryKeys.dashboard.recentActivity()).toEqual([
				"dashboard",
				"recentActivity",
			]);
		});
	});

	// ─── Settings ────────────────────────────────────────────────────────
	describe("settings", () => {
		it("map returns correct key", () => {
			expect(queryKeys.settings.map()).toEqual(["settings", "map"]);
		});
	});

	// ─── Import Exclusions ───────────────────────────────────────────────
	describe("importExclusions", () => {
		it("books returns correct key", () => {
			expect(queryKeys.importExclusions.books()).toEqual([
				"importExclusions",
				"books",
			]);
		});

		it("movies returns correct key", () => {
			expect(queryKeys.importExclusions.movies()).toEqual([
				"importExclusions",
				"movies",
			]);
		});
	});

	// ─── Download Clients ────────────────────────────────────────────────
	describe("downloadClients", () => {
		it("lists returns correct key", () => {
			expect(queryKeys.downloadClients.lists()).toEqual([
				"downloadClients",
				"list",
			]);
		});
	});

	// ─── Indexers ─────────────────────────────────────────────────────────
	describe("indexers", () => {
		it("lists returns correct key", () => {
			expect(queryKeys.indexers.lists()).toEqual(["indexers", "list"]);
		});

		it("hasEnabled returns correct key", () => {
			expect(queryKeys.indexers.hasEnabled()).toEqual([
				"indexers",
				"hasEnabled",
			]);
		});

		it("search includes bookId", () => {
			expect(queryKeys.indexers.search(10)).toEqual(["indexers", "search", 10]);
		});

		it("releaseStatus includes bookId", () => {
			expect(queryKeys.indexers.releaseStatus(10)).toEqual([
				"indexers",
				"releaseStatus",
				10,
			]);
		});
	});

	// ─── Synced Indexers ─────────────────────────────────────────────────
	describe("syncedIndexers", () => {
		it("lists returns correct key", () => {
			expect(queryKeys.syncedIndexers.lists()).toEqual([
				"syncedIndexers",
				"list",
			]);
		});
	});

	// ─── Hardcover ───────────────────────────────────────────────────────
	describe("hardcover", () => {
		it("search includes query and type", () => {
			expect(queryKeys.hardcover.search("lotr", "book")).toEqual([
				"hardcover",
				"search",
				"lotr",
				"book",
			]);
		});

		it("author includes foreignAuthorId and params", () => {
			const params = {
				page: 1,
				pageSize: 20,
				language: "en",
				sortBy: "title",
				sortDir: "asc",
			};
			expect(queryKeys.hardcover.author(42, params)).toEqual([
				"hardcover",
				"author",
				42,
				params,
			]);
		});

		it("authorSeries includes slug and lang", () => {
			expect(queryKeys.hardcover.authorSeries("jrr-tolkien", "en")).toEqual([
				"hardcover",
				"authorSeries",
				"jrr-tolkien",
				"en",
			]);
		});

		it("seriesBooks includes id and lang", () => {
			expect(queryKeys.hardcover.seriesBooks(5, "en")).toEqual([
				"hardcover",
				"seriesBooks",
				5,
				"en",
			]);
		});

		it("bookEditions includes foreignBookId and params", () => {
			const params = {
				page: 1,
				pageSize: 10,
				sortBy: "score",
				sortDir: "desc",
			};
			expect(queryKeys.hardcover.bookEditions(99, params)).toEqual([
				"hardcover",
				"bookEditions",
				99,
				params,
			]);
		});

		it("bookLanguages includes foreignBookId", () => {
			expect(queryKeys.hardcover.bookLanguages(100)).toEqual([
				"hardcover",
				"bookLanguages",
				100,
			]);
		});

		it("bookDetail includes foreignBookId", () => {
			expect(queryKeys.hardcover.bookDetail(200)).toEqual([
				"hardcover",
				"bookDetail",
				200,
			]);
		});

		it("seriesComplete includes foreignSeriesIds with excludeForeignAuthorId", () => {
			expect(queryKeys.hardcover.seriesComplete([1, 2, 3], 42)).toEqual([
				"hardcover",
				"seriesComplete",
				42,
				1,
				2,
				3,
			]);
		});

		it("seriesComplete defaults excludeForeignAuthorId to 0", () => {
			expect(queryKeys.hardcover.seriesComplete([1, 2])).toEqual([
				"hardcover",
				"seriesComplete",
				0,
				1,
				2,
			]);
		});
	});

	// ─── Queue ────────────────────────────────────────────────────────────
	describe("queue", () => {
		it("list returns correct key", () => {
			expect(queryKeys.queue.list()).toEqual(["queue", "list"]);
		});
	});

	// ─── Blocklist ────────────────────────────────────────────────────────
	describe("blocklist", () => {
		it("list includes params", () => {
			const params = { page: 2, limit: 50 };
			expect(queryKeys.blocklist.list(params)).toEqual([
				"blocklist",
				"list",
				params,
			]);
		});
	});

	// ─── Unmapped Files ──────────────────────────────────────────────────
	describe("unmappedFiles", () => {
		it("list includes params", () => {
			const params = {
				showIgnored: true,
				contentType: "book",
				search: "test",
			};
			expect(queryKeys.unmappedFiles.list(params)).toEqual([
				"unmappedFiles",
				"list",
				params,
			]);
		});

		it("count returns correct key", () => {
			expect(queryKeys.unmappedFiles.count()).toEqual([
				"unmappedFiles",
				"count",
			]);
		});
	});

	// ─── Commands ─────────────────────────────────────────────────────────
	describe("commands", () => {
		it("active returns correct key", () => {
			expect(queryKeys.commands.active()).toEqual(["commands", "active"]);
		});
	});

	// ─── Tasks ────────────────────────────────────────────────────────────
	describe("tasks", () => {
		it("list returns correct key", () => {
			expect(queryKeys.tasks.list()).toEqual(["tasks", "list"]);
		});
	});

	// ─── User Settings ───────────────────────────────────────────────────
	describe("userSettings", () => {
		it("byTable includes tableId", () => {
			expect(queryKeys.userSettings.byTable("books-table")).toEqual([
				"userSettings",
				"books-table",
			]);
		});
	});

	// ─── System Status ───────────────────────────────────────────────────
	describe("systemStatus", () => {
		it("detail returns correct key", () => {
			expect(queryKeys.systemStatus.detail()).toEqual([
				"systemStatus",
				"detail",
			]);
		});
	});

	// ─── Filesystem ──────────────────────────────────────────────────────
	describe("filesystem", () => {
		it("browse includes path", () => {
			expect(queryKeys.filesystem.browse("/media/books")).toEqual([
				"filesystem",
				"browse",
				"/media/books",
			]);
		});
	});

	// ─── Query key structure guarantees ──────────────────────────────────
	it("all keys are readonly tuples (as const)", () => {
		// Verify a few representative keys are arrays (readonly tuples compile to arrays at runtime)
		expect(Array.isArray(queryKeys.authors.all)).toBe(true);
		expect(Array.isArray(queryKeys.authors.lists())).toBe(true);
		expect(Array.isArray(queryKeys.books.infinite("test"))).toBe(true);
		expect(Array.isArray(queryKeys.customFormats.lists())).toBe(true);
		expect(Array.isArray(queryKeys.dashboard.contentStats())).toBe(true);
	});

	it("child keys are prefixed by their domain all key", () => {
		// Verify that factory functions produce keys that start with the domain prefix
		expect(queryKeys.authors.lists()[0]).toBe("authors");
		expect(queryKeys.books.detail(1)[0]).toBe("books");
		expect(queryKeys.hardcover.search("q", "t")[0]).toBe("hardcover");
		expect(queryKeys.customFormats.detail(1)[0]).toBe("customFormats");
		expect(queryKeys.dashboard.storage()[0]).toBe("dashboard");
	});
});
