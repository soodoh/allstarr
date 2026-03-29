/**
 * MangaDex API client for manga volume/chapter aggregate data.
 * API docs: https://api.mangadex.org/docs/
 */

import { createApiFetcher, ApiRateLimitError } from "./api-cache";
import { parseChapterNumber } from "./manga-chapter-utils";
import type { WikipediaVolumeMapping as VolumeMapping } from "./wikipedia";

// ─── Types ────────────────────────────────────────────────────────────────

export type MangaDexChapterEntry = {
  chapter: string;
  id: string;
  others: string[];
  count: number;
};

export type MangaDexVolumeEntry = {
  volume: string;
  count: number;
  chapters: Record<string, MangaDexChapterEntry>;
};

export type MangaDexAggregateResponse = {
  result: string;
  volumes: Record<string, MangaDexVolumeEntry>;
};

export type MangaDexAggregateResult = {
  mappings: VolumeMapping[];
  ungroupedChapters: string[];
  allChapterNumbers: string[];
};

type MangaDexMangaAttributes = {
  title: Record<string, string>;
  links: Record<string, string> | null;
};

type MangaDexMangaResult = {
  id: string;
  type: string;
  attributes: MangaDexMangaAttributes;
};

type MangaDexSearchResponse = {
  result: string;
  data: MangaDexMangaResult[];
};

// ─── API Client ───────────────────────────────────────────────────────────

const mangaDex = createApiFetcher({
  name: "mangadex",
  cache: { ttlMs: 10 * 60 * 1000, maxEntries: 500 },
  rateLimit: { maxRequests: 5, windowMs: 1000 },
  retry: { maxRetries: 3, baseDelayMs: 1000 },
});

const MANGADEX_API_URL = "https://api.mangadex.org";
const REQUEST_TIMEOUT_MS = 15_000;

async function mangaDexFetch<T>(cacheKey: string, url: string): Promise<T> {
  return mangaDex.fetch<T>(cacheKey, async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 429) {
        throw new ApiRateLimitError("MangaDex rate limit");
      }
      if (!response.ok) {
        throw new Error(
          `MangaDex API error: ${response.status} ${response.statusText}`,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("MangaDex API request timed out.", { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  });
}

// ─── Pure Functions ───────────────────────────────────────────────────────

/**
 * Parses a MangaDex aggregate response into volume mappings and chapter lists.
 *
 * - Computes firstChapter and lastChapter as min/max of numeric chapter keys
 *   per volume (non-numeric keys are skipped).
 * - Excludes the "none" bucket from volume mappings.
 * - Collects "none" bucket chapter keys as ungroupedChapters.
 * - Collects all chapter keys from all volumes (including "none") as allChapterNumbers.
 * - Sorts volume mappings by volumeNumber ascending.
 */
export function parseMangaDexAggregate(
  aggregate: MangaDexAggregateResponse,
): MangaDexAggregateResult {
  const mappings: VolumeMapping[] = [];
  const ungroupedChapters: string[] = [];
  const allChapterSet = new Set<string>();

  for (const [volumeKey, volumeEntry] of Object.entries(aggregate.volumes)) {
    const chapterKeys = Object.keys(volumeEntry.chapters);

    // Collect all unique chapter keys
    for (const key of chapterKeys) {
      allChapterSet.add(key);
    }

    if (volumeKey === "none") {
      // Ungrouped chapters
      ungroupedChapters.push(...chapterKeys);
      continue;
    }

    const volumeNumber = Number(volumeKey);
    if (!Number.isFinite(volumeNumber)) {
      continue;
    }

    // Compute min/max from numeric chapter keys only
    const numericChapterValues: number[] = [];
    for (const chapterKey of chapterKeys) {
      const num = parseChapterNumber(chapterKey);
      if (num !== null) {
        numericChapterValues.push(num);
      }
    }

    if (numericChapterValues.length === 0) {
      continue;
    }

    const firstChapter = Math.min(...numericChapterValues);
    const lastChapter = Math.max(...numericChapterValues);

    mappings.push({ volumeNumber, firstChapter, lastChapter });
  }

  // Sort by volumeNumber ascending
  mappings.sort((a, b) => a.volumeNumber - b.volumeNumber);

  return { mappings, ungroupedChapters, allChapterNumbers: [...allChapterSet] };
}

/**
 * Checks whether our MangaUpdates slug matches the MangaDex "mu" link value.
 *
 * Our slug format: "njeqwry/berserk" (ID/title-slug) or just "njeqwry" (ID only).
 * MangaDex stores only the ID portion: "njeqwry".
 *
 * Returns true if the ID portion of our slug matches the MangaDex mu link value.
 */
export function matchMangaUpdatesSlug(
  ourSlug: string | null,
  mangaDexMuLink: string | null,
): boolean {
  if (ourSlug === null || mangaDexMuLink === null) {
    return false;
  }

  // Extract just the ID portion (before the first "/")
  const idPortion = ourSlug.split("/")[0];
  return idPortion === mangaDexMuLink;
}

// ─── API Functions ────────────────────────────────────────────────────────

/**
 * Searches MangaDex for a manga by title and attempts to verify the match
 * using the MangaUpdates slug from the MangaDex links attributes.
 *
 * Returns the MangaDex manga ID if a match is found, or null otherwise.
 */
export async function searchAndMatchManga(
  title: string,
  mangaUpdatesSlug: string | null,
): Promise<string | null> {
  const url = new URL(`${MANGADEX_API_URL}/manga`);
  url.searchParams.set("title", title);
  url.searchParams.set("limit", "10");

  const cacheKey = `search:${title}`;
  const data = await mangaDexFetch<MangaDexSearchResponse>(
    cacheKey,
    url.toString(),
  );

  if (!data.data || data.data.length === 0) {
    return null;
  }

  for (const manga of data.data) {
    const muLink = manga.attributes.links?.mu ?? null;
    if (matchMangaUpdatesSlug(mangaUpdatesSlug, muLink)) {
      return manga.id;
    }
  }

  return null;
}

/**
 * Fetches the chapter aggregate for a MangaDex manga ID.
 */
export async function getMangaDexAggregate(
  mangaDexId: string,
): Promise<MangaDexAggregateResponse> {
  const cacheKey = `aggregate:${mangaDexId}`;
  return mangaDexFetch<MangaDexAggregateResponse>(
    cacheKey,
    `${MANGADEX_API_URL}/manga/${mangaDexId}/aggregate`,
  );
}

/**
 * Main entry point. Resolves MangaDex volume mappings for a manga.
 *
 * 1. If an existing MangaDex ID is provided, use it directly.
 * 2. Otherwise, search by title and verify via MangaUpdates slug.
 * 3. Fetch aggregate data and parse into volume mappings.
 *
 * Returns null if no match is found or the aggregate yields no mappings.
 */
export async function getMangaDexVolumeMappings(
  title: string,
  mangaUpdatesSlug: string | null,
  existingMangaDexId: string | null = null,
): Promise<{
  mangaDexId: string;
  mappings: VolumeMapping[];
  ungroupedChapters: string[];
  allChapterNumbers: string[];
} | null> {
  let mangaDexId = existingMangaDexId;

  if (!mangaDexId) {
    mangaDexId = await searchAndMatchManga(title, mangaUpdatesSlug);
  }

  if (!mangaDexId) {
    return null;
  }

  const aggregate = await getMangaDexAggregate(mangaDexId);
  const { mappings, ungroupedChapters, allChapterNumbers } =
    parseMangaDexAggregate(aggregate);

  if (mappings.length === 0 && allChapterNumbers.length === 0) {
    return null;
  }

  return { mangaDexId, mappings, ungroupedChapters, allChapterNumbers };
}
