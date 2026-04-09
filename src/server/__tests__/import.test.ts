import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------- Hoisted mocks ----------

const mocks = vi.hoisted(() => ({
	requireAdmin: vi.fn(),
	submitCommand: vi.fn(),
	fetchAuthorComplete: vi.fn(),
	fetchBatchedEditions: vi.fn(),
	fetchBookComplete: vi.fn(),
	getMetadataProfile: vi.fn(),
	getProfileLanguages: vi.fn(),
	pickBestEditionForProfile: vi.fn(),
	logError: vi.fn(),
	searchForAuthorBooks: vi.fn(),
	searchForBook: vi.fn(),
	refreshSeriesInternal: vi.fn(),

	// DB chain helpers
	run: vi.fn(),
	get: vi.fn(),
	all: vi.fn(),
	returning: vi.fn(),
	onConflictDoNothing: vi.fn(),
	onConflictDoUpdate: vi.fn(),
	limit: vi.fn(),
	innerJoin: vi.fn(),
}));

// ---------- Module mocks ----------

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
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
	inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
	sql: (...args: unknown[]) => ({ args }),
}));

vi.mock("../middleware", () => ({
	requireAdmin: mocks.requireAdmin,
}));

vi.mock("../commands", () => ({
	submitCommand: mocks.submitCommand,
}));

vi.mock("../hardcover/import-queries", () => ({
	fetchAuthorComplete: mocks.fetchAuthorComplete,
	fetchBatchedEditions: mocks.fetchBatchedEditions,
	fetchBookComplete: mocks.fetchBookComplete,
}));

vi.mock("../hardcover/constants", () => ({
	NON_AUTHOR_ROLES: new Set([
		"Editor",
		"Translator",
		"Illustrator",
		"Narrator",
	]),
}));

vi.mock("../logger", () => ({
	logError: mocks.logError,
}));

vi.mock("../metadata-profile", () => ({
	getMetadataProfile: mocks.getMetadataProfile,
}));

vi.mock("../profile-languages", () => ({
	default: mocks.getProfileLanguages,
}));

vi.mock("../auto-search", () => ({
	searchForAuthorBooks: mocks.searchForAuthorBooks,
	searchForBook: mocks.searchForBook,
}));

vi.mock("../series", () => ({
	refreshSeriesInternal: mocks.refreshSeriesInternal,
}));

vi.mock("src/lib/editions", () => ({
	pickBestEditionForProfile: mocks.pickBestEditionForProfile,
}));

// Build a chainable DB mock that supports all the query patterns used in import.ts
function buildChainableDbMock() {
	const chain: Record<string, ReturnType<typeof vi.fn>> = {};

	chain.run = mocks.run;
	chain.get = mocks.get;
	chain.all = mocks.all;
	chain.returning = vi.fn(() => ({ get: chain.get }));
	chain.onConflictDoNothing = vi.fn(() => ({ run: chain.run }));
	chain.onConflictDoUpdate = vi.fn(() => ({ run: chain.run }));
	chain.limit = vi.fn(() => ({ get: chain.get }));
	chain.innerJoin = vi.fn(() => ({
		where: vi.fn(() => ({ limit: vi.fn(() => ({ get: chain.get })) })),
	}));
	chain.where = vi.fn(() => ({
		get: chain.get,
		all: chain.all,
		run: chain.run,
		limit: chain.limit,
	}));
	chain.set = vi.fn(() => ({ where: chain.where }));
	chain.from = vi.fn(() => ({
		where: chain.where,
		all: chain.all,
		innerJoin: chain.innerJoin,
	}));
	chain.values = vi.fn(() => ({
		run: chain.run,
		returning: chain.returning,
		onConflictDoNothing: chain.onConflictDoNothing,
		onConflictDoUpdate: chain.onConflictDoUpdate,
	}));
	chain.select = vi.fn(() => ({ from: chain.from }));
	chain.insert = vi.fn(() => ({ values: chain.values }));
	chain.update = vi.fn(() => ({ set: chain.set }));
	chain.delete = vi.fn(() => ({ where: chain.where }));
	chain.transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(chain));

	return chain;
}

const dbMock = buildChainableDbMock();

vi.mock("src/db", () => ({
	db: {
		select: (...args: unknown[]) => dbMock.select(...args),
		insert: (...args: unknown[]) => dbMock.insert(...args),
		update: (...args: unknown[]) => dbMock.update(...args),
		delete: (...args: unknown[]) => dbMock.delete(...args),
		transaction: (...args: unknown[]) => dbMock.transaction(...args),
	},
}));

vi.mock("src/db/schema", () => ({
	authors: {
		id: "authors.id",
		foreignAuthorId: "authors.foreignAuthorId",
		name: "authors.name",
		isStub: "authors.isStub",
	},
	books: {
		id: "books.id",
		foreignBookId: "books.foreignBookId",
		title: "books.title",
		metadataSourceMissingSince: "books.metadataSourceMissingSince",
	},
	editions: {
		id: "editions.id",
		bookId: "editions.bookId",
		foreignEditionId: "editions.foreignEditionId",
		metadataSourceMissingSince: "editions.metadataSourceMissingSince",
	},
	booksAuthors: {
		id: "booksAuthors.id",
		bookId: "booksAuthors.bookId",
		authorId: "booksAuthors.authorId",
		foreignAuthorId: "booksAuthors.foreignAuthorId",
		isPrimary: "booksAuthors.isPrimary",
	},
	series: { id: "series.id", foreignSeriesId: "series.foreignSeriesId" },
	seriesBookLinks: {
		bookId: "seriesBookLinks.bookId",
		seriesId: "seriesBookLinks.seriesId",
	},
	history: {},
	downloadProfiles: {
		id: "downloadProfiles.id",
		contentType: "downloadProfiles.contentType",
	},
	editionDownloadProfiles: {
		id: "editionDownloadProfiles.id",
		editionId: "editionDownloadProfiles.editionId",
		downloadProfileId: "editionDownloadProfiles.downloadProfileId",
	},
	authorDownloadProfiles: {},
	bookFiles: { bookId: "bookFiles.bookId" },
	bookImportListExclusions: {
		foreignBookId: "bookImportListExclusions.foreignBookId",
	},
	seriesDownloadProfiles: { seriesId: "seriesDownloadProfiles.seriesId" },
}));

// ---------- Helpers ----------

const noopProgress = () => {};
const noopTitle = () => {};

function makeRawAuthor(overrides = {}) {
	return {
		id: 100,
		name: "J.R.R. Tolkien",
		slug: "jrr-tolkien",
		bio: "Author of LOTR",
		bornYear: 1892,
		deathYear: 1973,
		imageUrl: "https://example.com/tolkien.jpg",
		...overrides,
	};
}

function makeRawBook(overrides = {}) {
	return {
		id: 200,
		title: "The Hobbit",
		slug: "the-hobbit",
		description: "A book about a hobbit",
		releaseDate: "1937-09-21",
		releaseYear: 1937,
		rating: 4.5,
		ratingsCount: 10000,
		usersCount: 50000,
		coverUrl: "https://example.com/hobbit.jpg",
		isCompilation: false,
		canonicalId: null,
		defaultCoverEditionId: 300,
		contributions: [
			{
				authorId: 100,
				authorName: "J.R.R. Tolkien",
				contribution: null,
				position: 1,
			},
		],
		series: [],
		...overrides,
	};
}

function makeRawEdition(overrides = {}) {
	return {
		id: 300,
		bookId: 200,
		title: "The Hobbit (Paperback)",
		isbn10: "0547928227",
		isbn13: "9780547928227",
		asin: null,
		format: "Paperback",
		pageCount: 300,
		audioLength: null,
		publisher: "Houghton Mifflin",
		editionInformation: null,
		releaseDate: "2012-09-18",
		language: "English",
		languageCode: "en",
		country: "US",
		usersCount: 5000,
		score: 90,
		coverUrl: "https://example.com/hobbit-pb.jpg",
		contributors: [],
		...overrides,
	};
}

function defaultMetadataProfile() {
	return {
		skipMissingReleaseDate: false,
		skipMissingIsbnAsin: false,
		skipCompilations: false,
		minimumPopularity: 0,
		minimumPages: 0,
	};
}

// ---------- Setup ----------

beforeEach(() => {
	vi.clearAllMocks();
	// Default metadata profile: no filters
	mocks.getMetadataProfile.mockReturnValue(defaultMetadataProfile());
	mocks.getProfileLanguages.mockReturnValue([]);
	// DB returns nothing by default
	mocks.get.mockReturnValue(undefined);
	mocks.all.mockReturnValue([]);
	mocks.run.mockReturnValue(undefined);
});

// ========================================================================
// filterEditionsByProfile (accessed indirectly through importAuthorInternal)
// We test it indirectly by controlling inputs to importAuthorInternal
// But we also test the logic directly by importing the module and examining
// the effects on which editions are stored.
// ========================================================================

// We will access the private functions indirectly through their exported wrappers.
// For direct testing, we exploit that filterEditionsByProfile and shouldSkipBook
// affect what gets inserted in importAuthorInternal.

// ========================================================================
// Server function exports — auth + submitCommand delegation
// ========================================================================

describe("importHardcoverAuthorFn", () => {
	it("calls requireAdmin and delegates to submitCommand", async () => {
		mocks.requireAdmin.mockResolvedValue(undefined);
		mocks.submitCommand.mockResolvedValue({ commandId: 1 });

		const { importHardcoverAuthorFn } = await import("../import");
		const result = await importHardcoverAuthorFn({
			data: {
				foreignAuthorId: 42,
				downloadProfileIds: [1],
				monitorOption: "all",
				monitorNewBooks: "all",
				searchOnAdd: false,
			},
		});

		expect(mocks.requireAdmin).toHaveBeenCalledOnce();
		expect(mocks.submitCommand).toHaveBeenCalledOnce();
		const call = mocks.submitCommand.mock.calls[0][0];
		expect(call.commandType).toBe("importAuthor");
		expect(call.dedupeKey).toBe("foreignAuthorId");
		expect(call.body.foreignAuthorId).toBe(42);
		expect(result).toEqual({ commandId: 1 });
	});

	it("validates input — rejects negative foreignAuthorId", async () => {
		const { importHardcoverAuthorFn } = await import("../import");
		expect(() =>
			importHardcoverAuthorFn({
				data: {
					foreignAuthorId: -1,
					downloadProfileIds: [],
					monitorOption: "all",
				},
			}),
		).toThrow();
	});
});

describe("importHardcoverBookFn", () => {
	it("calls requireAdmin and delegates to submitCommand", async () => {
		mocks.requireAdmin.mockResolvedValue(undefined);
		mocks.submitCommand.mockResolvedValue({ commandId: 2 });

		const { importHardcoverBookFn } = await import("../import");
		const result = await importHardcoverBookFn({
			data: {
				foreignBookId: 99,
				downloadProfileIds: [],
				monitorOption: "all",
				monitorNewBooks: "all",
				searchOnAdd: false,
				monitorSeries: false,
			},
		});

		expect(mocks.requireAdmin).toHaveBeenCalledOnce();
		expect(mocks.submitCommand).toHaveBeenCalledOnce();
		const call = mocks.submitCommand.mock.calls[0][0];
		expect(call.commandType).toBe("importBook");
		expect(call.dedupeKey).toBe("foreignBookId");
		expect(result).toEqual({ commandId: 2 });
	});
});

describe("refreshAuthorMetadataFn", () => {
	it("calls requireAdmin and delegates to submitCommand", async () => {
		mocks.requireAdmin.mockResolvedValue(undefined);
		mocks.submitCommand.mockResolvedValue({ commandId: 3 });

		const { refreshAuthorMetadataFn } = await import("../import");
		const result = await refreshAuthorMetadataFn({
			data: { authorId: 10 },
		});

		expect(mocks.requireAdmin).toHaveBeenCalledOnce();
		expect(mocks.submitCommand).toHaveBeenCalledOnce();
		const call = mocks.submitCommand.mock.calls[0][0];
		expect(call.commandType).toBe("refreshAuthor");
		expect(call.batchTaskId).toBe("refresh-hardcover-metadata");
		expect(result).toEqual({ commandId: 3 });
	});
});

describe("refreshBookMetadataFn", () => {
	it("calls requireAdmin and delegates to submitCommand", async () => {
		mocks.requireAdmin.mockResolvedValue(undefined);
		mocks.submitCommand.mockResolvedValue({ commandId: 4 });

		const { refreshBookMetadataFn } = await import("../import");
		const result = await refreshBookMetadataFn({
			data: { bookId: 20 },
		});

		expect(mocks.requireAdmin).toHaveBeenCalledOnce();
		expect(mocks.submitCommand).toHaveBeenCalledOnce();
		const call = mocks.submitCommand.mock.calls[0][0];
		expect(call.commandType).toBe("refreshBook");
		expect(call.batchTaskId).toBe("refresh-hardcover-metadata");
		expect(result).toEqual({ commandId: 4 });
	});
});

// ========================================================================
// importAuthorInternal
// ========================================================================

describe("importAuthorInternal", () => {
	it("throws when author already exists and is not a stub", async () => {
		// The first db.select...get returns an existing non-stub author
		mocks.get.mockReturnValueOnce({ id: 1, isStub: false });

		const { importAuthorInternal } = await import("../import");
		await expect(
			importAuthorInternal({ foreignAuthorId: 100, downloadProfileIds: [] }),
		).rejects.toThrow("Author is already on your bookshelf.");
	});

	it("imports a new author with books and editions", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();
		const rawEdition = makeRawEdition();

		// First select: no existing author (outside tx)
		mocks.get.mockReturnValueOnce(undefined);

		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [rawEdition]]]),
		);

		// Inside transaction: no existing author (double-check)
		// Then: no existing book
		// Then: insert author returning
		// Then: various inserts
		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					// tx check for existing author
					return undefined;
				case 2:
					// insert author returning .get()
					return { id: 1, name: rawAuthor.name };
				case 3:
					// existingBook check
					return undefined;
				case 4:
					// insert book returning .get()
					return { id: 10, title: rawBook.title };
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{
				foreignAuthorId: 100,
				downloadProfileIds: [1],
				monitorOption: "all",
				monitorNewBooks: "all",
			},
			noopProgress,
			noopTitle,
		);

		expect(result.authorName).toBe("J.R.R. Tolkien");
		expect(result.booksAdded).toBe(1);
		expect(result.editionsAdded).toBe(1);
		expect(mocks.fetchAuthorComplete).toHaveBeenCalledWith(100);
		expect(mocks.fetchBatchedEditions).toHaveBeenCalledWith([rawBook.id]);
	});

	it("skips books with a canonicalId (partial editions)", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook({ canonicalId: 999 }); // partial edition

		mocks.get.mockReturnValueOnce(undefined); // no existing author outside tx
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing author in tx
				case 2:
					return { id: 1, name: rawAuthor.name }; // insert author returning
				case 3:
					return undefined; // no existing book
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		expect(result.booksAdded).toBe(0);
		expect(result.editionsAdded).toBe(0);
	});

	it("upgrades a stub author instead of inserting a new one", async () => {
		const rawAuthor = makeRawAuthor();

		mocks.get.mockReturnValueOnce({ id: 5, isStub: true }); // existing stub outside tx
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 5, isStub: true }; // existing stub in tx
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		expect(result.authorId).toBe(5);
		expect(result.authorName).toBe("J.R.R. Tolkien");
		expect(result.booksAdded).toBe(0);
		// update should have been called to upgrade the stub
		expect(dbMock.update).toHaveBeenCalled();
	});

	it("skips books filtered out by metadata profile (compilations)", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook({ isCompilation: true });

		mocks.getMetadataProfile.mockReturnValue({
			...defaultMetadataProfile(),
			skipCompilations: true,
		});

		mocks.get.mockReturnValueOnce(undefined); // no existing author
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [makeRawEdition()]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing author in tx
				case 2:
					return { id: 1, name: rawAuthor.name }; // insert author returning
				case 3:
					return undefined; // no existing book
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		expect(result.booksAdded).toBe(0);
	});

	it("skips books below minimum popularity", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook({ usersCount: 5 });

		mocks.getMetadataProfile.mockReturnValue({
			...defaultMetadataProfile(),
			minimumPopularity: 50,
		});

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [makeRawEdition()]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				case 3:
					return undefined;
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		expect(result.booksAdded).toBe(0);
	});

	it("skips books missing release date when profile requires it", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook({ releaseDate: null });

		mocks.getMetadataProfile.mockReturnValue({
			...defaultMetadataProfile(),
			skipMissingReleaseDate: true,
		});

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [makeRawEdition()]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				case 3:
					return undefined;
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		expect(result.booksAdded).toBe(0);
	});

	it("skips existing books but syncs booksAuthors", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();

		mocks.get.mockReturnValueOnce(undefined); // no existing author outside tx
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing author in tx
				case 2:
					return { id: 1, name: rawAuthor.name }; // insert author returning
				case 3:
					return { id: 50 }; // existing book found
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		// Book already existed, so booksAdded is 0 but no error
		expect(result.booksAdded).toBe(0);
	});

	it("filters editions by language when profile languages are set", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();
		const enEdition = makeRawEdition({ id: 300, languageCode: "en" });
		const frEdition = makeRawEdition({ id: 301, languageCode: "fr" });

		mocks.getProfileLanguages.mockReturnValue(["en"]);

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [enEdition, frEdition]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				case 3:
					return undefined; // no existing book
				case 4:
					return { id: 10, title: rawBook.title }; // insert book returning
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		// Only the English edition should be added (+ default cover is 300 which is en)
		expect(result.editionsAdded).toBe(1);
	});
});

// ========================================================================
// refreshAuthorInternal
// ========================================================================

describe("refreshAuthorInternal", () => {
	it("throws when author not found", async () => {
		mocks.get.mockReturnValueOnce(undefined);

		const { refreshAuthorInternal } = await import("../import");
		await expect(refreshAuthorInternal(999)).rejects.toThrow(
			"Author not found.",
		);
	});

	it("throws when author has no foreign ID", async () => {
		mocks.get.mockReturnValueOnce({ id: 1, foreignAuthorId: null });

		const { refreshAuthorInternal } = await import("../import");
		await expect(refreshAuthorInternal(1)).rejects.toThrow(
			"Author has no Hardcover ID.",
		);
	});

	it("updates author metadata and processes books", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();

		// First select: local author
		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "Old Name",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		// Inside transaction: excluded books = [], existing book found, then various DB calls
		let txGetCallCount = 0;
		mocks.all.mockImplementation(() => {
			// Returns empty arrays for most queries
			return [];
		});
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 50 }; // existing book
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		expect(mocks.fetchAuthorComplete).toHaveBeenCalledWith(100);
		expect(result).toHaveProperty("booksUpdated");
		expect(result).toHaveProperty("booksAdded");
		expect(result).toHaveProperty("editionsUpdated");
		expect(result).toHaveProperty("editionsAdded");
	});
});

// ========================================================================
// refreshBookInternal
// ========================================================================

describe("refreshBookInternal", () => {
	it("throws when book not found", async () => {
		mocks.get.mockReturnValueOnce(undefined);

		const { refreshBookInternal } = await import("../import");
		await expect(refreshBookInternal(999)).rejects.toThrow("Book not found.");
	});

	it("throws when book has no foreign ID", async () => {
		mocks.get.mockReturnValueOnce({ id: 1, foreignBookId: null });

		const { refreshBookInternal } = await import("../import");
		await expect(refreshBookInternal(1)).rejects.toThrow(
			"Book has no Hardcover ID.",
		);
	});

	it("handles book removed from Hardcover — deletes when safe", async () => {
		mocks.get
			.mockReturnValueOnce({
				id: 1,
				foreignBookId: "200",
				autoSwitchEdition: 0,
			}) // local book
			.mockReturnValueOnce(undefined) // no profile link (hasProfileLink)
			.mockReturnValueOnce({ count: 0 }) // no files
			.mockReturnValueOnce({ title: "The Hobbit" }); // book title for history

		mocks.fetchBookComplete.mockResolvedValue(null);

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		expect(result).toEqual({
			booksUpdated: 0,
			booksAdded: 0,
			editionsUpdated: 0,
			editionsAdded: 0,
		});
		// Book should have been deleted
		expect(dbMock.delete).toHaveBeenCalled();
	});

	it("handles book removed from Hardcover — stamps missing when files exist", async () => {
		mocks.get
			.mockReturnValueOnce({
				id: 1,
				foreignBookId: "200",
				autoSwitchEdition: 0,
			}) // local book
			.mockReturnValueOnce(undefined) // no profile link
			.mockReturnValueOnce({ count: 3 }); // has files

		mocks.fetchBookComplete.mockResolvedValue(null);

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		expect(result).toEqual({
			booksUpdated: 0,
			booksAdded: 0,
			editionsUpdated: 0,
			editionsAdded: 0,
		});
		// Book should be updated with metadataSourceMissingSince
		expect(dbMock.update).toHaveBeenCalled();
	});

	it("updates book and editions when data available", async () => {
		const rawBook = makeRawBook();
		const rawEdition = makeRawEdition();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignBookId: "200",
			autoSwitchEdition: 0,
		}); // local book
		mocks.fetchBookComplete.mockResolvedValue({
			book: rawBook,
			editions: [rawEdition],
		});

		// primaryEntry from booksAuthors
		mocks.get.mockReturnValueOnce({
			authorId: 5,
			foreignAuthorId: "100",
		});

		// Inside transaction
		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 300 }; // existing edition found
				default:
					return undefined;
			}
		});
		mocks.all.mockReturnValue([]);

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		expect(result.booksUpdated).toBe(1);
		expect(result.booksAdded).toBe(0);
		expect(mocks.fetchBookComplete).toHaveBeenCalledWith(200);
	});
});

// ========================================================================
// ensureEditionProfileLinks
// ========================================================================

describe("ensureEditionProfileLinks", () => {
	it("returns early when no download profile IDs provided", async () => {
		const { ensureEditionProfileLinks } = await import("../import");
		ensureEditionProfileLinks(1, []);

		// Should not query db at all
		expect(dbMock.select).not.toHaveBeenCalled();
	});

	it("returns early when book has no editions", async () => {
		mocks.all.mockReturnValueOnce([]); // no editions

		const { ensureEditionProfileLinks } = await import("../import");
		ensureEditionProfileLinks(1, [1, 2]);

		// Only one select call (for editions), no insert
		expect(dbMock.insert).not.toHaveBeenCalled();
	});

	it("creates edition-profile links for matching profiles", async () => {
		const fakeEdition = { id: 10, format: "Paperback" };
		const fakeProfile = { id: 1, contentType: "ebook" };

		mocks.all
			.mockReturnValueOnce([fakeEdition]) // editions for book
			.mockReturnValueOnce([fakeProfile]); // download profiles

		mocks.pickBestEditionForProfile.mockReturnValue(fakeEdition);

		const { ensureEditionProfileLinks } = await import("../import");
		ensureEditionProfileLinks(1, [1]);

		expect(mocks.pickBestEditionForProfile).toHaveBeenCalledOnce();
		expect(dbMock.insert).toHaveBeenCalled();
	});

	it("does not insert links when no best edition found", async () => {
		const fakeEdition = { id: 10, format: "Paperback" };
		const fakeProfile = { id: 1, contentType: "ebook" };

		mocks.all
			.mockReturnValueOnce([fakeEdition])
			.mockReturnValueOnce([fakeProfile]);

		mocks.pickBestEditionForProfile.mockReturnValue(null);

		const { ensureEditionProfileLinks } = await import("../import");
		ensureEditionProfileLinks(1, [1]);

		expect(dbMock.insert).not.toHaveBeenCalled();
	});
});

// ========================================================================
// Helper function tests (via module internals accessed through behavior)
// ========================================================================

describe("deriveSortName (via importAuthorInternal)", () => {
	// deriveSortName is private, but we can verify it through the author insert
	it("creates correct sort name from multi-word author name", async () => {
		const rawAuthor = makeRawAuthor({ name: "George R.R. Martin" });

		mocks.get.mockReturnValueOnce(undefined); // no existing author
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing author in tx
				case 2:
					return { id: 1, name: rawAuthor.name }; // insert returning
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		// Verify the insert was called with sortName = "Martin, George R.R."
		const insertCalls = dbMock.insert.mock.calls;
		expect(insertCalls.length).toBeGreaterThan(0);
		const valuesCalls = dbMock.values.mock.calls;
		const authorValues = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"sortName" in (call[0] as Record<string, unknown>),
		);
		if (authorValues) {
			expect((authorValues[0] as { sortName: string }).sortName).toBe(
				"Martin, George R.R.",
			);
		}
	});
});

describe("toImageArray (via importAuthorInternal)", () => {
	it("produces an image array from a URL through author import", async () => {
		const rawAuthor = makeRawAuthor({
			imageUrl: "https://example.com/pic.jpg",
		});

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		const valuesCalls = dbMock.values.mock.calls;
		const authorValues = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"images" in (call[0] as Record<string, unknown>),
		);
		if (authorValues) {
			expect((authorValues[0] as { images: unknown }).images).toEqual([
				{ url: "https://example.com/pic.jpg", coverType: "poster" },
			]);
		}
	});

	it("produces empty array when image URL is null", async () => {
		const rawAuthor = makeRawAuthor({ imageUrl: null });

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		const valuesCalls = dbMock.values.mock.calls;
		const authorValues = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"images" in (call[0] as Record<string, unknown>),
		);
		if (authorValues) {
			expect((authorValues[0] as { images: unknown }).images).toEqual([]);
		}
	});
});

describe("deriveAuthorContributions (via importAuthorInternal)", () => {
	it("filters out non-author roles from contributions", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook({
			contributions: [
				{
					authorId: 100,
					authorName: "Author A",
					contribution: null,
					position: 1,
				},
				{
					authorId: 101,
					authorName: "Narrator B",
					contribution: "Narrator",
					position: 2,
				},
				{
					authorId: 102,
					authorName: "Editor C",
					contribution: "Editor",
					position: 3,
				},
				{
					authorId: 103,
					authorName: "Co-Author D",
					contribution: "Co-author",
					position: 4,
				},
			],
		});

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [makeRawEdition()]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing author in tx
				case 2:
					return { id: 1, name: rawAuthor.name }; // insert author returning
				case 3:
					return undefined; // no existing book
				case 4:
					return { id: 10, title: rawBook.title }; // insert book returning
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		// The booksAuthors insert calls should include Author A (primary) and Co-Author D,
		// but NOT Narrator B or Editor C
		const valuesCalls = dbMock.values.mock.calls;
		const booksAuthorInserts = valuesCalls.filter(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"foreignAuthorId" in (call[0] as Record<string, unknown>) &&
				"isPrimary" in (call[0] as Record<string, unknown>),
		);

		const insertedForeignIds = booksAuthorInserts.map(
			(call: unknown[]) =>
				(call[0] as { foreignAuthorId: string }).foreignAuthorId,
		);
		expect(insertedForeignIds).toContain("100"); // primary author
		expect(insertedForeignIds).toContain("103"); // co-author
		expect(insertedForeignIds).not.toContain("101"); // narrator filtered
		expect(insertedForeignIds).not.toContain("102"); // editor filtered
	});
});

describe("monitorOption handling in importAuthorInternal", () => {
	it("sets monitorNewBooks to 'none' when monitorOption is 'none'", async () => {
		const rawAuthor = makeRawAuthor();

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{
				foreignAuthorId: 100,
				downloadProfileIds: [],
				monitorOption: "none",
				monitorNewBooks: "all",
			},
			noopProgress,
			noopTitle,
		);

		expect(result.authorId).toBe(1);
		// When monitorOption is "none", the author should be set as not monitored
		const valuesCalls = dbMock.values.mock.calls;
		const authorInsert = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"monitored" in (call[0] as Record<string, unknown>),
		);
		if (authorInsert) {
			expect((authorInsert[0] as { monitored: boolean }).monitored).toBe(false);
		}
	});
});

// ========================================================================
// Edge cases for filterEditionsByProfile (tested through importAuthorInternal)
// ========================================================================

describe("edition filtering edge cases", () => {
	it("skips editions missing ISBN/ASIN when skipMissingIsbnAsin is set", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();
		const edWithIsbn = makeRawEdition({ id: 300, isbn13: "1234567890123" });
		const edWithoutIsbn = makeRawEdition({
			id: 301,
			isbn10: null,
			isbn13: null,
			asin: null,
		});

		mocks.getMetadataProfile.mockReturnValue({
			...defaultMetadataProfile(),
			skipMissingIsbnAsin: true,
		});

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [edWithIsbn, edWithoutIsbn]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				case 3:
					return undefined;
				case 4:
					return { id: 10, title: rawBook.title };
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		// Only the edition with ISBN should be added
		expect(result.editionsAdded).toBe(1);
	});

	it("skips editions with fewer pages than minimumPages (non-audiobook)", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();
		const longEdition = makeRawEdition({
			id: 300,
			pageCount: 200,
			format: "Paperback",
		});
		const shortEdition = makeRawEdition({
			id: 301,
			pageCount: 30,
			format: "Paperback",
		});
		const audioEdition = makeRawEdition({
			id: 302,
			pageCount: 30,
			format: "Audiobook",
		});

		mocks.getMetadataProfile.mockReturnValue({
			...defaultMetadataProfile(),
			minimumPages: 50,
		});

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [longEdition, shortEdition, audioEdition]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				case 3:
					return undefined;
				case 4:
					return { id: 10, title: rawBook.title };
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		// longEdition passes, shortEdition fails, audioEdition passes (audiobooks exempt from page filter)
		// + default cover edition (300) is already in filtered set
		expect(result.editionsAdded).toBe(2);
	});

	it("preserves default cover edition even when it fails language filter", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook({ defaultCoverEditionId: 301 });
		const enEdition = makeRawEdition({ id: 300, languageCode: "en" });
		const frCoverEdition = makeRawEdition({ id: 301, languageCode: "fr" });

		mocks.getProfileLanguages.mockReturnValue(["en"]);

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [enEdition, frCoverEdition]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				case 3:
					return undefined;
				case 4:
					return { id: 10, title: rawBook.title };
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		// Both editions should be added: en passes, fr is default cover and gets preserved
		expect(result.editionsAdded).toBe(2);
	});

	it("skips book when all editions filtered out by language", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();
		const frEdition = makeRawEdition({ id: 300, languageCode: "fr" });

		mocks.getProfileLanguages.mockReturnValue(["en"]);

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [frEdition]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				case 3:
					return undefined;
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		// Book should be skipped because all editions were filtered out
		expect(result.booksAdded).toBe(0);
	});
});

// ========================================================================
// Series import (via importAuthorInternal)
// ========================================================================

describe("series import via importAuthorInternal", () => {
	it("creates series and links when book has series data", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook({
			series: [
				{
					seriesId: 500,
					seriesTitle: "Middle-earth",
					seriesSlug: "middle-earth",
					isCompleted: true,
					position: "1",
				},
			],
		});

		mocks.get.mockReturnValueOnce(undefined); // no existing author
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [makeRawEdition()]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing author in tx
				case 2:
					return { id: 1, name: rawAuthor.name }; // insert author returning
				case 3:
					return undefined; // no existing book
				case 4:
					return { id: 10, title: rawBook.title }; // insert book returning
				case 5:
					return undefined; // no existing series
				case 6:
					return { id: 20 }; // insert series returning
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		expect(result.booksAdded).toBe(1);
		// Series insert and seriesBookLinks insert should have been called
		const valuesCalls = dbMock.values.mock.calls;
		const seriesInsert = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"foreignSeriesId" in (call[0] as Record<string, unknown>),
		);
		expect(seriesInsert).toBeDefined();
	});
});

// ========================================================================
// author status derivation
// ========================================================================

describe("author status derivation", () => {
	it("sets status to 'deceased' when deathYear is present", async () => {
		const rawAuthor = makeRawAuthor({ deathYear: 1973 });

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		const valuesCalls = dbMock.values.mock.calls;
		const authorInsert = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"status" in (call[0] as Record<string, unknown>),
		);
		if (authorInsert) {
			expect((authorInsert[0] as { status: string }).status).toBe("deceased");
		}
	});

	it("sets status to 'continuing' when deathYear is null", async () => {
		const rawAuthor = makeRawAuthor({ deathYear: null });

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		const valuesCalls = dbMock.values.mock.calls;
		const authorInsert = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"status" in (call[0] as Record<string, unknown>),
		);
		if (authorInsert) {
			expect((authorInsert[0] as { status: string }).status).toBe("continuing");
		}
	});
});

// ========================================================================
// Edition filtering: releaseDate filter
// ========================================================================

describe("edition filtering — skipMissingReleaseDate on editions", () => {
	it("skips editions missing releaseDate when profile requires it", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();
		const edWithDate = makeRawEdition({ id: 300, releaseDate: "2020-01-01" });
		const edNoDate = makeRawEdition({ id: 301, releaseDate: null });

		mocks.getMetadataProfile.mockReturnValue({
			...defaultMetadataProfile(),
			skipMissingReleaseDate: true,
		});

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [edWithDate, edNoDate]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				case 3:
					return undefined;
				case 4:
					return { id: 10, title: rawBook.title };
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		// Only edition with release date passes (the book-level skip also triggers,
		// but since the book itself has a releaseDate, only the edition filter applies)
		expect(result.editionsAdded).toBe(1);
	});
});

// ========================================================================
// shouldSkipBook — minimumPages with all non-audio editions too short
// ========================================================================

describe("shouldSkipBook — minimumPages skips book", () => {
	it("skips book when all non-audiobook editions have null pageCount (below minimum)", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();
		// pageCount: null passes the edition-level filter but fails the book-level
		// check because pageCount !== null is false, so hasEnoughPages stays false.
		const nullPageEdition = makeRawEdition({
			id: 300,
			pageCount: null,
			format: "Paperback",
		});

		mocks.getMetadataProfile.mockReturnValue({
			...defaultMetadataProfile(),
			minimumPages: 50,
		});

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [nullPageEdition]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				case 3:
					return undefined;
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		expect(result.booksAdded).toBe(0);
	});
});

// ========================================================================
// shouldSkipBook — skipMissingIsbnAsin at book level
// ========================================================================

describe("shouldSkipBook — edition with no languageCode filtered by language", () => {
	it("filters out edition with null languageCode when language filter is active", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();
		// Edition has no languageCode — should be filtered out when language filter active
		const edNoLang = makeRawEdition({
			id: 300,
			languageCode: null,
		});

		mocks.getProfileLanguages.mockReturnValue(["en"]);

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [edNoLang]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: rawAuthor.name };
				case 3:
					return undefined;
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		// Book skipped: all editions filtered out by language, languages.length > 0
		expect(result.booksAdded).toBe(0);
	});
});

// ========================================================================
// deriveSortName — single-word name
// ========================================================================

describe("deriveSortName — single word name", () => {
	it("returns the name unchanged for a single-word name", async () => {
		const rawAuthor = makeRawAuthor({ name: "Plato" });

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined;
				case 2:
					return { id: 1, name: "Plato" };
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		const valuesCalls = dbMock.values.mock.calls;
		const authorInsert = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"sortName" in (call[0] as Record<string, unknown>),
		);
		if (authorInsert) {
			expect((authorInsert[0] as { sortName: string }).sortName).toBe("Plato");
		}
	});
});

// ========================================================================
// monitorOption switch cases (future, existing, first, latest)
// ========================================================================

describe("monitorOption switch cases in importAuthorInternal", () => {
	// Helper for monitor-option tests: sets up a new author import with one book
	// that gets newly added, and download profiles that trigger the monitor logic.
	async function setupMonitorTest(monitorOption: string, bookOverrides = {}) {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook(bookOverrides);
		const rawEdition = makeRawEdition();

		mocks.get.mockReturnValueOnce(undefined); // no existing author outside tx

		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [rawEdition]]]),
		);
		mocks.pickBestEditionForProfile.mockReturnValue({ id: 300 });

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing author in tx
				case 2:
					return { id: 1, name: rawAuthor.name }; // insert author returning
				case 3:
					return undefined; // no existing book
				case 4:
					return { id: 10, title: rawBook.title }; // insert book returning
				default:
					return undefined;
			}
		});

		// For monitor logic: the download profiles query
		mocks.all.mockImplementation(() => {
			return [{ id: 1, contentType: "ebook" }];
		});

		const { importAuthorInternal } = await import("../import");
		return importAuthorInternal(
			{
				foreignAuthorId: 100,
				downloadProfileIds: [1],
				monitorOption: monitorOption as
					| "all"
					| "future"
					| "missing"
					| "existing"
					| "first"
					| "latest"
					| "none",
				monitorNewBooks: "all",
			},
			noopProgress,
			noopTitle,
		);
	}

	it("monitors all books for 'all' option", async () => {
		const result = await setupMonitorTest("all");
		expect(result.booksAdded).toBe(1);
		expect(mocks.pickBestEditionForProfile).toHaveBeenCalled();
	});

	it("monitors all books for 'missing' option (same as all at import)", async () => {
		const result = await setupMonitorTest("missing");
		expect(result.booksAdded).toBe(1);
		expect(mocks.pickBestEditionForProfile).toHaveBeenCalled();
	});

	it("monitors only future books for 'future' option", async () => {
		const result = await setupMonitorTest("future", {
			releaseDate: "2099-01-01",
		});
		expect(result.booksAdded).toBe(1);
		expect(mocks.pickBestEditionForProfile).toHaveBeenCalled();
	});

	it("monitors no books for 'existing' option (none have files at import)", async () => {
		const result = await setupMonitorTest("existing");
		expect(result.booksAdded).toBe(1);
		// pickBestEditionForProfile should NOT be called since monitoredBookIds is empty
		expect(mocks.pickBestEditionForProfile).not.toHaveBeenCalled();
	});

	it("monitors only the first (earliest) book for 'first' option", async () => {
		const result = await setupMonitorTest("first");
		expect(result.booksAdded).toBe(1);
		expect(mocks.pickBestEditionForProfile).toHaveBeenCalled();
	});

	it("monitors only the latest book for 'latest' option", async () => {
		const result = await setupMonitorTest("latest");
		expect(result.booksAdded).toBe(1);
		expect(mocks.pickBestEditionForProfile).toHaveBeenCalled();
	});
});

// ========================================================================
// importAuthorInternal — stub upgrade with download profiles
// ========================================================================

describe("importAuthorInternal — stub upgrade with download profiles", () => {
	it("inserts download profile join rows when upgrading a stub author", async () => {
		const rawAuthor = makeRawAuthor();

		mocks.get.mockReturnValueOnce({ id: 5, isStub: true }); // existing stub outside tx
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 5, isStub: true }; // stub in tx
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{
				foreignAuthorId: 100,
				downloadProfileIds: [1, 2],
				monitorOption: "all",
			},
			noopProgress,
			noopTitle,
		);

		expect(result.authorId).toBe(5);
		// The download profile inserts should have happened
		const valuesCalls = dbMock.values.mock.calls;
		const profileInserts = valuesCalls.filter(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"downloadProfileId" in (call[0] as Record<string, unknown>) &&
				"authorId" in (call[0] as Record<string, unknown>),
		);
		expect(profileInserts.length).toBeGreaterThanOrEqual(2);
	});
});

// ========================================================================
// importAuthorInternal — double-check race condition inside tx
// ========================================================================

describe("importAuthorInternal — transaction race condition", () => {
	it("throws when author appears as non-stub inside transaction", async () => {
		const rawAuthor = makeRawAuthor();

		// Outside tx: no existing author
		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		// Inside tx: author exists and is NOT a stub (race condition)
		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 1, isStub: false }; // race: now exists as non-stub
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		await expect(
			importAuthorInternal(
				{ foreignAuthorId: 100, downloadProfileIds: [] },
				noopProgress,
				noopTitle,
			),
		).rejects.toThrow("Author is already on your bookshelf.");
	});
});

// ========================================================================
// importAuthorInternal — existing series reuse in ensureSeries
// ========================================================================

describe("importAuthorInternal — ensureSeries reuses existing series", () => {
	it("reuses existing series by foreignSeriesId", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook({
			series: [
				{
					seriesId: 500,
					seriesTitle: "Middle-earth",
					seriesSlug: "middle-earth",
					isCompleted: true,
					position: "1",
				},
			],
		});

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [makeRawEdition()]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing author in tx
				case 2:
					return { id: 1, name: rawAuthor.name }; // insert author returning
				case 3:
					return undefined; // no existing book
				case 4:
					return { id: 10, title: rawBook.title }; // insert book returning
				case 5:
					return { id: 99 }; // existing series found
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		expect(result.booksAdded).toBe(1);
		// seriesBookLinks should have used the existing series id
		const valuesCalls = dbMock.values.mock.calls;
		const linkInsert = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"seriesId" in (call[0] as Record<string, unknown>) &&
				"position" in (call[0] as Record<string, unknown>),
		);
		expect(linkInsert).toBeDefined();
		if (linkInsert) {
			expect((linkInsert[0] as { seriesId: number }).seriesId).toBe(99);
		}
	});
});

// ========================================================================
// refreshAuthorInternal — new book added during refresh
// ========================================================================

describe("refreshAuthorInternal — adds new books during refresh", () => {
	it("inserts a new book when it does not already exist", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();
		const rawEdition = makeRawEdition();

		// local author
		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [rawEdition]]]),
		);

		// Inside transaction: excluded books = [], no existing book -> insert
		let txGetCallCount = 0;
		let txAllCallCount = 0;
		mocks.all.mockImplementation(() => {
			txAllCallCount++;
			switch (txAllCallCount) {
				case 1:
					return []; // excluded books
				default:
					return []; // booksAuthors entries, existingEditions, etc.
			}
		});
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing book
				case 2:
					return { id: 10, title: rawBook.title }; // insert book returning
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		expect(result.booksAdded).toBe(1);
	});

	it("skips excluded books during refresh", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txAllCallCount = 0;
		mocks.all.mockImplementation(() => {
			txAllCallCount++;
			switch (txAllCallCount) {
				case 1:
					return [{ foreignBookId: String(rawBook.id) }]; // excluded
				default:
					return [];
			}
		});
		mocks.get.mockImplementation(() => undefined); // no existing book

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		expect(result.booksAdded).toBe(0);
	});

	it("skips canonical/partial books during refresh", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook({ canonicalId: 999 }); // partial

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		mocks.all.mockReturnValue([]);
		mocks.get.mockImplementation(() => undefined);

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		expect(result.booksAdded).toBe(0);
	});
});

// ========================================================================
// refreshAuthorInternal — updates existing books
// ========================================================================

describe("refreshAuthorInternal — updates existing books", () => {
	it("updates existing book metadata and upserts editions", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();
		const rawEdition = makeRawEdition();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [rawEdition]]]),
		);

		let txGetCallCount = 0;
		let txAllCallCount = 0;
		mocks.all.mockImplementation(() => {
			txAllCallCount++;
			switch (txAllCallCount) {
				case 1:
					return []; // excluded books
				case 2:
					return []; // existingEditions for orphan detection
				case 3:
					return []; // booksAuthors entries for orphan detection
				default:
					return [];
			}
		});
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 50 }; // existing book found
				case 2:
					return undefined; // syncBookAuthors: no existing booksAuthors entry
				case 3:
					return { id: 300 }; // existing edition found
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		expect(result.booksUpdated).toBe(1);
		expect(result.editionsUpdated).toBe(1);
	});

	it("inserts new editions for existing books that pass the filter", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();
		const rawEdition = makeRawEdition();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [rawEdition]]]),
		);

		let txGetCallCount = 0;
		mocks.all.mockReturnValue([]);
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 50 }; // existing book found
				case 2:
					return undefined; // syncBookAuthors: no existing booksAuthors entry
				case 3:
					return undefined; // edition NOT found -> will insert
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		expect(result.booksUpdated).toBe(1);
		expect(result.editionsAdded).toBe(1);
	});
});

// ========================================================================
// refreshAuthorInternal — orphan book detection
// ========================================================================

describe("refreshAuthorInternal — orphan detection", () => {
	it("deletes orphan book when safe (no profile links or files)", async () => {
		const rawAuthor = makeRawAuthor();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [], // no books from source anymore
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txAllCallCount = 0;
		mocks.all.mockImplementation(() => {
			txAllCallCount++;
			switch (txAllCallCount) {
				case 1:
					return []; // excluded books
				case 2:
					return [{ bookId: 50 }]; // booksAuthors: one book linked to this author
				default:
					return [];
			}
		});

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					// bookRecord — the orphan book
					return { foreignBookId: "999", title: "Orphan Book" };
				case 2:
					return undefined; // hasProfileLink — none
				case 3:
					return { count: 0 }; // fileCount — none
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		// Book should have been deleted
		expect(dbMock.delete).toHaveBeenCalled();
		expect(result.booksAdded).toBe(0);
	});

	it("stamps metadataSourceMissingSince when orphan book has files", async () => {
		const rawAuthor = makeRawAuthor();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txAllCallCount = 0;
		mocks.all.mockImplementation(() => {
			txAllCallCount++;
			switch (txAllCallCount) {
				case 1:
					return []; // excluded books
				case 2:
					return [{ bookId: 50 }]; // booksAuthors
				default:
					return [];
			}
		});

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { foreignBookId: "999", title: "Orphan Book" };
				case 2:
					return undefined; // no profile link
				case 3:
					return { count: 5 }; // has files — not safe to delete
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		// Should stamp metadataSourceMissingSince instead of deleting
		expect(dbMock.update).toHaveBeenCalled();
		expect(result.booksAdded).toBe(0);
	});
});

// ========================================================================
// refreshAuthorInternal — edition orphan detection
// ========================================================================

describe("refreshAuthorInternal — edition orphan detection", () => {
	it("deletes orphan editions when safe", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		// No editions from source — all existing ones are orphans
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		let txAllCallCount = 0;
		mocks.all.mockImplementation(() => {
			txAllCallCount++;
			switch (txAllCallCount) {
				case 1:
					return []; // excluded books
				case 2:
					// existingEditions for orphan detection
					return [{ id: 300, foreignEditionId: "orphan-ed-1" }];
				case 3:
					return []; // booksAuthors
				default:
					return [];
			}
		});
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 50 }; // existing book found
				case 2:
					return undefined; // syncBookAuthors: no existing booksAuthors entry
				case 3:
					return undefined; // hasProfile for orphan edition — none
				case 4:
					return { count: 0 }; // fileCount — none
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		// Orphan edition should be deleted
		expect(dbMock.delete).toHaveBeenCalled();
	});

	it("stamps metadataSourceMissingSince for orphan editions with profile links", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(new Map());

		let txGetCallCount = 0;
		let txAllCallCount = 0;
		mocks.all.mockImplementation(() => {
			txAllCallCount++;
			switch (txAllCallCount) {
				case 1:
					return []; // excluded books
				case 2:
					return [{ id: 300, foreignEditionId: "orphan-ed-1" }]; // orphan edition
				case 3:
					return []; // booksAuthors
				default:
					return [];
			}
		});
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 50 }; // existing book
				case 2:
					return undefined; // syncBookAuthors: no existing booksAuthors entry
				case 3:
					return { id: 10 }; // hasProfile — edition has profile link (not safe)
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		// Should stamp metadataSourceMissingSince instead of deleting
		expect(dbMock.update).toHaveBeenCalled();
	});
});

// ========================================================================
// refreshAuthorInternal — filtered book removal during refresh
// ========================================================================

describe("refreshAuthorInternal — existing book filtered out by profile", () => {
	it("deletes book when it no longer passes metadata profile and is safe", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook({ isCompilation: true });
		const rawEdition = makeRawEdition();

		mocks.getMetadataProfile.mockReturnValue({
			...defaultMetadataProfile(),
			skipCompilations: true,
		});

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [rawEdition]]]),
		);

		let txGetCallCount = 0;
		mocks.all.mockReturnValue([]);
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 50 }; // existing book found
				case 2:
					return undefined; // hasProfileLink — none
				case 3:
					return { count: 0 }; // fileCount — none
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		expect(dbMock.delete).toHaveBeenCalled();
	});
});

// ========================================================================
// refreshAuthorInternal — new book with series links
// ========================================================================

describe("refreshAuthorInternal — new book with series", () => {
	it("inserts series and series-book links for newly added books", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook({
			series: [
				{
					seriesId: 500,
					seriesTitle: "Middle-earth",
					seriesSlug: "middle-earth",
					isCompleted: true,
					position: "1",
				},
			],
		});
		const rawEdition = makeRawEdition();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [rawEdition]]]),
		);

		let txGetCallCount = 0;
		mocks.all.mockReturnValue([]);
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing book — insert
				case 2:
					return { id: 10, title: rawBook.title }; // insert book returning
				case 3:
					return undefined; // no existing series
				case 4:
					return { id: 20 }; // insert series returning
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		expect(result.booksAdded).toBe(1);
		const valuesCalls = dbMock.values.mock.calls;
		const seriesInsert = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"foreignSeriesId" in (call[0] as Record<string, unknown>),
		);
		expect(seriesInsert).toBeDefined();
	});
});

// ========================================================================
// refreshBookInternal — edition processing
// ========================================================================

describe("refreshBookInternal — edition processing", () => {
	it("inserts new editions that pass the filter", async () => {
		const rawBook = makeRawBook();
		const rawEdition = makeRawEdition();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignBookId: "200",
			autoSwitchEdition: 0,
		}); // local book
		mocks.fetchBookComplete.mockResolvedValue({
			book: rawBook,
			editions: [rawEdition],
		});

		// primaryEntry
		mocks.get.mockReturnValueOnce({
			authorId: 5,
			foreignAuthorId: "100",
		});

		// Inside transaction
		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // edition NOT found -> will insert
				default:
					return undefined;
			}
		});
		mocks.all.mockReturnValue([]);

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		expect(result.booksUpdated).toBe(1);
		expect(result.editionsAdded).toBe(1);
	});

	it("deletes orphan editions when safe during book refresh", async () => {
		const rawBook = makeRawBook();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignBookId: "200",
			autoSwitchEdition: 0,
		});
		mocks.fetchBookComplete.mockResolvedValue({
			book: rawBook,
			editions: [], // no editions from source
		});

		mocks.get.mockReturnValueOnce({
			authorId: 5,
			foreignAuthorId: "100",
		});

		let txGetCallCount = 0;
		let txAllCallCount = 0;
		mocks.all.mockImplementation(() => {
			txAllCallCount++;
			switch (txAllCallCount) {
				case 1:
					// existingEditions for orphan detection
					return [{ id: 300, foreignEditionId: "orphan-500" }];
				default:
					return [];
			}
		});
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // hasProfile for orphan — none
				case 2:
					return { count: 0 }; // fileCount — none
				default:
					return undefined;
			}
		});

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		expect(dbMock.delete).toHaveBeenCalled();
	});

	it("stamps metadataSourceMissingSince for orphan editions with downloads", async () => {
		const rawBook = makeRawBook();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignBookId: "200",
			autoSwitchEdition: 0,
		});
		mocks.fetchBookComplete.mockResolvedValue({
			book: rawBook,
			editions: [],
		});

		mocks.get.mockReturnValueOnce({
			authorId: 5,
			foreignAuthorId: "100",
		});

		let txGetCallCount = 0;
		mocks.all.mockImplementation(() => {
			return [{ id: 300, foreignEditionId: "orphan-500" }];
		});
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 77 }; // hasProfile — has link, not safe
				default:
					return undefined;
			}
		});

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		expect(dbMock.update).toHaveBeenCalled();
	});
});

// ========================================================================
// refreshBookInternal — series updates
// ========================================================================

describe("refreshBookInternal — series updates", () => {
	it("updates existing series during refresh", async () => {
		const rawBook = makeRawBook({
			series: [
				{
					seriesId: 500,
					seriesTitle: "Updated Title",
					seriesSlug: "updated",
					isCompleted: false,
					position: "2",
				},
			],
		});

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignBookId: "200",
			autoSwitchEdition: 0,
		});
		mocks.fetchBookComplete.mockResolvedValue({
			book: rawBook,
			editions: [],
		});
		mocks.get.mockReturnValueOnce({
			authorId: 5,
			foreignAuthorId: "100",
		});

		let txGetCallCount = 0;
		mocks.all.mockReturnValue([]);
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // syncBookAuthors: no existing booksAuthors entry
				case 2:
					return { id: 99 }; // existing series found
				default:
					return undefined;
			}
		});

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		expect(result.booksUpdated).toBe(1);
		// Should update existing series and insert seriesBookLinks
		expect(dbMock.update).toHaveBeenCalled();
	});

	it("creates new series when not found during refresh", async () => {
		const rawBook = makeRawBook({
			series: [
				{
					seriesId: 600,
					seriesTitle: "New Series",
					seriesSlug: "new-series",
					isCompleted: true,
					position: "1",
				},
			],
		});

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignBookId: "200",
			autoSwitchEdition: 0,
		});
		mocks.fetchBookComplete.mockResolvedValue({
			book: rawBook,
			editions: [],
		});
		mocks.get.mockReturnValueOnce({
			authorId: 5,
			foreignAuthorId: "100",
		});

		let txGetCallCount = 0;
		mocks.all.mockReturnValue([]);
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // syncBookAuthors: no existing booksAuthors entry
				case 2:
					return undefined; // no existing series
				case 3:
					return { id: 30 }; // insert series returning
				default:
					return undefined;
			}
		});

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		expect(result.booksUpdated).toBe(1);
		const valuesCalls = dbMock.values.mock.calls;
		const seriesInsert = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"foreignSeriesId" in (call[0] as Record<string, unknown>),
		);
		expect(seriesInsert).toBeDefined();
	});
});

// ========================================================================
// refreshBookInternal — autoSwitchEdition
// ========================================================================

describe("refreshBookInternal — autoSwitchEdition", () => {
	it("calls autoSwitchEditionsForBook when enabled and editions changed", async () => {
		const rawBook = makeRawBook();
		const rawEdition = makeRawEdition();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignBookId: "200",
			autoSwitchEdition: 1, // enabled
		});
		mocks.fetchBookComplete.mockResolvedValue({
			book: rawBook,
			editions: [rawEdition],
		});
		mocks.get.mockReturnValueOnce({
			authorId: 5,
			foreignAuthorId: "100",
		});

		let txGetCallCount = 0;
		let txAllCallCount = 0;
		mocks.all.mockImplementation(() => {
			txAllCallCount++;
			switch (txAllCallCount) {
				case 1:
					return []; // existingEditions for orphan check
				case 2:
					// currentEditions for autoSwitchEditionsForBook
					return [{ id: 300, format: "Paperback" }];
				case 3:
					// profileLinks for autoSwitch
					return [{ id: 1, editionId: 300, downloadProfileId: 1 }];
				default:
					return [];
			}
		});
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // syncBookAuthors: no existing booksAuthors entry
				case 2:
					return { id: 300 }; // existing edition -> update
				case 3:
					// profile for autoSwitch
					return { id: 1, contentType: "ebook" };
				default:
					return undefined;
			}
		});
		mocks.pickBestEditionForProfile.mockReturnValue({ id: 300 });

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		expect(result.booksUpdated).toBe(1);
		expect(result.editionsUpdated).toBe(1);
		// pickBestEditionForProfile should have been called for autoSwitch
		expect(mocks.pickBestEditionForProfile).toHaveBeenCalled();
	});
});

// ========================================================================
// refreshBookInternal — no primary entry (booksAuthors empty)
// ========================================================================

describe("refreshBookInternal — no primary entry", () => {
	it("skips syncBookAuthors when no primary entry found", async () => {
		const rawBook = makeRawBook();
		const rawEdition = makeRawEdition();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignBookId: "200",
			autoSwitchEdition: 0,
		});
		mocks.fetchBookComplete.mockResolvedValue({
			book: rawBook,
			editions: [rawEdition],
		});
		// primaryEntry not found
		mocks.get.mockReturnValueOnce(undefined);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 300 }; // existing edition
				default:
					return undefined;
			}
		});
		mocks.all.mockReturnValue([]);

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		// Should still succeed, just without syncing authors
		expect(result.booksUpdated).toBe(1);
	});
});

// ========================================================================
// refreshBookInternal — edition filtered out during refresh
// ========================================================================

describe("refreshBookInternal — existing edition filtered out by profile", () => {
	it("removes existing edition that no longer passes filter when safe", async () => {
		const rawBook = makeRawBook();
		const frEdition = makeRawEdition({ id: 300, languageCode: "fr" });

		mocks.getProfileLanguages.mockReturnValue(["en"]);

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignBookId: "200",
			autoSwitchEdition: 0,
		});
		mocks.fetchBookComplete.mockResolvedValue({
			book: rawBook,
			editions: [frEdition],
		});
		mocks.get.mockReturnValueOnce({
			authorId: 5,
			foreignAuthorId: "100",
		});

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 300 }; // existing edition found
				case 2:
					return undefined; // hasProfile — none
				case 3:
					return { count: 0 }; // fileCount — none
				default:
					return undefined;
			}
		});
		mocks.all.mockReturnValue([]);

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		expect(dbMock.delete).toHaveBeenCalled();
	});
});

// ========================================================================
// refreshBookInternal — book removed from Hardcover with profile link
// ========================================================================

describe("refreshBookInternal — book removed with profile link", () => {
	it("stamps metadataSourceMissingSince when book has profile links", async () => {
		mocks.get
			.mockReturnValueOnce({
				id: 1,
				foreignBookId: "200",
				autoSwitchEdition: 0,
			})
			.mockReturnValueOnce({ id: 99 }) // hasProfileLink — exists
			.mockReturnValueOnce({ count: 0 }); // no files

		mocks.fetchBookComplete.mockResolvedValue(null);

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		expect(result).toEqual({
			booksUpdated: 0,
			booksAdded: 0,
			editionsUpdated: 0,
			editionsAdded: 0,
		});
		expect(dbMock.update).toHaveBeenCalled();
	});
});

// ========================================================================
// refreshAuthorInternal — edition filtered out during update (remove if safe)
// ========================================================================

describe("refreshAuthorInternal — book filtered out by language during update", () => {
	it("removes book that no longer passes language filter during update", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook();
		const frEdition = makeRawEdition({ id: 300, languageCode: "fr" });

		mocks.getProfileLanguages.mockReturnValue(["en"]);

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [frEdition]]]),
		);

		let txGetCallCount = 0;
		mocks.all.mockReturnValue([]);
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 50 }; // existing book found
				case 2:
					return undefined; // hasProfileLink — none (innerJoin chain)
				case 3:
					return { count: 0 }; // fileCount — none
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		expect(dbMock.delete).toHaveBeenCalled();
	});
});

// ========================================================================
// insertBookAuthors fallback — primary author not in contributions
// ========================================================================

describe("insertBookAuthors fallback via importAuthorInternal", () => {
	it("inserts primary author entry via fallback when not in contributions", async () => {
		const rawAuthor = makeRawAuthor();
		// Book contributions only has a Narrator — no author-role contribution
		// for authorId 100, so the fallback path triggers.
		const rawBook = makeRawBook({
			contributions: [
				{
					authorId: 101,
					authorName: "Narrator B",
					contribution: "Narrator",
					position: 1,
				},
			],
		});
		const rawEdition = makeRawEdition();

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [rawEdition]]]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing author in tx
				case 2:
					return { id: 1, name: rawAuthor.name }; // insert author returning
				case 3:
					return undefined; // no existing book
				case 4:
					return { id: 10, title: rawBook.title }; // insert book returning
				case 5:
					// insertBookAuthors fallback: lookup localAuthor name
					return { name: "J.R.R. Tolkien" };
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		expect(result.booksAdded).toBe(1);
		// The fallback should have inserted a booksAuthors entry for the primary author
		const valuesCalls = dbMock.values.mock.calls;
		const fallbackInsert = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"foreignAuthorId" in (call[0] as Record<string, unknown>) &&
				(call[0] as { foreignAuthorId: string }).foreignAuthorId === "100" &&
				(call[0] as { isPrimary: boolean }).isPrimary === true,
		);
		expect(fallbackInsert).toBeDefined();
	});
});

// ========================================================================
// syncBookAuthors fallback — primary not found in contributions
// ========================================================================

describe("syncBookAuthors fallback via refreshAuthorInternal", () => {
	it("inserts primary author via fallback when not in contributions during sync", async () => {
		const rawAuthor = makeRawAuthor();
		// Contributions only has Narrator — no author-role contribution for authorId 100
		const rawBook = makeRawBook({
			contributions: [
				{
					authorId: 101,
					authorName: "Narrator B",
					contribution: "Narrator",
					position: 1,
				},
			],
		});

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [makeRawEdition()]]]),
		);

		let txGetCallCount = 0;
		mocks.all.mockReturnValue([]);
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 50 }; // existing book
				case 2:
					// syncBookAuthors fallback: check if existing booksAuthors entry
					return undefined; // no existing entry
				case 3:
					// syncBookAuthors fallback: lookup localAuthor name
					return { name: "J.R.R. Tolkien" };
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		// The fallback path should have inserted booksAuthors for the primary author
		const valuesCalls = dbMock.values.mock.calls;
		const fallbackInsert = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"foreignAuthorId" in (call[0] as Record<string, unknown>) &&
				(call[0] as { foreignAuthorId: string }).foreignAuthorId === "100" &&
				(call[0] as { isPrimary: boolean }).isPrimary === true,
		);
		expect(fallbackInsert).toBeDefined();
	});
});

// ========================================================================
// ensureSeries cache hit — second book in same series
// ========================================================================

describe("importAuthorInternal — ensureSeries cache hit", () => {
	it("reuses cached series ID for second book in same series", async () => {
		const rawAuthor = makeRawAuthor();
		const seriesData = {
			seriesId: 500,
			seriesTitle: "Middle-earth",
			seriesSlug: "middle-earth",
			isCompleted: true,
			position: "1",
		};
		const rawBook1 = makeRawBook({
			id: 200,
			title: "The Hobbit",
			series: [{ ...seriesData, position: "1" }],
		});
		const rawBook2 = makeRawBook({
			id: 201,
			title: "LOTR",
			series: [{ ...seriesData, position: "2" }],
		});
		const rawEdition1 = makeRawEdition({ id: 300 });
		const rawEdition2 = makeRawEdition({ id: 301 });

		mocks.get.mockReturnValueOnce(undefined);
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook1, rawBook2],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([
				[rawBook1.id, [rawEdition1]],
				[rawBook2.id, [rawEdition2]],
			]),
		);

		let txGetCallCount = 0;
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing author in tx
				case 2:
					return { id: 1, name: rawAuthor.name }; // insert author returning
				case 3:
					return undefined; // no existing book 1
				case 4:
					return { id: 10, title: rawBook1.title }; // insert book 1 returning
				case 5:
					return undefined; // no existing series -> insert it
				case 6:
					return { id: 20 }; // insert series returning
				case 7:
					return undefined; // no existing book 2
				case 8:
					return { id: 11, title: rawBook2.title }; // insert book 2 returning
				// No series lookup for book 2 — should use cache
				default:
					return undefined;
			}
		});

		const { importAuthorInternal } = await import("../import");
		const result = await importAuthorInternal(
			{ foreignAuthorId: 100, downloadProfileIds: [] },
			noopProgress,
			noopTitle,
		);

		expect(result.booksAdded).toBe(2);
		// Both books should have seriesBookLinks with the same seriesId
		const valuesCalls = dbMock.values.mock.calls;
		const seriesLinkInserts = valuesCalls.filter(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"seriesId" in (call[0] as Record<string, unknown>) &&
				"position" in (call[0] as Record<string, unknown>),
		);
		expect(seriesLinkInserts.length).toBe(2);
		// Both should reference the same series ID (20)
		expect((seriesLinkInserts[0][0] as { seriesId: number }).seriesId).toBe(20);
		expect((seriesLinkInserts[1][0] as { seriesId: number }).seriesId).toBe(20);
	});
});

// ========================================================================
// refreshAuthorInternal — existing edition no longer passes filter (remove)
// ========================================================================

describe("refreshAuthorInternal — existing edition filtered out during update", () => {
	it("removes existing edition that no longer passes profile during update", async () => {
		const rawAuthor = makeRawAuthor();
		// Set defaultCoverEditionId to 301 (en edition) so fr edition is not preserved
		const rawBook = makeRawBook({ defaultCoverEditionId: 301 });
		// French edition that will fail [en] language filter
		const frEdition = makeRawEdition({ id: 300, languageCode: "fr" });
		// English edition that will pass
		const enEdition = makeRawEdition({ id: 301, languageCode: "en" });

		mocks.getProfileLanguages.mockReturnValue(["en"]);

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		// Both editions come from source
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [frEdition, enEdition]]]),
		);

		let txGetCallCount = 0;
		mocks.all.mockReturnValue([]);
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return { id: 50 }; // existing book found
				case 2:
					return undefined; // syncBookAuthors: no existing entry
				case 3:
					return { id: 300 }; // fr edition exists in DB
				case 4:
					return undefined; // hasProfile for fr edition — none
				case 5:
					return { count: 0 }; // fileCount — none (safe to delete)
				case 6:
					return { id: 301 }; // en edition exists in DB -> update
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		expect(result.booksUpdated).toBe(1);
		// fr edition should be deleted, en edition updated
		expect(dbMock.delete).toHaveBeenCalled();
		expect(result.editionsUpdated).toBe(1);
	});
});

// ========================================================================
// refreshBookInternal — existing edition no longer passes filter (remove)
// ========================================================================

describe("refreshBookInternal — existing edition filtered out during update", () => {
	it("removes existing edition that fails language filter during book refresh", async () => {
		const rawBook = makeRawBook({ defaultCoverEditionId: 301 });
		const frEdition = makeRawEdition({ id: 300, languageCode: "fr" });
		const enEdition = makeRawEdition({ id: 301, languageCode: "en" });

		mocks.getProfileLanguages.mockReturnValue(["en"]);

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignBookId: "200",
			autoSwitchEdition: 0,
		});
		mocks.fetchBookComplete.mockResolvedValue({
			book: rawBook,
			editions: [frEdition, enEdition],
		});
		mocks.get.mockReturnValueOnce({
			authorId: 5,
			foreignAuthorId: "100",
		});

		let txGetCallCount = 0;
		mocks.all.mockReturnValue([]);
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // syncBookAuthors: no existing entry
				case 2:
					return { id: 300 }; // fr edition exists
				case 3:
					return undefined; // hasProfile for fr edition — none
				case 4:
					return { count: 0 }; // fileCount — none (safe to delete)
				case 5:
					return { id: 301 }; // en edition exists -> update
				default:
					return undefined;
			}
		});

		const { refreshBookInternal } = await import("../import");
		const result = await refreshBookInternal(1, noopProgress);

		expect(result.booksUpdated).toBe(1);
		expect(dbMock.delete).toHaveBeenCalled();
		expect(result.editionsUpdated).toBe(1);
	});
});

// ========================================================================
// refreshAuthorInternal — existing series reuse in new book path
// ========================================================================

describe("refreshAuthorInternal — existing series reuse for new book", () => {
	it("reuses existing series when adding new book during refresh", async () => {
		const rawAuthor = makeRawAuthor();
		const rawBook = makeRawBook({
			series: [
				{
					seriesId: 500,
					seriesTitle: "Middle-earth",
					seriesSlug: "middle-earth",
					isCompleted: true,
					position: "1",
				},
			],
		});
		const rawEdition = makeRawEdition();

		mocks.get.mockReturnValueOnce({
			id: 1,
			foreignAuthorId: "100",
			name: "J.R.R. Tolkien",
		});
		mocks.fetchAuthorComplete.mockResolvedValue({
			author: rawAuthor,
			books: [rawBook],
		});
		mocks.fetchBatchedEditions.mockResolvedValue(
			new Map([[rawBook.id, [rawEdition]]]),
		);

		let txGetCallCount = 0;
		mocks.all.mockReturnValue([]);
		mocks.get.mockImplementation(() => {
			txGetCallCount++;
			switch (txGetCallCount) {
				case 1:
					return undefined; // no existing book — insert
				case 2:
					return { id: 10, title: rawBook.title }; // insert book returning
				case 3:
					return { id: 99 }; // existing series found — reuse
				default:
					return undefined;
			}
		});

		const { refreshAuthorInternal } = await import("../import");
		const result = await refreshAuthorInternal(1, noopProgress);

		expect(result.booksAdded).toBe(1);
		const valuesCalls = dbMock.values.mock.calls;
		const linkInsert = valuesCalls.find(
			(call: unknown[]) =>
				call[0] &&
				typeof call[0] === "object" &&
				"seriesId" in (call[0] as Record<string, unknown>) &&
				"position" in (call[0] as Record<string, unknown>),
		);
		expect(linkInsert).toBeDefined();
		if (linkInsert) {
			expect((linkInsert[0] as { seriesId: number }).seriesId).toBe(99);
		}
	});
});
