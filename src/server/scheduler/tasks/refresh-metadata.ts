import { db } from "src/db";
import { authors, books, editionQualityProfiles } from "src/db/schema";
import { eq, sql } from "drizzle-orm";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

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
        sql`EXISTS (SELECT 1 FROM ${editionQualityProfiles} WHERE ${editionQualityProfiles.bookId} = ${books.id})`,
      )
      .all();

    if (monitoredAuthors.length === 0 && monitoredBooks.length === 0) {
      return { success: true, message: "No monitored authors or books" };
    }

    // Stub — full Hardcover metadata re-fetch will be wired up with automation features
    return {
      success: true,
      message: `Checked ${monitoredAuthors.length} author(s), ${monitoredBooks.length} book(s)`,
    };
  },
});
