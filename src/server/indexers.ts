import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  indexers,
  syncedIndexers,
  downloadClients,
  history,
  books,
  booksAuthors,
  authorDownloadProfiles,
  downloadProfiles,
  bookFiles,
  blocklist,
  trackedDownloads,
  editions,
  editionDownloadProfiles,
} from "src/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  createIndexerSchema,
  updateIndexerSchema,
  testIndexerSchema,
  updateSyncedIndexerSchema,
  searchIndexersSchema,
  grabReleaseSchema,
} from "src/lib/validators";
import {
  canQueryIndexer,
  canGrabIndexer,
  getAllIndexerStatuses,
} from "./indexer-rate-limiter";
import * as prowlarrHttp from "./indexers/http";
import {
  enrichRelease,
  matchAllFormats,
  getProfileWeight,
  isFormatInProfile,
  getDefSizeLimits,
  getFormatType,
  parseReleaseGroup,
} from "./indexers/format-parser";
import type { EditionMeta } from "./indexers/format-parser";
import getProvider from "./download-clients/registry";
import * as fuzz from "fuzzball";
import type {
  IndexerRelease,
  ReleaseRejection,
  FormatScoreDetail,
  ReleaseStatusMap,
} from "./indexers/types";
import { calculateCFScore } from "./indexers/cf-scoring";
import type { ReleaseAttributes } from "./indexers/cf-scoring";
import type { BookSearchParams } from "./indexers/http";
import type { ConnectionConfig } from "./download-clients/types";
import { fetchQueueItems } from "./queue";

// ─── Category constants ──────────────────────────────────────────────────────

export type ProfileInfo = {
  id: number;
  name: string;
  items: number[][];
  cutoff: number;
  upgradeAllowed: boolean;
  categories: number[];
  minCustomFormatScore: number;
  upgradeUntilCustomFormatScore: number;
};

/** Look up the download profiles for a book's primary author */
export function getProfilesForBook(bookId: number): ProfileInfo[] | null {
  const bookAuthor = db
    .select({ authorId: booksAuthors.authorId })
    .from(booksAuthors)
    .where(
      and(eq(booksAuthors.bookId, bookId), eq(booksAuthors.isPrimary, true)),
    )
    .get();

  if (!bookAuthor?.authorId) {
    return null;
  }

  const profileLinks = db
    .select({ downloadProfileId: authorDownloadProfiles.downloadProfileId })
    .from(authorDownloadProfiles)
    .where(eq(authorDownloadProfiles.authorId, bookAuthor.authorId))
    .all();

  if (profileLinks.length === 0) {
    return null;
  }

  const profileIds = profileLinks.map((l) => l.downloadProfileId);
  const rows = db
    .select()
    .from(downloadProfiles)
    .where(inArray(downloadProfiles.id, profileIds))
    .all();

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    items: p.items,
    cutoff: p.cutoff,
    upgradeAllowed: p.upgradeAllowed,
    categories: p.categories,
    minCustomFormatScore: p.minCustomFormatScore,
    upgradeUntilCustomFormatScore: p.upgradeUntilCustomFormatScore,
  }));
}

/** Derive a union of allowed definition IDs across all profiles, preserving group structure */
export function unionProfileItems(profiles: ProfileInfo[]): number[][] | null {
  if (profiles.length === 0) {
    return null;
  }
  const seen = new Set<number>();
  const result: number[][] = [];
  for (const profile of profiles) {
    for (const group of profile.items) {
      const newGroup = group.filter((id) => !seen.has(id));
      if (newGroup.length > 0) {
        result.push(newGroup);
        for (const id of newGroup) {
          seen.add(id);
        }
      }
    }
  }
  return result.length > 0 ? result : null;
}

/** Derive search categories from download profiles as a union of each profile's stored categories */
export function getCategoriesForProfiles(profiles: ProfileInfo[]): number[] {
  const union = new Set<number>();
  for (const profile of profiles) {
    for (const cat of profile.categories) {
      union.add(cat);
    }
  }
  return union.size > 0 ? [...union] : [];
}

// ─── Release title cleaning & fuzzy matching ─────────────────────────────────

/**
 * Strip noise from a release title so fuzzy matching compares meaningful text.
 * Removes: file extensions, format tags, release group tags, year/version tags,
 * series info in brackets, and normalizes separators to spaces.
 */
export function cleanReleaseTitle(title: string): string {
  let cleaned = title;
  // Remove file extensions (ebook + audiobook formats)
  cleaned = cleaned.replace(
    /\.(epub|mobi|azw3?|pdf|cbr|cbz|fb2|lit|djvu|txt|rtf|doc|docx|m4b|mp3|flac|aac|ogg|wma)$/i,
    "",
  );
  // Remove release group tags like -GROUP, [GROUP]
  cleaned = cleaned.replace(/[-[]\w+[\]]?\s*$/, "");
  // Remove bracketed/parenthesized metadata: [v1], (epub), [2020], {retail}, etc.
  cleaned = cleaned.replaceAll(/[[({][^\])}\n]*[\])}]/g, "");
  // Remove year tags like .2020. or -2020-
  cleaned = cleaned.replaceAll(/[.\s_-](19|20)\d{2}[.\s_-]/g, " ");
  // Remove version tags like v1, v2.1
  cleaned = cleaned.replaceAll(/\bv\d+(\.\d+)?\b/gi, "");
  // Normalize separators (dots, underscores, hyphens) to spaces
  cleaned = cleaned.replaceAll(/[._-]+/g, " ");
  // Collapse whitespace
  cleaned = cleaned.replaceAll(/\s+/g, " ").trim();
  return cleaned;
}

export type BookInfo = { title: string; authorName: string | null };

/**
 * Check whether a release title is relevant to the expected book.
 * Returns true if the release passes both author and title checks.
 * Releases that fail are silently filtered out.
 *
 * Author check uses max(token_set_ratio, partial_ratio) to handle
 * abbreviations like "R. Jordan" matching "Robert Jordan".
 * Title check uses the same approach to handle extra tokens and substrings.
 */
export function isRelevantRelease(
  releaseTitle: string,
  bookInfo: BookInfo,
): boolean {
  const cleaned = cleanReleaseTitle(releaseTitle);

  // Author check
  if (bookInfo.authorName) {
    const tokenSetScore = fuzz.token_set_ratio(bookInfo.authorName, cleaned);
    const partialScore = fuzz.partial_ratio(bookInfo.authorName, cleaned);
    const authorScore = Math.max(tokenSetScore, partialScore);
    if (authorScore < 60) {
      return false;
    }
  }

  // Title check — skip for very short titles that can't be meaningfully matched
  const trimmedTitle = bookInfo.title.trim();
  if (trimmedTitle.length >= 3) {
    const tokenSetScore = fuzz.token_set_ratio(trimmedTitle, cleaned);
    const partialScore = fuzz.partial_ratio(trimmedTitle, cleaned);
    const titleScore = Math.max(tokenSetScore, partialScore);
    if (titleScore < 70) {
      return false;
    }
  }

  return true;
}

/** Build a human-readable context string for rejection messages */
function getDimensionContext(
  qualityId: number,
  editionMeta?: EditionMeta | null,
): string {
  const formatType = getFormatType(qualityId);
  if (!formatType) {
    return "";
  }

  if (formatType === "ebook") {
    const pages = editionMeta?.pageCount;
    return pages
      ? ` (based on ${pages} pages)`
      : " (based on default page count)";
  }
  if (formatType === "audio") {
    const minutes = editionMeta?.audioLength;
    if (minutes) {
      const hours = Math.round((minutes / 60) * 10) / 10;
      return ` (based on ${hours}h duration)`;
    }
    return " (based on default duration)";
  }
  return "";
}

/** Compute rejections and format score for a release against the author's profiles */
export function computeReleaseMetrics(
  release: IndexerRelease,
  profiles: ProfileInfo[] | null,
  editionMeta?: EditionMeta | null,
): {
  rejections: ReleaseRejection[];
  formatScore: number;
  formatScoreDetails: FormatScoreDetail[];
  cfScore: number;
  cfDetails: Array<{ cfId: number; name: string; score: number }>;
} {
  const rejections: ReleaseRejection[] = [];
  const formatScoreDetails: FormatScoreDetail[] = [];

  // Unknown quality — no format definition matched
  if (release.quality.id === 0) {
    rejections.push({
      reason: "unknownQuality",
      message: "Unknown quality — no format matched this release",
    });
    return {
      rejections,
      formatScore: 0,
      formatScoreDetails,
      cfScore: 0,
      cfDetails: [],
    };
  }

  // Check size limits from quality definition (values are in MB)
  const sizeLimits = getDefSizeLimits(release.quality.id, editionMeta);
  if (sizeLimits) {
    const sizeMB = release.size / (1024 * 1024);
    if (sizeLimits.minSize > 0 && sizeMB < sizeLimits.minSize) {
      const context = getDimensionContext(release.quality.id, editionMeta);
      rejections.push({
        reason: "belowMinimumSize",
        message: `${release.sizeFormatted} is below minimum ${Math.round(sizeLimits.minSize)} MB for ${release.quality.name}${context}`,
      });
    }
    if (sizeLimits.maxSize > 0 && sizeMB > sizeLimits.maxSize) {
      const context = getDimensionContext(release.quality.id, editionMeta);
      rejections.push({
        reason: "aboveMaximumSize",
        message: `${release.sizeFormatted} is above maximum ${Math.round(sizeLimits.maxSize)} MB for ${release.quality.name}${context}`,
      });
    }
  }

  // No profiles assigned — return base quality weight
  if (!profiles || profiles.length === 0) {
    return {
      rejections,
      formatScore: release.quality.weight,
      formatScoreDetails,
      cfScore: 0,
      cfDetails: [],
    };
  }

  // Build release attributes for CF scoring
  const cfAttrs: ReleaseAttributes = {
    title: release.title,
    group: parseReleaseGroup(release.title) ?? undefined,
    sizeMB: release.size > 0 ? release.size / (1024 * 1024) : undefined,
    indexerFlags: release.indexerFlags ?? undefined,
  };

  // Compute per-profile scores
  let maxScore = 0;
  let allowedInAny = false;
  let bestCFScore = 0;
  let bestCFDetails: Array<{ cfId: number; name: string; score: number }> = [];

  for (const profile of profiles) {
    const allowed = isFormatInProfile(release.quality.id, profile.items);
    if (allowed) {
      const score = getProfileWeight(release.quality.id, profile.items);
      formatScoreDetails.push({
        profileName: profile.name,
        score,
        allowed: true,
      });
      allowedInAny = true;
      maxScore = Math.max(maxScore, score);

      // Calculate CF score for this profile
      const cfResult = calculateCFScore(profile.id, cfAttrs);
      if (cfResult.totalScore > bestCFScore || bestCFDetails.length === 0) {
        bestCFScore = cfResult.totalScore;
        bestCFDetails = cfResult.matchedFormats;
      }

      // Check minimum CF score threshold
      if (cfResult.totalScore < profile.minCustomFormatScore) {
        rejections.push({
          reason: "belowMinimumCFScore",
          message: `Custom format score ${cfResult.totalScore} is below minimum ${profile.minCustomFormatScore} for profile "${profile.name}"`,
        });
      }
    } else {
      formatScoreDetails.push({
        profileName: profile.name,
        score: 0,
        allowed: false,
      });
    }
  }

  if (!allowedInAny) {
    rejections.push({
      reason: "qualityNotWanted",
      message: `${release.quality.name} is not allowed in any download profile`,
    });
  }

  return {
    rejections,
    formatScore: maxScore,
    formatScoreDetails,
    cfScore: bestCFScore,
    cfDetails: bestCFDetails,
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export const getIndexersFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db.select().from(indexers).all();
  },
);

export const getIndexerFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const result = db
      .select()
      .from(indexers)
      .where(eq(indexers.id, data.id))
      .get();
    if (!result) {
      throw new Error("Indexer not found");
    }
    return result;
  });

export const createIndexerFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createIndexerSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return db
      .insert(indexers)
      .values({
        name: data.name,
        implementation: data.implementation,
        protocol: data.protocol,
        baseUrl: data.baseUrl,
        apiPath: data.apiPath,
        apiKey: data.apiKey,
        categories: JSON.stringify(data.categories),
        enableRss: data.enableRss,
        enableAutomaticSearch: data.enableAutomaticSearch,
        enableInteractiveSearch: data.enableInteractiveSearch,
        priority: data.priority,
        tag: data.tag,
        downloadClientId: data.downloadClientId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .returning()
      .get();
  });

export const updateIndexerFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateIndexerSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;
    return db
      .update(indexers)
      .set({
        name: values.name,
        implementation: values.implementation,
        protocol: values.protocol,
        baseUrl: values.baseUrl,
        apiPath: values.apiPath,
        apiKey: values.apiKey,
        categories: JSON.stringify(values.categories),
        enableRss: values.enableRss,
        enableAutomaticSearch: values.enableAutomaticSearch,
        enableInteractiveSearch: values.enableInteractiveSearch,
        priority: values.priority,
        tag: values.tag,
        downloadClientId: values.downloadClientId,
        updatedAt: Date.now(),
      })
      .where(eq(indexers.id, id))
      .returning()
      .get();
  });

export const deleteIndexerFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(indexers).where(eq(indexers.id, data.id)).run();
    return { success: true };
  });

export const getSyncedIndexersFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db
      .select()
      .from(syncedIndexers)
      .orderBy(asc(syncedIndexers.name))
      .all();
  },
);

// ─── Connection Test ──────────────────────────────────────────────────────────

export const testIndexerFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => testIndexerSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return prowlarrHttp.testNewznab({
      baseUrl: data.baseUrl,
      apiPath: data.apiPath,
      apiKey: data.apiKey,
    });
  });

// ─── Update synced indexer (download client only) ────────────────────────────

export const updateSyncedIndexerFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateSyncedIndexerSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return db
      .update(syncedIndexers)
      .set({
        tag: data.tag,
        downloadClientId: data.downloadClientId,
        requestInterval: data.requestInterval,
        dailyQueryLimit: data.dailyQueryLimit,
        dailyGrabLimit: data.dailyGrabLimit,
        updatedAt: Date.now(),
      })
      .where(eq(syncedIndexers.id, data.id))
      .returning()
      .get();
  });

// ─── Enabled-indexer check ────────────────────────────────────────────────────

export const hasEnabledIndexersFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const manualCount = db
      .select()
      .from(indexers)
      .where(eq(indexers.enableAutomaticSearch, true))
      .all().length;
    if (manualCount > 0) {
      return true;
    }

    const syncedCount = db
      .select()
      .from(syncedIndexers)
      .where(eq(syncedIndexers.enableSearch, true))
      .all().length;
    return syncedCount > 0;
  },
);

// ─── Indexer rate limit statuses ─────────────────────────────────────────────

export const getIndexerStatusesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();

    const manualIds = db
      .select({ id: indexers.id })
      .from(indexers)
      .all()
      .map((r) => r.id);
    const syncedIds = db
      .select({ id: syncedIndexers.id })
      .from(syncedIndexers)
      .all()
      .map((r) => r.id);

    return getAllIndexerStatuses(manualIds, syncedIds);
  },
);

// ─── Post-processing ─────────────────────────────────────────────────────────

/** Deduplicate releases, apply profile scoring/rejections, and sort */
export function dedupeAndScoreReleases(
  allReleases: IndexerRelease[],
  bookId: number | null,
  bookInfo: BookInfo | null,
): IndexerRelease[] {
  // Deduplicate by guid
  const seen = new Set<string>();
  const unique: IndexerRelease[] = [];
  for (const release of allReleases) {
    if (!seen.has(release.guid)) {
      seen.add(release.guid);
      unique.push(release);
    }
  }

  // Filter out irrelevant releases (wrong author/title)
  const relevant = bookInfo
    ? unique.filter((r) => isRelevantRelease(r.title, bookInfo))
    : unique;

  // Look up the author's download profiles for scoring and rejections
  const profiles = bookId ? getProfilesForBook(bookId) : null;
  const profileItems = profiles ? unionProfileItems(profiles) : null;

  // Look up monitored edition metadata for dynamic size calculations
  let editionMeta: EditionMeta | null = null;
  if (bookId) {
    const monitoredEdition = db
      .select({
        pageCount: editions.pageCount,
        audioLength: editions.audioLength,
      })
      .from(editions)
      .innerJoin(
        editionDownloadProfiles,
        eq(editionDownloadProfiles.editionId, editions.id),
      )
      .where(eq(editions.bookId, bookId))
      .limit(1)
      .get();
    if (monitoredEdition) {
      editionMeta = {
        pageCount: monitoredEdition.pageCount,
        audioLength: monitoredEdition.audioLength,
      };
    }
  }

  // Re-evaluate quality using profile priority when multiple formats match.
  // A release title like "mobi, epub, pdf or azw3" matches all four formats;
  // pick the one ranked highest in the user's download profile.
  if (profileItems) {
    for (const release of relevant) {
      const allMatches = matchAllFormats({
        title: release.title,
        size: release.size,
        indexerFlags: release.indexerFlags ?? null,
      });

      if (allMatches.length > 1) {
        // Find the match with the best profile position (highest weight from profile)
        let bestMatch = allMatches[0];
        let bestWeight = getProfileWeight(bestMatch.id, profileItems);
        for (let i = 1; i < allMatches.length; i += 1) {
          const w = getProfileWeight(allMatches[i].id, profileItems);
          if (w > bestWeight) {
            bestMatch = allMatches[i];
            bestWeight = w;
          }
        }
        release.quality = { ...bestMatch, weight: bestWeight };
      } else {
        // Single match — just override weight with profile-derived weight
        release.quality.weight = getProfileWeight(
          release.quality.id,
          profileItems,
        );
      }
    }
  }

  // Load blocklist titles (all entries — global + book-specific)
  const blocklistedTitles = new Set(
    db
      .select({ sourceTitle: blocklist.sourceTitle })
      .from(blocklist)
      .all()
      .map((b) => b.sourceTitle),
  );

  // Compute rejections and format scores (including CF scores)
  for (const release of relevant) {
    const metrics = computeReleaseMetrics(release, profiles, editionMeta);
    release.rejections = metrics.rejections;
    release.formatScore = metrics.formatScore;
    release.formatScoreDetails = metrics.formatScoreDetails;
    release.cfScore = metrics.cfScore;
    release.cfDetails = metrics.cfDetails;

    // Check blocklist
    if (blocklistedTitles.has(release.title)) {
      release.rejections.push({
        reason: "blocklisted",
        message: "Release title is on the blocklist",
      });
    }
  }

  // Sort by quality weight descending, then CF score descending, then by size descending
  relevant.sort((a, b) => {
    const qualityDiff = b.quality.weight - a.quality.weight;
    if (qualityDiff !== 0) {
      return qualityDiff;
    }
    const cfDiff = b.cfScore - a.cfScore;
    if (cfDiff !== 0) {
      return cfDiff;
    }
    return b.size - a.size;
  });

  return relevant;
}

// ─── Search ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Search all indexers sequentially with rate limiter gating. */
async function searchAllIndexers(
  enabledSynced: Array<typeof syncedIndexers.$inferSelect>,
  enabledManual: Array<typeof indexers.$inferSelect>,
  query: string,
  categories: number[],
  bookParams?: BookSearchParams,
  interactive = false,
): Promise<{ releases: IndexerRelease[]; warnings: string[] }> {
  const allReleases: IndexerRelease[] = [];
  const warnings: string[] = [];

  const syncedWithKey = enabledSynced.filter((s) => s.apiKey);
  for (const synced of syncedWithKey) {
    // Rate limiter gate — interactive searches bypass daily caps
    const gate = canQueryIndexer("synced", synced.id);
    if (!gate.allowed) {
      if (gate.reason === "pacing" && gate.waitMs) {
        await sleep(gate.waitMs);
      } else if (!interactive) {
        warnings.push(`Indexer "${synced.name}" skipped: ${gate.reason}`);
        continue;
      }
      // Interactive: skip only backoff, allow daily cap bypass
      if (gate.reason === "backoff") {
        warnings.push(`Indexer "${synced.name}" in backoff, skipping`);
        continue;
      }
    }

    try {
      const results = await prowlarrHttp.searchNewznab(
        {
          baseUrl: synced.baseUrl,
          apiPath: synced.apiPath ?? "/api",
          apiKey: synced.apiKey!,
        },
        query,
        categories,
        bookParams,
        { indexerType: "synced", indexerId: synced.id },
      );
      allReleases.push(
        ...results.map((r) =>
          enrichRelease({
            ...r,
            indexer: r.indexer || synced.name,
            allstarrIndexerId: synced.id,
            indexerSource: "synced" as const,
          }),
        ),
      );
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : "Unknown indexer error",
      );
    }
  }

  for (const ix of enabledManual) {
    // Rate limiter gate — interactive searches bypass daily caps
    const gate = canQueryIndexer("manual", ix.id);
    if (!gate.allowed) {
      if (gate.reason === "pacing" && gate.waitMs) {
        await sleep(gate.waitMs);
      } else if (!interactive) {
        warnings.push(`Indexer "${ix.name}" skipped: ${gate.reason}`);
        continue;
      }
      // Interactive: skip only backoff, allow daily cap bypass
      if (gate.reason === "backoff") {
        warnings.push(`Indexer "${ix.name}" in backoff, skipping`);
        continue;
      }
    }

    try {
      const results = await prowlarrHttp.searchNewznab(
        {
          baseUrl: ix.baseUrl,
          apiPath: ix.apiPath ?? "/api",
          apiKey: ix.apiKey,
        },
        query,
        categories,
        bookParams,
        { indexerType: "manual", indexerId: ix.id },
      );
      allReleases.push(
        ...results.map((r) =>
          enrichRelease({
            ...r,
            indexer: r.indexer || ix.name,
            allstarrIndexerId: ix.id,
            indexerSource: "manual" as const,
          }),
        ),
      );
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : "Unknown indexer error",
      );
    }
  }

  return { releases: allReleases, warnings };
}

export const searchIndexersFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => searchIndexersSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    // Get all enabled manual indexers with automatic search on, sorted by priority
    const enabledManual = db
      .select()
      .from(indexers)
      .where(eq(indexers.enableAutomaticSearch, true))
      .orderBy(asc(indexers.priority))
      .all();

    // Get synced indexers with search enabled — each maps to an individual
    // Prowlarr Newznab/Torznab proxy feed (e.g. http://prowlarr:9696/1/api).
    const enabledSynced = db
      .select()
      .from(syncedIndexers)
      .where(eq(syncedIndexers.enableSearch, true))
      .orderBy(asc(syncedIndexers.priority))
      .all();

    if (enabledManual.length === 0 && enabledSynced.length === 0) {
      return { releases: [] as IndexerRelease[], warnings: [] };
    }

    let query = data.query;
    let bookParams: BookSearchParams | undefined;
    let bookInfo: BookInfo | null = null;

    // If bookId provided, look up book info for structured search params
    if (data.bookId) {
      const book = db
        .select({
          title: books.title,
          authorName: booksAuthors.authorName,
        })
        .from(books)
        .leftJoin(
          booksAuthors,
          and(
            eq(booksAuthors.bookId, books.id),
            eq(booksAuthors.isPrimary, true),
          ),
        )
        .where(eq(books.id, data.bookId))
        .get();

      if (book) {
        bookInfo = { title: book.title, authorName: book.authorName ?? null };
        // Build default query if none provided
        if (!data.query) {
          query = `${book.authorName ? `${book.authorName} ` : ""}${book.title}`;
        }
        // Set bookParams for tiered search when we have both author and title
        if (book.authorName) {
          bookParams = { author: book.authorName, title: book.title };
        }
      }
    }

    // Derive categories: explicit caller override > profile-based > default ebook
    let categories: number[];
    if (data.categories) {
      categories = data.categories;
    } else if (data.bookId) {
      const profiles = getProfilesForBook(data.bookId);
      categories = profiles ? getCategoriesForProfiles(profiles) : [];
    } else {
      categories = [];
    }

    // Search each indexer sequentially with rate limiter gating
    const { releases: allReleases, warnings } = await searchAllIndexers(
      enabledSynced,
      enabledManual,
      query,
      categories,
      bookParams,
      true, // interactive — bypass daily caps for user-initiated searches
    );

    // If every indexer failed, throw so the client sees an error
    const totalIndexers =
      enabledSynced.filter((s) => s.apiKey).length + enabledManual.length;
    if (totalIndexers > 0 && allReleases.length === 0 && warnings.length > 0) {
      throw new Error(`All indexers failed: ${warnings.join("; ")}`);
    }

    const releases = dedupeAndScoreReleases(
      allReleases,
      data.bookId ?? null,
      bookInfo,
    );

    return { releases, warnings };
  });

// ─── Release status ──────────────────────────────────────────────────────────

export const getBookReleaseStatusFn = createServerFn({ method: "GET" })
  .inputValidator((d: { bookId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();

    const grabbedGuids = db
      .select({ data: history.data })
      .from(history)
      .where(
        and(
          eq(history.eventType, "bookGrabbed"),
          eq(history.bookId, data.bookId),
        ),
      )
      .all()
      .map((h) => (h.data as Record<string, unknown>)?.guid as string)
      .filter(Boolean);

    const { items: queueItems } = await fetchQueueItems();
    const queueTitles = queueItems.map((item) => item.name);

    const existingQualityIds = db
      .select({ quality: bookFiles.quality })
      .from(bookFiles)
      .where(eq(bookFiles.bookId, data.bookId))
      .all()
      .map((f) => {
        if (
          f.quality &&
          typeof f.quality === "object" &&
          "quality" in f.quality &&
          f.quality.quality
        ) {
          return f.quality.quality.id;
        }
        return 0;
      })
      .filter((id) => id > 0);

    return {
      grabbedGuids,
      queueTitles,
      existingQualityIds,
    } satisfies ReleaseStatusMap;
  });

// ─── Grab ─────────────────────────────────────────────────────────────────────

/** Resolve the download client to use for a grab, checking explicit, indexer-level, and protocol-based fallbacks. */
function resolveGrabClient(data: {
  downloadClientId?: number | null;
  indexerSource: string;
  indexerId: number;
  protocol: string;
}): {
  client: typeof downloadClients.$inferSelect;
  combinedTag: string | null;
} {
  let client;

  if (data.downloadClientId) {
    client = db
      .select()
      .from(downloadClients)
      .where(eq(downloadClients.id, data.downloadClientId))
      .get();
    if (!client) {
      throw new Error("Download client not found");
    }
  } else {
    const indexerTable =
      data.indexerSource === "synced" ? syncedIndexers : indexers;
    const indexerRow = db
      .select({ downloadClientId: indexerTable.downloadClientId })
      .from(indexerTable)
      .where(eq(indexerTable.id, data.indexerId))
      .get();

    if (indexerRow?.downloadClientId) {
      client = db
        .select()
        .from(downloadClients)
        .where(eq(downloadClients.id, indexerRow.downloadClientId))
        .get();
    }

    if (!client) {
      const matchingClients = db
        .select()
        .from(downloadClients)
        .where(eq(downloadClients.enabled, true))
        .orderBy(asc(downloadClients.priority))
        .all()
        .filter((c) => c.protocol === data.protocol);

      if (matchingClients.length === 0) {
        throw new Error(
          `No enabled ${data.protocol} download clients configured. Please add one in Settings > Download Clients.`,
        );
      }
      client = matchingClients[0];
    }
  }

  const indexerTagTable =
    data.indexerSource === "synced" ? syncedIndexers : indexers;
  const indexerTagRow = db
    .select({ tag: indexerTagTable.tag })
    .from(indexerTagTable)
    .where(eq(indexerTagTable.id, data.indexerId))
    .get();
  const combinedTag =
    [client.tag, indexerTagRow?.tag].filter(Boolean).join(",") || null;

  return { client, combinedTag };
}

export const grabReleaseFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => grabReleaseSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const grabGate = canGrabIndexer(
      data.indexerSource as "manual" | "synced",
      data.indexerId,
    );
    if (!grabGate.allowed) {
      throw new Error("Indexer daily grab limit reached");
    }

    const { client, combinedTag } = resolveGrabClient(data);

    const provider = getProvider(client.implementation);
    const config: ConnectionConfig = {
      implementation:
        client.implementation as ConnectionConfig["implementation"],
      host: client.host,
      port: client.port,
      useSsl: client.useSsl,
      urlBase: client.urlBase,
      username: client.username,
      password: client.password,
      apiKey: client.apiKey,
      category: client.category,
      tag: client.tag,
      settings: client.settings as Record<string, unknown> | null,
    };

    const downloadId = await provider.addDownload(config, {
      url: data.downloadUrl,
      torrentData: null,
      nzbData: null,
      category: null,
      tag: combinedTag,
      savePath: null,
    });

    // Look up authorId from booksAuthors if bookId is available
    let authorId: number | null = null;
    let profileId: number | null = null;
    if (data.bookId) {
      const ba = db
        .select({ authorId: booksAuthors.authorId })
        .from(booksAuthors)
        .where(
          and(
            eq(booksAuthors.bookId, data.bookId),
            eq(booksAuthors.isPrimary, true),
          ),
        )
        .get();
      authorId = ba?.authorId ?? null;

      if (authorId) {
        const adp = db
          .select({
            downloadProfileId: authorDownloadProfiles.downloadProfileId,
          })
          .from(authorDownloadProfiles)
          .where(eq(authorDownloadProfiles.authorId, authorId))
          .get();
        profileId = adp?.downloadProfileId ?? null;
      }
    }

    // Track the download
    if (downloadId) {
      db.insert(trackedDownloads)
        .values({
          downloadClientId: client.id,
          downloadId,
          bookId: data.bookId ?? null,
          authorId,
          downloadProfileId: profileId,
          releaseTitle: data.title,
          protocol: data.protocol,
          indexerId: data.indexerId,
          guid: data.guid,
          state: "queued",
        })
        .run();
    }

    // Record history event
    db.insert(history)
      .values({
        eventType: "bookGrabbed",
        bookId: data.bookId ?? null,
        data: {
          title: data.title,
          guid: data.guid,
          indexerId: data.indexerId,
          downloadClientId: client.id,
          downloadClientName: client.name,
          protocol: data.protocol,
          size: data.size,
        },
      })
      .run();

    return {
      success: true,
      downloadClientName: client.name,
    };
  });
