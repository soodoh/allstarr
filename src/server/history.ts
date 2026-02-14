import { createServerFn } from "@tanstack/react-start";
import { db } from "~/db";
import { history, authors, books } from "~/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "./middleware";

export const getHistoryFn = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { page?: number; limit?: number; eventType?: string }) => d
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const page = data.page || 1;
    const limit = data.limit || 20;
    const offset = (page - 1) * limit;

    let query = db
      .select({
        id: history.id,
        eventType: history.eventType,
        bookId: history.bookId,
        authorId: history.authorId,
        data: history.data,
        date: history.date,
        authorName: authors.name,
        bookTitle: books.title,
      })
      .from(history)
      .leftJoin(authors, eq(history.authorId, authors.id))
      .leftJoin(books, eq(history.bookId, books.id))
      .orderBy(desc(history.date))
      .$dynamic();

    if (data.eventType) {
      query = query.where(eq(history.eventType, data.eventType));
    }

    const items = query.limit(limit).offset(offset).all();

    const countQuery = data.eventType
      ? db
          .select({ count: sql<number>`count(*)` })
          .from(history)
          .where(eq(history.eventType, data.eventType))
          .get()
      : db
          .select({ count: sql<number>`count(*)` })
          .from(history)
          .get();

    const total = countQuery?.count || 0;

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  });
