# Anime Episode Groups & Dual-Format Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable TMDB Episode Group selection for fixing incorrect anime season structures, and dual-format (absolute + seasonal) search for anime series types.

**Architecture:** Two independent features — (1) episode group selection changes which TMDB structure populates the seasons/episodes DB tables, available for any show with groups; (2) dual-format search fires both absolute and S##E## queries when series type is "anime". A new `episodeGroupId` column on `shows` tracks the selected group; the existing `absoluteNumber` column on `episodes` gets populated for anime shows.

**Tech Stack:** TanStack Start server functions, Drizzle ORM (SQLite), TMDB API v3, React + shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-25-anime-episode-groups-design.md`

---

## File Map

| Action | File                                           | Responsibility                                                           |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Modify | `src/server/tmdb/types.ts`                     | Add episode group TypeScript types                                       |
| Modify | `src/server/tmdb/shows.ts`                     | Add TMDB episode group fetch functions                                   |
| Modify | `src/db/schema/shows.ts`                       | Add `episodeGroupId` column to `shows` table                             |
| Create | `drizzle/0007_*.sql`                           | Migration for new column                                                 |
| Modify | `src/lib/tmdb-validators.ts`                   | Add `episodeGroupId` to add/update schemas                               |
| Modify | `src/server/shows.ts`                          | Episode group import logic, absolute number computation, group switching |
| Modify | `src/server/auto-search.ts`                    | Dual-format search queries, `absoluteNumber` in `WantedEpisode`          |
| Modify | `src/components/tv/tmdb-show-search.tsx`       | Episode group selector in add flow, anime auto-detection                 |
| Create | `src/components/tv/episode-group-selector.tsx` | Reusable episode group picker with preview                               |
| Modify | `src/hooks/mutations/shows.ts`                 | Pass `episodeGroupId` through mutation                                   |

---

### Task 1: TMDB Episode Group Types

**Files:**

- Modify: `src/server/tmdb/types.ts`

- [ ] **Step 1: Add episode group types**

Add these types at the end of `src/server/tmdb/types.ts`, before the `TMDB_IMAGE_BASE` export:

```typescript
// Episode group types
export const EPISODE_GROUP_TYPES = {
  1: "Original Air Date",
  2: "Absolute",
  3: "DVD",
  4: "Digital",
  5: "Story Arc",
  6: "Production",
  7: "TV",
} as const;

export type EpisodeGroupType = keyof typeof EPISODE_GROUP_TYPES;

export type TmdbEpisodeGroupSummary = {
  id: string; // 24-char hex string
  name: string;
  description: string;
  episode_count: number;
  group_count: number;
  type: EpisodeGroupType;
  network: { id: number; name: string; origin_country: string } | null;
};

export type TmdbEpisodeGroupsResponse = {
  results: TmdbEpisodeGroupSummary[];
  id: number;
};

export type TmdbEpisodeGroupDetail = {
  id: string;
  name: string;
  description: string;
  episode_count: number;
  group_count: number;
  type: EpisodeGroupType;
  network: { id: number; name: string; origin_country: string } | null;
  groups: TmdbEpisodeGroup[];
};

export type TmdbEpisodeGroup = {
  id: string;
  name: string;
  order: number;
  locked: boolean;
  episodes: TmdbEpisodeGroupEpisode[];
};

export type TmdbEpisodeGroupEpisode = {
  id: number; // canonical TMDB episode ID
  name: string;
  overview: string;
  air_date: string | null;
  episode_number: number; // canonical episode number
  season_number: number; // canonical season number
  show_id: number;
  still_path: string | null;
  runtime: number | null;
  vote_average: number;
  order: number; // position within this group (0-indexed)
};
```

- [ ] **Step 2: Commit**

```bash
git add src/server/tmdb/types.ts
git commit -m "feat: add TMDB episode group types"
```

---

### Task 2: TMDB Episode Group Fetch Functions

**Files:**

- Modify: `src/server/tmdb/shows.ts`

- [ ] **Step 1: Add imports**

At the top of `src/server/tmdb/shows.ts`, update the type import:

```typescript
import type {
  TmdbShowDetail,
  TmdbSeasonDetail,
  TmdbEpisodeGroupsResponse,
  TmdbEpisodeGroupDetail,
} from "./types";
```

- [ ] **Step 2: Add getTmdbEpisodeGroupsFn**

Add after the `getTmdbSeasonDetailFn` export (after line 70):

```typescript
export const getTmdbEpisodeGroupsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { tmdbId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const raw = await tmdbFetch<TmdbEpisodeGroupsResponse>(
      `/tv/${data.tmdbId}/episode_groups`,
    );
    return raw.results;
  });
```

- [ ] **Step 3: Add getTmdbEpisodeGroupDetailFn**

Add after the function above:

```typescript
export const getTmdbEpisodeGroupDetailFn = createServerFn({ method: "GET" })
  .inputValidator((d: { groupId: string }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const raw = await tmdbFetch<TmdbEpisodeGroupDetail>(
      `/tv/episode_group/${data.groupId}`,
    );
    return {
      ...raw,
      groups: raw.groups
        .sort((a, b) => a.order - b.order)
        .map((group) => ({
          ...group,
          episodes: group.episodes
            .sort((a, b) => a.order - b.order)
            .map((ep) => ({
              ...ep,
              still_path: transformImagePath(ep.still_path, "w500"),
            })),
        })),
    };
  });
```

- [ ] **Step 4: Commit**

```bash
git add src/server/tmdb/shows.ts
git commit -m "feat: add TMDB episode group fetch server functions"
```

---

### Task 3: Database Schema & Migration

**Files:**

- Modify: `src/db/schema/shows.ts`
- Create: `drizzle/0007_*.sql` (generated)

- [ ] **Step 1: Add episodeGroupId column to shows table**

In `src/db/schema/shows.ts`, add the column inside the `shows` table definition, after the `monitorNewSeasons` field (line 29):

```typescript
    episodeGroupId: text("episode_group_id"),
```

- [ ] **Step 2: Generate migration**

```bash
bun run db:generate
```

Expected: A new migration file is created in `drizzle/` adding the `episode_group_id` column.

- [ ] **Step 3: Apply migration**

```bash
bun run db:migrate
```

Expected: Migration applies successfully.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/shows.ts drizzle/
git commit -m "feat: add episodeGroupId column to shows table"
```

---

### Task 4: Validator Updates

**Files:**

- Modify: `src/lib/tmdb-validators.ts`

- [ ] **Step 1: Add episodeGroupId to addShowSchema**

In `src/lib/tmdb-validators.ts`, add to `addShowSchema` (after `searchCutoffUnmet` on line 19):

```typescript
  episodeGroupId: z.string().nullable().default(null),
```

- [ ] **Step 2: Add episodeGroupId to updateShowSchema**

Add to `updateShowSchema` (after `seriesType` on line 27):

```typescript
  episodeGroupId: z.string().nullable().optional(),
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tmdb-validators.ts
git commit -m "feat: add episodeGroupId to show validators"
```

---

### Task 5: Absolute Number Computation Utility

**Files:**

- Modify: `src/server/shows.ts`

- [ ] **Step 1: Add computeAbsoluteNumbers function**

Add this helper function in `src/server/shows.ts`, after the `applyMonitoringOption` function (after line 186):

```typescript
/**
 * Compute and store absolute episode numbers for anime-type shows.
 * Detection logic:
 * - Single non-specials season: episode number IS absolute
 * - Multi-season continuous (S2 starts at ep > 1): episode number IS absolute
 * - Multi-season reset (S2 starts at ep 1): cumulative count across seasons
 */
function computeAbsoluteNumbers(showId: number): void {
  const showRow = db
    .select({ seriesType: shows.seriesType })
    .from(shows)
    .where(eq(shows.id, showId))
    .get();

  if (!showRow || showRow.seriesType !== "anime") {
    return;
  }

  // Get all non-specials seasons ordered by season number
  const showSeasons = db
    .select({ id: seasons.id, seasonNumber: seasons.seasonNumber })
    .from(seasons)
    .where(and(eq(seasons.showId, showId), sql`${seasons.seasonNumber} > 0`))
    .orderBy(seasons.seasonNumber)
    .all();

  if (showSeasons.length === 0) {
    return;
  }

  // Get episodes grouped by season
  const episodesBySeason = new Map<
    number,
    Array<{ id: number; episodeNumber: number }>
  >();
  for (const season of showSeasons) {
    const eps = db
      .select({ id: episodes.id, episodeNumber: episodes.episodeNumber })
      .from(episodes)
      .where(eq(episodes.seasonId, season.id))
      .orderBy(episodes.episodeNumber)
      .all();
    episodesBySeason.set(season.id, eps);
  }

  // Determine numbering type
  if (showSeasons.length === 1) {
    // Case 1: Single season — episode number is absolute
    const eps = episodesBySeason.get(showSeasons[0].id) ?? [];
    for (const ep of eps) {
      db.update(episodes)
        .set({ absoluteNumber: ep.episodeNumber })
        .where(eq(episodes.id, ep.id))
        .run();
    }
    return;
  }

  // Check if second season's first episode resets to 1
  const secondSeasonEps = episodesBySeason.get(showSeasons[1].id) ?? [];
  const firstEpOfS2 = secondSeasonEps[0];
  const isContinuous = firstEpOfS2 && firstEpOfS2.episodeNumber > 1;

  if (isContinuous) {
    // Case 2: Continuous numbering — episode number IS absolute
    for (const season of showSeasons) {
      const eps = episodesBySeason.get(season.id) ?? [];
      for (const ep of eps) {
        db.update(episodes)
          .set({ absoluteNumber: ep.episodeNumber })
          .where(eq(episodes.id, ep.id))
          .run();
      }
    }
  } else {
    // Case 3: Reset numbering — compute cumulative
    let cumulative = 0;
    for (const season of showSeasons) {
      const eps = episodesBySeason.get(season.id) ?? [];
      for (const ep of eps) {
        cumulative += 1;
        db.update(episodes)
          .set({ absoluteNumber: cumulative })
          .where(eq(episodes.id, ep.id))
          .run();
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/shows.ts
git commit -m "feat: add absolute number computation for anime shows"
```

---

### Task 6: Episode Group Import in addShowFn

**Files:**

- Modify: `src/server/shows.ts`

- [ ] **Step 1: Add episode group type imports**

Update the imports at the top of `src/server/shows.ts`. Add to the tmdb type import:

```typescript
import type {
  TmdbShowDetail,
  TmdbSeasonDetail,
  TmdbEpisodeGroupDetail,
} from "./tmdb/types";
```

- [ ] **Step 2: Add importFromEpisodeGroup helper**

Add this function after `computeAbsoluteNumbers`:

```typescript
async function importFromEpisodeGroup(
  showId: number,
  groupDetail: TmdbEpisodeGroupDetail,
): Promise<void> {
  const sortedGroups = groupDetail.groups.sort((a, b) => a.order - b.order);

  for (const group of sortedGroups) {
    const season = db
      .insert(seasons)
      .values({
        showId,
        seasonNumber: group.order,
        overview: null,
        posterUrl: null,
      })
      .returning()
      .get();

    if (group.episodes.length > 0) {
      db.insert(episodes)
        .values(
          group.episodes
            .sort((a, b) => a.order - b.order)
            .map((ep) => ({
              showId,
              seasonId: season.id,
              episodeNumber: ep.order + 1, // 0-indexed order -> 1-indexed episode number
              title: ep.name,
              overview: ep.overview || null,
              airDate: ep.air_date,
              runtime: ep.runtime,
              tmdbId: ep.id,
              hasFile: false,
            })),
        )
        .run();
    }
  }
}
```

- [ ] **Step 3: Modify addShowFn to support episodeGroupId**

In `addShowFn`, after the show insert (line 242), update the seasons/episodes import block. Replace lines 251-286 (the "Fetch and insert seasons and episodes" block):

```typescript
// Fetch and insert seasons and episodes
if (data.episodeGroupId) {
  // Import from episode group
  const groupDetail = await tmdbFetch<TmdbEpisodeGroupDetail>(
    `/tv/episode_group/${data.episodeGroupId}`,
  );
  await importFromEpisodeGroup(show.id, groupDetail);
} else {
  // Import from TMDB default seasons
  for (const seasonSummary of raw.seasons) {
    const seasonDetail = await tmdbFetch<TmdbSeasonDetail>(
      `/tv/${data.tmdbId}/season/${seasonSummary.season_number}`,
    );

    const season = db
      .insert(seasons)
      .values({
        showId: show.id,
        seasonNumber: seasonSummary.season_number,
        overview: seasonSummary.overview || null,
        posterUrl: transformImagePath(seasonSummary.poster_path, "w500"),
      })
      .returning()
      .get();

    if (seasonDetail.episodes.length > 0) {
      db.insert(episodes)
        .values(
          seasonDetail.episodes.map((ep) => ({
            showId: show.id,
            seasonId: season.id,
            episodeNumber: ep.episode_number,
            title: ep.name,
            overview: ep.overview || null,
            airDate: ep.air_date,
            runtime: ep.runtime,
            tmdbId: ep.id,
            hasFile: false,
          })),
        )
        .run();
    }
  }
}
```

- [ ] **Step 4: Store episodeGroupId on show insert**

In the show insert values object (around line 225-241), add `episodeGroupId`:

```typescript
        episodeGroupId: data.episodeGroupId,
```

- [ ] **Step 5: Call computeAbsoluteNumbers after import**

Add after the `applyMonitoringOption` call (line 289):

```typescript
// Compute absolute episode numbers for anime shows
computeAbsoluteNumbers(show.id);
```

- [ ] **Step 6: Commit**

```bash
git add src/server/shows.ts
git commit -m "feat: support episode group import in addShowFn"
```

---

### Task 7: Episode Group Switching in updateShowFn

**Files:**

- Modify: `src/server/shows.ts`

- [ ] **Step 1: Add episode group switching logic**

In `updateShowFn`, after the `seriesType` update block (line 467), add:

```typescript
// Handle episode group change
if (data.episodeGroupId !== undefined) {
  const currentGroupId = show.episodeGroupId ?? null;
  const newGroupId = data.episodeGroupId;

  if (currentGroupId !== newGroupId) {
    // Snapshot existing links by tmdbId
    const existingEpisodes = db
      .select({
        id: episodes.id,
        tmdbId: episodes.tmdbId,
      })
      .from(episodes)
      .where(eq(episodes.showId, id))
      .all();

    const snapshot = new Map<
      number,
      { fileIds: number[]; profileIds: number[] }
    >();
    for (const ep of existingEpisodes) {
      const files = db
        .select({ id: episodeFiles.id })
        .from(episodeFiles)
        .where(eq(episodeFiles.episodeId, ep.id))
        .all();
      const profiles = db
        .select({
          downloadProfileId: episodeDownloadProfiles.downloadProfileId,
        })
        .from(episodeDownloadProfiles)
        .where(eq(episodeDownloadProfiles.episodeId, ep.id))
        .all();
      snapshot.set(ep.tmdbId, {
        fileIds: files.map((f) => f.id),
        profileIds: profiles.map((p) => p.downloadProfileId),
      });
    }

    // Delete existing seasons and episodes (cascades to files and profiles)
    db.delete(seasons).where(eq(seasons.showId, id)).run();

    // Re-import from new source
    if (newGroupId) {
      const groupDetail = await tmdbFetch<TmdbEpisodeGroupDetail>(
        `/tv/episode_group/${newGroupId}`,
      );
      await importFromEpisodeGroup(id, groupDetail);
    } else {
      const raw = await tmdbFetch<TmdbShowDetail>(`/tv/${show.tmdbId}`, {
        append_to_response: "external_ids",
      });
      for (const seasonSummary of raw.seasons) {
        const seasonDetail = await tmdbFetch<TmdbSeasonDetail>(
          `/tv/${show.tmdbId}/season/${seasonSummary.season_number}`,
        );
        const season = db
          .insert(seasons)
          .values({
            showId: id,
            seasonNumber: seasonSummary.season_number,
            overview: seasonSummary.overview || null,
            posterUrl: transformImagePath(seasonSummary.poster_path, "w500"),
          })
          .returning()
          .get();
        if (seasonDetail.episodes.length > 0) {
          db.insert(episodes)
            .values(
              seasonDetail.episodes.map((ep) => ({
                showId: id,
                seasonId: season.id,
                episodeNumber: ep.episode_number,
                title: ep.name,
                overview: ep.overview || null,
                airDate: ep.air_date,
                runtime: ep.runtime,
                tmdbId: ep.id,
                hasFile: false,
              })),
            )
            .run();
        }
      }
    }

    // Re-link files and profiles by tmdbId
    const newEpisodes = db
      .select({ id: episodes.id, tmdbId: episodes.tmdbId })
      .from(episodes)
      .where(eq(episodes.showId, id))
      .all();

    let orphanedFileCount = 0;
    for (const [tmdbId, links] of snapshot) {
      const newEp = newEpisodes.find((e) => e.tmdbId === tmdbId);
      if (newEp) {
        // Re-link episode files
        for (const fileId of links.fileIds) {
          db.update(episodeFiles)
            .set({ episodeId: newEp.id })
            .where(eq(episodeFiles.id, fileId))
            .run();
          db.update(episodes)
            .set({ hasFile: true })
            .where(eq(episodes.id, newEp.id))
            .run();
        }
        // Re-link episode download profiles
        for (const profileId of links.profileIds) {
          db.insert(episodeDownloadProfiles)
            .values({ episodeId: newEp.id, downloadProfileId: profileId })
            .onConflictDoNothing()
            .run();
        }
      } else {
        orphanedFileCount += links.fileIds.length;
      }
    }

    // Update episodeGroupId on the show
    db.update(shows)
      .set({ episodeGroupId: newGroupId })
      .where(eq(shows.id, id))
      .run();

    // Recompute absolute numbers
    computeAbsoluteNumbers(id);
  }
}

// Recompute absolute numbers if series type changed
if (seriesType && seriesType !== show.seriesType) {
  computeAbsoluteNumbers(id);
}
```

- [ ] **Step 2: Add episodeGroupId to updateShowSchema access**

In the destructuring at the top of `updateShowFn` handler (line 441-447), add `episodeGroupId`:

```typescript
const {
  id,
  downloadProfileIds,
  monitorNewSeasons,
  useSeasonFolder,
  seriesType,
  episodeGroupId,
} = data;
```

- [ ] **Step 3: Add necessary imports**

Add `episodeFiles` to the schema imports at line 9 (if not already there — it is already imported).

Add `TmdbEpisodeGroupDetail` to the type import if not already done in Task 6.

- [ ] **Step 4: Make updateShowFn handler async**

The handler already uses `await`, verify it's async. The existing handler signature should have `async` — confirm this is the case.

- [ ] **Step 5: Commit**

```bash
git add src/server/shows.ts src/lib/tmdb-validators.ts
git commit -m "feat: support episode group switching in updateShowFn"
```

---

### Task 8: Dual-Format Anime Search

**Files:**

- Modify: `src/server/auto-search.ts`

- [ ] **Step 1: Add absoluteNumber to WantedEpisode type**

In `src/server/auto-search.ts`, update the `WantedEpisode` type (line 109-119) to add `absoluteNumber`:

```typescript
type WantedEpisode = {
  id: number;
  showId: number;
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  absoluteNumber: number | null;
  seriesType: string;
  airDate: string | null;
  profiles: ProfileInfo[];
  bestWeightByProfile: Map<number, number>;
};
```

- [ ] **Step 2: Populate absoluteNumber in getWantedEpisodes**

In `getWantedEpisodes`, update the select query (around line 517) to include `absoluteNumber`:

```typescript
const monitoredEpisodes = db
  .select({
    id: episodes.id,
    showId: episodes.showId,
    showTitle: shows.title,
    seasonNumber: seasons.seasonNumber,
    episodeNumber: episodes.episodeNumber,
    absoluteNumber: episodes.absoluteNumber,
    seriesType: shows.seriesType,
    airDate: episodes.airDate,
  })
  .from(episodes)
  .innerJoin(shows, eq(shows.id, episodes.showId))
  .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
  .where(whereClause)
  .all();
```

Then add `absoluteNumber` to the `wanted.push()` calls (around lines 630-641 and 665-676):

```typescript
        absoluteNumber: ep.absoluteNumber,
```

- [ ] **Step 3: Rewrite buildEpisodeSearchQuery to return array**

Replace the `buildEpisodeSearchQuery` function (lines 709-723) with a version that returns multiple queries for anime:

```typescript
function buildEpisodeSearchQueries(episode: WantedEpisode): string[] {
  const showName = cleanSearchTerm(episode.showTitle);
  switch (episode.seriesType) {
    case "daily": {
      return [`"${showName}" ${episode.airDate ?? ""}`.trim()];
    }
    case "anime": {
      const queries: string[] = [];
      // Always search seasonal format
      queries.push(
        `"${showName}" S${padNumber(episode.seasonNumber)}E${padNumber(episode.episodeNumber)}`,
      );
      // Additionally search absolute format if available
      if (episode.absoluteNumber !== null) {
        queries.push(`"${showName}" ${padNumber(episode.absoluteNumber)}`);
      }
      return queries;
    }
    default: {
      // "standard"
      return [
        `"${showName}" S${padNumber(episode.seasonNumber)}E${padNumber(episode.episodeNumber)}`,
      ];
    }
  }
}
```

- [ ] **Step 4: Update searchAndGrabForEpisode to use multiple queries**

In `searchAndGrabForEpisode` (line 1094), replace the single query call with a multi-query loop. Replace the `const query = buildEpisodeSearchQuery(episode);` line (1107) and the search loops with:

```typescript
const queries = buildEpisodeSearchQueries(episode);
const categories = getCategoriesForProfiles(episode.profiles);

const DELAY_BETWEEN_INDEXERS = 1000;
const allReleases: IndexerRelease[] = [];

// Search each query against each indexer
for (const query of queries) {
  const syncedWithKey = ixs.synced.filter((s) => s.apiKey);
  for (let i = 0; i < syncedWithKey.length; i += 1) {
    const synced = syncedWithKey[i];
    try {
      const results = await searchNewznab(
        {
          baseUrl: synced.baseUrl,
          apiPath: synced.apiPath ?? "/api",
          apiKey: synced.apiKey!,
        },
        query,
        categories,
      );
      allReleases.push(
        ...results.map((r) =>
          enrichRelease({
            ...r,
            indexer: r.indexer || synced.name,
            allstarrIndexerId: synced.id,
            indexerSource: "synced" as const,
          }),
        ),
      );
    } catch (error) {
      console.error(
        `[auto-search] Indexer "${synced.name}" failed for episode:`,
        error instanceof Error ? error.message : error,
      );
    }
    if (i < syncedWithKey.length - 1 || ixs.manual.length > 0) {
      await sleep(DELAY_BETWEEN_INDEXERS);
    }
  }

  for (let i = 0; i < ixs.manual.length; i += 1) {
    const ix = ixs.manual[i];
    try {
      const results = await searchNewznab(
        {
          baseUrl: ix.baseUrl,
          apiPath: ix.apiPath ?? "/api",
          apiKey: ix.apiKey,
        },
        query,
        categories,
      );
      allReleases.push(
        ...results.map((r) =>
          enrichRelease({
            ...r,
            indexer: r.indexer || ix.name,
            allstarrIndexerId: ix.id,
            indexerSource: "manual" as const,
          }),
        ),
      );
    } catch (error) {
      console.error(
        `[auto-search] Manual indexer failed for episode:`,
        error instanceof Error ? error.message : error,
      );
    }
    if (i < ixs.manual.length - 1) {
      await sleep(DELAY_BETWEEN_INDEXERS);
    }
  }
}
```

The rest of `searchAndGrabForEpisode` (dedup, score, grab) stays the same — `dedupeAndScoreReleases` already handles duplicates from multiple queries.

- [ ] **Step 5: Commit**

```bash
git add src/server/auto-search.ts
git commit -m "feat: dual-format anime search with absolute + seasonal queries"
```

---

### Task 9: Episode Group Selector Component

**Files:**

- Create: `src/components/tv/episode-group-selector.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import { Badge } from "src/components/ui/badge";
import Label from "src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "src/components/ui/collapsible";
import { getTmdbEpisodeGroupsFn } from "src/server/tmdb/shows";
import { EPISODE_GROUP_TYPES } from "src/server/tmdb/types";
import type {
  TmdbEpisodeGroupSummary,
  EpisodeGroupType,
} from "src/server/tmdb/types";

const TMDB_DEFAULT_VALUE = "__default__";

// Anime detection: JP origin + Animation genre (ID 16)
function isAnime(originCountry: string[], genreIds: number[]): boolean {
  return originCountry.includes("JP") && genreIds.includes(16);
}

// Recommendation priority by episode group type for anime
const ANIME_RECOMMENDED_TYPES: EpisodeGroupType[] = [6, 1, 7]; // Production > Air Date > TV

function getRecommendedGroup(
  groups: TmdbEpisodeGroupSummary[],
  anime: boolean,
): string | null {
  if (!anime) {
    return null; // TMDB Default is recommended for non-anime
  }

  // For anime, find the best season-splitting group
  for (const preferredType of ANIME_RECOMMENDED_TYPES) {
    const candidates = groups.filter((g) => g.type === preferredType);
    if (candidates.length > 0) {
      // Pick the one with the most episodes as tiebreaker
      candidates.sort((a, b) => b.episode_count - a.episode_count);
      return candidates[0].id;
    }
  }

  return null; // No recommendation found; default to TMDB Default
}

type EpisodeGroupSelectorProps = {
  tmdbId: number;
  originCountry: string[];
  genreIds: number[];
  value: string | null;
  onChange: (groupId: string | null) => void;
};

export default function EpisodeGroupSelector({
  tmdbId,
  originCountry,
  genreIds,
  value,
  onChange,
}: EpisodeGroupSelectorProps): JSX.Element | null {
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["tmdb", "episode-groups", tmdbId],
    queryFn: () => getTmdbEpisodeGroupsFn({ data: { tmdbId } }),
    enabled: tmdbId > 0,
  });

  if (isLoading || groups.length === 0) {
    return null; // No groups available — don't show UI
  }

  const anime = isAnime(originCountry, genreIds);
  const recommendedId = getRecommendedGroup(groups, anime);
  const isDefaultRecommended = !anime || recommendedId === null;

  // Group by type for organized display
  const groupsByType = new Map<EpisodeGroupType, TmdbEpisodeGroupSummary[]>();
  for (const group of groups) {
    const arr = groupsByType.get(group.type) ?? [];
    arr.push(group);
    groupsByType.set(group.type, arr);
  }

  return (
    <div className="space-y-2">
      <Label>Episode Ordering</Label>
      <Select
        value={value ?? TMDB_DEFAULT_VALUE}
        onValueChange={(v) => onChange(v === TMDB_DEFAULT_VALUE ? null : v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TMDB_DEFAULT_VALUE}>
            <span className="flex items-center gap-2">
              TMDB Default
              {isDefaultRecommended && (
                <Badge variant="secondary" className="text-xs">
                  Recommended
                </Badge>
              )}
            </span>
          </SelectItem>
          {[...groupsByType.entries()].map(([type, typeGroups]) =>
            typeGroups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                <span className="flex items-center gap-2">
                  {group.name}
                  <Badge variant="outline" className="text-xs">
                    {EPISODE_GROUP_TYPES[type]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {group.group_count} seasons, {group.episode_count} eps
                  </span>
                  {group.id === recommendedId && (
                    <Badge variant="secondary" className="text-xs">
                      Recommended
                    </Badge>
                  )}
                </span>
              </SelectItem>
            )),
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

export { isAnime };
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tv/episode-group-selector.tsx
git commit -m "feat: add episode group selector component"
```

---

### Task 10: Integrate Episode Group Selector into Add Flow

**Files:**

- Modify: `src/components/tv/tmdb-show-search.tsx`

- [ ] **Step 1: Add imports**

Add to the imports at the top of `src/components/tv/tmdb-show-search.tsx`:

```typescript
import EpisodeGroupSelector, {
  isAnime,
} from "src/components/tv/episode-group-selector";
```

- [ ] **Step 2: Add episodeGroupId state**

In the `ShowPreviewModal` component, add state after the existing state declarations (around line 94):

```typescript
const [episodeGroupId, setEpisodeGroupId] = useState<string | null>(null);
```

- [ ] **Step 3: Auto-detect anime for series type default**

Add an effect after the profile auto-select effect (after line 108):

```typescript
// Auto-detect anime and default series type
useEffect(() => {
  if (isAnime(show.origin_country, show.genre_ids)) {
    setSeriesType("anime");
  }
}, [show.origin_country, show.genre_ids]);
```

- [ ] **Step 4: Add EpisodeGroupSelector to the form**

In the JSX, add the episode group selector after the Series Type select (after line 251, before the "Use Season Folder" switch):

```tsx
<EpisodeGroupSelector
  tmdbId={show.id}
  originCountry={show.origin_country}
  genreIds={show.genre_ids}
  value={episodeGroupId}
  onChange={setEpisodeGroupId}
/>
```

- [ ] **Step 5: Pass episodeGroupId to the mutation**

In the `handleAdd` function, add `episodeGroupId` to the mutation call (around line 122-139):

```typescript
        episodeGroupId,
```

Add it after `searchCutoffUnmet` in the `addShow.mutate()` call.

- [ ] **Step 6: Commit**

```bash
git add src/components/tv/tmdb-show-search.tsx
git commit -m "feat: integrate episode group selector into show add flow"
```

---

### Task 11: Pass episodeGroupId Through Mutation Hook

**Files:**

- Modify: `src/hooks/mutations/shows.ts`

- [ ] **Step 1: Check current mutation hook**

Read `src/hooks/mutations/shows.ts` and verify the `useAddShow` hook passes all data through to `addShowFn`. If it already passes the full data object, no changes are needed (TanStack Start server functions receive the full validated input). If there's explicit destructuring that excludes `episodeGroupId`, add it.

- [ ] **Step 2: Commit if changed**

```bash
git add src/hooks/mutations/shows.ts
git commit -m "feat: pass episodeGroupId through show mutation hook"
```

---

### Task 12: Build Verification

- [ ] **Step 1: Run production build**

```bash
bun run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 2: Fix any type errors**

If there are type errors, fix them and re-run.

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: resolve build errors from episode group implementation"
```

---

### Task 13: Episode Group in Show Edit Page

**Files:**

- Find and modify the show edit/settings component (likely in `src/routes/_authed/tv/` or `src/components/tv/`)

- [ ] **Step 1: Locate the show edit UI**

Search for where `updateShowFn` is called from the UI. This is where the episode group selector needs to be added for existing shows.

- [ ] **Step 2: Add EpisodeGroupSelector to edit form**

Import and add the `EpisodeGroupSelector` component to the show edit/settings form, wired to the `updateShowFn` mutation. Include a confirmation dialog warning about the restructuring when the value changes.

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "feat: add episode group selector to show edit page"
```
