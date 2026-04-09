import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkBooksExistFn: vi.fn(),
	getBookEditionsPaginatedFn: vi.fn(),
	getBookFn: vi.fn(),
	getPaginatedBooksFn: vi.fn(),
}));

vi.mock("src/server/books", () => ({
	checkBooksExistFn: mocks.checkBooksExistFn,
	getBookEditionsPaginatedFn: mocks.getBookEditionsPaginatedFn,
	getBookFn: mocks.getBookFn,
	getPaginatedBooksFn: mocks.getPaginatedBooksFn,
}));

import {
	bookDetailQuery,
	bookEditionsInfiniteQuery,
	booksExistQuery,
	booksInfiniteQuery,
} from "./books";

describe("books queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds the books infinite query with the expected payload", async () => {
		mocks.getPaginatedBooksFn.mockResolvedValue({ page: 1, totalPages: 4 });

		const options = booksInfiniteQuery("foundation", true, "title", "asc");

		expect(options.queryKey).toStrictEqual([
			"books",
			"infinite",
			"foundation",
			true,
			"title",
			"asc",
		]);
		expect(options.initialPageParam).toBe(1);

		await expect(options.queryFn!({ pageParam: 2 } as never)).resolves.toEqual({
			page: 1,
			totalPages: 4,
		});
		expect(mocks.getPaginatedBooksFn).toHaveBeenCalledWith({
			data: {
				monitored: true,
				page: 2,
				pageSize: 25,
				search: "foundation",
				sortDir: "asc",
				sortKey: "title",
			},
		});
	});

	it("advances book pagination until the last page", () => {
		const options = booksInfiniteQuery();
		const getNextPageParam = options.getNextPageParam!;

		expect(
			getNextPageParam(
				{ page: 4, totalPages: 6 } as never,
				[] as never,
				4,
				[] as never,
			),
		).toBe(5);
		expect(
			getNextPageParam(
				{ page: 6, totalPages: 6 } as never,
				[] as never,
				6,
				[] as never,
			),
		).toBeUndefined();
	});

	it("builds the book editions infinite query with the expected payload", async () => {
		mocks.getBookEditionsPaginatedFn.mockResolvedValue({
			page: 3,
			totalPages: 5,
		});

		const options = bookEditionsInfiniteQuery(22, "edition", "desc");

		expect(options.queryKey).toStrictEqual([
			"books",
			"editionsInfinite",
			22,
			"edition",
			"desc",
		]);
		expect(options.initialPageParam).toBe(1);

		await expect(options.queryFn!({ pageParam: 3 } as never)).resolves.toEqual({
			page: 3,
			totalPages: 5,
		});
		expect(mocks.getBookEditionsPaginatedFn).toHaveBeenCalledWith({
			data: {
				bookId: 22,
				page: 3,
				pageSize: 25,
				sortDir: "desc",
				sortKey: "edition",
			},
		});
	});

	it("advances book editions pagination until the last page", () => {
		const options = bookEditionsInfiniteQuery(22);
		const getNextPageParam = options.getNextPageParam!;

		expect(
			getNextPageParam(
				{ page: 1, totalPages: 2 } as never,
				[] as never,
				1,
				[] as never,
			),
		).toBe(2);
		expect(
			getNextPageParam(
				{ page: 2, totalPages: 2 } as never,
				[] as never,
				2,
				[] as never,
			),
		).toBeUndefined();
	});

	it("builds the book detail query", async () => {
		mocks.getBookFn.mockResolvedValue({ id: 9 });

		const options = bookDetailQuery(9);

		expect(options.queryKey).toStrictEqual(["books", "detail", 9]);
		await expect(options.queryFn!({} as never)).resolves.toEqual({ id: 9 });
		expect(mocks.getBookFn).toHaveBeenCalledWith({ data: { id: 9 } });
	});

	it("builds the book existence query and enables it only for non-empty input", async () => {
		mocks.checkBooksExistFn.mockResolvedValue(true);

		const disabled = booksExistQuery([]);
		expect(disabled.queryKey).toStrictEqual(["books", "existence"]);
		expect(disabled.enabled).toBe(false);

		const enabled = booksExistQuery(["foreign-1", "foreign-2"]);
		expect(enabled.queryKey).toStrictEqual([
			"books",
			"existence",
			"foreign-1",
			"foreign-2",
		]);
		expect(enabled.enabled).toBe(true);

		await expect(enabled.queryFn!({} as never)).resolves.toBe(true);
		expect(mocks.checkBooksExistFn).toHaveBeenCalledWith({
			data: { foreignBookIds: ["foreign-1", "foreign-2"] },
		});
	});
});
