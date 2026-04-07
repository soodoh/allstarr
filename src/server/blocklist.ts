import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "src/db";
import { authors, blocklist, books, movies, shows } from "src/db/schema";
import {
	bulkRemoveFromBlocklistSchema,
	removeFromBlocklistSchema,
} from "src/lib/validators";
import { requireAdmin, requireAuth } from "./middleware";

export const getBlocklistFn = createServerFn({ method: "GET" })
	.inputValidator((d: { page?: number; limit?: number }) => d)
	.handler(async ({ data }) => {
		await requireAuth();
		const page = data.page || 1;
		const limit = data.limit || 20;
		const offset = (page - 1) * limit;

		const items = db
			.select({
				id: blocklist.id,
				bookId: blocklist.bookId,
				authorId: blocklist.authorId,
				showId: blocklist.showId,
				movieId: blocklist.movieId,
				sourceTitle: blocklist.sourceTitle,
				protocol: blocklist.protocol,
				indexer: blocklist.indexer,
				message: blocklist.message,
				source: blocklist.source,
				date: blocklist.date,
				authorName: authors.name,
				bookTitle: books.title,
				showTitle: shows.title,
				movieTitle: movies.title,
			})
			.from(blocklist)
			.leftJoin(authors, eq(blocklist.authorId, authors.id))
			.leftJoin(books, eq(blocklist.bookId, books.id))
			.leftJoin(shows, eq(blocklist.showId, shows.id))
			.leftJoin(movies, eq(blocklist.movieId, movies.id))
			.orderBy(desc(blocklist.date))
			.limit(limit)
			.offset(offset)
			.all();

		const countResult = db
			.select({ count: sql<number>`count(*)` })
			.from(blocklist)
			.get();

		const total = countResult?.count || 0;

		return {
			items,
			total,
			page,
			totalPages: Math.ceil(total / limit),
		};
	});

export const removeFromBlocklistFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => removeFromBlocklistSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		db.delete(blocklist).where(eq(blocklist.id, data.id)).run();
		return { success: true };
	});

export const bulkRemoveFromBlocklistFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => bulkRemoveFromBlocklistSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		db.delete(blocklist).where(inArray(blocklist.id, data.ids)).run();
		return { success: true, removed: data.ids.length };
	});
