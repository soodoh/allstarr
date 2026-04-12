import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	hardcoverFetch: vi.fn(),
}));

vi.mock("./client", () => ({
	hardcoverFetch: mocks.hardcoverFetch,
}));

vi.mock("./constants", () => ({
	AUTHOR_ROLE_FILTER: "_or: [{ contribution: { _is_null: true } }]",
}));

import {
	fetchAuthorComplete,
	fetchBatchedEditions,
	fetchBookComplete,
	fetchSeriesComplete,
} from "./import-queries";

beforeEach(() => {
	mocks.hardcoverFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Helpers: build API response payloads matching GraphQL shapes
// ---------------------------------------------------------------------------

function makeAuthorRecord(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: "Brandon Sanderson",
		slug: "brandon-sanderson",
		bio: "Fantasy author",
		born_year: 1975,
		death_year: null,
		image: { url: "https://example.com/author.jpg" },
		...overrides,
	};
}

function makeBookRecord(overrides: Record<string, unknown> = {}) {
	return {
		id: 100,
		title: "Mistborn",
		slug: "mistborn",
		description: "A fantasy novel",
		release_date: "2006-07-17",
		release_year: 2006,
		rating: 4.5,
		ratings_count: 10000,
		users_count: 5000,
		compilation: false,
		canonical_id: null,
		default_cover_edition_id: 200,
		image: { url: "https://example.com/book.jpg" },
		contributions: [
			{
				contribution: null,
				author: {
					id: 1,
					name: "Brandon Sanderson",
					slug: "brandon-sanderson",
					image: { url: "https://example.com/author.jpg" },
				},
			},
		],
		book_series: [
			{
				position: 1,
				series: {
					id: 10,
					name: "Mistborn Era 1",
					slug: "mistborn-era-1",
					is_completed: true,
				},
			},
		],
		...overrides,
	};
}

function makeEditionRecord(overrides: Record<string, unknown> = {}) {
	return {
		id: 200,
		title: "Mistborn: The Final Empire",
		isbn_10: "0765311785",
		isbn_13: "9780765311788",
		asin: "B001QKBHG4",
		pages: 541,
		audio_seconds: 86400,
		release_date: "2006-07-17",
		users_count: 3000,
		score: 95,
		cached_contributors: [
			{
				author: { id: 1, name: "Brandon Sanderson" },
				contribution: null,
			},
		],
		image: { url: "https://example.com/edition.jpg" },
		language: { code2: "en", language: "English" },
		country: { name: "United States" },
		publisher: { name: "Tor Books" },
		reading_format: { format: "Read" },
		edition_information: "First Edition",
		...overrides,
	};
}

function makeSeriesRecord(
	overrides: Record<string, unknown> = {},
	bookOverrides: Record<string, unknown>[] = [],
) {
	return {
		id: 10,
		name: "Mistborn Era 1",
		slug: "mistborn-era-1",
		is_completed: true,
		book_series:
			bookOverrides.length > 0
				? bookOverrides
				: [
						{
							position: 1,
							compilation: false,
							book: {
								id: 100,
								title: "The Final Empire",
								slug: "the-final-empire",
								release_date: "2006-07-17",
								release_year: 2006,
								rating: 4.5,
								users_count: 5000,
								default_cover_edition_id: 200,
								image: { url: "https://example.com/book1.jpg" },
								contributions: [
									{
										author: {
											id: 2,
											name: "Brandon Sanderson",
											slug: "brandon-sanderson",
											image: { url: "https://example.com/author.jpg" },
										},
									},
								],
								editions: [
									{
										id: 200,
										title: "The Final Empire",
										isbn_10: "0765311785",
										isbn_13: "9780765311788",
										asin: null,
										pages: 541,
										audio_seconds: null,
										release_date: "2006-07-17",
										users_count: 3000,
										score: 95,
										image: { url: "https://example.com/ed.jpg" },
										language: { code2: "en" },
										reading_format: { format: "Read" },
									},
								],
							},
						},
						{
							position: 2,
							compilation: false,
							book: {
								id: 101,
								title: "The Well of Ascension",
								slug: "the-well-of-ascension",
								release_date: "2007-08-21",
								release_year: 2007,
								rating: 4.3,
								users_count: 4000,
								default_cover_edition_id: 201,
								image: { url: "https://example.com/book2.jpg" },
								contributions: [
									{
										author: {
											id: 2,
											name: "Brandon Sanderson",
											slug: "brandon-sanderson",
											image: null,
										},
									},
								],
								editions: [],
							},
						},
					],
		...overrides,
	};
}

function assertExists<T>(
	value: T | null | undefined,
): asserts value is NonNullable<T> {
	expect(value).toBeDefined();
}

// ---------------------------------------------------------------------------
// fetchAuthorComplete
// ---------------------------------------------------------------------------

describe("fetchAuthorComplete", () => {
	it("parses author metadata and books from a single page", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			authors: [makeAuthorRecord()],
			books: [makeBookRecord()],
			books_aggregate: { aggregate: { count: 1 } },
		});

		const result = await fetchAuthorComplete(1);

		expect(result.author).toStrictEqual({
			id: 1,
			name: "Brandon Sanderson",
			slug: "brandon-sanderson",
			bio: "Fantasy author",
			bornYear: 1975,
			deathYear: null,
			imageUrl: "https://example.com/author.jpg",
		});

		expect(result.books).toHaveLength(1);
		expect(result.books[0].id).toBe(100);
		expect(result.books[0].title).toBe("Mistborn");
		expect(result.books[0].slug).toBe("mistborn");
		expect(result.books[0].isCompilation).toBe(false);
		expect(result.books[0].canonicalId).toBeNull();
		expect(result.books[0].defaultCoverEditionId).toBe(200);
		expect(result.books[0].coverUrl).toBe("https://example.com/book.jpg");
	});

	it("parses book contributions correctly", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			authors: [makeAuthorRecord()],
			books: [
				makeBookRecord({
					contributions: [
						{
							contribution: null,
							author: {
								id: 1,
								name: "Brandon Sanderson",
								slug: "brandon-sanderson",
								image: { url: "https://example.com/a1.jpg" },
							},
						},
						{
							contribution: "Narrator",
							author: {
								id: 2,
								name: "Michael Kramer",
								slug: "michael-kramer",
								image: null,
							},
						},
					],
				}),
			],
			books_aggregate: { aggregate: { count: 1 } },
		});

		const result = await fetchAuthorComplete(1);

		expect(result.books[0].contributions).toHaveLength(2);
		expect(result.books[0].contributions[0]).toStrictEqual({
			authorId: 1,
			authorName: "Brandon Sanderson",
			authorSlug: "brandon-sanderson",
			authorImageUrl: "https://example.com/a1.jpg",
			contribution: null,
			position: 0,
		});
		expect(result.books[0].contributions[1]).toStrictEqual({
			authorId: 2,
			authorName: "Michael Kramer",
			authorSlug: "michael-kramer",
			authorImageUrl: null,
			contribution: "Narrator",
			position: 1,
		});
	});

	it("parses book series entries correctly", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			authors: [makeAuthorRecord()],
			books: [makeBookRecord()],
			books_aggregate: { aggregate: { count: 1 } },
		});

		const result = await fetchAuthorComplete(1);

		expect(result.books[0].series).toHaveLength(1);
		expect(result.books[0].series[0]).toStrictEqual({
			seriesId: 10,
			seriesTitle: "Mistborn Era 1",
			seriesSlug: "mistborn-era-1",
			isCompleted: true,
			position: "1",
		});
	});

	it("throws when author is not found", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			authors: [],
			books: [],
			books_aggregate: { aggregate: { count: 0 } },
		});

		await expect(fetchAuthorComplete(999)).rejects.toThrow(
			"Author not found on Hardcover.",
		);
	});

	it("paginates when there are more books than BATCH_SIZE", async () => {
		// First page returns 500 books (BATCH_SIZE), total = 600
		const firstPageBooks = Array.from({ length: 500 }, (_, i) =>
			makeBookRecord({ id: i + 1, title: `Book ${i + 1}` }),
		);
		const secondPageBooks = Array.from({ length: 100 }, (_, i) =>
			makeBookRecord({ id: 501 + i, title: `Book ${501 + i}` }),
		);

		mocks.hardcoverFetch
			.mockResolvedValueOnce({
				authors: [makeAuthorRecord()],
				books: firstPageBooks,
				books_aggregate: { aggregate: { count: 600 } },
			})
			.mockResolvedValueOnce({
				books: secondPageBooks,
			});

		const result = await fetchAuthorComplete(1);

		expect(result.books).toHaveLength(600);
		expect(mocks.hardcoverFetch).toHaveBeenCalledTimes(2);
	});

	it("stops paginating early when a page returns fewer books than BATCH_SIZE", async () => {
		const firstPageBooks = Array.from({ length: 500 }, (_, i) =>
			makeBookRecord({ id: i + 1, title: `Book ${i + 1}` }),
		);
		// Second page returns only 50 books (less than 500)
		const secondPageBooks = Array.from({ length: 50 }, (_, i) =>
			makeBookRecord({ id: 501 + i, title: `Book ${501 + i}` }),
		);

		mocks.hardcoverFetch
			.mockResolvedValueOnce({
				authors: [makeAuthorRecord()],
				books: firstPageBooks,
				books_aggregate: { aggregate: { count: 1500 } },
			})
			.mockResolvedValueOnce({
				books: secondPageBooks,
			});

		const result = await fetchAuthorComplete(1);

		expect(result.books).toHaveLength(550);
		// Should stop after 2 calls even though total says 1500
		expect(mocks.hardcoverFetch).toHaveBeenCalledTimes(2);
	});

	it("skips books with missing id or title", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			authors: [makeAuthorRecord()],
			books: [
				makeBookRecord({ id: null, title: "No ID" }),
				makeBookRecord({ id: 2, title: null }),
				makeBookRecord({ id: 3, title: "Valid Book" }),
			],
			books_aggregate: { aggregate: { count: 3 } },
		});

		const result = await fetchAuthorComplete(1);

		expect(result.books).toHaveLength(1);
		expect(result.books[0].title).toBe("Valid Book");
	});

	it("handles compilation flag correctly", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			authors: [makeAuthorRecord()],
			books: [makeBookRecord({ compilation: true })],
			books_aggregate: { aggregate: { count: 1 } },
		});

		const result = await fetchAuthorComplete(1);

		expect(result.books[0].isCompilation).toBe(true);
	});

	it("handles books with no contributions or series", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			authors: [makeAuthorRecord()],
			books: [
				makeBookRecord({
					contributions: [],
					book_series: [],
				}),
			],
			books_aggregate: { aggregate: { count: 1 } },
		});

		const result = await fetchAuthorComplete(1);

		expect(result.books[0].contributions).toEqual([]);
		expect(result.books[0].series).toEqual([]);
	});

	it("skips series entries with missing series data", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			authors: [makeAuthorRecord()],
			books: [
				makeBookRecord({
					book_series: [
						{ position: 1, series: null },
						{ position: 2, series: { id: null, name: "No ID Series" } },
						{
							position: 3,
							series: {
								id: 10,
								name: "Valid Series",
								slug: "valid-series",
								is_completed: false,
							},
						},
					],
				}),
			],
			books_aggregate: { aggregate: { count: 1 } },
		});

		const result = await fetchAuthorComplete(1);

		expect(result.books[0].series).toHaveLength(1);
		expect(result.books[0].series[0].seriesTitle).toBe("Valid Series");
	});

	it("defaults author fields when author record has missing fields", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			authors: [{ id: 5 }],
			books: [],
			books_aggregate: { aggregate: { count: 0 } },
		});

		const result = await fetchAuthorComplete(5);

		expect(result.author).toStrictEqual({
			id: 5,
			name: "",
			slug: null,
			bio: null,
			bornYear: null,
			deathYear: null,
			imageUrl: null,
		});
	});

	it("falls back to authorId when author record has no id", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			authors: [{ name: "Unknown" }],
			books: [],
			books_aggregate: { aggregate: { count: 0 } },
		});

		const result = await fetchAuthorComplete(42);

		expect(result.author.id).toBe(42);
	});

	it("handles contributions with missing author records", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			authors: [makeAuthorRecord()],
			books: [
				makeBookRecord({
					contributions: [
						{ contribution: "Author", author: null },
						{ contribution: null, author: undefined },
					],
				}),
			],
			books_aggregate: { aggregate: { count: 1 } },
		});

		const result = await fetchAuthorComplete(1);

		expect(result.books[0].contributions).toHaveLength(2);
		expect(result.books[0].contributions[0].authorId).toBe(0);
		expect(result.books[0].contributions[0].authorName).toBe("");
		expect(result.books[0].contributions[0].authorSlug).toBeNull();
	});

	it("handles missing books_aggregate gracefully", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			authors: [makeAuthorRecord()],
			books: [makeBookRecord()],
			books_aggregate: null,
		});

		const result = await fetchAuthorComplete(1);

		// totalBooks defaults to 0, so no pagination
		expect(result.books).toHaveLength(1);
		expect(mocks.hardcoverFetch).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// fetchSeriesComplete
// ---------------------------------------------------------------------------

describe("fetchSeriesComplete", () => {
	it("returns empty array for empty seriesIds", async () => {
		const result = await fetchSeriesComplete([], ["en"], 1);

		expect(result).toEqual([]);
		expect(mocks.hardcoverFetch).not.toHaveBeenCalled();
	});

	it("parses series with books and editions", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [makeSeriesRecord()],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(10);
		expect(result[0].title).toBe("Mistborn Era 1");
		expect(result[0].slug).toBe("mistborn-era-1");
		expect(result[0].isCompleted).toBe(true);
		expect(result[0].books).toHaveLength(2);
	});

	it("parses series book fields correctly", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [makeSeriesRecord()],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);
		const book = result[0].books[0];

		expect(book.bookId).toBe(100);
		expect(book.bookTitle).toBe("The Final Empire");
		expect(book.bookSlug).toBe("the-final-empire");
		expect(book.position).toBe("1");
		expect(book.isCompilation).toBe(false);
		expect(book.releaseDate).toBe("2006-07-17");
		expect(book.releaseYear).toBe(2006);
		expect(book.rating).toBe(4.5);
		expect(book.usersCount).toBe(5000);
		expect(book.coverUrl).toBe("https://example.com/book1.jpg");
		expect(book.defaultCoverEditionId).toBe(200);
	});

	it("parses series book editions correctly", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [makeSeriesRecord()],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);
		const edition = result[0].books[0].editions[0];

		expect(edition.id).toBe(200);
		expect(edition.title).toBe("The Final Empire");
		expect(edition.isbn10).toBe("0765311785");
		expect(edition.isbn13).toBe("9780765311788");
		expect(edition.asin).toBeNull();
		expect(edition.format).toBe("Physical Book"); // "Read" maps to "Physical Book"
		expect(edition.pageCount).toBe(541);
		expect(edition.audioLength).toBeNull();
		expect(edition.usersCount).toBe(3000);
		expect(edition.score).toBe(95);
		expect(edition.languageCode).toBe("en");
		expect(edition.coverUrl).toBe("https://example.com/ed.jpg");
		expect(edition.isDefaultCover).toBe(true);
	});

	it("extracts primary author from series book", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [makeSeriesRecord()],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);
		const book = result[0].books[0];

		expect(book.authorId).toBe(2);
		expect(book.authorName).toBe("Brandon Sanderson");
		expect(book.authorSlug).toBe("brandon-sanderson");
		expect(book.authorImageUrl).toBe("https://example.com/author.jpg");
	});

	it("handles book with no contributions", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				makeSeriesRecord({}, [
					{
						position: 1,
						compilation: false,
						book: {
							id: 100,
							title: "Orphan Book",
							slug: "orphan-book",
							contributions: [],
							editions: [],
							image: null,
						},
					},
				]),
			],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);

		expect(result[0].books[0].authorId).toBeNull();
		expect(result[0].books[0].authorName).toBeNull();
	});

	it("skips series entries with missing id or title", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				{ id: null, name: "No ID", book_series: [] },
				{ id: 11, name: null, book_series: [] },
				{
					id: 12,
					name: "Valid",
					slug: "valid",
					is_completed: false,
					book_series: [],
				},
			],
		});

		const result = await fetchSeriesComplete([10, 11, 12], ["en"], 1);

		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("Valid");
	});

	it("deduplicates books by position", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				makeSeriesRecord({}, [
					{
						position: 1,
						compilation: false,
						book: {
							id: 100,
							title: "Book A",
							slug: "book-a",
							contributions: [],
							editions: [],
							image: null,
						},
					},
					{
						position: 1,
						compilation: false,
						book: {
							id: 101,
							title: "Book A Duplicate",
							slug: "book-a-dup",
							contributions: [],
							editions: [],
							image: null,
						},
					},
				]),
			],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);

		// Second entry with same position should be skipped
		expect(result[0].books).toHaveLength(1);
		expect(result[0].books[0].bookTitle).toBe("Book A");
	});

	it("skips entries with undefined position", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				makeSeriesRecord({}, [
					{
						compilation: false,
						book: {
							id: 100,
							title: "No Position",
							slug: "no-position",
							contributions: [],
							editions: [],
							image: null,
						},
					},
				]),
			],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);

		expect(result[0].books).toHaveLength(0);
	});

	it("skips entries with null book record", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				makeSeriesRecord({}, [{ position: 1, compilation: false, book: null }]),
			],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);

		expect(result[0].books).toHaveLength(0);
	});

	it("skips entries where book has no id or title", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				makeSeriesRecord({}, [
					{
						position: 1,
						compilation: false,
						book: { id: null, title: "No ID", contributions: [], editions: [] },
					},
					{
						position: 2,
						compilation: false,
						book: { id: 50, title: null, contributions: [], editions: [] },
					},
				]),
			],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);

		expect(result[0].books).toHaveLength(0);
	});

	it("filters partial editions (fractional positions matching integer parent)", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				makeSeriesRecord({}, [
					{
						position: 1,
						compilation: false,
						book: {
							id: 100,
							title: "The Final Empire",
							slug: "the-final-empire",
							contributions: [],
							editions: [],
							image: null,
						},
					},
					{
						// 1.5 position — title starts with parent title, should be filtered
						position: 1.5,
						compilation: false,
						book: {
							id: 101,
							title: "The Final Empire: Part 1",
							slug: "the-final-empire-part-1",
							contributions: [],
							editions: [],
							image: null,
						},
					},
					{
						position: 2,
						compilation: false,
						book: {
							id: 102,
							title: "The Well of Ascension",
							slug: "well-of-ascension",
							contributions: [],
							editions: [],
							image: null,
						},
					},
				]),
			],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);

		expect(result[0].books).toHaveLength(2);
		expect(result[0].books.map((b) => b.bookTitle)).toEqual([
			"The Final Empire",
			"The Well of Ascension",
		]);
	});

	it("keeps fractional positions that do not match parent title", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				makeSeriesRecord({}, [
					{
						position: 1,
						compilation: false,
						book: {
							id: 100,
							title: "The Final Empire",
							slug: "the-final-empire",
							contributions: [],
							editions: [],
							image: null,
						},
					},
					{
						position: 1.5,
						compilation: false,
						book: {
							id: 101,
							title: "Secret History",
							slug: "secret-history",
							contributions: [],
							editions: [],
							image: null,
						},
					},
				]),
			],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);

		expect(result[0].books).toHaveLength(2);
	});

	it("keeps fractional positions when no integer parent exists", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				makeSeriesRecord({}, [
					{
						position: 0.5,
						compilation: false,
						book: {
							id: 100,
							title: "Prequel Story",
							slug: "prequel-story",
							contributions: [],
							editions: [],
							image: null,
						},
					},
				]),
			],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);

		expect(result[0].books).toHaveLength(1);
	});

	it("maps edition format display names", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				makeSeriesRecord({}, [
					{
						position: 1,
						compilation: false,
						book: {
							id: 100,
							title: "Book",
							slug: "book",
							contributions: [],
							default_cover_edition_id: null,
							image: null,
							editions: [
								{
									id: 1,
									title: "Ed 1",
									reading_format: { format: "Read" },
									language: { code2: "en" },
									image: null,
								},
								{
									id: 2,
									title: "Ed 2",
									reading_format: { format: "Listened" },
									language: { code2: "en" },
									image: null,
								},
								{
									id: 3,
									title: "Ed 3",
									reading_format: { format: "Ebook" },
									language: { code2: "en" },
									image: null,
								},
								{
									id: 4,
									title: "Ed 4",
									reading_format: { format: "SomeOther" },
									language: { code2: "en" },
									image: null,
								},
								{
									id: 5,
									title: "Ed 5",
									reading_format: null,
									language: { code2: "en" },
									image: null,
								},
							],
						},
					},
				]),
			],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);
		const editions = result[0].books[0].editions;

		expect(editions[0].format).toBe("Physical Book");
		expect(editions[1].format).toBe("Audiobook");
		expect(editions[2].format).toBe("E-Book");
		expect(editions[3].format).toBe("SomeOther");
		expect(editions[4].format).toBeNull();
	});

	it("marks isDefaultCover correctly on editions", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				makeSeriesRecord({}, [
					{
						position: 1,
						compilation: false,
						book: {
							id: 100,
							title: "Book",
							slug: "book",
							contributions: [],
							default_cover_edition_id: 202,
							image: null,
							editions: [
								{
									id: 201,
									title: "Not Default",
									image: null,
									language: { code2: "en" },
								},
								{
									id: 202,
									title: "Default Cover",
									image: null,
									language: { code2: "en" },
								},
							],
						},
					},
				]),
			],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);
		const editions = result[0].books[0].editions;

		expect(editions[0].isDefaultCover).toBe(false);
		expect(editions[1].isDefaultCover).toBe(true);
	});

	it("skips editions with no id", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				makeSeriesRecord({}, [
					{
						position: 1,
						compilation: false,
						book: {
							id: 100,
							title: "Book",
							slug: "book",
							contributions: [],
							default_cover_edition_id: null,
							image: null,
							editions: [
								{ id: null, title: "No ID Edition", image: null },
								{
									id: 300,
									title: "Valid Edition",
									image: null,
									language: { code2: "en" },
								},
							],
						},
					},
				]),
			],
		});

		const result = await fetchSeriesComplete([10], ["en"], 1);

		expect(result[0].books[0].editions).toHaveLength(1);
		expect(result[0].books[0].editions[0].id).toBe(300);
	});

	it("parses multiple series in one call", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			series: [
				makeSeriesRecord({ id: 10, name: "Series A" }),
				makeSeriesRecord({ id: 20, name: "Series B" }),
			],
		});

		const result = await fetchSeriesComplete([10, 20], ["en"], 1);

		expect(result).toHaveLength(2);
		expect(result[0].title).toBe("Series A");
		expect(result[1].title).toBe("Series B");
	});
});

// ---------------------------------------------------------------------------
// fetchBatchedEditions
// ---------------------------------------------------------------------------

describe("fetchBatchedEditions", () => {
	it("returns empty map for empty bookIds", async () => {
		const result = await fetchBatchedEditions([]);

		expect(result).toBeInstanceOf(Map);
		expect(result.size).toBe(0);
		expect(mocks.hardcoverFetch).not.toHaveBeenCalled();
	});

	it("fetches editions for a small batch of books", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			b0: [makeEditionRecord()],
			b1: [makeEditionRecord({ id: 201, title: "Another Edition" })],
		});

		const result = await fetchBatchedEditions([100, 101]);

		expect(result.size).toBe(2);
		expect(result.get(100)).toHaveLength(1);
		expect(result.get(101)).toHaveLength(1);
	});

	it("parses edition fields correctly", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			b0: [makeEditionRecord()],
		});

		const result = await fetchBatchedEditions([100]);
		const editions = result.get(100);
		assertExists(editions);
		const edition = editions[0];

		expect(edition.id).toBe(200);
		expect(edition.bookId).toBe(100);
		expect(edition.title).toBe("Mistborn: The Final Empire");
		expect(edition.isbn10).toBe("0765311785");
		expect(edition.isbn13).toBe("9780765311788");
		expect(edition.asin).toBe("B001QKBHG4");
		expect(edition.format).toBe("Physical Book"); // "Read" -> "Physical Book"
		expect(edition.pageCount).toBe(541);
		expect(edition.audioLength).toBe(86400);
		expect(edition.publisher).toBe("Tor Books");
		expect(edition.editionInformation).toBe("First Edition");
		expect(edition.releaseDate).toBe("2006-07-17");
		expect(edition.language).toBe("English");
		expect(edition.languageCode).toBe("en");
		expect(edition.country).toBe("United States");
		expect(edition.usersCount).toBe(3000);
		expect(edition.score).toBe(95);
		expect(edition.coverUrl).toBe("https://example.com/edition.jpg");
	});

	it("parses edition contributors correctly", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			b0: [makeEditionRecord()],
		});

		const result = await fetchBatchedEditions([100]);
		const editions = result.get(100);
		assertExists(editions);
		const edition = editions[0];

		expect(edition.contributors).toHaveLength(1);
		expect(edition.contributors[0]).toStrictEqual({
			authorId: "1",
			name: "Brandon Sanderson",
			contribution: null,
		});
	});

	it("handles editions with missing optional fields", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			b0: [
				{
					id: 300,
					title: "Bare Edition",
					isbn_10: null,
					isbn_13: null,
					asin: null,
					pages: null,
					audio_seconds: null,
					release_date: null,
					users_count: null,
					score: null,
					cached_contributors: [],
					image: null,
					language: null,
					country: null,
					publisher: null,
					reading_format: null,
					edition_information: null,
				},
			],
		});

		const result = await fetchBatchedEditions([100]);
		const editions = result.get(100);
		assertExists(editions);
		const edition = editions[0];

		expect(edition.isbn10).toBeNull();
		expect(edition.isbn13).toBeNull();
		expect(edition.asin).toBeNull();
		expect(edition.format).toBeNull();
		expect(edition.pageCount).toBeNull();
		expect(edition.audioLength).toBeNull();
		expect(edition.publisher).toBeNull();
		expect(edition.editionInformation).toBeNull();
		expect(edition.releaseDate).toBeNull();
		expect(edition.language).toBeNull();
		expect(edition.languageCode).toBeNull();
		expect(edition.country).toBeNull();
		expect(edition.usersCount).toBe(0);
		expect(edition.score).toBe(0);
		expect(edition.coverUrl).toBeNull();
		expect(edition.contributors).toEqual([]);
	});

	it("skips editions with no id", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			b0: [{ id: null, title: "Bad Edition" }, makeEditionRecord({ id: 400 })],
		});

		const result = await fetchBatchedEditions([100]);

		const editions = result.get(100);
		assertExists(editions);
		expect(editions).toHaveLength(1);
		expect(editions[0].id).toBe(400);
	});

	it("handles multiple editions per book", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			b0: [
				makeEditionRecord({ id: 200 }),
				makeEditionRecord({ id: 201, title: "Paperback Edition" }),
				makeEditionRecord({
					id: 202,
					title: "Audio Edition",
					reading_format: { format: "Listened" },
				}),
			],
		});

		const result = await fetchBatchedEditions([100]);

		expect(result.get(100)).toHaveLength(3);
	});

	it("maps format display names for editions", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			b0: [
				makeEditionRecord({ id: 1, reading_format: { format: "Listened" } }),
				makeEditionRecord({ id: 2, reading_format: { format: "Ebook" } }),
				makeEditionRecord({ id: 3, reading_format: { format: "Read" } }),
				makeEditionRecord({
					id: 4,
					reading_format: { format: "CustomFormat" },
				}),
			],
		});

		const result = await fetchBatchedEditions([100]);
		const editions = result.get(100);
		assertExists(editions);

		expect(editions[0].format).toBe("Audiobook");
		expect(editions[1].format).toBe("E-Book");
		expect(editions[2].format).toBe("Physical Book");
		expect(editions[3].format).toBe("CustomFormat");
	});

	it("handles empty edition list for a book alias", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			b0: [],
		});

		const result = await fetchBatchedEditions([100]);

		expect(result.get(100)).toEqual([]);
	});

	it("batches book IDs into groups of 50 (EDITIONS_BATCH_SIZE)", async () => {
		// Create 120 book IDs - should be 3 batches (50, 50, 20)
		const bookIds = Array.from({ length: 120 }, (_, i) => i + 1);

		// First concurrent group: batches 0, 1, 2 (EDITIONS_CONCURRENCY = 3)
		mocks.hardcoverFetch
			.mockResolvedValueOnce(
				Object.fromEntries(
					Array.from({ length: 50 }, (_, i) => [
						`b${i}`,
						[makeEditionRecord({ id: 1000 + i })],
					]),
				),
			)
			.mockResolvedValueOnce(
				Object.fromEntries(
					Array.from({ length: 50 }, (_, i) => [
						`b${i}`,
						[makeEditionRecord({ id: 2000 + i })],
					]),
				),
			)
			.mockResolvedValueOnce(
				Object.fromEntries(
					Array.from({ length: 20 }, (_, i) => [
						`b${i}`,
						[makeEditionRecord({ id: 3000 + i })],
					]),
				),
			);

		const result = await fetchBatchedEditions(bookIds);

		expect(mocks.hardcoverFetch).toHaveBeenCalledTimes(3);
		expect(result.size).toBe(120);
	});

	it("handles contributors with missing author records", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			b0: [
				makeEditionRecord({
					cached_contributors: [
						{ author: null, contribution: "Author" },
						{ author: { id: 5, name: "Valid Author" }, contribution: "Editor" },
					],
				}),
			],
		});

		const result = await fetchBatchedEditions([100]);
		const editions = result.get(100);
		assertExists(editions);
		const contributors = editions[0].contributors;

		expect(contributors).toHaveLength(2);
		expect(contributors[0]).toStrictEqual({
			authorId: "",
			name: "",
			contribution: "Author",
		});
		expect(contributors[1]).toStrictEqual({
			authorId: "5",
			name: "Valid Author",
			contribution: "Editor",
		});
	});
});

// ---------------------------------------------------------------------------
// fetchBookComplete
// ---------------------------------------------------------------------------

describe("fetchBookComplete", () => {
	it("parses a complete book with editions", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			books: [makeBookRecord()],
			editions: [makeEditionRecord()],
		});

		const result = await fetchBookComplete(100);

		assertExists(result);
		expect(result.book.id).toBe(100);
		expect(result.book.title).toBe("Mistborn");
		expect(result.editions).toHaveLength(1);
		expect(result.editions[0].id).toBe(200);
	});

	it("returns undefined when no books are found", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			books: [],
			editions: [],
		});

		const result = await fetchBookComplete(999);

		expect(result).toBeUndefined();
	});

	it("returns undefined when the book record has no id", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			books: [{ id: null, title: "No ID Book" }],
			editions: [],
		});

		const result = await fetchBookComplete(999);

		expect(result).toBeUndefined();
	});

	it("returns undefined when the book record has no title", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			books: [{ id: 1, title: null }],
			editions: [],
		});

		const result = await fetchBookComplete(1);

		expect(result).toBeUndefined();
	});

	it("parses book contributions", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			books: [
				makeBookRecord({
					contributions: [
						{
							contribution: null,
							author: {
								id: 1,
								name: "Author One",
								slug: "author-one",
								image: { url: "https://example.com/a1.jpg" },
							},
						},
						{
							contribution: "Illustrator",
							author: {
								id: 2,
								name: "Artist Two",
								slug: "artist-two",
								image: null,
							},
						},
					],
				}),
			],
			editions: [],
		});

		const result = await fetchBookComplete(100);

		assertExists(result);
		expect(result.book.contributions).toHaveLength(2);
		expect(result.book.contributions[0].contribution).toBeNull();
		expect(result.book.contributions[1].contribution).toBe("Illustrator");
	});

	it("parses book series entries", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			books: [
				makeBookRecord({
					book_series: [
						{
							position: 3,
							series: {
								id: 20,
								name: "Epic Fantasy Series",
								slug: "epic-fantasy",
								is_completed: false,
							},
						},
					],
				}),
			],
			editions: [],
		});

		const result = await fetchBookComplete(100);

		assertExists(result);
		expect(result.book.series).toHaveLength(1);
		expect(result.book.series[0].seriesId).toBe(20);
		expect(result.book.series[0].seriesTitle).toBe("Epic Fantasy Series");
		expect(result.book.series[0].position).toBe("3");
		expect(result.book.series[0].isCompleted).toBe(false);
	});

	it("parses multiple editions with varying formats", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			books: [makeBookRecord()],
			editions: [
				makeEditionRecord({ id: 200, reading_format: { format: "Read" } }),
				makeEditionRecord({ id: 201, reading_format: { format: "Listened" } }),
				makeEditionRecord({ id: 202, reading_format: { format: "Ebook" } }),
			],
		});

		const result = await fetchBookComplete(100);

		assertExists(result);
		expect(result.editions).toHaveLength(3);
		expect(result.editions[0].format).toBe("Physical Book");
		expect(result.editions[1].format).toBe("Audiobook");
		expect(result.editions[2].format).toBe("E-Book");
	});

	it("assigns the correct bookId to each edition", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			books: [makeBookRecord({ id: 42 })],
			editions: [
				makeEditionRecord({ id: 200 }),
				makeEditionRecord({ id: 201 }),
			],
		});

		// foreignBookId is passed to parseEdition
		const result = await fetchBookComplete(42);

		assertExists(result);
		expect(result.editions[0].bookId).toBe(42);
		expect(result.editions[1].bookId).toBe(42);
	});

	it("handles book with empty contributions and series", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			books: [
				makeBookRecord({
					contributions: [],
					book_series: [],
				}),
			],
			editions: [],
		});

		const result = await fetchBookComplete(100);

		assertExists(result);
		expect(result.book.contributions).toEqual([]);
		expect(result.book.series).toEqual([]);
		expect(result.editions).toEqual([]);
	});

	it("skips editions with missing id", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			books: [makeBookRecord()],
			editions: [{ id: null, title: "Bad" }, makeEditionRecord({ id: 500 })],
		});

		const result = await fetchBookComplete(100);

		assertExists(result);
		expect(result.editions).toHaveLength(1);
		expect(result.editions[0].id).toBe(500);
	});

	it("passes the foreignBookId argument to the query", async () => {
		mocks.hardcoverFetch.mockResolvedValueOnce({
			books: [makeBookRecord()],
			editions: [],
		});

		await fetchBookComplete(777);

		expect(mocks.hardcoverFetch).toHaveBeenCalledWith(expect.any(String), {
			bookId: 777,
		});
	});
});
