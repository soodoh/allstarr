import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  books,
  bookFiles,
  bookImportListExclusions,
  booksAuthors,
  editions,
  editionDownloadProfiles,
  authorDownloadProfiles,
  downloadProfiles,
  authors,
  history,
  series,
  seriesBookLinks,
} from "src/db/schema";
import { eq, desc, inArray, like, or, and, exists, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import fs from "node:fs";
import { requireAuth } from "./middleware";
import { pickBestEdition, pickBestEditionForProfile } from "src/lib/editions";
import {
  createBookSchema,
  createEditionSchema,
  updateEditionSchema,
  updateBookSchema,
  deleteBookSchema,
  monitorBookProfileSchema,
  unmonitorBookProfileSchema,
  setEditionForProfileSchema,
} from "src/lib/validators";

export const getBooksFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    // Get monitored books with primary author name via booksAuthors
    const result = db
      .select({
        id: books.id,
        title: books.title,
        slug: books.slug,
        authorName: booksAuthors.authorName,
        authorId: booksAuthors.authorId,
        description: books.description,
        releaseDate: books.releaseDate,
        releaseYear: books.releaseYear,
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
      .leftJoin(
        booksAuthors,
        and(
          eq(booksAuthors.bookId, books.id),
          eq(booksAuthors.isPrimary, true),
        ),
      )
      .where(
        exists(
          db
            .select({ one: sql`1` })
            .from(editions)
            .innerJoin(
              editionDownloadProfiles,
              eq(editionDownloadProfiles.editionId, editions.id),
            )
            .where(eq(editions.bookId, books.id)),
        ),
      )
      .orderBy(desc(books.usersCount))
      .all();

    // Fetch all booksAuthors entries for these books
    const bookIds = result.map((b) => b.id);
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

    return result.map((item) =>
      Object.assign(item, {
        bookAuthors: bookAuthorsMap.get(item.id) ?? [],
      }),
    );
  },
);

// oxlint-disable-next-line complexity -- Server function with sort/filter/batch queries
export const getPaginatedBooksFn = createServerFn({ method: "GET" })
  .inputValidator(
    (d: {
      page?: number;
      pageSize?: number;
      search?: string;
      monitored?: boolean;
      sortKey?: string;
      sortDir?: string;
    }) => d,
  )
  // oxlint-disable-next-line complexity -- Handler with sort/filter/batch queries
  .handler(async ({ data }) => {
    await requireAuth();
    const page = data.page || 1;
    const pageSize = data.pageSize || 25;
    const offset = (page - 1) * pageSize;

    // Determine sort order
    const sortDir = data.sortDir === "asc" ? "asc" : "desc";
    const orderFn = sortDir === "asc" ? sql`ASC` : sql`DESC`;
    const sortMapping: Record<string, SQL> = {
      title: sql`${editions.title} ${orderFn}`,
      authorName: sql`${booksAuthors.authorName} ${orderFn}`,
      releaseDate: sql`${books.releaseDate} ${orderFn}`,
      language: sql`${editions.language} ${orderFn}`,
      readers: sql`${books.usersCount} ${orderFn}`,
      rating: sql`${books.rating} ${orderFn}`,
    };
    const orderClause =
      sortMapping[data.sortKey ?? ""] ?? sql`${books.usersCount} DESC`;

    // Query from editions joined to books — each row is a monitored edition
    let query = db
      .select({
        // Edition-level fields
        editionId: editions.id,
        editionTitle: editions.title,
        editionImages: editions.images,
        language: editions.language,
        // Book-level fields
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
        createdAt: books.createdAt,
        updatedAt: books.updatedAt,
        // Primary author info via booksAuthors join
        primaryAuthorName: booksAuthors.authorName,
        primaryAuthorId: booksAuthors.authorId,
        primaryForeignAuthorId: booksAuthors.foreignAuthorId,
      })
      .from(editions)
      .innerJoin(books, eq(editions.bookId, books.id))
      .leftJoin(
        booksAuthors,
        and(
          eq(booksAuthors.bookId, books.id),
          eq(booksAuthors.isPrimary, true),
        ),
      )
      .orderBy(orderClause)
      .$dynamic();

    let countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(editions)
      .innerJoin(books, eq(editions.bookId, books.id))
      .leftJoin(
        booksAuthors,
        and(
          eq(booksAuthors.bookId, books.id),
          eq(booksAuthors.isPrimary, true),
        ),
      )
      .$dynamic();

    const conditions: SQL[] = [];

    // Filter by edition monitored status (has any download profile links)
    if (data.monitored !== undefined) {
      const hasProfile = exists(
        db
          .select({ one: sql`1` })
          .from(editionDownloadProfiles)
          .where(eq(editionDownloadProfiles.editionId, editions.id)),
      );
      conditions.push(data.monitored ? hasProfile : sql`NOT ${hasProfile}`);
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
          like(booksAuthors.authorName, pattern),
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
      Array<{ title: string; position: string | null }>
    >();
    for (const link of seriesLinks) {
      const arr = seriesByBook.get(link.bookId) ?? [];
      arr.push({ title: link.title, position: link.position });
      seriesByBook.set(link.bookId, arr);
    }

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

    // Batch-fetch edition download profile links
    const editionIds = items.map((i) => i.editionId);
    const editionProfileLinks =
      editionIds.length > 0
        ? db
            .select({
              editionId: editionDownloadProfiles.editionId,
              downloadProfileId: editionDownloadProfiles.downloadProfileId,
            })
            .from(editionDownloadProfiles)
            .where(inArray(editionDownloadProfiles.editionId, editionIds))
            .all()
        : [];

    const editionProfilesMap = new Map<number, number[]>();
    for (const link of editionProfileLinks) {
      const arr = editionProfilesMap.get(link.editionId) ?? [];
      arr.push(link.downloadProfileId);
      editionProfilesMap.set(link.editionId, arr);
    }

    // Batch-fetch author download profile IDs
    const uniqueAuthorIds = [
      ...new Set(
        items
          .map((i) => i.primaryAuthorId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const authorProfileLinks =
      uniqueAuthorIds.length > 0
        ? db
            .select({
              authorId: authorDownloadProfiles.authorId,
              downloadProfileId: authorDownloadProfiles.downloadProfileId,
            })
            .from(authorDownloadProfiles)
            .where(inArray(authorDownloadProfiles.authorId, uniqueAuthorIds))
            .all()
        : [];

    const authorProfilesMap = new Map<number, number[]>();
    for (const link of authorProfileLinks) {
      const arr = authorProfilesMap.get(link.authorId) ?? [];
      arr.push(link.downloadProfileId);
      authorProfilesMap.set(link.authorId, arr);
    }

    return {
      items: items.map((item) =>
        Object.assign(item, {
          series: seriesByBook.get(item.id) ?? [],
          bookAuthors: bookAuthorsMap.get(item.id) ?? [],
          authorName: item.primaryAuthorName,
          authorForeignId: item.primaryForeignAuthorId,
          downloadProfileIds: editionProfilesMap.get(item.editionId) ?? [],
          authorDownloadProfileIds:
            item.primaryAuthorId === null
              ? []
              : (authorProfilesMap.get(item.primaryAuthorId) ?? []),
        }),
      ),
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    };
  });

// oxlint-disable-next-line complexity -- Server function with many batch queries and data assembly
export const getAuthorBooksPaginatedFn = createServerFn({ method: "GET" })
  .inputValidator(
    (d: {
      authorId: number;
      page?: number;
      pageSize?: number;
      search?: string;
      language?: string;
      sortKey?: string;
      sortDir?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const page = data.page || 1;
    const pageSize = data.pageSize || 25;
    const offset = (page - 1) * pageSize;

    const sortDir = data.sortDir === "asc" ? "asc" : "desc";
    const orderFn = sortDir === "asc" ? sql`ASC` : sql`DESC`;
    const sortMapping: Record<string, SQL> = {
      title: sql`${books.title} ${orderFn}`,
      releaseDate: sql`${books.releaseDate} ${orderFn}`,
      readers: sql`${books.usersCount} ${orderFn}`,
      rating: sql`${books.rating} ${orderFn}`,
    };
    const orderClause =
      sortMapping[data.sortKey ?? ""] ?? sql`${books.usersCount} DESC`;

    const conditions: SQL[] = [eq(booksAuthors.authorId, data.authorId)];

    if (data.search) {
      conditions.push(like(books.title, `%${data.search}%`));
    }

    if (data.language && data.language !== "all") {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(editions)
            .where(
              and(
                eq(editions.bookId, books.id),
                eq(editions.languageCode, data.language),
              ),
            ),
        ),
      );
    }

    const combined = and(...conditions);

    const countResult = db
      .select({ count: sql<number>`count(DISTINCT ${books.id})` })
      .from(books)
      .innerJoin(booksAuthors, eq(booksAuthors.bookId, books.id))
      .where(combined)
      .get();
    const total = countResult?.count ?? 0;

    const bookRows = db
      .selectDistinct({
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
        metadataSourceMissingSince: books.metadataSourceMissingSince,
        createdAt: books.createdAt,
        updatedAt: books.updatedAt,
      })
      .from(books)
      .innerJoin(booksAuthors, eq(booksAuthors.bookId, books.id))
      .where(combined)
      .orderBy(orderClause)
      .limit(pageSize)
      .offset(offset)
      .all();

    const bookIds = bookRows.map((b) => b.id);

    // Batch-fetch editions for these books
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
              audioLength: editions.audioLength,
              isbn10: editions.isbn10,
              isbn13: editions.isbn13,
              asin: editions.asin,
              publisher: editions.publisher,
              editionInformation: editions.editionInformation,
              language: editions.language,
              languageCode: editions.languageCode,
              country: editions.country,
              usersCount: editions.usersCount,
              score: editions.score,
              images: editions.images,
              isDefaultCover: editions.isDefaultCover,
              metadataSourceMissingSince: editions.metadataSourceMissingSince,
            })
            .from(editions)
            .where(inArray(editions.bookId, bookIds))
            .all()
        : [];

    const editionsByBook = new Map<number, typeof allEditions>();
    for (const e of allEditions) {
      const arr = editionsByBook.get(e.bookId) ?? [];
      arr.push(e);
      editionsByBook.set(e.bookId, arr);
    }

    // Batch-fetch edition download profiles
    const editionIds = allEditions.map((e) => e.id);
    const editionProfileLinks =
      editionIds.length > 0
        ? db
            .select({
              editionId: editionDownloadProfiles.editionId,
              downloadProfileId: editionDownloadProfiles.downloadProfileId,
            })
            .from(editionDownloadProfiles)
            .where(inArray(editionDownloadProfiles.editionId, editionIds))
            .all()
        : [];

    const editionProfilesMap = new Map<number, number[]>();
    for (const link of editionProfileLinks) {
      const arr = editionProfilesMap.get(link.editionId) ?? [];
      arr.push(link.downloadProfileId);
      editionProfilesMap.set(link.editionId, arr);
    }

    // Batch-fetch booksAuthors
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

    // Batch-fetch series
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
      Array<{ title: string; position: string | null }>
    >();
    for (const link of seriesLinks) {
      const arr = seriesByBook.get(link.bookId) ?? [];
      arr.push({ title: link.title, position: link.position });
      seriesByBook.set(link.bookId, arr);
    }

    // Batch-fetch file counts
    const fileCounts =
      bookIds.length > 0
        ? db
            .select({
              bookId: bookFiles.bookId,
              count: sql<number>`count(*)`,
            })
            .from(bookFiles)
            .where(inArray(bookFiles.bookId, bookIds))
            .groupBy(bookFiles.bookId)
            .all()
        : [];

    const fileCountMap = new Map<number, number>();
    for (const fc of fileCounts) {
      fileCountMap.set(fc.bookId, fc.count);
    }

    // Pick best edition per book and flatten
    const lang = data.language || "all";

    // oxlint-disable-next-line complexity -- Maps many nullable edition fields with fallbacks
    const items = bookRows.map((book) => {
      const bookEditions = editionsByBook.get(book.id) ?? [];
      const edition = pickBestEdition(bookEditions, lang);
      const primaryAuthor = (bookAuthorsMap.get(book.id) ?? []).find(
        (a) => a.isPrimary,
      );

      // Book-level downloadProfileIds = union of all edition profiles
      const bookDownloadProfileIds = [
        ...new Set(
          bookEditions.flatMap((e) => editionProfilesMap.get(e.id) ?? []),
        ),
      ];

      // Missing editions count
      const missingEditionsCount = bookEditions.filter(
        (e) => e.metadataSourceMissingSince !== null,
      ).length;

      return {
        id: book.id,
        title: !edition || edition.isDefaultCover ? book.title : edition.title,
        coverUrl: edition?.images?.[0]?.url ?? book.images?.[0]?.url ?? null,
        bookAuthors: bookAuthorsMap.get(book.id) ?? [],
        authorName: primaryAuthor?.authorName ?? null,
        releaseDate:
          edition?.releaseDate ??
          book.releaseDate ??
          (book.releaseYear ? String(book.releaseYear) : null),
        usersCount: book.usersCount,
        rating: book.rating,
        ratingsCount: book.ratingsCount,
        format: edition?.format ?? null,
        pageCount: edition?.pageCount ?? null,
        isbn10: edition?.isbn10 ?? null,
        isbn13: edition?.isbn13 ?? null,
        asin: edition?.asin ?? null,
        score: edition?.score ?? null,
        publisher: edition?.publisher ?? null,
        editionInformation: edition?.editionInformation ?? null,
        language: edition?.language ?? null,
        country: edition?.country ?? null,
        series: seriesByBook.get(book.id) ?? [],
        downloadProfileIds: bookDownloadProfileIds,
        metadataSourceMissingSince: book.metadataSourceMissingSince,
        fileCount: fileCountMap.get(book.id) ?? 0,
        missingEditionsCount,
      };
    });

    return { items, total, page, totalPages: Math.ceil(total / pageSize) };
  });

export const getBookEditionsPaginatedFn = createServerFn({ method: "GET" })
  .inputValidator(
    (d: {
      bookId: number;
      page?: number;
      pageSize?: number;
      sortKey?: string;
      sortDir?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const page = data.page || 1;
    const pageSize = data.pageSize || 25;
    const offset = (page - 1) * pageSize;

    const sortDir = data.sortDir === "asc" ? "asc" : "desc";
    const orderFn = sortDir === "asc" ? sql`ASC` : sql`DESC`;
    const sortMapping: Record<string, SQL> = {
      title: sql`${editions.title} ${orderFn}`,
      publisher: sql`${editions.publisher} ${orderFn}`,
      information: sql`${editions.editionInformation} ${orderFn}`,
      format: sql`${editions.format} ${orderFn}`,
      pages: sql`${editions.pageCount} ${orderFn}`,
      releaseDate: sql`${editions.releaseDate} ${orderFn}`,
      isbn13: sql`${editions.isbn13} ${orderFn}`,
      isbn10: sql`${editions.isbn10} ${orderFn}`,
      asin: sql`${editions.asin} ${orderFn}`,
      language: sql`${editions.language} ${orderFn}`,
      country: sql`${editions.country} ${orderFn}`,
      readers: sql`${editions.usersCount} ${orderFn}`,
      score: sql`${editions.score} ${orderFn}`,
    };
    const orderClause =
      sortMapping[data.sortKey ?? ""] ?? sql`${editions.usersCount} DESC`;

    const countResult = db
      .select({ count: sql<number>`count(*)` })
      .from(editions)
      .where(eq(editions.bookId, data.bookId))
      .get();
    const total = countResult?.count ?? 0;

    const editionRows = db
      .select({
        id: editions.id,
        bookId: editions.bookId,
        title: editions.title,
        isbn10: editions.isbn10,
        isbn13: editions.isbn13,
        asin: editions.asin,
        format: editions.format,
        pageCount: editions.pageCount,
        audioLength: editions.audioLength,
        publisher: editions.publisher,
        editionInformation: editions.editionInformation,
        releaseDate: editions.releaseDate,
        language: editions.language,
        languageCode: editions.languageCode,
        country: editions.country,
        usersCount: editions.usersCount,
        score: editions.score,
        foreignEditionId: editions.foreignEditionId,
        images: editions.images,
        metadataSourceMissingSince: editions.metadataSourceMissingSince,
      })
      .from(editions)
      .where(eq(editions.bookId, data.bookId))
      .orderBy(orderClause)
      .limit(pageSize)
      .offset(offset)
      .all();

    // Batch-fetch download profiles
    const editionIds = editionRows.map((e) => e.id);
    const profileLinks =
      editionIds.length > 0
        ? db
            .select({
              editionId: editionDownloadProfiles.editionId,
              downloadProfileId: editionDownloadProfiles.downloadProfileId,
            })
            .from(editionDownloadProfiles)
            .where(inArray(editionDownloadProfiles.editionId, editionIds))
            .all()
        : [];

    const profilesMap = new Map<number, number[]>();
    for (const link of profileLinks) {
      const arr = profilesMap.get(link.editionId) ?? [];
      arr.push(link.downloadProfileId);
      profilesMap.set(link.editionId, arr);
    }

    return {
      items: editionRows.map((e) =>
        Object.assign(e, {
          downloadProfileIds: profilesMap.get(e.id) ?? [],
        }),
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
        description: books.description,
        releaseDate: books.releaseDate,
        releaseYear: books.releaseYear,
        foreignBookId: books.foreignBookId,
        images: books.images,
        rating: books.rating,
        ratingsCount: books.ratingsCount,
        usersCount: books.usersCount,
        tags: books.tags,
        autoSwitchEdition: books.autoSwitchEdition,
        metadataUpdatedAt: books.metadataUpdatedAt,
        metadataSourceMissingSince: books.metadataSourceMissingSince,
        createdAt: books.createdAt,
        updatedAt: books.updatedAt,
      })
      .from(books)
      .where(eq(books.id, data.id))
      .get();
    if (!book) {
      throw new Error("Book not found");
    }

    // Get all booksAuthors entries for this book
    const bookAuthorEntries = db
      .select({
        authorId: booksAuthors.authorId,
        foreignAuthorId: booksAuthors.foreignAuthorId,
        authorName: booksAuthors.authorName,
        isPrimary: booksAuthors.isPrimary,
      })
      .from(booksAuthors)
      .where(eq(booksAuthors.bookId, data.id))
      .all();

    const primaryAuthor = bookAuthorEntries.find((a) => a.isPrimary);

    // Derive authorId from primary author's local ID
    const authorId = primaryAuthor?.authorId ?? null;
    const authorName = primaryAuthor?.authorName ?? null;

    const bookEditions = db
      .select({
        id: editions.id,
        bookId: editions.bookId,
        title: editions.title,
        isbn10: editions.isbn10,
        isbn13: editions.isbn13,
        asin: editions.asin,
        format: editions.format,
        pageCount: editions.pageCount,
        audioLength: editions.audioLength,
        publisher: editions.publisher,
        editionInformation: editions.editionInformation,
        releaseDate: editions.releaseDate,
        language: editions.language,
        languageCode: editions.languageCode,
        country: editions.country,
        usersCount: editions.usersCount,
        score: editions.score,
        foreignEditionId: editions.foreignEditionId,
        images: editions.images,
        contributors: editions.contributors,
        isDefaultCover: editions.isDefaultCover,
        metadataUpdatedAt: editions.metadataUpdatedAt,
        metadataSourceMissingSince: editions.metadataSourceMissingSince,
        createdAt: editions.createdAt,
      })
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

    // Count files attached to this book
    const fileCountResult = db
      .select({ count: sql<number>`count(*)` })
      .from(bookFiles)
      .where(eq(bookFiles.bookId, data.id))
      .get();

    // Fetch all book files
    const files = db
      .select()
      .from(bookFiles)
      .where(eq(bookFiles.bookId, data.id))
      .all();

    // Batch-fetch edition download profile links
    const editionIds = bookEditions.map((e) => e.id);
    const editionProfileLinks =
      editionIds.length > 0
        ? db
            .select({
              editionId: editionDownloadProfiles.editionId,
              downloadProfileId: editionDownloadProfiles.downloadProfileId,
            })
            .from(editionDownloadProfiles)
            .where(inArray(editionDownloadProfiles.editionId, editionIds))
            .all()
        : [];

    const editionProfilesMap = new Map<number, number[]>();
    for (const link of editionProfileLinks) {
      const arr = editionProfilesMap.get(link.editionId) ?? [];
      arr.push(link.downloadProfileId);
      editionProfilesMap.set(link.editionId, arr);
    }

    // Get author download profile IDs from primary author
    const authorDownloadProfileIds = authorId
      ? db
          .select({
            downloadProfileId: authorDownloadProfiles.downloadProfileId,
          })
          .from(authorDownloadProfiles)
          .where(eq(authorDownloadProfiles.authorId, authorId))
          .all()
          .map((l) => l.downloadProfileId)
      : [];

    // Count editions with missing metadata
    const missingEditionsCount = bookEditions.filter(
      (e) => e.metadataSourceMissingSince !== null,
    ).length;

    // Build editions with downloadProfileIds
    const editionsWithProfiles = bookEditions.map((e) =>
      Object.assign(e, {
        downloadProfileIds: editionProfilesMap.get(e.id) ?? [],
      }),
    );

    // Book-level downloadProfileIds = union of all edition profile IDs
    const bookDownloadProfileIds = [
      ...new Set(editionsWithProfiles.flatMap((e) => e.downloadProfileIds)),
    ];

    return {
      ...book,
      downloadProfileIds: bookDownloadProfileIds,
      authorDownloadProfileIds,
      authorId,
      authorName,
      bookAuthors: bookAuthorEntries,
      editions: editionsWithProfiles,
      series: bookSeries,
      languages,
      fileCount: fileCountResult?.count ?? 0,
      files,
      missingEditionsCount,
    };
  });

export const createBookFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createBookSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { authorId, ...bookData } = data;
    const book = db.insert(books).values(bookData).returning().get();

    // Create primary booksAuthors entry
    const author = db
      .select({
        name: authors.name,
        foreignAuthorId: authors.foreignAuthorId,
      })
      .from(authors)
      .where(eq(authors.id, authorId))
      .get();

    if (author) {
      db.insert(booksAuthors)
        .values({
          bookId: book.id,
          authorId,
          foreignAuthorId: author.foreignAuthorId ?? `local-${authorId}`,
          authorName: author.name,
          isPrimary: true,
        })
        .run();
    }

    db.insert(history)
      .values({
        eventType: "bookAdded",
        bookId: book.id,
        authorId,
        data: { title: book.title },
      })
      .run();

    return book;
  });

export const updateBookFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateBookSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...updates } = data;
    db.update(books)
      .set({
        autoSwitchEdition: updates.autoSwitchEdition ? 1 : 0,
        updatedAt: new Date(),
      })
      .where(eq(books.id, id))
      .run();
    return { success: true };
  });

export const deleteBookFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deleteBookSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const book = db.select().from(books).where(eq(books.id, data.id)).get();
    if (!book) {
      throw new Error("Book not found");
    }

    // Get primary author for history
    const primaryEntry = db
      .select({
        authorId: booksAuthors.authorId,
        authorName: booksAuthors.authorName,
      })
      .from(booksAuthors)
      .where(
        and(eq(booksAuthors.bookId, data.id), eq(booksAuthors.isPrimary, true)),
      )
      .get();

    // Delete files from disk if requested
    if (data.deleteFiles) {
      const files = db
        .select({ path: bookFiles.path })
        .from(bookFiles)
        .where(eq(bookFiles.bookId, data.id))
        .all();
      for (const file of files) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // File may already be missing
        }
      }
    }

    // Add to import exclusion list if requested
    if (data.addImportExclusion && book.foreignBookId) {
      db.insert(bookImportListExclusions)
        .values({
          foreignBookId: book.foreignBookId,
          title: book.title,
          authorName: primaryEntry?.authorName ?? "Unknown",
        })
        .onConflictDoNothing()
        .run();
    }

    // Delete book (cascades to editions, files, etc.)
    db.delete(books).where(eq(books.id, data.id)).run();

    // Log history
    db.insert(history)
      .values({
        eventType: "bookDeleted",
        authorId: primaryEntry?.authorId ?? undefined,
        data: { title: book.title },
      })
      .run();

    return { success: true };
  });

export const monitorBookProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => monitorBookProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { bookId, downloadProfileId } = data;

    const profile = db
      .select()
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, downloadProfileId))
      .get();
    if (!profile) {
      throw new Error("Download profile not found");
    }

    const bookEditions = db
      .select()
      .from(editions)
      .where(eq(editions.bookId, bookId))
      .all();

    const bestEdition = pickBestEditionForProfile(bookEditions, {
      ...profile,
      contentType: profile.contentType as "ebook" | "audiobook",
    });
    if (!bestEdition) {
      throw new Error("No suitable edition found");
    }

    // Remove any existing edition-profile links for this book + profile
    const bookEditionIds = bookEditions.map((e) => e.id);
    if (bookEditionIds.length > 0) {
      db.delete(editionDownloadProfiles)
        .where(
          and(
            inArray(editionDownloadProfiles.editionId, bookEditionIds),
            eq(editionDownloadProfiles.downloadProfileId, downloadProfileId),
          ),
        )
        .run();
    }

    db.insert(editionDownloadProfiles)
      .values({ editionId: bestEdition.id, downloadProfileId })
      .run();

    // Record history — data column is JSON mode, pass plain object (NOT JSON.stringify)
    const book = db.select().from(books).where(eq(books.id, bookId)).get();
    if (book) {
      db.insert(history)
        .values({
          eventType: "bookUpdated",
          bookId,
          data: {
            action: "profile-added",
            bookTitle: book.title,
            editionId: bestEdition.id,
            editionTitle: bestEdition.title,
            downloadProfileId,
            profileName: profile.name,
          },
        })
        .run();
    }

    return { bookId, editionId: bestEdition.id };
  });

export const unmonitorBookProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => unmonitorBookProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { bookId, downloadProfileId, deleteFiles } = data;

    const bookEditions = db
      .select({ id: editions.id })
      .from(editions)
      .where(eq(editions.bookId, bookId))
      .all();

    const bookEditionIds = bookEditions.map((e) => e.id);
    if (bookEditionIds.length > 0) {
      db.delete(editionDownloadProfiles)
        .where(
          and(
            inArray(editionDownloadProfiles.editionId, bookEditionIds),
            eq(editionDownloadProfiles.downloadProfileId, downloadProfileId),
          ),
        )
        .run();
    }

    if (deleteFiles) {
      const files = db
        .select()
        .from(bookFiles)
        .where(eq(bookFiles.bookId, bookId))
        .all();
      const fs = await import("node:fs");
      for (const file of files) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          /* file may not exist */
        }
      }
      db.delete(bookFiles).where(eq(bookFiles.bookId, bookId)).run();
    }

    const profile = db
      .select()
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, downloadProfileId))
      .get();
    const book = db.select().from(books).where(eq(books.id, bookId)).get();
    if (book) {
      db.insert(history)
        .values({
          eventType: "bookUpdated",
          bookId,
          data: {
            action: "profile-removed",
            bookTitle: book.title,
            downloadProfileId,
            profileName: profile?.name ?? null,
            filesDeleted: deleteFiles,
          },
        })
        .run();
    }

    return { bookId };
  });

export const setEditionForProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => setEditionForProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { editionId, downloadProfileId } = data;

    const edition = db
      .select()
      .from(editions)
      .where(eq(editions.id, editionId))
      .get();
    if (!edition) {
      throw new Error("Edition not found");
    }

    const bookEditions = db
      .select({ id: editions.id })
      .from(editions)
      .where(eq(editions.bookId, edition.bookId))
      .all();

    const bookEditionIds = bookEditions.map((e) => e.id);
    if (bookEditionIds.length > 0) {
      db.delete(editionDownloadProfiles)
        .where(
          and(
            inArray(editionDownloadProfiles.editionId, bookEditionIds),
            eq(editionDownloadProfiles.downloadProfileId, downloadProfileId),
          ),
        )
        .run();
    }

    db.insert(editionDownloadProfiles)
      .values({ editionId, downloadProfileId })
      .run();

    return { editionId };
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

export const deleteEditionFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(editions).where(eq(editions.id, data.id)).run();
    return { success: true };
  });

export const reassignBookFilesFn = createServerFn({ method: "POST" })
  .inputValidator((d: { fromBookId: number; toBookId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    // Verify target book exists
    const target = db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.id, data.toBookId))
      .get();
    if (!target) {
      throw new Error("Target book not found");
    }

    const updated = db
      .update(bookFiles)
      .set({ bookId: data.toBookId })
      .where(eq(bookFiles.bookId, data.fromBookId))
      .returning({ id: bookFiles.id })
      .all();

    return { reassigned: updated.length };
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
      .innerJoin(booksAuthors, eq(books.id, booksAuthors.bookId))
      .where(eq(booksAuthors.authorId, data.authorId))
      .all()
      .filter((l) => l.languageCode && l.language) as Array<{
      languageCode: string;
      language: string;
    }>;
  });
