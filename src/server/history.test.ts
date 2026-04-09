import { beforeEach, describe, expect, it, vi } from "vitest";

const historyMocks = vi.hoisted(() => {
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
	const requireAuth = vi.fn();
	const select = vi.fn();
	const sql = vi.fn((strings: TemplateStringsArray, ..._values: unknown[]) => ({
		kind: "sql",
		text: strings.join(""),
	}));

	return {
		and,
		desc,
		eq,
		requireAuth,
		select,
		sql,
		countResult: { count: 0 } as { count: number } | undefined,
		itemRows: [] as Array<Record<string, unknown>>,
	};
});

const schemaMocks = vi.hoisted(
	() =>
		({
			authors: {
				id: "authors.id",
				name: "authors.name",
			},
			books: {
				id: "books.id",
				title: "books.title",
			},
			history: {
				authorId: "history.authorId",
				bookId: "history.bookId",
				data: "history.data",
				date: "history.date",
				eventType: "history.eventType",
				id: "history.id",
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
	and: historyMocks.and,
	desc: historyMocks.desc,
	eq: historyMocks.eq,
	sql: historyMocks.sql,
}));

vi.mock("src/db", () => ({
	db: {
		select: historyMocks.select,
	},
}));

vi.mock("src/db/schema", () => schemaMocks);

vi.mock("./middleware", () => ({
	requireAuth: historyMocks.requireAuth,
}));

import { getHistoryFn } from "./history";

type SelectChain = {
	$dynamic: ReturnType<typeof vi.fn>;
	all: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	leftJoin: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	offset: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

function createSelectChain(kind: "items" | "count"): SelectChain {
	const chain = {} as SelectChain;
	chain.$dynamic = vi.fn(() => chain);
	chain.all = vi.fn(() =>
		kind === "items" ? historyMocks.itemRows : historyMocks.countResult,
	);
	chain.from = vi.fn(() => chain);
	chain.get = vi.fn(() =>
		kind === "count" ? historyMocks.countResult : historyMocks.itemRows[0],
	);
	chain.leftJoin = vi.fn(() => chain);
	chain.limit = vi.fn(() => chain);
	chain.offset = vi.fn(() => chain);
	chain.orderBy = vi.fn(() => chain);
	chain.where = vi.fn(() => chain);

	return chain;
}

function useHistorySelectMocks() {
	historyMocks.select.mockImplementation((shape?: Record<string, unknown>) => {
		const kind = shape && "count" in shape ? "count" : "items";
		return createSelectChain(kind);
	});
}

describe("server/history", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		historyMocks.countResult = { count: 0 };
		historyMocks.itemRows = [
			{
				authorId: 7,
				authorName: "Le Guin",
				bookId: 9,
				bookTitle: "The Left Hand of Darkness",
				data: { foo: "bar" },
				date: "2026-04-08T00:00:00.000Z",
				eventType: "bookAdded",
				id: 1,
			},
		];
		historyMocks.requireAuth.mockResolvedValue({ user: { id: 1 } });
		useHistorySelectMocks();
	});

	it("applies default paging and uses an unfiltered count query", async () => {
		historyMocks.countResult = { count: 41 };

		await expect(getHistoryFn({ data: {} })).resolves.toEqual({
			items: historyMocks.itemRows,
			page: 1,
			total: 41,
			totalPages: 3,
		});

		expect(historyMocks.requireAuth).toHaveBeenCalledTimes(1);
		expect(historyMocks.select).toHaveBeenCalledTimes(2);
		expect(historyMocks.select).toHaveBeenNthCalledWith(1, {
			authorId: schemaMocks.history.authorId,
			authorName: schemaMocks.authors.name,
			bookId: schemaMocks.history.bookId,
			bookTitle: schemaMocks.books.title,
			data: schemaMocks.history.data,
			date: schemaMocks.history.date,
			eventType: schemaMocks.history.eventType,
			id: schemaMocks.history.id,
		});

		const itemsChain = historyMocks.select.mock.results[0]
			?.value as SelectChain;
		expect(itemsChain.from).toHaveBeenCalledWith(schemaMocks.history);
		expect(itemsChain.leftJoin).toHaveBeenCalledTimes(2);
		expect(itemsChain.orderBy).toHaveBeenCalledWith({
			kind: "desc",
			column: schemaMocks.history.date,
		});
		expect(itemsChain.$dynamic).toHaveBeenCalledTimes(1);
		expect(itemsChain.where).not.toHaveBeenCalled();
		expect(itemsChain.limit).toHaveBeenCalledWith(20);
		expect(itemsChain.offset).toHaveBeenCalledWith(0);
		expect(itemsChain.all).toHaveBeenCalledTimes(1);

		const countChain = historyMocks.select.mock.results[1]
			?.value as SelectChain;
		expect(countChain.from).toHaveBeenCalledWith(schemaMocks.history);
		expect(countChain.where).not.toHaveBeenCalled();
		expect(countChain.get).toHaveBeenCalledTimes(1);
	});

	it("filters by event type and uses the filtered count query", async () => {
		historyMocks.countResult = { count: 9 };

		await expect(
			getHistoryFn({
				data: {
					eventType: "downloaded",
					limit: 5,
					page: 2,
				},
			}),
		).resolves.toEqual({
			items: historyMocks.itemRows,
			page: 2,
			total: 9,
			totalPages: 2,
		});

		expect(historyMocks.eq).toHaveBeenCalledWith(
			schemaMocks.history.eventType,
			"downloaded",
		);
		expect(historyMocks.and).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				kind: "eq",
				left: schemaMocks.history.eventType,
				right: "downloaded",
			}),
		);

		const itemsChain = historyMocks.select.mock.results[0]
			?.value as SelectChain;
		expect(itemsChain.where).toHaveBeenCalledWith({
			conditions: [
				{
					kind: "eq",
					left: schemaMocks.history.eventType,
					right: "downloaded",
				},
			],
			kind: "and",
		});
		expect(itemsChain.limit).toHaveBeenCalledWith(5);
		expect(itemsChain.offset).toHaveBeenCalledWith(5);

		const countChain = historyMocks.select.mock.results[1]
			?.value as SelectChain;
		expect(countChain.where).toHaveBeenCalledWith({
			conditions: [
				{
					kind: "eq",
					left: schemaMocks.history.eventType,
					right: "downloaded",
				},
			],
			kind: "and",
		});
	});

	it("filters by book id and uses the filtered count query", async () => {
		historyMocks.countResult = { count: 12 };

		await expect(getHistoryFn({ data: { bookId: 17 } })).resolves.toEqual({
			items: historyMocks.itemRows,
			page: 1,
			total: 12,
			totalPages: 1,
		});

		expect(historyMocks.eq).toHaveBeenCalledWith(
			schemaMocks.history.bookId,
			17,
		);
		expect(historyMocks.and).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				kind: "eq",
				left: schemaMocks.history.bookId,
				right: 17,
			}),
		);

		const itemsChain = historyMocks.select.mock.results[0]
			?.value as SelectChain;
		expect(itemsChain.where).toHaveBeenCalledWith({
			conditions: [
				{
					kind: "eq",
					left: schemaMocks.history.bookId,
					right: 17,
				},
			],
			kind: "and",
		});

		const countChain = historyMocks.select.mock.results[1]
			?.value as SelectChain;
		expect(countChain.where).toHaveBeenCalledWith({
			conditions: [
				{
					kind: "eq",
					left: schemaMocks.history.bookId,
					right: 17,
				},
			],
			kind: "and",
		});
	});

	it("requires auth before querying history", async () => {
		historyMocks.requireAuth.mockRejectedValueOnce(new Error("no auth"));

		await expect(getHistoryFn({ data: {} })).rejects.toThrow("no auth");
		expect(historyMocks.select).not.toHaveBeenCalled();
	});
});
