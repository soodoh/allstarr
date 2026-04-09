import { beforeEach, describe, expect, it, vi } from "vitest";

type SelectResult = {
	all?: unknown;
	get?: unknown;
};

const dashboardMocks = vi.hoisted(() => ({
	getDiskSpace: vi.fn(),
	requireAuth: vi.fn(),
	select: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
	}),
}));

vi.mock("drizzle-orm", () => ({
	count: vi.fn(() => ({ kind: "count" })),
	desc: vi.fn((column: unknown) => ({ column, direction: "desc" })),
	eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
	sql: (...args: unknown[]) => ({ args }),
}));

vi.mock("src/db", () => ({
	db: {
		select: (...args: unknown[]) => dashboardMocks.select(...args),
	},
}));

vi.mock("src/db/schema", () => ({
	authors: { id: "authors.id" },
	bookFiles: { quality: "bookFiles.quality", size: "bookFiles.size" },
	books: { id: "books.id", title: "books.title" },
	episodeFiles: {
		quality: "episodeFiles.quality",
		size: "episodeFiles.size",
	},
	episodes: { id: "episodes.id" },
	history: {
		bookId: "history.bookId",
		date: "history.date",
		episodeId: "history.episodeId",
		eventType: "history.eventType",
		id: "history.id",
		movieId: "history.movieId",
		showId: "history.showId",
	},
	movieFiles: { quality: "movieFiles.quality", size: "movieFiles.size" },
	movies: { id: "movies.id", title: "movies.title" },
	shows: { id: "shows.id", title: "shows.title" },
}));

vi.mock("./middleware", () => ({
	requireAuth: () => dashboardMocks.requireAuth(),
}));

vi.mock("./system-info", () => ({
	getDiskSpace: () => dashboardMocks.getDiskSpace(),
}));

import {
	getDashboardContentStatsFn,
	getDashboardQualityBreakdownFn,
	getDashboardRecentActivityFn,
	getDashboardStorageStatsFn,
} from "./dashboard";

function createSelectChain(result: SelectResult) {
	const chain = {
		all: vi.fn(() => result.all),
		from: vi.fn(() => chain),
		get: vi.fn(() => result.get),
		leftJoin: vi.fn(() => chain),
		limit: vi.fn(() => chain),
		orderBy: vi.fn(() => chain),
		where: vi.fn(() => chain),
	};

	return chain;
}

function queueSelectResults(results: SelectResult[]) {
	const [first, ...rest] = results;
	if (!first) {
		throw new Error("Expected at least one select result");
	}

	dashboardMocks.select.mockImplementationOnce(() => createSelectChain(first));
	for (const result of rest) {
		dashboardMocks.select.mockImplementationOnce(() =>
			createSelectChain(result),
		);
	}
}

describe("server/dashboard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dashboardMocks.requireAuth.mockResolvedValue(undefined);
	});

	it("returns dashboard content stats after auth", async () => {
		queueSelectResults([
			{ get: { count: 4 } },
			{ get: { count: 7 } },
			{ get: { count: 9 } },
			{ get: { count: 3 } },
			{ get: { count: 12 } },
			{ get: { count: 8 } },
			{ get: { count: 2 } },
			{ get: { count: 5 } },
		]);

		await expect(getDashboardContentStatsFn()).resolves.toEqual({
			books: {
				total: 4,
				monitored: 4,
				fileCount: 9,
				extra: { label: "Authors", value: 7 },
			},
			movies: {
				total: 2,
				monitored: 2,
				fileCount: 5,
				extra: { label: "Collections", value: 0 },
			},
			shows: {
				total: 3,
				monitored: 3,
				fileCount: 8,
				extra: { label: "Episodes", value: 12 },
			},
		});

		expect(dashboardMocks.requireAuth).toHaveBeenCalledTimes(1);
		expect(dashboardMocks.select).toHaveBeenCalledTimes(8);
	});

	it("groups and sorts dashboard quality breakdowns", async () => {
		queueSelectResults([
			{
				all: [
					{ quality: { quality: { name: "1080p" } } },
					{ quality: { quality: { name: "720p" } } },
					{ quality: null },
					{ quality: { quality: { name: "1080p" } } },
				],
			},
			{
				all: [
					{ quality: { quality: { name: "720p" } } },
					{ quality: { quality: { name: "720p" } } },
					{ quality: { quality: { name: "Unknown" } } },
				],
			},
			{
				all: [
					{ quality: { quality: { name: "4K" } } },
					{ quality: { quality: { name: "4K" } } },
					{ quality: { quality: { name: "HD" } } },
				],
			},
		]);

		await expect(getDashboardQualityBreakdownFn()).resolves.toEqual({
			books: [
				{ name: "1080p", count: 2 },
				{ name: "720p", count: 1 },
				{ name: "Unknown", count: 1 },
			],
			movies: [
				{ name: "4K", count: 2 },
				{ name: "HD", count: 1 },
			],
			shows: [
				{ name: "720p", count: 2 },
				{ name: "Unknown", count: 1 },
			],
		});

		expect(dashboardMocks.requireAuth).toHaveBeenCalledTimes(1);
		expect(dashboardMocks.select).toHaveBeenCalledTimes(3);
	});

	it("returns storage totals and disk capacity", async () => {
		queueSelectResults([
			{ get: { total: 120 } },
			{ get: { total: 30 } },
			{ get: { total: 50 } },
		]);
		dashboardMocks.getDiskSpace.mockResolvedValueOnce([
			{ path: "/mnt/books", totalSpace: 500 },
			{ path: "/mnt/media", totalSpace: 750 },
		]);

		await expect(getDashboardStorageStatsFn()).resolves.toEqual({
			byContentType: [
				{ contentType: "Books", totalSize: 120 },
				{ contentType: "TV Shows", totalSize: 30 },
				{ contentType: "Movies", totalSize: 50 },
			],
			totalUsed: 200,
			totalCapacity: 1250,
			rootFolderCount: 2,
		});

		expect(dashboardMocks.requireAuth).toHaveBeenCalledTimes(1);
		expect(dashboardMocks.getDiskSpace).toHaveBeenCalledTimes(1);
		expect(dashboardMocks.select).toHaveBeenCalledTimes(3);
	});

	it("maps recent activity to a content type and timestamp", async () => {
		const entries = [
			{
				id: 1,
				eventType: "added",
				bookTitle: "Book",
				movieTitle: null,
				showTitle: null,
				date: new Date("2024-01-03T10:00:00.000Z"),
				bookId: 10,
				movieId: null,
				showId: null,
				episodeId: null,
			},
			{
				id: 2,
				eventType: "updated",
				bookTitle: null,
				movieTitle: "Movie",
				showTitle: null,
				date: new Date("2024-01-04T10:00:00.000Z"),
				bookId: null,
				movieId: 20,
				showId: null,
				episodeId: null,
			},
			{
				id: 3,
				eventType: "scanned",
				bookTitle: null,
				movieTitle: null,
				showTitle: "Show",
				date: new Date("2024-01-05T10:00:00.000Z"),
				bookId: null,
				movieId: null,
				showId: 30,
				episodeId: 40,
			},
		];
		const chain = createSelectChain({ all: entries });
		dashboardMocks.select.mockReturnValueOnce(chain);

		const [first, second, third] = entries;
		if (!first || !second || !third) {
			throw new Error("Expected three recent activity entries");
		}

		await expect(getDashboardRecentActivityFn()).resolves.toEqual([
			{
				id: 1,
				eventType: "added",
				itemName: "Book",
				contentType: "Books",
				date: first.date.getTime(),
			},
			{
				id: 2,
				eventType: "updated",
				itemName: "Movie",
				contentType: "Movies",
				date: second.date.getTime(),
			},
			{
				id: 3,
				eventType: "scanned",
				itemName: "Show",
				contentType: "TV Shows",
				date: third.date.getTime(),
			},
		]);

		expect(dashboardMocks.requireAuth).toHaveBeenCalledTimes(1);
		expect(chain.leftJoin).toHaveBeenCalledTimes(3);
		expect(chain.orderBy).toHaveBeenCalledTimes(1);
		expect(chain.limit).toHaveBeenCalledWith(5);
		expect(chain.all).toHaveBeenCalledTimes(1);
	});
});
