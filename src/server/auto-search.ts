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
import { dispatchAutoSearchDownload } from "./auto-search-download-dispatch";
import {
	type EnabledIndexers,
	searchEnabledIndexers,
} from "./auto-search-indexer-search";
import getProvider from "./download-clients/registry";
import type { ConnectionConfig } from "./download-clients/types";
import { anyIndexerAvailable, canQueryIndexer } from "./indexer-rate-limiter";
import type { PackContext, ProfileInfo } from "./indexers";
import {
	dedupeAndScoreReleases,
	getCategoriesForProfiles,
	getReleaseTypeRank,
	isPackQualified,
} from "./indexers";
import {
	enrichRelease,
	getProfileWeight,
	isFormatInProfile,
} from "./indexers/format-parser";
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
): Promise<IndexerRelease[]> {
	return searchEnabledIndexers({
		bookParams,
		canQueryIndexer,
		categories,
		contentType,
		enabledIndexers: ixs,
		enrichRelease,
		logError,
		logInfo,
		logPrefix,
		query,
		searchNewznab,
		sleep,
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

	const allReleases = await searchEnabledIndexers({
		bookParams,
		canQueryIndexer,
		categories,
		contentType: "book",
		enabledIndexers: ixs,
		enrichRelease,
		logError,
		logInfo,
		logPrefix: "rss-sync",
		query,
		searchNewznab,
		sleep,
	});

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
			logInfo(
				"rss-sync",
				`Grabbed "${bestRelease.title}" for "${book.title}" (profile: ${profile.name})`,
			);
		}
	}

	return grabbedTitles;
}

// ─── Pack-aware book search helpers ─────────────────────────────────────────

/** Grab a release for an author-level pack or individual book */
async function grabReleaseForBookPack(
	release: IndexerRelease,
	authorId: number | null,
	bookId: number | undefined,
	profileId: number,
): Promise<boolean> {
	const resolved = resolveDownloadClient(release);
	if (!resolved) {
		logWarn(
			"auto-search",
			`No enabled ${release.protocol} download client for "${release.title}"`,
		);
		return false;
	}

	const { client, combinedTag } = resolved;

	const provider = await getProvider(client.implementation);
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
				authorId: authorId ?? null,
				bookId: bookId ?? null,
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
			eventType: "bookGrabbed",
			bookId: bookId ?? null,
			authorId,
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

/** Try to grab the best release for each wanted book, with pack context */
async function grabPerProfileForBooks(
	scored: IndexerRelease[],
	wantedBooks: WantedBook[],
	packContext: PackContext,
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
			const best = findBestReleaseForProfile(
				scored,
				profile,
				bestExistingWeight,
				blocklistedTitles,
				grabbedGuids,
				0,
				packContext,
			);
			if (!best) {
				continue;
			}

			const isPack = getReleaseTypeRank(best.releaseType) >= 2;
			const result = await grabReleaseForBookPack(
				best,
				book.authorId,
				isPack ? undefined : book.id,
				profile.id,
			);
			if (result) {
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
): Promise<PackSearchResult> {
	const cleanName = cleanSearchTerm(authorName);
	const query = `"${cleanName}"`;

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
	);

	if (allReleases.length === 0) {
		return { searched: true, grabbed: false };
	}

	const scored = dedupeAndScoreReleases(allReleases, null, null);
	const packContext: PackContext = {
		wantedBookIds: new Set(wantedBooks.map((b) => b.id)),
	};
	return grabPerProfileForBooks(scored, wantedBooks, packContext);
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

	const allReleases: IndexerRelease[] = [];

	const syncedWithKey = ixs.synced.filter((s) => s.apiKey);
	for (const synced of syncedWithKey) {
		// Rate limiter gate — automatic searches enforce daily caps
		const gate = canQueryIndexer("synced", synced.id);
		if (!gate.allowed) {
			if (gate.reason === "pacing" && gate.waitMs) {
				await sleep(gate.waitMs);
			} else {
				logInfo(
					"auto-search",
					`Indexer "${synced.name}" skipped for movie: ${gate.reason}`,
				);
				continue;
			}
		}

		try {
			const results = await searchNewznab(
				{
					baseUrl: synced.baseUrl,
					apiPath: synced.apiPath ?? "/api",
					apiKey: synced.apiKey ?? "",
				},
				query,
				categories,
				undefined,
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
			logError(
				"auto-search",
				`Indexer "${synced.name}" failed for movie`,
				error,
			);
		}
	}

	for (const ix of ixs.manual) {
		// Rate limiter gate — automatic searches enforce daily caps
		const gate = canQueryIndexer("manual", ix.id);
		if (!gate.allowed) {
			if (gate.reason === "pacing" && gate.waitMs) {
				await sleep(gate.waitMs);
			} else {
				logInfo(
					"auto-search",
					`Indexer "${ix.name}" skipped for movie: ${gate.reason}`,
				);
				continue;
			}
		}

		try {
			const results = await searchNewznab(
				{
					baseUrl: ix.baseUrl,
					apiPath: ix.apiPath ?? "/api",
					apiKey: ix.apiKey ?? "",
				},
				query,
				categories,
				undefined,
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
			logError("auto-search", "Manual indexer failed for movie", error);
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
			logInfo(
				"auto-search",
				`Grabbed "${bestRelease.title}" for movie "${movie.title}" (profile: ${profile.name})`,
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

	const allReleases: IndexerRelease[] = [];

	for (const query of queries) {
		const syncedWithKey = ixs.synced.filter((s) => s.apiKey);
		for (const synced of syncedWithKey) {
			// Rate limiter gate — automatic searches enforce daily caps
			const gate = canQueryIndexer("synced", synced.id);
			if (!gate.allowed) {
				if (gate.reason === "pacing" && gate.waitMs) {
					await sleep(gate.waitMs);
				} else {
					logInfo(
						"auto-search",
						`Indexer "${synced.name}" skipped for episode: ${gate.reason}`,
					);
					continue;
				}
			}

			try {
				const results = await searchNewznab(
					{
						baseUrl: synced.baseUrl,
						apiPath: synced.apiPath ?? "/api",
						apiKey: synced.apiKey ?? "",
					},
					query,
					categories,
					undefined,
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
				logError(
					"auto-search",
					`Indexer "${synced.name}" failed for episode`,
					error,
				);
			}
		}

		for (const ix of ixs.manual) {
			// Rate limiter gate — automatic searches enforce daily caps
			const gate = canQueryIndexer("manual", ix.id);
			if (!gate.allowed) {
				if (gate.reason === "pacing" && gate.waitMs) {
					await sleep(gate.waitMs);
				} else {
					logInfo(
						"auto-search",
						`Indexer "${ix.name}" skipped for episode: ${gate.reason}`,
					);
					continue;
				}
			}

			try {
				const results = await searchNewznab(
					{
						baseUrl: ix.baseUrl,
						apiPath: ix.apiPath ?? "/api",
						apiKey: ix.apiKey ?? "",
					},
					query,
					categories,
					undefined,
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
				logError("auto-search", "Manual indexer failed for episode", error);
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
			logInfo(
				"auto-search",
				`Grabbed "${bestRelease.title}" for "${episode.showTitle}" S${padNumber(episode.seasonNumber)}E${padNumber(episode.episodeNumber)} (profile: ${profile.name})`,
			);
		}
	}

	return grabbedTitles;
}

// ─── Pack-aware episode search helpers ─────────────────────────────────────

type PackSearchResult = { searched: boolean; grabbed: boolean };

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

/** Grab a release for a show-level or season-level pack, or individual episode */
async function grabReleaseForEpisodePack(
	release: IndexerRelease,
	showId: number,
	episodeId: number | undefined,
	profileId: number,
): Promise<boolean> {
	const resolved = resolveDownloadClient(release);
	if (!resolved) {
		logWarn(
			"auto-search",
			`No enabled ${release.protocol} download client for "${release.title}"`,
		);
		return false;
	}

	const { client, combinedTag } = resolved;

	const provider = await getProvider(client.implementation);
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
				showId,
				episodeId: episodeId ?? null,
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
			showId,
			episodeId: episodeId ?? null,
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

/** Try to grab the best release for each wanted episode, with pack context */
async function grabPerProfileForEpisodes(
	scored: IndexerRelease[],
	wantedEpisodes: WantedEpisode[],
	packContext: PackContext,
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
			const best = findBestReleaseForProfile(
				scored,
				profile,
				bestExistingWeight,
				blocklistedTitles,
				grabbedGuids,
				0,
				packContext,
			);
			if (!best) {
				continue;
			}

			const isPack = getReleaseTypeRank(best.releaseType) >= 2;
			const result = await grabReleaseForEpisodePack(
				best,
				ep.showId,
				isPack ? undefined : ep.id,
				profile.id,
			);
			if (result) {
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
): Promise<PackSearchResult> {
	const showName = cleanSearchTerm(show.title);
	const query = `"${showName}" S${padNumber(seasonNumber)}`;
	const allProfiles = wantedEpisodes.flatMap((ep) => ep.profiles);
	const categories = getCategoriesForProfiles(allProfiles);

	const allReleases = await searchIndexers(
		ixs,
		query,
		categories,
		undefined,
		"tv",
		"[auto-search:season]",
	);
	if (allReleases.length === 0) {
		return { searched: true, grabbed: false };
	}

	const scored = dedupeAndScoreReleases(allReleases, null, null);
	const packContext = buildPackContextFromSeasons(allSeasonMap);
	return grabPerProfileForEpisodes(scored, wantedEpisodes, packContext);
}

/** Search at the show level (just show name) for multi-season packs */
async function searchAndGrabForShow(
	show: { id: number; title: string },
	seasonMap: Map<number, WantedEpisode[]>,
	ixs: EnabledIndexers,
): Promise<PackSearchResult> {
	const showName = cleanSearchTerm(show.title);
	const query = `"${showName}"`;
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
	);
	if (allReleases.length === 0) {
		return { searched: true, grabbed: false };
	}

	const scored = dedupeAndScoreReleases(allReleases, null, null);
	const packContext = buildPackContextFromSeasons(seasonMap);
	const allEpisodes = [...seasonMap.values()].flat();
	return grabPerProfileForEpisodes(scored, allEpisodes, packContext);
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
): Promise<void> {
	for (let i = 0; i < booksToSearch.length; i += 1) {
		if (
			!anyIndexerAvailable(
				ixs.manual.map((m) => m.id),
				ixs.synced.map((s) => s.id),
			)
		) {
			break;
		}

		const book = booksToSearch[i];
		try {
			const detail = await searchAndGrabForBook(book, ixs);
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
		if (
			!anyIndexerAvailable(
				ixs.manual.map((m) => m.id),
				ixs.synced.map((s) => s.id),
			)
		) {
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
				);
				recordBookDetails(authorBooks, packResult, result);
				if (packResult.grabbed) {
					continue;
				}
			} catch (error) {
				logError(
					"auto-search",
					`Error in author-level search for "${authorName}"`,
					error,
				);
			}
			await sleep(delay);
		}

		// Fallback to individual book search
		await processIndividualBooks(authorBooks, ixs, result, delay);
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
		if (
			!anyIndexerAvailable(
				ixs.manual.map((m) => m.id),
				ixs.synced.map((s) => s.id),
			)
		) {
			logInfo("auto-search", "All indexers exhausted, stopping cycle early");
			break;
		}

		const movie = wantedMovies[i];

		try {
			const detail = await searchAndGrabForMovie(movie, ixs);
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
): Promise<void> {
	if (seasonEpisodes.length >= 2) {
		try {
			const seasonResult = await searchAndGrabForSeason(
				show,
				seasonNumber,
				seasonEpisodes,
				seasonMap,
				ixs,
			);
			recordEpisodeDetails(seasonEpisodes, seasonResult, result);
			if (seasonResult.grabbed) {
				return;
			}
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
		if (
			!anyIndexerAvailable(
				ixs.manual.map((m) => m.id),
				ixs.synced.map((s) => s.id),
			)
		) {
			break;
		}
		const episode = seasonEpisodes[i];
		try {
			const detail = await searchAndGrabForEpisode(episode, ixs);
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
		if (
			!anyIndexerAvailable(
				ixs.manual.map((m) => m.id),
				ixs.synced.map((s) => s.id),
			)
		) {
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
				const packResult = await searchAndGrabForShow(show, seasonMap, ixs);
				recordEpisodeDetails(
					[...seasonMap.values()].flat(),
					packResult,
					result,
				);
				if (packResult.grabbed) {
					continue;
				}
			} catch (error) {
				logError(
					"auto-search",
					`Error in show-level search for "${show.title}"`,
					error,
				);
			}
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
	};

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

	await processWantedBooks(wantedBooks, ixs, result, delayBetweenBooks);

	// ── Movies & Episodes (full auto-search only, not book-specific) ───────
	if (!bookIds) {
		if (wantedBooks.length > 0) {
			await sleep(delayBetweenBooks);
		}

		const wantedMovies = sortBySearchPriority(
			getWantedMovies(),
			(m) => m.lastSearchedAt,
		);
		await processWantedMovies(wantedMovies, ixs, result, delayBetweenBooks);

		const wantedEpisodes = sortBySearchPriority(
			getWantedEpisodes(),
			(e) => e.lastSearchedAt,
		);
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
	packContext: PackContext | null = null,
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
		// Skip disqualified packs
		if (!isPackQualified(release, packContext)) {
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
	let client: typeof downloadClients.$inferSelect | undefined;

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
			logWarn(
				"rss-sync",
				`No enabled ${release.protocol} download client for "${release.title}"`,
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

	const provider = await getProvider(client.implementation);
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

async function grabReleaseForMovie(
	release: IndexerRelease,
	movie: WantedMovie,
	profileId: number,
): Promise<boolean> {
	return dispatchAutoSearchDownload<
		IndexerRelease,
		TrackedDownloadInsert,
		HistoryInsert
	>({
		getProvider,
		history: ({ client, release }) => ({
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
		}),
		insertHistory: (value) => {
			db.insert(history).values(value).run();
		},
		insertTrackedDownload: (value) => {
			db.insert(trackedDownloads).values(value).run();
		},
		logWarn,
		release,
		resolveDownloadClient,
		trackedDownload: ({ client, downloadId, release }) => ({
			downloadClientId: client.id,
			downloadId,
			movieId: movie.id,
			downloadProfileId: profileId,
			releaseTitle: release.title,
			protocol: release.protocol,
			indexerId: release.allstarrIndexerId,
			guid: release.guid,
			state: "queued",
		}),
	});
}

async function grabReleaseForEpisode(
	release: IndexerRelease,
	episode: WantedEpisode,
	profileId: number,
): Promise<boolean> {
	return dispatchAutoSearchDownload<
		IndexerRelease,
		TrackedDownloadInsert,
		HistoryInsert
	>({
		getProvider,
		history: ({ client, release }) => ({
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
		}),
		insertHistory: (value) => {
			db.insert(history).values(value).run();
		},
		insertTrackedDownload: (value) => {
			db.insert(trackedDownloads).values(value).run();
		},
		logWarn,
		release,
		resolveDownloadClient,
		trackedDownload: ({ client, downloadId, release }) => ({
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
		}),
	});
}
