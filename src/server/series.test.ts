import { beforeEach, describe, expect, it, vi } from "vitest";

type SelectResult = {
	all?: unknown;
	get?: unknown;
};

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	requireAdmin: vi.fn(),
	select: vi.fn(),
	selectDistinct: vi.fn(),
	updateSet: vi.fn(),
	updateWhere: vi.fn(),
	updateRun: vi.fn(),
	deleteWhere: vi.fn(),
	deleteRun: vi.fn(),
	insertValues: vi.fn(),
	insertOnConflictDoNothing: vi.fn(),
	insertRun: vi.fn(),
	fetchSeriesComplete: vi.fn(),
	ensureEditionProfileLinks: vi.fn(),
	importAuthorInternal: vi.fn(),
	getProfileLanguages: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: ({ method }: { method?: string } = {}) => {
		const builder: {
			inputValidator: (validator: unknown) => {
				handler: (fn: (opts: { data: unknown }) => unknown) => unknown;
			};
			handler: (fn: (opts: { data: unknown }) => unknown) => unknown;
		} = {
			inputValidator: (validator) => {
				const outerValidator = validator as (data: unknown) => unknown;
				return {
					handler: (fn: (opts: { data: unknown }) => unknown) =>
						Object.assign(
							async (opts: { data?: unknown } = {}) =>
								fn({ data: outerValidator(opts.data) }),
							{ method: method ?? "GET" },
						),
				};
			},
			handler: (fn) =>
				Object.assign(
					async (opts: { data?: unknown } = {}) => fn({ data: opts.data }),
					{ method: method ?? "GET" },
				),
		};
		return builder;
	},
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
	desc: vi.fn((col: unknown) => ({ col, dir: "desc" })),
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
	inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
	sql: (...args: unknown[]) => ({ args }),
}));

function createSelectChain(result: SelectResult) {
	const chain: Record<string, ReturnType<typeof vi.fn>> = {
		all: vi.fn(() => result.all ?? []),
		get: vi.fn(() => result.get),
		from: vi.fn(() => chain),
		where: vi.fn(() => chain),
		orderBy: vi.fn(() => chain),
		groupBy: vi.fn(() => chain),
		innerJoin: vi.fn(() => chain),
		filter: vi.fn(() => result.all ?? []),
	};
	return chain;
}

function createSelectDistinctChain(result: SelectResult) {
	const chain: Record<string, ReturnType<typeof vi.fn>> = {
		all: vi.fn(() => result.all ?? []),
		from: vi.fn(() => chain),
		where: vi.fn(() => chain),
	};
	return chain;
}

vi.mock("src/db", () => ({
	db: {
		select: (...args: unknown[]) => mocks.select(...args),
		selectDistinct: (...args: unknown[]) => mocks.selectDistinct(...args),
		update: vi.fn(() => ({
			set: (...args: unknown[]) => {
				mocks.updateSet(...args);
				return {
					where: (...wArgs: unknown[]) => {
						mocks.updateWhere(...wArgs);
						return { run: mocks.updateRun };
					},
				};
			},
		})),
		delete: vi.fn(() => ({
			where: (...args: unknown[]) => {
				mocks.deleteWhere(...args);
				return { run: mocks.deleteRun };
			},
		})),
		insert: vi.fn(() => ({
			values: (...args: unknown[]) => {
				mocks.insertValues(...args);
				return {
					run: mocks.insertRun,
					onConflictDoNothing: () => {
						mocks.insertOnConflictDoNothing();
						return { run: mocks.insertRun };
					},
				};
			},
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	authors: { id: "authors.id", foreignAuthorId: "authors.foreignAuthorId" },
	bookFiles: { bookId: "bookFiles.bookId" },
	bookImportListExclusions: {
		foreignBookId: "bookImportListExclusions.foreignBookId",
	},
	books: {
		id: "books.id",
		title: "books.title",
		slug: "books.slug",
		description: "books.description",
		releaseDate: "books.releaseDate",
		releaseYear: "books.releaseYear",
		foreignBookId: "books.foreignBookId",
		images: "books.images",
		rating: "books.rating",
		ratingsCount: "books.ratingsCount",
		usersCount: "books.usersCount",
		tags: "books.tags",
		metadataSourceMissingSince: "books.metadataSourceMissingSince",
	},
	booksAuthors: {
		bookId: "booksAuthors.bookId",
		authorId: "booksAuthors.authorId",
		foreignAuthorId: "booksAuthors.foreignAuthorId",
		authorName: "booksAuthors.authorName",
		isPrimary: "booksAuthors.isPrimary",
	},
	editionDownloadProfiles: {
		editionId: "editionDownloadProfiles.editionId",
		downloadProfileId: "editionDownloadProfiles.downloadProfileId",
	},
	editions: {
		id: "editions.id",
		bookId: "editions.bookId",
		title: "editions.title",
		releaseDate: "editions.releaseDate",
		format: "editions.format",
		pageCount: "editions.pageCount",
		isbn10: "editions.isbn10",
		isbn13: "editions.isbn13",
		asin: "editions.asin",
		usersCount: "editions.usersCount",
		score: "editions.score",
		languageCode: "editions.languageCode",
		language: "editions.language",
		images: "editions.images",
		isDefaultCover: "editions.isDefaultCover",
		metadataSourceMissingSince: "editions.metadataSourceMissingSince",
	},
	history: {},
	series: {
		id: "series.id",
		monitored: "series.monitored",
		foreignSeriesId: "series.foreignSeriesId",
		title: "series.title",
	},
	seriesBookLinks: {
		seriesId: "seriesBookLinks.seriesId",
		bookId: "seriesBookLinks.bookId",
	},
	seriesDownloadProfiles: {
		seriesId: "seriesDownloadProfiles.seriesId",
		downloadProfileId: "seriesDownloadProfiles.downloadProfileId",
	},
}));

vi.mock("./middleware", () => ({
	requireAuth: () => mocks.requireAuth(),
	requireAdmin: () => mocks.requireAdmin(),
}));

vi.mock("./hardcover/import-queries", () => ({
	fetchSeriesComplete: (...args: unknown[]) =>
		mocks.fetchSeriesComplete(...args),
}));

vi.mock("./import", () => ({
	ensureEditionProfileLinks: (...args: unknown[]) =>
		mocks.ensureEditionProfileLinks(...args),
	importAuthorInternal: (...args: unknown[]) =>
		mocks.importAuthorInternal(...args),
}));

vi.mock("./profile-languages", () => ({
	default: () => mocks.getProfileLanguages(),
}));

import {
	getSeriesListFn,
	refreshSeriesFn,
	refreshSeriesInternal,
	updateSeriesFn,
} from "./series";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireAuth.mockResolvedValue(undefined);
	mocks.requireAdmin.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// getSeriesListFn
// ---------------------------------------------------------------------------

describe("getSeriesListFn", () => {
	it("requires auth", async () => {
		mocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));

		await expect(getSeriesListFn()).rejects.toThrow("Unauthorized");
		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
	});

	it("returns empty when no monitored series exist", async () => {
		// selectDistinct returns empty (no series with monitored books)
		mocks.selectDistinct.mockReturnValueOnce(
			createSelectDistinctChain({ all: [] }),
		);

		const result = await getSeriesListFn();

		expect(result).toEqual({
			series: [],
			books: [],
			availableLanguages: [],
		});
	});

	it("returns enriched series with books, editions, and languages", async () => {
		// 1. selectDistinct — series with monitored books
		mocks.selectDistinct.mockReturnValueOnce(
			createSelectDistinctChain({ all: [{ seriesId: 1 }] }),
		);

		// 2. select series records
		const seriesChain = createSelectChain({
			all: [
				{
					id: 1,
					title: "Discworld",
					slug: "discworld",
					foreignSeriesId: "100",
					monitored: true,
				},
			],
		});
		// 3. select seriesBookLinks
		const linksChain = createSelectChain({
			all: [{ seriesId: 1, bookId: 10, position: "1" }],
		});
		// 4. select seriesDownloadProfiles
		const profileLinksChain = createSelectChain({
			all: [{ seriesId: 1, downloadProfileId: 5 }],
		});
		// 5. select books
		const booksChain = createSelectChain({
			all: [
				{
					id: 10,
					title: "The Colour of Magic",
					slug: "colour-of-magic",
					description: null,
					releaseDate: null,
					releaseYear: 1983,
					foreignBookId: "200",
					images: null,
					rating: 4.0,
					ratingsCount: 500,
					usersCount: 1000,
					tags: null,
					metadataSourceMissingSince: null,
				},
			],
		});
		// 6. select booksAuthors
		const authorsChain = createSelectChain({
			all: [
				{
					bookId: 10,
					authorId: 1,
					foreignAuthorId: "300",
					authorName: "Terry Pratchett",
					isPrimary: true,
				},
			],
		});
		// 7. select editions
		const editionsChain = createSelectChain({
			all: [
				{
					id: 50,
					bookId: 10,
					title: "The Colour of Magic",
					releaseDate: null,
					format: "paperback",
					pageCount: 288,
					isbn10: null,
					isbn13: "9780060855925",
					asin: null,
					usersCount: 800,
					score: null,
					languageCode: "en",
					images: null,
					isDefaultCover: false,
					metadataSourceMissingSince: null,
				},
			],
		});
		// 8. select editionDownloadProfiles
		const edProfilesChain = createSelectChain({
			all: [{ editionId: 50, downloadProfileId: 5 }],
		});
		// 9. select bookFiles (file counts)
		const fileCountsChain = createSelectChain({
			all: [{ bookId: 10, count: 2 }],
		});
		// 10. select available languages
		const languagesChain = createSelectChain({
			all: [{ languageCode: "en", language: "English", totalReaders: 1000 }],
		});
		// filter() stub on the languages chain
		languagesChain.filter = vi.fn(() => [
			{ languageCode: "en", language: "English", totalReaders: 1000 },
		]);

		mocks.select
			.mockReturnValueOnce(seriesChain)
			.mockReturnValueOnce(linksChain)
			.mockReturnValueOnce(profileLinksChain)
			.mockReturnValueOnce(booksChain)
			.mockReturnValueOnce(authorsChain)
			.mockReturnValueOnce(editionsChain)
			.mockReturnValueOnce(edProfilesChain)
			.mockReturnValueOnce(fileCountsChain)
			.mockReturnValueOnce(languagesChain);

		const result = await getSeriesListFn();

		expect(result.series).toHaveLength(1);
		expect(result.series[0]).toMatchObject({
			id: 1,
			title: "Discworld",
			bookCount: 1,
			downloadProfileIds: [5],
		});
		expect(result.series[0].books).toEqual([{ bookId: 10, position: "1" }]);

		expect(result.books).toHaveLength(1);
		expect(result.books[0]).toMatchObject({
			id: 10,
			title: "The Colour of Magic",
			authorName: "Terry Pratchett",
			authorForeignId: "300",
			downloadProfileIds: [5],
			fileCount: 2,
			missingEditionsCount: 0,
		});
		expect(result.books[0].editions).toHaveLength(1);
		expect(result.books[0].editions[0]).toMatchObject({
			id: 50,
			downloadProfileIds: [5],
		});

		expect(result.availableLanguages).toEqual([
			{ languageCode: "en", language: "English", totalReaders: 1000 },
		]);
	});

	it("handles empty book IDs with no editions or files", async () => {
		mocks.selectDistinct.mockReturnValueOnce(
			createSelectDistinctChain({ all: [{ seriesId: 1 }] }),
		);

		// series records
		mocks.select.mockReturnValueOnce(
			createSelectChain({
				all: [{ id: 1, title: "Empty Series", monitored: true }],
			}),
		);
		// seriesBookLinks — no books
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// seriesDownloadProfiles
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// allBookIds is empty, so books, booksAuthors, editions skip queries
		// but the function still calls select for empty book queries
		// With no book IDs, the code skips those selects

		const result = await getSeriesListFn();

		expect(result.series).toHaveLength(1);
		expect(result.series[0].bookCount).toBe(0);
		expect(result.books).toHaveLength(0);
		expect(result.availableLanguages).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// updateSeriesFn
// ---------------------------------------------------------------------------

describe("updateSeriesFn", () => {
	it("requires admin auth", async () => {
		mocks.requireAdmin.mockRejectedValueOnce(new Error("Forbidden"));

		await expect(updateSeriesFn({ data: { id: 1 } })).rejects.toThrow(
			"Forbidden",
		);
	});

	it("updates series fields and replaces download profile links", async () => {
		await updateSeriesFn({
			data: { id: 1, monitored: true, downloadProfileIds: [5, 6] },
		});

		expect(mocks.updateSet).toHaveBeenCalledTimes(1);
		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({ monitored: true }),
		);
		expect(mocks.updateWhere).toHaveBeenCalledTimes(1);
		expect(mocks.updateRun).toHaveBeenCalledTimes(1);

		// delete old profile links
		expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);
		expect(mocks.deleteRun).toHaveBeenCalledTimes(1);

		// insert new profile links (one per downloadProfileId)
		expect(mocks.insertValues).toHaveBeenCalledTimes(2);
		expect(mocks.insertValues).toHaveBeenCalledWith({
			seriesId: 1,
			downloadProfileId: 5,
		});
		expect(mocks.insertValues).toHaveBeenCalledWith({
			seriesId: 1,
			downloadProfileId: 6,
		});
		expect(mocks.insertRun).toHaveBeenCalledTimes(2);
	});

	it("updates series without touching download profiles when not provided", async () => {
		await updateSeriesFn({
			data: { id: 2, monitored: false },
		});

		expect(mocks.updateSet).toHaveBeenCalledTimes(1);
		expect(mocks.updateRun).toHaveBeenCalledTimes(1);
		// No delete/insert for profiles
		expect(mocks.deleteWhere).not.toHaveBeenCalled();
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("clears download profiles when given an empty array", async () => {
		await updateSeriesFn({
			data: { id: 3, downloadProfileIds: [] },
		});

		expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);
		expect(mocks.deleteRun).toHaveBeenCalledTimes(1);
		// No inserts since the array is empty
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// refreshSeriesInternal
// ---------------------------------------------------------------------------

describe("refreshSeriesInternal", () => {
	function setupSelectSequence(
		results: Array<{ all?: unknown; get?: unknown }>,
	) {
		for (const result of results) {
			mocks.select.mockReturnValueOnce(createSelectChain(result));
		}
	}

	it("returns zero stats when no monitored series exist", async () => {
		// series query returns empty
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		const result = await refreshSeriesInternal();

		expect(result).toEqual({
			seriesRefreshed: 0,
			booksAdded: 0,
			authorsImported: 0,
			errors: [],
		});
	});

	it("returns zero stats when no series have foreignSeriesId", async () => {
		// series query returns series without foreignSeriesId
		mocks.select.mockReturnValueOnce(
			createSelectChain({
				all: [
					{
						id: 1,
						foreignSeriesId: null,
						monitored: true,
						title: "No Foreign",
					},
				],
			}),
		);
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		// exclusions query still runs before the foreignSeriesId filter
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		const result = await refreshSeriesInternal();

		expect(result).toEqual({
			seriesRefreshed: 0,
			booksAdded: 0,
			authorsImported: 0,
			errors: [],
		});
	});

	it("returns error when fetchSeriesComplete fails", async () => {
		mocks.select.mockReturnValueOnce(
			createSelectChain({
				all: [
					{ id: 1, foreignSeriesId: "100", monitored: true, title: "Series A" },
				],
			}),
		);
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		// exclusions
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		mocks.fetchSeriesComplete.mockRejectedValueOnce(new Error("API down"));

		const result = await refreshSeriesInternal();

		expect(result.errors).toEqual([
			"Failed to fetch series from Hardcover: API down",
		]);
		expect(result.seriesRefreshed).toBe(0);
	});

	it("refreshes series metadata and skips already-linked books", async () => {
		const localSeries = {
			id: 1,
			foreignSeriesId: "100",
			monitored: true,
			title: "Discworld",
		};

		// 1. select monitored series
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [localSeries] }));
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		// 2. select exclusions
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		// fetchSeriesComplete returns one book that already exists and is linked
		mocks.fetchSeriesComplete.mockResolvedValueOnce([
			{
				id: 100,
				title: "Discworld",
				slug: "discworld",
				isCompleted: false,
				books: [
					{
						bookId: 200,
						bookTitle: "The Colour of Magic",
						position: "1",
						authorId: 300,
						authorName: "Pratchett",
					},
				],
			},
		]);

		// 3. select all local books (foreignToLocalBook map)
		mocks.select.mockReturnValueOnce(
			createSelectChain({ all: [{ id: 10, foreignBookId: "200" }] }),
		);
		// 4. select series download profiles
		mocks.select.mockReturnValueOnce(
			createSelectChain({ all: [{ downloadProfileId: 5 }] }),
		);
		// 5. select existing book links
		mocks.select.mockReturnValueOnce(
			createSelectChain({ all: [{ bookId: 10 }] }),
		);

		const result = await refreshSeriesInternal();

		expect(result.seriesRefreshed).toBe(1);
		expect(result.booksAdded).toBe(0);
		expect(result.errors).toEqual([]);
		// Series metadata update
		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Discworld",
				slug: "discworld",
				isCompleted: false,
			}),
		);
	});

	it("links existing local book that is not yet linked to the series", async () => {
		const localSeries = {
			id: 1,
			foreignSeriesId: "100",
			monitored: true,
			title: "Discworld",
		};

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [localSeries] }));
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		mocks.fetchSeriesComplete.mockResolvedValueOnce([
			{
				id: 100,
				title: "Discworld",
				slug: "discworld",
				isCompleted: false,
				books: [
					{
						bookId: 200,
						bookTitle: "The Colour of Magic",
						position: "1",
						authorId: 300,
						authorName: "Pratchett",
					},
				],
			},
		]);

		// all local books — book exists locally
		mocks.select.mockReturnValueOnce(
			createSelectChain({ all: [{ id: 10, foreignBookId: "200" }] }),
		);
		// series download profiles
		mocks.select.mockReturnValueOnce(
			createSelectChain({ all: [{ downloadProfileId: 5 }] }),
		);
		// existing book links — book NOT linked yet
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		const result = await refreshSeriesInternal();

		expect(result.seriesRefreshed).toBe(1);
		expect(result.booksAdded).toBe(0); // existing book, not "added"
		expect(mocks.insertValues).toHaveBeenCalledWith({
			seriesId: 1,
			bookId: 10,
			position: "1",
		});
		expect(mocks.ensureEditionProfileLinks).toHaveBeenCalledWith(10, [5]);
	});

	it("skips excluded books", async () => {
		const localSeries = {
			id: 1,
			foreignSeriesId: "100",
			monitored: true,
			title: "Discworld",
		};

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [localSeries] }));
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		// exclusions include book 200
		mocks.select.mockReturnValueOnce(
			createSelectChain({ all: [{ foreignBookId: "200" }] }),
		);

		mocks.fetchSeriesComplete.mockResolvedValueOnce([
			{
				id: 100,
				title: "Discworld",
				slug: "discworld",
				isCompleted: false,
				books: [
					{
						bookId: 200,
						bookTitle: "Excluded Book",
						position: "1",
						authorId: 300,
						authorName: "Author",
					},
				],
			},
		]);

		// all local books
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// series download profiles
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// existing book links
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		const result = await refreshSeriesInternal();

		expect(result.seriesRefreshed).toBe(1);
		expect(result.booksAdded).toBe(0);
		// No insert for excluded book
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("imports a new author and adds the book when it appears after import", async () => {
		const localSeries = {
			id: 1,
			foreignSeriesId: "100",
			monitored: true,
			title: "Discworld",
		};

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [localSeries] }));
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		// exclusions
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		mocks.fetchSeriesComplete.mockResolvedValueOnce([
			{
				id: 100,
				title: "Discworld",
				slug: "discworld",
				isCompleted: false,
				books: [
					{
						bookId: 200,
						bookTitle: "New Book",
						position: "1",
						authorId: 300,
						authorName: "New Author",
					},
				],
			},
		]);

		// all local books — book does NOT exist
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// series download profiles
		mocks.select.mockReturnValueOnce(
			createSelectChain({ all: [{ downloadProfileId: 5 }] }),
		);
		// existing book links
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// check if author exists locally — NOT found
		mocks.select.mockReturnValueOnce(createSelectChain({ get: undefined }));

		mocks.importAuthorInternal.mockResolvedValueOnce(undefined);

		// After import, query for the new book — found
		mocks.select.mockReturnValueOnce(createSelectChain({ get: { id: 10 } }));

		const result = await refreshSeriesInternal();

		expect(result.seriesRefreshed).toBe(1);
		expect(result.booksAdded).toBe(1);
		expect(result.authorsImported).toBe(1);
		expect(result.errors).toEqual([]);

		expect(mocks.importAuthorInternal).toHaveBeenCalledWith({
			foreignAuthorId: 300,
			downloadProfileIds: [],
			monitorOption: "none",
			monitorNewBooks: "none",
		});
		expect(mocks.insertValues).toHaveBeenCalledWith({
			seriesId: 1,
			bookId: 10,
			position: "1",
		});
		expect(mocks.ensureEditionProfileLinks).toHaveBeenCalledWith(10, [5]);
	});

	it("skips book when author already exists locally", async () => {
		const localSeries = {
			id: 1,
			foreignSeriesId: "100",
			monitored: true,
			title: "Discworld",
		};

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [localSeries] }));
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		mocks.fetchSeriesComplete.mockResolvedValueOnce([
			{
				id: 100,
				title: "Discworld",
				slug: "discworld",
				isCompleted: false,
				books: [
					{
						bookId: 200,
						bookTitle: "Existing Author Book",
						position: "2",
						authorId: 300,
						authorName: "Known Author",
					},
				],
			},
		]);

		// all local books — book doesn't exist
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// series download profiles
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// existing book links
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// author exists locally
		mocks.select.mockReturnValueOnce(createSelectChain({ get: { id: 99 } }));
		// After (no import needed), query for the book — found
		mocks.select.mockReturnValueOnce(createSelectChain({ get: { id: 20 } }));

		const result = await refreshSeriesInternal();

		expect(result.seriesRefreshed).toBe(1);
		expect(result.booksAdded).toBe(1);
		expect(result.authorsImported).toBe(0);
		expect(mocks.importAuthorInternal).not.toHaveBeenCalled();
	});

	it("records error when book has no authorId", async () => {
		const localSeries = {
			id: 1,
			foreignSeriesId: "100",
			monitored: true,
			title: "Discworld",
		};

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [localSeries] }));
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		mocks.fetchSeriesComplete.mockResolvedValueOnce([
			{
				id: 100,
				title: "Discworld",
				slug: "discworld",
				isCompleted: false,
				books: [
					{
						bookId: 200,
						bookTitle: "Orphan Book",
						position: "1",
						authorId: null,
						authorName: null,
					},
				],
			},
		]);

		// all local books
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// series download profiles
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// existing book links
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		const result = await refreshSeriesInternal();

		expect(result.seriesRefreshed).toBe(1);
		expect(result.booksAdded).toBe(0);
		expect(result.errors).toEqual([
			'Book "Orphan Book" (HC #200) has no author — skipped',
		]);
	});

	it("records error when book is not found after author import", async () => {
		const localSeries = {
			id: 1,
			foreignSeriesId: "100",
			monitored: true,
			title: "Discworld",
		};

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [localSeries] }));
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		mocks.fetchSeriesComplete.mockResolvedValueOnce([
			{
				id: 100,
				title: "Discworld",
				slug: "discworld",
				isCompleted: false,
				books: [
					{
						bookId: 200,
						bookTitle: "Ghost Book",
						position: "1",
						authorId: 300,
						authorName: "Ghost Author",
					},
				],
			},
		]);

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// author not found locally
		mocks.select.mockReturnValueOnce(createSelectChain({ get: undefined }));
		mocks.importAuthorInternal.mockResolvedValueOnce(undefined);
		// book still not found after import
		mocks.select.mockReturnValueOnce(createSelectChain({ get: undefined }));

		const result = await refreshSeriesInternal();

		expect(result.errors).toEqual([
			'Book "Ghost Book" (HC #200) not found after author import — skipped',
		]);
		expect(result.booksAdded).toBe(0);
	});

	it("continues when author import fails with 'already on your bookshelf'", async () => {
		const localSeries = {
			id: 1,
			foreignSeriesId: "100",
			monitored: true,
			title: "Discworld",
		};

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [localSeries] }));
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		mocks.fetchSeriesComplete.mockResolvedValueOnce([
			{
				id: 100,
				title: "Discworld",
				slug: "discworld",
				isCompleted: false,
				books: [
					{
						bookId: 200,
						bookTitle: "Duplicate Author Book",
						position: "1",
						authorId: 300,
						authorName: "Dup Author",
					},
				],
			},
		]);

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// author not found locally
		mocks.select.mockReturnValueOnce(createSelectChain({ get: undefined }));
		// author import throws "already on your bookshelf"
		mocks.importAuthorInternal.mockRejectedValueOnce(
			new Error("already on your bookshelf"),
		);
		// book found after import
		mocks.select.mockReturnValueOnce(createSelectChain({ get: { id: 10 } }));

		const result = await refreshSeriesInternal();

		expect(result.booksAdded).toBe(1);
		expect(result.authorsImported).toBe(0);
		expect(result.errors).toEqual([]);
	});

	it("records error and skips book when author import fails with other error", async () => {
		const localSeries = {
			id: 1,
			foreignSeriesId: "100",
			monitored: true,
			title: "Discworld",
		};

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [localSeries] }));
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		mocks.fetchSeriesComplete.mockResolvedValueOnce([
			{
				id: 100,
				title: "Discworld",
				slug: "discworld",
				isCompleted: false,
				books: [
					{
						bookId: 200,
						bookTitle: "Fail Book",
						position: "1",
						authorId: 300,
						authorName: "Fail Author",
					},
				],
			},
		]);

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		mocks.select.mockReturnValueOnce(createSelectChain({ get: undefined }));
		mocks.importAuthorInternal.mockRejectedValueOnce(
			new Error("Network timeout"),
		);

		const result = await refreshSeriesInternal();

		expect(result.booksAdded).toBe(0);
		expect(result.errors).toEqual([
			'Failed to import author "Fail Author" for book "Fail Book": Network timeout',
		]);
	});

	it("refreshes a specific series by id", async () => {
		const localSeries = {
			id: 5,
			foreignSeriesId: "500",
			monitored: true,
			title: "Specific Series",
		};

		// When seriesId is passed, it queries with eq(series.id, seriesId)
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [localSeries] }));
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		mocks.fetchSeriesComplete.mockResolvedValueOnce([
			{
				id: 500,
				title: "Specific Series",
				slug: "specific-series",
				isCompleted: true,
				books: [],
			},
		]);

		// all local books
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// series download profiles
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// existing book links
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		const result = await refreshSeriesInternal(5);

		expect(result.seriesRefreshed).toBe(1);
		expect(result.booksAdded).toBe(0);
		expect(result.errors).toEqual([]);
		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Specific Series",
				isCompleted: true,
			}),
		);
	});

	it("catches and records error when an individual series throws", async () => {
		const localSeries = {
			id: 1,
			foreignSeriesId: "100",
			monitored: true,
			title: "Bad Series",
		};

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [localSeries] }));
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		mocks.fetchSeriesComplete.mockResolvedValueOnce([
			{
				id: 100,
				title: "Bad Series",
				slug: "bad-series",
				isCompleted: false,
				books: [],
			},
		]);

		// all local books
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// Make the update throw to trigger the per-series catch
		mocks.updateSet.mockImplementationOnce(() => {
			throw new Error("DB write failed");
		});

		const result = await refreshSeriesInternal();

		expect(result.seriesRefreshed).toBe(0);
		expect(result.errors).toEqual([
			'Error refreshing series "Bad Series": DB write failed',
		]);
	});

	it("does not monitor editions when series has no download profiles", async () => {
		const localSeries = {
			id: 1,
			foreignSeriesId: "100",
			monitored: true,
			title: "Discworld",
		};

		mocks.select.mockReturnValueOnce(createSelectChain({ all: [localSeries] }));
		mocks.getProfileLanguages.mockReturnValue(["en"]);
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		mocks.fetchSeriesComplete.mockResolvedValueOnce([
			{
				id: 100,
				title: "Discworld",
				slug: "discworld",
				isCompleted: false,
				books: [
					{
						bookId: 200,
						bookTitle: "New Book",
						position: "1",
						authorId: 300,
						authorName: "Author",
					},
				],
			},
		]);

		// all local books — doesn't exist
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// series has NO download profiles
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// existing book links
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));
		// author exists
		mocks.select.mockReturnValueOnce(createSelectChain({ get: { id: 99 } }));
		// book found after (no import)
		mocks.select.mockReturnValueOnce(createSelectChain({ get: { id: 10 } }));

		const result = await refreshSeriesInternal();

		expect(result.booksAdded).toBe(1);
		expect(mocks.ensureEditionProfileLinks).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// refreshSeriesFn
// ---------------------------------------------------------------------------

describe("refreshSeriesFn", () => {
	it("requires admin auth", async () => {
		mocks.requireAdmin.mockRejectedValueOnce(new Error("Forbidden"));

		await expect(refreshSeriesFn({ data: {} })).rejects.toThrow("Forbidden");
	});

	it("calls refreshSeriesInternal with seriesId from input", async () => {
		// Set up minimal mocks for refreshSeriesInternal to return quickly
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		const result = await refreshSeriesFn({ data: { seriesId: 42 } });

		expect(result).toEqual({
			seriesRefreshed: 0,
			booksAdded: 0,
			authorsImported: 0,
			errors: [],
		});
	});

	it("calls refreshSeriesInternal without seriesId when omitted", async () => {
		mocks.select.mockReturnValueOnce(createSelectChain({ all: [] }));

		const result = await refreshSeriesFn({ data: {} });

		expect(result).toEqual({
			seriesRefreshed: 0,
			booksAdded: 0,
			authorsImported: 0,
			errors: [],
		});
	});
});
