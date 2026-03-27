// oxlint-disable no-console -- Server-side fire-and-forget logging
import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  manga,
  mangaVolumes,
  mangaChapters,
  mangaDownloadProfiles,
  history,
} from "src/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "./middleware";
import { addMangaSchema, refreshMangaSchema } from "src/lib/validators";
import {
  getMangaUpdatesSeriesDetail,
  getMangaUpdatesReleases,
} from "./manga-updates";
import type { MangaUpdatesRelease } from "./manga-updates";

// ─── Helpers ───────────────────────────────────────────────────────────────

type DeduplicatedChapter = {
  chapterNumber: string;
  volume: string | null;
  releaseDate: string | null;
  scanlationGroup: string | null;
};

/**
 * Deduplicate MangaUpdates releases by chapter number.
 * The same chapter can appear multiple times (once per scanlation group).
 * We group by chapter number, keep the earliest release date, and store
 * the first group name.
 */
function deduplicateReleases(
  releases: MangaUpdatesRelease[],
): DeduplicatedChapter[] {
  const byChapter = new Map<string, DeduplicatedChapter>();

  for (const release of releases) {
    const chapterNum = release.chapter.trim();
    if (!chapterNum) {
      continue;
    }

    const existing = byChapter.get(chapterNum);
    const releaseDate = release.release_date || null;
    const groupName = release.groups[0]?.name ?? null;
    const volume = release.volume?.trim() || null;

    if (existing) {
      // Keep earliest release date
      if (
        releaseDate &&
        (!existing.releaseDate || releaseDate < existing.releaseDate)
      ) {
        existing.releaseDate = releaseDate;
      }
      // Use volume if the existing entry doesn't have one
      if (!existing.volume && volume) {
        existing.volume = volume;
      }
    } else {
      byChapter.set(chapterNum, {
        chapterNumber: chapterNum,
        volume,
        releaseDate,
        scanlationGroup: groupName,
      });
    }
  }

  return [...byChapter.values()];
}

/**
 * Group chapters into volumes by the volume field.
 * Chapters without a volume go into a group with volumeNumber = null.
 */
function groupChaptersIntoVolumes(
  chapters: DeduplicatedChapter[],
): Map<number | null, DeduplicatedChapter[]> {
  const volumeMap = new Map<number | null, DeduplicatedChapter[]>();

  for (const chapter of chapters) {
    const volumeNum = chapter.volume
      ? Number.parseInt(chapter.volume, 10)
      : null;
    const key = Number.isNaN(volumeNum) ? null : volumeNum;
    const arr = volumeMap.get(key) ?? [];
    arr.push(chapter);
    volumeMap.set(key, arr);
  }

  return volumeMap;
}

/**
 * Determine whether a chapter should be monitored based on the monitor option.
 */
function shouldMonitorChapter(
  option: "all" | "future" | "missing" | "none",
  releaseDate: string | null,
): boolean {
  switch (option) {
    case "all": {
      return true;
    }
    case "future": {
      return !releaseDate;
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

function generateSortTitle(title: string): string {
  return title.replace(/^(The|A|An)\s+/i, "");
}

function volumeTitle(volumeNumber: number | null): string | null {
  return volumeNumber === null ? null : `Volume ${volumeNumber}`;
}

/**
 * Insert volumes and their chapters into the DB within a transaction.
 * Returns the count of volumes and chapters added.
 */
function insertVolumesAndChapters(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  mangaId: number,
  volumeGroups: Map<number | null, DeduplicatedChapter[]>,
  monitorOption: "all" | "future" | "missing" | "none",
): { volumesAdded: number; chaptersAdded: number } {
  let chaptersAdded = 0;
  let volumesAdded = 0;

  for (const [volumeNumber, volumeChapters] of volumeGroups) {
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
    volumesAdded += 1;

    for (const chapter of volumeChapters) {
      tx.insert(mangaChapters)
        .values({
          mangaVolumeId: volumeRow.id,
          mangaId,
          chapterNumber: chapter.chapterNumber,
          releaseDate: chapter.releaseDate,
          scanlationGroup: chapter.scanlationGroup,
          hasFile: false,
          monitored: shouldMonitorChapter(monitorOption, chapter.releaseDate),
        })
        .run();
      chaptersAdded += 1;
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
    volumesAdded = 1;
  }

  return { volumesAdded, chaptersAdded };
}

// ─── Import Manga ──────────────────────────────────────────────────────────

export const importMangaFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => addMangaSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    // Check for duplicates
    const existing = db
      .select({ id: manga.id })
      .from(manga)
      .where(eq(manga.mangaUpdatesId, data.mangaUpdatesId))
      .get();

    if (existing) {
      throw new Error("Manga already exists in your library.");
    }

    // Fetch detail and releases from MangaUpdates
    const detail = await getMangaUpdatesSeriesDetail(data.mangaUpdatesId);
    const releasesResult = await getMangaUpdatesReleases(data.title);
    const releases = releasesResult.results;

    // Deduplicate releases into unique chapters
    const chapters = deduplicateReleases(releases);

    // Group into volumes
    const volumeGroups = groupChaptersIntoVolumes(chapters);

    // Determine status from detail
    const status = detail.completed ? "complete" : "ongoing";

    // DB transaction: insert manga -> volumes -> chapters -> profiles -> history
    const result = db.transaction((tx) => {
      const mangaRow = tx
        .insert(manga)
        .values({
          title: data.title,
          sortTitle: data.sortTitle || generateSortTitle(data.title),
          overview: data.overview || detail.description || "",
          mangaUpdatesId: data.mangaUpdatesId,
          mangaUpdatesSlug: data.mangaUpdatesSlug,
          type: data.type || detail.type?.toLowerCase() || "manga",
          year: data.year || detail.year || null,
          status,
          latestChapter: data.latestChapter ?? detail.latest_chapter ?? null,
          posterUrl: data.posterUrl || detail.image?.url?.original || "",
          genres:
            data.genres.length > 0
              ? data.genres
              : (detail.genres?.map((g) => g.genre) ?? []),
          monitorNewChapters: data.monitorOption,
          path: data.rootFolderPath
            ? `${data.rootFolderPath}/${data.title.replaceAll("/", "-")}`
            : "",
          metadataUpdatedAt: new Date(),
        })
        .returning()
        .get();

      // Insert download profile links
      for (const profileId of data.downloadProfileIds) {
        tx.insert(mangaDownloadProfiles)
          .values({ mangaId: mangaRow.id, downloadProfileId: profileId })
          .run();
      }

      const { volumesAdded, chaptersAdded } = insertVolumesAndChapters(
        tx,
        mangaRow.id,
        volumeGroups,
        data.monitorOption,
      );

      // Insert history event
      tx.insert(history)
        .values({
          eventType: "mangaAdded",
          mangaId: mangaRow.id,
          data: { title: data.title, source: "mangaupdates" },
        })
        .run();

      return {
        mangaId: mangaRow.id,
        chaptersAdded,
        volumesAdded,
      };
    });

    return result;
  });

// ─── Refresh Manga Metadata ───────────────────────────────────────────────

export const refreshMangaMetadataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => refreshMangaSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const mangaRow = db
      .select()
      .from(manga)
      .where(eq(manga.id, data.mangaId))
      .get();

    if (!mangaRow) {
      throw new Error("Manga not found");
    }

    // Fetch latest from MangaUpdates
    const detail = await getMangaUpdatesSeriesDetail(mangaRow.mangaUpdatesId);
    const releasesResult = await getMangaUpdatesReleases(mangaRow.title);
    const releases = releasesResult.results;

    // Update manga metadata
    const status = detail.completed ? "complete" : "ongoing";
    db.update(manga)
      .set({
        overview: detail.description || mangaRow.overview,
        status,
        latestChapter: detail.latest_chapter ?? mangaRow.latestChapter,
        posterUrl: detail.image?.url?.original || mangaRow.posterUrl,
        genres:
          detail.genres?.map((g) => g.genre) ??
          (mangaRow.genres as string[] | null) ??
          [],
        metadataUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(manga.id, data.mangaId))
      .run();

    // Deduplicate releases and detect new chapters
    const chapters = deduplicateReleases(releases);

    // Get existing chapter numbers
    const existingChapters = db
      .select({ chapterNumber: mangaChapters.chapterNumber })
      .from(mangaChapters)
      .where(eq(mangaChapters.mangaId, data.mangaId))
      .all();

    const existingChapterNumbers = new Set(
      existingChapters.map((c) => c.chapterNumber),
    );

    // Find new chapters
    const newChapters = chapters.filter(
      (c) => !existingChapterNumbers.has(c.chapterNumber),
    );

    if (newChapters.length === 0) {
      return { success: true, newChaptersAdded: 0 };
    }

    // Group new chapters into volumes
    const volumeGroups = groupChaptersIntoVolumes(newChapters);

    // Get monitoring option for the manga
    const monitorOption = mangaRow.monitorNewChapters as
      | "all"
      | "future"
      | "missing"
      | "none";

    let newChaptersAdded = 0;

    // Insert new chapters into existing or new volumes
    for (const [volumeNumber, volumeChapters] of volumeGroups) {
      // Find or create the volume
      const volumeCondition =
        volumeNumber === null
          ? and(
              eq(mangaVolumes.mangaId, data.mangaId),
              eq(mangaVolumes.volumeNumber, null as unknown as number),
            )
          : and(
              eq(mangaVolumes.mangaId, data.mangaId),
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
            mangaId: data.mangaId,
            volumeNumber,
            title: volumeTitle(volumeNumber),
            monitored: true,
          })
          .returning()
          .get();
      }

      for (const chapter of volumeChapters) {
        db.insert(mangaChapters)
          .values({
            mangaVolumeId: volumeRow.id,
            mangaId: data.mangaId,
            chapterNumber: chapter.chapterNumber,
            releaseDate: chapter.releaseDate,
            scanlationGroup: chapter.scanlationGroup,
            hasFile: false,
            monitored: shouldMonitorChapter(monitorOption, chapter.releaseDate),
          })
          .run();
        newChaptersAdded += 1;
      }
    }

    // Create history event for new chapters
    if (newChaptersAdded > 0) {
      db.insert(history)
        .values({
          eventType: "mangaUpdated",
          mangaId: data.mangaId,
          data: {
            title: mangaRow.title,
            newChapters: newChaptersAdded,
          },
        })
        .run();
    }

    return { success: true, newChaptersAdded };
  });
