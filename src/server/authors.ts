import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  authors,
  books,
  editions,
  history,
  series,
  seriesBookLinks,
} from "src/db/schema";
import { eq, sql, desc, like, inArray } from "drizzle-orm";
import { requireAuth } from "./middleware";
import { createAuthorSchema, updateAuthorSchema } from "src/lib/validators";
import {
  fetchSeriesComplete,
  getAuthorizationHeader,
} from "./hardcover/import-queries";

export const getAuthorsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const result = db
      .select({
        id: authors.id,
        name: authors.name,
        sortName: authors.sortName,
        slug: authors.slug,
        bio: authors.bio,
        bornYear: authors.bornYear,
        deathYear: authors.deathYear,
        status: authors.status,
        isStub: authors.isStub,
        qualityProfileId: authors.qualityProfileId,
        rootFolderPath: authors.rootFolderPath,
        foreignAuthorId: authors.foreignAuthorId,
        images: authors.images,
        tags: authors.tags,
        metadataUpdatedAt: authors.metadataUpdatedAt,
        createdAt: authors.createdAt,
        updatedAt: authors.updatedAt,
        bookCount: sql<number>`(SELECT COUNT(*) FROM books WHERE books.author_id = ${authors.id})`,
      })
      .from(authors)
      .orderBy(authors.sortName)
      .all();
    return result;
  },
);

export const getPaginatedAuthorsFn = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { page?: number; pageSize?: number; search?: string }) => d,
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const page = data.page || 1;
    const pageSize = data.pageSize || 25;
    const offset = (page - 1) * pageSize;

    let query = db
      .select({
        id: authors.id,
        name: authors.name,
        sortName: authors.sortName,
        slug: authors.slug,
        bio: authors.bio,
        status: authors.status,
        isStub: authors.isStub,
        qualityProfileId: authors.qualityProfileId,
        rootFolderPath: authors.rootFolderPath,
        foreignAuthorId: authors.foreignAuthorId,
        images: authors.images,
        tags: authors.tags,
        metadataUpdatedAt: authors.metadataUpdatedAt,
        createdAt: authors.createdAt,
        updatedAt: authors.updatedAt,
        bookCount: sql<number>`(SELECT COUNT(*) FROM books WHERE books.author_id = ${authors.id})`,
      })
      .from(authors)
      .orderBy(authors.sortName)
      .$dynamic();

    let countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(authors)
      .$dynamic();

    if (data.search) {
      const pattern = `%${data.search}%`;
      query = query.where(like(authors.name, pattern));
      countQuery = countQuery.where(like(authors.name, pattern));
    }

    const items = query.limit(pageSize).offset(offset).all();
    const total = countQuery.get()?.count || 0;

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    };
  });

export const getAuthorFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const author = db
      .select()
      .from(authors)
      .where(eq(authors.id, data.id))
      .get();
    if (!author) {
      throw new Error("Author not found");
    }

    const authorBooks = db
      .select()
      .from(books)
      .where(eq(books.authorId, data.id))
      .orderBy(desc(books.releaseDate))
      .all();

    // Get series data for this author's books
    const bookIds = authorBooks.map((b) => b.id);
    const seriesLinks =
      bookIds.length > 0
        ? db
            .select({
              bookId: seriesBookLinks.bookId,
              seriesId: seriesBookLinks.seriesId,
              seriesTitle: series.title,
              seriesSlug: series.slug,
              foreignSeriesId: series.foreignSeriesId,
              position: seriesBookLinks.position,
              isCompleted: series.isCompleted,
            })
            .from(seriesBookLinks)
            .innerJoin(series, eq(seriesBookLinks.seriesId, series.id))
            .where(inArray(seriesBookLinks.bookId, bookIds))
            .all()
        : [];

    // Group series with their books
    const seriesMap = new Map<
      number,
      {
        id: number;
        title: string;
        slug: string | undefined;
        foreignSeriesId: string | undefined;
        isCompleted: boolean | undefined;
        books: Array<{ bookId: number; position: string | undefined }>;
      }
    >();
    for (const link of seriesLinks) {
      if (!seriesMap.has(link.seriesId)) {
        seriesMap.set(link.seriesId, {
          id: link.seriesId,
          title: link.seriesTitle,
          slug: link.seriesSlug,
          foreignSeriesId: link.foreignSeriesId,
          isCompleted: link.isCompleted,
          books: [],
        });
      }
      seriesMap.get(link.seriesId)!.books.push({
        bookId: link.bookId,
        position: link.position,
      });
    }

    const authorSeries = [...seriesMap.values()].toSorted((a, b) =>
      a.title.localeCompare(b.title),
    );

    // Fetch all editions for author's books (pre-sorted by readers desc)
    const allEditions =
      bookIds.length > 0
        ? db
            .select({
              bookId: editions.bookId,
              title: editions.title,
              releaseDate: editions.releaseDate,
              format: editions.format,
              pageCount: editions.pageCount,
              isbn10: editions.isbn10,
              isbn13: editions.isbn13,
              asin: editions.asin,
              publisher: editions.publisher,
              country: editions.country,
              usersCount: editions.usersCount,
              score: editions.score,
              languageCode: editions.languageCode,
              images: editions.images,
            })
            .from(editions)
            .where(inArray(editions.bookId, bookIds))
            .orderBy(desc(editions.usersCount))
            .all()
        : [];

    // Group editions by bookId
    const bookEditionsMap = new Map<number, typeof allEditions>();
    for (const ed of allEditions) {
      const arr = bookEditionsMap.get(ed.bookId) ?? [];
      arr.push(ed);
      bookEditionsMap.set(ed.bookId, arr);
    }

    // Get available languages across all author's editions, sorted by total readers desc
    const availableLanguages = db
      .select({
        languageCode: editions.languageCode,
        language: editions.language,
        totalReaders: sql<number>`COALESCE(SUM(${books.usersCount}), 0)`,
      })
      .from(editions)
      .innerJoin(books, eq(editions.bookId, books.id))
      .where(eq(books.authorId, data.id))
      .groupBy(editions.languageCode, editions.language)
      .orderBy(desc(sql`COALESCE(SUM(${books.usersCount}), 0)`))
      .all()
      .filter((l) => l.languageCode && l.language) as Array<{
      languageCode: string;
      language: string;
      totalReaders: number;
    }>;

    const booksWithEditions = authorBooks.map((b) =>
      Object.assign(b, {
        languageCodes: [
          ...new Set((bookEditionsMap.get(b.id) ?? []).map((e) => e.languageCode).filter(Boolean)),
        ] as string[],
        editions: bookEditionsMap.get(b.id) ?? [],
      }),
    );

    return {
      ...author,
      books: booksWithEditions,
      series: authorSeries,
      availableLanguages,
    };
  });

export const createAuthorFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createAuthorSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const author = db.insert(authors).values(data).returning().get();

    db.insert(history)
      .values({
        eventType: "authorAdded",
        authorId: author.id,
        data: { name: author.name },
      })
      .run();

    return author;
  });

export const updateAuthorFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateAuthorSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;
    const author = db
      .update(authors)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(authors.id, id))
      .returning()
      .get();

    db.insert(history)
      .values({
        eventType: "authorUpdated",
        authorId: id,
        data: { name: author.name },
      })
      .run();

    return author;
  });

export const deleteAuthorFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const author = db
      .select()
      .from(authors)
      .where(eq(authors.id, data.id))
      .get();

    db.delete(authors).where(eq(authors.id, data.id)).run();

    if (author) {
      db.insert(history)
        .values({
          eventType: "authorDeleted",
          data: { name: author.name },
        })
        .run();
    }

    return { success: true };
  });

export const checkAuthorExistsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { foreignAuthorId: string }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const author = db
      .select({ id: authors.id, name: authors.name })
      .from(authors)
      .where(eq(authors.foreignAuthorId, data.foreignAuthorId))
      .get();
    return author ?? null;
  });

export const getSeriesFromHardcoverFn = createServerFn({ method: "GET" })
  .inputValidator((d: { foreignSeriesIds: number[] }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    if (data.foreignSeriesIds.length === 0) {
      return [];
    }
    const authorization = getAuthorizationHeader();
    const rawSeries = await fetchSeriesComplete(
      data.foreignSeriesIds,
      authorization,
    );
    return rawSeries.map((s) => ({
      foreignSeriesId: s.id,
      books: s.books.map((b) => ({
        foreignBookId: b.bookId,
        title: b.bookTitle,
        slug: b.bookSlug,
        position: b.position,
        releaseDate: b.releaseDate,
        releaseYear: b.releaseYear,
        rating: b.rating,
        usersCount: b.usersCount,
        coverUrl: b.coverUrl,
        authorName: b.authorName,
      })),
    }));
  });
