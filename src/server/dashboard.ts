import { createServerFn } from "@tanstack/react-start";
import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "src/db";
import {
	authors,
	bookFiles,
	books,
	episodeFiles,
	episodes,
	history,
	movieFiles,
	movies,
	shows,
} from "src/db/schema";
import { requireAuth } from "./middleware";
import { getDiskSpace } from "./system-status";

type ContentTypeStat = {
	total: number;
	monitored: number;
	fileCount: number;
	extra: { label: string; value: number };
};

export type ContentTypeStats = {
	books: ContentTypeStat;
	shows: ContentTypeStat;
	movies: ContentTypeStat;
};

export const getDashboardContentStatsFn = createServerFn({
	method: "GET",
}).handler(async () => {
	await requireAuth();

	const bookCount = db.select({ count: count() }).from(books).get()?.count ?? 0;
	const authorCount =
		db.select({ count: count() }).from(authors).get()?.count ?? 0;
	const bookFileCount =
		db.select({ count: count() }).from(bookFiles).get()?.count ?? 0;

	const showCount = db.select({ count: count() }).from(shows).get()?.count ?? 0;
	const episodeCount =
		db.select({ count: count() }).from(episodes).get()?.count ?? 0;
	const episodeFileCount =
		db.select({ count: count() }).from(episodeFiles).get()?.count ?? 0;

	const movieCount =
		db.select({ count: count() }).from(movies).get()?.count ?? 0;
	const movieFileCount =
		db.select({ count: count() }).from(movieFiles).get()?.count ?? 0;

	return {
		books: {
			total: bookCount,
			monitored: bookCount,
			fileCount: bookFileCount,
			extra: { label: "Authors", value: authorCount },
		},
		shows: {
			total: showCount,
			monitored: showCount,
			fileCount: episodeFileCount,
			extra: { label: "Episodes", value: episodeCount },
		},
		movies: {
			total: movieCount,
			monitored: movieCount,
			fileCount: movieFileCount,
			extra: { label: "Collections", value: 0 },
		},
	} satisfies ContentTypeStats;
});

export type QualityBreakdownItem = {
	name: string;
	count: number;
};

export type QualityBreakdown = {
	books: QualityBreakdownItem[];
	shows: QualityBreakdownItem[];
	movies: QualityBreakdownItem[];
};

export const getDashboardQualityBreakdownFn = createServerFn({
	method: "GET",
}).handler(async () => {
	await requireAuth();

	// Book files: group by quality name from JSON
	const bookRows = db
		.select({
			quality: bookFiles.quality,
		})
		.from(bookFiles)
		.all();

	const bookQualityCounts = new Map<string, number>();
	for (const row of bookRows) {
		const name = row.quality?.quality?.name ?? "Unknown";
		bookQualityCounts.set(name, (bookQualityCounts.get(name) ?? 0) + 1);
	}
	const booksBreakdown = Array.from(bookQualityCounts.entries())
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);

	// Episode files: group by quality name from JSON
	const episodeRows = db
		.select({
			quality: episodeFiles.quality,
		})
		.from(episodeFiles)
		.all();

	const episodeQualityCounts = new Map<string, number>();
	for (const row of episodeRows) {
		const name = row.quality?.quality?.name ?? "Unknown";
		episodeQualityCounts.set(name, (episodeQualityCounts.get(name) ?? 0) + 1);
	}
	const showsBreakdown = Array.from(episodeQualityCounts.entries())
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);

	// Movie files: group by quality name from JSON
	const movieRows = db
		.select({
			quality: movieFiles.quality,
		})
		.from(movieFiles)
		.all();

	const movieQualityCounts = new Map<string, number>();
	for (const row of movieRows) {
		const name = row.quality?.quality?.name ?? "Unknown";
		movieQualityCounts.set(name, (movieQualityCounts.get(name) ?? 0) + 1);
	}
	const moviesBreakdown = Array.from(movieQualityCounts.entries())
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);

	return {
		books: booksBreakdown,
		shows: showsBreakdown,
		movies: moviesBreakdown,
	} satisfies QualityBreakdown;
});

export type StorageStat = {
	contentType: string;
	totalSize: number;
};

export type DashboardStorage = {
	byContentType: StorageStat[];
	totalUsed: number;
	totalCapacity: number;
	rootFolderCount: number;
};

export const getDashboardStorageStatsFn = createServerFn({
	method: "GET",
}).handler(async () => {
	await requireAuth();

	const bookSize =
		db
			.select({ total: sql<number>`coalesce(sum(${bookFiles.size}), 0)` })
			.from(bookFiles)
			.get()?.total ?? 0;

	const episodeSize =
		db
			.select({ total: sql<number>`coalesce(sum(${episodeFiles.size}), 0)` })
			.from(episodeFiles)
			.get()?.total ?? 0;

	const movieSize =
		db
			.select({ total: sql<number>`coalesce(sum(${movieFiles.size}), 0)` })
			.from(movieFiles)
			.get()?.total ?? 0;

	const diskEntries = getDiskSpace();
	const totalCapacity = diskEntries.reduce((sum, e) => sum + e.totalSpace, 0);

	return {
		byContentType: [
			{ contentType: "Books", totalSize: bookSize },
			{ contentType: "TV Shows", totalSize: episodeSize },
			{ contentType: "Movies", totalSize: movieSize },
		],
		totalUsed: bookSize + episodeSize + movieSize,
		totalCapacity,
		rootFolderCount: diskEntries.length,
	} satisfies DashboardStorage;
});

export type RecentActivityItem = {
	id: number;
	eventType: string;
	itemName: string | null;
	contentType: string;
	date: number;
};

export const getDashboardRecentActivityFn = createServerFn({
	method: "GET",
}).handler(async () => {
	await requireAuth();

	const items = db
		.select({
			id: history.id,
			eventType: history.eventType,
			bookTitle: books.title,
			movieTitle: movies.title,
			date: history.date,
			bookId: history.bookId,
			movieId: history.movieId,
			showId: history.showId,
			episodeId: history.episodeId,
		})
		.from(history)
		.leftJoin(books, eq(history.bookId, books.id))
		.leftJoin(movies, eq(history.movieId, movies.id))
		.orderBy(desc(history.date))
		.limit(5)
		.all();

	return items.map((item) => {
		let contentType = "Books";
		let itemName = item.bookTitle;
		if (item.movieId) {
			contentType = "Movies";
			itemName = item.movieTitle;
		} else if (item.showId || item.episodeId) {
			contentType = "TV Shows";
			itemName = null; // show/episode name would need extra join
		}
		return {
			id: item.id,
			eventType: item.eventType,
			itemName,
			contentType,
			date: item.date,
		} satisfies RecentActivityItem;
	});
});
