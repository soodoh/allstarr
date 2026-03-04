// oxlint-disable no-console -- Auto-search logs are intentional server-side diagnostics
import { db } from "src/db";
import {
  books,
  booksAuthors,
  editions,
  editionQualityProfiles,
  bookFiles,
  authors,
  indexers,
  syncedIndexers,
  downloadClients,
  history,
  blocklist,
} from "src/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  getProfilesForBook,
  getCategoriesForProfiles,
  dedupeAndScoreReleases,
} from "./indexers";
import type { ProfileInfo } from "./indexers";
import { searchNewznab, searchProwlarr } from "./indexers/http";
import { enrichRelease, getProfileWeight } from "./indexers/quality-parser";
import getProvider from "./download-clients/registry";
import type { ConnectionConfig } from "./download-clients/types";
import type { IndexerSettings } from "src/db/schema/indexers";
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

type WantedBook = {
  id: number;
  title: string;
  authorId: number | null;
  authorName: string | null;
  bestExistingWeight: number;
  profiles: ProfileInfo[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ─── Wanted books detection ─────────────────────────────────────────────────

/** Find books that need searching: missing files or upgrade-eligible */
export function getWantedBooks(): WantedBook[] {
  // Get all books that have at least one edition with a quality profile assigned
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
        SELECT 1 FROM ${editionQualityProfiles}
        INNER JOIN ${editions} ON ${editions.id} = ${editionQualityProfiles.editionId}
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

    const profiles = getProfilesForBook(book.id);
    if (!profiles || profiles.length === 0) {
      continue;
    }

    // Check existing files for this book
    const existingFiles = db
      .select({ quality: bookFiles.quality })
      .from(bookFiles)
      .where(eq(bookFiles.bookId, book.id))
      .all();

    if (existingFiles.length === 0) {
      // Missing — no files at all
      wanted.push({
        id: book.id,
        title: book.title,
        authorId: book.authorId,
        authorName: book.authorName,
        bestExistingWeight: 0,
        profiles,
      });
      continue;
    }

    // Check if any profile allows upgrades and we're below cutoff
    let bestExistingWeight = 0;
    for (const file of existingFiles) {
      if (file.quality) {
        const qualityId =
          typeof file.quality === "object" &&
          "quality" in file.quality &&
          file.quality.quality
            ? file.quality.quality.id
            : 0;
        for (const profile of profiles) {
          const weight = getProfileWeight(qualityId, profile.items);
          if (weight > bestExistingWeight) {
            bestExistingWeight = weight;
          }
        }
      }
    }

    // Check if any profile allows upgrades and the best file is below cutoff
    const upgradeNeeded = profiles.some((profile) => {
      if (!profile.upgradeAllowed) {
        return false;
      }
      const cutoffWeight = getProfileWeight(profile.cutoff, profile.items);
      return bestExistingWeight < cutoffWeight;
    });

    if (upgradeNeeded) {
      wanted.push({
        id: book.id,
        title: book.title,
        authorId: book.authorId,
        authorName: book.authorName,
        bestExistingWeight,
        profiles,
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
      const results = await searchProwlarr(
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
      allReleases.push(
        ...results.map((r) =>
          enrichRelease({ ...r, allstarrIndexerId: ix.id }),
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

  // Score and deduplicate
  const bookInfo = { title: book.title, authorName: book.authorName };
  const scored = dedupeAndScoreReleases(allReleases, book.id, bookInfo);

  // Find the best acceptable release
  const bestRelease = findBestRelease(scored, book);
  if (!bestRelease) {
    return detail;
  }

  // Auto-grab the best release
  const grabbed = await grabRelease(bestRelease, book);
  if (grabbed) {
    detail.grabbed = true;
    detail.releaseTitle = bestRelease.title;
    console.log(
      `[rss-sync] Grabbed "${bestRelease.title}" for "${book.title}"`,
    );
  }

  return detail;
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
      .where(and(eq(indexers.enabled, true), eq(indexers.enableRss, true)))
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

function findBestRelease(
  releases: IndexerRelease[],
  book: WantedBook,
): IndexerRelease | null {
  // Get blocklisted source titles for this book
  const blocklistedTitles = new Set(
    db
      .select({ sourceTitle: blocklist.sourceTitle })
      .from(blocklist)
      .where(eq(blocklist.bookId, book.id))
      .all()
      .map((b) => b.sourceTitle),
  );

  // Get previously grabbed GUIDs for this book
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

  for (const release of releases) {
    // Skip releases with rejections
    if (release.rejections.length > 0) {
      continue;
    }

    // Skip blocklisted releases
    if (blocklistedTitles.has(release.title)) {
      continue;
    }

    // Skip already-grabbed releases
    if (grabbedGuids.has(release.guid)) {
      continue;
    }

    // For upgrades, ensure the new quality is actually better
    if (
      book.bestExistingWeight > 0 &&
      release.quality.weight <= book.bestExistingWeight
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
): Promise<boolean> {
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

  const client = matchingClients[0];
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
    settings: client.settings as IndexerSettings | null,
  };

  await provider.addDownload(config, {
    url: release.downloadUrl,
    torrentData: null,
    nzbData: null,
    category: null,
    savePath: null,
  });

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
