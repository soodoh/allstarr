import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "src/db";
import {
  authors,
  books,
  editions,
  series,
  seriesBookLinks,
  history,
} from "src/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  fetchAuthorComplete,
  fetchBatchedEditions,
  fetchBookComplete,
  getAuthorizationHeader,
} from "./hardcover/import-queries";

// ---------- Shared helpers ----------

function deriveSortName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length > 1) {
    return `${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}`;
  }
  return name;
}

function toImageArray(
  url: string | undefined,
): Array<{ url: string; coverType: string }> | undefined {
  if (!url) {return undefined;}
  return [{ url, coverType: "poster" }];
}

/**
 * Non-author contributor roles to exclude from additionalAuthors.
 * These are people who contributed to the book but are not co-authors.
 */
const NON_AUTHOR_ROLES = new Set([
  "Narrator",
  "Illustrator",
  "Translator",
  "Editor",
  "Foreword",
  "Introduction",
  "Afterword",
  "Cover artist",
  "Cover design",
  "Photographer",
  "Reader",
]);

/**
 * Derive additional authors from a book's contributions list.
 * Excludes the primary author (identified by foreignAuthorId) and
 * non-author roles (Narrator, Illustrator, Translator, etc.).
 */
function deriveAdditionalAuthors(
  contributions: Array<{
    authorId: number;
    authorName: string;
    contribution: string | undefined;
    position: number;
  }>,
  primaryForeignAuthorId: number,
): string[] | undefined {
  const additional = contributions
    .filter(
      (c) =>
        c.authorId !== primaryForeignAuthorId &&
        (c.contribution === undefined || !NON_AUTHOR_ROLES.has(c.contribution)),
    )
    .toSorted((a, b) => a.position - b.position)
    .map((c) => c.authorName);
  return additional.length > 0 ? additional : undefined;
}

// ---------- Zod schemas ----------

const importAuthorSchema = z.object({
  foreignAuthorId: z.number().int().positive(),
  qualityProfileId: z.number().int().positive().optional(),
  rootFolderPath: z.string().min(1).optional(),
});

const importBookSchema = z.object({
  foreignBookId: z.number().int().positive(),
  qualityProfileId: z.number().int().positive().optional(),
  rootFolderPath: z.string().min(1).optional(),
});

const refreshAuthorSchema = z.object({
  authorId: z.number().int().positive(),
});

const refreshBookSchema = z.object({
  bookId: z.number().int().positive(),
});

const monitorBookSchema = z.object({
  bookId: z.number().int().positive(),
});

// ---------- Import Author ----------

export const importHardcoverAuthorFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => importAuthorSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const authorization = getAuthorizationHeader();

    // Duplicate guard
    const existing = db
      .select({ id: authors.id })
      .from(authors)
      .where(eq(authors.foreignAuthorId, String(data.foreignAuthorId)))
      .get();
    if (existing) {
      throw new Error("Author is already in your library.");
    }

    // ── Server-side fetch ──
    const { author: rawAuthor, books: rawBooks } = await fetchAuthorComplete(
      data.foreignAuthorId,
      authorization,
    );

    // Fetch editions only for author's own books
    const authorBookIds = rawBooks.map((b) => b.id);
    const editionsMap = await fetchBatchedEditions(
      authorBookIds,
      authorization,
    );

    // ── DB transaction ──
    return db.transaction((tx) => {
      const now = new Date();

      // Double-check inside transaction to prevent race conditions
      const existingInTx = tx
        .select({ id: authors.id })
        .from(authors)
        .where(eq(authors.foreignAuthorId, String(data.foreignAuthorId)))
        .get();
      if (existingInTx) {
        throw new Error("Author is already in your library.");
      }

      // Insert primary author
      const author = tx
        .insert(authors)
        .values({
          name: rawAuthor.name,
          sortName: deriveSortName(rawAuthor.name),
          slug: rawAuthor.slug,
          bio: rawAuthor.bio,
          bornYear: rawAuthor.bornYear,
          deathYear: rawAuthor.deathYear,
          status: rawAuthor.deathYear ? "deceased" : "continuing",
          isStub: false,
          qualityProfileId: data.qualityProfileId,
          rootFolderPath: data.rootFolderPath,
          foreignAuthorId: String(data.foreignAuthorId),
          images: toImageArray(rawAuthor.imageUrl),
          metadataUpdatedAt: now,
        })
        .returning()
        .get();

      tx.insert(history)
        .values({
          eventType: "authorAdded",
          authorId: author.id,
          data: { name: author.name, source: "hardcover" },
        })
        .run();

      // Cache: foreignSeriesId → local series id
      const seriesCache = new Map<number, number>();

      // Helper: ensure series exists
      function ensureSeries(
        foreignId: number,
        title: string,
        slug: string | undefined,
        isCompleted: boolean | undefined,
      ): number {
        const cached = seriesCache.get(foreignId);
        if (cached !== undefined) {return cached;}

        const existing = tx
          .select({ id: series.id })
          .from(series)
          .where(eq(series.foreignSeriesId, String(foreignId)))
          .get();
        if (existing) {
          seriesCache.set(foreignId, existing.id);
          return existing.id;
        }

        const newSeries = tx
          .insert(series)
          .values({
            title,
            slug,
            foreignSeriesId: String(foreignId),
            isCompleted,
            metadataUpdatedAt: now,
          })
          .returning()
          .get();
        seriesCache.set(foreignId, newSeries.id);
        return newSeries.id;
      }

      // Insert all author books (unmonitored)
      let booksAdded = 0;
      let editionsAdded = 0;
      for (const rawBook of rawBooks) {
        // Check if book already in DB
        const existingBook = tx
          .select({ id: books.id })
          .from(books)
          .where(eq(books.foreignBookId, String(rawBook.id)))
          .get();
        if (existingBook) {continue;}

        const additionalAuthors = deriveAdditionalAuthors(
          rawBook.contributions,
          data.foreignAuthorId,
        );

        const book = tx
          .insert(books)
          .values({
            title: rawBook.title,
            slug: rawBook.slug,
            authorId: author.id,
            description: rawBook.description,
            releaseDate: rawBook.releaseDate,
            releaseYear: rawBook.releaseYear,
            monitored: false,
            foreignBookId: String(rawBook.id),
            images: toImageArray(rawBook.coverUrl),
            rating: rawBook.rating,
            ratingsCount: rawBook.ratingsCount,
            usersCount: rawBook.usersCount,
            additionalAuthors,
            metadataUpdatedAt: now,
          })
          .returning()
          .get();

        booksAdded += 1;

        // Series links
        for (const s of rawBook.series ?? []) {
          const localSeriesId = ensureSeries(
            s.seriesId,
            s.seriesTitle,
            s.seriesSlug,
            s.isCompleted,
          );
          tx.insert(seriesBookLinks)
            .values({
              seriesId: localSeriesId,
              bookId: book.id,
              position: s.position,
            })
            .run();
        }

        // Editions
        const bookEditions = editionsMap.get(rawBook.id) ?? [];
        for (const ed of bookEditions) {
          tx.insert(editions)
            .values({
              bookId: book.id,
              title: ed.title,
              isbn10: ed.isbn10,
              isbn13: ed.isbn13,
              asin: ed.asin,
              format: ed.format,
              pageCount: ed.pageCount,
              publisher: ed.publisher,
              editionInformation: ed.editionInformation,
              releaseDate: ed.releaseDate,
              language: ed.language,
              languageCode: ed.languageCode,
              country: ed.country,
              usersCount: ed.usersCount,
              score: ed.score,
              foreignEditionId: String(ed.id),
              images: toImageArray(ed.coverUrl),
              contributors: ed.contributors,
              metadataUpdatedAt: now,
            })
            .run();
        }
        editionsAdded += bookEditions.length;

        // History event
        tx.insert(history)
          .values({
            eventType: "bookAdded",
            bookId: book.id,
            authorId: author.id,
            data: { title: rawBook.title, source: "hardcover" },
          })
          .run();
      }

      return { authorId: author.id, booksAdded, editionsAdded };
    });
  });

// ---------- Import Single Book ----------

export const importHardcoverBookFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => importBookSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const authorization = getAuthorizationHeader();

    // Duplicate guard
    const existing = db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.foreignBookId, String(data.foreignBookId)))
      .get();
    if (existing) {
      throw new Error("Book is already in your library.");
    }

    // Fetch book complete (book + editions + contributions)
    const result = await fetchBookComplete(data.foreignBookId, authorization);
    if (!result) {
      throw new Error("Book not found on Hardcover.");
    }

    const { book: rawBook, editions: rawEditions } = result;
    const now = new Date();

    return db.transaction((tx) => {
      // Determine primary author
      const primaryContrib = rawBook.contributions.find(
        (c) => c.contribution === undefined,
      );
      let primaryAuthorId: number;

      if (primaryContrib) {
        // Check if author exists
        const existingAuthor = tx
          .select({ id: authors.id })
          .from(authors)
          .where(
            eq(authors.foreignAuthorId, String(primaryContrib.authorId)),
          )
          .get();

        if (existingAuthor) {
          primaryAuthorId = existingAuthor.id;
        } else {
          // Create stub author
          const newAuthor = tx
            .insert(authors)
            .values({
              name: primaryContrib.authorName,
              sortName: deriveSortName(primaryContrib.authorName),
              slug: primaryContrib.authorSlug,
              isStub: true,
              monitored: false,
              foreignAuthorId: String(primaryContrib.authorId),
              images: toImageArray(primaryContrib.authorImageUrl),
              qualityProfileId: data.qualityProfileId,
              rootFolderPath: data.rootFolderPath,
              metadataUpdatedAt: now,
            })
            .returning()
            .get();
          primaryAuthorId = newAuthor.id;

          tx.insert(history)
            .values({
              eventType: "authorAdded",
              authorId: newAuthor.id,
              data: {
                name: primaryContrib.authorName,
                source: "hardcover",
              },
            })
            .run();
        }
      } else {
        throw new Error(
          "Could not determine the author of this book.",
        );
      }

      const additionalAuthors = deriveAdditionalAuthors(
        rawBook.contributions,
        primaryContrib.authorId,
      );

      // Insert book (monitored — user explicitly chose it)
      const book = tx
        .insert(books)
        .values({
          title: rawBook.title,
          slug: rawBook.slug,
          authorId: primaryAuthorId,
          description: rawBook.description,
          releaseDate: rawBook.releaseDate,
          releaseYear: rawBook.releaseYear,
          monitored: true,
          foreignBookId: String(rawBook.id),
          images: toImageArray(rawBook.coverUrl),
          rating: rawBook.rating,
          ratingsCount: rawBook.ratingsCount,
          usersCount: rawBook.usersCount,
          additionalAuthors,
          metadataUpdatedAt: now,
        })
        .returning()
        .get();

      // Series links
      for (const s of rawBook.series) {
        const existingSeries = tx
          .select({ id: series.id })
          .from(series)
          .where(eq(series.foreignSeriesId, String(s.seriesId)))
          .get();

        let localSeriesId: number;
        if (existingSeries) {
          localSeriesId = existingSeries.id;
        } else {
          const newSeries = tx
            .insert(series)
            .values({
              title: s.seriesTitle,
              slug: s.seriesSlug,
              foreignSeriesId: String(s.seriesId),
              isCompleted: s.isCompleted,
              metadataUpdatedAt: now,
            })
            .returning()
            .get();
          localSeriesId = newSeries.id;
        }

        tx.insert(seriesBookLinks)
          .values({
            seriesId: localSeriesId,
            bookId: book.id,
            position: s.position,
          })
          .run();
      }

      // Editions
      for (const ed of rawEditions) {
        tx.insert(editions)
          .values({
            bookId: book.id,
            title: ed.title,
            isbn10: ed.isbn10,
            isbn13: ed.isbn13,
            asin: ed.asin,
            format: ed.format,
            pageCount: ed.pageCount,
            publisher: ed.publisher,
            editionInformation: ed.editionInformation,
            releaseDate: ed.releaseDate,
            language: ed.language,
            languageCode: ed.languageCode,
            country: ed.country,
            usersCount: ed.usersCount,
            score: ed.score,
            foreignEditionId: String(ed.id),
            images: toImageArray(ed.coverUrl),
            contributors: ed.contributors,
            metadataUpdatedAt: now,
          })
          .run();
      }

      tx.insert(history)
        .values({
          eventType: "bookAdded",
          bookId: book.id,
          authorId: primaryAuthorId,
          data: { title: book.title, source: "hardcover" },
        })
        .run();

      return { bookId: book.id, authorId: primaryAuthorId };
    });
  });

// ---------- Refresh Author Metadata ----------

export const refreshAuthorMetadataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => refreshAuthorSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const authorization = getAuthorizationHeader();

    const localAuthor = db
      .select()
      .from(authors)
      .where(eq(authors.id, data.authorId))
      .get();
    if (!localAuthor) {
      throw new Error("Author not found.");
    }
    if (!localAuthor.foreignAuthorId) {
      throw new Error("Author has no Hardcover ID.");
    }

    const foreignAuthorId = Number(localAuthor.foreignAuthorId);

    // Fetch fresh data from Hardcover
    const { author: rawAuthor, books: rawBooks } = await fetchAuthorComplete(
      foreignAuthorId,
      authorization,
    );

    // Fetch editions only for author's own books
    const authorBookIds = rawBooks.map((b) => b.id);
    const editionsMap = await fetchBatchedEditions(
      authorBookIds,
      authorization,
    );

    const now = new Date();

    return db.transaction((tx) => {
      // Update author fields
      tx.update(authors)
        .set({
          name: rawAuthor.name,
          sortName: deriveSortName(rawAuthor.name),
          slug: rawAuthor.slug,
          bio: rawAuthor.bio,
          bornYear: rawAuthor.bornYear,
          deathYear: rawAuthor.deathYear,
          status: rawAuthor.deathYear ? "deceased" : "continuing",
          images: toImageArray(rawAuthor.imageUrl),
          metadataUpdatedAt: now,
          metadataSourceMissingSince: null,
          updatedAt: now,
        })
        .where(eq(authors.id, data.authorId))
        .run();

      let booksUpdated = 0;
      let booksAdded = 0;
      let editionsUpdated = 0;
      let editionsAdded = 0;

      const seenForeignBookIds = new Set<string>();

      for (const rawBook of rawBooks) {
        const foreignBookId = String(rawBook.id);
        seenForeignBookIds.add(foreignBookId);

        const existingBook = tx
          .select({ id: books.id })
          .from(books)
          .where(eq(books.foreignBookId, foreignBookId))
          .get();

        const additionalAuthors = deriveAdditionalAuthors(
          rawBook.contributions,
          foreignAuthorId,
        );

        if (existingBook) {
          // Update existing book
          tx.update(books)
            .set({
              title: rawBook.title,
              slug: rawBook.slug,
              description: rawBook.description,
              releaseDate: rawBook.releaseDate,
              releaseYear: rawBook.releaseYear,
              images: toImageArray(rawBook.coverUrl),
              rating: rawBook.rating,
              ratingsCount: rawBook.ratingsCount,
              usersCount: rawBook.usersCount,
              additionalAuthors: additionalAuthors ?? null,
              metadataUpdatedAt: now,
              metadataSourceMissingSince: null,
              updatedAt: now,
            })
            .where(eq(books.id, existingBook.id))
            .run();
          booksUpdated += 1;

          // Upsert editions for this book
          const bookEditions = editionsMap.get(rawBook.id) ?? [];
          const seenEditionIds = new Set<string>();
          for (const ed of bookEditions) {
            const foreignEditionId = String(ed.id);
            seenEditionIds.add(foreignEditionId);

            const existingEdition = tx
              .select({ id: editions.id })
              .from(editions)
              .where(eq(editions.foreignEditionId, foreignEditionId))
              .get();

            if (existingEdition) {
              tx.update(editions)
                .set({
                  title: ed.title,
                  isbn10: ed.isbn10,
                  isbn13: ed.isbn13,
                  asin: ed.asin,
                  format: ed.format,
                  pageCount: ed.pageCount,
                  publisher: ed.publisher,
                  editionInformation: ed.editionInformation,
                  releaseDate: ed.releaseDate,
                  language: ed.language,
                  languageCode: ed.languageCode,
                  country: ed.country,
                  usersCount: ed.usersCount,
                  score: ed.score,
                  images: toImageArray(ed.coverUrl),
                  contributors: ed.contributors,
                  metadataUpdatedAt: now,
                  metadataSourceMissingSince: null,
                })
                .where(eq(editions.id, existingEdition.id))
                .run();
              editionsUpdated += 1;
            } else {
              tx.insert(editions)
                .values({
                  bookId: existingBook.id,
                  title: ed.title,
                  isbn10: ed.isbn10,
                  isbn13: ed.isbn13,
                  asin: ed.asin,
                  format: ed.format,
                  pageCount: ed.pageCount,
                  publisher: ed.publisher,
                  editionInformation: ed.editionInformation,
                  releaseDate: ed.releaseDate,
                  language: ed.language,
                  languageCode: ed.languageCode,
                  country: ed.country,
                  usersCount: ed.usersCount,
                  score: ed.score,
                  foreignEditionId,
                  images: toImageArray(ed.coverUrl),
                  contributors: ed.contributors,
                  metadataUpdatedAt: now,
                })
                .run();
              editionsAdded += 1;
            }
          }

          // Orphan detection for editions
          const existingEditions = tx
            .select({
              id: editions.id,
              foreignEditionId: editions.foreignEditionId,
            })
            .from(editions)
            .where(eq(editions.bookId, existingBook.id))
            .all();

          for (const ed of existingEditions) {
            if (ed.foreignEditionId && !seenEditionIds.has(ed.foreignEditionId)) {
              tx.update(editions)
                .set({ metadataSourceMissingSince: now })
                .where(
                  and(
                    eq(editions.id, ed.id),
                    eq(editions.metadataSourceMissingSince, null as unknown as Date),
                  ),
                )
                .run();
            }
          }
        } else {
          // Insert new book — use local author's ID (no stub authors)
          const newBook = tx
            .insert(books)
            .values({
              title: rawBook.title,
              slug: rawBook.slug,
              authorId: data.authorId,
              description: rawBook.description,
              releaseDate: rawBook.releaseDate,
              releaseYear: rawBook.releaseYear,
              monitored: false,
              foreignBookId,
              images: toImageArray(rawBook.coverUrl),
              rating: rawBook.rating,
              ratingsCount: rawBook.ratingsCount,
              usersCount: rawBook.usersCount,
              additionalAuthors,
              metadataUpdatedAt: now,
            })
            .returning()
            .get();
          booksAdded += 1;

          // Insert editions for new book
          const bookEditions = editionsMap.get(rawBook.id) ?? [];
          for (const ed of bookEditions) {
            tx.insert(editions)
              .values({
                bookId: newBook.id,
                title: ed.title,
                isbn10: ed.isbn10,
                isbn13: ed.isbn13,
                asin: ed.asin,
                format: ed.format,
                pageCount: ed.pageCount,
                publisher: ed.publisher,
                editionInformation: ed.editionInformation,
                releaseDate: ed.releaseDate,
                language: ed.language,
                languageCode: ed.languageCode,
                country: ed.country,
                usersCount: ed.usersCount,
                score: ed.score,
                foreignEditionId: String(ed.id),
                images: toImageArray(ed.coverUrl),
                contributors: ed.contributors,
                metadataUpdatedAt: now,
              })
              .run();
            editionsAdded += 1;
          }

          // Series links
          for (const s of rawBook.series) {
            const existingSeries = tx
              .select({ id: series.id })
              .from(series)
              .where(eq(series.foreignSeriesId, String(s.seriesId)))
              .get();

            let localSeriesId: number;
            if (existingSeries) {
              localSeriesId = existingSeries.id;
            } else {
              const newSeries = tx
                .insert(series)
                .values({
                  title: s.seriesTitle,
                  slug: s.seriesSlug,
                  foreignSeriesId: String(s.seriesId),
                  isCompleted: s.isCompleted,
                  metadataUpdatedAt: now,
                })
                .returning()
                .get();
              localSeriesId = newSeries.id;
            }

            tx.insert(seriesBookLinks)
              .values({
                seriesId: localSeriesId,
                bookId: newBook.id,
                position: s.position,
              })
              .run();
          }

          tx.insert(history)
            .values({
              eventType: "bookAdded",
              bookId: newBook.id,
              authorId: data.authorId,
              data: { title: rawBook.title, source: "hardcover" },
            })
            .run();
        }
      }

      // Orphan detection for books
      const existingBooks = tx
        .select({
          id: books.id,
          foreignBookId: books.foreignBookId,
        })
        .from(books)
        .where(eq(books.authorId, data.authorId))
        .all();

      for (const book of existingBooks) {
        if (book.foreignBookId && !seenForeignBookIds.has(book.foreignBookId)) {
          tx.update(books)
            .set({ metadataSourceMissingSince: now })
            .where(
              and(
                eq(books.id, book.id),
                eq(books.metadataSourceMissingSince, null as unknown as Date),
              ),
            )
            .run();
        }
      }

      return { booksUpdated, booksAdded, editionsUpdated, editionsAdded };
    });
  });

// ---------- Refresh Book Metadata ----------

export const refreshBookMetadataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => refreshBookSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const authorization = getAuthorizationHeader();

    const localBook = db
      .select()
      .from(books)
      .where(eq(books.id, data.bookId))
      .get();
    if (!localBook) {
      throw new Error("Book not found.");
    }
    if (!localBook.foreignBookId) {
      throw new Error("Book has no Hardcover ID.");
    }

    const foreignBookId = Number(localBook.foreignBookId);
    const result = await fetchBookComplete(foreignBookId, authorization);
    if (!result) {
      // Book removed from Hardcover
      db.update(books)
        .set({ metadataSourceMissingSince: new Date() })
        .where(eq(books.id, data.bookId))
        .run();
      return {
        booksUpdated: 0,
        booksAdded: 0,
        editionsUpdated: 0,
        editionsAdded: 0,
      };
    }

    const { book: rawBook, editions: rawEditions } = result;
    const now = new Date();

    // Look up the primary author's foreign ID for deriving additional authors
    const localAuthor = db
      .select({ foreignAuthorId: authors.foreignAuthorId })
      .from(authors)
      .where(eq(authors.id, localBook.authorId))
      .get();
    const primaryForeignAuthorId = localAuthor?.foreignAuthorId
      ? Number(localAuthor.foreignAuthorId)
      : undefined;

    return db.transaction((tx) => {
      const additionalAuthors = primaryForeignAuthorId === undefined
        ? undefined
        : deriveAdditionalAuthors(rawBook.contributions, primaryForeignAuthorId);

      // Update book
      tx.update(books)
        .set({
          title: rawBook.title,
          slug: rawBook.slug,
          description: rawBook.description,
          releaseDate: rawBook.releaseDate,
          releaseYear: rawBook.releaseYear,
          images: toImageArray(rawBook.coverUrl),
          rating: rawBook.rating,
          ratingsCount: rawBook.ratingsCount,
          usersCount: rawBook.usersCount,
          additionalAuthors: additionalAuthors ?? null,
          metadataUpdatedAt: now,
          metadataSourceMissingSince: null,
          updatedAt: now,
        })
        .where(eq(books.id, data.bookId))
        .run();

      // Upsert editions
      let editionsUpdated = 0;
      let editionsAdded = 0;
      const seenEditionIds = new Set<string>();

      for (const ed of rawEditions) {
        const foreignEditionId = String(ed.id);
        seenEditionIds.add(foreignEditionId);

        const existingEdition = tx
          .select({ id: editions.id })
          .from(editions)
          .where(eq(editions.foreignEditionId, foreignEditionId))
          .get();

        if (existingEdition) {
          tx.update(editions)
            .set({
              title: ed.title,
              isbn10: ed.isbn10,
              isbn13: ed.isbn13,
              asin: ed.asin,
              format: ed.format,
              pageCount: ed.pageCount,
              publisher: ed.publisher,
              editionInformation: ed.editionInformation,
              releaseDate: ed.releaseDate,
              language: ed.language,
              languageCode: ed.languageCode,
              country: ed.country,
              usersCount: ed.usersCount,
              score: ed.score,
              images: toImageArray(ed.coverUrl),
              contributors: ed.contributors,
              metadataUpdatedAt: now,
              metadataSourceMissingSince: null,
            })
            .where(eq(editions.id, existingEdition.id))
            .run();
          editionsUpdated += 1;
        } else {
          tx.insert(editions)
            .values({
              bookId: data.bookId,
              title: ed.title,
              isbn10: ed.isbn10,
              isbn13: ed.isbn13,
              asin: ed.asin,
              format: ed.format,
              pageCount: ed.pageCount,
              publisher: ed.publisher,
              editionInformation: ed.editionInformation,
              releaseDate: ed.releaseDate,
              language: ed.language,
              languageCode: ed.languageCode,
              country: ed.country,
              usersCount: ed.usersCount,
              score: ed.score,
              foreignEditionId,
              images: toImageArray(ed.coverUrl),
              contributors: ed.contributors,
              metadataUpdatedAt: now,
            })
            .run();
          editionsAdded += 1;
        }
      }

      // Orphan detection for editions
      const existingEditions = tx
        .select({
          id: editions.id,
          foreignEditionId: editions.foreignEditionId,
        })
        .from(editions)
        .where(eq(editions.bookId, data.bookId))
        .all();

      for (const ed of existingEditions) {
        if (ed.foreignEditionId && !seenEditionIds.has(ed.foreignEditionId)) {
          tx.update(editions)
            .set({ metadataSourceMissingSince: now })
            .where(
              and(
                eq(editions.id, ed.id),
                eq(
                  editions.metadataSourceMissingSince,
                  null as unknown as Date,
                ),
              ),
            )
            .run();
        }
      }

      // Update series links
      tx.delete(seriesBookLinks)
        .where(eq(seriesBookLinks.bookId, data.bookId))
        .run();

      for (const s of rawBook.series) {
        const existingSeries = tx
          .select({ id: series.id })
          .from(series)
          .where(eq(series.foreignSeriesId, String(s.seriesId)))
          .get();

        let localSeriesId: number;
        if (existingSeries) {
          localSeriesId = existingSeries.id;
          // Update series metadata
          tx.update(series)
            .set({
              title: s.seriesTitle,
              slug: s.seriesSlug,
              isCompleted: s.isCompleted,
              metadataUpdatedAt: now,
            })
            .where(eq(series.id, localSeriesId))
            .run();
        } else {
          const newSeries = tx
            .insert(series)
            .values({
              title: s.seriesTitle,
              slug: s.seriesSlug,
              foreignSeriesId: String(s.seriesId),
              isCompleted: s.isCompleted,
              metadataUpdatedAt: now,
            })
            .returning()
            .get();
          localSeriesId = newSeries.id;
        }

        tx.insert(seriesBookLinks)
          .values({
            seriesId: localSeriesId,
            bookId: data.bookId,
            position: s.position,
          })
          .run();
      }

      return {
        booksUpdated: 1,
        booksAdded: 0,
        editionsUpdated,
        editionsAdded,
      };
    });
  });

// ---------- Monitor Book ----------

export const monitorBookFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => monitorBookSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    // Fetch book from Hardcover to get contributions for additionalAuthors
    const localBook = db
      .select({
        foreignBookId: books.foreignBookId,
        authorId: books.authorId,
        additionalAuthors: books.additionalAuthors,
      })
      .from(books)
      .where(eq(books.id, data.bookId))
      .get();

    let additionalAuthors: string[] | undefined;

    if (localBook?.foreignBookId && !localBook.additionalAuthors) {
      const authorization = getAuthorizationHeader();
      const result = await fetchBookComplete(
        Number(localBook.foreignBookId),
        authorization,
      );

      if (result) {
        // Look up the primary author's foreign ID
        const localAuthor = db
          .select({ foreignAuthorId: authors.foreignAuthorId })
          .from(authors)
          .where(eq(authors.id, localBook.authorId))
          .get();
        const primaryForeignAuthorId = localAuthor?.foreignAuthorId
          ? Number(localAuthor.foreignAuthorId)
          : undefined;

        if (primaryForeignAuthorId !== undefined) {
          additionalAuthors = deriveAdditionalAuthors(
            result.book.contributions,
            primaryForeignAuthorId,
          );
        }
      }
    }

    // Set monitored = true (and additionalAuthors if derived)
    db.update(books)
      .set({
        monitored: true,
        ...(additionalAuthors ? { additionalAuthors } : {}),
        updatedAt: new Date(),
      })
      .where(eq(books.id, data.bookId))
      .run();

    db.insert(history)
      .values({
        eventType: "bookUpdated",
        bookId: data.bookId,
        data: { action: "monitored" },
      })
      .run();

    return { bookId: data.bookId };
  });
