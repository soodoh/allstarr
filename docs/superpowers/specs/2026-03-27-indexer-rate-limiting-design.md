# Indexer Rate Limiting Design

## Problem

Allstarr searches multiple indexers (Newznab, Torznab, Prowlarr-synced) for wanted books, movies, and episodes. With hundreds of monitored entities, each requiring tiered searches (up to 4 queries per indexer per item), a single auto-search cycle can generate thousands of API calls. Common indexers enforce strict rate limits — some as low as 5-25 API hits/day on free tiers — and exceeding them can result in temporary or permanent bans.

The current system has basic retry-on-429 logic but no proactive rate limiting:

- No per-indexer request pacing
- No daily cap tracking
- No shared state across scheduled tasks, auto-search, and manual search — each operates independently
- Repeated 429s across task boundaries cause cascading failures
- Prowlarr does not configure rate limits by default and does not sync limit values to consuming apps

The \*arr ecosystem (Sonarr, Radarr) explicitly does not address this — they rely on Prowlarr to enforce limits and react to 429s. Allstarr should be better.

## Design

### Four Layers of Protection

1. **Pacing** — configurable `requestInterval` per indexer (default 5s) enforces minimum delay between requests
2. **Daily caps** — configurable `dailyQueryLimit` and `dailyGrabLimit` per indexer (default 0 = unlimited, user must configure based on their indexer tier)
3. **Shared backoff** — 429 responses set a `backoffUntil` timestamp persisted to DB, immediately visible to all consumers (scheduled tasks, auto-search, manual search)
4. **Escalating cooldown** — repeated 429s across any consumer increase backoff duration: `min(30min * 2^escalationLevel, 24h)`

### Data Model

#### New columns on `indexers` and `syncedIndexers` tables

**Configuration (user-editable):**

| Column            | Type    | Default | Purpose                                             |
| ----------------- | ------- | ------- | --------------------------------------------------- |
| `requestInterval` | integer | 5000    | Minimum ms between requests to this indexer         |
| `dailyQueryLimit` | integer | 0       | Max API hits per rolling 24h window (0 = unlimited) |
| `dailyGrabLimit`  | integer | 0       | Max grabs per rolling 24h window (0 = unlimited)    |

**Status (system-managed):**

| Column            | Type    | Default | Purpose                                           |
| ----------------- | ------- | ------- | ------------------------------------------------- |
| `backoffUntil`    | integer | 0       | Epoch ms — do not query before this time          |
| `escalationLevel` | integer | 0       | Tracks repeated 429s, increases cooldown duration |

#### In-memory rate state

A `Map<string, IndexerRateState>` keyed by `"manual:${id}"` or `"synced:${id}"`:

```ts
type IndexerRateState = {
  queriesInWindow: number;
  grabsInWindow: number;
  windowStart: number; // epoch ms — start of current 24h window
  lastQueryAt: number; // epoch ms — for pacing enforcement
};
```

This state resets on server restart, which is acceptable — pacing still protects on restart, and persisted `backoffUntil` catches hard failures.

#### New column on entity tables

| Table      | Column           | Type               | Default | Purpose                                     |
| ---------- | ---------------- | ------------------ | ------- | ------------------------------------------- |
| `books`    | `lastSearchedAt` | integer (epoch ms) | null    | When auto-search last searched this book    |
| `movies`   | `lastSearchedAt` | integer (epoch ms) | null    | When auto-search last searched this movie   |
| `episodes` | `lastSearchedAt` | integer (epoch ms) | null    | When auto-search last searched this episode |

### Rate Limiter Logic

#### Central gate function

Called before every indexer request:

```
canQueryIndexer(indexerId, type) -> { allowed: boolean, waitMs?: number }
```

1. **Check persisted backoff** — if `now < backoffUntil`, return `{ allowed: false, waitMs: backoffUntil - now }`
2. **Check pacing** — if `now - lastQueryAt < requestInterval`, return `{ allowed: false, waitMs: remainder }`
3. **Check daily cap** — if `dailyQueryLimit > 0` and `queriesInWindow >= dailyQueryLimit`, return `{ allowed: false }` (skip indexer entirely)
4. Otherwise -> `{ allowed: true }`, increment counter, update `lastQueryAt`

A parallel `canGrabIndexer()` function checks `dailyGrabLimit` before grabs.

**Tiered search counting:** Each tier query (up to 4 per indexer per item) counts as a separate API hit against the daily limit and pacing. If an indexer is exhausted mid-tier, remaining tiers for that indexer are skipped — other indexers continue.

#### On 429 response

1. Increment `escalationLevel`
2. Calculate backoff: `Retry-After` header if present, otherwise `min(30min * 2^escalationLevel, 24h)`
3. Persist `backoffUntil` and `escalationLevel` to DB
4. Immediately affects all consumers — no task needs to discover the limit independently

#### Escalation reset

When a successful request is made to an indexer, reset `escalationLevel` to 0 and clear `backoffUntil` in DB.

### Search Prioritization

Wanted items are sorted before each cycle:

1. **Never searched** (`lastSearchedAt` is null) — highest priority
2. **Longest since last search** — oldest `lastSearchedAt` first
3. **Active monitoring** — items where the author/show has `monitorNew*` enabled get a boost

`lastSearchedAt` is updated after searching an item, regardless of whether results were found.

### Search Cycle Behavior

```
1. Get all wanted items (books, movies, episodes)
2. Sort by priority (never searched first, then oldest lastSearchedAt)
3. For each item:
   a. Check which indexers are still available (not exhausted)
   b. If NO indexers available -> stop cycle early, log reason
   c. Search available indexers, skip exhausted ones
   d. Update lastSearchedAt
4. Log cycle summary: "searched X/Y items, Z indexers exhausted"
```

**Scheduled task awareness:**

- Before starting a cycle, check if any indexers have active backoffs — if ALL indexers are in backoff, postpone the cycle
- RSS sync interval remains configurable (default 30 min), but cycles self-limit based on available indexer budget

### Manual Search Behavior

Manual/interactive searches (user clicks "search" in the UI):

- **Respect pacing** (`requestInterval`) — still enforced
- **Bypass daily caps** — the user explicitly requested the search
- **Show warning** in the UI when near the daily limit: "NZBGeek: 95/100 queries used today"

### UI Changes

#### Per-indexer settings

On the indexer edit form (both manual and synced), add a "Rate Limiting" section under Advanced:

- **Request Interval** — number input in seconds (stored as ms). Label: "Minimum delay between requests"
- **Daily Query Limit** — number input. Label: "Maximum API hits per day (0 = unlimited)"
- **Daily Grab Limit** — number input. Label: "Maximum grabs per day (0 = unlimited)"
- Helper text: "Check your indexer's account settings for your API limits"

#### Indexer status indicators

On the Settings > Indexers list, show current status per indexer:

- **Green** — available
- **Yellow** — pacing (between requests)
- **Red** — in backoff, with time remaining (e.g., "Rate limited — available in 23m")
- **Grey** — daily limit reached, with reset time (e.g., "Daily limit reached — resets in 6h")

#### Search cycle feedback

On System > Tasks or activity log:

- "RSS Sync: searched 142/200 books, 3 indexers available, 1 exhausted (NZBGeek: daily limit)"

### Default Values Rationale

| Setting           | Default       | Why                                                                                                                                                     |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestInterval` | 5000ms        | Conservative pacing that won't trigger per-request limits on any known indexer. 1 req/5s = 720/hour, well under even strict per-minute limits.          |
| `dailyQueryLimit` | 0 (unlimited) | Cannot know the user's indexer tier. Requiring explicit configuration ensures users set the correct value rather than silently hitting a wrong default. |
| `dailyGrabLimit`  | 0 (unlimited) | Same reasoning as daily query limit.                                                                                                                    |

### Prowlarr Considerations

- Prowlarr proxies both NZB and torrent indexers via Torznab — Allstarr cannot distinguish underlying indexer type for synced indexers
- Prowlarr has per-indexer query/grab limits but they default to 0 (unlimited)
- Prowlarr does not sync limit values to consuming apps — only priority, seed ratio, and seed time are synced
- Prowlarr enforces limits server-side and returns HTTP 429 when exceeded (fixed in Prowlarr PR #1417)
- Allstarr treats all indexers uniformly regardless of whether they are direct or Prowlarr-proxied — this provides protection even when Prowlarr has no limits configured
