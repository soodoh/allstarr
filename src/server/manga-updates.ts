/**
 * MangaUpdates REST API client.
 * Docs: https://api.mangaupdates.com
 * No authentication required for read endpoints.
 */

const BASE_URL = "https://api.mangaupdates.com/v1";

// Simple rate limiter: ~2 req/s
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 500;

async function rateLimitedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, MIN_INTERVAL_MS - elapsed);
    });
  }
  lastRequestTime = Date.now();
  return fetch(url, init);
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
  const res = await rateLimitedFetch(`${BASE_URL}/series/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ search: query, per_page: perPage }),
  });
  if (!res.ok) {
    throw new Error(`MangaUpdates search failed: ${res.status}`);
  }
  const data = await res.json();
  return {
    totalHits: data.total_hits ?? 0,
    results: (data.results ?? []).map(
      (r: { record: MangaUpdatesSeriesResult }) => r.record,
    ),
  };
}

export async function getMangaUpdatesSeriesDetail(
  seriesId: number,
): Promise<MangaUpdatesSeriesDetail> {
  const res = await rateLimitedFetch(`${BASE_URL}/series/${seriesId}`);
  if (!res.ok) {
    throw new Error(`MangaUpdates series detail failed: ${res.status}`);
  }
  return res.json();
}

export async function getMangaUpdatesReleases(
  title: string,
  perPage = 100,
  page = 1,
): Promise<{
  totalHits: number;
  results: MangaUpdatesRelease[];
}> {
  const res = await rateLimitedFetch(`${BASE_URL}/releases/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ search: title, per_page: perPage, page }),
  });
  if (!res.ok) {
    throw new Error(`MangaUpdates releases search failed: ${res.status}`);
  }
  const data = await res.json();
  return {
    totalHits: data.total_hits ?? 0,
    results: (data.results ?? []).map(
      (r: { record: MangaUpdatesRelease }) => r.record,
    ),
  };
}

export async function getMangaUpdatesSeriesGroups(
  seriesId: number,
): Promise<MangaUpdatesGroup[]> {
  const res = await rateLimitedFetch(`${BASE_URL}/series/${seriesId}/groups`);
  if (!res.ok) {
    throw new Error(`MangaUpdates groups failed: ${res.status}`);
  }
  const data = await res.json();
  return data.group_list ?? [];
}
