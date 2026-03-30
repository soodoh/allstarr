// oxlint-disable no-console -- Server-side fire-and-forget logging
// oxlint-disable prefer-await-to-then -- Intentional fire-and-forget pattern
// oxlint-disable catch-or-return -- Fire-and-forget image caching
// oxlint-disable always-return -- Fire-and-forget .then() callbacks
import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  manga,
  mangaVolumes,
  mangaChapters,
  mangaDownloadProfiles,
  downloadProfiles,
  history,
} from "src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "./middleware";
import { addMangaSchema, refreshMangaSchema } from "src/lib/validators";
import {
  getMangaUpdatesSeriesDetail,
  getAllMangaUpdatesReleases,
} from "./manga-updates";
import type { MangaUpdatesRelease } from "./manga-updates";
import { submitCommand } from "./commands";
import type { CommandHandler } from "./commands";
import {
  normalizeChapterNumber,
  expandChapterRange,
  parseChapterNumber,
} from "./manga-chapter-utils";
import { getWikipediaVolumeMappings, applyVolumeMappings } from "./wikipedia";
import type { WikipediaVolumeMapping as VolumeMapping } from "./wikipedia";
import { getMangaDexVolumeMappings } from "./mangadex";

// ─── Helpers ───────────────────────────────────────────────────────────────

type DeduplicatedChapter = {
  chapterNumber: string;
  volume: string | null;
  releaseDate: string | null;
  scanlationGroup: string | null;
  fromExpansion: boolean;
};

/**
 * Deduplicate MangaUpdates releases by chapter number.
 * The same chapter can appear multiple times (once per scanlation group).
 * We normalize chapter strings (strip version/quality suffixes),
 * expand ranges into individual chapters, then deduplicate by chapter number,
 * keeping the earliest release date and first group name.
 */
function deduplicateReleases(
  releases: MangaUpdatesRelease[],
): DeduplicatedChapter[] {
  const byChapter = new Map<string, DeduplicatedChapter>();

  for (const release of releases) {
    const rawChapter = release.chapter.trim();
    if (!rawChapter) {
      continue;
    }

    const releaseDate = release.release_date || null;
    const groupName = release.groups[0]?.name ?? null;
    const volume = release.volume?.trim() || null;

    // Step 1: Normalize (strip version/quality suffixes)
    const normalized = normalizeChapterNumber(rawChapter);
    if (!normalized) {
      continue;
    }

    // Step 2: Expand ranges into individual chapters
    const expanded = expandChapterRange(normalized);

    if (expanded) {
      // Range: create an entry for each individual chapter
      for (const num of expanded) {
        const key = String(num);
        mergeChapter(byChapter, key, volume, releaseDate, groupName, true);
      }
    } else if (normalized.includes("+")) {
      // Compound entry — try to salvage valid chapter numbers from each part
      const parts = normalized.split("+").map((p) => p.trim());
      for (const part of parts) {
        const partNormalized = normalizeChapterNumber(part);
        if (!partNormalized) {
          continue;
        }
        const partExpanded = expandChapterRange(partNormalized);
        if (partExpanded) {
          for (const num of partExpanded) {
            mergeChapter(
              byChapter,
              String(num),
              volume,
              releaseDate,
              groupName,
              true,
            );
          }
        } else if (/^\d+(\.\d+)?$/.test(partNormalized)) {
          mergeChapter(
            byChapter,
            partNormalized,
            volume,
            releaseDate,
            groupName,
            false,
          );
        }
      }
      continue;
    } else {
      // Single chapter (numeric or special like "Chopper Man")
      mergeChapter(
        byChapter,
        normalized,
        volume,
        releaseDate,
        groupName,
        false,
      );
    }
  }

  return [...byChapter.values()];
}

/**
 * Merge a chapter into the dedup map.
 * Prefers individual entries over range-expanded ones, inherits volume
 * from expanded entries when the individual entry has no volume.
 */
function mergeChapter(
  byChapter: Map<string, DeduplicatedChapter>,
  chapterNumber: string,
  volume: string | null,
  releaseDate: string | null,
  scanlationGroup: string | null,
  fromExpansion: boolean,
): void {
  const existing = byChapter.get(chapterNumber);
  if (!existing) {
    byChapter.set(chapterNumber, {
      chapterNumber,
      volume,
      releaseDate,
      scanlationGroup,
      fromExpansion,
    });
    return;
  }

  // Always inherit volume: if either side has it, keep it
  const mergedVolume = existing.volume || volume;
  const mergedDate =
    releaseDate && (!existing.releaseDate || releaseDate < existing.releaseDate)
      ? releaseDate
      : existing.releaseDate;

  // Prefer individual entries over range-expanded ones
  if (existing.fromExpansion && !fromExpansion) {
    byChapter.set(chapterNumber, {
      chapterNumber,
      volume: mergedVolume,
      releaseDate: mergedDate,
      scanlationGroup,
      fromExpansion: false,
    });
  } else {
    existing.releaseDate = mergedDate;
    existing.volume = mergedVolume;
  }
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

function resolveMappingSource(
  volumeNumber: number | null,
  mangaDexMappings: VolumeMapping[] | null,
  wikiMappings: VolumeMapping[] | null,
): "mangadex" | "wikipedia" | "mangaupdates" | "none" {
  if (volumeNumber === null) {
    return "none";
  }
  if (mangaDexMappings?.some((m) => m.volumeNumber === volumeNumber)) {
    return "mangadex";
  }
  if (wikiMappings?.some((m) => m.volumeNumber === volumeNumber)) {
    return "wikipedia";
  }
  return "mangaupdates";
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
  mangaDexMappings: VolumeMapping[] | null,
  wikiMappings: VolumeMapping[] | null,
  // oxlint-disable-next-line no-empty-function -- intentional no-op default
  updateProgress: (message: string) => void = () => {},
): { volumesAdded: number; chaptersAdded: number } {
  let chaptersAdded = 0;
  let volumesAdded = 0;

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
        mappingSource: resolveMappingSource(
          volumeNumber,
          mangaDexMappings,
          wikiMappings,
        ),
      })
      .returning()
      .get();
    volumesAdded += 1;

    if (volumeChapters.length > 0) {
      tx.insert(mangaChapters)
        .values(
          volumeChapters.map((chapter) => ({
            mangaVolumeId: volumeRow.id,
            mangaId,
            chapterNumber: chapter.chapterNumber,
            releaseDate: chapter.releaseDate,
            scanlationGroup: chapter.scanlationGroup,
            hasFile: false,
            monitored: shouldMonitorChapter(monitorOption, chapter.releaseDate),
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
        mappingSource: "none",
      })
      .run();
    volumesAdded = 1;
  }

  return { volumesAdded, chaptersAdded };
}

/**
 * Apply volume mappings only to chapters that don't already have a volume assigned.
 * Used as a fallback after a higher-priority source has already mapped some chapters.
 */
function applyFallbackMappings(
  chapters: DeduplicatedChapter[],
  mappings: VolumeMapping[],
): DeduplicatedChapter[] {
  return chapters.map((ch) => {
    if (ch.volume !== null) {
      return ch;
    }
    const num = parseChapterNumber(ch.chapterNumber);
    if (num === null) {
      return ch;
    }
    const mapping = mappings.find(
      (m) => num >= m.firstChapter && num <= m.lastChapter,
    );
    return mapping ? { ...ch, volume: String(mapping.volumeNumber) } : ch;
  });
}

/**
 * Add chapters from MangaDex that are missing from the MangaUpdates release list.
 * Each supplemented chapter gets its volume assignment from the MangaDex mappings.
 */
function supplementChaptersFromMangaDex(
  chapters: DeduplicatedChapter[],
  mangaDexChapterNumbers: string[],
  mangaDexMappings: VolumeMapping[] | null,
): DeduplicatedChapter[] {
  if (mangaDexChapterNumbers.length === 0) {
    return chapters;
  }

  const result = [...chapters];
  const existingChapterNumbers = new Set(chapters.map((c) => c.chapterNumber));

  for (const mdChapter of mangaDexChapterNumbers) {
    if (existingChapterNumbers.has(mdChapter)) {
      continue;
    }
    const parsed = Number.parseFloat(mdChapter);
    // Skip non-numeric, negative, and page-level uploads (e.g., 0.01-0.16)
    if (
      Number.isNaN(parsed) ||
      parsed < 0 ||
      (parsed < 1 && parsed !== 0 && parsed % 0.5 !== 0)
    ) {
      continue;
    }
    const mapping = (mangaDexMappings ?? []).find(
      (m) => parsed >= m.firstChapter && parsed <= m.lastChapter,
    );
    existingChapterNumbers.add(mdChapter);
    result.push({
      chapterNumber: mdChapter,
      volume: mapping ? String(mapping.volumeNumber) : null,
      releaseDate: null,
      scanlationGroup: null,
      fromExpansion: false,
    });
  }

  return result;
}

// ─── Import Manga ──────────────────────────────────────────────────────────

// oxlint-disable-next-line complexity -- Import pipeline orchestrates multiple data sources
const importMangaHandler: CommandHandler = async (
  body,
  updateProgress,
  setTitle,
) => {
  const data = body as unknown as ReturnType<typeof addMangaSchema.parse>;
  setTitle(data.title);

  // Check for duplicates
  updateProgress("Checking for duplicates...");
  const existing = db
    .select({ id: manga.id })
    .from(manga)
    .where(eq(manga.mangaUpdatesId, data.mangaUpdatesId))
    .get();

  if (existing) {
    throw new Error("Manga already exists in your library.");
  }

  // Fetch detail and releases from MangaUpdates
  updateProgress("Fetching series detail from MangaUpdates...");
  const detail = await getMangaUpdatesSeriesDetail(data.mangaUpdatesId);

  updateProgress("Fetching chapter releases...");
  const releases = await getAllMangaUpdatesReleases(
    data.mangaUpdatesId,
    data.title,
  );

  // Deduplicate releases into unique chapters
  let chapters = deduplicateReleases(releases);
  updateProgress(`Processing ${chapters.length} releases...`);

  // ── MangaDex volume mappings (primary) ──
  let mangaDexId: string | null = null;
  let mangaDexMappings: VolumeMapping[] | null = null;
  let mangaDexChapterNumbers: string[] = [];
  try {
    updateProgress("Fetching volume mappings from MangaDex...");
    const mdResult = await getMangaDexVolumeMappings(
      data.title,
      data.mangaUpdatesSlug ?? null,
    );
    if (mdResult) {
      mangaDexId = mdResult.mangaDexId;
      mangaDexMappings = mdResult.mappings;
      mangaDexChapterNumbers = mdResult.allChapterNumbers;
      chapters = applyVolumeMappings(chapters, mdResult.mappings);
    }
  } catch {
    // MangaDex fetch failed -- continue without
  }

  // ── Wikipedia volume mappings (fallback for unmapped chapters) ──
  let wikipediaPageTitle: string | null = null;
  let wikiMappings: VolumeMapping[] | null = null;
  try {
    updateProgress("Fetching volume mappings from Wikipedia...");
    const wikiResult = await getWikipediaVolumeMappings(
      data.title,
      data.latestChapter ?? detail.latest_chapter ?? undefined,
    );
    if (wikiResult) {
      wikipediaPageTitle = wikiResult.pageTitle;
      wikiMappings = wikiResult.mappings;
      // Apply only to chapters not yet mapped by MangaDex
      chapters = applyFallbackMappings(chapters, wikiResult.mappings);
    }
  } catch {
    // Wikipedia fetch failed -- continue with whatever we have
  }

  // ── Supplement chapters from MangaDex (fill MangaUpdates gaps) ──
  chapters = supplementChaptersFromMangaDex(
    chapters,
    mangaDexChapterNumbers,
    mangaDexMappings,
  );

  // Group into volumes
  const volumeGroups = groupChaptersIntoVolumes(chapters);

  // Determine status from detail
  const status = detail.completed ? "complete" : "ongoing";

  // Resolve root folder path from the first selected download profile
  const profile = db
    .select({ rootFolderPath: downloadProfiles.rootFolderPath })
    .from(downloadProfiles)
    .where(eq(downloadProfiles.id, data.downloadProfileIds[0]))
    .get();
  const rootFolder = profile?.rootFolderPath ?? "";
  const sanitizedTitle = data.title.replaceAll("/", "-");

  // Prepare manga insert values outside transaction to reduce branch complexity
  updateProgress("Saving to database...");
  const wikiTimestamp = wikipediaPageTitle ? new Date() : null;
  const mangaValues = {
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
    path: rootFolder ? `${rootFolder}/${sanitizedTitle}` : "",
    metadataUpdatedAt: new Date(),
    wikipediaPageTitle,
    wikipediaFetchedAt: wikiTimestamp,
    mangaDexId,
    mangaDexFetchedAt: mangaDexId ? new Date() : null,
  };

  // DB transaction: insert manga -> volumes -> chapters -> profiles -> history
  const result = db.transaction((tx) => {
    const mangaRow = tx.insert(manga).values(mangaValues).returning().get();

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
      mangaDexMappings,
      wikiMappings,
      updateProgress,
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

  // Fire-and-forget image caching (outside transaction)
  const mangaPosterUrl = data.posterUrl || detail.image?.url?.original || "";
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
      dedupeKey: "mangaUpdatesId",
      handler: importMangaHandler,
    });
  });

// ─── Refresh Manga Metadata ───────────────────────────────────────────────

function extractMangaUpdatesSlug(url: string | undefined): string | null {
  const match = url?.match(/\/series\/(.+)/);
  return match?.[1] ?? null;
}

/**
 * Reassign ungrouped chapters to proper volumes when mapping data becomes
 * available. Finds chapters currently in the "null volume" bucket and moves
 * them to matching numbered volumes (creating volumes as needed).
 */
function reassignUngroupedChapters(
  mangaId: number,
  mappedChapters: DeduplicatedChapter[],
  existingByNumber: Map<string, { id: number; mangaVolumeId: number }>,
  ungroupedVolumeId: number,
  mangaDexMappings: VolumeMapping[] | null,
  wikiMappings: VolumeMapping[] | null,
): void {
  for (const ch of mappedChapters) {
    if (!ch.volume) {
      continue;
    }
    const existing = existingByNumber.get(ch.chapterNumber);
    if (!existing || existing.mangaVolumeId !== ungroupedVolumeId) {
      continue;
    }

    const volumeNum = Number.parseInt(ch.volume, 10);
    if (Number.isNaN(volumeNum)) {
      continue;
    }

    // Find or create the target volume
    let targetVolume = db
      .select({ id: mangaVolumes.id })
      .from(mangaVolumes)
      .where(
        and(
          eq(mangaVolumes.mangaId, mangaId),
          eq(mangaVolumes.volumeNumber, volumeNum),
        ),
      )
      .get();

    if (!targetVolume) {
      targetVolume = db
        .insert(mangaVolumes)
        .values({
          mangaId,
          volumeNumber: volumeNum,
          title: volumeTitle(volumeNum),
          monitored: true,
          mappingSource: resolveMappingSource(
            volumeNum,
            mangaDexMappings,
            wikiMappings,
          ),
        })
        .returning({ id: mangaVolumes.id })
        .get();
    }

    db.update(mangaChapters)
      .set({ mangaVolumeId: targetVolume.id })
      .where(eq(mangaChapters.id, existing.id))
      .run();
  }
}

/**
 * Find new chapters not already in the DB and insert them into
 * existing or new volumes. Also updates volume assignments for
 * existing ungrouped chapters when release data provides volume info.
 * Returns the count of chapters added.
 */
function insertNewChapters(
  mangaId: number,
  releases: MangaUpdatesRelease[],
  monitorOption: "all" | "future" | "missing" | "none",
  wikiMappings: VolumeMapping[] | null = null,
  mangaDexMappings: VolumeMapping[] | null = null,
  mangaDexChapterNumbers: string[] = [],
): number {
  const chapters = deduplicateReleases(releases);

  // Apply MangaDex mappings (primary)
  let mappedChapters = mangaDexMappings
    ? applyVolumeMappings(chapters, mangaDexMappings)
    : [...chapters];

  // Apply Wikipedia mappings only to chapters still unmapped
  if (wikiMappings) {
    mappedChapters = applyFallbackMappings(mappedChapters, wikiMappings);
  }

  // Supplement with chapters from MangaDex not in MangaUpdates
  mappedChapters = supplementChaptersFromMangaDex(
    mappedChapters,
    mangaDexChapterNumbers,
    mangaDexMappings,
  );

  // Build map of existing chapters for dedup and volume updates
  const existingRows = db
    .select({
      id: mangaChapters.id,
      chapterNumber: mangaChapters.chapterNumber,
      mangaVolumeId: mangaChapters.mangaVolumeId,
    })
    .from(mangaChapters)
    .where(eq(mangaChapters.mangaId, mangaId))
    .all();

  const existingByNumber = new Map<
    string,
    { id: number; mangaVolumeId: number }
  >();
  for (const row of existingRows) {
    existingByNumber.set(normalizeChapterNumber(row.chapterNumber), {
      id: row.id,
      mangaVolumeId: row.mangaVolumeId,
    });
  }

  // Find the ungrouped volume for this manga
  const ungroupedVolume = db
    .select({ id: mangaVolumes.id })
    .from(mangaVolumes)
    .where(
      and(
        eq(mangaVolumes.mangaId, mangaId),
        sql`${mangaVolumes.volumeNumber} IS NULL`,
      ),
    )
    .get();
  const ungroupedVolumeId = ungroupedVolume?.id ?? -1;

  // Update volume assignments for existing ungrouped chapters
  reassignUngroupedChapters(
    mangaId,
    mappedChapters,
    existingByNumber,
    ungroupedVolumeId,
    mangaDexMappings,
    wikiMappings,
  );

  const existingChapterNumbers = new Set(existingByNumber.keys());
  const newChapters = mappedChapters.filter(
    (c) => !existingChapterNumbers.has(c.chapterNumber),
  );

  if (newChapters.length === 0) {
    return 0;
  }

  const volumeGroups = groupChaptersIntoVolumes(newChapters);
  let added = 0;

  for (const [volumeNumber, volumeChapters] of volumeGroups) {
    const volumeCondition =
      volumeNumber === null
        ? and(
            eq(mangaVolumes.mangaId, mangaId),
            eq(mangaVolumes.volumeNumber, null as unknown as number),
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
          mappingSource: resolveMappingSource(
            volumeNumber,
            mangaDexMappings,
            wikiMappings,
          ),
        })
        .returning()
        .get();
    }

    if (volumeChapters.length > 0) {
      db.insert(mangaChapters)
        .values(
          volumeChapters.map((chapter) => ({
            mangaVolumeId: volumeRow.id,
            mangaId,
            chapterNumber: chapter.chapterNumber,
            releaseDate: chapter.releaseDate,
            scanlationGroup: chapter.scanlationGroup,
            hasFile: false,
            monitored: shouldMonitorChapter(monitorOption, chapter.releaseDate),
          })),
        )
        .run();
      added += volumeChapters.length;
    }
  }

  return added;
}

/**
 * Core refresh logic without progress callbacks.
 * Reusable by both the ad-hoc command handler and batch scheduled tasks.
 */
// oxlint-disable-next-line complexity -- Refresh logic requires many conditional branches
export async function refreshMangaInternal(
  mangaId: number,
): Promise<{ success: boolean; newChaptersAdded: number }> {
  const mangaRow = db.select().from(manga).where(eq(manga.id, mangaId)).get();

  if (!mangaRow) {
    throw new Error("Manga not found");
  }

  // Fetch latest from MangaUpdates
  const detail = await getMangaUpdatesSeriesDetail(mangaRow.mangaUpdatesId);
  const allReleases = await getAllMangaUpdatesReleases(
    mangaRow.mangaUpdatesId,
    mangaRow.title,
  );

  // Update manga metadata
  const status = detail.completed ? "complete" : "ongoing";
  db.update(manga)
    .set({
      title: detail.title || mangaRow.title,
      sortTitle: detail.title
        ? generateSortTitle(detail.title)
        : mangaRow.sortTitle,
      overview: detail.description || mangaRow.overview,
      mangaUpdatesSlug:
        extractMangaUpdatesSlug(detail.url) ?? mangaRow.mangaUpdatesSlug,
      type: detail.type?.toLowerCase() || mangaRow.type,
      year: detail.year || mangaRow.year,
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
    .where(eq(manga.id, mangaId))
    .run();

  // Fire-and-forget image caching on refresh
  const refreshPosterUrl = detail.image?.url?.original || mangaRow.posterUrl;
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

  // Fetch MangaDex volume mappings if never fetched or stale (7+ days)
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  let mangaDexMappings: VolumeMapping[] | null = null;
  let mangaDexChapterNumbers: string[] = [];
  const lastMdFetch = mangaRow.mangaDexFetchedAt
    ? new Date(mangaRow.mangaDexFetchedAt).getTime()
    : 0;
  const mangaDexStale = Date.now() - lastMdFetch > SEVEN_DAYS_MS;

  if (mangaDexStale) {
    try {
      const mdResult = await getMangaDexVolumeMappings(
        mangaRow.title,
        mangaRow.mangaUpdatesSlug ?? null,
        mangaRow.mangaDexId,
      );
      if (mdResult) {
        mangaDexMappings = mdResult.mappings;
        mangaDexChapterNumbers = mdResult.allChapterNumbers;
        db.update(manga)
          .set({
            mangaDexId: mdResult.mangaDexId,
            mangaDexFetchedAt: new Date(),
          })
          .where(eq(manga.id, mangaId))
          .run();
      }
    } catch {
      // MangaDex fetch failed -- continue without
    }
  }

  // Fetch Wikipedia volume mappings if never fetched or stale (7+ days)
  const lastWikiFetch = mangaRow.wikipediaFetchedAt
    ? new Date(mangaRow.wikipediaFetchedAt).getTime()
    : 0;
  const wikipediaStale = Date.now() - lastWikiFetch > SEVEN_DAYS_MS;

  let wikiMappings: VolumeMapping[] | null = null;
  if (wikipediaStale) {
    try {
      const wikiResult = await getWikipediaVolumeMappings(
        mangaRow.title,
        detail.latest_chapter ?? mangaRow.latestChapter ?? undefined,
      );
      if (wikiResult) {
        wikiMappings = wikiResult.mappings;
        db.update(manga)
          .set({
            wikipediaPageTitle: wikiResult.pageTitle,
            wikipediaFetchedAt: new Date(),
          })
          .where(eq(manga.id, mangaId))
          .run();
      }
    } catch {
      // Wikipedia fetch failed -- continue without
    }
  }

  // Insert any new chapters
  const monitorOption = mangaRow.monitorNewChapters as
    | "all"
    | "future"
    | "missing"
    | "none";
  const newChaptersAdded = insertNewChapters(
    mangaId,
    allReleases,
    monitorOption,
    wikiMappings,
    mangaDexMappings,
    mangaDexChapterNumbers,
  );

  if (newChaptersAdded > 0) {
    db.insert(history)
      .values({
        eventType: "mangaUpdated",
        mangaId,
        data: {
          title: mangaRow.title,
          newChapters: newChaptersAdded,
        },
      })
      .run();
  }

  return { success: true, newChaptersAdded };
}

const refreshMangaHandler: CommandHandler = async (
  body,
  updateProgress,
  setTitle,
) => {
  const data = body as { mangaId: number };

  // Get manga title for progress message
  const mangaRow = db
    .select({ title: manga.title })
    .from(manga)
    .where(eq(manga.id, data.mangaId))
    .get();
  if (mangaRow) {
    setTitle(mangaRow.title);
  }

  updateProgress("Fetching latest data...");
  const result = await refreshMangaInternal(data.mangaId);

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
      batchTaskId: "refresh-mangaupdates-metadata",
      handler: refreshMangaHandler,
    });
  });
