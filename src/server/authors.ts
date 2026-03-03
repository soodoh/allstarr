import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  authors,
  authorQualityProfiles,
  books,
  bookFiles,
  booksAuthors,
  editions,
  editionQualityProfiles,
  history,
  series,
  seriesBookLinks,
} from "src/db/schema";
import { eq, sql, desc, like, inArray, and, isNotNull } from "drizzle-orm";
import { requireAuth } from "./middleware";
import { createAuthorSchema, updateAuthorSchema } from "src/lib/validators";
import {
  fetchSeriesComplete,
  getAuthorizationHeader,
} from "./hardcover/import-queries";

export const getAuthorsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const totalReadersExpr = sql<number>`COALESCE((SELECT SUM("books"."users_count") FROM "books_authors" INNER JOIN "books" ON "books"."id" = "books_authors"."book_id" WHERE "books_authors"."author_id" = "authors"."id"), 0)`;
    const rows = db
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
        foreignAuthorId: authors.foreignAuthorId,
        images: authors.images,
        tags: authors.tags,
        metadataUpdatedAt: authors.metadataUpdatedAt,
        createdAt: authors.createdAt,
        updatedAt: authors.updatedAt,
        bookCount: sql<number>`(SELECT COUNT(DISTINCT "books_authors"."book_id") FROM "books_authors" WHERE "books_authors"."author_id" = "authors"."id")`,
        totalReaders: totalReadersExpr,
      })
      .from(authors)
      .orderBy(desc(totalReadersExpr))
      .all();

    // Batch-query quality profile IDs for all authors
    const authorIds = rows.map((r) => r.id);
    const profileLinks =
      authorIds.length > 0
        ? db
            .select({
              authorId: authorQualityProfiles.authorId,
              qualityProfileId: authorQualityProfiles.qualityProfileId,
            })
            .from(authorQualityProfiles)
            .where(inArray(authorQualityProfiles.authorId, authorIds))
            .all()
        : [];

    const profileMap = new Map<number, number[]>();
    for (const link of profileLinks) {
      const arr = profileMap.get(link.authorId) ?? [];
      arr.push(link.qualityProfileId);
      profileMap.set(link.authorId, arr);
    }

    return rows.map((r) =>
      Object.assign(r, { qualityProfileIds: profileMap.get(r.id) ?? [] }),
    );
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

    const totalReadersExpr = sql<number>`COALESCE((SELECT SUM("books"."users_count") FROM "books_authors" INNER JOIN "books" ON "books"."id" = "books_authors"."book_id" WHERE "books_authors"."author_id" = "authors"."id"), 0)`;
    let query = db
      .select({
        id: authors.id,
        name: authors.name,
        sortName: authors.sortName,
        slug: authors.slug,
        bio: authors.bio,
        status: authors.status,
        isStub: authors.isStub,
        foreignAuthorId: authors.foreignAuthorId,
        images: authors.images,
        tags: authors.tags,
        metadataUpdatedAt: authors.metadataUpdatedAt,
        createdAt: authors.createdAt,
        updatedAt: authors.updatedAt,
        bookCount: sql<number>`(SELECT COUNT(DISTINCT "books_authors"."book_id") FROM "books_authors" WHERE "books_authors"."author_id" = "authors"."id")`,
        totalReaders: totalReadersExpr,
      })
      .from(authors)
      .orderBy(desc(totalReadersExpr))
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

    const rows = query.limit(pageSize).offset(offset).all();
    const total = countQuery.get()?.count || 0;

    // Batch-query quality profile IDs
    const authorIds = rows.map((r) => r.id);
    const profileLinks =
      authorIds.length > 0
        ? db
            .select({
              authorId: authorQualityProfiles.authorId,
              qualityProfileId: authorQualityProfiles.qualityProfileId,
            })
            .from(authorQualityProfiles)
            .where(inArray(authorQualityProfiles.authorId, authorIds))
            .all()
        : [];

    const profileMap = new Map<number, number[]>();
    for (const link of profileLinks) {
      const arr = profileMap.get(link.authorId) ?? [];
      arr.push(link.qualityProfileId);
      profileMap.set(link.authorId, arr);
    }

    const items = rows.map((r) =>
      Object.assign(r, { qualityProfileIds: profileMap.get(r.id) ?? [] }),
    );

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

    // Get all book IDs linked to this author through booksAuthors
    const authorBookEntries = db
      .select({
        bookId: booksAuthors.bookId,
      })
      .from(booksAuthors)
      .where(eq(booksAuthors.authorId, data.id))
      .all();

    const bookIds = [...new Set(authorBookEntries.map((e) => e.bookId))];

    // Get all books
    const authorBooks =
      bookIds.length > 0
        ? db
            .select({
              id: books.id,
              title: books.title,
              slug: books.slug,
              description: books.description,
              releaseDate: books.releaseDate,
              releaseYear: books.releaseYear,
              foreignBookId: books.foreignBookId,
              images: books.images,
              rating: books.rating,
              ratingsCount: books.ratingsCount,
              usersCount: books.usersCount,
              tags: books.tags,
              metadataUpdatedAt: books.metadataUpdatedAt,
              metadataSourceMissingSince: books.metadataSourceMissingSince,
              createdAt: books.createdAt,
              updatedAt: books.updatedAt,
            })
            .from(books)
            .where(inArray(books.id, bookIds))
            .orderBy(desc(books.usersCount))
            .all()
        : [];

    // Get all booksAuthors entries for these books
    const allBookAuthorEntries =
      bookIds.length > 0
        ? db
            .select({
              bookId: booksAuthors.bookId,
              authorId: booksAuthors.authorId,
              foreignAuthorId: booksAuthors.foreignAuthorId,
              authorName: booksAuthors.authorName,
              isPrimary: booksAuthors.isPrimary,
            })
            .from(booksAuthors)
            .where(inArray(booksAuthors.bookId, bookIds))
            .all()
        : [];

    // Group booksAuthors by bookId
    const bookAuthorsMap = new Map<
      number,
      Array<{
        authorId: number | null;
        foreignAuthorId: string;
        authorName: string;
        isPrimary: boolean;
      }>
    >();
    for (const entry of allBookAuthorEntries) {
      const arr = bookAuthorsMap.get(entry.bookId) ?? [];
      arr.push({
        authorId: entry.authorId,
        foreignAuthorId: entry.foreignAuthorId,
        authorName: entry.authorName,
        isPrimary: entry.isPrimary,
      });
      bookAuthorsMap.set(entry.bookId, arr);
    }

    // Get series data for this author's books
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
            .where(
              and(
                inArray(seriesBookLinks.bookId, bookIds),
                isNotNull(seriesBookLinks.position),
              ),
            )
            .all()
        : [];

    // Group series with their books
    const seriesMap = new Map<
      number,
      {
        id: number;
        title: string;
        slug: string | null;
        foreignSeriesId: string | null;
        isCompleted: boolean | null;
        books: Array<{ bookId: number; position: string }>;
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
        position: link.position!,
      });
    }

    const authorSeries = [...seriesMap.values()].toSorted((a, b) => {
      // Sort by aggregate readers descending
      let aReaders = 0;
      for (const sb of a.books) {
        const book = authorBooks.find((ab) => ab.id === sb.bookId);
        aReaders += book?.usersCount ?? 0;
      }
      let bReaders = 0;
      for (const sb of b.books) {
        const book = authorBooks.find((ab) => ab.id === sb.bookId);
        bReaders += book?.usersCount ?? 0;
      }
      return bReaders - aReaders;
    });

    // Fetch all editions for author's books (pre-sorted by readers desc)
    const allEditions =
      bookIds.length > 0
        ? db
            .select({
              id: editions.id,
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
              isDefaultCover: editions.isDefaultCover,
              metadataSourceMissingSince: editions.metadataSourceMissingSince,
            })
            .from(editions)
            .where(inArray(editions.bookId, bookIds))
            .orderBy(desc(editions.usersCount))
            .all()
        : [];

    // Batch-fetch edition quality profile links
    const allEditionIds = allEditions.map((e) => e.id);
    const editionProfileLinks =
      allEditionIds.length > 0
        ? db
            .select({
              editionId: editionQualityProfiles.editionId,
              qualityProfileId: editionQualityProfiles.qualityProfileId,
            })
            .from(editionQualityProfiles)
            .where(inArray(editionQualityProfiles.editionId, allEditionIds))
            .all()
        : [];

    const editionProfilesMap = new Map<number, number[]>();
    for (const link of editionProfileLinks) {
      const arr = editionProfilesMap.get(link.editionId) ?? [];
      arr.push(link.qualityProfileId);
      editionProfilesMap.set(link.editionId, arr);
    }

    // Group editions by bookId (with qualityProfileIds)
    const bookEditionsMap = new Map<
      number,
      Array<(typeof allEditions)[number] & { qualityProfileIds: number[] }>
    >();
    for (const ed of allEditions) {
      const arr = bookEditionsMap.get(ed.bookId) ?? [];
      arr.push({
        ...ed,
        qualityProfileIds: editionProfilesMap.get(ed.id) ?? [],
      });
      bookEditionsMap.set(ed.bookId, arr);
    }

    // Get available languages across all author's editions, sorted by total readers desc
    const availableLanguages =
      bookIds.length > 0
        ? (db
            .select({
              languageCode: editions.languageCode,
              language: editions.language,
              totalReaders: sql<number>`COALESCE(SUM(${books.usersCount}), 0)`,
            })
            .from(editions)
            .innerJoin(books, eq(editions.bookId, books.id))
            .innerJoin(booksAuthors, eq(books.id, booksAuthors.bookId))
            .where(eq(booksAuthors.authorId, data.id))
            .groupBy(editions.languageCode, editions.language)
            .orderBy(desc(sql`COALESCE(SUM(${books.usersCount}), 0)`))
            .all()
            .filter((l) => l.languageCode && l.language) as Array<{
            languageCode: string;
            language: string;
            totalReaders: number;
          }>)
        : [];

    // Batch-query file counts for all author's books
    const fileCountsMap = new Map<number, number>();
    if (bookIds.length > 0) {
      const fileCounts = db
        .select({
          bookId: bookFiles.bookId,
          count: sql<number>`count(*)`,
        })
        .from(bookFiles)
        .where(inArray(bookFiles.bookId, bookIds))
        .groupBy(bookFiles.bookId)
        .all();
      for (const fc of fileCounts) {
        fileCountsMap.set(fc.bookId, fc.count);
      }
    }

    const booksWithEditions = authorBooks.map((b) => {
      const ba = bookAuthorsMap.get(b.id) ?? [];
      const primaryAuthor = ba.find((a) => a.isPrimary);
      const bookEditions = bookEditionsMap.get(b.id) ?? [];
      const bookQualityProfileIds = [
        ...new Set(bookEditions.flatMap((e) => e.qualityProfileIds)),
      ];
      return Object.assign(b, {
        bookAuthors: ba,
        authorName: primaryAuthor?.authorName ?? null,
        authorForeignId: primaryAuthor?.foreignAuthorId ?? null,
        qualityProfileIds: bookQualityProfileIds,
        languageCodes: [
          ...new Set(bookEditions.map((e) => e.languageCode).filter(Boolean)),
        ] as string[],
        editions: bookEditions,
        fileCount: fileCountsMap.get(b.id) ?? 0,
        missingEditionsCount: bookEditions.filter(
          (e) => e.metadataSourceMissingSince !== null,
        ).length,
      });
    });

    // Get quality profile IDs for this author
    const profileLinks = db
      .select({ qualityProfileId: authorQualityProfiles.qualityProfileId })
      .from(authorQualityProfiles)
      .where(eq(authorQualityProfiles.authorId, data.id))
      .all();
    const qualityProfileIds = profileLinks.map((l) => l.qualityProfileId);

    return {
      ...author,
      qualityProfileIds,
      books: booksWithEditions,
      series: authorSeries,
      availableLanguages,
    };
  });

export const createAuthorFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createAuthorSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { qualityProfileIds, ...authorData } = data;
    const author = db.insert(authors).values(authorData).returning().get();

    // Insert join table rows
    for (const profileId of qualityProfileIds) {
      db.insert(authorQualityProfiles)
        .values({ authorId: author.id, qualityProfileId: profileId })
        .run();
    }

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
    const { id, qualityProfileIds } = data;

    const author = db.select().from(authors).where(eq(authors.id, id)).get();
    if (!author) {
      throw new Error("Author not found");
    }

    // Update quality profile assignments
    db.delete(authorQualityProfiles)
      .where(eq(authorQualityProfiles.authorId, id))
      .run();
    for (const profileId of qualityProfileIds) {
      db.insert(authorQualityProfiles)
        .values({ authorId: id, qualityProfileId: profileId })
        .run();
    }

    db.update(authors)
      .set({ updatedAt: new Date() })
      .where(eq(authors.id, id))
      .run();

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

    // Delete the author — DB triggers handle cascading cleanup:
    // 1. FK SET NULL on booksAuthors.authorId → trg_books_authors_cleanup deletes those rows
    // 2. trg_books_orphan_cleanup deletes books with no remaining local authors
    // 3. Book CASCADE deletes editions, series_book_links, etc.
    // 4. trg_series_orphan_cleanup deletes empty series
    // 5. trg_history_orphan_cleanup deletes history with both NULLs
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
