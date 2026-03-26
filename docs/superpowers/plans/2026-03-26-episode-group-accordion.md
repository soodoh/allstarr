# Episode Group Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dropdown episode group selector with an accordion that previews season/episode structure, used in both add and edit TV flows. Add TMDB response caching to avoid duplicate API calls between preview and import.

**Architecture:** Add a TTL cache to `tmdbFetch` so preview and import share responses. Build one new component (`EpisodeGroupAccordion`) on shadcn's Accordion primitive, fetching group details lazily via React Query. Replace `EpisodeGroupSelector` in both `tmdb-show-search.tsx` (add flow) and `show-detail-header.tsx` (edit flow). Delete the old selector.

**Tech Stack:** React, TanStack Query, Radix Accordion (via shadcn/ui), TMDB API

---

## File Map

| File                                            | Action | Responsibility                                                                                  |
| ----------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `src/server/tmdb/client.ts`                     | Modify | Add in-memory response cache (5-min TTL) to `tmdbFetch`                                         |
| `src/components/tv/episode-group-accordion.tsx` | Create | Accordion component with radio selection, lazy detail fetching, season rows with episode ranges |
| `src/components/tv/tmdb-show-search.tsx`        | Modify | Swap `EpisodeGroupSelector` → `EpisodeGroupAccordion`                                           |
| `src/components/tv/show-detail-header.tsx`      | Modify | Swap `EpisodeGroupSelector` → `EpisodeGroupAccordion`, widen dialog                             |
| `src/components/tv/episode-group-selector.tsx`  | Delete | Replaced by accordion                                                                           |

---

### Task 1: Add Response Cache to tmdbFetch

**Files:**

- Modify: `src/server/tmdb/client.ts`

A simple in-memory cache with 5-minute TTL. The cache key is the full URL (including query params). Both the accordion preview (via server functions) and the import (`addShowFn` calling `tmdbFetch` directly) hit the same cache.

- [ ] **Step 1: Add the cache implementation**

In `src/server/tmdb/client.ts`, add the cache above `tmdbFetch`:

```typescript
// In-memory response cache (5-minute TTL)
// Prevents duplicate TMDB API calls when previewing episode groups
// and then importing the same show.
const responseCache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | undefined {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    responseCache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  responseCache.set(key, { data, expires: Date.now() + CACHE_TTL });
}
```

- [ ] **Step 2: Integrate cache into tmdbFetch**

Replace the existing `tmdbFetch` function body to check cache before fetching:

```typescript
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
```

- [ ] **Step 3: Verify it compiles**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/server/tmdb/client.ts
git commit -m "feat: add 5-minute response cache to tmdbFetch"
```

---

### Task 2: Create the EpisodeGroupAccordion Component

**Files:**

- Create: `src/components/tv/episode-group-accordion.tsx`

The core component. Fetches episode group summaries for accordion headers, lazily fetches group details and season details for episode ranges when expanded.

Episode ranges use **actual episode numbers from the API** — not derived from counts:

- **TMDB Default**: Fetches each season's detail via `getTmdbSeasonDetailFn` to get real `episode_number` values
- **Episode groups**: Uses `order + 1` from the group detail (the episode's position within that grouping)

- [ ] **Step 1: Create the component file with imports, types, and helper functions**

```tsx
// src/components/tv/episode-group-accordion.tsx
import { useState, useMemo, useEffect } from "react";
import type { JSX } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Badge } from "src/components/ui/badge";
import Label from "src/components/ui/label";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "src/components/ui/accordion";
import {
  getTmdbEpisodeGroupsFn,
  getTmdbShowDetailFn,
  getTmdbSeasonDetailFn,
  getTmdbEpisodeGroupDetailFn,
} from "src/server/tmdb/shows";
import { EPISODE_GROUP_TYPES } from "src/server/tmdb/types";
import type {
  TmdbEpisodeGroupSummary,
  TmdbEpisodeGroup,
  EpisodeGroupType,
} from "src/server/tmdb/types";

const TMDB_DEFAULT_VALUE = "__default__";

// ── Anime detection & recommendation (ported from episode-group-selector.tsx) ──

export function isAnime(originCountry: string[], genreIds: number[]): boolean {
  return originCountry.includes("JP") && genreIds.includes(16);
}

const ANIME_RECOMMENDED_TYPES: EpisodeGroupType[] = [6, 1, 7];

function getRecommendedGroup(
  groups: TmdbEpisodeGroupSummary[],
  anime: boolean,
): string | null {
  if (!anime) {
    return null;
  }
  for (const preferredType of ANIME_RECOMMENDED_TYPES) {
    const candidates = groups
      .filter((g) => g.type === preferredType)
      .toSorted((a, b) => b.episode_count - a.episode_count);
    if (candidates.length > 0) {
      return candidates[0].id;
    }
  }
  return null;
}

// ── Season row data ──

type SeasonRow = {
  name: string;
  episodeCount: number;
  startEp: number;
  endEp: number;
};

/** Build season rows from an episode group detail (uses order+1 as episode number). */
function buildGroupSeasonRows(groups: TmdbEpisodeGroup[]): SeasonRow[] {
  return groups.map((group) => {
    const episodes = group.episodes.toSorted((a, b) => a.order - b.order);
    const first = episodes[0];
    const last = episodes[episodes.length - 1];
    return {
      name: group.name,
      episodeCount: episodes.length,
      startEp: first ? first.order + 1 : 1,
      endEp: last ? last.order + 1 : episodes.length,
    };
  });
}

/** Zero-pad a number to at least 2 digits. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
```

- [ ] **Step 2: Add the SeasonRows display component**

Append to the same file:

```tsx
function SeasonRows({
  rows,
  isLoading,
}: {
  rows: SeasonRow[];
  isLoading: boolean;
}): JSX.Element {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="text-xs">Loading seasons...</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-1">
        No season data available.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {rows.map((row) => (
        <div
          key={row.name}
          className="flex items-center justify-between text-xs text-muted-foreground"
        >
          <span className="text-foreground">{row.name}</span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px]">
              E{pad(row.startEp)}–E{pad(row.endEp)}
            </span>
            <span>{row.episodeCount} eps</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add the DefaultSeasonsContent component (fetches real episode numbers)**

This component fetches each season's detail lazily when the TMDB Default accordion item is expanded, using `useQueries` to parallelize the requests.

Append to the same file:

```tsx
function DefaultSeasonsContent({
  tmdbId,
  seasons,
  isExpanded,
}: {
  tmdbId: number;
  seasons: Array<{
    season_number: number;
    name: string;
    episode_count: number;
  }>;
  isExpanded: boolean;
}): JSX.Element {
  // Filter out specials (season 0) and sort
  const regularSeasons = useMemo(
    () =>
      seasons
        .filter((s) => s.season_number > 0)
        .toSorted((a, b) => a.season_number - b.season_number),
    [seasons],
  );

  // Fetch all season details in parallel when expanded
  const seasonQueries = useQueries({
    queries: regularSeasons.map((s) => ({
      queryKey: ["tmdb", "season-detail", tmdbId, s.season_number],
      queryFn: () =>
        getTmdbSeasonDetailFn({
          data: { tmdbId, seasonNumber: s.season_number },
        }),
      enabled: isExpanded,
    })),
  });

  const isLoading = seasonQueries.some((q) => q.isLoading);

  const rows: SeasonRow[] = useMemo(() => {
    if (isLoading) return [];
    return regularSeasons.map((s, i) => {
      const detail = seasonQueries[i]?.data;
      if (!detail || detail.episodes.length === 0) {
        return {
          name: s.name,
          episodeCount: s.episode_count,
          startEp: 1,
          endEp: s.episode_count,
        };
      }
      const sorted = detail.episodes.toSorted(
        (a, b) => a.episode_number - b.episode_number,
      );
      return {
        name: s.name,
        episodeCount: sorted.length,
        startEp: sorted[0].episode_number,
        endEp: sorted[sorted.length - 1].episode_number,
      };
    });
  }, [isLoading, regularSeasons, seasonQueries]);

  return <SeasonRows rows={rows} isLoading={isLoading} />;
}
```

- [ ] **Step 4: Add the EpisodeGroupItem component with lazy detail fetching**

Append to the same file:

```tsx
type EpisodeGroupItemProps = {
  group: TmdbEpisodeGroupSummary;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
  isExpanded: boolean;
};

function EpisodeGroupItem({
  group,
  isSelected,
  isRecommended,
  onSelect,
  isExpanded,
}: EpisodeGroupItemProps): JSX.Element {
  // Lazy-fetch group detail only when expanded or selected
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["tmdb", "episode-group-detail", group.id],
    queryFn: () => getTmdbEpisodeGroupDetailFn({ data: { groupId: group.id } }),
    enabled: isExpanded || isSelected,
  });

  const seasonRows = useMemo(
    () => (detail ? buildGroupSeasonRows(detail.groups) : []),
    [detail],
  );

  return (
    <AccordionItem value={group.id}>
      <AccordionTrigger
        className="px-3 py-2.5 hover:no-underline"
        onClick={onSelect}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
              isSelected ? "border-foreground" : "border-muted-foreground/50"
            }`}
          >
            {isSelected && (
              <div className="h-2 w-2 rounded-full bg-foreground" />
            )}
          </div>
          <span className="font-medium">{group.name}</span>
          <Badge variant="outline" className="text-xs font-normal">
            {EPISODE_GROUP_TYPES[group.type]}
          </Badge>
          <Badge variant="secondary" className="text-xs font-normal">
            {group.group_count} seasons · {group.episode_count} eps
          </Badge>
          {isRecommended && (
            <Badge className="bg-emerald-900 text-emerald-300 text-xs font-normal">
              Recommended
            </Badge>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-3">
        <SeasonRows rows={seasonRows} isLoading={detailLoading} />
      </AccordionContent>
    </AccordionItem>
  );
}
```

- [ ] **Step 5: Add the main EpisodeGroupAccordion component**

Append to the same file:

```tsx
type EpisodeGroupAccordionProps = {
  tmdbId: number;
  originCountry: string[];
  genreIds: number[];
  value: string | null;
  onChange: (groupId: string | null) => void;
  isAnimeOverride?: boolean;
};

export default function EpisodeGroupAccordion({
  tmdbId,
  originCountry,
  genreIds,
  value,
  onChange,
  isAnimeOverride,
}: EpisodeGroupAccordionProps): JSX.Element | null {
  // Track which accordion item is expanded (independent of selection)
  const [expandedItem, setExpandedItem] = useState<string>("");

  // ── Data fetching ──

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["tmdb", "episode-groups", tmdbId],
    queryFn: () => getTmdbEpisodeGroupsFn({ data: { tmdbId } }),
    enabled: tmdbId > 0,
  });

  const { data: showDetail, isLoading: showDetailLoading } = useQuery({
    queryKey: ["tmdb", "show-detail", tmdbId],
    queryFn: () => getTmdbShowDetailFn({ data: { tmdbId } }),
    enabled: tmdbId > 0,
  });

  // ── Anime detection & recommendation ──

  const anime = useMemo(
    () =>
      isAnimeOverride === undefined
        ? isAnime(originCountry, genreIds)
        : isAnimeOverride,
    [isAnimeOverride, originCountry, genreIds],
  );

  const recommendedId = useMemo(
    () => getRecommendedGroup(groups, anime),
    [groups, anime],
  );

  // Preselect recommended group on first load (add flow only — when value is null
  // and no user interaction has happened yet)
  const [hasPreselected, setHasPreselected] = useState(false);
  useEffect(() => {
    if (hasPreselected || groups.length === 0) return;
    setHasPreselected(true);

    // Only preselect if no value is currently set (add flow)
    if (value !== null) {
      // Edit flow: expand the current selection
      setExpandedItem(value);
      return;
    }

    if (recommendedId !== null) {
      onChange(recommendedId);
      setExpandedItem(recommendedId);
    } else {
      // Non-anime: default is recommended, expand it
      setExpandedItem(TMDB_DEFAULT_VALUE);
    }
  }, [groups, recommendedId, value, hasPreselected, onChange]);

  // ── TMDB Default header counts ──

  const defaultSeasons = useMemo(
    () =>
      showDetail
        ? showDetail.seasons
            .filter((s) => s.season_number > 0)
            .toSorted((a, b) => a.season_number - b.season_number)
        : [],
    [showDetail],
  );

  const defaultTotalEps = useMemo(
    () => defaultSeasons.reduce((sum, s) => sum + s.episode_count, 0),
    [defaultSeasons],
  );

  // ── Render ──

  if (groupsLoading || groups.length === 0) {
    return null;
  }

  const isDefaultRecommended = !anime || recommendedId === null;
  const selectedValue = value ?? TMDB_DEFAULT_VALUE;

  const handleSelect = (itemValue: string) => {
    const groupId = itemValue === TMDB_DEFAULT_VALUE ? null : itemValue;
    onChange(groupId);
    setExpandedItem(itemValue);
  };

  return (
    <div className="space-y-2">
      <Label>Episode Ordering</Label>
      <Accordion
        type="single"
        collapsible
        value={expandedItem}
        onValueChange={setExpandedItem}
        className="rounded-lg border"
      >
        {/* TMDB Default */}
        <AccordionItem value={TMDB_DEFAULT_VALUE}>
          <AccordionTrigger
            className="px-3 py-2.5 hover:no-underline"
            onClick={() => handleSelect(TMDB_DEFAULT_VALUE)}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <div
                className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                  selectedValue === TMDB_DEFAULT_VALUE
                    ? "border-foreground"
                    : "border-muted-foreground/50"
                }`}
              >
                {selectedValue === TMDB_DEFAULT_VALUE && (
                  <div className="h-2 w-2 rounded-full bg-foreground" />
                )}
              </div>
              <span className="font-medium">TMDB Default</span>
              {!showDetailLoading && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {defaultSeasons.length} seasons · {defaultTotalEps} eps
                </Badge>
              )}
              {isDefaultRecommended && (
                <Badge className="bg-emerald-900 text-emerald-300 text-xs font-normal">
                  Recommended
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3">
            {showDetail ? (
              <DefaultSeasonsContent
                tmdbId={tmdbId}
                seasons={showDetail.seasons}
                isExpanded={expandedItem === TMDB_DEFAULT_VALUE}
              />
            ) : (
              <SeasonRows rows={[]} isLoading={showDetailLoading} />
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Episode groups */}
        {groups.map((group) => (
          <EpisodeGroupItem
            key={group.id}
            group={group}
            isSelected={selectedValue === group.id}
            isRecommended={group.id === recommendedId}
            onSelect={() => handleSelect(group.id)}
            isExpanded={expandedItem === group.id}
          />
        ))}
      </Accordion>
    </div>
  );
}
```

- [ ] **Step 6: Verify the component compiles**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `episode-group-accordion.tsx`

- [ ] **Step 7: Commit**

```bash
git add src/components/tv/episode-group-accordion.tsx
git commit -m "feat: add EpisodeGroupAccordion component with season previews"
```

---

### Task 3: Integrate into Add Flow

**Files:**

- Modify: `src/components/tv/tmdb-show-search.tsx`

- [ ] **Step 1: Swap the import**

In `src/components/tv/tmdb-show-search.tsx`, replace:

```tsx
import EpisodeGroupSelector from "src/components/tv/episode-group-selector";
```

with:

```tsx
import EpisodeGroupAccordion from "src/components/tv/episode-group-accordion";
```

- [ ] **Step 2: Replace the component usage**

In the same file, replace:

```tsx
<EpisodeGroupSelector
  tmdbId={show.id}
  originCountry={show.origin_country}
  genreIds={show.genre_ids}
  value={episodeGroupId}
  onChange={setEpisodeGroupId}
/>
```

with:

```tsx
<EpisodeGroupAccordion
  tmdbId={show.id}
  originCountry={show.origin_country}
  genreIds={show.genre_ids}
  value={episodeGroupId}
  onChange={setEpisodeGroupId}
/>
```

- [ ] **Step 3: Verify it compiles**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/tv/tmdb-show-search.tsx
git commit -m "feat: use EpisodeGroupAccordion in add show flow"
```

---

### Task 4: Integrate into Edit Flow

**Files:**

- Modify: `src/components/tv/show-detail-header.tsx`

- [ ] **Step 1: Swap the import**

In `src/components/tv/show-detail-header.tsx`, replace:

```tsx
import EpisodeGroupSelector from "src/components/tv/episode-group-selector";
```

with:

```tsx
import EpisodeGroupAccordion from "src/components/tv/episode-group-accordion";
```

- [ ] **Step 2: Replace the component usage in EditShowDialog**

In the same file, replace:

```tsx
{
  /* Episode Ordering */
}
<EpisodeGroupSelector
  tmdbId={show.tmdbId}
  originCountry={EMPTY_STRING_ARRAY}
  genreIds={EMPTY_NUMBER_ARRAY}
  isAnimeOverride={seriesType === "anime"}
  value={episodeGroupId}
  onChange={setEpisodeGroupId}
/>;
```

with:

```tsx
{
  /* Episode Ordering */
}
<EpisodeGroupAccordion
  tmdbId={show.tmdbId}
  originCountry={EMPTY_STRING_ARRAY}
  genreIds={EMPTY_NUMBER_ARRAY}
  isAnimeOverride={seriesType === "anime"}
  value={episodeGroupId}
  onChange={setEpisodeGroupId}
/>;
```

- [ ] **Step 3: Widen the edit dialog**

In the same file, replace:

```tsx
      <DialogContent className="max-w-md">
```

with:

```tsx
      <DialogContent className="max-w-lg">
```

- [ ] **Step 4: Verify it compiles**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/tv/show-detail-header.tsx
git commit -m "feat: use EpisodeGroupAccordion in edit show dialog"
```

---

### Task 5: Delete Old Selector & Verify Build

**Files:**

- Delete: `src/components/tv/episode-group-selector.tsx`

- [ ] **Step 1: Verify no remaining imports of the old component**

Run: `grep -r "episode-group-selector" src/`
Expected: No results (both files were updated in Tasks 3 & 4)

- [ ] **Step 2: Delete the old component**

```bash
rm src/components/tv/episode-group-selector.tsx
```

- [ ] **Step 3: Run full build to verify everything works**

Run: `bun run build 2>&1 | tail -20`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add -u src/components/tv/episode-group-selector.tsx
git commit -m "refactor: remove old EpisodeGroupSelector dropdown"
```
