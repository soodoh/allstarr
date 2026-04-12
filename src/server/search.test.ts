import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
	hardcoverFetch: vi.fn(),
	requireAuth: vi.fn(),
	getMetadataProfile: vi.fn(),
	getProfileLanguages: vi.fn(),
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

vi.mock("./hardcover/client", () => ({
	hardcoverFetch: (...args: unknown[]) => mocks.hardcoverFetch(...args),
}));

vi.mock("./middleware", () => ({
	requireAuth: () => mocks.requireAuth(),
}));

vi.mock("./metadata-profile", () => ({
	getMetadataProfile: () => mocks.getMetadataProfile(),
}));

vi.mock("./profile-languages", () => ({
	default: () => mocks.getProfileLanguages(),
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import {
	getHardcoverAuthorFn,
	getHardcoverBookDetailFn,
	getHardcoverBookLanguagesFn,
	searchHardcoverFn,
} from "./search";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProfile = {
	skipMissingReleaseDate: false,
	skipMissingIsbnAsin: false,
	skipCompilations: false,
	minimumPopularity: 0,
	minimumPages: 0,
};

function makeBookHit(overrides: Record<string, unknown> = {}) {
	return {
		document: {
			id: 1,
			title: "Test Book",
			slug: "test-book",
			description: "A test book",
			release_year: 2024,
			users_count: 100,
			author_names: ["Author One"],
			image: { url: "https://example.com/cover.jpg" },
			...overrides,
		},
	};
}

function makeAuthorHit(overrides: Record<string, unknown> = {}) {
	return {
		document: {
			id: 10,
			name: "Author One",
			slug: "author-one",
			bio: "A bio",
			books_count: 5,
			users_count: 200,
			image: { url: "https://example.com/author.jpg" },
			...overrides,
		},
	};
}

function makeSearchResponse(
	hits: Array<Record<string, unknown>>,
	error?: string,
) {
	return {
		search: {
			error: error || null,
			results: { hits },
		},
	};
}

/** Mock all hardcoverFetch calls to return the same data (useful for complex flows). */
function mockHardcoverFetchSequence(
	...responses: Array<Record<string, unknown> | Error>
) {
	for (const response of responses) {
		if (response instanceof Error) {
			mocks.hardcoverFetch.mockRejectedValueOnce(response);
		} else {
			mocks.hardcoverFetch.mockResolvedValueOnce(response);
		}
	}
}

function assertExists<T>(
	value: T | null | undefined,
): asserts value is NonNullable<T> {
	expect(value).toBeDefined();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireAuth.mockResolvedValue(undefined);
	mocks.getMetadataProfile.mockReturnValue(defaultProfile);
	mocks.getProfileLanguages.mockReturnValue([]);
});

// ── searchHardcoverFn ─────────────────────────────────────────────────────

describe("searchHardcoverFn", () => {
	it("rejects empty query string", () => {
		expect(() =>
			searchHardcoverFn({ data: { query: "", type: "all", limit: 20 } }),
		).toThrow();
	});

	it("rejects query shorter than 2 characters", () => {
		expect(() =>
			searchHardcoverFn({ data: { query: "a", type: "all", limit: 20 } }),
		).toThrow();
	});

	it("returns book results for type=books", async () => {
		const hit = makeBookHit();
		mockHardcoverFetchSequence(
			// 1. search response
			makeSearchResponse([hit]),
			// 2. applyBookContributors
			{ b0: [{ contributions: [{ author: { name: "Author One" } }] }] },
		);

		const result = await searchHardcoverFn({
			data: { query: "test", type: "books", limit: 20 },
		});

		expect(result.query).toBe("test");
		expect(result.type).toBe("books");
		expect(result.results).toHaveLength(1);
		expect(result.results[0].type).toBe("book");
		expect(result.results[0].title).toBe("Test Book");
		expect(result.results[0].slug).toBe("test-book");
		expect(result.results[0].coverUrl).toBe("https://example.com/cover.jpg");
		expect(result.results[0].hardcoverUrl).toBe(
			"https://hardcover.app/books/test-book",
		);
	});

	it("returns author results for type=authors", async () => {
		const hit = makeAuthorHit();
		mockHardcoverFetchSequence(
			// 1. search response
			makeSearchResponse([hit]),
			// 2. applyAuthorBookCounts
			{ a0: { aggregate: { count: 5 } } },
		);

		const result = await searchHardcoverFn({
			data: { query: "author", type: "authors", limit: 20 },
		});

		expect(result.type).toBe("authors");
		expect(result.results).toHaveLength(1);
		expect(result.results[0].type).toBe("author");
		expect(result.results[0].title).toBe("Author One");
		expect(result.results[0].hardcoverUrl).toBe(
			"https://hardcover.app/authors/author-one",
		);
	});

	it("interleaves book and author results for type=all", async () => {
		const bookHit = makeBookHit({ id: 1, users_count: 200 });
		const authorHit = makeAuthorHit();

		// Promise.all runs Book + Author in parallel. Mock calls are consumed
		// in order of invocation:
		//   1. Book search (first to call hardcoverFetch)
		//   2. Author search (started concurrently, calls hardcoverFetch next)
		//   3. Book applyBookContributors (after Book search resolves)
		//   4. Author applyAuthorBookCounts (after Author search resolves)
		mockHardcoverFetchSequence(
			makeSearchResponse([bookHit]),
			makeSearchResponse([authorHit]),
			{ b0: [{ contributions: [{ author: { name: "Author One" } }] }] },
			{ a0: { aggregate: { count: 5 } } },
		);

		const result = await searchHardcoverFn({
			data: { query: "test", type: "all", limit: 20 },
		});

		expect(result.type).toBe("all");
		expect(result.results.length).toBeGreaterThanOrEqual(2);
		const types = result.results.map((r: { type: string }) => r.type);
		expect(types).toContain("book");
		expect(types).toContain("author");
	});

	it("filters out books without authors", async () => {
		const hitNoAuthor = makeBookHit({
			id: 3,
			author_names: [],
			contributions: [],
		});
		delete (hitNoAuthor.document as Record<string, unknown>).authorName;
		delete (hitNoAuthor.document as Record<string, unknown>).author_name;

		mockHardcoverFetchSequence(makeSearchResponse([hitNoAuthor]));

		const result = await searchHardcoverFn({
			data: { query: "noauthor", type: "books", limit: 20 },
		});

		expect(result.results).toHaveLength(0);
	});

	it("filters out compilation books when profile says to skip them", async () => {
		mocks.getMetadataProfile.mockReturnValue({
			...defaultProfile,
			skipCompilations: true,
		});

		const compilationHit = makeBookHit({ id: 4, compilation: true });
		mockHardcoverFetchSequence(makeSearchResponse([compilationHit]));

		const result = await searchHardcoverFn({
			data: { query: "comp", type: "books", limit: 20 },
		});

		expect(result.results).toHaveLength(0);
	});

	it("filters by minimum popularity from metadata profile", async () => {
		mocks.getMetadataProfile.mockReturnValue({
			...defaultProfile,
			minimumPopularity: 50,
		});

		const lowPopHit = makeBookHit({
			id: 5,
			title: "Unpopular Book",
			slug: "unpopular",
			users_count: 10,
		});
		const highPopHit = makeBookHit({
			id: 6,
			title: "Popular Book",
			slug: "popular-book",
			users_count: 100,
		});

		mockHardcoverFetchSequence(
			// 1. search
			makeSearchResponse([lowPopHit, highPopHit]),
			// 2. applyBookContributors (only 1 book survives popularity filter)
			{ b0: [{ contributions: [{ author: { name: "Author" } }] }] },
		);

		const result = await searchHardcoverFn({
			data: { query: "pop", type: "books", limit: 20 },
		});

		expect(result.results).toHaveLength(1);
		expect(result.results[0].title).toBe("Popular Book");
	});

	it("filters books without release year when profile says to skip", async () => {
		mocks.getMetadataProfile.mockReturnValue({
			...defaultProfile,
			skipMissingReleaseDate: true,
		});

		const noYearHit = makeBookHit({ id: 7, release_year: undefined });
		delete (noYearHit.document as Record<string, unknown>).published_year;
		delete (noYearHit.document as Record<string, unknown>).year;
		delete (noYearHit.document as Record<string, unknown>).release_date;
		delete (noYearHit.document as Record<string, unknown>).published_date;

		mockHardcoverFetchSequence(makeSearchResponse([noYearHit]));

		const result = await searchHardcoverFn({
			data: { query: "noyear", type: "books", limit: 20 },
		});

		expect(result.results).toHaveLength(0);
	});

	it("applies language filter when profile languages are set", async () => {
		mocks.getProfileLanguages.mockReturnValue(["en"]);

		const bookHit = makeBookHit({ id: 8 });
		mockHardcoverFetchSequence(
			// 1. search (requests limit*3 when language filtering)
			makeSearchResponse([bookHit]),
			// 2. language filter
			{ books: [{ id: 8 }] },
			// 3. applyBookContributors
			{ b0: [{ contributions: [{ author: { name: "Author" } }] }] },
		);

		const result = await searchHardcoverFn({
			data: { query: "lang", type: "books", limit: 20 },
		});

		expect(result.results).toHaveLength(1);
		expect(mocks.hardcoverFetch).toHaveBeenCalledWith(
			expect.stringContaining("BookLanguageFilter"),
			expect.objectContaining({ ids: [8], langCodes: ["en"] }),
		);
	});

	it("applies ISBN/ASIN filter when profile says to skip missing", async () => {
		mocks.getMetadataProfile.mockReturnValue({
			...defaultProfile,
			skipMissingIsbnAsin: true,
		});

		const bookHit1 = makeBookHit({ id: 9 });
		const bookHit2 = makeBookHit({
			id: 10,
			title: "Book With ISBN",
			slug: "book-isbn",
		});

		mockHardcoverFetchSequence(
			// 1. search
			makeSearchResponse([bookHit1, bookHit2]),
			// 2. ISBN/ASIN filter — only book 10 matches
			{ books: [{ id: 10 }] },
			// 3. applyBookContributors
			{ b0: [{ contributions: [{ author: { name: "Author" } }] }] },
		);

		const result = await searchHardcoverFn({
			data: { query: "isbn", type: "books", limit: 20 },
		});

		expect(result.results).toHaveLength(1);
		expect(result.results[0].title).toBe("Book With ISBN");
	});

	it("applies pages filter when profile has minimum pages", async () => {
		mocks.getMetadataProfile.mockReturnValue({
			...defaultProfile,
			minimumPages: 50,
		});

		const bookHit1 = makeBookHit({ id: 11 });
		const bookHit2 = makeBookHit({
			id: 12,
			title: "Long Book",
			slug: "long-book",
		});

		mockHardcoverFetchSequence(
			// 1. search
			makeSearchResponse([bookHit1, bookHit2]),
			// 2. pages filter — only book 12 matches
			{ books: [{ id: 12 }] },
			// 3. applyBookContributors
			{ b0: [{ contributions: [{ author: { name: "Author" } }] }] },
		);

		const result = await searchHardcoverFn({
			data: { query: "pages", type: "books", limit: 20 },
		});

		expect(result.results).toHaveLength(1);
		expect(result.results[0].title).toBe("Long Book");
	});

	it("throws when Hardcover API returns an error", async () => {
		mockHardcoverFetchSequence(makeSearchResponse([], "Something went wrong"));

		await expect(
			searchHardcoverFn({
				data: { query: "error", type: "books", limit: 20 },
			}),
		).rejects.toThrow("Something went wrong");
	});

	it("returns empty results when search returns no hits", async () => {
		mockHardcoverFetchSequence(makeSearchResponse([]));

		const result = await searchHardcoverFn({
			data: { query: "nothing", type: "books", limit: 20 },
		});

		expect(result.results).toHaveLength(0);
		expect(result.total).toBe(0);
	});

	it("respects the limit parameter", async () => {
		const hits = Array.from({ length: 10 }, (_, i) =>
			makeBookHit({
				id: i + 100,
				title: `Book ${i}`,
				slug: `book-${i}`,
				users_count: 100 - i,
			}),
		);

		const contributorResponse: Record<string, unknown> = {};
		for (let i = 0; i < 10; i++) {
			contributorResponse[`b${i}`] = [
				{ contributions: [{ author: { name: "Author" } }] },
			];
		}
		mockHardcoverFetchSequence(makeSearchResponse(hits), contributorResponse);

		const result = await searchHardcoverFn({
			data: { query: "many", type: "books", limit: 3 },
		});

		expect(result.results).toHaveLength(3);
	});

	it("sorts book results by readers count", async () => {
		const hits = [
			makeBookHit({
				id: 20,
				title: "Low Readers",
				slug: "low",
				users_count: 10,
			}),
			makeBookHit({
				id: 21,
				title: "High Readers",
				slug: "high",
				users_count: 500,
			}),
			makeBookHit({
				id: 22,
				title: "Mid Readers",
				slug: "mid",
				users_count: 100,
			}),
		];

		const contributorResponse: Record<string, unknown> = {};
		for (let i = 0; i < 3; i++) {
			contributorResponse[`b${i}`] = [
				{ contributions: [{ author: { name: "Author" } }] },
			];
		}
		mockHardcoverFetchSequence(makeSearchResponse(hits), contributorResponse);

		const result = await searchHardcoverFn({
			data: { query: "sort", type: "books", limit: 20 },
		});

		expect(result.results[0].title).toBe("High Readers");
		expect(result.results[1].title).toBe("Mid Readers");
		expect(result.results[2].title).toBe("Low Readers");
	});

	it("filters out authors with zero matching books", async () => {
		const authorHit = makeAuthorHit({ slug: "zero-books" });
		mockHardcoverFetchSequence(makeSearchResponse([authorHit]), {
			a0: { aggregate: { count: 0 } },
		});

		const result = await searchHardcoverFn({
			data: { query: "empty", type: "authors", limit: 20 },
		});

		expect(result.results).toHaveLength(0);
	});

	it("updates author subtitle with filtered book count", async () => {
		const authorHit = makeAuthorHit({ slug: "prolific" });
		mockHardcoverFetchSequence(makeSearchResponse([authorHit]), {
			a0: { aggregate: { count: 42 } },
		});

		const result = await searchHardcoverFn({
			data: { query: "prolific", type: "authors", limit: 20 },
		});

		expect(result.results).toHaveLength(1);
		expect(result.results[0].subtitle).toBe("42 books");
	});

	it("uses singular 'book' for count of 1", async () => {
		const authorHit = makeAuthorHit({ slug: "one-book" });
		mockHardcoverFetchSequence(makeSearchResponse([authorHit]), {
			a0: { aggregate: { count: 1 } },
		});

		const result = await searchHardcoverFn({
			data: { query: "one", type: "authors", limit: 20 },
		});

		expect(result.results[0].subtitle).toBe("1 book");
	});

	it("defaults type to 'all' and limit to 20", async () => {
		// Promise.all: Book search, Author search (both empty)
		mockHardcoverFetchSequence(makeSearchResponse([]), makeSearchResponse([]));

		const result = await searchHardcoverFn({
			data: { query: "defaults" },
		});

		expect(result.type).toBe("all");
		expect(result.results).toHaveLength(0);
	});

	it("applies book contributors to update subtitles", async () => {
		const bookHit = makeBookHit({ id: 30 });
		mockHardcoverFetchSequence(makeSearchResponse([bookHit]), {
			b0: [
				{
					contributions: [
						{ author: { name: "First Author" } },
						{ author: { name: "Second Author" } },
					],
				},
			],
		});

		const result = await searchHardcoverFn({
			data: { query: "contrib", type: "books", limit: 20 },
		});

		expect(result.results[0].subtitle).toBe("First Author, Second Author");
	});
});

// ── getHardcoverAuthorFn ──────────────────────────────────────────────────

describe("getHardcoverAuthorFn", () => {
	it("rejects foreignAuthorId of zero", () => {
		expect(() =>
			getHardcoverAuthorFn({
				data: { foreignAuthorId: 0, page: 1, pageSize: 25 },
			}),
		).toThrow();
	});

	it("returns author detail with books and languages", async () => {
		mockHardcoverFetchSequence(
			// 1. authorDetailsMetaQuery
			{
				authors: [
					{
						id: 42,
						name: "Jane Author",
						slug: "jane-author",
						bio: "A great writer",
						books_count: 10,
						born_year: 1970,
						death_year: null,
						image: { url: "https://example.com/jane.jpg" },
					},
				],
				editions: [
					{
						language: {
							code2: "en",
							code3: "eng",
							language: "English",
						},
					},
					{
						language: {
							code2: "fr",
							code3: "fra",
							language: "French",
						},
					},
				],
			},
			// 2. buildAuthorBooksPageQuery
			{
				books_aggregate: { aggregate: { count: 3 } },
				books: [
					{
						id: 101,
						title: "Book One",
						slug: "book-one",
						description: "Desc",
						release_date: "2020-01-01",
						release_year: 2020,
						rating: 4.2,
						ratings_count: 500,
						users_count: 1000,
						image: { url: "https://example.com/b1.jpg" },
						contributions: [{ contribution: null }],
						all_contributions: [{ author: { name: "Jane Author" } }],
						editions: [
							{
								language: {
									code2: "en",
									code3: "eng",
									language: "English",
								},
							},
						],
						book_series: [
							{
								position: 1,
								series: { id: 5, name: "Great Series" },
							},
						],
					},
				],
			},
		);

		const result = await getHardcoverAuthorFn({
			data: { foreignAuthorId: 42 },
		});

		expect(result.name).toBe("Jane Author");
		expect(result.slug).toBe("jane-author");
		expect(result.bio).toBe("A great writer");
		expect(result.bornYear).toBe(1970);
		expect(result.imageUrl).toBe("https://example.com/jane.jpg");
		expect(result.hardcoverUrl).toBe(
			"https://hardcover.app/authors/jane-author",
		);
		expect(result.totalBooks).toBe(3);
		expect(result.books).toHaveLength(1);
		expect(result.books[0].title).toBe("Book One");
		expect(result.books[0].series).toHaveLength(1);
		expect(result.books[0].series[0].title).toBe("Great Series");
		expect(result.books[0].series[0].position).toBe("1");
		expect(result.languages).toHaveLength(3); // "all" + en + fr
		expect(result.languages[0]).toEqual({
			code: "all",
			name: "All Languages",
		});
		expect(result.selectedLanguage).toBe("en");
		expect(result.sortBy).toBe("readers");
		expect(result.sortDir).toBe("desc");
	});

	it("throws when author is not found", async () => {
		mockHardcoverFetchSequence({
			authors: [],
			editions: [],
		});

		await expect(
			getHardcoverAuthorFn({
				data: { foreignAuthorId: 999 },
			}),
		).rejects.toThrow("Author not found on Hardcover.");
	});

	it("clamps page when it exceeds total pages", async () => {
		mockHardcoverFetchSequence(
			// 1. meta
			{
				authors: [
					{
						id: 50,
						name: "Small Author",
						slug: "small-author",
						bio: null,
						books_count: 1,
						born_year: null,
						death_year: null,
						image: null,
					},
				],
				editions: [
					{
						language: {
							code2: "en",
							code3: "eng",
							language: "English",
						},
					},
				],
			},
			// 2. fetchAuthorBooksPage for page=100 — 1 total book, empty page
			{
				books_aggregate: { aggregate: { count: 1 } },
				books: [],
			},
			// 3. fetchAuthorBooksPage for clamped page=1
			{
				books_aggregate: { aggregate: { count: 1 } },
				books: [
					{
						id: 200,
						title: "Only Book",
						slug: "only-book",
						description: null,
						release_date: null,
						release_year: null,
						rating: null,
						ratings_count: null,
						users_count: null,
						image: null,
						contributions: [],
						all_contributions: [],
						editions: [],
						book_series: [],
					},
				],
			},
		);

		const result = await getHardcoverAuthorFn({
			data: {
				foreignAuthorId: 50,
				page: 100,
				pageSize: 25,
			},
		});

		expect(result.page).toBe(1);
		expect(result.totalPages).toBe(1);
		expect(result.books).toHaveLength(1);
	});

	it("passes sort parameters through to the query", async () => {
		mockHardcoverFetchSequence(
			{
				authors: [
					{
						id: 60,
						name: "Sorted Author",
						slug: "sorted-author",
						bio: null,
						books_count: 2,
						born_year: null,
						death_year: null,
						image: null,
					},
				],
				editions: [],
			},
			{
				books_aggregate: { aggregate: { count: 0 } },
				books: [],
			},
		);

		const result = await getHardcoverAuthorFn({
			data: {
				foreignAuthorId: 60,
				sortBy: "title",
				sortDir: "asc",
			},
		});

		expect(result.sortBy).toBe("title");
		expect(result.sortDir).toBe("asc");
	});

	it("defaults English when language map is empty", async () => {
		mockHardcoverFetchSequence(
			{
				authors: [
					{
						id: 70,
						name: "No Lang Author",
						slug: "no-lang-author",
						bio: null,
						books_count: 0,
						born_year: null,
						death_year: null,
						image: null,
					},
				],
				editions: [],
			},
			{
				books_aggregate: { aggregate: { count: 0 } },
				books: [],
			},
		);

		const result = await getHardcoverAuthorFn({
			data: { foreignAuthorId: 70 },
		});

		expect(result.selectedLanguage).toBe("en");
		expect(result.languages).toContainEqual({
			code: "all",
			name: "All Languages",
		});
		expect(result.languages).toContainEqual({
			code: "en",
			name: "English",
		});
	});

	it("selects 'all' language when requested", async () => {
		mockHardcoverFetchSequence(
			{
				authors: [
					{
						id: 80,
						name: "Multi Lang",
						slug: "multi-lang",
						bio: null,
						books_count: 5,
						born_year: null,
						death_year: null,
						image: null,
					},
				],
				editions: [
					{
						language: {
							code2: "en",
							code3: "eng",
							language: "English",
						},
					},
				],
			},
			{
				books_aggregate: { aggregate: { count: 5 } },
				books: [],
			},
		);

		const result = await getHardcoverAuthorFn({
			data: {
				foreignAuthorId: 80,
				language: "all",
			},
		});

		expect(result.selectedLanguage).toBe("all");
	});
});

// ── getHardcoverBookLanguagesFn ───────────────────────────────────────────

describe("getHardcoverBookLanguagesFn", () => {
	it("rejects foreignBookId of zero", () => {
		expect(() =>
			getHardcoverBookLanguagesFn({
				data: { foreignBookId: 0 },
			}),
		).toThrow();
	});

	it("returns aggregated language options sorted by readers", async () => {
		mockHardcoverFetchSequence({
			editions: [
				{
					users_count: 100,
					language: { code2: "en", language: "English" },
				},
				{
					users_count: 200,
					language: { code2: "en", language: "English" },
				},
				{
					users_count: 50,
					language: { code2: "fr", language: "French" },
				},
			],
		});

		const result = await getHardcoverBookLanguagesFn({
			data: { foreignBookId: 1 },
		});

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			name: "English",
			code: "en",
			readers: 300,
		});
		expect(result[1]).toEqual({
			name: "French",
			code: "fr",
			readers: 50,
		});
	});

	it("returns empty array when fetch fails", async () => {
		mocks.hardcoverFetch.mockRejectedValueOnce(new Error("network"));

		const result = await getHardcoverBookLanguagesFn({
			data: { foreignBookId: 1 },
		});

		expect(result).toEqual([]);
	});

	it("skips editions without language data", async () => {
		mockHardcoverFetchSequence({
			editions: [
				{ users_count: 100, language: null },
				{
					users_count: 50,
					language: { code2: "de", language: "German" },
				},
			],
		});

		const result = await getHardcoverBookLanguagesFn({
			data: { foreignBookId: 2 },
		});

		expect(result).toHaveLength(1);
		expect(result[0].code).toBe("de");
	});
});

// ── getHardcoverBookDetailFn ──────────────────────────────────────────────

describe("getHardcoverBookDetailFn", () => {
	it("rejects negative foreignBookId", () => {
		expect(() =>
			getHardcoverBookDetailFn({
				data: { foreignBookId: -1 },
			}),
		).toThrow();
	});

	it("returns full book detail with series and contributors", async () => {
		mockHardcoverFetchSequence({
			books: [
				{
					id: 500,
					title: "Epic Novel",
					slug: "epic-novel",
					description: "An epic story",
					release_date: "2023-05-15",
					release_year: 2023,
					rating: 4.5,
					ratings_count: 1200,
					users_count: 5000,
					image: { url: "https://example.com/epic.jpg" },
					book_series: [
						{
							position: 3,
							series: { id: 10, name: "Saga" },
						},
					],
					contributions: [
						{ author: { id: 1, name: "Writer One" } },
						{ author: { id: 2, name: "Writer Two" } },
					],
				},
			],
		});

		const result = await getHardcoverBookDetailFn({
			data: { foreignBookId: 500 },
		});

		assertExists(result);
		expect(result.id).toBe("500");
		expect(result.title).toBe("Epic Novel");
		expect(result.slug).toBe("epic-novel");
		expect(result.description).toBe("An epic story");
		expect(result.releaseYear).toBe(2023);
		expect(result.rating).toBe(4.5);
		expect(result.coverUrl).toBe("https://example.com/epic.jpg");
		expect(result.series).toHaveLength(1);
		expect(result.series[0]).toEqual({
			id: "10",
			title: "Saga",
			position: "3",
		});
		expect(result.contributors).toHaveLength(2);
		expect(result.contributors[0]).toEqual({ id: "1", name: "Writer One" });
		expect(result.contributors[1]).toEqual({ id: "2", name: "Writer Two" });
	});

	it("returns undefined when no book found", async () => {
		mockHardcoverFetchSequence({ books: [] });

		const result = await getHardcoverBookDetailFn({
			data: { foreignBookId: 999 },
		});

		expect(result).toBeUndefined();
	});

	it("returns undefined when fetch fails", async () => {
		mocks.hardcoverFetch.mockRejectedValueOnce(new Error("timeout"));

		const result = await getHardcoverBookDetailFn({
			data: { foreignBookId: 1 },
		});

		expect(result).toBeUndefined();
	});

	it("returns book without series when none exist", async () => {
		mockHardcoverFetchSequence({
			books: [
				{
					id: 600,
					title: "Standalone",
					slug: "standalone",
					description: null,
					release_date: null,
					release_year: null,
					rating: null,
					ratings_count: null,
					users_count: null,
					image: null,
					book_series: [],
					contributions: [{ author: { id: 1, name: "Solo Author" } }],
				},
			],
		});

		const result = await getHardcoverBookDetailFn({
			data: { foreignBookId: 600 },
		});

		assertExists(result);
		expect(result.series).toHaveLength(0);
		expect(result.coverUrl).toBeNull();
	});
});
