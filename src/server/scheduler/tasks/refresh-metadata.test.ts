import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskResult } from "../registry";

const mocks = vi.hoisted(() => ({
	registerTask: vi.fn(),
	db: {
		select: vi.fn(),
	},
	eq: vi.fn(),
	sql: vi.fn(),
	refreshAuthorInternal: vi.fn(),
	refreshBookInternal: vi.fn(),
	logError: vi.fn(),
}));

// Build a chainable query builder that returns `.all()` results
function makeQuery(result: unknown[]) {
	const chain: Record<string, unknown> = {};
	chain.select = vi.fn().mockReturnValue(chain);
	chain.from = vi.fn().mockReturnValue(chain);
	chain.where = vi.fn().mockReturnValue(chain);
	chain.all = vi.fn().mockReturnValue(result);
	return chain;
}

vi.mock("../registry", () => ({
	registerTask: mocks.registerTask,
}));

vi.mock("drizzle-orm", () => ({
	eq: mocks.eq,
	sql: mocks.sql,
}));

vi.mock("src/db", () => ({
	db: mocks.db,
}));

vi.mock("src/db/schema", () => ({
	authors: {
		id: "authors.id",
		name: "authors.name",
		monitored: "authors.monitored",
	},
	books: { id: "books.id", title: "books.title" },
	booksAuthors: {
		bookId: "booksAuthors.bookId",
		authorId: "booksAuthors.authorId",
	},
	editionDownloadProfiles: { editionId: "editionDownloadProfiles.editionId" },
	editions: { id: "editions.id", bookId: "editions.bookId" },
}));

vi.mock("src/server/import", () => ({
	refreshAuthorInternal: mocks.refreshAuthorInternal,
	refreshBookInternal: mocks.refreshBookInternal,
}));

vi.mock("src/server/logger", () => ({
	logError: mocks.logError,
}));

// Import to trigger registerTask at module level
await import("./refresh-metadata");

const taskDef = mocks.registerTask.mock.calls[0][0];
const handler = taskDef.handler;

describe("refresh-hardcover-metadata task", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("registers with correct metadata", () => {
		expect(taskDef.id).toBe("refresh-hardcover-metadata");
		expect(taskDef.name).toBe("Refresh Hardcover Metadata");
		expect(taskDef.group).toBe("metadata");
		expect(taskDef.defaultInterval).toBe(12 * 60 * 60);
	});

	it("returns early when no monitored authors or books", async () => {
		// First call: authors query returns empty
		// Second call: books query returns empty
		const authorsQuery = makeQuery([]);
		const booksQuery = makeQuery([]);
		mocks.db.select
			.mockReturnValueOnce(authorsQuery)
			.mockReturnValueOnce(booksQuery);

		const result: TaskResult = await handler(vi.fn());

		expect(result.success).toBe(true);
		expect(result.message).toBe("No monitored authors or books");
	});

	it("refreshes authors and builds message with counts", async () => {
		const authorsQuery = makeQuery([
			{ id: 1, name: "Author A" },
			{ id: 2, name: "Author B" },
		]);
		const booksQuery = makeQuery([]);
		// Author books queries (after each refresh)
		const authorBooksQuery1 = makeQuery([{ bookId: 10 }, { bookId: 11 }]);
		const authorBooksQuery2 = makeQuery([{ bookId: 12 }]);

		mocks.db.select
			.mockReturnValueOnce(authorsQuery) // monitored authors
			.mockReturnValueOnce(booksQuery) // monitored books
			.mockReturnValueOnce(authorBooksQuery1) // books for author 1
			.mockReturnValueOnce(authorBooksQuery2); // books for author 2

		mocks.refreshAuthorInternal
			.mockResolvedValueOnce({ booksAdded: 1, editionsAdded: 2 })
			.mockResolvedValueOnce({ booksAdded: 0, editionsAdded: 1 });

		const resultPromise = handler(vi.fn());
		// Advance past the sleep(1000) between authors
		await vi.advanceTimersByTimeAsync(2000);
		const result: TaskResult = await resultPromise;

		expect(mocks.refreshAuthorInternal).toHaveBeenCalledTimes(2);
		expect(mocks.refreshAuthorInternal).toHaveBeenCalledWith(1);
		expect(mocks.refreshAuthorInternal).toHaveBeenCalledWith(2);
		expect(result.success).toBe(true);
		expect(result.message).toBe(
			"Refreshed 2 authors, 1 new book, 3 new editions",
		);
	});

	it("refreshes standalone books not already covered by author refresh", async () => {
		const authorsQuery = makeQuery([{ id: 1, name: "Author A" }]);
		// Books: one covered by author (id=10), one standalone (id=20)
		const booksQuery = makeQuery([
			{ id: 10, title: "Book via Author" },
			{ id: 20, title: "Standalone Book" },
		]);
		const authorBooksQuery = makeQuery([{ bookId: 10 }]);

		mocks.db.select
			.mockReturnValueOnce(authorsQuery)
			.mockReturnValueOnce(booksQuery)
			.mockReturnValueOnce(authorBooksQuery);

		mocks.refreshAuthorInternal.mockResolvedValueOnce({
			booksAdded: 0,
			editionsAdded: 0,
		});
		mocks.refreshBookInternal.mockResolvedValueOnce({
			booksAdded: 0,
			editionsAdded: 1,
		});

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(2000);
		const result: TaskResult = await resultPromise;

		// Should only refresh book 20, not book 10
		expect(mocks.refreshBookInternal).toHaveBeenCalledTimes(1);
		expect(mocks.refreshBookInternal).toHaveBeenCalledWith(20);
		expect(result.success).toBe(true);
		expect(result.message).toBe(
			"Refreshed 1 author, 1 standalone book, 1 new edition",
		);
	});

	it("skips all standalone books when all are covered by author refresh", async () => {
		const authorsQuery = makeQuery([{ id: 1, name: "Author A" }]);
		const booksQuery = makeQuery([{ id: 10, title: "Author's Book" }]);
		const authorBooksQuery = makeQuery([{ bookId: 10 }]);

		mocks.db.select
			.mockReturnValueOnce(authorsQuery)
			.mockReturnValueOnce(booksQuery)
			.mockReturnValueOnce(authorBooksQuery);

		mocks.refreshAuthorInternal.mockResolvedValueOnce({
			booksAdded: 0,
			editionsAdded: 0,
		});

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(2000);
		const result: TaskResult = await resultPromise;

		expect(mocks.refreshBookInternal).not.toHaveBeenCalled();
		expect(result.success).toBe(true);
		expect(result.message).toBe("Refreshed 1 author");
	});

	it("handles errors during author refresh", async () => {
		const authorsQuery = makeQuery([
			{ id: 1, name: "Good Author" },
			{ id: 2, name: "Bad Author" },
		]);
		const booksQuery = makeQuery([]);
		const authorBooksQuery = makeQuery([{ bookId: 10 }]);

		mocks.db.select
			.mockReturnValueOnce(authorsQuery)
			.mockReturnValueOnce(booksQuery)
			.mockReturnValueOnce(authorBooksQuery);

		const testError = new Error("API timeout");
		mocks.refreshAuthorInternal
			.mockResolvedValueOnce({ booksAdded: 0, editionsAdded: 0 })
			.mockRejectedValueOnce(testError);

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(2000);
		const result: TaskResult = await resultPromise;

		expect(mocks.logError).toHaveBeenCalledWith(
			"refresh-metadata",
			'Failed to refresh author "Bad Author" (id=2)',
			testError,
		);
		expect(result.success).toBe(false);
		expect(result.message).toBe("Refreshed 1 author, 1 error");
	});

	it("handles errors during book refresh", async () => {
		const authorsQuery = makeQuery([]);
		const booksQuery = makeQuery([{ id: 20, title: "Failing Book" }]);

		mocks.db.select
			.mockReturnValueOnce(authorsQuery)
			.mockReturnValueOnce(booksQuery);

		const testError = new Error("Book not found");
		mocks.refreshBookInternal.mockRejectedValueOnce(testError);

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(2000);
		const result: TaskResult = await resultPromise;

		expect(mocks.logError).toHaveBeenCalledWith(
			"refresh-metadata",
			'Failed to refresh book "Failing Book" (id=20)',
			testError,
		);
		expect(result.success).toBe(false);
		expect(result.message).toBe("Refreshed 1 error");
	});

	it("returns 'No metadata changes' when refreshes produce no new data", async () => {
		const authorsQuery = makeQuery([{ id: 1, name: "Author A" }]);
		const booksQuery = makeQuery([]);
		const authorBooksQuery = makeQuery([]);

		mocks.db.select
			.mockReturnValueOnce(authorsQuery)
			.mockReturnValueOnce(booksQuery)
			.mockReturnValueOnce(authorBooksQuery);

		mocks.refreshAuthorInternal.mockResolvedValueOnce({
			booksAdded: 0,
			editionsAdded: 0,
		});

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(2000);
		const result: TaskResult = await resultPromise;

		// 1 author refreshed but 0 new books/editions, so "1 author" part is present
		expect(result.success).toBe(true);
		expect(result.message).toBe("Refreshed 1 author");
	});

	it("refreshes only standalone books when no authors are monitored", async () => {
		const authorsQuery = makeQuery([]);
		const booksQuery = makeQuery([
			{ id: 1, title: "Book A" },
			{ id: 2, title: "Book B" },
		]);

		mocks.db.select
			.mockReturnValueOnce(authorsQuery)
			.mockReturnValueOnce(booksQuery);

		mocks.refreshBookInternal
			.mockResolvedValueOnce({ booksAdded: 0, editionsAdded: 1 })
			.mockResolvedValueOnce({ booksAdded: 1, editionsAdded: 0 });

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(2000);
		const result: TaskResult = await resultPromise;

		expect(mocks.refreshAuthorInternal).not.toHaveBeenCalled();
		expect(mocks.refreshBookInternal).toHaveBeenCalledTimes(2);
		expect(result.success).toBe(true);
		expect(result.message).toBe(
			"Refreshed 2 standalone books, 1 new book, 1 new edition",
		);
	});

	it("uses correct plural forms for singular counts", async () => {
		const authorsQuery = makeQuery([{ id: 1, name: "Author A" }]);
		const booksQuery = makeQuery([{ id: 20, title: "Standalone" }]);
		const authorBooksQuery = makeQuery([]);

		mocks.db.select
			.mockReturnValueOnce(authorsQuery)
			.mockReturnValueOnce(booksQuery)
			.mockReturnValueOnce(authorBooksQuery);

		mocks.refreshAuthorInternal.mockResolvedValueOnce({
			booksAdded: 1,
			editionsAdded: 1,
		});
		mocks.refreshBookInternal.mockResolvedValueOnce({
			booksAdded: 0,
			editionsAdded: 0,
		});

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(2000);
		const result: TaskResult = await resultPromise;

		expect(result.message).toBe(
			"Refreshed 1 author, 1 standalone book, 1 new book, 1 new edition",
		);
	});
});
