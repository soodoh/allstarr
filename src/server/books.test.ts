import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	requireAdmin: vi.fn(),
	selectAll: vi.fn(),
	selectGet: vi.fn(),
	selectDistinctAll: vi.fn(),
	deleteRun: vi.fn(),
	insertRun: vi.fn(),
	updateRun: vi.fn(),
	updateReturningAll: vi.fn(),
	pickBestEdition: vi.fn(),
	pickBestEditionForProfile: vi.fn(),
	unlinkSync: vi.fn(),
}));

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
	desc: vi.fn((col: unknown) => ({ col, dir: "desc" })),
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
	exists: vi.fn((sub: unknown) => ({ exists: sub })),
	inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
	like: vi.fn((col: unknown, pat: unknown) => ({ col, pat })),
	or: vi.fn((...args: unknown[]) => ({ type: "or", args })),
	sql: (...args: unknown[]) => ({ args }),
}));

vi.mock("node:fs", () => ({
	default: { unlinkSync: (...args: unknown[]) => mocks.unlinkSync(...args) },
	unlinkSync: (...args: unknown[]) => mocks.unlinkSync(...args),
}));

vi.mock("src/db", () => {
	// Build a flexible chain that supports all common Drizzle method combos
	function createChain() {
		const chain: Record<string, ReturnType<typeof vi.fn>> = {};
		chain.from = vi.fn(() => chain);
		chain.leftJoin = vi.fn(() => chain);
		chain.innerJoin = vi.fn(() => chain);
		chain.where = vi.fn(() => chain);
		chain.orderBy = vi.fn(() => chain);
		chain.limit = vi.fn(() => chain);
		chain.offset = vi.fn(() => chain);
		chain.groupBy = vi.fn(() => chain);
		chain.$dynamic = vi.fn(() => chain);
		chain.all = vi.fn((...args: unknown[]) => mocks.selectAll(...args));
		chain.get = vi.fn((...args: unknown[]) => mocks.selectGet(...args));
		chain.filter = vi.fn(() => []);
		return chain;
	}

	function createDeleteChain() {
		const chain: Record<string, ReturnType<typeof vi.fn>> = {};
		chain.where = vi.fn(() => chain);
		chain.run = vi.fn((...args: unknown[]) => mocks.deleteRun(...args));
		return chain;
	}

	function createInsertChain() {
		const chain: Record<string, ReturnType<typeof vi.fn>> = {};
		chain.values = vi.fn(() => chain);
		chain.onConflictDoNothing = vi.fn(() => chain);
		chain.run = vi.fn((...args: unknown[]) => mocks.insertRun(...args));
		return chain;
	}

	function createUpdateChain() {
		const chain: Record<string, ReturnType<typeof vi.fn>> = {};
		chain.set = vi.fn(() => chain);
		chain.where = vi.fn(() => chain);
		chain.run = vi.fn((...args: unknown[]) => mocks.updateRun(...args));
		chain.returning = vi.fn(() => chain);
		chain.all = vi.fn((...args: unknown[]) =>
			mocks.updateReturningAll(...args),
		);
		return chain;
	}

	return {
		db: {
			select: vi.fn(() => createChain()),
			selectDistinct: vi.fn(() => createChain()),
			delete: vi.fn(() => createDeleteChain()),
			insert: vi.fn(() => createInsertChain()),
			update: vi.fn(() => createUpdateChain()),
		},
	};
});

vi.mock("src/db/schema", () => ({
	authorDownloadProfiles: {
		authorId: "authorDownloadProfiles.authorId",
		downloadProfileId: "authorDownloadProfiles.downloadProfileId",
	},
	bookFiles: {
		bookId: "bookFiles.bookId",
		id: "bookFiles.id",
		path: "bookFiles.path",
	},
	bookImportListExclusions: {
		foreignBookId: "bookImportListExclusions.foreignBookId",
	},
	books: {
		autoSwitchEdition: "books.autoSwitchEdition",
		createdAt: "books.createdAt",
		description: "books.description",
		foreignBookId: "books.foreignBookId",
		id: "books.id",
		images: "books.images",
		metadataSourceMissingSince: "books.metadataSourceMissingSince",
		metadataUpdatedAt: "books.metadataUpdatedAt",
		rating: "books.rating",
		ratingsCount: "books.ratingsCount",
		releaseDate: "books.releaseDate",
		releaseYear: "books.releaseYear",
		slug: "books.slug",
		tags: "books.tags",
		title: "books.title",
		updatedAt: "books.updatedAt",
		usersCount: "books.usersCount",
	},
	booksAuthors: {
		authorId: "booksAuthors.authorId",
		authorName: "booksAuthors.authorName",
		bookId: "booksAuthors.bookId",
		foreignAuthorId: "booksAuthors.foreignAuthorId",
		isPrimary: "booksAuthors.isPrimary",
	},
	downloadProfiles: {
		id: "downloadProfiles.id",
	},
	editionDownloadProfiles: {
		downloadProfileId: "editionDownloadProfiles.downloadProfileId",
		editionId: "editionDownloadProfiles.editionId",
	},
	editions: {
		asin: "editions.asin",
		audioLength: "editions.audioLength",
		bookId: "editions.bookId",
		contributors: "editions.contributors",
		country: "editions.country",
		createdAt: "editions.createdAt",
		editionInformation: "editions.editionInformation",
		foreignEditionId: "editions.foreignEditionId",
		format: "editions.format",
		id: "editions.id",
		images: "editions.images",
		isDefaultCover: "editions.isDefaultCover",
		isbn10: "editions.isbn10",
		isbn13: "editions.isbn13",
		language: "editions.language",
		languageCode: "editions.languageCode",
		metadataSourceMissingSince: "editions.metadataSourceMissingSince",
		metadataUpdatedAt: "editions.metadataUpdatedAt",
		pageCount: "editions.pageCount",
		publisher: "editions.publisher",
		releaseDate: "editions.releaseDate",
		score: "editions.score",
		title: "editions.title",
		usersCount: "editions.usersCount",
	},
	history: {
		eventType: "history.eventType",
	},
	series: {
		id: "series.id",
		title: "series.title",
	},
	seriesBookLinks: {
		bookId: "seriesBookLinks.bookId",
		position: "seriesBookLinks.position",
		seriesId: "seriesBookLinks.seriesId",
	},
}));

vi.mock("src/lib/editions", () => ({
	pickBestEdition: (...args: unknown[]) => mocks.pickBestEdition(...args),
	pickBestEditionForProfile: (...args: unknown[]) =>
		mocks.pickBestEditionForProfile(...args),
}));

vi.mock("src/lib/validators", () => ({
	bulkMonitorBookProfileSchema: { parse: (d: unknown) => d },
	bulkUnmonitorBookProfileSchema: { parse: (d: unknown) => d },
	deleteBookSchema: { parse: (d: unknown) => d },
	monitorBookProfileSchema: { parse: (d: unknown) => d },
	setEditionForProfileSchema: { parse: (d: unknown) => d },
	unmonitorBookProfileSchema: { parse: (d: unknown) => d },
	updateBookSchema: { parse: (d: unknown) => d },
}));

vi.mock("./middleware", () => ({
	requireAdmin: () => mocks.requireAdmin(),
	requireAuth: () => mocks.requireAuth(),
}));

import {
	bulkMonitorBookProfileFn,
	bulkUnmonitorBookProfileFn,
	checkBooksExistFn,
	deleteBookFn,
	deleteEditionFn,
	getAuthorBooksPaginatedFn,
	getBookEditionsPaginatedFn,
	getBookFn,
	getBooksFn,
	getPaginatedBooksFn,
	monitorBookProfileFn,
	reassignBookFilesFn,
	setEditionForProfileFn,
	unmonitorBookProfileFn,
	updateBookFn,
} from "./books";

describe("server/books", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.requireAuth.mockResolvedValue({ user: { id: 1 } });
		mocks.requireAdmin.mockResolvedValue({ user: { id: 1, role: "admin" } });
		mocks.selectAll.mockReturnValue([]);
		mocks.selectGet.mockReturnValue(undefined);
		mocks.pickBestEdition.mockReturnValue(undefined);
		mocks.pickBestEditionForProfile.mockReturnValue(undefined);
		mocks.updateReturningAll.mockReturnValue([]);
	});

	// ─── getBooksFn ──────────────────────────────────────────────────────

	describe("getBooksFn", () => {
		it("requires auth", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));
			await expect(getBooksFn()).rejects.toThrow("unauthorized");
		});

		it("returns books with bookAuthors map", async () => {
			// First select: main query
			mocks.selectAll.mockReturnValueOnce([
				{ id: 1, title: "Book A", authorName: "Author 1" },
				{ id: 2, title: "Book B", authorName: "Author 2" },
			]);
			// Second select: booksAuthors entries
			mocks.selectAll.mockReturnValueOnce([
				{
					bookId: 1,
					authorId: 10,
					foreignAuthorId: "fa1",
					authorName: "Author 1",
					isPrimary: true,
				},
				{
					bookId: 2,
					authorId: 20,
					foreignAuthorId: "fa2",
					authorName: "Author 2",
					isPrimary: true,
				},
			]);

			const result = await getBooksFn();

			expect(result).toHaveLength(2);
			expect(result[0]).toMatchObject({
				id: 1,
				title: "Book A",
				bookAuthors: [
					{
						authorId: 10,
						foreignAuthorId: "fa1",
						authorName: "Author 1",
						isPrimary: true,
					},
				],
			});
			expect(result[1]?.bookAuthors).toHaveLength(1);
		});

		it("returns empty bookAuthors when no bookIds", async () => {
			mocks.selectAll.mockReturnValueOnce([]);

			const result = await getBooksFn();

			expect(result).toEqual([]);
		});
	});

	// ─── getPaginatedBooksFn ─────────────────────────────────────────────

	describe("getPaginatedBooksFn", () => {
		it("requires auth", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));
			await expect(getPaginatedBooksFn({ data: {} })).rejects.toThrow(
				"unauthorized",
			);
		});

		it("returns paginated result with defaults", async () => {
			mocks.selectAll
				.mockReturnValueOnce([
					{
						id: 1,
						title: "Test",
						images: [],
						primaryAuthorName: "Auth",
						primaryAuthorId: null,
						primaryForeignAuthorId: null,
					},
				])
				// series links
				.mockReturnValueOnce([])
				// booksAuthors
				.mockReturnValueOnce([])
				// editions
				.mockReturnValueOnce([])
				// edition profile links
				.mockReturnValueOnce([])
				// author profile links
				.mockReturnValueOnce([]);
			mocks.selectGet.mockReturnValueOnce({ count: 1 });

			const result = await getPaginatedBooksFn({ data: {} });

			expect(result.page).toBe(1);
			expect(result.total).toBe(1);
			expect(result.items).toHaveLength(1);
			expect(result.items[0]).toMatchObject({ id: 1, title: "Test" });
		});

		it("uses pickBestEdition for cover selection", async () => {
			const fakeEdition = {
				id: 10,
				bookId: 1,
				images: [{ url: "http://cover.jpg" }],
				isDefaultCover: false,
				languageCode: "en",
			};

			mocks.selectAll
				.mockReturnValueOnce([
					{
						id: 1,
						title: "Test",
						images: [],
						primaryAuthorName: "Auth",
						primaryAuthorId: 5,
						primaryForeignAuthorId: "fa5",
					},
				])
				// series links
				.mockReturnValueOnce([])
				// booksAuthors
				.mockReturnValueOnce([])
				// editions
				.mockReturnValueOnce([fakeEdition])
				// edition profile links
				.mockReturnValueOnce([])
				// author profile links
				.mockReturnValueOnce([]);
			mocks.selectGet.mockReturnValueOnce({ count: 1 });
			mocks.pickBestEdition.mockReturnValueOnce(fakeEdition);

			const result = await getPaginatedBooksFn({ data: {} });

			expect(result.items[0]?.coverUrl).toBe("http://cover.jpg");
			expect(mocks.pickBestEdition).toHaveBeenCalledWith([fakeEdition], "all");
		});

		it("defaults total to 0 when count query returns null", async () => {
			mocks.selectAll.mockReturnValue([]);
			mocks.selectGet.mockReturnValueOnce(null);

			const result = await getPaginatedBooksFn({ data: {} });

			expect(result.total).toBe(0);
		});
	});

	// ─── getAuthorBooksPaginatedFn ───────────────────────────────────────

	describe("getAuthorBooksPaginatedFn", () => {
		it("requires auth", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));
			await expect(
				getAuthorBooksPaginatedFn({ data: { authorId: 1 } }),
			).rejects.toThrow("unauthorized");
		});

		it("returns paginated author books", async () => {
			mocks.selectGet.mockReturnValueOnce({ count: 2 });
			mocks.selectAll
				// bookRows (from selectDistinct, but same mock chain)
				.mockReturnValueOnce([
					{
						id: 1,
						title: "Book 1",
						images: [],
						usersCount: 10,
						rating: 4.5,
						ratingsCount: 5,
						releaseDate: "2024-01-01",
						releaseYear: 2024,
						metadataSourceMissingSince: null,
					},
				])
				// editions (empty, so edition profile links query is skipped)
				.mockReturnValueOnce([])
				// booksAuthors
				.mockReturnValueOnce([
					{
						bookId: 1,
						authorId: 10,
						foreignAuthorId: "fa1",
						authorName: "Author",
						isPrimary: true,
					},
				])
				// series links
				.mockReturnValueOnce([])
				// file counts
				.mockReturnValueOnce([]);

			const result = await getAuthorBooksPaginatedFn({
				data: { authorId: 10 },
			});

			expect(result.total).toBe(2);
			expect(result.items).toHaveLength(1);
			expect(result.items[0]).toMatchObject({ id: 1, authorName: "Author" });
		});

		it("calculates pagination correctly", async () => {
			mocks.selectGet.mockReturnValueOnce({ count: 50 });
			mocks.selectAll.mockReturnValue([]);

			const result = await getAuthorBooksPaginatedFn({
				data: { authorId: 10, page: 3, pageSize: 10 },
			});

			expect(result.page).toBe(3);
			expect(result.totalPages).toBe(5);
		});
	});

	// ─── getBookEditionsPaginatedFn ──────────────────────────────────────

	describe("getBookEditionsPaginatedFn", () => {
		it("requires auth", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));
			await expect(
				getBookEditionsPaginatedFn({ data: { bookId: 1 } }),
			).rejects.toThrow("unauthorized");
		});

		it("returns editions with download profile IDs", async () => {
			mocks.selectGet.mockReturnValueOnce({ count: 1 });
			mocks.selectAll
				.mockReturnValueOnce([{ id: 100, bookId: 1, title: "Edition 1" }])
				// profile links
				.mockReturnValueOnce([
					{ editionId: 100, downloadProfileId: 5 },
					{ editionId: 100, downloadProfileId: 6 },
				]);

			const result = await getBookEditionsPaginatedFn({
				data: { bookId: 1 },
			});

			expect(result.total).toBe(1);
			expect(result.items).toHaveLength(1);
			expect(result.items[0]).toMatchObject({
				id: 100,
				downloadProfileIds: [5, 6],
			});
		});

		it("returns empty profile IDs when no edition IDs", async () => {
			mocks.selectGet.mockReturnValueOnce({ count: 0 });
			mocks.selectAll.mockReturnValueOnce([]);

			const result = await getBookEditionsPaginatedFn({
				data: { bookId: 1 },
			});

			expect(result.items).toEqual([]);
			expect(result.total).toBe(0);
		});
	});

	// ─── getBookFn ───────────────────────────────────────────────────────

	describe("getBookFn", () => {
		it("requires auth", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));
			await expect(getBookFn({ data: { id: 1 } })).rejects.toThrow(
				"unauthorized",
			);
		});

		it("throws when book not found", async () => {
			mocks.selectGet.mockReturnValueOnce(undefined);
			await expect(getBookFn({ data: { id: 999 } })).rejects.toThrow(
				"Book not found",
			);
		});

		it("returns book with all related data", async () => {
			// book get
			mocks.selectGet.mockReturnValueOnce({
				id: 1,
				title: "My Book",
				images: [],
			});
			mocks.selectAll
				// bookAuthorEntries
				.mockReturnValueOnce([
					{
						authorId: 10,
						foreignAuthorId: "fa1",
						authorName: "Auth",
						isPrimary: true,
					},
				])
				// bookEditions
				.mockReturnValueOnce([
					{ id: 100, bookId: 1, metadataSourceMissingSince: null },
				])
				// bookSeries
				.mockReturnValueOnce([{ title: "Series A", position: "1" }])
				// languages (selectDistinct)
				.mockReturnValueOnce([{ languageCode: "en", language: "English" }]);

			// fileCountResult
			mocks.selectGet.mockReturnValueOnce({ count: 3 });

			mocks.selectAll
				// files
				.mockReturnValueOnce([{ id: 1, path: "/books/file.epub" }])
				// edition profile links
				.mockReturnValueOnce([{ editionId: 100, downloadProfileId: 5 }])
				// author download profile IDs
				.mockReturnValueOnce([{ downloadProfileId: 7 }]);

			const result = await getBookFn({ data: { id: 1 } });

			expect(result).toMatchObject({
				id: 1,
				title: "My Book",
				authorId: 10,
				authorName: "Auth",
				fileCount: 3,
				missingEditionsCount: 0,
			});
			expect(result.series).toEqual([{ title: "Series A", position: "1" }]);
			expect(result.languages).toEqual([
				{ languageCode: "en", language: "English" },
			]);
			expect(result.downloadProfileIds).toEqual([5]);
			expect(result.authorDownloadProfileIds).toEqual([7]);
			expect(result.bookAuthors).toHaveLength(1);
		});

		it("counts editions with missing metadata", async () => {
			mocks.selectGet.mockReturnValueOnce({ id: 1, title: "Book", images: [] });
			mocks.selectAll
				// bookAuthorEntries
				.mockReturnValueOnce([])
				// bookEditions with some missing
				.mockReturnValueOnce([
					{ id: 100, bookId: 1, metadataSourceMissingSince: null },
					{
						id: 101,
						bookId: 1,
						metadataSourceMissingSince: "2024-01-01",
					},
					{
						id: 102,
						bookId: 1,
						metadataSourceMissingSince: "2024-02-01",
					},
				])
				// bookSeries
				.mockReturnValueOnce([])
				// languages
				.mockReturnValueOnce([]);
			mocks.selectGet.mockReturnValueOnce({ count: 0 });
			mocks.selectAll
				// files
				.mockReturnValueOnce([])
				// edition profile links
				.mockReturnValueOnce([]);

			const result = await getBookFn({ data: { id: 1 } });

			expect(result.missingEditionsCount).toBe(2);
		});
	});

	// ─── updateBookFn ────────────────────────────────────────────────────

	describe("updateBookFn", () => {
		it("requires admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
			await expect(
				updateBookFn({ data: { id: 1, autoSwitchEdition: true } }),
			).rejects.toThrow("forbidden");
		});

		it("updates book and returns success", async () => {
			const result = await updateBookFn({
				data: { id: 1, autoSwitchEdition: false },
			});

			expect(result).toEqual({ success: true });
			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.updateRun).toHaveBeenCalledTimes(1);
		});
	});

	// ─── deleteBookFn ────────────────────────────────────────────────────

	describe("deleteBookFn", () => {
		it("requires admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
			await expect(deleteBookFn({ data: { id: 1 } })).rejects.toThrow(
				"forbidden",
			);
		});

		it("throws when book not found", async () => {
			mocks.selectGet.mockReturnValueOnce(undefined);
			await expect(deleteBookFn({ data: { id: 999 } })).rejects.toThrow(
				"Book not found",
			);
		});

		it("deletes a book and logs history", async () => {
			// book lookup
			mocks.selectGet.mockReturnValueOnce({
				id: 1,
				title: "Delete Me",
				foreignBookId: "fb1",
			});
			// primary author entry
			mocks.selectGet.mockReturnValueOnce({
				authorId: 10,
				authorName: "Author",
			});

			const result = await deleteBookFn({
				data: { id: 1, deleteFiles: false, addImportExclusion: false },
			});

			expect(result).toEqual({ success: true });
			// delete + history insert
			expect(mocks.deleteRun).toHaveBeenCalledTimes(1);
			expect(mocks.insertRun).toHaveBeenCalledTimes(1);
		});

		it("deletes files from disk when deleteFiles is true", async () => {
			mocks.selectGet.mockReturnValueOnce({
				id: 1,
				title: "Delete Me",
				foreignBookId: "fb1",
			});
			mocks.selectGet.mockReturnValueOnce({ authorId: 10, authorName: "A" });
			// files query
			mocks.selectAll.mockReturnValueOnce([
				{ path: "/books/a.epub" },
				{ path: "/books/b.epub" },
			]);

			await deleteBookFn({
				data: { id: 1, deleteFiles: true, addImportExclusion: false },
			});

			expect(mocks.unlinkSync).toHaveBeenCalledTimes(2);
			expect(mocks.unlinkSync).toHaveBeenCalledWith("/books/a.epub");
			expect(mocks.unlinkSync).toHaveBeenCalledWith("/books/b.epub");
		});

		it("tolerates file deletion errors", async () => {
			mocks.selectGet.mockReturnValueOnce({
				id: 1,
				title: "X",
				foreignBookId: "fb1",
			});
			mocks.selectGet.mockReturnValueOnce({ authorId: 10, authorName: "A" });
			mocks.selectAll.mockReturnValueOnce([{ path: "/missing.epub" }]);
			mocks.unlinkSync.mockImplementationOnce(() => {
				throw new Error("ENOENT");
			});

			// Should not throw
			await expect(
				deleteBookFn({
					data: { id: 1, deleteFiles: true, addImportExclusion: false },
				}),
			).resolves.toEqual({ success: true });
		});

		it("adds import exclusion when requested", async () => {
			mocks.selectGet.mockReturnValueOnce({
				id: 1,
				title: "Excluded",
				foreignBookId: "fb1",
			});
			mocks.selectGet.mockReturnValueOnce({
				authorId: 10,
				authorName: "Author",
			});

			await deleteBookFn({
				data: { id: 1, deleteFiles: false, addImportExclusion: true },
			});

			// insert for exclusion + insert for history = 2
			expect(mocks.insertRun).toHaveBeenCalledTimes(2);
		});
	});

	// ─── monitorBookProfileFn ────────────────────────────────────────────

	describe("monitorBookProfileFn", () => {
		it("requires admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
			await expect(
				monitorBookProfileFn({
					data: { bookId: 1, downloadProfileId: 1 },
				}),
			).rejects.toThrow("forbidden");
		});

		it("throws when profile not found", async () => {
			// profile lookup returns undefined
			mocks.selectGet.mockReturnValueOnce(undefined);

			await expect(
				monitorBookProfileFn({
					data: { bookId: 1, downloadProfileId: 99 },
				}),
			).rejects.toThrow("Download profile not found");
		});

		it("throws when no suitable edition found", async () => {
			mocks.selectGet.mockReturnValueOnce({
				id: 1,
				name: "Profile",
				contentType: "ebook",
				language: "en",
			});
			mocks.selectAll.mockReturnValueOnce([{ id: 100 }]);
			mocks.pickBestEditionForProfile.mockReturnValueOnce(undefined);

			await expect(
				monitorBookProfileFn({
					data: { bookId: 1, downloadProfileId: 1 },
				}),
			).rejects.toThrow("No suitable edition found");
		});

		it("links best edition to profile and logs history", async () => {
			const profile = {
				id: 5,
				name: "My Profile",
				contentType: "ebook",
				language: "en",
			};
			const bestEdition = { id: 100, title: "Best Edition" };

			mocks.selectGet
				// profile
				.mockReturnValueOnce(profile);
			mocks.selectAll
				// bookEditions
				.mockReturnValueOnce([{ id: 100 }, { id: 101 }]);
			mocks.pickBestEditionForProfile.mockReturnValueOnce(bestEdition);
			// book lookup for history
			mocks.selectGet.mockReturnValueOnce({
				id: 1,
				title: "My Book",
			});

			const result = await monitorBookProfileFn({
				data: { bookId: 1, downloadProfileId: 5 },
			});

			expect(result).toEqual({ bookId: 1, editionId: 100 });
			// delete old link + insert new link + insert history = 1 delete, 2 inserts
			expect(mocks.deleteRun).toHaveBeenCalledTimes(1);
			expect(mocks.insertRun).toHaveBeenCalledTimes(2);
		});
	});

	// ─── unmonitorBookProfileFn ──────────────────────────────────────────

	describe("unmonitorBookProfileFn", () => {
		it("requires admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
			await expect(
				unmonitorBookProfileFn({
					data: { bookId: 1, downloadProfileId: 1, deleteFiles: false },
				}),
			).rejects.toThrow("forbidden");
		});

		it("removes edition-profile links and logs history", async () => {
			mocks.selectAll
				// bookEditions
				.mockReturnValueOnce([{ id: 100 }, { id: 101 }]);
			// profile lookup
			mocks.selectGet.mockReturnValueOnce({ id: 5, name: "Profile" });
			// book lookup
			mocks.selectGet.mockReturnValueOnce({ id: 1, title: "Book" });

			const result = await unmonitorBookProfileFn({
				data: { bookId: 1, downloadProfileId: 5, deleteFiles: false },
			});

			expect(result).toEqual({ bookId: 1 });
			expect(mocks.deleteRun).toHaveBeenCalledTimes(1);
			expect(mocks.insertRun).toHaveBeenCalledTimes(1);
		});

		it("deletes files when deleteFiles is true", async () => {
			mocks.selectAll
				// bookEditions
				.mockReturnValueOnce([{ id: 100 }])
				// files
				.mockReturnValueOnce([
					{ path: "/books/a.epub" },
					{ path: "/books/b.epub" },
				]);
			mocks.selectGet.mockReturnValueOnce({ id: 5, name: "P" });
			mocks.selectGet.mockReturnValueOnce({ id: 1, title: "Book" });

			await unmonitorBookProfileFn({
				data: { bookId: 1, downloadProfileId: 5, deleteFiles: true },
			});

			expect(mocks.unlinkSync).toHaveBeenCalledTimes(2);
			// delete edition links + delete bookFiles
			expect(mocks.deleteRun).toHaveBeenCalledTimes(2);
		});
	});

	// ─── bulkMonitorBookProfileFn ────────────────────────────────────────

	describe("bulkMonitorBookProfileFn", () => {
		it("requires admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
			await expect(
				bulkMonitorBookProfileFn({
					data: { bookIds: [1], downloadProfileId: 1 },
				}),
			).rejects.toThrow("forbidden");
		});

		it("throws when profile not found", async () => {
			mocks.selectGet.mockReturnValueOnce(undefined);

			await expect(
				bulkMonitorBookProfileFn({
					data: { bookIds: [1, 2], downloadProfileId: 99 },
				}),
			).rejects.toThrow("Download profile not found");
		});

		it("monitors multiple books, skipping those without suitable editions", async () => {
			const profile = {
				id: 5,
				name: "P",
				contentType: "ebook",
				language: "en",
			};
			mocks.selectGet.mockReturnValueOnce(profile);

			// Book 1: has editions, best found
			mocks.selectAll.mockReturnValueOnce([{ id: 100 }]);
			mocks.pickBestEditionForProfile.mockReturnValueOnce({
				id: 100,
				title: "Ed1",
			});
			// Book 2: has editions, no best
			mocks.selectAll.mockReturnValueOnce([{ id: 200 }]);
			mocks.pickBestEditionForProfile.mockReturnValueOnce(undefined);

			const result = await bulkMonitorBookProfileFn({
				data: { bookIds: [1, 2], downloadProfileId: 5 },
			});

			expect(result).toEqual({ success: true });
			// Only book 1 should have delete + insert
			expect(mocks.deleteRun).toHaveBeenCalledTimes(1);
			expect(mocks.insertRun).toHaveBeenCalledTimes(1);
		});
	});

	// ─── bulkUnmonitorBookProfileFn ──────────────────────────────────────

	describe("bulkUnmonitorBookProfileFn", () => {
		it("requires admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
			await expect(
				bulkUnmonitorBookProfileFn({
					data: {
						bookIds: [1],
						downloadProfileId: 1,
						deleteFiles: false,
					},
				}),
			).rejects.toThrow("forbidden");
		});

		it("returns early when bookIds is empty", async () => {
			const result = await bulkUnmonitorBookProfileFn({
				data: { bookIds: [], downloadProfileId: 1, deleteFiles: false },
			});

			expect(result).toEqual({ success: true });
			expect(mocks.deleteRun).not.toHaveBeenCalled();
		});

		it("deletes edition-profile links for multiple books", async () => {
			mocks.selectAll.mockReturnValueOnce([
				{ id: 100, bookId: 1 },
				{ id: 200, bookId: 2 },
			]);

			const result = await bulkUnmonitorBookProfileFn({
				data: {
					bookIds: [1, 2],
					downloadProfileId: 5,
					deleteFiles: false,
				},
			});

			expect(result).toEqual({ success: true });
			expect(mocks.deleteRun).toHaveBeenCalledTimes(1);
		});

		it("deletes files and bookFiles records when deleteFiles is true", async () => {
			mocks.selectAll
				// editions
				.mockReturnValueOnce([{ id: 100, bookId: 1 }])
				// files for book 1
				.mockReturnValueOnce([{ path: "/books/a.epub" }]);

			await bulkUnmonitorBookProfileFn({
				data: {
					bookIds: [1],
					downloadProfileId: 5,
					deleteFiles: true,
				},
			});

			expect(mocks.unlinkSync).toHaveBeenCalledWith("/books/a.epub");
			// delete edition links + delete bookFiles
			expect(mocks.deleteRun).toHaveBeenCalledTimes(2);
		});
	});

	// ─── setEditionForProfileFn ──────────────────────────────────────────

	describe("setEditionForProfileFn", () => {
		it("requires admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
			await expect(
				setEditionForProfileFn({
					data: { editionId: 1, downloadProfileId: 1 },
				}),
			).rejects.toThrow("forbidden");
		});

		it("throws when edition not found", async () => {
			mocks.selectGet.mockReturnValueOnce(undefined);

			await expect(
				setEditionForProfileFn({
					data: { editionId: 999, downloadProfileId: 1 },
				}),
			).rejects.toThrow("Edition not found");
		});

		it("replaces existing link and inserts new one", async () => {
			// edition lookup
			mocks.selectGet.mockReturnValueOnce({
				id: 100,
				bookId: 1,
			});
			// other editions for same book
			mocks.selectAll.mockReturnValueOnce([{ id: 100 }, { id: 101 }]);

			const result = await setEditionForProfileFn({
				data: { editionId: 100, downloadProfileId: 5 },
			});

			expect(result).toEqual({ editionId: 100 });
			expect(mocks.deleteRun).toHaveBeenCalledTimes(1);
			expect(mocks.insertRun).toHaveBeenCalledTimes(1);
		});
	});

	// ─── checkBooksExistFn ───────────────────────────────────────────────

	describe("checkBooksExistFn", () => {
		it("requires auth", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));
			await expect(
				checkBooksExistFn({ data: { foreignBookIds: ["fb1"] } }),
			).rejects.toThrow("unauthorized");
		});

		it("returns empty array for empty input", async () => {
			const result = await checkBooksExistFn({
				data: { foreignBookIds: [] },
			});
			expect(result).toEqual([]);
		});

		it("returns matching books", async () => {
			mocks.selectAll.mockReturnValueOnce([{ id: 1, foreignBookId: "fb1" }]);

			const result = await checkBooksExistFn({
				data: { foreignBookIds: ["fb1", "fb2"] },
			});

			expect(result).toEqual([{ id: 1, foreignBookId: "fb1" }]);
		});
	});

	// ─── deleteEditionFn ─────────────────────────────────────────────────

	describe("deleteEditionFn", () => {
		it("requires admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
			await expect(deleteEditionFn({ data: { id: 1 } })).rejects.toThrow(
				"forbidden",
			);
		});

		it("deletes edition and returns success", async () => {
			const result = await deleteEditionFn({ data: { id: 42 } });

			expect(result).toEqual({ success: true });
			expect(mocks.deleteRun).toHaveBeenCalledTimes(1);
		});
	});

	// ─── reassignBookFilesFn ─────────────────────────────────────────────

	describe("reassignBookFilesFn", () => {
		it("requires admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
			await expect(
				reassignBookFilesFn({
					data: { fromBookId: 1, toBookId: 2 },
				}),
			).rejects.toThrow("forbidden");
		});

		it("throws when target book not found", async () => {
			mocks.selectGet.mockReturnValueOnce(undefined);

			await expect(
				reassignBookFilesFn({
					data: { fromBookId: 1, toBookId: 999 },
				}),
			).rejects.toThrow("Target book not found");
		});

		it("reassigns files and returns count", async () => {
			mocks.selectGet.mockReturnValueOnce({ id: 2 });
			mocks.updateReturningAll.mockReturnValueOnce([{ id: 10 }, { id: 11 }]);

			const result = await reassignBookFilesFn({
				data: { fromBookId: 1, toBookId: 2 },
			});

			expect(result).toEqual({ reassigned: 2 });
		});

		it("returns zero when no files to reassign", async () => {
			mocks.selectGet.mockReturnValueOnce({ id: 2 });
			mocks.updateReturningAll.mockReturnValueOnce([]);

			const result = await reassignBookFilesFn({
				data: { fromBookId: 1, toBookId: 2 },
			});

			expect(result).toEqual({ reassigned: 0 });
		});
	});
});
