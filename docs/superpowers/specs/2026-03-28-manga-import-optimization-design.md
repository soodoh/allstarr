# Manga Import Optimization

## Problem

Importing large manga series (e.g., One Piece with ~1,100 chapters) takes 1-2 minutes. Three bottlenecks contribute:

1. **Bug**: The MangaUpdates API field `perpage` is sent as `per_page`, silently falling back to 40 results/page instead of 100
2. **Wasted pagination**: The fetch loop uses `totalHits` from the text search (all series matching the title), not the target series — fetching dozens of pages with zero relevant results
3. **Individual DB inserts**: Each chapter is inserted with its own `INSERT` statement (~1,100 statements for One Piece)

## Changes

### 1. Fix `perpage` field name

**File:** `src/server/manga-updates.ts` — `fetchReleasesPage()`

Change the request body field from `per_page: 100` to `perpage: 100`. The MangaUpdates API uses `perpage` (no underscore) in request bodies. The current code silently falls back to the 40/page default.

**Impact:** ~60% fewer API requests for large series.

### 2. Early termination on empty pages

**File:** `src/server/manga-updates.ts` — `getAllMangaUpdatesReleases()`

After client-side filtering by `series_id`, track consecutive pages with zero matches. Stop after 3 consecutive empty pages instead of continuing to `totalHits`.

This handles the common case where the text search returns thousands of hits across multiple series, but the target series' releases are concentrated in earlier pages. The threshold of 3 provides a safety margin for sparse patches.

**Impact:** Avoids fetching 10-30+ irrelevant tail pages for popular titles.

### 3. Batch chapter inserts

**File:** `src/server/manga-import.ts` — `insertVolumesAndChapters()` and `insertNewChapters()`

Collect all chapters for a volume into an array and insert with a single `.values([...chapters]).run()` call per volume instead of one INSERT per chapter. Volumes continue to be inserted individually (there are far fewer — ~100 for One Piece vs ~1,100 chapters).

**Impact:** ~80-90% reduction in DB write time during import.

## Files Modified

| File                          | Change                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `src/server/manga-updates.ts` | Fix `perpage` field name, add early termination                                 |
| `src/server/manga-import.ts`  | Batch chapter inserts in `insertVolumesAndChapters()` and `insertNewChapters()` |

## Out of Scope

- Concurrent page fetching (adds complexity for diminishing returns)
- Refresh metadata optimization via RSS endpoint (separate future effort)
