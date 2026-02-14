import { createServerFn } from "@tanstack/react-start";
import { db } from "~/db";
import { books, editions, authors, history } from "~/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  createBookSchema,
  updateBookSchema,
  createEditionSchema,
  updateEditionSchema,
} from "~/lib/validators";

export const getBooksFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const result = db
      .select({
        id: books.id,
        title: books.title,
        authorId: books.authorId,
        authorName: authors.name,
        overview: books.overview,
        isbn: books.isbn,
        asin: books.asin,
        releaseDate: books.releaseDate,
        monitored: books.monitored,
        foreignBookId: books.foreignBookId,
        images: books.images,
        ratings: books.ratings,
        tags: books.tags,
        createdAt: books.createdAt,
        updatedAt: books.updatedAt,
      })
      .from(books)
      .leftJoin(authors, eq(books.authorId, authors.id))
      .orderBy(desc(books.createdAt))
      .all();
    return result;
  }
);

export const getBookFn = createServerFn({ method: "GET" })
  .validator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const book = db
      .select({
        id: books.id,
        title: books.title,
        authorId: books.authorId,
        authorName: authors.name,
        overview: books.overview,
        isbn: books.isbn,
        asin: books.asin,
        releaseDate: books.releaseDate,
        monitored: books.monitored,
        foreignBookId: books.foreignBookId,
        images: books.images,
        ratings: books.ratings,
        tags: books.tags,
        createdAt: books.createdAt,
        updatedAt: books.updatedAt,
      })
      .from(books)
      .leftJoin(authors, eq(books.authorId, authors.id))
      .where(eq(books.id, data.id))
      .get();
    if (!book) throw new Error("Book not found");

    const bookEditions = db
      .select()
      .from(editions)
      .where(eq(editions.bookId, data.id))
      .all();

    return { ...book, editions: bookEditions };
  });

export const createBookFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => createBookSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const book = db.insert(books).values(data).returning().get();

    db.insert(history)
      .values({
        eventType: "bookAdded",
        bookId: book.id,
        authorId: data.authorId,
        data: { title: book.title },
      })
      .run();

    return book;
  });

export const updateBookFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => updateBookSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;
    const book = db
      .update(books)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(books.id, id))
      .returning()
      .get();

    db.insert(history)
      .values({
        eventType: "bookUpdated",
        bookId: id,
        authorId: book.authorId,
        data: { title: book.title },
      })
      .run();

    return book;
  });

export const deleteBookFn = createServerFn({ method: "POST" })
  .validator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const book = db.select().from(books).where(eq(books.id, data.id)).get();

    db.delete(books).where(eq(books.id, data.id)).run();

    if (book) {
      db.insert(history)
        .values({
          eventType: "bookDeleted",
          authorId: book.authorId,
          data: { title: book.title },
        })
        .run();
    }

    return { success: true };
  });

// Editions
export const createEditionFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => createEditionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return db.insert(editions).values(data).returning().get();
  });

export const updateEditionFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => updateEditionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;
    return db
      .update(editions)
      .set(values)
      .where(eq(editions.id, id))
      .returning()
      .get();
  });
