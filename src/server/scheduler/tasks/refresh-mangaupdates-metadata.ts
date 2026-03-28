// oxlint-disable no-console -- Scheduler task logs are intentional server-side diagnostics
import { db } from "src/db";
import { manga, mangaDownloadProfiles } from "src/db/schema";
import { sql } from "drizzle-orm";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";
import { refreshMangaInternal } from "src/server/manga-import";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

registerTask({
  id: "refresh-mangaupdates-metadata",
  name: "Refresh MangaUpdates Metadata",
  description:
    "Refresh metadata for all monitored manga series from MangaUpdates.",
  defaultInterval: 12 * 60 * 60,
  group: "metadata",
  handler: async (updateProgress): Promise<TaskResult> => {
    const monitoredManga = db
      .select({ id: manga.id, title: manga.title })
      .from(manga)
      .where(
        sql`EXISTS (
          SELECT 1 FROM ${mangaDownloadProfiles}
          WHERE ${mangaDownloadProfiles.mangaId} = ${manga.id}
        )`,
      )
      .all();

    if (monitoredManga.length === 0) {
      return { success: true, message: "No monitored manga" };
    }

    let refreshed = 0;
    let totalNewChapters = 0;
    let errors = 0;

    for (let i = 0; i < monitoredManga.length; i += 1) {
      const m = monitoredManga[i];
      updateProgress(
        `Refreshing manga ${i + 1} of ${monitoredManga.length}: ${m.title}...`,
      );

      try {
        const result = await refreshMangaInternal(m.id);
        totalNewChapters += result.newChaptersAdded;
        refreshed += 1;
      } catch (error) {
        console.error(
          `[refresh-mangaupdates] Failed to refresh "${m.title}" (id=${m.id}):`,
          error,
        );
        errors += 1;
      }

      if (i < monitoredManga.length - 1) {
        await sleep(1000);
      }
    }

    const parts: string[] = [];
    if (refreshed > 0) {
      parts.push(plural(refreshed, "manga series"));
    }
    if (totalNewChapters > 0) {
      parts.push(plural(totalNewChapters, "new chapter"));
    }
    if (errors > 0) {
      parts.push(plural(errors, "error"));
    }

    return {
      success: errors === 0,
      message:
        parts.length > 0
          ? `Refreshed ${parts.join(", ")}`
          : "No metadata changes",
    };
  },
});
