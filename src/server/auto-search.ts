// oxlint-disable no-console -- Auto-search logs are intentional server-side diagnostics
import { db } from "src/db";
import {
  books,
  booksAuthors,
  editions,
  editionDownloadProfiles,
  bookFiles,
  authors,
  indexers,
  syncedIndexers,
  downloadClients,
  history,
  blocklist,
  downloadProfiles,
  trackedDownloads,
} from "src/db/schema";
import { eq, and, sql, asc, inArray } from "drizzle-orm";
import { getCategoriesForProfiles, dedupeAndScoreReleases } from "./indexers";
import type { ProfileInfo } from "./indexers";
import { searchNewznab } from "./indexers/http";
import {
  enrichRelease,
  getProfileWeight,
  isFormatInProfile,
} from "./indexers/format-parser";
import getProvider from "./download-clients/registry";
import type { ConnectionConfig } from "./download-clients/types";
import type { IndexerRelease } from "./indexers/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AutoSearchOptions = {
  delayBetweenBooks?: number;
  maxBooks?: number;
  bookIds?: number[];
};

type SearchDetail = {
  bookId: number;
  bookTitle: string;
  authorName: string | null;
  searched: boolean;
  grabbed: boolean;
  releaseTitle?: string;
  error?: string;
};

export type AutoSearchResult = {
  searched: number;
  grabbed: number;
  errors: number;
  details: SearchDetail[];
};

type EditionProfileTarget = {
  editionId: number;
  profile: ProfileInfo;
};

type WantedBook = {
  id: number;
  title: string;
  authorId: number | null;
  authorName: string | null;
  editionTargets: EditionProfileTarget[];
  profiles: ProfileInfo[];
  bestWeightByProfile: Map<number, number>;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ─── Edition-level profile resolution ───────────────────────────────────────

/** Get edition-level download profile targets for a book */
function getEditionProfilesForBook(bookId: number): EditionProfileTarget[] {
  const rows = db
    .select({
      editionId: editionDownloadProfiles.editionId,
      profileId: editionDownloadProfiles.downloadProfileId,
    })
    .from(editionDownloadProfiles)
    .innerJoin(editions, eq(editions.id, editionDownloadProfiles.editionId))
    .where(eq(editions.bookId, bookId))
    .all();

  if (rows.length === 0) {
    return [];
  }

  const profileIds = [...new Set(rows.map((r) => r.profileId))];
  const profiles = db
    .select()
    .from(downloadProfiles)
    .where(inArray(downloadProfiles.id, profileIds))
    .all();

  const profileMap = new Map(
    profiles.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        items: p.items,
        cutoff: p.cutoff,
        upgradeAllowed: p.upgradeAllowed,
        categories: p.categories,
      } satisfies ProfileInfo,
    ]),
  );

  return rows
    .filter((r) => profileMap.has(r.profileId))
    .map((r) => ({
      editionId: r.editionId,
      profile: profileMap.get(r.profileId)!,
    }));
}

// ─── Wanted books detection ─────────────────────────────────────────────────

/** Find books that need searching: missing files or upgrade-eligible */
export function getWantedBooks(): WantedBook[] {
  // Get all books that have at least one edition with a download profile assigned
  const monitoredBooks = db
    .select({
      id: books.id,
      title: books.title,
      authorId: booksAuthors.authorId,
      authorName: booksAuthors.authorName,
      authorMonitored: authors.monitored,
    })
    .from(books)
    .leftJoin(
      booksAuthors,
      and(eq(booksAuthors.bookId, books.id), eq(booksAuthors.isPrimary, true)),
    )
    .leftJoin(authors, eq(authors.id, booksAuthors.authorId))
    .where(
      sql`EXISTS (
        SELECT 1 FROM ${editionDownloadProfiles}
        INNER JOIN ${editions} ON ${editions.id} = ${editionDownloadProfiles.editionId}
        WHERE ${editions.bookId} = ${books.id}
      )`,
    )
    .all();

  const wanted: WantedBook[] = [];

  for (const book of monitoredBooks) {
    // Skip books whose primary author is not monitored
    if (book.authorMonitored === false) {
      continue;
    }

    const editionTargets = getEditionProfilesForBook(book.id);
    if (editionTargets.length === 0) {
      continue;
    }

    // Derive unique profiles from edition targets
    const profileMap = new Map<number, ProfileInfo>();
    for (const target of editionTargets) {
      profileMap.set(target.profile.id, target.profile);
    }

    // Exclude profiles that already have an active tracked download
    const activeDownloads = db
      .select({ downloadProfileId: trackedDownloads.downloadProfileId })
      .from(trackedDownloads)
      .where(
        and(
          eq(trackedDownloads.bookId, book.id),
          inArray(trackedDownloads.state, [
            "queued",
            "downloading",
            "completed",
            "importPending",
          ]),
        ),
      )
      .all();

    const activeProfileIds = new Set(
      activeDownloads
        .map((d) => d.downloadProfileId)
        .filter((id): id is number => id !== null),
    );

    for (const id of activeProfileIds) {
      profileMap.delete(id);
    }

    const profiles = [...profileMap.values()];
    if (profiles.length === 0) {
      continue;
    }

    // Check existing files for this book
    const existingFiles = db
      .select({ quality: bookFiles.quality })
      .from(bookFiles)
      .where(eq(bookFiles.bookId, book.id))
      .all();

    // Compute per-profile best existing weight
    const bestWeightByProfile = new Map<number, number>();
    for (const profile of profiles) {
      let best = 0;
      for (const file of existingFiles) {
        if (file.quality) {
          const qualityId =
            typeof file.quality === "object" &&
            "quality" in file.quality &&
            file.quality.quality
              ? file.quality.quality.id
              : 0;
          const weight = getProfileWeight(qualityId, profile.items);
          if (weight > best) {
            best = weight;
          }
        }
      }
      bestWeightByProfile.set(profile.id, best);
    }

    if (existingFiles.length === 0) {
      // No files at all — wanted
      wanted.push({
        id: book.id,
        title: book.title,
        authorId: book.authorId,
        authorName: book.authorName,
        editionTargets,
        profiles,
        bestWeightByProfile,
      });
      continue;
    }

    // Check if any profile allows upgrades and the best file is below cutoff
    const upgradeNeeded = profiles.some((profile) => {
      if (!profile.upgradeAllowed) {
        return false;
      }
      const cutoffWeight = getProfileWeight(profile.cutoff, profile.items);
      const bestWeight = bestWeightByProfile.get(profile.id) ?? 0;
      return bestWeight < cutoffWeight;
    });

    if (upgradeNeeded) {
      wanted.push({
        id: book.id,
        title: book.title,
        authorId: book.authorId,
        authorName: book.authorName,
        editionTargets,
        profiles,
        bestWeightByProfile,
      });
    }
  }

  return wanted;
}

// ─── Per-book search + grab ─────────────────────────────────────────────────

type EnabledIndexers = {
  manual: Array<typeof indexers.$inferSelect>;
  synced: Array<typeof syncedIndexers.$inferSelect>;
};

async function searchAndGrabForBook(
  book: WantedBook,
  ixs: EnabledIndexers,
): Promise<SearchDetail> {
  const detail: SearchDetail = {
    bookId: book.id,
    bookTitle: book.title,
    authorName: book.authorName,
    searched: false,
    grabbed: false,
  };

  // Build search query
  const query = book.authorName
    ? `${book.authorName} ${book.title}`
    : book.title;
  const bookParams = book.authorName
    ? { author: book.authorName, title: book.title }
    : undefined;

  // Derive categories from profiles
  const categories = getCategoriesForProfiles(book.profiles);

  // Search indexers sequentially to avoid rate-limiting
  const DELAY_BETWEEN_INDEXERS = 1000;
  const allReleases: IndexerRelease[] = [];

  const syncedWithKey = ixs.synced.filter((s) => s.apiKey);
  for (let i = 0; i < syncedWithKey.length; i += 1) {
    const synced = syncedWithKey[i];
    try {
      const results = await searchNewznab(
        {
          baseUrl: synced.baseUrl,
          apiPath: synced.apiPath ?? "/api",
          apiKey: synced.apiKey!,
        },
        query,
        categories,
        bookParams,
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
      console.error(
        `[rss-sync] Indexer "${synced.name}" failed:`,
        error instanceof Error ? error.message : error,
      );
    }
    if (i < syncedWithKey.length - 1 || ixs.manual.length > 0) {
      await sleep(DELAY_BETWEEN_INDEXERS);
    }
  }

  for (let i = 0; i < ixs.manual.length; i += 1) {
    const ix = ixs.manual[i];
    try {
      const results = await searchNewznab(
        {
          baseUrl: ix.baseUrl,
          apiPath: ix.apiPath ?? "/api",
          apiKey: ix.apiKey,
        },
        query,
        categories,
        bookParams,
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
      console.error(
        `[rss-sync] Manual indexer failed:`,
        error instanceof Error ? error.message : error,
      );
    }
    if (i < ixs.manual.length - 1) {
      await sleep(DELAY_BETWEEN_INDEXERS);
    }
  }

  detail.searched = true;

  if (allReleases.length === 0) {
    return detail;
  }

  // Score, deduplicate, and grab per profile
  const bookInfo = { title: book.title, authorName: book.authorName };
  const scored = dedupeAndScoreReleases(allReleases, book.id, bookInfo);
  const grabbedTitles = await grabPerProfile(scored, book);

  if (grabbedTitles.length > 0) {
    detail.grabbed = true;
    detail.releaseTitle = grabbedTitles.join(", ");
  }

  return detail;
}

/** Try to grab the best release for each unique profile on the book */
async function grabPerProfile(
  scored: IndexerRelease[],
  book: WantedBook,
): Promise<string[]> {
  const blocklistedTitles = new Set(
    db
      .select({ sourceTitle: blocklist.sourceTitle })
      .from(blocklist)
      .where(eq(blocklist.bookId, book.id))
      .all()
      .map((b) => b.sourceTitle),
  );

  const grabbedGuids = new Set(
    db
      .select({ data: history.data })
      .from(history)
      .where(
        and(eq(history.eventType, "bookGrabbed"), eq(history.bookId, book.id)),
      )
      .all()
      .map((h) => (h.data as Record<string, unknown>)?.guid as string)
      .filter(Boolean),
  );

  const satisfiedProfiles = new Set<number>();
  const grabbedTitles: string[] = [];

  for (const profile of book.profiles) {
    if (satisfiedProfiles.has(profile.id)) {
      continue;
    }

    const bestExistingWeight = book.bestWeightByProfile.get(profile.id) ?? 0;
    const bestRelease = findBestReleaseForProfile(
      scored,
      profile,
      bestExistingWeight,
      blocklistedTitles,
      grabbedGuids,
    );

    if (!bestRelease) {
      continue;
    }

    const grabbed = await grabRelease(bestRelease, book, profile.id);
    if (grabbed) {
      satisfiedProfiles.add(profile.id);
      grabbedTitles.push(bestRelease.title);
      grabbedGuids.add(bestRelease.guid);
      console.log(
        `[rss-sync] Grabbed "${bestRelease.title}" for "${book.title}" (profile: ${profile.name})`,
      );
    }
  }

  return grabbedTitles;
}

// ─── Auto-search orchestrator ───────────────────────────────────────────────

export async function runAutoSearch(
  options: AutoSearchOptions = {},
): Promise<AutoSearchResult> {
  const { delayBetweenBooks = 2000, maxBooks, bookIds } = options;

  const result: AutoSearchResult = {
    searched: 0,
    grabbed: 0,
    errors: 0,
    details: [],
  };

  // Get wanted books
  let wantedBooks = getWantedBooks();
  if (bookIds) {
    const idSet = new Set(bookIds);
    wantedBooks = wantedBooks.filter((b) => idSet.has(b.id));
  }
  if (maxBooks) {
    wantedBooks = wantedBooks.slice(0, maxBooks);
  }

  if (wantedBooks.length === 0) {
    return result;
  }

  // Get RSS-enabled indexers
  const ixs: EnabledIndexers = {
    manual: db
      .select()
      .from(indexers)
      .where(eq(indexers.enableRss, true))
      .orderBy(asc(indexers.priority))
      .all(),
    synced: db
      .select()
      .from(syncedIndexers)
      .where(eq(syncedIndexers.enableRss, true))
      .orderBy(asc(syncedIndexers.priority))
      .all(),
  };

  if (ixs.manual.length === 0 && ixs.synced.length === 0) {
    console.log("[rss-sync] No RSS-enabled indexers configured");
    return result;
  }

  // Process each wanted book
  for (let i = 0; i < wantedBooks.length; i += 1) {
    const book = wantedBooks[i];

    try {
      const detail = await searchAndGrabForBook(book, ixs);
      if (detail.searched) {
        result.searched += 1;
      }
      if (detail.grabbed) {
        result.grabbed += 1;
      }
      result.details.push(detail);
    } catch (error) {
      result.errors += 1;
      result.details.push({
        bookId: book.id,
        bookTitle: book.title,
        authorName: book.authorName,
        searched: false,
        grabbed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.error(`[rss-sync] Error searching for "${book.title}":`, error);
    }

    // Rate-limit between books
    if (i < wantedBooks.length - 1) {
      await sleep(delayBetweenBooks);
    }
  }

  return result;
}

// ─── Release filtering ──────────────────────────────────────────────────────

function findBestReleaseForProfile(
  releases: IndexerRelease[],
  profile: ProfileInfo,
  bestExistingWeight: number,
  blocklistedTitles: Set<string>,
  grabbedGuids: Set<string>,
): IndexerRelease | null {
  // If files exist but upgrades aren't allowed, skip
  if (bestExistingWeight > 0 && !profile.upgradeAllowed) {
    return null;
  }

  // If at or above cutoff, skip
  if (bestExistingWeight > 0) {
    const cutoffWeight = getProfileWeight(profile.cutoff, profile.items);
    if (bestExistingWeight >= cutoffWeight) {
      return null;
    }
  }

  for (const release of releases) {
    // Only consider formats allowed by this profile
    if (!isFormatInProfile(release.quality.id, profile.items)) {
      continue;
    }

    if (release.rejections.length > 0) {
      continue;
    }
    if (blocklistedTitles.has(release.title)) {
      continue;
    }
    if (grabbedGuids.has(release.guid)) {
      continue;
    }

    // For upgrades, ensure the new quality is actually better
    if (
      bestExistingWeight > 0 &&
      release.quality.weight <= bestExistingWeight
    ) {
      continue;
    }

    return release;
  }

  return null;
}

// ─── Grab helper ────────────────────────────────────────────────────────────

async function grabRelease(
  release: IndexerRelease,
  book: WantedBook,
  profileId: number,
): Promise<boolean> {
  let client;

  // Check indexer-level download client override
  const indexerTable =
    release.indexerSource === "synced" ? syncedIndexers : indexers;
  const indexerRow = db
    .select({ downloadClientId: indexerTable.downloadClientId })
    .from(indexerTable)
    .where(eq(indexerTable.id, release.allstarrIndexerId))
    .get();

  if (indexerRow?.downloadClientId) {
    client = db
      .select()
      .from(downloadClients)
      .where(eq(downloadClients.id, indexerRow.downloadClientId))
      .get();
  }

  if (!client) {
    // Find matching download client by protocol + priority
    const matchingClients = db
      .select()
      .from(downloadClients)
      .where(eq(downloadClients.enabled, true))
      .orderBy(asc(downloadClients.priority))
      .all()
      .filter((c) => c.protocol === release.protocol);

    if (matchingClients.length === 0) {
      console.warn(
        `[rss-sync] No enabled ${release.protocol} download client for "${release.title}"`,
      );
      return false;
    }
    client = matchingClients[0];
  }
  // Look up indexer tag
  const indexerTagRow = db
    .select({ tag: indexerTable.tag })
    .from(indexerTable)
    .where(eq(indexerTable.id, release.allstarrIndexerId))
    .get();
  const combinedTag =
    [client.tag, indexerTagRow?.tag].filter(Boolean).join(",") || null;

  const provider = getProvider(client.implementation);
  const config: ConnectionConfig = {
    implementation: client.implementation as ConnectionConfig["implementation"],
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
    url: release.downloadUrl,
    torrentData: null,
    nzbData: null,
    category: null,
    tag: combinedTag,
    savePath: null,
  });

  // Track the download
  if (downloadId) {
    db.insert(trackedDownloads)
      .values({
        downloadClientId: client.id,
        downloadId,
        bookId: book.id,
        authorId: book.authorId ?? null,
        downloadProfileId: profileId,
        releaseTitle: release.title,
        protocol: release.protocol,
        indexerId: release.allstarrIndexerId,
        guid: release.guid,
        state: "queued",
      })
      .run();
  }

  // Record history event
  db.insert(history)
    .values({
      eventType: "bookGrabbed",
      bookId: book.id,
      authorId: book.authorId,
      data: {
        title: release.title,
        guid: release.guid,
        indexerId: release.allstarrIndexerId,
        downloadClientId: client.id,
        downloadClientName: client.name,
        protocol: release.protocol,
        size: release.size,
        quality: release.quality.name,
        source: "rssSync",
      },
    })
    .run();

  return true;
}
