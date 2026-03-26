# Unified API Fetcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a shared `createApiFetcher` factory with LRU cache, rate limiting, and retry — then migrate TMDB and Hardcover clients to use it.

**Architecture:** A single `createApiFetcher()` factory in `src/server/api-cache.ts` handles caching (LRU + TTL + periodic sweep), rate limiting (sliding window), and retry (exponential backoff on 429). TMDB and Hardcover each create an instance with their own config and wrap it in a thin client that owns HTTP request construction.

**Tech Stack:** TypeScript, vitest (new dev dependency for unit tests), Bun runtime

**Spec:** `docs/superpowers/specs/2026-03-26-api-fetcher-cache-design.md`

---

## File Map

| Action | File                                     | Responsibility                                                                                                                     |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Create | `src/server/api-cache.ts`                | `createApiFetcher` factory + `ApiRateLimitError` class                                                                             |
| Create | `src/server/__tests__/api-cache.test.ts` | Unit tests for the factory                                                                                                         |
| Modify | `src/server/tmdb/client.ts`              | Replace inline cache + rate limiter with factory instance                                                                          |
| Create | `src/server/hardcover/client.ts`         | `hardcoverFetch()` + `getAuthorizationHeader()` using factory                                                                      |
| Modify | `src/server/search.ts`                   | Replace 13 inline fetches with `hardcoverFetch()`, remove local auth helpers                                                       |
| Modify | `src/server/hardcover/import-queries.ts` | Replace `fetchGraphQL` + retry with `hardcoverFetch()`, remove `getAuthorizationHeader()`, drop `authorization` param from exports |
| Modify | `src/server/import.ts`                   | Drop `authorization` param from calls to import-queries functions                                                                  |
| Modify | `src/server/authors.ts`                  | Drop `authorization` param from call to `fetchSeriesComplete`                                                                      |
| Create | `vitest.config.ts`                       | Vitest configuration with tsconfig paths                                                                                           |
| Modify | `package.json`                           | Add vitest dev dependency + test script                                                                                            |

---

### Task 1: Set Up Vitest

**Files:**

- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

Run:

```bash
bun add -d vitest
```

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test script to package.json**

Add to the `"scripts"` section:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify vitest runs**

Run:

```bash
bun run test
```

Expected: vitest runs and reports "no test files found" (no tests exist yet).

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.config.ts bun.lock
git commit -m "chore: add vitest for unit testing"
```

---

### Task 2: Implement createApiFetcher — Cache Behavior (TDD)

**Files:**

- Create: `src/server/__tests__/api-cache.test.ts`
- Create: `src/server/api-cache.ts`

- [ ] **Step 1: Write failing cache tests**

Create `src/server/__tests__/api-cache.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApiFetcher, ApiRateLimitError } from "../api-cache";

function makeFetcher(overrides?: {
  ttlMs?: number;
  maxEntries?: number;
  maxRequests?: number;
  windowMs?: number;
}) {
  return createApiFetcher({
    name: "test",
    cache: {
      ttlMs: overrides?.ttlMs ?? 60_000,
      maxEntries: overrides?.maxEntries ?? 100,
    },
    rateLimit: {
      maxRequests: overrides?.maxRequests ?? 1000,
      windowMs: overrides?.windowMs ?? 1000,
    },
    retry: { maxRetries: 0, baseDelayMs: 100 },
  });
}

describe("createApiFetcher — cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns cached value on second call with same key", async () => {
    const fetcher = makeFetcher();
    const fetchFn = vi.fn().mockResolvedValue({ id: 1 });

    const first = await fetcher.fetch("key1", fetchFn);
    const second = await fetcher.fetch("key1", fetchFn);

    expect(first).toEqual({ id: 1 });
    expect(second).toEqual({ id: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("calls fetchFn again for different keys", async () => {
    const fetcher = makeFetcher();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce("a")
      .mockResolvedValueOnce("b");

    await fetcher.fetch("key1", fetchFn);
    await fetcher.fetch("key2", fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("expires entries after TTL", async () => {
    const fetcher = makeFetcher({ ttlMs: 1000 });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce("old")
      .mockResolvedValueOnce("new");

    await fetcher.fetch("key1", fetchFn);
    vi.advanceTimersByTime(1001);
    const result = await fetcher.fetch("key1", fetchFn);

    expect(result).toBe("new");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("evicts LRU entry when at max capacity", async () => {
    const fetcher = makeFetcher({ maxEntries: 2 });
    const fetchFn = vi.fn().mockImplementation((v) => Promise.resolve(v));

    await fetcher.fetch("a", () => Promise.resolve("val-a"));
    await fetcher.fetch("b", () => Promise.resolve("val-b"));
    await fetcher.fetch("c", () => Promise.resolve("val-c"));

    // "a" should have been evicted
    const refetchA = vi.fn().mockResolvedValue("val-a-new");
    const result = await fetcher.fetch("a", refetchA);
    expect(refetchA).toHaveBeenCalledTimes(1);
    expect(result).toBe("val-a-new");
  });

  it("promotes accessed entry in LRU order", async () => {
    const fetcher = makeFetcher({ maxEntries: 2 });

    await fetcher.fetch("a", () => Promise.resolve("val-a"));
    await fetcher.fetch("b", () => Promise.resolve("val-b"));
    // Access "a" again to promote it
    await fetcher.fetch("a", () => Promise.resolve("should-not-call"));
    // Insert "c" — should evict "b" (least recent), not "a"
    await fetcher.fetch("c", () => Promise.resolve("val-c"));

    const refetchB = vi.fn().mockResolvedValue("val-b-new");
    await fetcher.fetch("b", refetchB);
    expect(refetchB).toHaveBeenCalledTimes(1); // "b" was evicted

    const refetchA = vi.fn().mockResolvedValue("val-a-new");
    await fetcher.fetch("a", refetchA);
    expect(refetchA).not.toHaveBeenCalled(); // "a" still cached
  });

  it("periodic sweep clears expired entries", async () => {
    const fetcher = makeFetcher({ ttlMs: 1000 });

    await fetcher.fetch("a", () => Promise.resolve("val"));
    expect(fetcher.size).toBe(1);

    vi.advanceTimersByTime(1001); // Trigger sweep
    expect(fetcher.size).toBe(0);
  });

  it("clear() empties the cache", async () => {
    const fetcher = makeFetcher();
    await fetcher.fetch("a", () => Promise.resolve("val"));
    expect(fetcher.size).toBe(1);

    fetcher.clear();
    expect(fetcher.size).toBe(0);
  });

  it("reports size correctly", async () => {
    const fetcher = makeFetcher();
    expect(fetcher.size).toBe(0);
    await fetcher.fetch("a", () => Promise.resolve(1));
    expect(fetcher.size).toBe(1);
    await fetcher.fetch("b", () => Promise.resolve(2));
    expect(fetcher.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun run test
```

Expected: FAIL — module `../api-cache` not found.

- [ ] **Step 3: Write the cache implementation**

Create `src/server/api-cache.ts`:

```ts
type CacheEntry = {
  data: unknown;
  expires: number;
};

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
  readonly size: number;
};

export class ApiRateLimitError extends Error {
  readonly status = 429;
  constructor(message = "Rate limit exceeded") {
    super(message);
    this.name = "ApiRateLimitError";
  }
}

export function createApiFetcher(options: ApiFetcherOptions): ApiFetcher {
  const cache = new Map<string, CacheEntry>();
  const requestTimestamps: number[] = [];

  // Periodic sweep to free expired entries
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now > entry.expires) {
        cache.delete(key);
      }
    }
  }, options.cache.ttlMs);

  // Don't keep the process alive just for the sweep
  if (typeof sweepInterval === "object" && "unref" in sweepInterval) {
    sweepInterval.unref();
  }

  function getCached<T>(key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      cache.delete(key);
      return undefined;
    }
    // LRU promotion: move to end of Map iteration order
    cache.delete(key);
    cache.set(key, entry);
    return entry.data as T;
  }

  function setCache(key: string, data: unknown): void {
    if (cache.size >= options.cache.maxEntries) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) {
        cache.delete(firstKey);
      }
    }
    cache.set(key, { data, expires: Date.now() + options.cache.ttlMs });
  }

  async function waitForRateLimit(): Promise<void> {
    const now = Date.now();
    while (
      requestTimestamps.length > 0 &&
      now - requestTimestamps[0] >= options.rateLimit.windowMs
    ) {
      requestTimestamps.shift();
    }
    if (requestTimestamps.length >= options.rateLimit.maxRequests) {
      const oldest = requestTimestamps[0];
      const waitTime = options.rateLimit.windowMs - (now - oldest) + 100;
      await new Promise<void>((resolve) => setTimeout(resolve, waitTime));
    }
    requestTimestamps.push(Date.now());
  }

  async function fetchWithRetry<T>(fetchFn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt <= options.retry.maxRetries; attempt++) {
      try {
        return await fetchFn();
      } catch (error: unknown) {
        const isRateLimit =
          error instanceof ApiRateLimitError ||
          (error instanceof Error &&
            "status" in error &&
            (error as { status: number }).status === 429);
        if (isRateLimit && attempt < options.retry.maxRetries) {
          const delay = options.retry.baseDelayMs * 2 ** attempt;
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error(`${options.name}: retry limit exhausted`);
  }

  return {
    async fetch<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
      const cached = getCached<T>(key);
      if (cached !== undefined) return cached;
      await waitForRateLimit();
      const result = await fetchWithRetry(fetchFn);
      setCache(key, result);
      return result;
    },

    clear(): void {
      cache.clear();
      clearInterval(sweepInterval);
    },

    get size(): number {
      return cache.size;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun run test
```

Expected: All 8 cache tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/api-cache.ts src/server/__tests__/api-cache.test.ts
git commit -m "feat: add createApiFetcher with LRU cache (TDD)"
```

---

### Task 3: Implement createApiFetcher — Rate Limiting + Retry (TDD)

**Files:**

- Modify: `src/server/__tests__/api-cache.test.ts`
- Modify: `src/server/api-cache.ts` (already complete, tests validate behavior)

- [ ] **Step 1: Add rate limiting and retry tests**

Append to `src/server/__tests__/api-cache.test.ts`:

```ts
describe("createApiFetcher — rate limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the rate limit window", async () => {
    const fetcher = createApiFetcher({
      name: "test",
      cache: { ttlMs: 60_000, maxEntries: 100 },
      rateLimit: { maxRequests: 3, windowMs: 1000 },
      retry: { maxRetries: 0, baseDelayMs: 100 },
    });

    let callCount = 0;
    const fetchFn = () => {
      callCount++;
      return Promise.resolve(callCount);
    };

    await fetcher.fetch("a", fetchFn);
    await fetcher.fetch("b", fetchFn);
    await fetcher.fetch("c", fetchFn);

    expect(callCount).toBe(3);
  });

  it("delays requests when rate limit window is full", async () => {
    const fetcher = createApiFetcher({
      name: "test",
      cache: { ttlMs: 60_000, maxEntries: 100 },
      rateLimit: { maxRequests: 2, windowMs: 1000 },
      retry: { maxRetries: 0, baseDelayMs: 100 },
    });

    let callCount = 0;
    const fetchFn = () => {
      callCount++;
      return Promise.resolve(callCount);
    };

    await fetcher.fetch("a", fetchFn);
    await fetcher.fetch("b", fetchFn);

    // Third request should be delayed
    const thirdPromise = fetcher.fetch("c", fetchFn);
    expect(callCount).toBe(2); // Not yet called

    // Advance past the rate limit window
    vi.advanceTimersByTime(1100);
    await thirdPromise;
    expect(callCount).toBe(3);
  });
});

describe("createApiFetcher — retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries on ApiRateLimitError", async () => {
    const fetcher = createApiFetcher({
      name: "test",
      cache: { ttlMs: 60_000, maxEntries: 100 },
      rateLimit: { maxRequests: 1000, windowMs: 1000 },
      retry: { maxRetries: 2, baseDelayMs: 100 },
    });

    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new ApiRateLimitError())
      .mockResolvedValueOnce("success");

    const resultPromise = fetcher.fetch("key", fetchFn);
    // Advance past first retry delay (100ms * 2^0 = 100ms)
    await vi.advanceTimersByTimeAsync(150);
    const result = await resultPromise;

    expect(result).toBe("success");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries on error with status 429", async () => {
    const fetcher = createApiFetcher({
      name: "test",
      cache: { ttlMs: 60_000, maxEntries: 100 },
      rateLimit: { maxRequests: 1000, windowMs: 1000 },
      retry: { maxRetries: 2, baseDelayMs: 100 },
    });

    const err429 = new Error("rate limited");
    (err429 as any).status = 429;

    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(err429)
      .mockResolvedValueOnce("success");

    const resultPromise = fetcher.fetch("key", fetchFn);
    await vi.advanceTimersByTimeAsync(150);
    const result = await resultPromise;

    expect(result).toBe("success");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-429 errors", async () => {
    const fetcher = createApiFetcher({
      name: "test",
      cache: { ttlMs: 60_000, maxEntries: 100 },
      rateLimit: { maxRequests: 1000, windowMs: 1000 },
      retry: { maxRetries: 3, baseDelayMs: 100 },
    });

    const fetchFn = vi.fn().mockRejectedValue(new Error("network error"));

    await expect(fetcher.fetch("key", fetchFn)).rejects.toThrow(
      "network error",
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting all retries", async () => {
    const fetcher = createApiFetcher({
      name: "test",
      cache: { ttlMs: 60_000, maxEntries: 100 },
      rateLimit: { maxRequests: 1000, windowMs: 1000 },
      retry: { maxRetries: 2, baseDelayMs: 100 },
    });

    const fetchFn = vi.fn().mockRejectedValue(new ApiRateLimitError());

    const resultPromise = fetcher.fetch("key", fetchFn);
    // Advance past all retry delays (100ms + 200ms + buffer)
    await vi.advanceTimersByTimeAsync(500);

    await expect(resultPromise).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("uses exponential backoff", async () => {
    const fetcher = createApiFetcher({
      name: "test",
      cache: { ttlMs: 60_000, maxEntries: 100 },
      rateLimit: { maxRequests: 1000, windowMs: 1000 },
      retry: { maxRetries: 3, baseDelayMs: 1000 },
    });

    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new ApiRateLimitError()) // attempt 0
      .mockRejectedValueOnce(new ApiRateLimitError()) // attempt 1
      .mockResolvedValueOnce("success"); // attempt 2

    const resultPromise = fetcher.fetch("key", fetchFn);

    // After 999ms: only initial attempt should have been called
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // After 1000ms (base * 2^0): first retry fires
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    // After 2000ms more (base * 2^1): second retry fires
    await vi.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result).toBe("success");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run:

```bash
bun run test
```

Expected: All tests PASS (implementation was completed in Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/server/__tests__/api-cache.test.ts
git commit -m "test: add rate limiting and retry tests for createApiFetcher"
```

---

### Task 4: Refactor TMDB Client

**Files:**

- Modify: `src/server/tmdb/client.ts`

- [ ] **Step 1: Replace inline cache and rate limiter**

Replace the full contents of `src/server/tmdb/client.ts` with:

```ts
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
  retry: { maxRetries: 3, baseDelayMs: 2_000 },
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
```

This removes: `responseCache` Map, `CACHE_TTL`, `getCached()`, `setCache()`, `requestTimestamps`, `RATE_LIMIT`, `RATE_WINDOW`, `waitForRateLimit()`.

- [ ] **Step 2: Verify build**

Run:

```bash
bun run build
```

Expected: Build succeeds. No imports of the removed internal functions exist (confirmed during exploration — only `tmdbFetch` is exported/imported).

- [ ] **Step 3: Commit**

```bash
git add src/server/tmdb/client.ts
git commit -m "refactor: migrate TMDB client to createApiFetcher"
```

---

### Task 5: Create Hardcover Client

**Files:**

- Create: `src/server/hardcover/client.ts`

- [ ] **Step 1: Create the Hardcover client**

Create `src/server/hardcover/client.ts`:

```ts
import { createApiFetcher, ApiRateLimitError } from "../api-cache";

const HARDCOVER_GRAPHQL_URL =
  process.env.HARDCOVER_GRAPHQL_URL || "https://api.hardcover.app/v1/graphql";
const REQUEST_TIMEOUT_MS = 30_000;

const hardcover = createApiFetcher({
  name: "hardcover",
  cache: { ttlMs: 5 * 60 * 1000, maxEntries: 1_000 },
  rateLimit: { maxRequests: 60, windowMs: 60_000 },
  retry: { maxRetries: 5, baseDelayMs: 2_000 },
});

export function getAuthorizationHeader(): string {
  const rawToken = process.env.HARDCOVER_TOKEN?.trim();
  if (!rawToken) {
    throw new Error("HARDCOVER_TOKEN is not configured.");
  }
  return rawToken.startsWith("Bearer ") ? rawToken : `Bearer ${rawToken}`;
}

export async function hardcoverFetch<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const authorization = getAuthorizationHeader();
  const cacheKey = query + JSON.stringify(variables);

  return hardcover.fetch<T>(cacheKey, async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
        throw new ApiRateLimitError("Hardcover rate limit");
      }
      const rawText = await response.text();
      let body: { data?: T; errors?: Array<{ message: string }> };
      try {
        body = JSON.parse(rawText);
      } catch {
        throw new Error(
          `Hardcover API returned non-JSON (status ${response.status})`,
        );
      }
      if (!response.ok) {
        throw new Error(
          `Hardcover API request failed (status ${response.status}).`,
        );
      }
      if (body.errors && body.errors.length > 0) {
        throw new Error(body.errors[0]?.message || "Hardcover API error.");
      }
      if (!body.data) {
        throw new Error("No data in Hardcover API response.");
      }
      return body.data;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Hardcover API request timed out.", { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  });
}
```

- [ ] **Step 2: Verify build**

Run:

```bash
bun run build
```

Expected: Build succeeds. The new file has no consumers yet.

- [ ] **Step 3: Commit**

```bash
git add src/server/hardcover/client.ts
git commit -m "feat: add Hardcover client with caching, rate limiting, and retry"
```

---

### Task 6: Refactor search.ts Fetch Calls

**Files:**

- Modify: `src/server/search.ts`

This task replaces all 13 inline `fetch(HARDCOVER_GRAPHQL_URL, ...)` calls with `hardcoverFetch()` and removes the local auth helpers. Each call site follows the same transformation pattern.

**Transformation pattern:**

Before (each call site, ~15-20 lines):

```ts
const authorization = getAuthorizationHeader();
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30_000);
try {
  const response = await fetch(HARDCOVER_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authorization },
    body: JSON.stringify({ query: SOME_QUERY, variables: { ... } }),
    signal: controller.signal,
    cache: "no-store",
  });
  const body = (await response.json()) as SomeType;
  if (!response.ok) { throw new Error("..."); }
  if (body.errors?.length > 0) { throw new Error(body.errors[0]?.message || "..."); }
  // Use body.data?.something
} finally {
  clearTimeout(timeoutId);
}
```

After (1-3 lines):

```ts
const result = await hardcoverFetch<{ something: unknown }>(SOME_QUERY, { ... });
// Use result?.something directly (hardcoverFetch returns body.data)
```

- [ ] **Step 1: Add import and remove local auth helpers**

At the top of `search.ts`, add:

```ts
import { hardcoverFetch } from "./hardcover/client";
```

Remove these local functions (lines 922-932):

- `getHardcoverToken()`
- `getAuthorizationHeader()`

Also remove the `HARDCOVER_GRAPHQL_URL` constant (line 9-10) since it's now in `hardcover/client.ts`.

Remove all `const authorization = getAuthorizationHeader();` lines throughout the file (lines 2116, 2150, 2166, 2301, 2526, 2626, 2785).

- [ ] **Step 2: Refactor fetchSeriesBooks (line ~780)**

Before: inline fetch at lines 780-806, accesses `body.data?.series_by_pk` and `body.data?.book_series`.

Replace the fetch block with:

```ts
const body = await hardcoverFetch<{
  series_by_pk: unknown;
  book_series: unknown;
}>(
  buildSeriesBooksQuery(
    langCodes,
    profile.minimumPopularity,
    profile.minimumPages,
  ),
  {
    seriesId,
    langCodes,
    ...(profile.minimumPopularity > 0
      ? { minPopularity: profile.minimumPopularity }
      : {}),
    ...(profile.minimumPages > 0 ? { minPages: profile.minimumPages } : {}),
  },
);
```

Then update data access: `body.data?.series_by_pk` → `body?.series_by_pk`, `body.data?.book_series` → `body?.book_series`. Remove the AbortController, try/finally, response.ok check, and errors check.

- [ ] **Step 3: Refactor applyLanguageFilter (line ~1338)**

Replace the fetch block with:

```ts
const body = await hardcoverFetch<{ books: unknown }>(bookLanguageFilterQuery, {
  ids: bookIds,
  langCodes: languages,
});
```

Update access: `body.data?.books` → `body?.books`.

- [ ] **Step 4: Refactor applyIsbnAsinFilter (line ~1395)**

Replace the fetch block with:

```ts
const body = await hardcoverFetch<{ books: unknown }>(bookIsbnAsinFilterQuery, {
  ids: bookIds,
});
```

Update access: `body.data?.books` → `body?.books`.

- [ ] **Step 5: Refactor applyPagesFilter (line ~1453)**

Replace the fetch block with:

```ts
const body = await hardcoverFetch<{ books: unknown }>(bookPagesFilterQuery, {
  ids: bookIds,
  minPages,
});
```

Update access: `body.data?.books` → `body?.books`.

- [ ] **Step 6: Refactor applyAuthorBookCounts (line ~1613)**

Replace the fetch block with:

```ts
const body = await hardcoverFetch<Record<string, unknown>>(
  countQuery,
  variables,
);
```

Update access: `body.data?.[key]` → `body?.[key]`.

- [ ] **Step 7: Refactor applyBookContributors (line ~1704)**

Replace the fetch block with:

```ts
const body = await hardcoverFetch<Record<string, unknown>>(contribQuery, {});
```

Update access: `body.data?.[key]` → `body?.[key]`.

- [ ] **Step 8: Refactor fetchSearchResults (line ~1768)**

Replace the fetch block with:

```ts
const body = await hardcoverFetch<{ search: unknown }>(searchQuery, {
  query,
  queryType,
  perPage: requestLimit,
  page: 1,
});
```

Update access: `body.data?.search?.results` → `body?.search?.results`.

- [ ] **Step 9: Refactor fetchAuthorBooksPage (line ~1909)**

Replace the fetch block with:

```ts
const body = await hardcoverFetch<{ books: unknown; books_aggregate: unknown }>(
  buildAuthorBooksPageQuery(
    langCodes,
    profile.minimumPopularity,
    profile.minimumPages,
  ),
  {
    slug,
    limit,
    offset,
    orderBy,
    langCodes,
    ...(profile.minimumPopularity > 0
      ? { minPopularity: profile.minimumPopularity }
      : {}),
    ...(profile.minimumPages > 0 ? { minPages: profile.minimumPages } : {}),
  },
);
```

Update access: `body.data?.books` → `body?.books`, `body.data?.books_aggregate` → `body?.books_aggregate`.

- [ ] **Step 10: Refactor fetchAuthorDetails (line ~1980)**

Replace the fetch block with:

```ts
const body = await hardcoverFetch<{ authors: unknown; editions: unknown }>(
  authorDetailsMetaQuery,
  { authorId },
);
```

Update access: `body.data?.authors` → `body?.authors`, `body.data?.editions` → `body?.editions`.

- [ ] **Step 11: Refactor fetchAuthorSeries (line ~2196)**

Replace the fetch block with:

```ts
const body = await hardcoverFetch<{ series: unknown }>(
  buildAuthorSeriesQuery(
    langCodes,
    profile.minimumPopularity,
    profile.minimumPages,
  ),
  {
    slug,
    ...(langCodes.length > 0 ? { langCodes } : {}),
    ...(profile.minimumPopularity > 0
      ? { minPopularity: profile.minimumPopularity }
      : {}),
    ...(profile.minimumPages > 0 ? { minPages: profile.minimumPages } : {}),
  },
);
```

Update access: `body.data?.series` → `body?.series`.

- [ ] **Step 12: Refactor fetchBookEditions (line ~2383)**

Replace the fetch block with:

```ts
const body = await hardcoverFetch<{ books: unknown[]; editions: unknown }>(
  bookEditionsQuery,
  { bookId: foreignBookId, limit, offset, orderBy },
);
```

Update access: `body.data?.books[0]` → `body?.books?.[0]`, `body.data?.editions` → `body?.editions`.

- [ ] **Step 13: Refactor fetchBookEditionLanguages (line ~2562)**

Replace the fetch block with:

```ts
const body = await hardcoverFetch<{ editions: unknown }>(
  bookEditionLanguagesQuery,
  { bookId: foreignBookId },
);
```

Update access: `body.data?.editions` → `body?.editions`.

- [ ] **Step 14: Refactor fetchSingleBook (line ~2685)**

Replace the fetch block with:

```ts
const body = await hardcoverFetch<{ books: unknown[] }>(singleBookQuery, {
  bookId,
});
```

Update access: `body.data?.books[0]` → `body?.books?.[0]`.

- [ ] **Step 15: Verify build**

Run:

```bash
bun run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 16: Commit**

```bash
git add src/server/search.ts
git commit -m "refactor: migrate search.ts to shared hardcoverFetch client"
```

---

### Task 7: Refactor import-queries.ts

**Files:**

- Modify: `src/server/hardcover/import-queries.ts`
- Modify: `src/server/import.ts`
- Modify: `src/server/authors.ts`

- [ ] **Step 1: Replace fetchGraphQL with hardcoverFetch in import-queries.ts**

Add import at top:

```ts
import { hardcoverFetch } from "./client";
```

Remove these items:

- `HARDCOVER_GRAPHQL_URL` constant (line 18-19)
- `REQUEST_TIMEOUT_MS` constant (line 20)
- `MAX_RETRIES` constant (line 22)
- `fetchGraphQL` function (lines 118-179)
- `getAuthorizationHeader` function (lines 181-187)

Keep these constants (used by `fetchBatchedEditions` for batching logic):

- `EDITIONS_BATCH_SIZE` (line 21)
- `BATCH_DELAY_MS` (line 23)
- `EDITIONS_CONCURRENCY` (line 24)

- [ ] **Step 2: Update fetchAuthorComplete**

Remove the `authorization` parameter. Change signature from:

```ts
export async function fetchAuthorComplete(
  authorId: number,
  authorization: string,
): Promise<{ author: HardcoverRawAuthor; books: HardcoverRawBook[] }>;
```

To:

```ts
export async function fetchAuthorComplete(
  authorId: number,
): Promise<{ author: HardcoverRawAuthor; books: HardcoverRawBook[] }>;
```

Replace `fetchGraphQL` calls:

Line ~347:

```ts
const firstPage = await hardcoverFetch<{
  authors: unknown;
  books: unknown;
  books_aggregate: unknown;
}>(AUTHOR_COMPLETE_QUERY, { authorId, limit: BATCH_SIZE, offset: 0 });
```

Line ~385:

```ts
const page = await hardcoverFetch<{ books: unknown }>(AUTHOR_COMPLETE_QUERY, {
  authorId,
  limit: BATCH_SIZE,
  offset,
});
```

- [ ] **Step 3: Update fetchSeriesComplete**

Remove the `authorization` parameter. Change signature from:

```ts
export async function fetchSeriesComplete(
  seriesIds: number[],
  authorization: string,
  langCodes: string[],
  excludeAuthorId: number,
): Promise<HardcoverRawSeries[]>;
```

To:

```ts
export async function fetchSeriesComplete(
  seriesIds: number[],
  langCodes: string[],
  excludeAuthorId: number,
): Promise<HardcoverRawSeries[]>;
```

Replace `fetchGraphQL` call at line ~484:

```ts
const data = await hardcoverFetch<{ series: unknown }>(SERIES_COMPLETE_QUERY, {
  seriesIds,
  langCodes,
  excludeAuthorId,
});
```

- [ ] **Step 4: Update fetchBatchedEditions**

Remove the `authorization` parameter. Change signature from:

```ts
export async function fetchBatchedEditions(
  bookIds: number[],
  authorization: string,
): Promise<Map<number, HardcoverRawEdition[]>>;
```

To:

```ts
export async function fetchBatchedEditions(
  bookIds: number[],
): Promise<Map<number, HardcoverRawEdition[]>>;
```

Replace `fetchGraphQL` call at line ~774:

```ts
const data = await hardcoverFetch<Record<string, unknown>>(query, {});
```

- [ ] **Step 5: Update fetchBookComplete**

Remove the `authorization` parameter. Change signature from:

```ts
export async function fetchBookComplete(
  foreignBookId: number,
  authorization: string,
): Promise<...>
```

To:

```ts
export async function fetchBookComplete(
  foreignBookId: number,
): Promise<...>
```

Replace `fetchGraphQL` call at line ~869:

```ts
const data = await hardcoverFetch<{ books: unknown; editions: unknown }>(
  BOOK_COMPLETE_QUERY,
  { bookId: foreignBookId },
);
```

- [ ] **Step 6: Update callers in import.ts**

Update the import statement to remove `getAuthorizationHeader`:

```ts
import {
  fetchAuthorComplete,
  fetchBatchedEditions,
  fetchBookComplete,
} from "./hardcover/import-queries";
```

Remove all `const authorization = getAuthorizationHeader();` lines (lines ~451, ~869, ~1139, ~1745, ~2095).

Remove the `authorization` argument from every call:

- `fetchAuthorComplete(data.foreignAuthorId, authorization)` → `fetchAuthorComplete(data.foreignAuthorId)`
- `fetchBatchedEditions(authorBookIds, authorization)` → `fetchBatchedEditions(authorBookIds)`
- `fetchBookComplete(data.foreignBookId, authorization)` → `fetchBookComplete(data.foreignBookId)`
- `fetchBookComplete(foreignBookId, authorization)` → `fetchBookComplete(foreignBookId)`

Repeat for all call sites listed in the grep results (lines 464, 471, 882, 1156, 1163, 1756, 2096).

- [ ] **Step 7: Update callers in authors.ts**

Update the import statement:

```ts
import { fetchSeriesComplete } from "./hardcover/import-queries";
```

Remove `getAuthorizationHeader` from the import and the `const authorization = getAuthorizationHeader();` line (line ~582).

Update the call at line ~585:

```ts
const rawSeries = await fetchSeriesComplete(
  data.foreignSeriesIds,
  langCodes,
  excludeAuthorId,
);
```

(Removed `authorization` as second argument — `langCodes` shifts up.)

- [ ] **Step 8: Verify build**

Run:

```bash
bun run build
```

Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/server/hardcover/import-queries.ts src/server/import.ts src/server/authors.ts
git commit -m "refactor: migrate Hardcover import queries to shared client"
```

---

### Task 8: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run unit tests**

Run:

```bash
bun run test
```

Expected: All createApiFetcher tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
bun run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Run E2E tests (if available)**

Run:

```bash
bun run test:e2e
```

Expected: All E2E tests pass. The Hardcover fake server in E2E fixtures should work identically since the HTTP interface hasn't changed.

- [ ] **Step 4: Commit any remaining changes**

If linting or formatting changes were made during the build, commit them:

```bash
git add -A
git commit -m "chore: lint and format fixes"
```
