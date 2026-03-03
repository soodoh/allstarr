import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { blocklist, authors, books } from "src/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  addToBlocklistSchema,
  removeFromBlocklistSchema,
  bulkRemoveFromBlocklistSchema,
} from "src/lib/validators";

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
        sourceTitle: blocklist.sourceTitle,
        protocol: blocklist.protocol,
        indexer: blocklist.indexer,
        message: blocklist.message,
        source: blocklist.source,
        date: blocklist.date,
        authorName: authors.name,
        bookTitle: books.title,
      })
      .from(blocklist)
      .leftJoin(authors, eq(blocklist.authorId, authors.id))
      .leftJoin(books, eq(blocklist.bookId, books.id))
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

export const addToBlocklistFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => addToBlocklistSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return db
      .insert(blocklist)
      .values({
        bookId: data.bookId,
        authorId: data.authorId,
        sourceTitle: data.sourceTitle,
        protocol: data.protocol,
        indexer: data.indexer,
        message: data.message,
        source: data.source,
      })
      .returning()
      .get();
  });

export const removeFromBlocklistFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => removeFromBlocklistSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(blocklist).where(eq(blocklist.id, data.id)).run();
    return { success: true };
  });

export const bulkRemoveFromBlocklistFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => bulkRemoveFromBlocklistSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(blocklist).where(inArray(blocklist.id, data.ids)).run();
    return { success: true, removed: data.ids.length };
  });
