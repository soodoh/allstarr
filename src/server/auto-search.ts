import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "src/db";
import {
	authors,
	blocklist,
	bookFiles,
	books,
	booksAuthors,
	downloadClients,
	downloadProfiles,
	editionDownloadProfiles,
	editions,
	episodeDownloadProfiles,
	episodeFiles,
	episodes,
	history,
	indexers,
	movieDownloadProfiles,
	movieFiles,
	movies,
	seasons,
	shows,
	syncedIndexers,
	trackedDownloads,
} from "src/db/schema";
import {
	type AutoSearchGrabResult,
	dispatchAutoSearchDownload,
} from "./auto-search-download-dispatch";
import {
	createIndexerSearch,
	type EnabledIndexers,
} from "./auto-search-indexer-search";
import {
	type AutoSearchOutcomeCounts,
	type AutoSearchOutcomeRecorder,
	createAutoSearchOutcomeCounts,
	createAutoSearchOutcomeRecorder,
} from "./auto-search-outcomes";
import { grabBestReleaseForProfile } from "./auto-search-release-selection";
import { anyIndexerAvailable, canQueryIndexer } from "./indexer-rate-limiter";
import type { PackContext, ProfileInfo } from "./indexers";
import {
	dedupeAndScoreReleases,
	getCategoriesForProfiles,
	getReleaseTypeRank,
} from "./indexers";
import { enrichRelease, getProfileWeight } from "./indexers/format-parser";
import { searchNewznab } from "./indexers/http";
import type { IndexerRelease } from "./indexers/types";
import { logError, logInfo, logWarn } from "./logger";

// ─── Types ──────────────────────────────────────────────────────────────────

type AutoSearchOptions = {
	delayBetweenBooks?: number;
	maxBooks?: number;
	bookIds?: number[];
};

type HistoryInsert = typeof history.$inferInsert;
type TrackedDownloadInsert = typeof trackedDownloads.$inferInsert;
type ProfileGrabs = { titles: string[]; deferred: boolean };

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

type AutoSearchResult = {
	searched: number;
	grabbed: number;
	errors: number;
	details: SearchDetail[];
	movieDetails?: MovieSearchDetail[];
	episodeDetails?: EpisodeSearchDetail[];
	outcomes: AutoSearchOutcomeCounts;
};

type SearchCountResult = {
	searched: number;
	grabbed: number;
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
	lastSearchedAt: number | null;
	editionTargets: EditionProfileTarget[];
	profiles: ProfileInfo[];
	bestWeightByProfile: Map<number, number>;
};

type WantedMovie = {
	id: number;
	title: string;
	year: number;
	lastSearchedAt: number | null;
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
	lastSearchedAt: number | null;
	profiles: ProfileInfo[];
	bestWeightByProfile: Map<number, number>;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

const searchEnabledIndexers = createIndexerSearch({
	canQueryIndexer,
	enrichRelease,
	logError,
	logInfo,
	searchNewznab,
	sleep,
});

function sortBySearchPriority<T extends { id: number }>(
	items: T[],
	getLastSearched: (item: T) => number | null,
): T[] {
	return [...items].toSorted((a, b) => {
		const aLast = getLastSearched(a);
		const bLast = getLastSearched(b);
		// Never searched first
		if (aLast === null && bLast !== null) {
			return -1;
		}
		if (aLast !== null && bLast === null) {
			return 1;
		}
		if (aLast === null && bLast === null) {
			return 0;
		}
		// Oldest search first (both guaranteed non-null after null checks above)
		return (aLast as number) - (bLast as number);
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

	return rows.flatMap((r) => {
		const profile = profileMap.get(r.profileId);
		return profile ? [{ editionId: r.editionId, profile }] : [];
	});
}

// ─── Wanted books detection ─────────────────────────────────────────────────

/** Find books that need searching: missing files or upgrade-eligible */
function getWantedBooks(): WantedBook[] {
	// Get all books that have at least one edition with a download profile assigned
	const monitoredBooks = db
		.select({
			id: books.id,
			title: books.title,
			lastSearchedAt: books.lastSearchedAt,
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
				lastSearchedAt: book.lastSearchedAt,
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
			// so we optimistically include the book and let the release selection module decide)
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
				lastSearchedAt: book.lastSearchedAt,
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
function getWantedMovies(movieIds?: number[]): WantedMovie[] {
	// Get all movies that have at least one download profile assigned
	const query = db
		.select({
			id: movies.id,
			title: movies.title,
			year: movies.year,
			lastSearchedAt: movies.lastSearchedAt,
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
				lastSearchedAt: movie.lastSearchedAt,
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
				lastSearchedAt: movie.lastSearchedAt,
				profiles,
				bestWeightByProfile,
			});
		}
	}

	return wanted;
}

// ─── Wanted episodes detection ──────────────────────────────────────────────

/** Find episodes that need searching: missing files or upgrade-eligible */
function getWantedEpisodes(
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
			lastSearchedAt: episodes.lastSearchedAt,
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
				lastSearchedAt: ep.lastSearchedAt,
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
				lastSearchedAt: ep.lastSearchedAt,
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

/** Search all indexers for a given query (extracted to reduce duplication) */
async function searchIndexers(
	ixs: EnabledIndexers,
	query: string,
	categories: number[],
	bookParams?: { author: string; title: string },
	contentType?: "book" | "tv",
	logPrefix = "[auto-search]",
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<IndexerRelease[]> {
	return searchEnabledIndexers({
		bookParams,
		categories,
		contentType,
		enabledIndexers: ixs,
		logPrefix,
		onOutcome,
		query,
	});
}

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

function createPackFailureTrackingRecorder(
	onOutcome?: AutoSearchOutcomeRecorder,
): {
	record: AutoSearchOutcomeRecorder;
	hadIndexerFailure: () => boolean;
} {
	let indexerFailed = false;
	return {
		record: (reason, amount) => {
			if (reason === "indexer_failed") {
				indexerFailed = true;
			}
			onOutcome?.(reason, amount);
		},
		hadIndexerFailure: () => indexerFailed,
	};
}

async function searchAndGrabForBook(
	book: WantedBook,
	ixs: EnabledIndexers,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
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

	const allReleases = await searchEnabledIndexers({
		bookParams,
		categories,
		contentType: "book",
		enabledIndexers: ixs,
		logPrefix: "rss-sync",
		onOutcome,
		query,
	});

	detail.searched = true;

	if (allReleases.length === 0) {
		onOutcome?.("no_matching_releases");
		return detail;
	}

	// Score, deduplicate, and grab per profile
	const bookInfo = { title: book.title, authorName: book.authorName };
	const scored = dedupeAndScoreReleases(allReleases, book.id, bookInfo, {
		preserveIndexerOrigins: true,
	});
	const { titles: grabbedTitles, deferred } = await grabPerProfile(
		scored,
		book,
		onOutcome,
		recordedOutcomeGuids,
	);

	if (grabbedTitles.length > 0) {
		detail.grabbed = true;
		detail.releaseTitle = grabbedTitles.join(", ");
	} else if (!deferred) {
		onOutcome?.("no_matching_releases");
	}

	return detail;
}

/** Try to grab the best release for each unique profile on the book */
async function grabPerProfile(
	scored: IndexerRelease[],
	book: WantedBook,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
): Promise<ProfileGrabs> {
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
	let deferred = false;

	for (const profile of book.profiles) {
		if (satisfiedProfiles.has(profile.id)) {
			continue;
		}

		const bestExistingWeight = book.bestWeightByProfile.get(profile.id) ?? 0;
		const result = await grabBestReleaseForProfile({
			releases: scored,
			profile,
			bestExistingWeight,
			blocklistedTitles,
			grabbedGuids,
			grab: (release) =>
				grabRelease(release, book, profile.id, onOutcome, recordedOutcomeGuids),
		});
		deferred ||= result.status === "deferred";
		if (result.status === "grabbed") {
			const bestRelease = result.release;
			grabbedGuids.add(bestRelease.guid);
			satisfiedProfiles.add(profile.id);
			grabbedTitles.push(bestRelease.title);
			logInfo(
				"rss-sync",
				`Grabbed "${bestRelease.title}" for "${book.title}" (profile: ${profile.name})`,
			);
		}
	}

	return { titles: grabbedTitles, deferred };
}

// ─── Pack-aware book search helpers ─────────────────────────────────────────

/** Try to grab the best release for each wanted book, with pack context */
async function grabPerProfileForBooks(
	scored: IndexerRelease[],
	wantedBooks: WantedBook[],
	packContext: PackContext,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
): Promise<PackSearchResult> {
	const grabbedGuids = new Set<string>();
	let grabbed = false;

	// Collect blocklisted titles for the author's books
	const bookIds = wantedBooks.map((b) => b.id);
	const blocklistedTitles =
		bookIds.length > 0
			? new Set(
					db
						.select({ sourceTitle: blocklist.sourceTitle })
						.from(blocklist)
						.where(inArray(blocklist.bookId, bookIds))
						.all()
						.map((b) => b.sourceTitle),
				)
			: new Set<string>();

	for (const book of wantedBooks) {
		for (const profile of book.profiles) {
			const bestExistingWeight = book.bestWeightByProfile.get(profile.id) ?? 0;
			const result = await grabBestReleaseForProfile({
				releases: scored,
				profile,
				bestExistingWeight,
				blocklistedTitles,
				grabbedGuids,
				packContext,
				grab: (release) =>
					grabReleaseForBookPack(
						release,
						book.authorId,
						getReleaseTypeRank(release.releaseType) >= 2 ? undefined : book.id,
						profile.id,
						onOutcome,
						recordedOutcomeGuids,
					),
			});
			if (result.status === "deferred") {
				return { searched: true, grabbed, deferred: true };
			}
			if (result.status === "grabbed") {
				const best = result.release;
				const isPack = getReleaseTypeRank(best.releaseType) >= 2;
				grabbedGuids.add(best.guid);
				grabbed = true;
				logInfo(
					"auto-search",
					`Grabbed "${best.title}" for "${book.title}"${isPack ? " (author pack)" : ""} (profile: ${profile.name})`,
				);
			}
		}
	}
	return { searched: true, grabbed };
}

/** Search at the author level (just author name) for author-collection packs */
async function searchAndGrabForAuthor(
	authorName: string,
	wantedBooks: WantedBook[],
	ixs: EnabledIndexers,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
): Promise<PackSearchResult> {
	const cleanName = cleanSearchTerm(authorName);
	const query = `"${cleanName}"`;
	const packOutcome = createPackFailureTrackingRecorder(onOutcome);

	// Derive categories from all book profiles
	const allProfiles = wantedBooks.flatMap((b) => b.profiles);
	const categories = getCategoriesForProfiles(allProfiles);

	const allReleases = await searchIndexers(
		ixs,
		query,
		categories,
		undefined,
		"book",
		"[auto-search]",
		packOutcome.record,
	);

	if (allReleases.length === 0) {
		if (packOutcome.hadIndexerFailure()) {
			onOutcome?.("pack_search_failed");
		}
		onOutcome?.("no_matching_releases");
		return { searched: true, grabbed: false };
	}

	const scored = dedupeAndScoreReleases(allReleases, null, null, {
		preserveIndexerOrigins: true,
	});
	const packContext: PackContext = {
		wantedBookIds: new Set(wantedBooks.map((b) => b.id)),
	};
	const result = await grabPerProfileForBooks(
		scored,
		wantedBooks,
		packContext,
		onOutcome,
		recordedOutcomeGuids,
	);
	if (!result.grabbed && !result.deferred) {
		onOutcome?.("no_matching_releases");
	}
	return result;
}

// ─── Per-movie search + grab ────────────────────────────────────────────────

async function searchAndGrabForMovie(
	movie: WantedMovie,
	ixs: EnabledIndexers,
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<MovieSearchDetail> {
	const detail: MovieSearchDetail = {
		movieId: movie.id,
		movieTitle: movie.title,
		searched: false,
		grabbed: false,
	};

	const query = buildMovieSearchQuery(movie);
	const categories = getCategoriesForProfiles(movie.profiles);

	const allReleases = await searchEnabledIndexers({
		enabledIndexers: ixs,
		query,
		categories,
		logPrefix: "auto-search",
		searchContext: "movie",
		onOutcome,
	});

	detail.searched = true;

	if (allReleases.length === 0) {
		onOutcome?.("no_matching_releases");
		return detail;
	}

	const scored = dedupeAndScoreReleases(allReleases, null, null, {
		preserveIndexerOrigins: true,
	});
	const { titles: grabbedTitles, deferred } = await grabPerProfileForMovie(
		scored,
		movie,
		onOutcome,
	);

	if (grabbedTitles.length > 0) {
		detail.grabbed = true;
		detail.releaseTitle = grabbedTitles.join(", ");
	} else if (!deferred) {
		onOutcome?.("no_matching_releases");
	}

	return detail;
}

/** Try to grab the best release for each unique profile on the movie */
async function grabPerProfileForMovie(
	scored: IndexerRelease[],
	movie: WantedMovie,
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<ProfileGrabs> {
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
	let deferred = false;

	for (const profile of movie.profiles) {
		if (satisfiedProfiles.has(profile.id)) {
			continue;
		}

		const bestExistingWeight = movie.bestWeightByProfile.get(profile.id) ?? 0;
		const result = await grabBestReleaseForProfile({
			releases: scored,
			profile,
			bestExistingWeight,
			blocklistedTitles,
			grabbedGuids,
			grab: (release) =>
				grabReleaseForMovie(release, movie, profile.id, onOutcome),
		});
		deferred ||= result.status === "deferred";
		if (result.status === "grabbed") {
			const bestRelease = result.release;
			satisfiedProfiles.add(profile.id);
			grabbedTitles.push(bestRelease.title);
			grabbedGuids.add(bestRelease.guid);
			logInfo(
				"auto-search",
				`Grabbed "${bestRelease.title}" for movie "${movie.title}" (profile: ${profile.name})`,
			);
		}
	}

	return { titles: grabbedTitles, deferred };
}

// ─── Per-episode search + grab ──────────────────────────────────────────────

async function searchAndGrabForEpisode(
	episode: WantedEpisode,
	ixs: EnabledIndexers,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
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

	const allReleases: IndexerRelease[] = [];
	for (const query of queries) {
		allReleases.push(
			...(await searchEnabledIndexers({
				enabledIndexers: ixs,
				query,
				categories,
				logPrefix: "auto-search",
				searchContext: "episode",
				onOutcome,
			})),
		);
	}

	detail.searched = true;

	if (allReleases.length === 0) {
		onOutcome?.("no_matching_releases");
		return detail;
	}

	const scored = dedupeAndScoreReleases(allReleases, null, null, {
		preserveIndexerOrigins: true,
	});
	const { titles: grabbedTitles, deferred } = await grabPerProfileForEpisode(
		scored,
		episode,
		onOutcome,
		recordedOutcomeGuids,
	);

	if (grabbedTitles.length > 0) {
		detail.grabbed = true;
		detail.releaseTitle = grabbedTitles.join(", ");
	} else if (!deferred) {
		onOutcome?.("no_matching_releases");
	}

	return detail;
}

/** Try to grab the best release for each unique profile on the episode */
async function grabPerProfileForEpisode(
	scored: IndexerRelease[],
	episode: WantedEpisode,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
): Promise<ProfileGrabs> {
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
	let deferred = false;

	for (const profile of episode.profiles) {
		if (satisfiedProfiles.has(profile.id)) {
			continue;
		}

		const bestExistingWeight = episode.bestWeightByProfile.get(profile.id) ?? 0;
		const result = await grabBestReleaseForProfile({
			releases: scored,
			profile,
			bestExistingWeight,
			blocklistedTitles,
			grabbedGuids,
			grab: (release) =>
				grabReleaseForEpisode(
					release,
					episode,
					profile.id,
					onOutcome,
					recordedOutcomeGuids,
				),
		});
		deferred ||= result.status === "deferred";
		if (result.status === "grabbed") {
			const bestRelease = result.release;
			grabbedGuids.add(bestRelease.guid);
			satisfiedProfiles.add(profile.id);
			grabbedTitles.push(bestRelease.title);
			logInfo(
				"auto-search",
				`Grabbed "${bestRelease.title}" for "${episode.showTitle}" S${padNumber(episode.seasonNumber)}E${padNumber(episode.episodeNumber)} (profile: ${profile.name})`,
			);
		}
	}

	return { titles: grabbedTitles, deferred };
}

// ─── Pack-aware episode search helpers ─────────────────────────────────────

type PackSearchResult = {
	searched: boolean;
	grabbed: boolean;
	deferred?: boolean;
};

/** Build a PackContext from a season map of wanted episodes */
function buildPackContextFromSeasons(
	seasonMap: Map<number, WantedEpisode[]>,
): PackContext {
	const wantedEpisodesBySeason = new Map<number, Set<number>>();
	for (const [seasonNumber, eps] of seasonMap) {
		wantedEpisodesBySeason.set(
			seasonNumber,
			new Set(eps.map((e) => e.episodeNumber)),
		);
	}
	return {
		wantedEpisodesBySeason,
		totalWantedSeasons: seasonMap.size,
	};
}

/** Try to grab the best release for each wanted episode, with pack context */
async function grabPerProfileForEpisodes(
	scored: IndexerRelease[],
	wantedEpisodes: WantedEpisode[],
	packContext: PackContext,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
): Promise<PackSearchResult> {
	const grabbedGuids = new Set<string>();
	let grabbed = false;

	// Collect blocklisted titles for the show (all episodes share the same show)
	const showId = wantedEpisodes[0]?.showId;
	const blocklistedTitles = showId
		? new Set(
				db
					.select({ sourceTitle: blocklist.sourceTitle })
					.from(blocklist)
					.where(eq(blocklist.showId, showId))
					.all()
					.map((b) => b.sourceTitle),
			)
		: new Set<string>();

	for (const ep of wantedEpisodes) {
		for (const profile of ep.profiles) {
			const bestExistingWeight = ep.bestWeightByProfile.get(profile.id) ?? 0;
			const result = await grabBestReleaseForProfile({
				releases: scored,
				profile,
				bestExistingWeight,
				blocklistedTitles,
				grabbedGuids,
				packContext,
				grab: (release) =>
					grabReleaseForEpisodePack(
						release,
						ep.showId,
						getReleaseTypeRank(release.releaseType) >= 2 ? undefined : ep.id,
						profile.id,
						onOutcome,
						recordedOutcomeGuids,
					),
			});
			if (result.status === "deferred") {
				return { searched: true, grabbed, deferred: true };
			}
			if (result.status === "grabbed") {
				const best = result.release;
				const isPack = getReleaseTypeRank(best.releaseType) >= 2;
				grabbedGuids.add(best.guid);
				grabbed = true;
				logInfo(
					"auto-search",
					`Grabbed "${best.title}" for "${ep.showTitle}"${isPack ? " (pack)" : ` S${padNumber(ep.seasonNumber)}E${padNumber(ep.episodeNumber)}`} (profile: ${profile.name})`,
				);
			}
		}
	}
	return { searched: true, grabbed };
}

/** Search at the season level ("show name" S##) and grab best pack releases */
async function searchAndGrabForSeason(
	show: { id: number; title: string },
	seasonNumber: number,
	wantedEpisodes: WantedEpisode[],
	allSeasonMap: Map<number, WantedEpisode[]>,
	ixs: EnabledIndexers,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
): Promise<PackSearchResult> {
	const showName = cleanSearchTerm(show.title);
	const query = `"${showName}" S${padNumber(seasonNumber)}`;
	const packOutcome = createPackFailureTrackingRecorder(onOutcome);
	const allProfiles = wantedEpisodes.flatMap((ep) => ep.profiles);
	const categories = getCategoriesForProfiles(allProfiles);

	const allReleases = await searchIndexers(
		ixs,
		query,
		categories,
		undefined,
		"tv",
		"[auto-search:season]",
		packOutcome.record,
	);
	if (allReleases.length === 0) {
		if (packOutcome.hadIndexerFailure()) {
			onOutcome?.("pack_search_failed");
		}
		onOutcome?.("no_matching_releases");
		return { searched: true, grabbed: false };
	}

	const scored = dedupeAndScoreReleases(allReleases, null, null, {
		preserveIndexerOrigins: true,
	});
	const packContext = buildPackContextFromSeasons(allSeasonMap);
	const result = await grabPerProfileForEpisodes(
		scored,
		wantedEpisodes,
		packContext,
		onOutcome,
		recordedOutcomeGuids,
	);
	if (!result.grabbed && !result.deferred) {
		onOutcome?.("no_matching_releases");
	}
	return result;
}

/** Search at the show level (just show name) for multi-season packs */
async function searchAndGrabForShow(
	show: { id: number; title: string },
	seasonMap: Map<number, WantedEpisode[]>,
	ixs: EnabledIndexers,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
): Promise<PackSearchResult> {
	const showName = cleanSearchTerm(show.title);
	const query = `"${showName}"`;
	const packOutcome = createPackFailureTrackingRecorder(onOutcome);
	const allProfiles = [...seasonMap.values()]
		.flat()
		.flatMap((ep) => ep.profiles);
	const categories = getCategoriesForProfiles(allProfiles);

	const allReleases = await searchIndexers(
		ixs,
		query,
		categories,
		undefined,
		"tv",
		"[auto-search:show]",
		packOutcome.record,
	);
	if (allReleases.length === 0) {
		if (packOutcome.hadIndexerFailure()) {
			onOutcome?.("pack_search_failed");
		}
		onOutcome?.("no_matching_releases");
		return { searched: true, grabbed: false };
	}

	const scored = dedupeAndScoreReleases(allReleases, null, null, {
		preserveIndexerOrigins: true,
	});
	const packContext = buildPackContextFromSeasons(seasonMap);
	const allEpisodes = [...seasonMap.values()].flat();
	const result = await grabPerProfileForEpisodes(
		scored,
		allEpisodes,
		packContext,
		onOutcome,
		recordedOutcomeGuids,
	);
	if (!result.grabbed && !result.deferred) {
		onOutcome?.("no_matching_releases");
	}
	return result;
}

// ─── Movie search ───────────────────────────────────────────────────────────

export async function searchForMovie(
	movieId: number,
): Promise<SearchCountResult> {
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

/** Search a single season with fallback to individual episodes */
async function searchSeasonWithFallback(
	show: { id: number; title: string },
	seasonNumber: number,
	seasonEpisodes: WantedEpisode[],
	seasonMap: Map<number, WantedEpisode[]>,
	ixs: EnabledIndexers,
	delay: number,
): Promise<{ searched: number; grabbed: number }> {
	let searched = 0;
	let grabbed = 0;

	if (seasonEpisodes.length >= 2) {
		try {
			const seasonResult = await searchAndGrabForSeason(
				show,
				seasonNumber,
				seasonEpisodes,
				seasonMap,
				ixs,
			);
			if (seasonResult.searched) {
				searched += seasonEpisodes.length;
			}
			if (seasonResult.grabbed) {
				grabbed += 1;
				return { searched, grabbed };
			}
			if (seasonResult.deferred) return { searched, grabbed };
		} catch (error) {
			logError(
				"auto-search",
				`Error in season-level search for "${show.title}" S${padNumber(seasonNumber)}`,
				error,
			);
		}
		await sleep(delay);
	}

	// Fallback to individual episode search
	for (let i = 0; i < seasonEpisodes.length; i += 1) {
		const episode = seasonEpisodes[i];
		try {
			const detail = await searchAndGrabForEpisode(episode, ixs);
			if (detail.searched) {
				searched += 1;
			}
			if (detail.grabbed) {
				grabbed += 1;
			}
		} catch (error) {
			logError(
				"auto-search",
				`Error searching for episode "${episode.showTitle}" S${padNumber(episode.seasonNumber)}E${padNumber(episode.episodeNumber)}`,
				error,
			);
		}
		if (i < seasonEpisodes.length - 1) {
			await sleep(delay);
		}
	}

	return { searched, grabbed };
}

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

	const seasonMap = new Map<number, WantedEpisode[]>();
	for (const ep of wantedEpisodes) {
		if (!seasonMap.has(ep.seasonNumber)) {
			seasonMap.set(ep.seasonNumber, []);
		}
		seasonMap.get(ep.seasonNumber)?.push(ep);
	}

	const show = { id: showId, title: wantedEpisodes[0].showTitle };

	// Multiple seasons → show-level search first
	if (seasonMap.size > 1) {
		try {
			const packResult = await searchAndGrabForShow(show, seasonMap, ixs);
			if (packResult.searched) {
				searched += wantedEpisodes.length;
			}
			if (packResult.grabbed) {
				grabbed += 1;
				return { searched, grabbed };
			}
			if (packResult.deferred) return { searched, grabbed };
		} catch (error) {
			logError(
				"auto-search",
				`Error in show-level search for "${show.title}"`,
				error,
			);
		}
		await sleep(DELAY_BETWEEN_ITEMS);
	}

	// Per-season with fallback
	let isFirstSeason = true;
	for (const [seasonNumber, seasonEpisodes] of seasonMap) {
		if (!isFirstSeason) {
			await sleep(DELAY_BETWEEN_ITEMS);
		}
		isFirstSeason = false;
		const sr = await searchSeasonWithFallback(
			show,
			seasonNumber,
			seasonEpisodes,
			seasonMap,
			ixs,
			DELAY_BETWEEN_ITEMS,
		);
		searched += sr.searched;
		grabbed += sr.grabbed;
	}

	return { searched, grabbed };
}

// ─── Auto-search orchestrator ───────────────────────────────────────────────

/** Record book search details and update lastSearchedAt */
function recordBookDetails(
	booksToRecord: WantedBook[],
	searchResult: PackSearchResult,
	result: AutoSearchResult,
): void {
	for (const book of booksToRecord) {
		result.details.push({
			bookId: book.id,
			bookTitle: book.title,
			authorName: book.authorName,
			searched: searchResult.searched,
			grabbed: searchResult.grabbed,
		});
		if (searchResult.searched) {
			result.searched += 1;
		}
		db.update(books)
			.set({ lastSearchedAt: Date.now() })
			.where(eq(books.id, book.id))
			.run();
	}
	if (searchResult.grabbed) {
		result.grabbed += 1;
	}
}

/** Search individual books and record results */
async function processIndividualBooks(
	booksToSearch: WantedBook[],
	ixs: EnabledIndexers,
	result: AutoSearchResult,
	delay: number,
	onOutcome: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids: Set<string>,
): Promise<void> {
	for (let i = 0; i < booksToSearch.length; i += 1) {
		if (
			!anyIndexerAvailable(
				ixs.manual.map((m) => m.id),
				ixs.synced.map((s) => s.id),
			)
		) {
			onOutcome("all_indexers_exhausted");
			break;
		}

		const book = booksToSearch[i];
		try {
			const detail = await searchAndGrabForBook(
				book,
				ixs,
				onOutcome,
				recordedOutcomeGuids,
			);
			if (detail.searched) {
				result.searched += 1;
			}
			if (detail.grabbed) {
				result.grabbed += 1;
			}
			result.details.push(detail);
			db.update(books)
				.set({ lastSearchedAt: Date.now() })
				.where(eq(books.id, book.id))
				.run();
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
			logError(
				"auto-search",
				`Error searching for book "${book.title}"`,
				error,
			);
		}

		if (i < booksToSearch.length - 1) {
			await sleep(delay);
		}
	}
}

/** Process wanted books: group by author, try author-level search, then fallback */
async function processWantedBooks(
	wantedBooks: WantedBook[],
	ixs: EnabledIndexers,
	result: AutoSearchResult,
	delay: number,
	onOutcome: AutoSearchOutcomeRecorder,
): Promise<void> {
	// Group books by primary author
	const booksByAuthor = new Map<string, WantedBook[]>();
	for (const book of wantedBooks) {
		const key = book.authorName ?? "__no_author__";
		if (!booksByAuthor.has(key)) {
			booksByAuthor.set(key, []);
		}
		booksByAuthor.get(key)?.push(book);
	}

	let isFirstGroup = true;
	for (const [authorName, authorBooks] of booksByAuthor) {
		const recordedOutcomeGuids = new Set<string>();
		if (
			!anyIndexerAvailable(
				ixs.manual.map((m) => m.id),
				ixs.synced.map((s) => s.id),
			)
		) {
			onOutcome("all_indexers_exhausted");
			logInfo("auto-search", "All indexers exhausted, stopping cycle early");
			break;
		}
		if (!isFirstGroup) {
			await sleep(delay);
		}
		isFirstGroup = false;

		// 2+ books by same author → author-level search first
		if (authorBooks.length >= 2 && authorName !== "__no_author__") {
			try {
				const packResult = await searchAndGrabForAuthor(
					authorName,
					authorBooks,
					ixs,
					onOutcome,
					recordedOutcomeGuids,
				);
				recordBookDetails(authorBooks, packResult, result);
				if (packResult.grabbed || packResult.deferred) {
					continue;
				}
			} catch (error) {
				onOutcome("pack_search_failed");
				logError(
					"auto-search",
					`Error in author-level search for "${authorName}"`,
					error,
				);
			}
			onOutcome("fallback_used");
			await sleep(delay);
		}

		// Fallback to individual book search
		await processIndividualBooks(
			authorBooks,
			ixs,
			result,
			delay,
			onOutcome,
			recordedOutcomeGuids,
		);
	}
}

/** Process wanted movies: search, score, and grab per profile */
async function processWantedMovies(
	wantedMovies: WantedMovie[],
	ixs: EnabledIndexers,
	result: AutoSearchResult,
	delay: number,
	onOutcome: AutoSearchOutcomeRecorder,
): Promise<void> {
	for (let i = 0; i < wantedMovies.length; i += 1) {
		if (
			!anyIndexerAvailable(
				ixs.manual.map((m) => m.id),
				ixs.synced.map((s) => s.id),
			)
		) {
			onOutcome("all_indexers_exhausted");
			logInfo("auto-search", "All indexers exhausted, stopping cycle early");
			break;
		}

		const movie = wantedMovies[i];

		try {
			const detail = await searchAndGrabForMovie(movie, ixs, onOutcome);
			if (detail.searched) {
				result.searched += 1;
			}
			if (detail.grabbed) {
				result.grabbed += 1;
			}
			result.movieDetails?.push(detail);
			db.update(movies)
				.set({ lastSearchedAt: Date.now() })
				.where(eq(movies.id, movie.id))
				.run();
		} catch (error) {
			result.errors += 1;
			result.movieDetails?.push({
				movieId: movie.id,
				movieTitle: movie.title,
				searched: false,
				grabbed: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
			logError(
				"auto-search",
				`Error searching for movie "${movie.title}"`,
				error,
			);
		}

		if (i < wantedMovies.length - 1) {
			await sleep(delay);
		}
	}
}

/** Record episode search details in auto-search result */
function recordEpisodeDetails(
	eps: WantedEpisode[],
	searchResult: PackSearchResult,
	result: AutoSearchResult,
): void {
	for (const ep of eps) {
		result.episodeDetails?.push({
			episodeId: ep.id,
			showTitle: ep.showTitle,
			seasonNumber: ep.seasonNumber,
			episodeNumber: ep.episodeNumber,
			searched: searchResult.searched,
			grabbed: searchResult.grabbed,
		});
		if (searchResult.searched) {
			result.searched += 1;
		}
		db.update(episodes)
			.set({ lastSearchedAt: Date.now() })
			.where(eq(episodes.id, ep.id))
			.run();
	}
	if (searchResult.grabbed) {
		result.grabbed += 1;
	}
}

/** Process a single season: try season-level search, then fallback to individual episodes */
async function processSeasonEpisodes(
	show: { id: number; title: string },
	seasonNumber: number,
	seasonEpisodes: WantedEpisode[],
	seasonMap: Map<number, WantedEpisode[]>,
	ixs: EnabledIndexers,
	result: AutoSearchResult,
	delay: number,
	onOutcome: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids: Set<string>,
): Promise<void> {
	if (seasonEpisodes.length >= 2) {
		try {
			const seasonResult = await searchAndGrabForSeason(
				show,
				seasonNumber,
				seasonEpisodes,
				seasonMap,
				ixs,
				onOutcome,
				recordedOutcomeGuids,
			);
			recordEpisodeDetails(seasonEpisodes, seasonResult, result);
			if (seasonResult.grabbed || seasonResult.deferred) {
				return;
			}
		} catch (error) {
			onOutcome("pack_search_failed");
			logError(
				"auto-search",
				`Error in season-level search for "${show.title}" S${padNumber(seasonNumber)}`,
				error,
			);
		}
		onOutcome("fallback_used");
		await sleep(delay);
	}

	// Fallback to individual episode search
	for (let i = 0; i < seasonEpisodes.length; i += 1) {
		if (
			!anyIndexerAvailable(
				ixs.manual.map((m) => m.id),
				ixs.synced.map((s) => s.id),
			)
		) {
			onOutcome("all_indexers_exhausted");
			break;
		}
		const episode = seasonEpisodes[i];
		try {
			const detail = await searchAndGrabForEpisode(
				episode,
				ixs,
				onOutcome,
				recordedOutcomeGuids,
			);
			if (detail.searched) {
				result.searched += 1;
			}
			if (detail.grabbed) {
				result.grabbed += 1;
			}
			result.episodeDetails?.push(detail);
			db.update(episodes)
				.set({ lastSearchedAt: Date.now() })
				.where(eq(episodes.id, episode.id))
				.run();
		} catch (error) {
			result.errors += 1;
			result.episodeDetails?.push({
				episodeId: episode.id,
				showTitle: episode.showTitle,
				seasonNumber: episode.seasonNumber,
				episodeNumber: episode.episodeNumber,
				searched: false,
				grabbed: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
			logError(
				"auto-search",
				`Error searching for episode "${episode.showTitle}" S${padNumber(episode.seasonNumber)}E${padNumber(episode.episodeNumber)}`,
				error,
			);
		}
		if (i < seasonEpisodes.length - 1) {
			await sleep(delay);
		}
	}
}

/** Process wanted episodes: group by show/season and search at broadest applicable level */
async function processWantedEpisodes(
	wantedEpisodes: WantedEpisode[],
	ixs: EnabledIndexers,
	result: AutoSearchResult,
	delay: number,
	onOutcome: AutoSearchOutcomeRecorder,
): Promise<void> {
	const episodesByShow = new Map<number, Map<number, WantedEpisode[]>>();
	for (const ep of wantedEpisodes) {
		let showMap = episodesByShow.get(ep.showId);
		if (!showMap) {
			showMap = new Map();
			episodesByShow.set(ep.showId, showMap);
		}
		let seasonList = showMap.get(ep.seasonNumber);
		if (!seasonList) {
			seasonList = [];
			showMap.set(ep.seasonNumber, seasonList);
		}
		seasonList.push(ep);
	}

	let isFirstShow = true;
	for (const [showId, seasonMap] of episodesByShow) {
		const recordedOutcomeGuids = new Set<string>();
		if (
			!anyIndexerAvailable(
				ixs.manual.map((m) => m.id),
				ixs.synced.map((s) => s.id),
			)
		) {
			onOutcome("all_indexers_exhausted");
			logInfo("auto-search", "All indexers exhausted, stopping cycle early");
			break;
		}
		if (!isFirstShow) {
			await sleep(delay);
		}
		isFirstShow = false;

		const show = {
			id: showId,
			title: seasonMap.values().next().value?.[0].showTitle ?? "Unknown",
		};

		// Multiple seasons → show-level search first
		if (seasonMap.size > 1) {
			try {
				const packResult = await searchAndGrabForShow(
					show,
					seasonMap,
					ixs,
					onOutcome,
					recordedOutcomeGuids,
				);
				recordEpisodeDetails(
					[...seasonMap.values()].flat(),
					packResult,
					result,
				);
				if (packResult.grabbed || packResult.deferred) {
					continue;
				}
			} catch (error) {
				onOutcome("pack_search_failed");
				logError(
					"auto-search",
					`Error in show-level search for "${show.title}"`,
					error,
				);
			}
			onOutcome("fallback_used");
			await sleep(delay);
		}

		// Per-season with fallback
		let isFirstSeason = true;
		for (const [seasonNumber, seasonEpisodes] of seasonMap) {
			if (
				!anyIndexerAvailable(
					ixs.manual.map((m) => m.id),
					ixs.synced.map((s) => s.id),
				)
			) {
				onOutcome("all_indexers_exhausted");
				break;
			}
			if (!isFirstSeason) {
				await sleep(delay);
			}
			isFirstSeason = false;
			await processSeasonEpisodes(
				show,
				seasonNumber,
				seasonEpisodes,
				seasonMap,
				ixs,
				result,
				delay,
				onOutcome,
				recordedOutcomeGuids,
			);
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
		outcomes: createAutoSearchOutcomeCounts(),
	};
	const recordOutcome = createAutoSearchOutcomeRecorder(result.outcomes);

	const ixs = getEnabledIndexers();

	if (ixs.manual.length === 0 && ixs.synced.length === 0) {
		logInfo("auto-search", "No RSS-enabled indexers configured");
		return result;
	}

	// ── Books ──────────────────────────────────────────────────────────────
	let wantedBooks = sortBySearchPriority(
		getWantedBooks(),
		(b) => b.lastSearchedAt,
	);
	if (bookIds) {
		const idSet = new Set(bookIds);
		wantedBooks = wantedBooks.filter((b) => idSet.has(b.id));
	}
	if (maxBooks) {
		wantedBooks = wantedBooks.slice(0, maxBooks);
	}

	await processWantedBooks(
		wantedBooks,
		ixs,
		result,
		delayBetweenBooks,
		recordOutcome,
	);

	// ── Movies & Episodes (full auto-search only, not book-specific) ───────
	if (!bookIds) {
		if (wantedBooks.length > 0) {
			await sleep(delayBetweenBooks);
		}

		const wantedMovies = sortBySearchPriority(
			getWantedMovies(),
			(m) => m.lastSearchedAt,
		);
		await processWantedMovies(
			wantedMovies,
			ixs,
			result,
			delayBetweenBooks,
			recordOutcome,
		);

		const wantedEpisodes = sortBySearchPriority(
			getWantedEpisodes(),
			(e) => e.lastSearchedAt,
		);
		if (wantedMovies.length > 0 && wantedEpisodes.length > 0) {
			await sleep(delayBetweenBooks);
		}

		await processWantedEpisodes(
			wantedEpisodes,
			ixs,
			result,
			delayBetweenBooks,
			recordOutcome,
		);
	}

	return result;
}

// ─── Automatic grab adapters ────────────────────────────────────────────────

type MediaAssociation = Pick<
	TrackedDownloadInsert,
	"bookId" | "authorId" | "movieId" | "showId" | "episodeId"
>;

function grabReleaseForTarget(
	release: IndexerRelease,
	profileId: number,
	association: MediaAssociation,
	eventType: "bookGrabbed" | "movieGrabbed" | "episodeGrabbed",
	source: "rssSync" | "autoSearch",
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
): Promise<AutoSearchGrabResult> {
	return dispatchAutoSearchDownload<
		IndexerRelease,
		TrackedDownloadInsert,
		HistoryInsert
	>({
		release,
		resolveDownloadClient,
		logWarn,
		onOutcome,
		recordedOutcomeGuids,
		logPrefix: source === "rssSync" ? "rss-sync" : "auto-search",
		trackedDownload: ({ client, downloadId, release }) => ({
			...association,
			downloadClientId: client.id,
			downloadId,
			downloadProfileId: profileId,
			releaseTitle: release.title,
			protocol: release.protocol,
			indexerId: release.allstarrIndexerId,
			guid: release.guid,
			state: "queued",
		}),
		history: ({ client, release }) => ({
			...association,
			eventType,
			data: {
				title: release.title,
				guid: release.guid,
				indexerId: release.allstarrIndexerId,
				downloadClientId: client.id,
				downloadClientName: client.name,
				protocol: release.protocol,
				size: release.size,
				quality: release.quality.name,
				source,
			},
		}),
		insertTrackedDownload: (value) => {
			db.insert(trackedDownloads).values(value).run();
		},
		insertHistory: (value) => {
			db.insert(history).values(value).run();
		},
	});
}

function grabRelease(
	release: IndexerRelease,
	book: WantedBook,
	profileId: number,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
) {
	return grabReleaseForTarget(
		release,
		profileId,
		{ bookId: book.id, authorId: book.authorId },
		"bookGrabbed",
		"rssSync",
		onOutcome,
		recordedOutcomeGuids,
	);
}

function grabReleaseForBookPack(
	release: IndexerRelease,
	authorId: number | null,
	bookId: number | undefined,
	profileId: number,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
) {
	return grabReleaseForTarget(
		release,
		profileId,
		{ authorId, bookId: bookId ?? null },
		"bookGrabbed",
		"autoSearch",
		onOutcome,
		recordedOutcomeGuids,
	);
}

function grabReleaseForMovie(
	release: IndexerRelease,
	movie: WantedMovie,
	profileId: number,
	onOutcome?: AutoSearchOutcomeRecorder,
) {
	return grabReleaseForTarget(
		release,
		profileId,
		{ movieId: movie.id },
		"movieGrabbed",
		"autoSearch",
		onOutcome,
	);
}

function grabReleaseForEpisode(
	release: IndexerRelease,
	episode: WantedEpisode,
	profileId: number,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
) {
	return grabReleaseForTarget(
		release,
		profileId,
		{ showId: episode.showId, episodeId: episode.id },
		"episodeGrabbed",
		"autoSearch",
		onOutcome,
		recordedOutcomeGuids,
	);
}

function grabReleaseForEpisodePack(
	release: IndexerRelease,
	showId: number,
	episodeId: number | undefined,
	profileId: number,
	onOutcome?: AutoSearchOutcomeRecorder,
	recordedOutcomeGuids?: Set<string>,
) {
	return grabReleaseForTarget(
		release,
		profileId,
		{ showId, episodeId: episodeId ?? null },
		"episodeGrabbed",
		"autoSearch",
		onOutcome,
		recordedOutcomeGuids,
	);
}

function resolveDownloadClient(release: IndexerRelease) {
	let client: typeof downloadClients.$inferSelect | undefined;

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
