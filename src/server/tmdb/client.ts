// oxlint-disable import/prefer-default-export -- named export used by TMDB server functions
import getMediaSetting from "../settings-reader";

export { TMDB_IMAGE_BASE } from "./types";

const TMDB_API_BASE = "https://api.themoviedb.org/3";

function getTmdbApiKey(): string {
  return getMediaSetting<string>("metadata.tmdb.apiKey", "");
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

  await waitForRateLimit();

  const language = getMediaSetting<string>("metadata.tmdb.language", "en");
  const url = new URL(`${TMDB_API_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", language);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(
      `TMDB API error: ${response.status} ${response.statusText}`,
    );
  }
  return response.json() as Promise<T>;
}
