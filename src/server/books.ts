import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  books,
  bookFiles,
  booksAuthors,
  editions,
  editionQualityProfiles,
  authorQualityProfiles,
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
  createEditionSchema,
  updateEditionSchema,
  toggleBookProfileSchema,
  toggleEditionProfileSchema,
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
              editionQualityProfiles,
              eq(editionQualityProfiles.editionId, editions.id),
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
      .orderBy(desc(books.usersCount))
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

    // Filter by edition monitored status (has any quality profile links)
    if (data.monitored !== undefined) {
      const hasProfile = exists(
        db
          .select({ one: sql`1` })
          .from(editionQualityProfiles)
          .where(eq(editionQualityProfiles.editionId, editions.id)),
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

    return {
      items: items.map((item) =>
        Object.assign(item, {
          series: seriesByBook.get(item.id) ?? [],
          bookAuthors: bookAuthorsMap.get(item.id) ?? [],
          // Flatten primary author for backward compat
          authorName: item.primaryAuthorName,
          authorForeignId: item.primaryForeignAuthorId,
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

    // Batch-fetch edition quality profile links
    const editionIds = bookEditions.map((e) => e.id);
    const editionProfileLinks =
      editionIds.length > 0
        ? db
            .select({
              editionId: editionQualityProfiles.editionId,
              qualityProfileId: editionQualityProfiles.qualityProfileId,
            })
            .from(editionQualityProfiles)
            .where(inArray(editionQualityProfiles.editionId, editionIds))
            .all()
        : [];

    const editionProfilesMap = new Map<number, number[]>();
    for (const link of editionProfileLinks) {
      const arr = editionProfilesMap.get(link.editionId) ?? [];
      arr.push(link.qualityProfileId);
      editionProfilesMap.set(link.editionId, arr);
    }

    // Get author quality profile IDs from primary author
    const authorQualityProfileIds = authorId
      ? db
          .select({
            qualityProfileId: authorQualityProfiles.qualityProfileId,
          })
          .from(authorQualityProfiles)
          .where(eq(authorQualityProfiles.authorId, authorId))
          .all()
          .map((l) => l.qualityProfileId)
      : [];

    // Count editions with missing metadata
    const missingEditionsCount = bookEditions.filter(
      (e) => e.metadataSourceMissingSince !== null,
    ).length;

    // Build editions with qualityProfileIds
    const editionsWithProfiles = bookEditions.map((e) =>
      Object.assign(e, {
        qualityProfileIds: editionProfilesMap.get(e.id) ?? [],
      }),
    );

    // Book-level qualityProfileIds = union of all edition profile IDs
    const bookQualityProfileIds = [
      ...new Set(editionsWithProfiles.flatMap((e) => e.qualityProfileIds)),
    ];

    return {
      ...book,
      qualityProfileIds: bookQualityProfileIds,
      authorQualityProfileIds,
      authorId,
      authorName,
      bookAuthors: bookAuthorEntries,
      editions: editionsWithProfiles,
      series: bookSeries,
      languages,
      fileCount: fileCountResult?.count ?? 0,
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

export const deleteBookFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const book = db.select().from(books).where(eq(books.id, data.id)).get();

    // Get primary author for history before deletion
    const primaryEntry = db
      .select({ authorId: booksAuthors.authorId })
      .from(booksAuthors)
      .where(
        and(eq(booksAuthors.bookId, data.id), eq(booksAuthors.isPrimary, true)),
      )
      .get();

    db.delete(books).where(eq(books.id, data.id)).run();

    if (book) {
      db.insert(history)
        .values({
          eventType: "bookDeleted",
          authorId: primaryEntry?.authorId ?? undefined,
          data: { title: book.title },
        })
        .run();
    }

    return { success: true };
  });

// Toggle a quality profile on/off for a book's default cover edition
export const toggleBookProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => toggleBookProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    // Find the default cover edition (or first by readers)
    const defaultEdition = db
      .select({ id: editions.id })
      .from(editions)
      .where(
        and(
          eq(editions.bookId, data.bookId),
          eq(editions.isDefaultCover, true),
        ),
      )
      .get();

    const targetEdition =
      defaultEdition ??
      db
        .select({ id: editions.id })
        .from(editions)
        .where(eq(editions.bookId, data.bookId))
        .orderBy(desc(editions.usersCount))
        .limit(1)
        .get();

    if (!targetEdition) {
      throw new Error("No edition found for this book");
    }

    // Check if link exists
    const existing = db
      .select({ id: editionQualityProfiles.id })
      .from(editionQualityProfiles)
      .where(
        and(
          eq(editionQualityProfiles.editionId, targetEdition.id),
          eq(editionQualityProfiles.qualityProfileId, data.qualityProfileId),
        ),
      )
      .get();

    if (existing) {
      db.delete(editionQualityProfiles)
        .where(eq(editionQualityProfiles.id, existing.id))
        .run();
    } else {
      db.insert(editionQualityProfiles)
        .values({
          editionId: targetEdition.id,
          qualityProfileId: data.qualityProfileId,
        })
        .run();
    }

    db.insert(history)
      .values({
        eventType: "bookUpdated",
        bookId: data.bookId,
        data: {
          action: existing ? "profile-removed" : "profile-added",
          qualityProfileId: data.qualityProfileId,
        },
      })
      .run();

    return { bookId: data.bookId };
  });

// Toggle a quality profile on/off for a specific edition
export const toggleEditionProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => toggleEditionProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    // Check if link exists
    const existing = db
      .select({ id: editionQualityProfiles.id })
      .from(editionQualityProfiles)
      .where(
        and(
          eq(editionQualityProfiles.editionId, data.editionId),
          eq(editionQualityProfiles.qualityProfileId, data.qualityProfileId),
        ),
      )
      .get();

    if (existing) {
      db.delete(editionQualityProfiles)
        .where(eq(editionQualityProfiles.id, existing.id))
        .run();
    } else {
      db.insert(editionQualityProfiles)
        .values({
          editionId: data.editionId,
          qualityProfileId: data.qualityProfileId,
        })
        .run();
    }

    return { editionId: data.editionId };
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
