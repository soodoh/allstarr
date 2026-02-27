import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  books,
  editions,
  authors,
  history,
  series,
  seriesBookLinks,
} from "src/db/schema";
import { eq, desc, inArray, like, or, and, exists, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  createBookSchema,
  updateBookSchema,
  createEditionSchema,
  updateEditionSchema,
} from "src/lib/validators";

export const getBooksFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const result = db
      .select({
        id: books.id,
        title: books.title,
        slug: books.slug,
        authorId: books.authorId,
        authorName: authors.name,
        description: books.description,
        releaseDate: books.releaseDate,
        releaseYear: books.releaseYear,
        monitored: books.monitored,
        foreignBookId: books.foreignBookId,
        images: books.images,
        rating: books.rating,
        ratingsCount: books.ratingsCount,
        usersCount: books.usersCount,
        tags: books.tags,
        createdAt: books.createdAt,
        updatedAt: books.updatedAt,
      })
      .from(books)
      .leftJoin(authors, eq(books.authorId, authors.id))
      .where(eq(books.monitored, true))
      .orderBy(desc(books.createdAt))
      .all();
    return result;
  },
);

export const getPaginatedBooksFn = createServerFn({ method: "GET" })
  .inputValidator(
    (d: {
      page?: number;
      pageSize?: number;
      search?: string;
      monitored?: boolean;
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const page = data.page || 1;
    const pageSize = data.pageSize || 25;
    const offset = (page - 1) * pageSize;

    let query = db
      .select({
        id: books.id,
        title: books.title,
        slug: books.slug,
        authorId: books.authorId,
        authorName: authors.name,
        description: books.description,
        releaseDate: books.releaseDate,
        releaseYear: books.releaseYear,
        monitored: books.monitored,
        foreignBookId: books.foreignBookId,
        images: books.images,
        rating: books.rating,
        ratingsCount: books.ratingsCount,
        usersCount: books.usersCount,
        tags: books.tags,
        createdAt: books.createdAt,
        updatedAt: books.updatedAt,
      })
      .from(books)
      .leftJoin(authors, eq(books.authorId, authors.id))
      .orderBy(desc(books.createdAt))
      .$dynamic();

    let countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(books)
      .leftJoin(authors, eq(books.authorId, authors.id))
      .$dynamic();

    const conditions: SQL[] = [];

    if (data.monitored !== undefined) {
      conditions.push(eq(books.monitored, data.monitored));
    }

    if (data.search) {
      const pattern = `%${data.search}%`;
      const seriesMatch = exists(
        db
          .select({ one: sql`1` })
          .from(seriesBookLinks)
          .innerJoin(series, eq(seriesBookLinks.seriesId, series.id))
          .where(
            and(
              eq(seriesBookLinks.bookId, books.id),
              like(series.title, pattern),
            ),
          ),
      );
      conditions.push(
        or(
          like(books.title, pattern),
          like(authors.name, pattern),
          seriesMatch,
        )!,
      );
    }

    if (conditions.length > 0) {
      const combined = and(...conditions);
      query = query.where(combined);
      countQuery = countQuery.where(combined);
    }

    const items = query.limit(pageSize).offset(offset).all();
    const total = countQuery.get()?.count || 0;

    const bookIds = items.map((b) => b.id);
    const seriesLinks =
      bookIds.length > 0
        ? db
            .select({
              bookId: seriesBookLinks.bookId,
              title: series.title,
              position: seriesBookLinks.position,
            })
            .from(seriesBookLinks)
            .innerJoin(series, eq(seriesBookLinks.seriesId, series.id))
            .where(inArray(seriesBookLinks.bookId, bookIds))
            .all()
        : [];

    const seriesByBook = new Map<
      number,
      Array<{ title: string; position: string | undefined }>
    >();
    for (const link of seriesLinks) {
      const arr = seriesByBook.get(link.bookId) ?? [];
      arr.push({ title: link.title, position: link.position });
      seriesByBook.set(link.bookId, arr);
    }

    return {
      items: items.map((item) =>
        Object.assign(item, { series: seriesByBook.get(item.id) ?? [] }),
      ),
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    };
  });

export const getBookFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const book = db
      .select({
        id: books.id,
        title: books.title,
        slug: books.slug,
        authorId: books.authorId,
        authorName: authors.name,
        description: books.description,
        releaseDate: books.releaseDate,
        releaseYear: books.releaseYear,
        monitored: books.monitored,
        foreignBookId: books.foreignBookId,
        images: books.images,
        rating: books.rating,
        ratingsCount: books.ratingsCount,
        usersCount: books.usersCount,
        tags: books.tags,
        additionalAuthors: books.additionalAuthors,
        metadataUpdatedAt: books.metadataUpdatedAt,
        createdAt: books.createdAt,
        updatedAt: books.updatedAt,
      })
      .from(books)
      .leftJoin(authors, eq(books.authorId, authors.id))
      .where(eq(books.id, data.id))
      .get();
    if (!book) {
      throw new Error("Book not found");
    }

    const bookEditions = db
      .select()
      .from(editions)
      .where(eq(editions.bookId, data.id))
      .all();

    const bookSeries = db
      .select({
        title: series.title,
        position: seriesBookLinks.position,
      })
      .from(seriesBookLinks)
      .innerJoin(series, eq(seriesBookLinks.seriesId, series.id))
      .where(eq(seriesBookLinks.bookId, data.id))
      .all();

    // Get distinct languages from editions
    const languages = db
      .selectDistinct({
        languageCode: editions.languageCode,
        language: editions.language,
      })
      .from(editions)
      .where(eq(editions.bookId, data.id))
      .all()
      .filter((l) => l.languageCode && l.language) as Array<{
      languageCode: string;
      language: string;
    }>;

    return {
      ...book,
      editions: bookEditions,
      series: bookSeries,
      languages,
    };
  });

export const createBookFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createBookSchema.parse(d))
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
  .inputValidator((d: unknown) => updateBookSchema.parse(d))
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
  .inputValidator((d: { id: number }) => d)
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
  .inputValidator((d: unknown) => createEditionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return db.insert(editions).values(data).returning().get();
  });

export const updateEditionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateEditionSchema.parse(d))
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

export const checkBooksExistFn = createServerFn({ method: "GET" })
  .inputValidator((d: { foreignBookIds: string[] }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    if (data.foreignBookIds.length === 0) {
      return [];
    }
    return db
      .select({ id: books.id, foreignBookId: books.foreignBookId })
      .from(books)
      .where(inArray(books.foreignBookId, data.foreignBookIds))
      .all();
  });

// Get author's available languages from editions
export const getAuthorLanguagesFn = createServerFn({ method: "GET" })
  .inputValidator((d: { authorId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    return db
      .selectDistinct({
        languageCode: editions.languageCode,
        language: editions.language,
      })
      .from(editions)
      .innerJoin(books, eq(editions.bookId, books.id))
      .where(eq(books.authorId, data.authorId))
      .all()
      .filter((l) => l.languageCode && l.language) as Array<{
      languageCode: string;
      language: string;
    }>;
  });
