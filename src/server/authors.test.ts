import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const and = vi.fn((...conditions: unknown[]) => ({
		kind: "and",
		conditions,
	}));
	const desc = vi.fn((column: unknown) => ({ kind: "desc", column }));
	const eq = vi.fn((left: unknown, right: unknown) => ({
		kind: "eq",
		left,
		right,
	}));
	const inArray = vi.fn((col: unknown, vals: unknown) => ({
		kind: "inArray",
		col,
		vals,
	}));
	const isNotNull = vi.fn((col: unknown) => ({ kind: "isNotNull", col }));
	const like = vi.fn((col: unknown, pat: unknown) => ({
		kind: "like",
		col,
		pat,
	}));
	const sql = vi.fn((strings: TemplateStringsArray, ..._values: unknown[]) => ({
		kind: "sql",
		text: strings.join(""),
	}));

	const requireAdmin = vi.fn();
	const requireAuth = vi.fn();
	const getProfileLanguages = vi.fn();
	const fetchSeriesComplete = vi.fn();

	const select = vi.fn();
	const deleteFn = vi.fn();
	const updateFn = vi.fn();
	const insertFn = vi.fn();

	return {
		and,
		desc,
		deleteFn,
		eq,
		fetchSeriesComplete,
		getProfileLanguages,
		inArray,
		insertFn,
		isNotNull,
		like,
		requireAdmin,
		requireAuth,
		select,
		sql,
		updateFn,

		// Mutable state for select chain results
		authorRow: null as Record<string, unknown> | null,
		itemRows: [] as Array<Record<string, unknown>>,
		countResult: { count: 0 } as { count: number } | undefined,
		bookAuthorEntries: [] as Array<Record<string, unknown>>,
		bookRows: [] as Array<Record<string, unknown>>,
		allBookAuthorEntries: [] as Array<Record<string, unknown>>,
		seriesLinks: [] as Array<Record<string, unknown>>,
		seriesProfileLinks: [] as Array<Record<string, unknown>>,
		editionRows: [] as Array<Record<string, unknown>>,
		editionProfileLinks: [] as Array<Record<string, unknown>>,
		availableLanguages: [] as Array<Record<string, unknown>>,
		fileCountRows: [] as Array<Record<string, unknown>>,
		profileLinkRows: [] as Array<Record<string, unknown>>,
	};
});

const schemaMocks = vi.hoisted(
	() =>
		({
			authorDownloadProfiles: {
				authorId: "authorDownloadProfiles.authorId",
				downloadProfileId: "authorDownloadProfiles.downloadProfileId",
			},
			authors: {
				bio: "authors.bio",
				createdAt: "authors.createdAt",
				foreignAuthorId: "authors.foreignAuthorId",
				id: "authors.id",
				images: "authors.images",
				isStub: "authors.isStub",
				metadataUpdatedAt: "authors.metadataUpdatedAt",
				name: "authors.name",
				slug: "authors.slug",
				sortName: "authors.sortName",
				status: "authors.status",
				tags: "authors.tags",
				updatedAt: "authors.updatedAt",
			},
			bookFiles: {
				bookId: "bookFiles.bookId",
			},
			books: {
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
			editionDownloadProfiles: {
				downloadProfileId: "editionDownloadProfiles.downloadProfileId",
				editionId: "editionDownloadProfiles.editionId",
			},
			editions: {
				asin: "editions.asin",
				bookId: "editions.bookId",
				country: "editions.country",
				format: "editions.format",
				id: "editions.id",
				images: "editions.images",
				isbn10: "editions.isbn10",
				isbn13: "editions.isbn13",
				isDefaultCover: "editions.isDefaultCover",
				language: "editions.language",
				languageCode: "editions.languageCode",
				metadataSourceMissingSince: "editions.metadataSourceMissingSince",
				pageCount: "editions.pageCount",
				publisher: "editions.publisher",
				releaseDate: "editions.releaseDate",
				score: "editions.score",
				title: "editions.title",
				usersCount: "editions.usersCount",
			},
			history: {},
			series: {
				foreignSeriesId: "series.foreignSeriesId",
				id: "series.id",
				isCompleted: "series.isCompleted",
				monitored: "series.monitored",
				slug: "series.slug",
				title: "series.title",
			},
			seriesBookLinks: {
				bookId: "seriesBookLinks.bookId",
				position: "seriesBookLinks.position",
				seriesId: "seriesBookLinks.seriesId",
			},
			seriesDownloadProfiles: {
				downloadProfileId: "seriesDownloadProfiles.downloadProfileId",
				seriesId: "seriesDownloadProfiles.seriesId",
			},
		}) as const,
);

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
		inputValidator: () => ({
			handler: (handler: (...args: unknown[]) => unknown) => handler,
		}),
	}),
}));

vi.mock("drizzle-orm", () => ({
	and: mocks.and,
	desc: mocks.desc,
	eq: mocks.eq,
	inArray: mocks.inArray,
	isNotNull: mocks.isNotNull,
	like: mocks.like,
	sql: mocks.sql,
}));

vi.mock("src/db", () => ({
	db: {
		delete: mocks.deleteFn,
		insert: mocks.insertFn,
		select: mocks.select,
		update: mocks.updateFn,
	},
}));

vi.mock("src/db/schema", () => schemaMocks);

vi.mock("src/lib/validators", () => ({
	updateAuthorSchema: {
		parse: (d: unknown) => d,
	},
}));

vi.mock("./hardcover/import-queries", () => ({
	fetchSeriesComplete: mocks.fetchSeriesComplete,
}));

vi.mock("./middleware", () => ({
	requireAdmin: mocks.requireAdmin,
	requireAuth: mocks.requireAuth,
}));

vi.mock("./profile-languages", () => ({
	default: mocks.getProfileLanguages,
}));

import {
	checkAuthorExistsFn,
	deleteAuthorFn,
	getAuthorFn,
	getPaginatedAuthorsFn,
	getSeriesFromHardcoverFn,
	updateAuthorFn,
} from "./authors";

// ─── Chain helpers ──────────────────────────────────────────────────────────

type SelectChain = {
	$dynamic: ReturnType<typeof vi.fn>;
	all: ReturnType<typeof vi.fn>;
	filter: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	groupBy: ReturnType<typeof vi.fn>;
	innerJoin: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	offset: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

type DeleteChain = {
	run: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

type UpdateChain = {
	run: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

type InsertChain = {
	run: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
};

function createSelectChain(
	allResult: unknown,
	getResult?: unknown,
): SelectChain {
	const chain = {} as SelectChain;
	chain.$dynamic = vi.fn(() => chain);
	chain.all = vi.fn(() => allResult);
	chain.filter = vi.fn(() => allResult);
	chain.from = vi.fn(() => chain);
	chain.get = vi.fn(
		() => getResult ?? (Array.isArray(allResult) ? allResult[0] : allResult),
	);
	chain.groupBy = vi.fn(() => chain);
	chain.innerJoin = vi.fn(() => chain);
	chain.limit = vi.fn(() => chain);
	chain.offset = vi.fn(() => chain);
	chain.orderBy = vi.fn(() => chain);
	chain.where = vi.fn(() => chain);
	return chain;
}

function createDeleteChain(): DeleteChain {
	const chain = {} as DeleteChain;
	chain.run = vi.fn();
	chain.where = vi.fn(() => chain);
	return chain;
}

function createUpdateChain(): UpdateChain {
	const chain = {} as UpdateChain;
	chain.run = vi.fn();
	chain.where = vi.fn(() => chain);
	chain.set = vi.fn(() => chain);
	return chain;
}

function createInsertChain(): InsertChain {
	const chain = {} as InsertChain;
	chain.run = vi.fn();
	chain.values = vi.fn(() => chain);
	return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("server/authors", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireAuth.mockResolvedValue({ user: { id: 1 } });
		mocks.requireAdmin.mockResolvedValue({ user: { id: 1, role: "admin" } });
		mocks.authorRow = null;
		mocks.itemRows = [];
		mocks.countResult = { count: 0 };
		mocks.bookAuthorEntries = [];
		mocks.bookRows = [];
		mocks.allBookAuthorEntries = [];
		mocks.seriesLinks = [];
		mocks.seriesProfileLinks = [];
		mocks.editionRows = [];
		mocks.editionProfileLinks = [];
		mocks.availableLanguages = [];
		mocks.fileCountRows = [];
		mocks.profileLinkRows = [];
	});

	// ─── getPaginatedAuthorsFn ────────────────────────────────────────────

	describe("getPaginatedAuthorsFn", () => {
		function setupPaginatedMocks() {
			// select call order:
			// 1. items query (returns $dynamic chain)
			// 2. count query (returns get chain)
			// 3. profileLinks query (returns all chain)
			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				if (callIndex === 1) {
					return createSelectChain(mocks.itemRows);
				}
				if (callIndex === 2) {
					return createSelectChain([], mocks.countResult);
				}
				// profileLinks
				return createSelectChain(mocks.profileLinkRows);
			});
		}

		it("requires auth before querying", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("no auth"));

			await expect(getPaginatedAuthorsFn({ data: {} })).rejects.toThrow(
				"no auth",
			);
			expect(mocks.select).not.toHaveBeenCalled();
		});

		it("returns paginated items with defaults (page 1, pageSize 25)", async () => {
			mocks.itemRows = [
				{ id: 1, name: "Author One" },
				{ id: 2, name: "Author Two" },
			];
			mocks.countResult = { count: 2 };
			mocks.profileLinkRows = [{ authorId: 1, downloadProfileId: 10 }];
			setupPaginatedMocks();

			const result = await getPaginatedAuthorsFn({ data: {} });

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result.page).toBe(1);
			expect(result.total).toBe(2);
			expect(result.totalPages).toBe(1);
			expect(result.items).toHaveLength(2);
			expect(result.items[0]).toEqual({
				id: 1,
				name: "Author One",
				downloadProfileIds: [10],
			});
			expect(result.items[1]).toEqual({
				id: 2,
				name: "Author Two",
				downloadProfileIds: [],
			});
		});

		it("applies search filter when search is provided", async () => {
			mocks.itemRows = [{ id: 3, name: "King" }];
			mocks.countResult = { count: 1 };
			mocks.profileLinkRows = [];
			setupPaginatedMocks();

			const result = await getPaginatedAuthorsFn({
				data: { search: "King" },
			});

			expect(result.total).toBe(1);
			expect(mocks.like).toHaveBeenCalledWith(
				schemaMocks.authors.name,
				"%King%",
			);
		});

		it("respects custom page and pageSize", async () => {
			mocks.itemRows = [];
			mocks.countResult = { count: 100 };
			mocks.profileLinkRows = [];
			setupPaginatedMocks();

			const result = await getPaginatedAuthorsFn({
				data: { page: 3, pageSize: 10 },
			});

			expect(result.page).toBe(3);
			expect(result.totalPages).toBe(10);

			// Verify limit/offset on the items chain
			const itemsChain = mocks.select.mock.results[0]?.value as SelectChain;
			expect(itemsChain.limit).toHaveBeenCalledWith(10);
			expect(itemsChain.offset).toHaveBeenCalledWith(20);
		});

		it("returns total 0 when countResult is undefined", async () => {
			mocks.countResult = undefined;
			mocks.itemRows = [];
			mocks.profileLinkRows = [];
			setupPaginatedMocks();

			const result = await getPaginatedAuthorsFn({ data: {} });

			expect(result.total).toBe(0);
			expect(result.totalPages).toBe(0);
		});

		it("skips profile query when no authors are returned", async () => {
			mocks.itemRows = [];
			mocks.countResult = { count: 0 };
			setupPaginatedMocks();

			const result = await getPaginatedAuthorsFn({ data: {} });

			// Only 2 select calls (items + count), no profile query
			expect(mocks.select).toHaveBeenCalledTimes(2);
			expect(result.items).toEqual([]);
		});
	});

	// ─── getAuthorFn ─────────────────────────────────────────────────────

	describe("getAuthorFn", () => {
		function setupAuthorDetailMocks() {
			// Build a queue of chain results in the order calls will actually happen.
			// Conditional queries are only added when bookIds/seriesIds/editionIds > 0.
			const hasBooks = mocks.bookAuthorEntries.length > 0;
			const hasSeriesLinks = mocks.seriesLinks.length > 0;
			const hasEditions = mocks.editionRows.length > 0;

			const queue: SelectChain[] = [
				// 1. author lookup
				createSelectChain([], mocks.authorRow),
				// 2. authorBookEntries
				createSelectChain(mocks.bookAuthorEntries),
			];

			if (hasBooks) {
				// 3. authorBooks
				queue.push(createSelectChain(mocks.bookRows));
				// 4. allBookAuthorEntries
				queue.push(createSelectChain(mocks.allBookAuthorEntries));
				// 5. seriesLinks
				queue.push(createSelectChain(mocks.seriesLinks));
				if (hasSeriesLinks) {
					// 6. seriesProfileLinks
					queue.push(createSelectChain(mocks.seriesProfileLinks));
				}
				// 7. allEditions
				queue.push(createSelectChain(mocks.editionRows));
				if (hasEditions) {
					// 8. editionProfileLinks
					queue.push(createSelectChain(mocks.editionProfileLinks));
				}
				// 9. availableLanguages
				queue.push(createSelectChain(mocks.availableLanguages));
				// 10. fileCounts
				queue.push(createSelectChain(mocks.fileCountRows));
			}

			// 11. authorDownloadProfiles (always runs)
			queue.push(createSelectChain(mocks.profileLinkRows));

			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				const chain = queue[callIndex] ?? createSelectChain([]);
				callIndex++;
				return chain;
			});
		}

		it("requires auth before querying", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("no auth"));

			await expect(getAuthorFn({ data: { id: 1 } })).rejects.toThrow("no auth");
			expect(mocks.select).not.toHaveBeenCalled();
		});

		it("throws when author is not found", async () => {
			mocks.authorRow = null;
			setupAuthorDetailMocks();

			await expect(getAuthorFn({ data: { id: 999 } })).rejects.toThrow(
				"Author not found",
			);
		});

		it("returns author with empty books when no book entries exist", async () => {
			mocks.authorRow = { id: 5, name: "Author Five", slug: "author-five" };
			mocks.bookAuthorEntries = [];
			mocks.profileLinkRows = [{ downloadProfileId: 10 }];
			setupAuthorDetailMocks();

			const result = await getAuthorFn({ data: { id: 5 } });

			expect(result.id).toBe(5);
			expect(result.name).toBe("Author Five");
			expect(result.books).toEqual([]);
			expect(result.series).toEqual([]);
			expect(result.availableLanguages).toEqual([]);
			expect(result.downloadProfileIds).toEqual([10]);
		});

		it("returns author with books, editions, and series", async () => {
			mocks.authorRow = { id: 1, name: "Author One" };
			mocks.bookAuthorEntries = [{ bookId: 100 }];
			mocks.bookRows = [
				{
					id: 100,
					title: "Book One",
					slug: "book-one",
					description: null,
					releaseDate: null,
					releaseYear: 2020,
					foreignBookId: "fb-100",
					images: null,
					rating: 4.5,
					ratingsCount: 100,
					usersCount: 500,
					tags: null,
					metadataUpdatedAt: null,
					metadataSourceMissingSince: null,
					createdAt: "2026-01-01",
					updatedAt: "2026-01-01",
				},
			];
			mocks.allBookAuthorEntries = [
				{
					bookId: 100,
					authorId: 1,
					foreignAuthorId: "fa-1",
					authorName: "Author One",
					isPrimary: true,
				},
			];
			mocks.seriesLinks = [];
			mocks.seriesProfileLinks = [];
			mocks.editionRows = [
				{
					id: 200,
					bookId: 100,
					title: "Edition One",
					releaseDate: null,
					format: "Hardcover",
					pageCount: 300,
					isbn10: null,
					isbn13: "978-1234567890",
					asin: null,
					publisher: "Publisher",
					country: "US",
					usersCount: 200,
					score: 80,
					languageCode: "en",
					images: null,
					isDefaultCover: false,
					metadataSourceMissingSince: null,
				},
			];
			mocks.editionProfileLinks = [{ editionId: 200, downloadProfileId: 50 }];
			mocks.availableLanguages = [
				{ languageCode: "en", language: "English", totalReaders: 500 },
			];
			mocks.fileCountRows = [{ bookId: 100, count: 2 }];
			mocks.profileLinkRows = [{ downloadProfileId: 10 }];
			setupAuthorDetailMocks();

			const result = await getAuthorFn({ data: { id: 1 } });

			expect(result.name).toBe("Author One");
			expect(result.downloadProfileIds).toEqual([10]);
			expect(result.books).toHaveLength(1);
			expect(result.books[0].title).toBe("Book One");
			expect(result.books[0].authorName).toBe("Author One");
			expect(result.books[0].downloadProfileIds).toEqual([50]);
			expect(result.books[0].editions).toHaveLength(1);
			expect(result.books[0].editions[0].downloadProfileIds).toEqual([50]);
			expect(result.books[0].fileCount).toBe(2);
			expect(result.books[0].languageCodes).toEqual(["en"]);
			expect(result.availableLanguages).toEqual([
				{ languageCode: "en", language: "English", totalReaders: 500 },
			]);
		});
	});

	// ─── updateAuthorFn ──────────────────────────────────────────────────

	describe("updateAuthorFn", () => {
		function setupUpdateMocks() {
			// select: author lookup
			mocks.select.mockImplementation(() =>
				createSelectChain([], mocks.authorRow),
			);
			// update
			mocks.updateFn.mockImplementation(() => createUpdateChain());
			// delete + insert for download profiles
			mocks.deleteFn.mockImplementation(() => createDeleteChain());
			mocks.insertFn.mockImplementation(() => createInsertChain());
		}

		it("requires admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("not admin"));

			await expect(updateAuthorFn({ data: { id: 1 } })).rejects.toThrow(
				"not admin",
			);
			expect(mocks.select).not.toHaveBeenCalled();
		});

		it("throws when author is not found", async () => {
			mocks.authorRow = null;
			setupUpdateMocks();

			await expect(updateAuthorFn({ data: { id: 999 } })).rejects.toThrow(
				"Author not found",
			);
		});

		it("updates author and replaces download profile links", async () => {
			mocks.authorRow = { id: 1, name: "Author One" };
			setupUpdateMocks();

			const result = await updateAuthorFn({
				data: { id: 1, downloadProfileIds: [10, 20] },
			});

			// Should have called update on authors
			expect(mocks.updateFn).toHaveBeenCalledWith(schemaMocks.authors);
			// Should have deleted old profile links
			expect(mocks.deleteFn).toHaveBeenCalledWith(
				schemaMocks.authorDownloadProfiles,
			);
			// Should have inserted new profile links (2 times)
			expect(mocks.insertFn).toHaveBeenCalledWith(
				schemaMocks.authorDownloadProfiles,
			);
			// Should have inserted history
			expect(mocks.insertFn).toHaveBeenCalledWith(schemaMocks.history);
			expect(result).toEqual(mocks.authorRow);
		});

		it("updates monitorNewBooks when provided", async () => {
			mocks.authorRow = { id: 1, name: "Author One" };
			setupUpdateMocks();

			await updateAuthorFn({
				data: { id: 1, monitorNewBooks: "all" },
			});

			const updateChain = mocks.updateFn.mock.results[0]?.value as UpdateChain;
			expect(updateChain.set).toHaveBeenCalledWith(
				expect.objectContaining({ monitorNewBooks: "all" }),
			);
		});

		it("persists monitorNewBooks='none' without dropping existing profile links", async () => {
			mocks.authorRow = { id: 1, name: "Author One" };
			setupUpdateMocks();

			await updateAuthorFn({
				data: { id: 1, monitorNewBooks: "none", downloadProfileIds: [11] },
			});

			const updateChain = mocks.updateFn.mock.results[0]?.value as UpdateChain;
			expect(updateChain.set).toHaveBeenCalledWith(
				expect.objectContaining({ monitorNewBooks: "none" }),
			);
			expect(mocks.deleteFn).toHaveBeenCalledWith(
				schemaMocks.authorDownloadProfiles,
			);
			expect(mocks.insertFn).toHaveBeenCalledWith(
				schemaMocks.authorDownloadProfiles,
			);
		});

		it("does not replace download profiles when not provided", async () => {
			mocks.authorRow = { id: 1, name: "Author One" };
			setupUpdateMocks();

			await updateAuthorFn({ data: { id: 1 } });

			// Should not have deleted profile links
			expect(mocks.deleteFn).not.toHaveBeenCalled();
		});
	});

	// ─── deleteAuthorFn ──────────────────────────────────────────────────

	describe("deleteAuthorFn", () => {
		function setupDeleteMocks() {
			mocks.select.mockImplementation(() =>
				createSelectChain([], mocks.authorRow),
			);
			mocks.deleteFn.mockImplementation(() => createDeleteChain());
			mocks.insertFn.mockImplementation(() => createInsertChain());
		}

		it("requires admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("not admin"));

			await expect(deleteAuthorFn({ data: { id: 1 } })).rejects.toThrow(
				"not admin",
			);
			expect(mocks.deleteFn).not.toHaveBeenCalled();
		});

		it("deletes the author and logs history when author exists", async () => {
			mocks.authorRow = { id: 1, name: "Author One" };
			setupDeleteMocks();

			const result = await deleteAuthorFn({ data: { id: 1 } });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.deleteFn).toHaveBeenCalledWith(schemaMocks.authors);
			expect(mocks.insertFn).toHaveBeenCalledWith(schemaMocks.history);
			expect(result).toEqual({ success: true });
		});

		it("deletes without logging history when author does not exist", async () => {
			mocks.authorRow = null;
			setupDeleteMocks();

			const result = await deleteAuthorFn({ data: { id: 999 } });

			expect(mocks.deleteFn).toHaveBeenCalledWith(schemaMocks.authors);
			// No history insert because author was null
			expect(mocks.insertFn).not.toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});
	});

	// ─── checkAuthorExistsFn ─────────────────────────────────────────────

	describe("checkAuthorExistsFn", () => {
		it("requires auth", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("no auth"));

			await expect(
				checkAuthorExistsFn({ data: { foreignAuthorId: "abc" } }),
			).rejects.toThrow("no auth");
			expect(mocks.select).not.toHaveBeenCalled();
		});

		it("returns author when found", async () => {
			mocks.select.mockImplementation(() =>
				createSelectChain([], { id: 42, name: "Found Author" }),
			);

			const result = await checkAuthorExistsFn({
				data: { foreignAuthorId: "fa-42" },
			});

			expect(result).toEqual({ id: 42, name: "Found Author" });
			expect(mocks.eq).toHaveBeenCalledWith(
				schemaMocks.authors.foreignAuthorId,
				"fa-42",
			);
		});

		it("returns null when author is not found", async () => {
			mocks.select.mockImplementation(() => createSelectChain([], undefined));

			const result = await checkAuthorExistsFn({
				data: { foreignAuthorId: "nonexistent" },
			});

			expect(result).toBeNull();
		});
	});

	// ─── getSeriesFromHardcoverFn ────────────────────────────────────────

	describe("getSeriesFromHardcoverFn", () => {
		it("requires auth", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("no auth"));

			await expect(
				getSeriesFromHardcoverFn({
					data: { foreignSeriesIds: [1] },
				}),
			).rejects.toThrow("no auth");
			expect(mocks.fetchSeriesComplete).not.toHaveBeenCalled();
		});

		it("returns empty array when no series ids are provided", async () => {
			const result = await getSeriesFromHardcoverFn({
				data: { foreignSeriesIds: [] },
			});

			expect(result).toEqual([]);
			expect(mocks.fetchSeriesComplete).not.toHaveBeenCalled();
		});

		it("fetches series from hardcover and maps the response", async () => {
			mocks.getProfileLanguages.mockReturnValue(["en", "fr"]);
			mocks.fetchSeriesComplete.mockResolvedValue([
				{
					id: 10,
					books: [
						{
							bookId: 100,
							bookTitle: "Series Book One",
							bookSlug: "series-book-one",
							position: "1",
							releaseDate: "2020-01-01",
							releaseYear: 2020,
							rating: 4.2,
							usersCount: 300,
							coverUrl: "https://example.com/cover.jpg",
							authorName: "Author One",
							editions: [],
						},
					],
				},
			]);

			const result = await getSeriesFromHardcoverFn({
				data: { foreignSeriesIds: [10], excludeForeignAuthorId: 5 },
			});

			expect(mocks.getProfileLanguages).toHaveBeenCalledTimes(1);
			expect(mocks.fetchSeriesComplete).toHaveBeenCalledWith(
				[10],
				["en", "fr"],
				5,
			);
			expect(result).toEqual([
				{
					foreignSeriesId: 10,
					books: [
						{
							foreignBookId: 100,
							title: "Series Book One",
							slug: "series-book-one",
							position: "1",
							releaseDate: "2020-01-01",
							releaseYear: 2020,
							rating: 4.2,
							usersCount: 300,
							coverUrl: "https://example.com/cover.jpg",
							authorName: "Author One",
							editions: [],
						},
					],
				},
			]);
		});

		it("defaults excludeForeignAuthorId to 0 when not provided", async () => {
			mocks.getProfileLanguages.mockReturnValue(["en"]);
			mocks.fetchSeriesComplete.mockResolvedValue([]);

			await getSeriesFromHardcoverFn({
				data: { foreignSeriesIds: [1] },
			});

			expect(mocks.fetchSeriesComplete).toHaveBeenCalledWith([1], ["en"], 0);
		});
	});
});
