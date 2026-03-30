// oxlint-disable no-console -- Server-side fire-and-forget logging
// oxlint-disable prefer-await-to-then -- Intentional fire-and-forget pattern
// oxlint-disable catch-or-return -- Fire-and-forget image caching
// oxlint-disable always-return -- Fire-and-forget .then() callbacks
import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { manga, mangaVolumes, mangaChapters, history } from "src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "./middleware";
import { addMangaSchema, refreshMangaSchema } from "src/lib/validators";
import { submitCommand } from "./commands";
import type { CommandHandler } from "./commands";
import { getSource } from "./manga-sources";
import type { SourceChapter } from "./manga-sources";

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateSortTitle(title: string): string {
  return title.replace(/^(The|A|An)\s+/i, "");
}

function volumeTitle(volumeNumber: number | null): string | null {
  return volumeNumber === null ? null : `Volume ${volumeNumber}`;
}

/**
 * Determine whether a chapter should be monitored based on the monitor option.
 */
function shouldMonitorChapter(
  option: "all" | "future" | "missing" | "none",
  dateUpload: Date | undefined,
): boolean {
  switch (option) {
    case "all": {
      return true;
    }
    case "future": {
      return !dateUpload;
    }
    case "missing": {
      return true;
    }
    case "none": {
      return false;
    }
    default: {
      return true;
    }
  }
}

/**
 * Compute the highest chapter number from a list of source chapters.
 */
function computeLatestChapter(chapters: SourceChapter[]): number | null {
  let max: number | null = null;
  for (const ch of chapters) {
    const num = ch.chapterNumber;
    if (num !== undefined && (max === null || num > max)) {
      max = num;
    }
  }
  return max;
}

/**
 * Group source chapters by volume number.
 * Chapters with the same volumeNumber go into the same group.
 * Chapters with null/undefined volumeNumber go into the null group.
 */
function groupChaptersByVolume(
  chapters: SourceChapter[],
): Map<number | null, SourceChapter[]> {
  const volumeMap = new Map<number | null, SourceChapter[]>();

  for (const chapter of chapters) {
    const key = chapter.volumeNumber ?? null;
    const arr = volumeMap.get(key) ?? [];
    arr.push(chapter);
    volumeMap.set(key, arr);
  }

  return volumeMap;
}

/**
 * Insert volumes and their chapters into the DB within a transaction.
 * Returns the count of chapters added.
 */
function insertVolumesAndChapters(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  mangaId: number,
  volumeGroups: Map<number | null, SourceChapter[]>,
  monitorOption: "all" | "future" | "missing" | "none",
  // oxlint-disable-next-line no-empty-function -- intentional no-op default
  updateProgress: (message: string) => void = () => {},
): number {
  let chaptersAdded = 0;

  const totalVolumes = volumeGroups.size;
  let volumeIndex = 0;

  for (const [volumeNumber, volumeChapters] of volumeGroups) {
    volumeIndex += 1;
    updateProgress(`Creating volume ${volumeIndex} of ${totalVolumes}...`);

    const volumeRow = tx
      .insert(mangaVolumes)
      .values({
        mangaId,
        volumeNumber,
        title: volumeTitle(volumeNumber),
        monitored: true,
      })
      .returning()
      .get();

    if (volumeChapters.length > 0) {
      tx.insert(mangaChapters)
        .values(
          volumeChapters.map((chapter) => ({
            mangaVolumeId: volumeRow.id,
            mangaId,
            chapterNumber: String(chapter.chapterNumber ?? chapter.name),
            title: chapter.name || null,
            sourceChapterUrl: chapter.url,
            releaseDate: chapter.dateUpload
              ? chapter.dateUpload.toISOString().split("T")[0]
              : null,
            scanlationGroup: chapter.scanlator ?? null,
            hasFile: false,
            monitored: shouldMonitorChapter(monitorOption, chapter.dateUpload),
          })),
        )
        .run();
      chaptersAdded += volumeChapters.length;
    }
  }

  // If no chapters were found, still create an ungrouped volume
  if (volumeGroups.size === 0) {
    tx.insert(mangaVolumes)
      .values({
        mangaId,
        volumeNumber: null,
        title: null,
        monitored: true,
      })
      .run();
  }

  return chaptersAdded;
}

// ─── Import Manga ──────────────────────────────────────────────────────────

const importMangaHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as unknown as ReturnType<typeof addMangaSchema.parse>;

  // Check for duplicates
  updateProgress("Checking for duplicates...");
  const existing = db
    .select({ id: manga.id })
    .from(manga)
    .where(
      and(
        eq(manga.sourceId, data.sourceId),
        eq(manga.sourceMangaUrl, data.sourceMangaUrl),
      ),
    )
    .get();

  if (existing) {
    throw new Error("Manga already exists in your library.");
  }

  // Get the source
  const source = getSource(data.sourceId);
  if (!source) {
    throw new Error(`Source not found: ${data.sourceId}`);
  }

  // Fetch details and chapters from the source
  updateProgress(`Fetching details from ${source.name}...`);
  const details = await source.getMangaDetails(data.sourceMangaUrl);

  updateProgress("Fetching chapter list...");
  const chapters = await source.getChapterList(data.sourceMangaUrl);

  if (chapters.length === 0) {
    throw new Error(
      `No downloadable chapters found on ${source.name}. This manga may only have externally-hosted chapters. Try a different source.`,
    );
  }

  updateProgress(`Processing ${chapters.length} chapters...`);

  // Group chapters by volume
  const volumeGroups = groupChaptersByVolume(chapters);

  // Compute latest chapter number
  const latestChapter = computeLatestChapter(chapters);

  // DB transaction: insert manga -> volumes -> chapters -> history
  updateProgress("Saving to database...");
  const result = db.transaction((tx) => {
    const mangaRow = tx
      .insert(manga)
      .values({
        title: data.title,
        sortTitle: data.sortTitle || generateSortTitle(data.title),
        overview: data.overview || details.description || "",
        sourceId: data.sourceId,
        sourceMangaUrl: data.sourceMangaUrl,
        sourceMangaThumbnail: data.sourceMangaThumbnail ?? null,
        type: data.type || details.type || "manga",
        year: data.year,
        status: details.status || data.status || "ongoing",
        latestChapter,
        posterUrl: data.posterUrl || details.thumbnailUrl || "",
        genres: data.genres.length > 0 ? data.genres : (details.genres ?? []),
        monitorNewChapters: data.monitorOption,
        metadataUpdatedAt: new Date(),
      })
      .returning()
      .get();

    const chaptersAdded = insertVolumesAndChapters(
      tx,
      mangaRow.id,
      volumeGroups,
      data.monitorOption,
      updateProgress,
    );

    // Insert history event
    tx.insert(history)
      .values({
        eventType: "mangaAdded",
        mangaId: mangaRow.id,
        data: {
          title: data.title,
          chaptersAdded,
          source: source.name,
        },
      })
      .run();

    return {
      mangaId: mangaRow.id,
      chaptersAdded,
    };
  });

  // Fire-and-forget image caching (outside transaction)
  const mangaPosterUrl = data.posterUrl || details.thumbnailUrl || "";
  if (mangaPosterUrl) {
    (async () => {
      const { cacheImage } = await import("./image-cache");
      const cachedPath = await cacheImage(
        mangaPosterUrl,
        "manga",
        result.mangaId,
      );
      if (cachedPath) {
        db.update(manga)
          .set({ cachedPosterPath: cachedPath })
          .where(eq(manga.id, result.mangaId))
          .run();
      }
    })();
  }

  return result as unknown as Record<string, unknown>;
};

export const importMangaFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => addMangaSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return submitCommand({
      commandType: "importManga",
      name: `Import: ${data.title}`,
      body: data as unknown as Record<string, unknown>,
      dedupeKey: "sourceMangaUrl",
      handler: importMangaHandler,
    });
  });

// ─── Refresh Helpers ──────────────────────────────────────────────────────

/**
 * Diff source chapters against existing DB chapters and insert new ones.
 * Returns the count of chapters added.
 */
function diffAndInsertNewChapters(
  mangaId: number,
  chapters: SourceChapter[],
  monitorOption: "all" | "future" | "missing" | "none",
  updateProgress: (message: string) => void,
): number {
  updateProgress("Checking for new chapters...");
  const existingRows = db
    .select({
      chapterNumber: mangaChapters.chapterNumber,
      sourceChapterUrl: mangaChapters.sourceChapterUrl,
    })
    .from(mangaChapters)
    .where(eq(mangaChapters.mangaId, mangaId))
    .all();

  const existingUrls = new Set(
    existingRows
      .map((r) => r.sourceChapterUrl)
      .filter((u): u is string => u !== null),
  );
  const existingNumbers = new Set(existingRows.map((r) => r.chapterNumber));

  // A chapter is new if we haven't seen its URL or chapter number
  const newChapters = chapters.filter((ch) => {
    if (ch.url && existingUrls.has(ch.url)) {
      return false;
    }
    const chNum = String(ch.chapterNumber ?? ch.name);
    return !existingNumbers.has(chNum);
  });

  if (newChapters.length === 0) {
    return 0;
  }

  updateProgress(`Adding ${newChapters.length} new chapters...`);
  const volumeGroups = groupChaptersByVolume(newChapters);
  let added = 0;

  for (const [volumeNumber, volumeChapters] of volumeGroups) {
    const volumeCondition =
      volumeNumber === null
        ? and(
            eq(mangaVolumes.mangaId, mangaId),
            sql`${mangaVolumes.volumeNumber} IS NULL`,
          )
        : and(
            eq(mangaVolumes.mangaId, mangaId),
            eq(mangaVolumes.volumeNumber, volumeNumber),
          );

    let volumeRow = db
      .select({ id: mangaVolumes.id })
      .from(mangaVolumes)
      .where(volumeCondition)
      .get();

    if (!volumeRow) {
      volumeRow = db
        .insert(mangaVolumes)
        .values({
          mangaId,
          volumeNumber,
          title: volumeTitle(volumeNumber),
          monitored: true,
        })
        .returning({ id: mangaVolumes.id })
        .get();
    }

    if (volumeChapters.length > 0) {
      db.insert(mangaChapters)
        .values(
          volumeChapters.map((chapter) => ({
            mangaVolumeId: volumeRow.id,
            mangaId,
            chapterNumber: String(chapter.chapterNumber ?? chapter.name),
            title: chapter.name || null,
            sourceChapterUrl: chapter.url,
            releaseDate: chapter.dateUpload
              ? chapter.dateUpload.toISOString().split("T")[0]
              : null,
            scanlationGroup: chapter.scanlator ?? null,
            hasFile: false,
            monitored: shouldMonitorChapter(monitorOption, chapter.dateUpload),
          })),
        )
        .run();
      added += volumeChapters.length;
    }
  }

  return added;
}

// ─── Refresh Manga Metadata ───────────────────────────────────────────────

/**
 * Core refresh logic. Reusable by both the ad-hoc command handler and
 * batch scheduled tasks.
 */
// oxlint-disable-next-line complexity -- Refresh pipeline requires many conditional branches
export async function refreshMangaInternal(
  mangaId: number,
  // oxlint-disable-next-line no-empty-function -- intentional no-op default
  updateProgress: (message: string) => void = () => {},
): Promise<{ success: boolean; newChaptersAdded: number }> {
  const mangaRow = db.select().from(manga).where(eq(manga.id, mangaId)).get();

  if (!mangaRow) {
    throw new Error("Manga not found");
  }

  // Get the source
  const source = getSource(mangaRow.sourceId);
  if (!source) {
    throw new Error(`Source not found: ${mangaRow.sourceId}`);
  }

  // Fetch latest details and chapters from source
  updateProgress(`Fetching details from ${source.name}...`);
  const details = await source.getMangaDetails(mangaRow.sourceMangaUrl);

  updateProgress("Fetching chapter list...");
  const chapters = await source.getChapterList(mangaRow.sourceMangaUrl);

  // Update manga metadata
  updateProgress("Updating metadata...");
  const latestChapter = computeLatestChapter(chapters);

  db.update(manga)
    .set({
      overview: details.description || mangaRow.overview,
      type: details.type || mangaRow.type,
      status: details.status || mangaRow.status,
      latestChapter: latestChapter ?? mangaRow.latestChapter,
      posterUrl: details.thumbnailUrl || mangaRow.posterUrl,
      genres: details.genres ?? (mangaRow.genres as string[] | null) ?? [],
      metadataUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(manga.id, mangaId))
    .run();

  // Fire-and-forget image caching on refresh
  const refreshPosterUrl = details.thumbnailUrl || mangaRow.posterUrl;
  if (refreshPosterUrl) {
    (async () => {
      const { cacheImage } = await import("./image-cache");
      const cachedPath = await cacheImage(refreshPosterUrl, "manga", mangaId);
      if (cachedPath) {
        db.update(manga)
          .set({ cachedPosterPath: cachedPath })
          .where(eq(manga.id, mangaId))
          .run();
      }
    })();
  }

  // Diff and insert new chapters
  const newChaptersAdded = diffAndInsertNewChapters(
    mangaId,
    chapters,
    mangaRow.monitorNewChapters as "all" | "future" | "missing" | "none",
    updateProgress,
  );

  // Update latestChapter on manga
  if (latestChapter !== null && latestChapter !== mangaRow.latestChapter) {
    db.update(manga).set({ latestChapter }).where(eq(manga.id, mangaId)).run();
  }

  // Log history event
  if (newChaptersAdded > 0) {
    db.insert(history)
      .values({
        eventType: "mangaUpdated",
        mangaId,
        data: {
          title: mangaRow.title,
          newChapters: newChaptersAdded,
          source: source.name,
        },
      })
      .run();
  }

  return { success: true, newChaptersAdded };
}

const refreshMangaHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as { mangaId: number };

  // Get manga title for progress message
  const mangaRow = db
    .select({ title: manga.title })
    .from(manga)
    .where(eq(manga.id, data.mangaId))
    .get();

  updateProgress(`Fetching latest data for ${mangaRow?.title ?? "manga"}...`);
  const result = await refreshMangaInternal(data.mangaId, updateProgress);

  return { success: true, newChaptersAdded: result.newChaptersAdded };
};

export const refreshMangaMetadataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => refreshMangaSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const mangaRow = db
      .select({ title: manga.title })
      .from(manga)
      .where(eq(manga.id, data.mangaId))
      .get();

    return submitCommand({
      commandType: "refreshManga",
      name: `Refresh: ${mangaRow?.title ?? `Manga #${data.mangaId}`}`,
      body: data as unknown as Record<string, unknown>,
      dedupeKey: "mangaId",
      batchTaskId: "refresh-manga-sources",
      handler: refreshMangaHandler,
    });
  });
