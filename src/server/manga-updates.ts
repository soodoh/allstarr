/**
 * MangaUpdates REST API client.
 * Docs: https://api.mangaupdates.com
 * No authentication required for read endpoints.
 */

import { ApiRateLimitError, createApiFetcher } from "./api-cache";

const BASE_URL = "https://api.mangaupdates.com/v1";
const REQUEST_TIMEOUT_MS = 30_000;

const mangaUpdates = createApiFetcher({
	name: "manga-updates",
	cache: { ttlMs: 10 * 60 * 1000, maxEntries: 500 },
	rateLimit: { maxRequests: 4, windowMs: 2000 },
	retry: { maxRetries: 3, baseDelayMs: 2000 },
});

async function mangaUpdatesFetch<T>(
	cacheKey: string,
	url: string,
	init?: RequestInit,
): Promise<T> {
	return mangaUpdates.fetch<T>(cacheKey, async () => {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(url, {
				...init,
				signal: controller.signal,
			});
			if (response.status === 429) {
				throw new ApiRateLimitError("MangaUpdates rate limit");
			}
			if (!response.ok) {
				throw new Error(
					`MangaUpdates API error: ${response.status} ${response.statusText}`,
				);
			}
			return (await response.json()) as T;
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				throw new Error("MangaUpdates API request timed out.", {
					cause: error,
				});
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	});
}

// ─── Types ────────────────────────────────────────────────────────────────

export type MangaUpdatesSeriesResult = {
	series_id: number;
	title: string;
	url: string;
	description: string;
	image: {
		url: { original: string; thumb: string };
		height: number;
		width: number;
	} | null;
	type: string;
	year: string;
	bayesian_rating: number;
	rating_votes: number;
	genres: Array<{ genre: string }>;
};

export type MangaUpdatesSeriesDetail = MangaUpdatesSeriesResult & {
	associated: Array<{ title: string }>;
	status: string;
	latest_chapter: number | null;
	completed: boolean;
	licensed: boolean;
	last_updated: {
		timestamp: number;
		as_rfc3339: string;
		as_string: string;
	} | null;
	categories: Array<{
		series_id: number;
		category: string;
		votes: number;
		votes_plus: number;
		votes_minus: number;
		added_by: number;
	}>;
	authors: Array<{
		name: string;
		author_id: number;
		type: string;
	}>;
};

export type MangaUpdatesRelease = {
	id: number;
	title: string;
	volume: string | null;
	chapter: string;
	groups: Array<{
		name: string;
		group_id: number;
	}>;
	release_date: string;
	time_added: {
		timestamp: number;
		as_rfc3339: string;
	};
};

export type MangaUpdatesGroup = {
	group_id: number;
	name: string;
	url: string;
	active: boolean;
	social: {
		site: string | null;
		discord: string | null;
	};
};

// ─── API Functions ────────────────────────────────────────────────────────

export async function searchMangaUpdatesSeries(
	query: string,
	perPage = 25,
): Promise<{
	totalHits: number;
	results: MangaUpdatesSeriesResult[];
}> {
	const cacheKey = `series-search:${query}:${perPage}`;
	const data = await mangaUpdatesFetch<{
		total_hits?: number;
		results?: Array<{ record: MangaUpdatesSeriesResult }>;
	}>(cacheKey, `${BASE_URL}/series/search`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ search: query, per_page: perPage }),
	});
	return {
		totalHits: data.total_hits ?? 0,
		results: (data.results ?? []).map((r) => r.record),
	};
}

export async function getMangaUpdatesSeriesDetail(
	seriesId: number,
): Promise<MangaUpdatesSeriesDetail> {
	const cacheKey = `series-detail:${seriesId}`;
	return mangaUpdatesFetch<MangaUpdatesSeriesDetail>(
		cacheKey,
		`${BASE_URL}/series/${seriesId}`,
	);
}

type ReleaseSearchResult = {
	record: MangaUpdatesRelease;
	metadata?: { series?: { series_id?: number } };
};

/**
 * Single-page release search. Used internally by getAllMangaUpdatesReleases.
 */
async function fetchReleasesPage(
	title: string,
	seriesId: number,
	page: number,
): Promise<{ totalHits: number; results: MangaUpdatesRelease[] }> {
	const cacheKey = `releases:${seriesId}:${page}`;
	const data = await mangaUpdatesFetch<{
		total_hits?: number;
		results?: ReleaseSearchResult[];
	}>(cacheKey, `${BASE_URL}/releases/search`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			search: title,
			include_metadata: true,
			perpage: 100,
			page,
		}),
	});

	const matched = (data.results ?? [])
		.filter((r) => r.metadata?.series?.series_id === seriesId)
		.map((r) => r.record);

	return { totalHits: data.total_hits ?? 0, results: matched };
}

/**
 * Fetch ALL releases for a specific series, paginating through the
 * MangaUpdates releases/search endpoint. Uses `include_metadata` to get the
 * series_id on each result and filters to the exact series.
 *
 * Stops when all pages are exhausted or a safety cap of 250 pages is reached.
 */
export async function getAllMangaUpdatesReleases(
	seriesId: number,
	title: string,
): Promise<MangaUpdatesRelease[]> {
	const allReleases: MangaUpdatesRelease[] = [];
	let page = 1;
	let fetched = 0;
	let totalHits = 0;
	let consecutiveEmpty = 0;
	do {
		const result = await fetchReleasesPage(title, seriesId, page);
		totalHits = result.totalHits;
		fetched += 100; // API returns up to 100 per page with perpage=100
		if (result.results.length === 0) {
			consecutiveEmpty += 1;
		} else {
			consecutiveEmpty = 0;
		}
		allReleases.push(...result.results);
		page += 1;
	} while (fetched < totalHits && page <= 250 && consecutiveEmpty < 3);
	return allReleases;
}

export async function getMangaUpdatesSeriesGroups(
	seriesId: number,
): Promise<MangaUpdatesGroup[]> {
	const cacheKey = `series-groups:${seriesId}`;
	const data = await mangaUpdatesFetch<{ group_list?: MangaUpdatesGroup[] }>(
		cacheKey,
		`${BASE_URL}/series/${seriesId}/groups`,
	);
	return data.group_list ?? [];
}
