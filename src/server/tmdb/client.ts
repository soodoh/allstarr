// oxlint-disable import/prefer-default-export -- named export used by TMDB server functions
import getMediaSetting from "../settings-reader";

export { TMDB_IMAGE_BASE } from "./types";

const TMDB_API_BASE = "https://api.themoviedb.org/3";

function getTmdbApiKey(): string {
  return process.env.TMDB_TOKEN ?? "";
}

// In-memory response cache (5-minute TTL)
// Prevents duplicate TMDB API calls when previewing episode groups
// and then importing the same show.
const responseCache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | undefined {
  const entry = responseCache.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() > entry.expires) {
    responseCache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  responseCache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

// Rate limiter: max 40 requests per 10 seconds
let requestTimestamps: number[] = [];
const RATE_LIMIT = 40;
const RATE_WINDOW = 10_000;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((t) => now - t < RATE_WINDOW);
  if (requestTimestamps.length >= RATE_LIMIT) {
    const oldestInWindow = requestTimestamps[0];
    const waitTime = RATE_WINDOW - (now - oldestInWindow) + 100;
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), waitTime);
    });
  }
  requestTimestamps.push(Date.now());
}

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
  const cached = getCached<T>(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  await waitForRateLimit();

  const response = await fetch(cacheKey);
  if (!response.ok) {
    throw new Error(
      `TMDB API error: ${response.status} ${response.statusText}`,
    );
  }
  const data = (await response.json()) as T;
  setCache(cacheKey, data);
  return data;
}
