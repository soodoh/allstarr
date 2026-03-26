# Episode Group Accordion Preview

Replace the dropdown-based episode group selector with an accordion UI that lets users visually preview the season/episode structure of each TMDB episode group before selecting one. Used in both the add and edit flows for TV series.

## Problem

The current episode group selector is a plain dropdown showing group name, type badge, and summary counts (e.g., "9 seasons, 100 eps"). Users can't see how episodes are distributed across seasons, making it hard to judge whether a group splits seasons correctly — which is the whole point of choosing an episode group.

Additionally, the recommended group is only tagged with a badge but not preselected, requiring an extra click.

## Design

### Accordion Component (`EpisodeGroupAccordion`)

A single shared component replacing the existing `EpisodeGroupSelector` in both flows.

**Structure:**

Each episode group is an accordion item with:

- **Header row** (always visible): Radio dot, group name, type badge (Production/Absolute/etc.), recommended badge (if applicable), summary counts ("9 seasons, 100 eps")
- **Expanded body** (on click): Season rows showing season name, episode range (`E01–E13`, `E14–E26`), and episode count

The "TMDB Default" option is always the first item, representing the show's native TMDB season structure.

**Interaction:**

- Clicking an accordion header selects that group (radio) AND toggles expansion
- Only one group is expanded at a time
- Selecting a group calls `onChange(groupId | null)`

### Preselection Logic

**Add flow (no existing value):**

1. On mount, when groups load, run `getRecommendedGroup()` (existing logic: prefers Production > Original Air Date > TV for anime; TMDB Default for non-anime)
2. Call `onChange(recommendedId)` to preselect
3. Auto-expand the preselected group

**Edit flow (existing value):**

1. The passed-in `value` (show's current `episodeGroupId`) is already selected
2. Auto-expand the selected group
3. Recommended badge still shows for reference but doesn't override the existing selection

### Episode Range Computation

Episode ranges must use actual episode numbers from the API, not derived from counts — some shows use absolute numbering where seasons don't start at E01.

**TMDB Default seasons:** Fetch each season's detail via `getTmdbSeasonDetailFn` to get actual `episode_number` values. The range is the first and last episode's `episode_number` within that season.

**Episode groups:** From the group detail API, each `TmdbEpisodeGroup` has an `episodes` array. The range uses each episode's `order + 1` (their position within that group), since that's how they'll be numbered when imported with that grouping.

Display format: `E{start}–E{end}` (zero-padded to 2 digits). This naturally reveals whether numbering is continuous across seasons or resets.

### Data Fetching

1. **Episode group summaries**: Fetched via `getTmdbEpisodeGroupsFn` on mount — provides headers for all accordion items
2. **Episode group details**: Fetched lazily via `getTmdbEpisodeGroupDetailFn` when a group is expanded. The preselected group fetches immediately. Results cached by React Query.
3. **TMDB Default season data**: Show detail fetched via `getTmdbShowDetailFn` on mount for season summaries (headers). When expanded, each season's detail is lazily fetched via `getTmdbSeasonDetailFn` to get actual episode numbers for ranges.

### TMDB Response Caching

Both the accordion preview and the import (`addShowFn`) call `tmdbFetch` for the same endpoints. To avoid duplicate API calls, `tmdbFetch` is extended with a short-lived in-memory cache (5-minute TTL). When the user previews a group in the accordion and then clicks "Add Show", the import hits the cache instead of re-fetching from TMDB.

### Integration Points

**Add flow (`src/components/tv/tmdb-show-search.tsx`):**

- Replace `<EpisodeGroupSelector>` with `<EpisodeGroupAccordion>`
- Props: `tmdbId`, `originCountry`, `genreIds`, `value`, `onChange`
- No other changes to the add form

**Edit flow (`src/components/tv/show-detail-header.tsx`):**

- Replace `<EpisodeGroupSelector>` in `EditShowDialog` with `<EpisodeGroupAccordion>`
- Bump dialog width from `max-w-md` to `max-w-lg`
- Pass `isAnimeOverride` prop (derived from `seriesType === "anime"`)

**Cleanup:**

- Delete `src/components/tv/episode-group-selector.tsx` — fully replaced by the new accordion component

### Props Interface

```typescript
type EpisodeGroupAccordionProps = {
  tmdbId: number;
  originCountry: string[];
  genreIds: number[];
  value: string | null;
  onChange: (groupId: string | null) => void;
  isAnimeOverride?: boolean;
};
```

Same interface as the existing `EpisodeGroupSelector` for drop-in replacement.

## Files Changed

| File                                            | Change                                                  |
| ----------------------------------------------- | ------------------------------------------------------- |
| `src/server/tmdb/client.ts`                     | Add in-memory response cache (5-min TTL) to `tmdbFetch` |
| `src/components/tv/episode-group-accordion.tsx` | New component                                           |
| `src/components/tv/tmdb-show-search.tsx`        | Swap `EpisodeGroupSelector` for `EpisodeGroupAccordion` |
| `src/components/tv/show-detail-header.tsx`      | Swap selector, widen dialog to `max-w-lg`               |
| `src/components/tv/episode-group-selector.tsx`  | Delete                                                  |
