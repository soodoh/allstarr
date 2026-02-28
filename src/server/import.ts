import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "src/db";
import {
  authors,
  books,
  booksAuthors,
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
  url: string | null,
): Array<{ url: string; coverType: string }> | null {
  if (!url) {
    return null;
  }
  return [{ url, coverType: "poster" }];
}

/**
 * Non-author contributor roles to exclude from booksAuthors entries.
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

type ContributionEntry = {
  authorId: number;
  authorName: string;
  contribution: string | null;
  position: number;
};

/**
 * Derive author-role contributors from a book's contributions list.
 * Filters out non-author roles (Narrator, Illustrator, etc.).
 * Returns all contributors sorted by position.
 */
function deriveAuthorContributions(
  contributions: ContributionEntry[],
): Array<{ foreignAuthorId: string; name: string }> {
  return contributions
    .filter(
      (c) => c.contribution === null || !NON_AUTHOR_ROLES.has(c.contribution),
    )
    .toSorted((a, b) => a.position - b.position)
    .map((c) => ({ foreignAuthorId: String(c.authorId), name: c.authorName }));
}

/**
 * Insert booksAuthors entries for a book from its Hardcover contributions.
 * The primary author (matching primaryForeignAuthorId) gets authorId set and isPrimary=true.
 * All other author-role contributors get authorId=null and isPrimary=false.
 */
function insertBookAuthors(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  bookId: number,
  contributions: ContributionEntry[],
  primaryForeignAuthorId: number,
  localAuthorId: number,
): void {
  const authorContribs = deriveAuthorContributions(contributions);

  for (const contrib of authorContribs) {
    const isThePrimary =
      contrib.foreignAuthorId === String(primaryForeignAuthorId);
    tx.insert(booksAuthors)
      .values({
        bookId,
        authorId: isThePrimary ? localAuthorId : null,
        foreignAuthorId: contrib.foreignAuthorId,
        authorName: contrib.name,
        isPrimary: isThePrimary,
      })
      .onConflictDoUpdate({
        target: [booksAuthors.bookId, booksAuthors.foreignAuthorId],
        set: {
          authorId: isThePrimary ? localAuthorId : undefined,
          authorName: contrib.name,
          isPrimary: isThePrimary,
        },
      })
      .run();
  }
}

/**
 * Sync booksAuthors entries for an existing book from fresh Hardcover contributions.
 * Upserts all author-role contributors. Handles upgrade for matching local authors.
 */
function syncBookAuthors(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  bookId: number,
  contributions: ContributionEntry[],
  primaryForeignAuthorId: number,
  localAuthorId: number,
): void {
  const authorContribs = deriveAuthorContributions(contributions);

  for (const contrib of authorContribs) {
    const isThePrimary =
      contrib.foreignAuthorId === String(primaryForeignAuthorId);

    // Check if there's already an entry — if so, update; if not, insert
    const existing = tx
      .select({ id: booksAuthors.id, authorId: booksAuthors.authorId })
      .from(booksAuthors)
      .where(
        and(
          eq(booksAuthors.bookId, bookId),
          eq(booksAuthors.foreignAuthorId, contrib.foreignAuthorId),
        ),
      )
      .get();

    if (existing) {
      // Preserve existing authorId if already linked, but upgrade if we're the primary
      tx.update(booksAuthors)
        .set({
          authorName: contrib.name,
          isPrimary: isThePrimary,
          ...(isThePrimary ? { authorId: localAuthorId } : {}),
        })
        .where(eq(booksAuthors.id, existing.id))
        .run();
    } else {
      tx.insert(booksAuthors)
        .values({
          bookId,
          authorId: isThePrimary ? localAuthorId : null,
          foreignAuthorId: contrib.foreignAuthorId,
          authorName: contrib.name,
          isPrimary: isThePrimary,
        })
        .run();
    }
  }
}

// ---------- Zod schemas ----------

const importAuthorSchema = z.object({
  foreignAuthorId: z.number().int().positive(),
  qualityProfileId: z.number().int().positive().nullable(),
  rootFolderPath: z.string().min(1).nullable(),
});

const importBookSchema = z.object({
  foreignBookId: z.number().int().positive(),
  qualityProfileId: z.number().int().positive().nullable(),
  rootFolderPath: z.string().min(1).nullable(),
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

// ---------- Import Author (internal) ----------

/**
 * Core import logic shared between the public server function and cascade imports.
 * Callers must handle auth themselves.
 */
async function importAuthorInternal(data: {
  foreignAuthorId: number;
  qualityProfileId: number | null;
  rootFolderPath: string | null;
}): Promise<{ authorId: number; booksAdded: number; editionsAdded: number }> {
  const authorization = getAuthorizationHeader();

  // Duplicate guard — allow upgrading stub authors
  const existing = db
    .select({ id: authors.id, isStub: authors.isStub })
    .from(authors)
    .where(eq(authors.foreignAuthorId, String(data.foreignAuthorId)))
    .get();
  if (existing && !existing.isStub) {
    throw new Error("Author is already in your library.");
  }

  // ── Server-side fetch ──
  const { author: rawAuthor, books: rawBooks } = await fetchAuthorComplete(
    data.foreignAuthorId,
    authorization,
  );

  // Fetch editions only for author's own books
  const authorBookIds = rawBooks.map((b) => b.id);
  const editionsMap = await fetchBatchedEditions(authorBookIds, authorization);

  // ── DB transaction ──
  return db.transaction((tx) => {
    const now = new Date();

    // Double-check inside transaction to prevent race conditions
    const existingInTx = tx
      .select({ id: authors.id, isStub: authors.isStub })
      .from(authors)
      .where(eq(authors.foreignAuthorId, String(data.foreignAuthorId)))
      .get();
    if (existingInTx && !existingInTx.isStub) {
      throw new Error("Author is already in your library.");
    }

    let author: { id: number; name: string };

    if (existingInTx) {
      // Upgrade stub author to full author
      tx.update(authors)
        .set({
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
          images: toImageArray(rawAuthor.imageUrl),
          metadataUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(authors.id, existingInTx.id))
        .run();
      author = { id: existingInTx.id, name: rawAuthor.name };
    } else {
      // Insert new author
      author = tx
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
    }

    // Upgrade: set authorId on any existing booksAuthors entries matching this author's foreignAuthorId
    tx.update(booksAuthors)
      .set({ authorId: author.id })
      .where(
        and(
          eq(booksAuthors.foreignAuthorId, String(data.foreignAuthorId)),
          eq(booksAuthors.authorId, null as unknown as number),
        ),
      )
      .run();

    // Cache: foreignSeriesId → local series id
    const seriesCache = new Map<number, number>();

    // Helper: ensure series exists
    function ensureSeries(
      foreignId: number,
      title: string,
      slug: string | null,
      isCompleted: boolean | null,
    ): number {
      const cached = seriesCache.get(foreignId);
      if (cached !== undefined) {
        return cached;
      }

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
      if (existingBook) {
        // Book exists — upgrade: ensure this author has a booksAuthors entry
        syncBookAuthors(
          tx,
          existingBook.id,
          rawBook.contributions,
          data.foreignAuthorId,
          author.id,
        );
        continue;
      }

      const book = tx
        .insert(books)
        .values({
          title: rawBook.title,
          slug: rawBook.slug,
          description: rawBook.description,
          releaseDate: rawBook.releaseDate,
          releaseYear: rawBook.releaseYear,
          monitored: false,
          foreignBookId: String(rawBook.id),
          images: toImageArray(rawBook.coverUrl),
          rating: rawBook.rating,
          ratingsCount: rawBook.ratingsCount,
          usersCount: rawBook.usersCount,
          metadataUpdatedAt: now,
        })
        .returning()
        .get();

      // Insert booksAuthors entries for all author-role contributors
      insertBookAuthors(
        tx,
        book.id,
        rawBook.contributions,
        data.foreignAuthorId,
        author.id,
      );

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
}

// ---------- Import Author ----------

export const importHardcoverAuthorFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => importAuthorSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return importAuthorInternal(data);
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

    // Determine primary author from contributions
    const primaryContrib = rawBook.contributions.find(
      (c) => c.contribution === null,
    );
    if (!primaryContrib) {
      throw new Error("Could not determine the author of this book.");
    }

    // Import the primary author (full import, not a stub) before the book transaction.
    // importAuthorInternal handles dedup: skips if already fully imported, upgrades stubs.
    let primaryAuthorImported = false;
    try {
      await importAuthorInternal({
        foreignAuthorId: primaryContrib.authorId,
        qualityProfileId: data.qualityProfileId,
        rootFolderPath: data.rootFolderPath,
      });
      primaryAuthorImported = true;
    } catch {
      // Author already exists as a full author — that's fine
    }

    // Look up the primary author's local ID (must exist now)
    const primaryAuthor = db
      .select({ id: authors.id })
      .from(authors)
      .where(eq(authors.foreignAuthorId, String(primaryContrib.authorId)))
      .get();
    if (!primaryAuthor) {
      throw new Error("Failed to import the primary author.");
    }
    const primaryAuthorId = primaryAuthor.id;

    // The book may have already been imported as part of the primary author's import.
    // If so, just mark it as monitored.
    const alreadyImported = db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.foreignBookId, String(data.foreignBookId)))
      .get();

    if (alreadyImported) {
      db.update(books)
        .set({ monitored: true, updatedAt: now })
        .where(eq(books.id, alreadyImported.id))
        .run();

      // Still cascade-import co-authors
      const coAuthorContribs = deriveAuthorContributions(
        rawBook.contributions,
      ).filter((c) => c.foreignAuthorId !== String(primaryContrib.authorId));
      let additionalAuthorsImported = primaryAuthorImported ? 1 : 0;
      for (const coAuthor of coAuthorContribs) {
        try {
          await importAuthorInternal({
            foreignAuthorId: Number(coAuthor.foreignAuthorId),
            qualityProfileId: data.qualityProfileId,
            rootFolderPath: data.rootFolderPath,
          });
          additionalAuthorsImported += 1;
        } catch {
          // Best-effort
        }
      }

      return {
        bookId: alreadyImported.id,
        authorId: primaryAuthorId,
        additionalAuthorsImported,
      };
    }

    const txResult = db.transaction((tx) => {
      // Insert book (monitored — user explicitly chose it)
      const book = tx
        .insert(books)
        .values({
          title: rawBook.title,
          slug: rawBook.slug,
          description: rawBook.description,
          releaseDate: rawBook.releaseDate,
          releaseYear: rawBook.releaseYear,
          monitored: true,
          foreignBookId: String(rawBook.id),
          images: toImageArray(rawBook.coverUrl),
          rating: rawBook.rating,
          ratingsCount: rawBook.ratingsCount,
          usersCount: rawBook.usersCount,
          metadataUpdatedAt: now,
        })
        .returning()
        .get();

      // Insert booksAuthors entries for all author-role contributors
      insertBookAuthors(
        tx,
        book.id,
        rawBook.contributions,
        primaryContrib.authorId,
        primaryAuthorId,
      );

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

      return { bookId: book.id };
    });

    // Cascade import co-authors sequentially (best-effort)
    const coAuthorContribs = deriveAuthorContributions(
      rawBook.contributions,
    ).filter((c) => c.foreignAuthorId !== String(primaryContrib.authorId));
    let additionalAuthorsImported = primaryAuthorImported ? 1 : 0;
    for (const coAuthor of coAuthorContribs) {
      try {
        await importAuthorInternal({
          foreignAuthorId: Number(coAuthor.foreignAuthorId),
          qualityProfileId: data.qualityProfileId,
          rootFolderPath: data.rootFolderPath,
        });
        additionalAuthorsImported += 1;
      } catch {
        // Best-effort: book is already saved, author import failure is non-fatal
      }
    }

    return {
      bookId: txResult.bookId,
      authorId: primaryAuthorId,
      additionalAuthorsImported,
    };
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
              metadataUpdatedAt: now,
              metadataSourceMissingSince: null,
              updatedAt: now,
            })
            .where(eq(books.id, existingBook.id))
            .run();
          booksUpdated += 1;

          // Sync booksAuthors entries
          syncBookAuthors(
            tx,
            existingBook.id,
            rawBook.contributions,
            foreignAuthorId,
            data.authorId,
          );

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
            if (
              ed.foreignEditionId &&
              !seenEditionIds.has(ed.foreignEditionId)
            ) {
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
        } else {
          // Insert new book
          const newBook = tx
            .insert(books)
            .values({
              title: rawBook.title,
              slug: rawBook.slug,
              description: rawBook.description,
              releaseDate: rawBook.releaseDate,
              releaseYear: rawBook.releaseYear,
              monitored: false,
              foreignBookId,
              images: toImageArray(rawBook.coverUrl),
              rating: rawBook.rating,
              ratingsCount: rawBook.ratingsCount,
              usersCount: rawBook.usersCount,
              metadataUpdatedAt: now,
            })
            .returning()
            .get();
          booksAdded += 1;

          // Insert booksAuthors entries
          insertBookAuthors(
            tx,
            newBook.id,
            rawBook.contributions,
            foreignAuthorId,
            data.authorId,
          );

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

      // Orphan detection for books — find books linked to this author via booksAuthors
      const authorBookEntries = tx
        .select({
          bookId: booksAuthors.bookId,
        })
        .from(booksAuthors)
        .where(eq(booksAuthors.authorId, data.authorId))
        .all();

      const authorBookIdsLocal = new Set(
        authorBookEntries.map((e) => e.bookId),
      );
      for (const bookId of authorBookIdsLocal) {
        const bookRecord = tx
          .select({
            foreignBookId: books.foreignBookId,
          })
          .from(books)
          .where(eq(books.id, bookId))
          .get();

        if (
          bookRecord?.foreignBookId &&
          !seenForeignBookIds.has(bookRecord.foreignBookId)
        ) {
          tx.update(books)
            .set({ metadataSourceMissingSince: now })
            .where(
              and(
                eq(books.id, bookId),
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

    // Look up the primary author from booksAuthors
    const primaryEntry = db
      .select({
        authorId: booksAuthors.authorId,
        foreignAuthorId: booksAuthors.foreignAuthorId,
      })
      .from(booksAuthors)
      .where(
        and(
          eq(booksAuthors.bookId, data.bookId),
          eq(booksAuthors.isPrimary, true),
        ),
      )
      .get();

    return db.transaction((tx) => {
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
          metadataUpdatedAt: now,
          metadataSourceMissingSince: null,
          updatedAt: now,
        })
        .where(eq(books.id, data.bookId))
        .run();

      // Sync booksAuthors from contributions
      if (primaryEntry) {
        syncBookAuthors(
          tx,
          data.bookId,
          rawBook.contributions,
          Number(primaryEntry.foreignAuthorId),
          primaryEntry.authorId ?? 0,
        );
      }

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

    // Fetch book from Hardcover to sync booksAuthors if needed
    const localBook = db
      .select({
        foreignBookId: books.foreignBookId,
      })
      .from(books)
      .where(eq(books.id, data.bookId))
      .get();

    // Check if booksAuthors entries exist for this book
    const existingAuthors = db
      .select({ id: booksAuthors.id })
      .from(booksAuthors)
      .where(eq(booksAuthors.bookId, data.bookId))
      .get();

    if (localBook?.foreignBookId && !existingAuthors) {
      const authorization = getAuthorizationHeader();
      const result = await fetchBookComplete(
        Number(localBook.foreignBookId),
        authorization,
      );

      if (result) {
        // Find the primary author entry from booksAuthors or use first contributor
        const primaryContrib = result.book.contributions.find(
          (c) => c.contribution === null,
        );
        if (primaryContrib) {
          const localAuthor = db
            .select({ id: authors.id })
            .from(authors)
            .where(eq(authors.foreignAuthorId, String(primaryContrib.authorId)))
            .get();

          db.transaction((tx) => {
            insertBookAuthors(
              tx,
              data.bookId,
              result.book.contributions,
              primaryContrib.authorId,
              localAuthor?.id ?? 0,
            );
          });
        }
      }
    }

    // Set monitored = true
    db.update(books)
      .set({
        monitored: true,
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
