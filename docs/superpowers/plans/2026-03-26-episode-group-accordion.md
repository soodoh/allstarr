# Episode Group Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dropdown episode group selector with an accordion that previews season/episode structure, used in both add and edit TV flows.

**Architecture:** One new component (`EpisodeGroupAccordion`) built on shadcn's Accordion primitive, fetching group details lazily via React Query. Replaces `EpisodeGroupSelector` in both `tmdb-show-search.tsx` (add flow) and `show-detail-header.tsx` (edit flow). The old selector is deleted.

**Tech Stack:** React, TanStack Query, Radix Accordion (via shadcn/ui), TMDB API

---

## File Map

| File                                            | Action | Responsibility                                                                                      |
| ----------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `src/components/tv/episode-group-accordion.tsx` | Create | New accordion component with radio selection, lazy detail fetching, season rows with episode ranges |
| `src/components/tv/tmdb-show-search.tsx`        | Modify | Swap `EpisodeGroupSelector` → `EpisodeGroupAccordion`                                               |
| `src/components/tv/show-detail-header.tsx`      | Modify | Swap `EpisodeGroupSelector` → `EpisodeGroupAccordion`, widen dialog                                 |
| `src/components/tv/episode-group-selector.tsx`  | Delete | Replaced by accordion                                                                               |

---

### Task 1: Create the EpisodeGroupAccordion Component

**Files:**

- Create: `src/components/tv/episode-group-accordion.tsx`

This is the core component. It fetches episode group summaries, renders them as accordion items with radio selection, and lazily fetches group detail to show season breakdowns with episode ranges when expanded.

- [ ] **Step 1: Create the component file with imports, types, and helper functions**

```tsx
// src/components/tv/episode-group-accordion.tsx
import { useState, useMemo, useEffect } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
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
  getTmdbEpisodeGroupDetailFn,
} from "src/server/tmdb/shows";
import { EPISODE_GROUP_TYPES } from "src/server/tmdb/types";
import type {
  TmdbEpisodeGroupSummary,
  TmdbSeasonSummary,
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

/** Build season rows from TMDB default show detail seasons. */
function buildDefaultSeasonRows(seasons: TmdbSeasonSummary[]): SeasonRow[] {
  // Filter out specials (season 0) and sort by season number
  const sorted = seasons
    .filter((s) => s.season_number > 0)
    .toSorted((a, b) => a.season_number - b.season_number);

  let cumulative = 0;
  return sorted.map((s) => {
    const startEp = cumulative + 1;
    cumulative += s.episode_count;
    return {
      name: s.name,
      episodeCount: s.episode_count,
      startEp,
      endEp: cumulative,
    };
  });
}

/** Build season rows from an episode group detail. */
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

- [ ] **Step 3: Add the main EpisodeGroupAccordion component**

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

  // ── TMDB Default season rows ──

  const defaultSeasonRows = useMemo(
    () => (showDetail ? buildDefaultSeasonRows(showDetail.seasons) : []),
    [showDetail],
  );

  const defaultTotalEps = useMemo(
    () => defaultSeasonRows.reduce((sum, r) => sum + r.episodeCount, 0),
    [defaultSeasonRows],
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
                  {defaultSeasonRows.length} seasons · {defaultTotalEps} eps
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
            <SeasonRows
              rows={defaultSeasonRows}
              isLoading={showDetailLoading}
            />
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

- [ ] **Step 4: Add the EpisodeGroupItem component with lazy detail fetching**

Append to the same file, above the default export (or just below `SeasonRows`):

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

- [ ] **Step 5: Verify the component compiles**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `episode-group-accordion.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/tv/episode-group-accordion.tsx
git commit -m "feat: add EpisodeGroupAccordion component with season previews"
```

---

### Task 2: Integrate into Add Flow

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

### Task 3: Integrate into Edit Flow

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

- [ ] **Step 4: Remove the unused stable empty arrays if no longer needed**

Check whether `EMPTY_STRING_ARRAY` and `EMPTY_NUMBER_ARRAY` are still used. They are passed to the accordion component just like they were to the selector, so they are still needed. No change required.

- [ ] **Step 5: Verify it compiles**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/tv/show-detail-header.tsx
git commit -m "feat: use EpisodeGroupAccordion in edit show dialog"
```

---

### Task 4: Delete Old Selector & Verify Build

**Files:**

- Delete: `src/components/tv/episode-group-selector.tsx`

- [ ] **Step 1: Verify no remaining imports of the old component**

Run: `grep -r "episode-group-selector" src/`
Expected: No results (both files were updated in Tasks 2 & 3)

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
