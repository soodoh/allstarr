import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  indexers,
  syncedIndexers,
  downloadClients,
  history,
  books,
  booksAuthors,
  authorQualityProfiles,
  qualityProfiles,
} from "src/db/schema";
import type { IndexerSettings } from "src/db/schema/indexers";
import { eq, asc, and, inArray } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  createIndexerSchema,
  updateIndexerSchema,
  testIndexerSchema,
  searchIndexersSchema,
  grabReleaseSchema,
} from "src/lib/validators";
import * as prowlarrHttp from "./indexers/http";
import {
  enrichRelease,
  getProfileWeight,
  getDefSizeLimits,
} from "./indexers/quality-parser";
import getProvider from "./download-clients/registry";
import * as fuzz from "fuzzball";
import type {
  IndexerRelease,
  ReleaseRejection,
  FormatScoreDetail,
} from "./indexers/types";
import type { BookSearchParams } from "./indexers/http";
import type { ConnectionConfig } from "./download-clients/types";

type ProfileItem = { quality: { id: number }; allowed: boolean };

type ProfileInfo = {
  id: number;
  name: string;
  items: ProfileItem[];
  cutoff: number;
  upgradeAllowed: boolean;
};

/** Look up the quality profiles for a book's primary author */
function getProfilesForBook(bookId: number): ProfileInfo[] | null {
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
    .select({ qualityProfileId: authorQualityProfiles.qualityProfileId })
    .from(authorQualityProfiles)
    .where(eq(authorQualityProfiles.authorId, bookAuthor.authorId))
    .all();

  if (profileLinks.length === 0) {
    return null;
  }

  const profileIds = profileLinks.map((l) => l.qualityProfileId);
  const rows = db
    .select()
    .from(qualityProfiles)
    .where(inArray(qualityProfiles.id, profileIds))
    .all();

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    items: (p.items ?? []) as ProfileItem[],
    cutoff: p.cutoff,
    upgradeAllowed: p.upgradeAllowed,
  }));
}

/** Derive a union of profile items (a quality is allowed if ANY profile allows it) */
function unionProfileItems(profiles: ProfileInfo[]): ProfileItem[] | null {
  const unionMap = new Map<number, ProfileItem>();
  for (const profile of profiles) {
    for (const item of profile.items) {
      const existing = unionMap.get(item.quality.id);
      if (!existing || (!existing.allowed && item.allowed)) {
        unionMap.set(item.quality.id, item);
      }
    }
  }
  return unionMap.size > 0 ? [...unionMap.values()] : null;
}

// ─── Release title cleaning & fuzzy matching ─────────────────────────────────

/**
 * Strip noise from a release title so fuzzy matching compares meaningful text.
 * Removes: file extensions, format tags, release group tags, year/version tags,
 * series info in brackets, and normalizes separators to spaces.
 */
function cleanReleaseTitle(title: string): string {
  let cleaned = title;
  // Remove file extensions
  cleaned = cleaned.replace(/\.(epub|mobi|azw3?|pdf|cbr|cbz|fb2|lit|djvu|txt|rtf|doc|docx)$/i, "");
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

type BookInfo = { title: string; authorName: string | null };

/**
 * Check whether a release title is relevant to the expected book.
 * Returns true if the release passes both author and title checks.
 *
 * Releases that fail are silently filtered out (matching Readarr behavior,
 * where irrelevant results are dropped before the decision engine).
 *
 * Author check uses token_set_ratio (handles "Robert Jordan" vs "Jordan, Robert").
 * Title check uses max(token_set_ratio, partial_ratio) to handle extra tokens
 * and substring matching.
 */
function isRelevantRelease(
  releaseTitle: string,
  bookInfo: BookInfo,
): boolean {
  const cleaned = cleanReleaseTitle(releaseTitle);

  // Author check
  if (bookInfo.authorName) {
    const authorScore = fuzz.token_set_ratio(bookInfo.authorName, cleaned);
    if (authorScore < 75) {
      return false;
    }
  }

  // Title check — skip for very short titles that can't be meaningfully matched
  const trimmedTitle = bookInfo.title.trim();
  if (trimmedTitle.length >= 3) {
    const tokenSetScore = fuzz.token_set_ratio(trimmedTitle, cleaned);
    const partialScore = fuzz.partial_ratio(trimmedTitle, cleaned);
    const titleScore = Math.max(tokenSetScore, partialScore);
    if (titleScore < 80) {
      return false;
    }
  }

  return true;
}

/** Compute rejections and format score for a release against the author's profiles */
function computeReleaseMetrics(
  release: IndexerRelease,
  profiles: ProfileInfo[] | null,
): {
  rejections: ReleaseRejection[];
  formatScore: number;
  formatScoreDetails: FormatScoreDetail[];
} {
  const rejections: ReleaseRejection[] = [];
  const formatScoreDetails: FormatScoreDetail[] = [];

  // Unknown quality — no format definition matched
  if (release.quality.id === 0) {
    rejections.push({
      reason: "unknownQuality",
      message: "Unknown quality — no format matched this release",
    });
    return { rejections, formatScore: 0, formatScoreDetails };
  }

  // Check size limits from quality definition (values are in MB)
  const sizeLimits = getDefSizeLimits(release.quality.id);
  if (sizeLimits) {
    const sizeMB = release.size / (1024 * 1024);
    if (sizeLimits.minSize > 0 && sizeMB < sizeLimits.minSize) {
      rejections.push({
        reason: "belowMinimumSize",
        message: `${release.sizeFormatted} is below minimum ${sizeLimits.minSize} MB for ${release.quality.name}`,
      });
    }
    if (sizeLimits.maxSize > 0 && sizeMB > sizeLimits.maxSize) {
      rejections.push({
        reason: "aboveMaximumSize",
        message: `${release.sizeFormatted} is above maximum ${sizeLimits.maxSize} MB for ${release.quality.name}`,
      });
    }
  }

  // No profiles assigned — return base quality weight
  if (!profiles || profiles.length === 0) {
    return {
      rejections,
      formatScore: release.quality.weight,
      formatScoreDetails,
    };
  }

  // Compute per-profile scores
  let maxScore = 0;
  let allowedInAny = false;

  for (const profile of profiles) {
    const item = profile.items.find(
      (i) => i.quality.id === release.quality.id,
    );
    if (item) {
      const score = getProfileWeight(release.quality.id, profile.items);
      formatScoreDetails.push({
        profileName: profile.name,
        score,
        allowed: item.allowed,
      });
      if (item.allowed) {
        allowedInAny = true;
        maxScore = Math.max(maxScore, score);
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
      message: `${release.quality.name} is not allowed in any quality profile`,
    });
  }

  return { rejections, formatScore: maxScore, formatScoreDetails };
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
        ...data,
        settings: data.settings as IndexerSettings | null,
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
        ...values,
        settings: values.settings as IndexerSettings | null,
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
    return prowlarrHttp.testConnection({
      host: data.host,
      port: data.port,
      useSsl: data.useSsl,
      urlBase: data.urlBase,
      apiKey: data.apiKey,
    });
  });

// ─── List Prowlarr's own indexers ─────────────────────────────────────────────

export const listProwlarrIndexersFn = createServerFn({ method: "POST" })
  .inputValidator((d: { indexerId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const indexer = db
      .select()
      .from(indexers)
      .where(eq(indexers.id, data.indexerId))
      .get();
    if (!indexer) {
      throw new Error("Indexer not found");
    }
    return prowlarrHttp.listProwlarrIndexers({
      host: indexer.host,
      port: indexer.port,
      useSsl: indexer.useSsl,
      urlBase: indexer.urlBase,
      apiKey: indexer.apiKey,
    });
  });

// ─── Enabled-indexer check ────────────────────────────────────────────────────

export const hasEnabledIndexersFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const manualCount = db
      .select()
      .from(indexers)
      .where(eq(indexers.enabled, true))
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

// ─── Post-processing ─────────────────────────────────────────────────────────

/** Deduplicate releases, apply profile scoring/rejections, and sort */
function dedupeAndScoreReleases(
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

  // Filter out irrelevant releases (wrong author/title) — matching Readarr
  // behavior where the parser silently drops non-matching results before
  // they reach the decision engine.
  const relevant = bookInfo
    ? unique.filter((r) => isRelevantRelease(r.title, bookInfo))
    : unique;

  // Look up the author's quality profiles for scoring and rejections
  const profiles = bookId ? getProfilesForBook(bookId) : null;
  const profileItems = profiles ? unionProfileItems(profiles) : null;

  // Override quality weights with profile-derived weights when available
  if (profileItems) {
    for (const release of relevant) {
      release.quality.weight = getProfileWeight(
        release.quality.id,
        profileItems,
      );
    }
  }

  // Compute rejections and format scores
  for (const release of relevant) {
    const metrics = computeReleaseMetrics(release, profiles);
    release.rejections = metrics.rejections;
    release.formatScore = metrics.formatScore;
    release.formatScoreDetails = metrics.formatScoreDetails;
  }

  // Sort by quality weight descending, then by size descending
  relevant.sort((a, b) => {
    const qualityDiff = b.quality.weight - a.quality.weight;
    if (qualityDiff !== 0) {
      return qualityDiff;
    }
    return b.size - a.size;
  });

  return relevant;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export const searchIndexersFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => searchIndexersSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    // Get all enabled manual indexers sorted by priority
    const enabledManual = db
      .select()
      .from(indexers)
      .where(eq(indexers.enabled, true))
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

    const categories = data.categories ?? [7000, 7020];

    // ── Per-indexer Newznab feed searches (like Readarr) ──────────────────
    // Each synced indexer has its own Newznab/Torznab proxy feed URL from
    // Prowlarr.  Querying each feed individually avoids Prowlarr's internal
    // category-capability filter that silently skips indexers whose caps
    // don't advertise the requested categories.
    //
    // When bookParams is available, each indexer fires multiple tiered
    // queries (structured book search, author+title, title-only) and
    // deduplicates internally — matching Readarr's search strategy.
    const feedSearches = enabledSynced
      .filter((s) => s.apiKey)
      .map(async (synced) => {
        const results = await prowlarrHttp.searchNewznab(
          {
            baseUrl: synced.baseUrl,
            apiPath: synced.apiPath ?? "/api",
            apiKey: synced.apiKey!,
          },
          query,
          categories,
          bookParams,
        );
        return results.map((r) =>
          enrichRelease({
            ...r,
            indexer: r.indexer || synced.name,
            allstarrIndexerId: synced.id,
          }),
        );
      });

    // ── Fallback: Prowlarr internal API for manual indexers ───────────────
    // Manual indexers are raw Prowlarr connections without individual feed
    // URLs.  Use the internal search API as a fallback.
    const internalSearches = enabledManual.map(async (ix) => {
      const results = await prowlarrHttp.searchProwlarr(
        {
          host: ix.host,
          port: ix.port,
          useSsl: ix.useSsl,
          urlBase: ix.urlBase,
          apiKey: ix.apiKey,
        },
        query,
        categories,
        bookParams,
      );
      return results.map((r) =>
        enrichRelease({ ...r, allstarrIndexerId: ix.id }),
      );
    });

    // Fan out all searches in parallel
    const settled = await Promise.allSettled([
      ...feedSearches,
      ...internalSearches,
    ]);

    // Flatten results, collect warnings from failures
    const allReleases: IndexerRelease[] = [];
    const warnings: string[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        allReleases.push(...result.value);
      } else {
        warnings.push(
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown indexer error",
        );
      }
    }

    // If every indexer failed, throw so the client sees an error
    if (settled.length > 0 && allReleases.length === 0 && warnings.length > 0) {
      throw new Error(`All indexers failed: ${warnings.join("; ")}`);
    }

    const releases = dedupeAndScoreReleases(
      allReleases,
      data.bookId ?? null,
      bookInfo,
    );
    return { releases, warnings };
  });

// ─── Grab ─────────────────────────────────────────────────────────────────────

export const grabReleaseFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => grabReleaseSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    let client;

    if (data.downloadClientId) {
      // Use explicitly specified download client
      client = db
        .select()
        .from(downloadClients)
        .where(eq(downloadClients.id, data.downloadClientId))
        .get();
      if (!client) {
        throw new Error("Download client not found");
      }
    } else {
      // Auto-select best enabled download client matching the release protocol
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
      settings: client.settings as IndexerSettings | null,
    };

    await provider.addDownload(config, {
      url: data.downloadUrl,
      torrentData: null,
      nzbData: null,
      category: null,
      savePath: null,
    });

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
