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
  movies,
  movieFiles,
  movieDownloadProfiles,
  shows,
  seasons,
  episodes,
  episodeFiles,
  episodeDownloadProfiles,
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

type MovieSearchDetail = {
  movieId: number;
  movieTitle: string;
  searched: boolean;
  grabbed: boolean;
  releaseTitle?: string;
  error?: string;
};

type EpisodeSearchDetail = {
  episodeId: number;
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
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
  movieDetails?: MovieSearchDetail[];
  episodeDetails?: EpisodeSearchDetail[];
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

type WantedMovie = {
  id: number;
  title: string;
  year: number;
  profiles: ProfileInfo[];
  bestWeightByProfile: Map<number, number>;
};

type WantedEpisode = {
  id: number;
  showId: number;
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  absoluteNumber: number | null;
  seriesType: string;
  airDate: string | null;
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
        minCustomFormatScore: p.minCustomFormatScore,
        upgradeUntilCustomFormatScore: p.upgradeUntilCustomFormatScore,
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
    // or if a CF upgrade threshold is set (may need CF-based upgrade even at cutoff)
    const upgradeNeeded = profiles.some((profile) => {
      if (!profile.upgradeAllowed) {
        return false;
      }
      const cutoffWeight = getProfileWeight(profile.cutoff, profile.items);
      const bestWeight = bestWeightByProfile.get(profile.id) ?? 0;
      // Below quality cutoff — definitely needs upgrade
      if (bestWeight < cutoffWeight) {
        return true;
      }
      // At or above cutoff but CF upgrade threshold is set — may still need
      // a CF-based upgrade (we can't compute CF scores for existing files here,
      // so we optimistically include the book and let findBestReleaseForProfile decide)
      if (profile.upgradeUntilCustomFormatScore > 0) {
        return true;
      }
      return false;
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

// ─── Wanted movies detection ────────────────────────────────────────────────

/** Find movies that need searching: missing files or upgrade-eligible */
export function getWantedMovies(movieIds?: number[]): WantedMovie[] {
  // Get all movies that have at least one download profile assigned
  const query = db
    .select({
      id: movies.id,
      title: movies.title,
      year: movies.year,
    })
    .from(movies)
    .where(
      sql`EXISTS (
        SELECT 1 FROM ${movieDownloadProfiles}
        WHERE ${movieDownloadProfiles.movieId} = ${movies.id}
      )`,
    );

  const monitoredMovies = query.all();

  const wanted: WantedMovie[] = [];

  for (const movie of monitoredMovies) {
    if (movieIds && !movieIds.includes(movie.id)) {
      continue;
    }

    // Get profiles for this movie
    const profileRows = db
      .select({
        profileId: movieDownloadProfiles.downloadProfileId,
      })
      .from(movieDownloadProfiles)
      .where(eq(movieDownloadProfiles.movieId, movie.id))
      .all();

    if (profileRows.length === 0) {
      continue;
    }

    const profileIds = [...new Set(profileRows.map((r) => r.profileId))];
    const profileList = db
      .select()
      .from(downloadProfiles)
      .where(inArray(downloadProfiles.id, profileIds))
      .all();

    const profileMap = new Map<number, ProfileInfo>();
    for (const p of profileList) {
      profileMap.set(p.id, {
        id: p.id,
        name: p.name,
        items: p.items,
        cutoff: p.cutoff,
        upgradeAllowed: p.upgradeAllowed,
        categories: p.categories,
        minCustomFormatScore: p.minCustomFormatScore,
        upgradeUntilCustomFormatScore: p.upgradeUntilCustomFormatScore,
      });
    }

    // Exclude profiles that already have an active tracked download
    const activeDownloads = db
      .select({ downloadProfileId: trackedDownloads.downloadProfileId })
      .from(trackedDownloads)
      .where(
        and(
          eq(trackedDownloads.movieId, movie.id),
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

    // Check existing files for this movie
    const existingFiles = db
      .select({ quality: movieFiles.quality })
      .from(movieFiles)
      .where(eq(movieFiles.movieId, movie.id))
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
      wanted.push({
        id: movie.id,
        title: movie.title,
        year: movie.year,
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
      if (bestWeight < cutoffWeight) {
        return true;
      }
      if (profile.upgradeUntilCustomFormatScore > 0) {
        return true;
      }
      return false;
    });

    if (upgradeNeeded) {
      wanted.push({
        id: movie.id,
        title: movie.title,
        year: movie.year,
        profiles,
        bestWeightByProfile,
      });
    }
  }

  return wanted;
}

// ─── Wanted episodes detection ──────────────────────────────────────────────

/** Find episodes that need searching: missing files or upgrade-eligible */
export function getWantedEpisodes(
  showId?: number,
  cutoffUnmet?: boolean,
): WantedEpisode[] {
  // Get all episodes that have at least one download profile assigned
  const baseConditions = sql`EXISTS (
    SELECT 1 FROM ${episodeDownloadProfiles}
    WHERE ${episodeDownloadProfiles.episodeId} = ${episodes.id}
  )`;

  const whereClause = showId
    ? and(baseConditions, eq(episodes.showId, showId))
    : baseConditions;

  const monitoredEpisodes = db
    .select({
      id: episodes.id,
      showId: episodes.showId,
      showTitle: shows.title,
      seasonNumber: seasons.seasonNumber,
      episodeNumber: episodes.episodeNumber,
      absoluteNumber: episodes.absoluteNumber,
      seriesType: shows.seriesType,
      airDate: episodes.airDate,
    })
    .from(episodes)
    .innerJoin(shows, eq(shows.id, episodes.showId))
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(whereClause)
    .all();

  const wanted: WantedEpisode[] = [];

  for (const ep of monitoredEpisodes) {
    // Get profiles for this episode
    const profileRows = db
      .select({
        profileId: episodeDownloadProfiles.downloadProfileId,
      })
      .from(episodeDownloadProfiles)
      .where(eq(episodeDownloadProfiles.episodeId, ep.id))
      .all();

    if (profileRows.length === 0) {
      continue;
    }

    const profileIds = [...new Set(profileRows.map((r) => r.profileId))];
    const profileList = db
      .select()
      .from(downloadProfiles)
      .where(inArray(downloadProfiles.id, profileIds))
      .all();

    const profileMap = new Map<number, ProfileInfo>();
    for (const p of profileList) {
      profileMap.set(p.id, {
        id: p.id,
        name: p.name,
        items: p.items,
        cutoff: p.cutoff,
        upgradeAllowed: p.upgradeAllowed,
        categories: p.categories,
        minCustomFormatScore: p.minCustomFormatScore,
        upgradeUntilCustomFormatScore: p.upgradeUntilCustomFormatScore,
      });
    }

    // Exclude profiles that already have an active tracked download
    const activeDownloads = db
      .select({ downloadProfileId: trackedDownloads.downloadProfileId })
      .from(trackedDownloads)
      .where(
        and(
          eq(trackedDownloads.episodeId, ep.id),
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

    // Check existing files for this episode
    const existingFiles = db
      .select({ quality: episodeFiles.quality })
      .from(episodeFiles)
      .where(eq(episodeFiles.episodeId, ep.id))
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
      wanted.push({
        id: ep.id,
        showId: ep.showId,
        showTitle: ep.showTitle,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        absoluteNumber: ep.absoluteNumber,
        seriesType: ep.seriesType,
        airDate: ep.airDate,
        profiles,
        bestWeightByProfile,
      });
      continue;
    }

    // If cutoffUnmet is false and files exist, skip (only want missing episodes)
    if (!cutoffUnmet) {
      continue;
    }

    // Check if any profile allows upgrades and the best file is below cutoff
    const upgradeNeeded = profiles.some((profile) => {
      if (!profile.upgradeAllowed) {
        return false;
      }
      const cutoffWeight = getProfileWeight(profile.cutoff, profile.items);
      const bestWeight = bestWeightByProfile.get(profile.id) ?? 0;
      if (bestWeight < cutoffWeight) {
        return true;
      }
      if (profile.upgradeUntilCustomFormatScore > 0) {
        return true;
      }
      return false;
    });

    if (upgradeNeeded) {
      wanted.push({
        id: ep.id,
        showId: ep.showId,
        showTitle: ep.showTitle,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        absoluteNumber: ep.absoluteNumber,
        seriesType: ep.seriesType,
        airDate: ep.airDate,
        profiles,
        bestWeightByProfile,
      });
    }
  }

  return wanted;
}

// ─── Search query builders ──────────────────────────────────────────────────

function cleanSearchTerm(term: string): string {
  let cleaned = term;
  // Strip leading "The " (case-insensitive)
  cleaned = cleaned.replace(/^the\s+/i, "");
  // Replace " & " with space
  cleaned = cleaned.replaceAll(" & ", " ");
  // Replace periods with spaces
  cleaned = cleaned.replaceAll(".", " ");
  // Remove diacritical marks (accents)
  cleaned = cleaned.normalize("NFD").replaceAll(/[\u0300-\u036F]/g, "");
  // Collapse whitespace and trim
  cleaned = cleaned.replaceAll(/\s+/g, " ").trim();
  return cleaned;
}

function padNumber(n: number): string {
  return n.toString().padStart(2, "0");
}

function buildMovieSearchQuery(movie: WantedMovie): string {
  const cleanTitle = cleanSearchTerm(movie.title);
  return `"${cleanTitle}" ${movie.year}`;
}

function buildEpisodeSearchQueries(episode: WantedEpisode): string[] {
  const showName = cleanSearchTerm(episode.showTitle);
  switch (episode.seriesType) {
    case "daily": {
      return [`"${showName}" ${episode.airDate ?? ""}`.trim()];
    }
    case "anime": {
      // Always search seasonal format; additionally search absolute format if available
      return [
        `"${showName}" S${padNumber(episode.seasonNumber)}E${padNumber(episode.episodeNumber)}`,
        ...(episode.absoluteNumber === null
          ? []
          : [`"${showName}" ${padNumber(episode.absoluteNumber)}`]),
      ];
    }
    default: {
      // "standard"
      return [
        `"${showName}" S${padNumber(episode.seasonNumber)}E${padNumber(episode.episodeNumber)}`,
      ];
    }
  }
}

// ─── Per-book search + grab ─────────────────────────────────────────────────

type EnabledIndexers = {
  manual: Array<typeof indexers.$inferSelect>;
  synced: Array<typeof syncedIndexers.$inferSelect>;
};

function getEnabledIndexers(): EnabledIndexers {
  return {
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
}

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

// ─── Per-movie search + grab ────────────────────────────────────────────────

async function searchAndGrabForMovie(
  movie: WantedMovie,
  ixs: EnabledIndexers,
): Promise<MovieSearchDetail> {
  const detail: MovieSearchDetail = {
    movieId: movie.id,
    movieTitle: movie.title,
    searched: false,
    grabbed: false,
  };

  const query = buildMovieSearchQuery(movie);
  const categories = getCategoriesForProfiles(movie.profiles);

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
        `[auto-search] Indexer "${synced.name}" failed for movie:`,
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
        `[auto-search] Manual indexer failed for movie:`,
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

  const scored = dedupeAndScoreReleases(allReleases, null, null);
  const grabbedTitles = await grabPerProfileForMovie(scored, movie);

  if (grabbedTitles.length > 0) {
    detail.grabbed = true;
    detail.releaseTitle = grabbedTitles.join(", ");
  }

  return detail;
}

/** Try to grab the best release for each unique profile on the movie */
async function grabPerProfileForMovie(
  scored: IndexerRelease[],
  movie: WantedMovie,
): Promise<string[]> {
  const blocklistedTitles = new Set(
    db
      .select({ sourceTitle: blocklist.sourceTitle })
      .from(blocklist)
      .where(eq(blocklist.movieId, movie.id))
      .all()
      .map((b) => b.sourceTitle),
  );

  const grabbedGuids = new Set(
    db
      .select({ data: history.data })
      .from(history)
      .where(
        and(
          eq(history.eventType, "movieGrabbed"),
          eq(history.movieId, movie.id),
        ),
      )
      .all()
      .map((h) => (h.data as Record<string, unknown>)?.guid as string)
      .filter(Boolean),
  );

  const satisfiedProfiles = new Set<number>();
  const grabbedTitles: string[] = [];

  for (const profile of movie.profiles) {
    if (satisfiedProfiles.has(profile.id)) {
      continue;
    }

    const bestExistingWeight = movie.bestWeightByProfile.get(profile.id) ?? 0;
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

    const grabbed = await grabReleaseForMovie(bestRelease, movie, profile.id);
    if (grabbed) {
      satisfiedProfiles.add(profile.id);
      grabbedTitles.push(bestRelease.title);
      grabbedGuids.add(bestRelease.guid);
      console.log(
        `[auto-search] Grabbed "${bestRelease.title}" for movie "${movie.title}" (profile: ${profile.name})`,
      );
    }
  }

  return grabbedTitles;
}

// ─── Per-episode search + grab ──────────────────────────────────────────────

async function searchAndGrabForEpisode(
  episode: WantedEpisode,
  ixs: EnabledIndexers,
): Promise<EpisodeSearchDetail> {
  const detail: EpisodeSearchDetail = {
    episodeId: episode.id,
    showTitle: episode.showTitle,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    searched: false,
    grabbed: false,
  };

  const queries = buildEpisodeSearchQueries(episode);
  const categories = getCategoriesForProfiles(episode.profiles);

  const DELAY_BETWEEN_INDEXERS = 1000;
  const allReleases: IndexerRelease[] = [];

  for (const query of queries) {
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
          `[auto-search] Indexer "${synced.name}" failed for episode:`,
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
          `[auto-search] Manual indexer failed for episode:`,
          error instanceof Error ? error.message : error,
        );
      }
      if (i < ixs.manual.length - 1) {
        await sleep(DELAY_BETWEEN_INDEXERS);
      }
    }
  }

  detail.searched = true;

  if (allReleases.length === 0) {
    return detail;
  }

  const scored = dedupeAndScoreReleases(allReleases, null, null);
  const grabbedTitles = await grabPerProfileForEpisode(scored, episode);

  if (grabbedTitles.length > 0) {
    detail.grabbed = true;
    detail.releaseTitle = grabbedTitles.join(", ");
  }

  return detail;
}

/** Try to grab the best release for each unique profile on the episode */
async function grabPerProfileForEpisode(
  scored: IndexerRelease[],
  episode: WantedEpisode,
): Promise<string[]> {
  const blocklistedTitles = new Set(
    db
      .select({ sourceTitle: blocklist.sourceTitle })
      .from(blocklist)
      .where(eq(blocklist.showId, episode.showId))
      .all()
      .map((b) => b.sourceTitle),
  );

  const grabbedGuids = new Set(
    db
      .select({ data: history.data })
      .from(history)
      .where(
        and(
          eq(history.eventType, "episodeGrabbed"),
          eq(history.episodeId, episode.id),
        ),
      )
      .all()
      .map((h) => (h.data as Record<string, unknown>)?.guid as string)
      .filter(Boolean),
  );

  const satisfiedProfiles = new Set<number>();
  const grabbedTitles: string[] = [];

  for (const profile of episode.profiles) {
    if (satisfiedProfiles.has(profile.id)) {
      continue;
    }

    const bestExistingWeight = episode.bestWeightByProfile.get(profile.id) ?? 0;
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

    const grabbed = await grabReleaseForEpisode(
      bestRelease,
      episode,
      profile.id,
    );
    if (grabbed) {
      satisfiedProfiles.add(profile.id);
      grabbedTitles.push(bestRelease.title);
      grabbedGuids.add(bestRelease.guid);
      console.log(
        `[auto-search] Grabbed "${bestRelease.title}" for "${episode.showTitle}" S${padNumber(episode.seasonNumber)}E${padNumber(episode.episodeNumber)} (profile: ${profile.name})`,
      );
    }
  }

  return grabbedTitles;
}

// ─── Movie search ───────────────────────────────────────────────────────────

export async function searchForMovie(
  movieId: number,
): Promise<{ searched: number; grabbed: number }> {
  const wantedMovies = getWantedMovies([movieId]);
  if (wantedMovies.length === 0) {
    return { searched: 0, grabbed: 0 };
  }

  const ixs = getEnabledIndexers();
  if (ixs.manual.length === 0 && ixs.synced.length === 0) {
    return { searched: 0, grabbed: 0 };
  }

  let searched = 0;
  let grabbed = 0;

  for (const movie of wantedMovies) {
    const detail = await searchAndGrabForMovie(movie, ixs);
    if (detail.searched) {
      searched += 1;
    }
    if (detail.grabbed) {
      grabbed += 1;
    }
  }

  return { searched, grabbed };
}

// ─── Book/Author search ─────────────────────────────────────────────────────

export async function searchForAuthorBooks(
  authorId: number,
): Promise<{ searched: number; grabbed: number }> {
  // Get all book IDs for this author
  const authorBooks = db
    .select({ bookId: booksAuthors.bookId })
    .from(booksAuthors)
    .where(eq(booksAuthors.authorId, authorId))
    .all();

  if (authorBooks.length === 0) {
    return { searched: 0, grabbed: 0 };
  }

  const bookIdList = authorBooks.map((b) => b.bookId);
  const result = await runAutoSearch({ bookIds: bookIdList });
  return { searched: result.searched, grabbed: result.grabbed };
}

export async function searchForBook(
  bookId: number,
): Promise<{ searched: number; grabbed: number }> {
  const result = await runAutoSearch({ bookIds: [bookId], maxBooks: 1 });
  return { searched: result.searched, grabbed: result.grabbed };
}

// ─── Show search ────────────────────────────────────────────────────────────

export async function searchForShow(
  showId: number,
  cutoffUnmet?: boolean,
): Promise<{ searched: number; grabbed: number }> {
  const wantedEpisodes = getWantedEpisodes(showId, cutoffUnmet);
  if (wantedEpisodes.length === 0) {
    return { searched: 0, grabbed: 0 };
  }

  const ixs = getEnabledIndexers();
  if (ixs.manual.length === 0 && ixs.synced.length === 0) {
    return { searched: 0, grabbed: 0 };
  }

  const DELAY_BETWEEN_ITEMS = 2000;
  let searched = 0;
  let grabbed = 0;

  for (let i = 0; i < wantedEpisodes.length; i += 1) {
    const episode = wantedEpisodes[i];
    try {
      const detail = await searchAndGrabForEpisode(episode, ixs);
      if (detail.searched) {
        searched += 1;
      }
      if (detail.grabbed) {
        grabbed += 1;
      }
    } catch (error) {
      console.error(
        `[auto-search] Error searching for episode "${episode.showTitle}" S${padNumber(episode.seasonNumber)}E${padNumber(episode.episodeNumber)}:`,
        error,
      );
    }
    if (i < wantedEpisodes.length - 1) {
      await sleep(DELAY_BETWEEN_ITEMS);
    }
  }

  return { searched, grabbed };
}

// ─── Auto-search orchestrator ───────────────────────────────────────────────

/** Process wanted books: search, score, and grab per profile */
async function processWantedBooks(
  wantedBooks: WantedBook[],
  ixs: EnabledIndexers,
  result: AutoSearchResult,
  delay: number,
): Promise<void> {
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
      console.error(
        `[auto-search] Error searching for book "${book.title}":`,
        error,
      );
    }

    if (i < wantedBooks.length - 1) {
      await sleep(delay);
    }
  }
}

/** Process wanted movies: search, score, and grab per profile */
async function processWantedMovies(
  wantedMovies: WantedMovie[],
  ixs: EnabledIndexers,
  result: AutoSearchResult,
  delay: number,
): Promise<void> {
  for (let i = 0; i < wantedMovies.length; i += 1) {
    const movie = wantedMovies[i];

    try {
      const detail = await searchAndGrabForMovie(movie, ixs);
      if (detail.searched) {
        result.searched += 1;
      }
      if (detail.grabbed) {
        result.grabbed += 1;
      }
      result.movieDetails!.push(detail);
    } catch (error) {
      result.errors += 1;
      result.movieDetails!.push({
        movieId: movie.id,
        movieTitle: movie.title,
        searched: false,
        grabbed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.error(
        `[auto-search] Error searching for movie "${movie.title}":`,
        error,
      );
    }

    if (i < wantedMovies.length - 1) {
      await sleep(delay);
    }
  }
}

/** Process wanted episodes: search, score, and grab per profile */
async function processWantedEpisodes(
  wantedEpisodes: WantedEpisode[],
  ixs: EnabledIndexers,
  result: AutoSearchResult,
  delay: number,
): Promise<void> {
  for (let i = 0; i < wantedEpisodes.length; i += 1) {
    const episode = wantedEpisodes[i];

    try {
      const detail = await searchAndGrabForEpisode(episode, ixs);
      if (detail.searched) {
        result.searched += 1;
      }
      if (detail.grabbed) {
        result.grabbed += 1;
      }
      result.episodeDetails!.push(detail);
    } catch (error) {
      result.errors += 1;
      result.episodeDetails!.push({
        episodeId: episode.id,
        showTitle: episode.showTitle,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        searched: false,
        grabbed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.error(
        `[auto-search] Error searching for episode "${episode.showTitle}" S${padNumber(episode.seasonNumber)}E${padNumber(episode.episodeNumber)}:`,
        error,
      );
    }

    if (i < wantedEpisodes.length - 1) {
      await sleep(delay);
    }
  }
}

export async function runAutoSearch(
  options: AutoSearchOptions = {},
): Promise<AutoSearchResult> {
  const { delayBetweenBooks = 2000, maxBooks, bookIds } = options;

  const result: AutoSearchResult = {
    searched: 0,
    grabbed: 0,
    errors: 0,
    details: [],
    movieDetails: [],
    episodeDetails: [],
  };

  const ixs = getEnabledIndexers();

  if (ixs.manual.length === 0 && ixs.synced.length === 0) {
    console.log("[auto-search] No RSS-enabled indexers configured");
    return result;
  }

  // ── Books ──────────────────────────────────────────────────────────────
  let wantedBooks = getWantedBooks();
  if (bookIds) {
    const idSet = new Set(bookIds);
    wantedBooks = wantedBooks.filter((b) => idSet.has(b.id));
  }
  if (maxBooks) {
    wantedBooks = wantedBooks.slice(0, maxBooks);
  }

  await processWantedBooks(wantedBooks, ixs, result, delayBetweenBooks);

  // ── Movies & Episodes (full auto-search only, not book-specific) ───────
  if (!bookIds) {
    if (wantedBooks.length > 0) {
      await sleep(delayBetweenBooks);
    }

    const wantedMovies = getWantedMovies();
    await processWantedMovies(wantedMovies, ixs, result, delayBetweenBooks);

    const wantedEpisodes = getWantedEpisodes();
    if (wantedMovies.length > 0 && wantedEpisodes.length > 0) {
      await sleep(delayBetweenBooks);
    }

    await processWantedEpisodes(wantedEpisodes, ixs, result, delayBetweenBooks);
  }

  return result;
}

// ─── Release filtering ──────────────────────────────────────────────────────

/** Check if the profile has reached its upgrade ceiling (quality cutoff + CF threshold) */
function isUpgradeCeiling(
  profile: ProfileInfo,
  bestExistingWeight: number,
  bestExistingCFScore: number,
): boolean {
  const cutoffWeight = getProfileWeight(profile.cutoff, profile.items);
  const atCutoffTier = bestExistingWeight >= cutoffWeight;
  if (!atCutoffTier) {
    return false;
  }
  // No CF threshold set — quality cutoff alone is the ceiling
  if (profile.upgradeUntilCustomFormatScore === 0) {
    return true;
  }
  // Both quality cutoff and CF threshold must be met
  return bestExistingCFScore >= profile.upgradeUntilCustomFormatScore;
}

/** Check if a release is an acceptable upgrade over existing files */
function isUpgradeCandidate(
  release: IndexerRelease,
  bestExistingWeight: number,
  bestExistingCFScore: number,
): boolean {
  if (release.quality.weight > bestExistingWeight) {
    return true;
  }
  // Same tier — only upgrade if CF score is better
  return (
    release.quality.weight === bestExistingWeight &&
    release.cfScore > bestExistingCFScore
  );
}

/** Compare two candidates — return true if release is better than current best */
function isBetterCandidate(
  release: IndexerRelease,
  current: IndexerRelease,
  profileItems: number[][],
): boolean {
  const currentWeight = getProfileWeight(current.quality.id, profileItems);
  const releaseWeight = getProfileWeight(release.quality.id, profileItems);
  if (releaseWeight > currentWeight) {
    return true;
  }
  return releaseWeight === currentWeight && release.cfScore > current.cfScore;
}

function findBestReleaseForProfile(
  releases: IndexerRelease[],
  profile: ProfileInfo,
  bestExistingWeight: number,
  blocklistedTitles: Set<string>,
  grabbedGuids: Set<string>,
  bestExistingCFScore = 0,
): IndexerRelease | null {
  const existingCF = bestExistingCFScore;

  // If files exist but upgrades aren't allowed, skip
  if (bestExistingWeight > 0 && !profile.upgradeAllowed) {
    return null;
  }

  // If at or above upgrade ceiling, skip
  if (
    bestExistingWeight > 0 &&
    isUpgradeCeiling(profile, bestExistingWeight, existingCF)
  ) {
    return null;
  }

  let bestCandidate: IndexerRelease | null = null;

  for (const release of releases) {
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
    if (release.cfScore < profile.minCustomFormatScore) {
      continue;
    }

    // For upgrades, ensure the release is actually better
    if (
      bestExistingWeight > 0 &&
      !isUpgradeCandidate(release, bestExistingWeight, existingCF)
    ) {
      continue;
    }

    if (
      !bestCandidate ||
      isBetterCandidate(release, bestCandidate, profile.items)
    ) {
      bestCandidate = release;
    }
  }

  return bestCandidate;
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

// ─── Grab helpers for movies and episodes ───────────────────────────────────

/** Resolve a download client from an indexer release */
function resolveDownloadClient(release: IndexerRelease) {
  let client;

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
    const matchingClients = db
      .select()
      .from(downloadClients)
      .where(eq(downloadClients.enabled, true))
      .orderBy(asc(downloadClients.priority))
      .all()
      .filter((c) => c.protocol === release.protocol);

    if (matchingClients.length === 0) {
      return null;
    }
    client = matchingClients[0];
  }

  const indexerTagRow = db
    .select({ tag: indexerTable.tag })
    .from(indexerTable)
    .where(eq(indexerTable.id, release.allstarrIndexerId))
    .get();
  const combinedTag =
    [client.tag, indexerTagRow?.tag].filter(Boolean).join(",") || null;

  return { client, combinedTag };
}

async function grabReleaseForMovie(
  release: IndexerRelease,
  movie: WantedMovie,
  profileId: number,
): Promise<boolean> {
  const resolved = resolveDownloadClient(release);
  if (!resolved) {
    console.warn(
      `[auto-search] No enabled ${release.protocol} download client for "${release.title}"`,
    );
    return false;
  }

  const { client, combinedTag } = resolved;

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

  if (downloadId) {
    db.insert(trackedDownloads)
      .values({
        downloadClientId: client.id,
        downloadId,
        movieId: movie.id,
        downloadProfileId: profileId,
        releaseTitle: release.title,
        protocol: release.protocol,
        indexerId: release.allstarrIndexerId,
        guid: release.guid,
        state: "queued",
      })
      .run();
  }

  db.insert(history)
    .values({
      eventType: "movieGrabbed",
      movieId: movie.id,
      data: {
        title: release.title,
        guid: release.guid,
        indexerId: release.allstarrIndexerId,
        downloadClientId: client.id,
        downloadClientName: client.name,
        protocol: release.protocol,
        size: release.size,
        quality: release.quality.name,
        source: "autoSearch",
      },
    })
    .run();

  return true;
}

async function grabReleaseForEpisode(
  release: IndexerRelease,
  episode: WantedEpisode,
  profileId: number,
): Promise<boolean> {
  const resolved = resolveDownloadClient(release);
  if (!resolved) {
    console.warn(
      `[auto-search] No enabled ${release.protocol} download client for "${release.title}"`,
    );
    return false;
  }

  const { client, combinedTag } = resolved;

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

  if (downloadId) {
    db.insert(trackedDownloads)
      .values({
        downloadClientId: client.id,
        downloadId,
        showId: episode.showId,
        episodeId: episode.id,
        downloadProfileId: profileId,
        releaseTitle: release.title,
        protocol: release.protocol,
        indexerId: release.allstarrIndexerId,
        guid: release.guid,
        state: "queued",
      })
      .run();
  }

  db.insert(history)
    .values({
      eventType: "episodeGrabbed",
      showId: episode.showId,
      episodeId: episode.id,
      data: {
        title: release.title,
        guid: release.guid,
        indexerId: release.allstarrIndexerId,
        downloadClientId: client.id,
        downloadClientName: client.name,
        protocol: release.protocol,
        size: release.size,
        quality: release.quality.name,
        source: "autoSearch",
      },
    })
    .run();

  return true;
}
