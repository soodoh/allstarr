import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
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
	const requireAdmin = vi.fn();
	const requireAuth = vi.fn();
	const select = vi.fn();
	const deleteFn = vi.fn();
	const sql = vi.fn((strings: TemplateStringsArray, ..._values: unknown[]) => ({
		kind: "sql",
		text: strings.join(""),
	}));

	return {
		countResult: { count: 0 } as { count: number } | undefined,
		deleteFn,
		desc,
		eq,
		inArray,
		itemRows: [] as Array<Record<string, unknown>>,
		requireAdmin,
		requireAuth,
		select,
		sql,
	};
});

const schemaMocks = vi.hoisted(
	() =>
		({
			authors: {
				id: "authors.id",
				name: "authors.name",
			},
			blocklist: {
				authorId: "blocklist.authorId",
				bookId: "blocklist.bookId",
				date: "blocklist.date",
				id: "blocklist.id",
				indexer: "blocklist.indexer",
				message: "blocklist.message",
				movieId: "blocklist.movieId",
				protocol: "blocklist.protocol",
				showId: "blocklist.showId",
				source: "blocklist.source",
				sourceTitle: "blocklist.sourceTitle",
			},
			books: {
				id: "books.id",
				title: "books.title",
			},
			movies: {
				id: "movies.id",
				title: "movies.title",
			},
			shows: {
				id: "shows.id",
				title: "shows.title",
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
	desc: mocks.desc,
	eq: mocks.eq,
	inArray: mocks.inArray,
	sql: mocks.sql,
}));

type SelectChain = {
	all: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	leftJoin: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	offset: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
};

function createSelectChain(kind: "items" | "count"): SelectChain {
	const chain = {} as SelectChain;
	chain.all = vi.fn(() =>
		kind === "items" ? mocks.itemRows : mocks.countResult,
	);
	chain.from = vi.fn(() => chain);
	chain.get = vi.fn(() =>
		kind === "count" ? mocks.countResult : mocks.itemRows[0],
	);
	chain.leftJoin = vi.fn(() => chain);
	chain.limit = vi.fn(() => chain);
	chain.offset = vi.fn(() => chain);
	chain.orderBy = vi.fn(() => chain);

	return chain;
}

type DeleteChain = {
	run: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

function createDeleteChain(): DeleteChain {
	const chain = {} as DeleteChain;
	chain.run = vi.fn();
	chain.where = vi.fn(() => chain);
	return chain;
}

vi.mock("src/db", () => ({
	db: {
		delete: mocks.deleteFn,
		select: mocks.select,
	},
}));

vi.mock("src/db/schema", () => schemaMocks);

vi.mock("src/lib/validators", () => ({
	bulkRemoveFromBlocklistSchema: {
		parse: (d: unknown) => d,
	},
	removeFromBlocklistSchema: {
		parse: (d: unknown) => d,
	},
}));

vi.mock("./middleware", () => ({
	requireAdmin: mocks.requireAdmin,
	requireAuth: mocks.requireAuth,
}));

import {
	bulkRemoveFromBlocklistFn,
	getBlocklistFn,
	removeFromBlocklistFn,
} from "./blocklist";

function useSelectMocks() {
	mocks.select.mockImplementation((shape?: Record<string, unknown>) => {
		const kind = shape && "count" in shape ? "count" : "items";
		return createSelectChain(kind);
	});
}

function useDeleteMocks() {
	mocks.deleteFn.mockImplementation(() => createDeleteChain());
}

describe("server/blocklist", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.countResult = { count: 0 };
		mocks.itemRows = [
			{
				authorId: 3,
				authorName: "Stephen King",
				bookId: 5,
				bookTitle: "The Shining",
				date: "2026-04-08T00:00:00.000Z",
				id: 1,
				indexer: "NZBgeek",
				message: "Bad quality",
				movieId: null,
				movieTitle: null,
				protocol: "usenet",
				showId: null,
				showTitle: null,
				source: "readarr",
				sourceTitle: "The.Shining.epub",
			},
		];
		mocks.requireAuth.mockResolvedValue({ user: { id: 1 } });
		mocks.requireAdmin.mockResolvedValue({ user: { id: 1, role: "admin" } });
		useSelectMocks();
		useDeleteMocks();
	});

	describe("getBlocklistFn", () => {
		it("returns paginated items with defaults (page 1, limit 20)", async () => {
			mocks.countResult = { count: 1 };

			await expect(getBlocklistFn({ data: {} })).resolves.toEqual({
				items: mocks.itemRows,
				page: 1,
				total: 1,
				totalPages: 1,
			});

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(mocks.select).toHaveBeenCalledTimes(2);

			// Verify items query chain
			expect(mocks.select).toHaveBeenNthCalledWith(1, {
				authorId: schemaMocks.blocklist.authorId,
				authorName: schemaMocks.authors.name,
				bookId: schemaMocks.blocklist.bookId,
				bookTitle: schemaMocks.books.title,
				date: schemaMocks.blocklist.date,
				id: schemaMocks.blocklist.id,
				indexer: schemaMocks.blocklist.indexer,
				message: schemaMocks.blocklist.message,
				movieId: schemaMocks.blocklist.movieId,
				movieTitle: schemaMocks.movies.title,
				protocol: schemaMocks.blocklist.protocol,
				showId: schemaMocks.blocklist.showId,
				showTitle: schemaMocks.shows.title,
				source: schemaMocks.blocklist.source,
				sourceTitle: schemaMocks.blocklist.sourceTitle,
			});

			const itemsChain = mocks.select.mock.results[0]?.value as SelectChain;
			expect(itemsChain.from).toHaveBeenCalledWith(schemaMocks.blocklist);
			expect(itemsChain.leftJoin).toHaveBeenCalledTimes(4);
			expect(itemsChain.orderBy).toHaveBeenCalledWith({
				kind: "desc",
				column: schemaMocks.blocklist.date,
			});
			expect(itemsChain.limit).toHaveBeenCalledWith(20);
			expect(itemsChain.offset).toHaveBeenCalledWith(0);
			expect(itemsChain.all).toHaveBeenCalledTimes(1);

			// Verify count query chain
			const countChain = mocks.select.mock.results[1]?.value as SelectChain;
			expect(countChain.from).toHaveBeenCalledWith(schemaMocks.blocklist);
			expect(countChain.get).toHaveBeenCalledTimes(1);
		});

		it("respects custom page and limit", async () => {
			mocks.countResult = { count: 50 };

			await expect(
				getBlocklistFn({ data: { page: 3, limit: 10 } }),
			).resolves.toEqual({
				items: mocks.itemRows,
				page: 3,
				total: 50,
				totalPages: 5,
			});

			const itemsChain = mocks.select.mock.results[0]?.value as SelectChain;
			expect(itemsChain.limit).toHaveBeenCalledWith(10);
			expect(itemsChain.offset).toHaveBeenCalledWith(20);
		});

		it("computes totalPages correctly with partial last page", async () => {
			mocks.countResult = { count: 41 };

			const result = await getBlocklistFn({ data: { limit: 20 } });

			expect(result.totalPages).toBe(3);
			expect(result.total).toBe(41);
		});

		it("returns total 0 when countResult is undefined", async () => {
			mocks.countResult = undefined;

			const result = await getBlocklistFn({ data: {} });

			expect(result.total).toBe(0);
			expect(result.totalPages).toBe(0);
		});

		it("calls requireAuth before querying", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("no auth"));

			await expect(getBlocklistFn({ data: {} })).rejects.toThrow("no auth");
			expect(mocks.select).not.toHaveBeenCalled();
		});

		it("joins authors, books, shows, and movies tables", async () => {
			mocks.countResult = { count: 1 };

			await getBlocklistFn({ data: {} });

			const itemsChain = mocks.select.mock.results[0]?.value as SelectChain;

			expect(itemsChain.leftJoin).toHaveBeenNthCalledWith(
				1,
				schemaMocks.authors,
				expect.objectContaining({
					kind: "eq",
					left: schemaMocks.blocklist.authorId,
					right: schemaMocks.authors.id,
				}),
			);
			expect(itemsChain.leftJoin).toHaveBeenNthCalledWith(
				2,
				schemaMocks.books,
				expect.objectContaining({
					kind: "eq",
					left: schemaMocks.blocklist.bookId,
					right: schemaMocks.books.id,
				}),
			);
			expect(itemsChain.leftJoin).toHaveBeenNthCalledWith(
				3,
				schemaMocks.shows,
				expect.objectContaining({
					kind: "eq",
					left: schemaMocks.blocklist.showId,
					right: schemaMocks.shows.id,
				}),
			);
			expect(itemsChain.leftJoin).toHaveBeenNthCalledWith(
				4,
				schemaMocks.movies,
				expect.objectContaining({
					kind: "eq",
					left: schemaMocks.blocklist.movieId,
					right: schemaMocks.movies.id,
				}),
			);
		});
	});

	describe("removeFromBlocklistFn", () => {
		it("calls requireAdmin and deletes by id", async () => {
			const result = await removeFromBlocklistFn({ data: { id: 42 } });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.deleteFn).toHaveBeenCalledWith(schemaMocks.blocklist);

			const deleteChain = mocks.deleteFn.mock.results[0]?.value as DeleteChain;
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.objectContaining({
					kind: "eq",
					left: schemaMocks.blocklist.id,
					right: 42,
				}),
			);
			expect(deleteChain.run).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true });
		});

		it("rejects when requireAdmin fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("not admin"));

			await expect(removeFromBlocklistFn({ data: { id: 1 } })).rejects.toThrow(
				"not admin",
			);
			expect(mocks.deleteFn).not.toHaveBeenCalled();
		});
	});

	describe("bulkRemoveFromBlocklistFn", () => {
		it("calls requireAdmin and returns removed count", async () => {
			const result = await bulkRemoveFromBlocklistFn({
				data: { ids: [1, 2, 3] },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.deleteFn).toHaveBeenCalledWith(schemaMocks.blocklist);

			const deleteChain = mocks.deleteFn.mock.results[0]?.value as DeleteChain;
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.objectContaining({
					kind: "inArray",
					col: schemaMocks.blocklist.id,
					vals: [1, 2, 3],
				}),
			);
			expect(deleteChain.run).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true, removed: 3 });
		});

		it("rejects when requireAdmin fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("not admin"));

			await expect(
				bulkRemoveFromBlocklistFn({ data: { ids: [1] } }),
			).rejects.toThrow("not admin");
			expect(mocks.deleteFn).not.toHaveBeenCalled();
		});
	});
});
