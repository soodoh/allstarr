# Indexer Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add proactive per-indexer rate limiting with pacing, daily caps, shared backoff across all consumers, and search prioritization.

**Architecture:** A rate limiter module (`src/server/indexer-rate-limiter.ts`) acts as a central gate for all indexer requests. It combines in-memory request tracking with DB-persisted backoff state. The auto-search cycle sorts wanted items by search priority and skips exhausted indexers.

**Tech Stack:** Drizzle ORM (SQLite), TypeScript, React (shadcn/ui forms)

**Spec:** `docs/superpowers/specs/2026-03-27-indexer-rate-limiting-design.md`

---

## File Map

| Action | File                                                              | Responsibility                                                                          |
| ------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Modify | `src/db/schema/indexers.ts`                                       | Add rate limit config + status columns to `indexers` table                              |
| Modify | `src/db/schema/synced-indexers.ts`                                | Add rate limit config + status columns to `syncedIndexers` table                        |
| Modify | `src/db/schema/books.ts`                                          | Add `lastSearchedAt` column                                                             |
| Modify | `src/db/schema/movies.ts`                                         | Add `lastSearchedAt` column                                                             |
| Modify | `src/db/schema/shows.ts`                                          | Add `lastSearchedAt` column to `episodes` table                                         |
| Create | `drizzle/NNNN_*.sql`                                              | Migration for new columns (auto-generated)                                              |
| Create | `src/server/indexer-rate-limiter.ts`                              | Central rate limiter: gate function, backoff persistence, in-memory counters            |
| Modify | `src/server/auto-search.ts`                                       | Integrate rate limiter into search loops, add priority sorting, update `lastSearchedAt` |
| Modify | `src/server/indexers.ts`                                          | Integrate rate limiter into `searchAllIndexers` and `grabReleaseFn`                     |
| Modify | `src/server/indexers/http.ts`                                     | Report 429s to rate limiter instead of local-only retry                                 |
| Modify | `src/server/scheduler/tasks/rss-sync.ts`                          | Check indexer availability before starting cycle, enhanced logging                      |
| Modify | `src/lib/validators.ts`                                           | Add rate limit fields to indexer schemas                                                |
| Modify | `src/components/settings/indexers/indexer-form.tsx`               | Add rate limit fields to manual indexer form                                            |
| Modify | `src/components/settings/indexers/synced-indexer-view-dialog.tsx` | Add rate limit fields to synced indexer dialog                                          |
| Modify | `src/components/settings/indexers/indexer-list.tsx`               | Add status indicators to indexer list                                                   |
| Modify | `src/server/indexers.ts`                                          | Add server function to expose rate limiter status for UI                                |

---

### Task 1: Add rate limit columns to indexer schemas

**Files:**

- Modify: `src/db/schema/indexers.ts`
- Modify: `src/db/schema/synced-indexers.ts`

- [ ] **Step 1: Add columns to `indexers` table**

In `src/db/schema/indexers.ts`, add these columns inside the `sqliteTable` definition, after the `downloadClientId` column and before `createdAt`:

```typescript
  // Rate limiting — configuration
  requestInterval: integer("request_interval").notNull().default(5000),
  dailyQueryLimit: integer("daily_query_limit").notNull().default(0),
  dailyGrabLimit: integer("daily_grab_limit").notNull().default(0),
  // Rate limiting — status (system-managed)
  backoffUntil: integer("backoff_until").notNull().default(0),
  escalationLevel: integer("escalation_level").notNull().default(0),
```

- [ ] **Step 2: Add columns to `syncedIndexers` table**

In `src/db/schema/synced-indexers.ts`, add the same columns inside the `sqliteTable` definition, after the `downloadClientId` column and before `createdAt`:

```typescript
  // Rate limiting — configuration
  requestInterval: integer("request_interval").notNull().default(5000),
  dailyQueryLimit: integer("daily_query_limit").notNull().default(0),
  dailyGrabLimit: integer("daily_grab_limit").notNull().default(0),
  // Rate limiting — status (system-managed)
  backoffUntil: integer("backoff_until").notNull().default(0),
  escalationLevel: integer("escalation_level").notNull().default(0),
```

- [ ] **Step 3: Add `lastSearchedAt` to entity tables**

In `src/db/schema/books.ts`, add before `createdAt`:

```typescript
  lastSearchedAt: integer("last_searched_at"),
```

In `src/db/schema/movies.ts`, add before `createdAt`:

```typescript
  lastSearchedAt: integer("last_searched_at"),
```

In `src/db/schema/shows.ts`, add to the `episodes` table before the closing `})`:

```typescript
  lastSearchedAt: integer("last_searched_at"),
```

- [ ] **Step 4: Generate and apply migration**

Run:

```bash
bun run db:generate
```

Then apply:

```bash
bun run db:migrate
```

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/indexers.ts src/db/schema/synced-indexers.ts src/db/schema/books.ts src/db/schema/movies.ts src/db/schema/shows.ts drizzle/
git commit -m "feat: add rate limit columns to indexer and entity schemas"
```

---

### Task 2: Create the rate limiter module

**Files:**

- Create: `src/server/indexer-rate-limiter.ts`

- [ ] **Step 1: Create the rate limiter module**

Create `src/server/indexer-rate-limiter.ts` with the following implementation:

```typescript
// oxlint-disable no-console -- Rate-limiter logs are intentional server-side diagnostics
import { db } from "src/db";
import { indexers, syncedIndexers } from "src/db/schema";
import { eq } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

type IndexerType = "manual" | "synced";

type IndexerRateState = {
  queriesInWindow: number;
  grabsInWindow: number;
  windowStart: number;
  lastQueryAt: number;
};

type RateConfig = {
  requestInterval: number;
  dailyQueryLimit: number;
  dailyGrabLimit: number;
};

type GateResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "backoff" | "pacing" | "daily_query_limit" | "daily_grab_limit";
      waitMs?: number;
    };

export type IndexerStatus = {
  indexerId: number;
  indexerType: IndexerType;
  available: boolean;
  reason?: "backoff" | "pacing" | "daily_query_limit" | "daily_grab_limit";
  waitMs?: number;
  queriesUsed: number;
  grabsUsed: number;
  dailyQueryLimit: number;
  dailyGrabLimit: number;
  backoffUntil: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000; // 24 hours
const BASE_ESCALATION_MS = 30 * 60 * 1000; // 30 minutes

// ─── In-memory state ─────────────────────────────────────────────────────────

const rateState = new Map<string, IndexerRateState>();

function stateKey(indexerType: IndexerType, indexerId: number): string {
  return `${indexerType}:${indexerId}`;
}

function getOrCreateState(key: string): IndexerRateState {
  let state = rateState.get(key);
  if (!state) {
    state = {
      queriesInWindow: 0,
      grabsInWindow: 0,
      windowStart: Date.now(),
      lastQueryAt: 0,
    };
    rateState.set(key, state);
  }
  // Reset window if expired
  if (Date.now() - state.windowStart > WINDOW_MS) {
    state.queriesInWindow = 0;
    state.grabsInWindow = 0;
    state.windowStart = Date.now();
  }
  return state;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

function getBackoff(
  indexerType: IndexerType,
  indexerId: number,
): { backoffUntil: number; escalationLevel: number } {
  const table = indexerType === "manual" ? indexers : syncedIndexers;
  const row = db
    .select({
      backoffUntil: table.backoffUntil,
      escalationLevel: table.escalationLevel,
    })
    .from(table)
    .where(eq(table.id, indexerId))
    .get();
  return row ?? { backoffUntil: 0, escalationLevel: 0 };
}

function getRateConfig(
  indexerType: IndexerType,
  indexerId: number,
): RateConfig {
  const table = indexerType === "manual" ? indexers : syncedIndexers;
  const row = db
    .select({
      requestInterval: table.requestInterval,
      dailyQueryLimit: table.dailyQueryLimit,
      dailyGrabLimit: table.dailyGrabLimit,
    })
    .from(table)
    .where(eq(table.id, indexerId))
    .get();
  return (
    row ?? { requestInterval: 5000, dailyQueryLimit: 0, dailyGrabLimit: 0 }
  );
}

function persistBackoff(
  indexerType: IndexerType,
  indexerId: number,
  backoffUntil: number,
  escalationLevel: number,
): void {
  const table = indexerType === "manual" ? indexers : syncedIndexers;
  db.update(table)
    .set({ backoffUntil, escalationLevel })
    .where(eq(table.id, indexerId))
    .run();
}

// ─── Gate functions ──────────────────────────────────────────────────────────

export function canQueryIndexer(
  indexerType: IndexerType,
  indexerId: number,
): GateResult {
  const now = Date.now();

  // 1. Check persisted backoff
  const { backoffUntil } = getBackoff(indexerType, indexerId);
  if (backoffUntil > 0 && now < backoffUntil) {
    return { allowed: false, reason: "backoff", waitMs: backoffUntil - now };
  }

  const config = getRateConfig(indexerType, indexerId);
  const key = stateKey(indexerType, indexerId);
  const state = getOrCreateState(key);

  // 2. Check pacing
  const elapsed = now - state.lastQueryAt;
  if (state.lastQueryAt > 0 && elapsed < config.requestInterval) {
    return {
      allowed: false,
      reason: "pacing",
      waitMs: config.requestInterval - elapsed,
    };
  }

  // 3. Check daily query cap
  if (
    config.dailyQueryLimit > 0 &&
    state.queriesInWindow >= config.dailyQueryLimit
  ) {
    return { allowed: false, reason: "daily_query_limit" };
  }

  // Allowed — update pacing timestamp only (counter is incremented per HTTP call via recordQuery)
  state.lastQueryAt = now;
  return { allowed: true };
}

/** Record an actual HTTP query against the daily counter. Called per-request in fetchNewznabFeed. */
export function recordQuery(indexerType: IndexerType, indexerId: number): void {
  const key = stateKey(indexerType, indexerId);
  const state = getOrCreateState(key);
  state.queriesInWindow += 1;
  state.lastQueryAt = Date.now();
}

export function canGrabIndexer(
  indexerType: IndexerType,
  indexerId: number,
): GateResult {
  const config = getRateConfig(indexerType, indexerId);
  if (config.dailyGrabLimit <= 0) {
    return { allowed: true };
  }
  const key = stateKey(indexerType, indexerId);
  const state = getOrCreateState(key);
  if (state.grabsInWindow >= config.dailyGrabLimit) {
    return { allowed: false, reason: "daily_grab_limit" };
  }
  state.grabsInWindow += 1;
  return { allowed: true };
}

// ─── 429 handling ────────────────────────────────────────────────────────────

export function reportRateLimited(
  indexerType: IndexerType,
  indexerId: number,
  retryAfterMs?: number,
): void {
  const { escalationLevel } = getBackoff(indexerType, indexerId);
  const newLevel = escalationLevel + 1;
  const escalatedMs = Math.min(
    BASE_ESCALATION_MS * 2 ** escalationLevel,
    MAX_BACKOFF_MS,
  );
  const backoffMs =
    retryAfterMs && retryAfterMs > 0 ? retryAfterMs : escalatedMs;
  const backoffUntil = Date.now() + backoffMs;

  persistBackoff(indexerType, indexerId, backoffUntil, newLevel);
  console.log(
    `[rate-limiter] ${indexerType}:${indexerId} rate-limited, backoff until ${new Date(backoffUntil).toISOString()} (level ${newLevel})`,
  );
}

export function reportSuccess(
  indexerType: IndexerType,
  indexerId: number,
): void {
  const { escalationLevel, backoffUntil } = getBackoff(indexerType, indexerId);
  if (escalationLevel > 0 || backoffUntil > 0) {
    persistBackoff(indexerType, indexerId, 0, 0);
  }
}

// ─── Non-mutating status queries ─────────────────────────────────────────────

/** Check indexer availability without incrementing counters. */
function peekStatus(indexerType: IndexerType, indexerId: number): GateResult {
  const now = Date.now();

  const { backoffUntil } = getBackoff(indexerType, indexerId);
  if (backoffUntil > 0 && now < backoffUntil) {
    return { allowed: false, reason: "backoff", waitMs: backoffUntil - now };
  }

  const config = getRateConfig(indexerType, indexerId);
  const key = stateKey(indexerType, indexerId);
  const state = getOrCreateState(key);

  if (
    state.lastQueryAt > 0 &&
    now - state.lastQueryAt < config.requestInterval
  ) {
    return {
      allowed: false,
      reason: "pacing",
      waitMs: config.requestInterval - (now - state.lastQueryAt),
    };
  }

  if (
    config.dailyQueryLimit > 0 &&
    state.queriesInWindow >= config.dailyQueryLimit
  ) {
    return { allowed: false, reason: "daily_query_limit" };
  }

  return { allowed: true };
}

export function getIndexerStatus(
  indexerType: IndexerType,
  indexerId: number,
): IndexerStatus {
  const config = getRateConfig(indexerType, indexerId);
  const { backoffUntil } = getBackoff(indexerType, indexerId);
  const key = stateKey(indexerType, indexerId);
  const state = getOrCreateState(key);

  const gate = peekStatus(indexerType, indexerId);

  return {
    indexerId,
    indexerType,
    available: gate.allowed,
    reason: gate.allowed ? undefined : gate.reason,
    waitMs: gate.allowed ? undefined : gate.waitMs,
    queriesUsed: state.queriesInWindow,
    grabsUsed: state.grabsInWindow,
    dailyQueryLimit: config.dailyQueryLimit,
    dailyGrabLimit: config.dailyGrabLimit,
    backoffUntil,
  };
}

export function anyIndexerAvailable(
  manualIds: number[],
  syncedIds: number[],
): boolean {
  for (const id of manualIds) {
    const gate = peekStatus("manual", id);
    if (gate.allowed || gate.reason === "pacing") return true;
  }
  for (const id of syncedIds) {
    const gate = peekStatus("synced", id);
    if (gate.allowed || gate.reason === "pacing") return true;
  }
  return false;
}

export function getAllIndexerStatuses(
  manualIds: number[],
  syncedIds: number[],
): IndexerStatus[] {
  return [
    ...manualIds.map((id) => getIndexerStatus("manual", id)),
    ...syncedIds.map((id) => getIndexerStatus("synced", id)),
  ];
}
```

- [ ] **Step 2: Verify the module compiles**

Run:

```bash
bunx tsc --noEmit src/server/indexer-rate-limiter.ts 2>&1 | head -20
```

If there are type errors, fix them.

- [ ] **Step 3: Commit**

```bash
git add src/server/indexer-rate-limiter.ts
git commit -m "feat: add indexer rate limiter module with pacing, daily caps, and shared backoff"
```

---

### Task 3: Integrate rate limiter into indexer search flow

**Files:**

- Modify: `src/server/indexers/http.ts`
- Modify: `src/server/indexers.ts`

- [ ] **Step 1: Update `fetchWithRetry` to report 429s to rate limiter**

In `src/server/indexers/http.ts`, add the import at the top:

```typescript
import {
  reportRateLimited,
  reportSuccess,
  recordQuery,
} from "../indexer-rate-limiter";
```

Update the `fetchWithRetry` function signature to accept indexer identity:

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  indexerIdentity?: { indexerType: "manual" | "synced"; indexerId: number },
): Promise<Response> {
```

After the 429 check on line 309, add rate limiter reporting:

```typescript
if (res.status !== 429 || attempt === MAX_RETRIES) {
  if (res.ok && indexerIdentity) {
    reportSuccess(indexerIdentity.indexerType, indexerIdentity.indexerId);
  }
  return res;
}
const retryAfter = parseRetryAfter(res);
if (indexerIdentity) {
  reportRateLimited(
    indexerIdentity.indexerType,
    indexerIdentity.indexerId,
    retryAfter || undefined,
  );
}
const backoff = retryAfter || BASE_BACKOFF_MS * 2 ** attempt;
```

- [ ] **Step 2: Pass indexer identity through `fetchNewznabFeed` and `searchNewznab`**

Update `fetchNewznabFeed` to accept and forward `indexerIdentity`:

```typescript
async function fetchNewznabFeed(
  feed: NewznabFeedConfig,
  params: URLSearchParams,
  indexerIdentity?: { indexerType: "manual" | "synced"; indexerId: number },
): Promise<CoalescedResult[]> {
```

Before calling `fetchWithRetry`, record the query against the daily counter:

```typescript
// Record each HTTP call against the daily counter (tiered search makes multiple calls)
if (indexerIdentity) {
  recordQuery(indexerIdentity.indexerType, indexerIdentity.indexerId);
}

const res = await fetchWithRetry(
  url,
  { headers: { Accept: "application/xml" } },
  60_000,
  indexerIdentity,
);
```

Update `searchNewznab` to accept and forward `indexerIdentity`:

```typescript
export async function searchNewznab(
  feed: NewznabFeedConfig,
  query: string,
  categories: number[] = [],
  bookParams?: BookSearchParams,
  indexerIdentity?: { indexerType: "manual" | "synced"; indexerId: number },
): Promise<CoalescedResult[]> {
```

Pass it through to `fetchNewznabFeed` in both the non-book and book search paths:

```typescript
if (!bookParams) {
  return fetchNewznabFeed(feed, makeParams("search", query), indexerIdentity);
}
// ...
return runTieredSearch(tiers, (params) =>
  fetchNewznabFeed(feed, params, indexerIdentity),
);
```

- [ ] **Step 3: Integrate rate limiter gate into `searchAllIndexers` in `src/server/indexers.ts`**

Add import at the top of `src/server/indexers.ts`:

```typescript
import { canQueryIndexer, canGrabIndexer } from "./indexer-rate-limiter";
```

Add an `interactive` parameter to `searchAllIndexers` to distinguish manual from automatic searches. Interactive searches respect pacing but bypass daily caps (per spec):

```typescript
async function searchAllIndexers(
  enabledSynced: Array<typeof syncedIndexers.$inferSelect>,
  enabledManual: Array<typeof indexers.$inferSelect>,
  query: string,
  categories: number[],
  bookParams?: BookSearchParams,
  interactive = false,
): Promise<{ releases: IndexerRelease[]; warnings: string[] }> {
```

Replace the hardcoded `DELAY_BETWEEN_INDEXERS` sleep with rate limiter pacing. For each indexer in the loop, before calling `searchNewznab`, add a gate check. For interactive searches, only enforce pacing:

For synced indexers (the loop starting at line 665):

```typescript
  for (let i = 0; i < syncedWithKey.length; i += 1) {
    const synced = syncedWithKey[i];

    // Rate limiter gate — interactive searches bypass daily caps
    const gate = canQueryIndexer("synced", synced.id);
    if (!gate.allowed) {
      if (gate.reason === "pacing" && gate.waitMs) {
        await sleep(gate.waitMs);
      } else if (!interactive) {
        warnings.push(`Indexer "${synced.name}" skipped: ${gate.reason}`);
        continue;
      }
      // Interactive: skip only backoff, allow daily cap bypass
      if (gate.reason === "backoff") {
        warnings.push(`Indexer "${synced.name}" in backoff, skipping`);
        continue;
      }
    }

    try {
      const results = await prowlarrHttp.searchNewznab(
        {
          baseUrl: synced.baseUrl,
          apiPath: synced.apiPath ?? "/api",
          apiKey: synced.apiKey!,
        },
        query,
        categories,
        bookParams,
        { indexerType: "synced", indexerId: synced.id },
      );
```

Apply the same pattern for manual indexers (the loop starting at line 698):

```typescript
  for (let i = 0; i < enabledManual.length; i += 1) {
    const ix = enabledManual[i];

    // Rate limiter gate — same interactive bypass logic
    const gate = canQueryIndexer("manual", ix.id);
    if (!gate.allowed) {
      if (gate.reason === "pacing" && gate.waitMs) {
        await sleep(gate.waitMs);
      } else if (!interactive) {
        warnings.push(`Indexer "${ix.name}" skipped: ${gate.reason}`);
        continue;
      }
      if (gate.reason === "backoff") {
        warnings.push(`Indexer "${ix.name}" in backoff, skipping`);
        continue;
      }
    }

    try {
      const results = await prowlarrHttp.searchNewznab(
        {
          baseUrl: ix.baseUrl,
          apiPath: ix.apiPath ?? "/api",
          apiKey: ix.apiKey,
        },
        query,
        categories,
        bookParams,
        { indexerType: "manual", indexerId: ix.id },
      );
```

Remove the `DELAY_BETWEEN_INDEXERS` constant and the `sleep(DELAY_BETWEEN_INDEXERS)` calls — pacing is now handled by the rate limiter gate.

- [ ] **Step 4: Pass `interactive: true` from `searchIndexersFn`**

In the `searchIndexersFn` handler (line 734), where it calls `searchAllIndexers`, pass `interactive: true`:

```typescript
const { releases, warnings } = await searchAllIndexers(
  enabledSynced,
  enabledManual,
  query,
  categories,
  bookParams,
  true, // interactive — bypass daily caps
);
```

- [ ] **Step 5: Integrate rate limiter into `grabReleaseFn`**

In `src/server/indexers.ts`, add `canGrabIndexer` to the import:

```typescript
import { canQueryIndexer, canGrabIndexer } from "./indexer-rate-limiter";
```

In `grabReleaseFn` (line 881), after `await requireAuth()`, add a grab limit check:

```typescript
const grabGate = canGrabIndexer(
  data.indexerSource as "manual" | "synced",
  data.indexerId,
);
if (!grabGate.allowed) {
  throw new Error("Indexer daily grab limit reached");
}
```

- [ ] **Step 6: Apply same rate limiter integration to the duplicate search loop in `auto-search.ts`**

In `src/server/auto-search.ts`, add import:

```typescript
import { canQueryIndexer } from "./indexer-rate-limiter";
```

In `searchAndGrabForBook` (line 761), the search loops at lines 789-855 follow the same pattern as `searchAllIndexers`. Apply the same gate check pattern — for each indexer, check `canQueryIndexer` before searching, wait on pacing, skip on backoff/daily limit.

Pass `indexerIdentity` to `searchNewznab` calls:

For synced indexers (line 792):

```typescript
const results = await searchNewznab(
  {
    baseUrl: synced.baseUrl,
    apiPath: synced.apiPath ?? "/api",
    apiKey: synced.apiKey!,
  },
  query,
  categories,
  bookParams,
  { indexerType: "synced", indexerId: synced.id },
);
```

For manual indexers (line 826):

```typescript
const results = await searchNewznab(
  { baseUrl: ix.baseUrl, apiPath: ix.apiPath ?? "/api", apiKey: ix.apiKey },
  query,
  categories,
  bookParams,
  { indexerType: "manual", indexerId: ix.id },
);
```

Remove the `DELAY_BETWEEN_INDEXERS` constant and `sleep` calls from auto-search — pacing is handled by the rate limiter.

- [ ] **Step 7: Verify compilation**

Run:

```bash
bun run build 2>&1 | tail -20
```

- [ ] **Step 8: Commit**

```bash
git add src/server/indexers/http.ts src/server/indexers.ts src/server/auto-search.ts
git commit -m "feat: integrate rate limiter into indexer search and grab flows"
```

---

### Task 4: Add search prioritization and cycle improvements

**Files:**

- Modify: `src/server/auto-search.ts`
- Modify: `src/server/scheduler/tasks/rss-sync.ts`

- [ ] **Step 1: Add priority sorting to wanted items**

In `src/server/auto-search.ts`, add a sort function after the existing `getWantedBooks` / `getWantedMovies` / `getWantedEpisodes` functions:

```typescript
function sortBySearchPriority<T extends { id: number }>(
  items: T[],
  getLastSearched: (item: T) => number | null,
): T[] {
  return [...items].sort((a, b) => {
    const aLast = getLastSearched(a);
    const bLast = getLastSearched(b);
    // Never searched first
    if (aLast === null && bLast !== null) return -1;
    if (aLast !== null && bLast === null) return 1;
    if (aLast === null && bLast === null) return 0;
    // Oldest search first
    return aLast! - bLast!;
  });
}
```

- [ ] **Step 2: Update `getWantedBooks` to include `lastSearchedAt`**

In the `getWantedBooks` function, add `books.lastSearchedAt` to the select fields and include it in the `WantedBook` type:

Add to the `WantedBook` type:

```typescript
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
```

Where the book row is read from the DB, include `lastSearchedAt` in the select and pass it through to the `WantedBook` object.

Apply the same pattern to `WantedMovie` and `WantedEpisode` types and their respective `getWanted*` functions.

- [ ] **Step 3: Sort wanted items before processing**

In `runAutoSearch`, after getting wanted items and before processing, sort them:

```typescript
let wantedBooks = getWantedBooks();
// ... existing bookIds filter and maxBooks slice ...
wantedBooks = sortBySearchPriority(wantedBooks, (b) => b.lastSearchedAt);
```

Same for movies and episodes:

```typescript
const wantedMovies = sortBySearchPriority(
  getWantedMovies(),
  (m) => m.lastSearchedAt,
);
const wantedEpisodes = sortBySearchPriority(
  getWantedEpisodes(),
  (e) => e.lastSearchedAt,
);
```

- [ ] **Step 4: Update `lastSearchedAt` after searching each item**

In `processWantedBooks`, after `searchAndGrabForBook` completes (whether it found results or not), update the book's `lastSearchedAt`:

```typescript
    try {
      const detail = await searchAndGrabForBook(book, ixs);
      // Update lastSearchedAt regardless of result
      db.update(books)
        .set({ lastSearchedAt: Date.now() })
        .where(eq(books.id, book.id))
        .run();
```

Apply the same pattern in `processWantedMovies` (update `movies.lastSearchedAt`) and `processWantedEpisodes` (update `episodes.lastSearchedAt`).

- [ ] **Step 5: Add early cycle termination when all indexers exhausted**

In `processWantedBooks`, `processWantedMovies`, and `processWantedEpisodes`, add an `anyIndexerAvailable` check at the start of each iteration:

Import at the top of `auto-search.ts`:

```typescript
import { canQueryIndexer, anyIndexerAvailable } from "./indexer-rate-limiter";
```

In each `processWanted*` loop, before searching:

```typescript
// Check if any indexers are still available
if (
  !anyIndexerAvailable(
    ixs.manual.map((m) => m.id),
    ixs.synced.map((s) => s.id),
  )
) {
  console.log("[auto-search] All indexers exhausted, stopping cycle early");
  break;
}
```

- [ ] **Step 6: Update RSS sync task with pre-check and enhanced logging**

In `src/server/scheduler/tasks/rss-sync.ts`, add import:

```typescript
import { anyIndexerAvailable } from "../../indexer-rate-limiter";
import { db } from "src/db";
import { indexers, syncedIndexers } from "src/db/schema";
import { eq, asc } from "drizzle-orm";
```

Before calling `runAutoSearch`, check if any indexers are available:

```typescript
  handler: async (): Promise<TaskResult> => {
    // Check if any indexers are available before starting
    const enabledManual = db.select({ id: indexers.id }).from(indexers)
      .where(eq(indexers.enableRss, true)).all();
    const enabledSynced = db.select({ id: syncedIndexers.id }).from(syncedIndexers)
      .where(eq(syncedIndexers.enableRss, true)).all();

    if (!anyIndexerAvailable(
      enabledManual.map((m) => m.id),
      enabledSynced.map((s) => s.id),
    )) {
      return { success: true, message: "All indexers in backoff or exhausted, skipping cycle" };
    }

    const result = await runAutoSearch({ delayBetweenBooks: 2000 });
```

Update the result message to include indexer exhaustion info:

```typescript
const parts: string[] = [`${plural(result.searched, "item")} searched`];
if (result.grabbed > 0) {
  parts.push(`${plural(result.grabbed, "release")} grabbed`);
}
if (result.errors > 0) {
  parts.push(`${plural(result.errors, "error")}`);
}
```

- [ ] **Step 7: Verify compilation**

Run:

```bash
bun run build 2>&1 | tail -20
```

- [ ] **Step 8: Commit**

```bash
git add src/server/auto-search.ts src/server/scheduler/tasks/rss-sync.ts
git commit -m "feat: add search prioritization, cycle termination, and enhanced RSS sync logging"
```

---

### Task 5: Update validators and server functions

**Files:**

- Modify: `src/lib/validators.ts`
- Modify: `src/server/indexers.ts`

- [ ] **Step 1: Add rate limit fields to indexer validators**

In `src/lib/validators.ts`, add rate limit fields to `createIndexerSchema` (after the `downloadClientId` field):

```typescript
  requestInterval: z.number().int().min(1000).default(5000),
  dailyQueryLimit: z.number().int().min(0).default(0),
  dailyGrabLimit: z.number().int().min(0).default(0),
```

These will automatically be included in `updateIndexerSchema` since it extends `createIndexerSchema`.

- [ ] **Step 2: Add rate limit fields to synced indexer update schema**

In `src/lib/validators.ts`, add rate limit fields to `updateSyncedIndexerSchema`:

```typescript
export const updateSyncedIndexerSchema = z.object({
  id: z.number(),
  tag: z.string().nullable().default(null),
  downloadClientId: z.number().nullable(),
  requestInterval: z.number().int().min(1000).default(5000),
  dailyQueryLimit: z.number().int().min(0).default(0),
  dailyGrabLimit: z.number().int().min(0).default(0),
});
```

- [ ] **Step 3: Update `updateSyncedIndexerFn` server function to persist rate limit fields**

In `src/server/indexers.ts`, find the `updateSyncedIndexerFn` handler. Update the `.set()` call to include rate limit fields:

```typescript
db.update(syncedIndexers)
  .set({
    tag: data.tag,
    downloadClientId: data.downloadClientId,
    requestInterval: data.requestInterval,
    dailyQueryLimit: data.dailyQueryLimit,
    dailyGrabLimit: data.dailyGrabLimit,
  })
  .where(eq(syncedIndexers.id, data.id))
  .run();
```

- [ ] **Step 4: Add server function to get indexer rate limit statuses**

In `src/server/indexers.ts`, add a new server function:

```typescript
import { getAllIndexerStatuses } from "./indexer-rate-limiter";

export const getIndexerStatusesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();

    const manualIds = db
      .select({ id: indexers.id })
      .from(indexers)
      .all()
      .map((r) => r.id);
    const syncedIds = db
      .select({ id: syncedIndexers.id })
      .from(syncedIndexers)
      .all()
      .map((r) => r.id);

    return getAllIndexerStatuses(manualIds, syncedIds);
  },
);
```

- [ ] **Step 5: Verify compilation**

Run:

```bash
bun run build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/validators.ts src/server/indexers.ts
git commit -m "feat: add rate limit fields to validators and server functions"
```

---

### Task 6: Update UI — indexer forms

**Files:**

- Modify: `src/components/settings/indexers/indexer-form.tsx`
- Modify: `src/components/settings/indexers/synced-indexer-view-dialog.tsx`

- [ ] **Step 1: Add rate limit fields to manual indexer form**

In `src/components/settings/indexers/indexer-form.tsx`, add rate limit fields to the `IndexerFormValues` type:

```typescript
export type IndexerFormValues = {
  // ... existing fields ...
  requestInterval: number;
  dailyQueryLimit: number;
  dailyGrabLimit: number;
};
```

Add default values in the form initialization (wherever defaults are set):

```typescript
  requestInterval: 5,   // Display as seconds, stored as ms
  dailyQueryLimit: 0,
  dailyGrabLimit: 0,
```

Add a "Rate Limiting" section to the form JSX, after the existing Download Client field and before the action buttons:

```tsx
{
  /* Rate Limiting */
}
<div className="space-y-3">
  <h4 className="text-sm font-medium text-muted-foreground">Rate Limiting</h4>

  <div className="grid grid-cols-3 gap-3">
    <div className="space-y-2">
      <Label htmlFor="requestInterval">Request Interval (s)</Label>
      <Input
        id="requestInterval"
        type="number"
        min={1}
        value={values.requestInterval}
        onChange={(e) =>
          setValues((v) => ({
            ...v,
            requestInterval: Number(e.target.value),
          }))
        }
      />
      <p className="text-xs text-muted-foreground">
        Minimum delay between requests
      </p>
    </div>

    <div className="space-y-2">
      <Label htmlFor="dailyQueryLimit">Daily Query Limit</Label>
      <Input
        id="dailyQueryLimit"
        type="number"
        min={0}
        value={values.dailyQueryLimit}
        onChange={(e) =>
          setValues((v) => ({
            ...v,
            dailyQueryLimit: Number(e.target.value),
          }))
        }
      />
      <p className="text-xs text-muted-foreground">
        Max API hits per day (0 = unlimited)
      </p>
    </div>

    <div className="space-y-2">
      <Label htmlFor="dailyGrabLimit">Daily Grab Limit</Label>
      <Input
        id="dailyGrabLimit"
        type="number"
        min={0}
        value={values.dailyGrabLimit}
        onChange={(e) =>
          setValues((v) => ({
            ...v,
            dailyGrabLimit: Number(e.target.value),
          }))
        }
      />
      <p className="text-xs text-muted-foreground">
        Max grabs per day (0 = unlimited)
      </p>
    </div>
  </div>

  <p className="text-xs text-muted-foreground">
    Check your indexer's account settings for your API limits.
  </p>
</div>;
```

In the form submission handler, convert `requestInterval` from seconds to ms before sending to the server:

```typescript
  requestInterval: values.requestInterval * 1000,
```

When loading existing values for edit, convert ms to seconds:

```typescript
  requestInterval: (indexer.requestInterval ?? 5000) / 1000,
```

- [ ] **Step 2: Add rate limit fields to synced indexer dialog**

In `src/components/settings/indexers/synced-indexer-view-dialog.tsx`, add state for rate limit fields:

```typescript
const [requestInterval, setRequestInterval] = useState(5);
const [dailyQueryLimit, setDailyQueryLimit] = useState(0);
const [dailyGrabLimit, setDailyGrabLimit] = useState(0);
```

Update the `useEffect` to load values from the indexer:

```typescript
useEffect(() => {
  if (indexer) {
    setDownloadClientId(indexer.downloadClientId ?? null);
    setTag(indexer.tag ?? "");
    setRequestInterval((indexer.requestInterval ?? 5000) / 1000);
    setDailyQueryLimit(indexer.dailyQueryLimit ?? 0);
    setDailyGrabLimit(indexer.dailyGrabLimit ?? 0);
  }
}, [indexer]);
```

Update the `onSave` callback type and call to include rate limit fields:

```typescript
type SyncedIndexerEditDialogProps = {
  indexer: SyncedIndexer | null;
  downloadClients?: DownloadClient[];
  onSave: (
    id: number,
    downloadClientId: number | null,
    tag: string | null,
    requestInterval: number,
    dailyQueryLimit: number,
    dailyGrabLimit: number,
  ) => void;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
};
```

Add the rate limit form fields in the JSX, after the Tag field and before the Actions:

```tsx
{
  /* Rate Limiting */
}
<div className="space-y-3">
  <h4 className="text-sm font-medium text-muted-foreground">Rate Limiting</h4>
  <div className="grid grid-cols-3 gap-3">
    <div className="space-y-2">
      <Label htmlFor="synced-requestInterval">Request Interval (s)</Label>
      <Input
        id="synced-requestInterval"
        type="number"
        min={1}
        value={requestInterval}
        onChange={(e) => setRequestInterval(Number(e.target.value))}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="synced-dailyQueryLimit">Daily Query Limit</Label>
      <Input
        id="synced-dailyQueryLimit"
        type="number"
        min={0}
        value={dailyQueryLimit}
        onChange={(e) => setDailyQueryLimit(Number(e.target.value))}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="synced-dailyGrabLimit">Daily Grab Limit</Label>
      <Input
        id="synced-dailyGrabLimit"
        type="number"
        min={0}
        value={dailyGrabLimit}
        onChange={(e) => setDailyGrabLimit(Number(e.target.value))}
      />
    </div>
  </div>
  <p className="text-xs text-muted-foreground">
    Check your indexer's account settings for your API limits. 0 = unlimited.
  </p>
</div>;
```

Update the Save button onClick to pass rate limit values:

```typescript
  onClick={() =>
    onSave(
      indexer.id,
      downloadClientId,
      tag || null,
      requestInterval * 1000,
      dailyQueryLimit,
      dailyGrabLimit,
    )
  }
```

- [ ] **Step 3: Update the parent component that calls `onSave` for synced indexers**

Find where `SyncedIndexerEditDialog` is used (in `indexer-list.tsx` or the settings page) and update the `onSave` handler to pass the new fields to `updateSyncedIndexerFn`.

- [ ] **Step 4: Verify compilation**

Run:

```bash
bun run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/indexers/
git commit -m "feat: add rate limit settings to indexer forms"
```

---

### Task 7: Add indexer status indicators to the list

**Files:**

- Modify: `src/components/settings/indexers/indexer-list.tsx`

- [ ] **Step 1: Fetch and display indexer status**

In `src/components/settings/indexers/indexer-list.tsx`, import the status server function:

```typescript
import { getIndexerStatusesFn } from "src/server/indexers";
```

Add a query to fetch statuses (using whatever data-fetching pattern the component currently uses — likely `useQuery` or loaded via route loader).

Add a "Status" column to the indexer table. For each indexer, look up its status from the fetched data and render a badge:

```tsx
function IndexerStatusBadge({ status }: { status: IndexerStatus | undefined }) {
  if (!status) return null;

  if (status.available) {
    return (
      <Badge variant="default" className="bg-green-600">
        Available
      </Badge>
    );
  }

  switch (status.reason) {
    case "backoff":
      return (
        <Badge variant="destructive">
          Rate limited — {status.waitMs ? formatDuration(status.waitMs) : ""}
        </Badge>
      );
    case "daily_query_limit":
      return (
        <Badge variant="secondary">
          Daily limit reached ({status.queriesUsed}/{status.dailyQueryLimit})
        </Badge>
      );
    case "daily_grab_limit":
      return (
        <Badge variant="secondary">
          Grab limit reached ({status.grabsUsed}/{status.dailyGrabLimit})
        </Badge>
      );
    case "pacing":
      return (
        <Badge variant="default" className="bg-yellow-600">
          Pacing
        </Badge>
      );
    default:
      return null;
  }
}

function formatDuration(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
```

- [ ] **Step 2: Verify compilation**

Run:

```bash
bun run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/indexers/indexer-list.tsx
git commit -m "feat: add rate limit status indicators to indexer list"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full build**

```bash
bun run build
```

- [ ] **Step 2: Run dev server and test manually**

```bash
bun run dev
```

Verify:

1. Navigate to Settings > Indexers — rate limit fields visible on edit forms
2. Status column shows "Available" for healthy indexers
3. Create/edit an indexer with custom rate limit values — values persist

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address rate limiting integration issues"
```
