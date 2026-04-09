import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkAuthorExistsFn: vi.fn(),
	getAuthorBooksPaginatedFn: vi.fn(),
	getAuthorFn: vi.fn(),
	getPaginatedAuthorsFn: vi.fn(),
}));

vi.mock("src/server/authors", () => ({
	checkAuthorExistsFn: mocks.checkAuthorExistsFn,
	getAuthorFn: mocks.getAuthorFn,
	getPaginatedAuthorsFn: mocks.getPaginatedAuthorsFn,
}));

vi.mock("src/server/books", () => ({
	getAuthorBooksPaginatedFn: mocks.getAuthorBooksPaginatedFn,
}));

import {
	authorBooksInfiniteQuery,
	authorDetailQuery,
	authorExistsQuery,
	authorsInfiniteQuery,
} from "./authors";

describe("authors queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds the authors infinite query with the expected key and payload", async () => {
		mocks.getPaginatedAuthorsFn.mockResolvedValue({ page: 2, totalPages: 4 });

		const options = authorsInfiniteQuery("pratchett");

		expect(options.queryKey).toStrictEqual([
			"authors",
			"infinite",
			"pratchett",
		]);
		expect(options.initialPageParam).toBe(1);

		await expect(options.queryFn!({ pageParam: 3 } as never)).resolves.toEqual({
			page: 2,
			totalPages: 4,
		});
		expect(mocks.getPaginatedAuthorsFn).toHaveBeenCalledWith({
			data: { page: 3, pageSize: 25, search: "pratchett" },
		});
	});

	it("advances authors pagination until the last page", () => {
		const options = authorsInfiniteQuery();
		const getNextPageParam = options.getNextPageParam!;

		expect(
			getNextPageParam(
				{ page: 1, totalPages: 3 } as never,
				[] as never,
				1,
				[] as never,
			),
		).toBe(2);
		expect(
			getNextPageParam(
				{ page: 3, totalPages: 3 } as never,
				[] as never,
				3,
				[] as never,
			),
		).toBeUndefined();
	});

	it("builds the author detail query", async () => {
		mocks.getAuthorFn.mockResolvedValue({ id: 7 });

		const options = authorDetailQuery(7);

		expect(options.queryKey).toStrictEqual(["authors", "detail", 7]);
		await expect(options.queryFn!({} as never)).resolves.toEqual({ id: 7 });
		expect(mocks.getAuthorFn).toHaveBeenCalledWith({ data: { id: 7 } });
	});

	it("builds the author existence query", async () => {
		mocks.checkAuthorExistsFn.mockResolvedValue(true);

		const options = authorExistsQuery("foreign-123");

		expect(options.queryKey).toStrictEqual([
			"authors",
			"existence",
			"foreign-123",
		]);
		await expect(options.queryFn!({} as never)).resolves.toBe(true);
		expect(mocks.checkAuthorExistsFn).toHaveBeenCalledWith({
			data: { foreignAuthorId: "foreign-123" },
		});
	});

	it("builds the author books infinite query with the expected payload", async () => {
		mocks.getAuthorBooksPaginatedFn.mockResolvedValue({
			page: 1,
			totalPages: 2,
		});

		const options = authorBooksInfiniteQuery(11, "ring", "en", "title", "asc");

		expect(options.queryKey).toStrictEqual([
			"authors",
			"booksInfinite",
			11,
			"ring",
			"en",
			"title",
			"asc",
		]);
		expect(options.initialPageParam).toBe(1);

		await expect(options.queryFn!({ pageParam: 4 } as never)).resolves.toEqual({
			page: 1,
			totalPages: 2,
		});
		expect(mocks.getAuthorBooksPaginatedFn).toHaveBeenCalledWith({
			data: {
				authorId: 11,
				language: "en",
				page: 4,
				pageSize: 25,
				search: "ring",
				sortDir: "asc",
				sortKey: "title",
			},
		});
	});

	it("advances author books pagination until the last page", () => {
		const options = authorBooksInfiniteQuery(11);
		const getNextPageParam = options.getNextPageParam!;

		expect(
			getNextPageParam(
				{ page: 2, totalPages: 5 } as never,
				[] as never,
				2,
				[] as never,
			),
		).toBe(3);
		expect(
			getNextPageParam(
				{ page: 5, totalPages: 5 } as never,
				[] as never,
				5,
				[] as never,
			),
		).toBeUndefined();
	});
});
