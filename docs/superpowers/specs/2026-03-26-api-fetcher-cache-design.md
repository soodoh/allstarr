# Unified API Fetcher with Cache, Rate Limiting, and Retry

## Problem

External API calls lack consistent caching, rate limiting, and retry logic:

- **TMDB**: Has a 5-minute in-memory cache and rate limiter, but no retry on 429. Cache uses lazy deletion only — expired entries linger in memory until re-accessed.
- **Hardcover**: No server-side cache at all. 13 inline `fetch()` calls in `search.ts` with no rate limiting. `import-queries.ts` has retry logic but no rate limiting. Preview-then-import flows make duplicate API calls for the same data.
- **Indexers/Download clients**: Confirmed not to need caching — search results are mutations needing fresh data, download status polling needs real-time accuracy.

## Solution

A `createApiFetcher` factory that encapsulates three cross-cutting concerns — caching, rate limiting, and retry — into a single reusable utility. Both TMDB and Hardcover clients become thin wrappers that own request construction and response parsing, delegating the middleware to the factory.

## Design

### `createApiFetcher` Factory

**File:** `src/server/api-cache.ts`

```ts
type ApiFetcherOptions = {
  name: string;
  cache: {
    ttlMs: number;
    maxEntries: number;
  };
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
  retry: {
    maxRetries: number;
    baseDelayMs: number;
  };
};

type ApiFetcher = {
  fetch<T>(key: string, fetchFn: () => Promise<T>): Promise<T>;
  clear(): void;
  size: number;
};

function createApiFetcher(options: ApiFetcherOptions): ApiFetcher;
```

**`fetch(key, fetchFn)` execution order:**

1. **Cache check** — if `key` exists and is not expired, return cached value (LRU promotion: delete + re-insert)
2. **Rate limit** — wait if the request window is full
3. **Execute `fetchFn()`** — caller-provided function that handles HTTP request construction, auth, and response parsing
4. **Retry on 429** — if `fetchFn` throws an error indicating a 429 status, retry with exponential backoff (`baseDelayMs * 2^attempt`), up to `maxRetries`
5. **Cache store** — store result with expiration timestamp; if at `maxEntries`, evict the least-recently-used entry (first Map key)
6. **Return** result

**429 detection:** `fetchFn` is responsible for throwing an error with a `status` property set to `429`. The factory checks `error.status === 429` to decide whether to retry vs re-throw.

### LRU Cache Implementation

Uses a plain `Map<string, { data: unknown; expires: number }>`:

- **Read (hit):** delete key, re-insert at end (promotes to most-recent)
- **Read (expired):** delete key, return undefined (cache miss)
- **Write (at capacity):** delete first key (least-recently-used), then insert
- **Periodic sweep:** `setInterval` runs every `ttlMs` to proactively delete all expired entries. Prevents memory leaks from entries that are cached during bulk operations and never re-accessed.
- **`clear()`:** empties the map and clears the sweep interval

### TMDB Integration

**File:** `src/server/tmdb/client.ts`

Replace the inline cache (lines 12-32) with:

```ts
import { createApiFetcher } from "../api-cache";

const tmdb = createApiFetcher({
  name: "tmdb",
  cache: { ttlMs: 5 * 60 * 1000, maxEntries: 500 },
  rateLimit: { maxRequests: 40, windowMs: 10_000 },
  retry: { maxRetries: 3, baseDelayMs: 2_000 },
});
```

`tmdbFetch()` becomes:

```ts
export async function tmdbFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const apiKey = getTmdbApiKey();
  if (!apiKey) throw new Error("TMDB API key not configured");

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
      const err = new Error("TMDB rate limit");
      (err as any).status = 429;
      throw err;
    }
    if (!response.ok) {
      throw new Error(
        `TMDB API error: ${response.status} ${response.statusText}`,
      );
    }
    return response.json() as Promise<T>;
  });
}
```

The inline `getCached()`, `setCache()`, `responseCache`, `requestTimestamps`, and `waitForRateLimit()` are all removed.

### Hardcover Integration

**New file:** `src/server/hardcover/client.ts`

Creates the fetcher instance and exports a `hardcoverFetch()` function:

```ts
import { createApiFetcher } from "../api-cache";

const HARDCOVER_GRAPHQL_URL =
  process.env.HARDCOVER_GRAPHQL_URL || "https://api.hardcover.app/v1/graphql";

const hardcover = createApiFetcher({
  name: "hardcover",
  cache: { ttlMs: 5 * 60 * 1000, maxEntries: 1_000 },
  rateLimit: { maxRequests: 60, windowMs: 60_000 },
  retry: { maxRetries: 5, baseDelayMs: 2_000 },
});

export async function hardcoverFetch<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const authorization = getAuthorizationHeader();
  const cacheKey = query + JSON.stringify(variables);

  return hardcover.fetch<T>(cacheKey, async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(HARDCOVER_GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 429) {
        const err = new Error("Hardcover rate limit");
        (err as any).status = 429;
        throw err;
      }
      const body = await response.json();
      if (!response.ok || body.errors?.length) {
        throw new Error(
          body.errors?.[0]?.message || `Hardcover: ${response.status}`,
        );
      }
      return body.data as T;
    } finally {
      clearTimeout(timeoutId);
    }
  });
}
```

**Refactoring `search.ts`:** Each of the 13 inline `fetch()` call sites is replaced with `hardcoverFetch(query, variables)`. The duplicated boilerplate (Authorization header, AbortController, `cache: "no-store"`, error checking, JSON parsing) is removed from each call site.

**Refactoring `import-queries.ts`:** The existing `hardcoverFetch()` function (which has its own retry loop) is replaced with the shared one from `hardcover/client.ts`. The retry logic moves into the factory.

### Shared helpers consolidation

`search.ts` and `import-queries.ts` both duplicate `getAuthorizationHeader()` and several helper functions (`toRecord`, `toRecordArray`, `firstString`). The `getAuthorizationHeader()` function moves into `hardcover/client.ts` alongside the fetch function. The data-mapping helpers are out of scope for this change.

## Configuration Summary

| Client    | Cache TTL | Max entries | Rate limit   | Retry              |
| --------- | --------- | ----------- | ------------ | ------------------ |
| TMDB      | 5 min     | 500         | 40 req / 10s | 3 retries, 2s base |
| Hardcover | 5 min     | 1,000       | 60 req / 60s | 5 retries, 2s base |

## Out of Scope

- **Indexers/download clients** — no caching needed (mutations, real-time polling)
- **React Query client-side caching** — untouched (30s staleTime continues to work)
- **Hardcover data-mapping helpers** — `toRecord`, `toRecordArray`, `firstString` deduplication is a separate cleanup
- **Persistent/disk-based caching** — in-memory is sufficient for a single-process self-hosted app
