// oxlint-disable no-console -- Scheduler task logs are intentional server-side diagnostics
import { db } from "src/db";
import {
  authors,
  books,
  booksAuthors,
  editions,
  editionQualityProfiles,
} from "src/db/schema";
import { eq, sql } from "drizzle-orm";
import { refreshAuthorInternal, refreshBookInternal } from "src/server/import";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

type RefreshStats = {
  booksAdded: number;
  editionsAdded: number;
  refreshed: number;
  errors: number;
};

async function refreshAuthors(
  monitoredAuthors: Array<{ id: number; name: string }>,
  booksRefreshedViaAuthor: Set<number>,
): Promise<RefreshStats> {
  const stats: RefreshStats = {
    booksAdded: 0,
    editionsAdded: 0,
    refreshed: 0,
    errors: 0,
  };

  for (const author of monitoredAuthors) {
    try {
      const result = await refreshAuthorInternal(author.id);
      stats.booksAdded += result.booksAdded;
      stats.editionsAdded += result.editionsAdded;
      stats.refreshed += 1;

      // Track which books were covered by this author refresh
      const authorBooks = db
        .select({ bookId: booksAuthors.bookId })
        .from(booksAuthors)
        .where(eq(booksAuthors.authorId, author.id))
        .all();
      for (const entry of authorBooks) {
        booksRefreshedViaAuthor.add(entry.bookId);
      }
    } catch (error) {
      console.error(
        `[refresh-metadata] Failed to refresh author "${author.name}" (id=${author.id}):`,
        error,
      );
      stats.errors += 1;
    }

    if (monitoredAuthors.indexOf(author) < monitoredAuthors.length - 1) {
      await sleep(1000);
    }
  }

  return stats;
}

async function refreshStandaloneBooks(
  monitoredBooks: Array<{ id: number; title: string }>,
  booksRefreshedViaAuthor: Set<number>,
): Promise<RefreshStats> {
  const stats: RefreshStats = {
    booksAdded: 0,
    editionsAdded: 0,
    refreshed: 0,
    errors: 0,
  };

  const toRefresh = monitoredBooks.filter(
    (b) => !booksRefreshedViaAuthor.has(b.id),
  );

  for (const book of toRefresh) {
    try {
      const result = await refreshBookInternal(book.id);
      stats.booksAdded += result.booksAdded;
      stats.editionsAdded += result.editionsAdded;
      stats.refreshed += 1;
    } catch (error) {
      console.error(
        `[refresh-metadata] Failed to refresh book "${book.title}" (id=${book.id}):`,
        error,
      );
      stats.errors += 1;
    }

    if (toRefresh.indexOf(book) < toRefresh.length - 1) {
      await sleep(500);
    }
  }

  return stats;
}

registerTask({
  id: "refresh-metadata",
  name: "Refresh Metadata",
  description:
    "Refresh metadata for all monitored authors and their books from Hardcover.",
  defaultInterval: 12 * 60 * 60, // 12 hours
  handler: async (): Promise<TaskResult> => {
    const monitoredAuthors = db
      .select({ id: authors.id, name: authors.name })
      .from(authors)
      .where(eq(authors.monitored, true))
      .all();

    const monitoredBooks = db
      .select({ id: books.id, title: books.title })
      .from(books)
      .where(
        sql`EXISTS (
          SELECT 1 FROM ${editionQualityProfiles}
          INNER JOIN ${editions} ON ${editions.id} = ${editionQualityProfiles.editionId}
          WHERE ${editions.bookId} = ${books.id}
        )`,
      )
      .all();

    if (monitoredAuthors.length === 0 && monitoredBooks.length === 0) {
      return { success: true, message: "No monitored authors or books" };
    }

    const booksRefreshedViaAuthor = new Set<number>();

    const authorStats = await refreshAuthors(
      monitoredAuthors,
      booksRefreshedViaAuthor,
    );
    const bookStats = await refreshStandaloneBooks(
      monitoredBooks,
      booksRefreshedViaAuthor,
    );

    const totalErrors = authorStats.errors + bookStats.errors;
    const totalBooksAdded = authorStats.booksAdded + bookStats.booksAdded;
    const totalEditionsAdded =
      authorStats.editionsAdded + bookStats.editionsAdded;

    const parts: string[] = [];
    if (authorStats.refreshed > 0) {
      parts.push(plural(authorStats.refreshed, "author"));
    }
    if (bookStats.refreshed > 0) {
      parts.push(`${plural(bookStats.refreshed, "standalone book")}`);
    }
    if (totalBooksAdded > 0) {
      parts.push(`${plural(totalBooksAdded, "new book")}`);
    }
    if (totalEditionsAdded > 0) {
      parts.push(`${plural(totalEditionsAdded, "new edition")}`);
    }
    if (totalErrors > 0) {
      parts.push(plural(totalErrors, "error"));
    }

    return {
      success: totalErrors === 0,
      message:
        parts.length > 0
          ? `Refreshed ${parts.join(", ")}`
          : "No metadata changes",
    };
  },
});
