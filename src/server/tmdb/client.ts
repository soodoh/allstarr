// oxlint-disable import/prefer-default-export -- named export used by TMDB server functions
import getMediaSetting from "../settings-reader";
import { createApiFetcher, ApiRateLimitError } from "../api-cache";

export { TMDB_IMAGE_BASE } from "./types";

const TMDB_API_BASE = "https://api.themoviedb.org/3";

function getTmdbApiKey(): string {
  return process.env.TMDB_TOKEN ?? "";
}

const tmdb = createApiFetcher({
  name: "tmdb",
  cache: { ttlMs: 5 * 60 * 1000, maxEntries: 500 },
  rateLimit: { maxRequests: 40, windowMs: 10_000 },
  retry: { maxRetries: 3, baseDelayMs: 2000 },
});

export async function tmdbFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    throw new Error("TMDB API key not configured");
  }

  const language = getMediaSetting<string>("metadata.tmdb.language", "en");
  const url = new URL(`${TMDB_API_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", language);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const cacheKey = url.toString();
  return tmdb.fetch<T>(cacheKey, async () => {
    const response = await fetch(cacheKey);
    if (response.status === 429) {
      throw new ApiRateLimitError("TMDB rate limit");
    }
    if (!response.ok) {
      throw new Error(
        `TMDB API error: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as T;
  });
}
