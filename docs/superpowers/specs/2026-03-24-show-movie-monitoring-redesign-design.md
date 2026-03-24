# Show & Movie Page Monitoring Redesign

## Summary

Redesign the show and movie detail pages to match the author/book page patterns: remove monitoring toggles and download profile selectors from the Details card, add an Edit button in the top-right action bar, and introduce per-profile monitoring icons at every level (show/movie, season, episode).

## Changes by Page

### Movie Detail Page

**Header actions bar:**

- Add an "Edit" button (Pencil icon) to the action bar alongside TMDB and Delete
- Edit button opens a dialog with `ProfileCheckboxGroup` for assigning movie-type download profiles (same pattern as Author page's `AuthorForm`)

**Title area:**

- Add `ProfileToggleIcons` stacked vertically to the left of the movie title (same as Book detail page)
- One icon per assigned download profile, independently toggleable
- Toggling OFF triggers unmonitor dialog with optional file deletion (reuse existing `UnmonitorDialog` pattern from books)
- Toggling ON directly monitors the movie for that profile

**Details card:**

- Remove the "Monitored" switch row
- Remove the "Download Profiles" row and its inline edit dialog
- Keep all other metadata rows (Year, Studio, Runtime, Status, Min. Availability, Genres, IMDB)

### Show Detail Page

**Header actions bar:**

- Add an "Edit" button (Pencil icon) to the action bar alongside TMDB and Delete
- Edit button opens a dialog with `ProfileCheckboxGroup` for assigning TV-type download profiles

**Title area:**

- Add `ProfileToggleIcons` stacked vertically to the left of the show title
- One icon per assigned download profile
- **Three visual states**: full (all episodes monitored), partial (some episodes monitored), none (no episodes monitored for that profile)
- Toggling ON monitors ALL episodes in the show for that profile
- Toggling OFF triggers unmonitor dialog, then unmonitors ALL episodes for that profile

**Details card:**

- Remove the "Monitored" switch row
- Remove the "Download Profiles" row and its inline edit dialog
- Keep all other metadata rows (Year, Network, Runtime, Status, Series Type, Genres, Episodes)

**Season accordion trigger:**

- Move profile monitoring icons to the **leftmost position**, next to the season group title
- One icon button per download profile assigned to the show
- **Three visual states**: full (all episodes in season monitored), partial (some monitored), none (no episodes monitored for that profile)
- Toggling ON monitors all episodes in that season for that profile
- Toggling OFF triggers unmonitor dialog, then unmonitors all episodes in that season
- Remove the existing single eye icon

**Episode rows:**

- Add monitor column as the **leftmost column** (before episode number)
- **No column header** for the monitor column
- One icon button per download profile, with tooltip showing profile name
- Two states: on (monitored) or off (not monitored)
- Toggling OFF triggers unmonitor dialog with optional file deletion
- Toggling ON directly monitors the episode for that profile
- Remove the existing single eye icon from the rightmost "Mon." column

## Data Model Changes

### New Junction Table: `episodeDownloadProfiles`

Replace the `episodes.monitored` boolean with a per-profile junction table:

```
episodeDownloadProfiles
├── id: integer (PK, autoincrement)
├── episodeId: integer (FK → episodes.id, onDelete: cascade)
├── downloadProfileId: integer (FK → downloadProfiles.id, onDelete: cascade)
└── UNIQUE(episodeId, downloadProfileId)
```

An episode is "monitored for profile X" if a row exists in this table. No row = not monitored.

### Remove `episodes.monitored`

The `episodes.monitored` boolean column is replaced by the junction table. An episode with at least one entry in `episodeDownloadProfiles` is considered monitored.

### Remove `shows.monitored`

The show-level `monitored` boolean is no longer needed. A show's monitoring state is derived from whether any episodes have entries in `episodeDownloadProfiles`.

### Remove `movies.monitored`

Movies already have `movieDownloadProfiles`. A movie is "monitored for profile X" if a row exists in that junction table — same as books. The `movies.monitored` boolean becomes redundant.

### Remove `seasons.monitored`

Season monitoring state is derived from the episodes within that season.

## Component Changes

### `ProfileToggleIcons` — Enhancement

The existing `ProfileToggleIcons` component supports two states (active/inactive). It needs a third **partial** state for show-level and season-level use:

```typescript
type ProfileToggleIconsProps = {
  profiles: Array<{ id: number; name: string; icon: string }>;
  activeProfileIds: number[];
  partialProfileIds?: number[]; // NEW: profiles with some but not all monitored
  onToggle: (profileId: number) => void;
  isPending?: boolean;
  size?: "sm" | "lg";
  direction?: "horizontal" | "vertical";
};
```

Visual states:

- **Active** (all monitored): `bg-primary/15 text-primary` — full opacity, blue tint
- **Partial** (some monitored): `bg-primary/8 text-primary/45` — half opacity, dimmed blue tint
- **Inactive** (none monitored): `bg-muted text-muted-foreground` — gray

Clicking a **partial** icon should monitor all (treat as "toggle on the remaining").

### `ShowDetailHeader` — Refactor

- Remove monitored switch and download profiles section from details card
- Add Edit button to action bar
- Add Edit dialog with `ProfileCheckboxGroup` (filtered to TV content type)
- Add `ProfileToggleIcons` to the left of the title with `partialProfileIds` computed from episode data

### `SeasonAccordion` — Refactor

- Replace single eye icon with `ProfileToggleIcons` (horizontal, small) on the leftmost side of the trigger
- Compute `activeProfileIds` and `partialProfileIds` from episodes in the season
- Handle toggle with bulk monitor/unmonitor mutations

### `EpisodeRow` — Refactor

- Remove the rightmost "Mon." column (single eye icon)
- Add leftmost column with `ProfileToggleIcons` (horizontal, small)
- Two states only (active/inactive) — no partial at episode level
- Handle toggle with individual monitor/unmonitor mutations

### `MovieDetailHeader` — Refactor

- Remove monitored switch and download profiles section from details card
- Add Edit button to action bar
- Add Edit dialog with `ProfileCheckboxGroup` (filtered to movie content type)
- Add `ProfileToggleIcons` to the left of the title (same as Book detail page)

## Server Function Changes

### New: `monitorEpisodeProfileFn`

Add a download profile to an episode (create row in `episodeDownloadProfiles`).

### New: `unmonitorEpisodeProfileFn`

Remove a download profile from an episode (delete row from `episodeDownloadProfiles`). Accepts optional `deleteFiles` flag.

### New: `bulkMonitorEpisodeProfileFn`

Add a download profile to multiple episodes at once (for season-level and show-level toggles). Accepts `{ episodeIds: number[], downloadProfileId: number }`.

### New: `bulkUnmonitorEpisodeProfileFn`

Remove a download profile from multiple episodes at once. Accepts `{ episodeIds: number[], downloadProfileId: number, deleteFiles?: boolean }`.

### Update: `updateShowFn`

Still handles `downloadProfileIds` for assigning profiles to the show (via Edit modal). No longer handles `monitored` boolean.

### Update: `updateMovieFn`

No longer handles `monitored` boolean. Profile assignment via `movieDownloadProfiles` remains unchanged.

### Update: `getShowDetailFn`

Return `episodeDownloadProfileIds` per episode (array of profile IDs) instead of `monitored` boolean. Also compute and return per-season aggregate state.

### Update: `getMovieDetailFn`

No longer return `monitored` boolean. The `downloadProfileIds` array already conveys monitoring state.

## Migration Strategy

### Database Migration

1. Create `episodeDownloadProfiles` table
2. Migrate existing data: for each episode where `monitored = true`, insert rows for all download profiles assigned to the parent show
3. Drop `episodes.monitored` column
4. Drop `shows.monitored` column
5. Drop `movies.monitored` column
6. Drop `seasons.monitored` column

### Unmonitor Dialog

The existing `UnmonitorDialog` (`src/components/bookshelf/books/unmonitor-dialog.tsx`) is book-specific (props: `bookTitle`, `fileCount`, copy references "editions" and "this book"). Generalize it into a shared component that accepts:

- `itemTitle: string` — the entity name (book title, episode title, season label, movie title)
- `profileName: string` — the profile being unmonitored
- `fileCount: number` — number of files that could be deleted
- `itemType: "book" | "episode" | "season" | "show" | "movie"` — for contextual copy
- `onConfirm: (deleteFiles: boolean) => void`

The copy should adapt: "This will stop searching for {itemType} {itemTitle} for {profileName}" with the file deletion checkbox when `fileCount > 0`.

### `applyMonitoringOption` — Update

The existing `applyMonitoringOption` function in `src/server/shows.ts` sets `episodes.monitored` to true/false based on a preset option (all, future, missing, existing, pilot, firstSeason, lastSeason, none). Under the new model, this function must insert/delete rows in `episodeDownloadProfiles` instead of flipping a boolean:

- Determine which episodes match the option (same logic as today)
- For matched episodes, insert rows in `episodeDownloadProfiles` for each of the show's assigned download profiles
- For non-matched episodes, ensure no rows exist in `episodeDownloadProfiles`

This is called during `addShowFn` when a show is first added. The show's `downloadProfileIds` are known at that point since they're passed alongside the monitoring option.

### Edge Case: All Profiles Removed via Edit Modal

When a user removes ALL download profiles from a movie or show via the Edit dialog:

- All `movieDownloadProfiles` / `showDownloadProfiles` rows are deleted (existing behavior)
- For shows: all `episodeDownloadProfiles` rows for the removed profiles are also deleted (handled in `updateShowFn` application code — no DB-level cascade exists between `showDownloadProfiles` and `episodeDownloadProfiles`)
- No `ProfileToggleIcons` are rendered (nothing to show)
- The entity is effectively unmonitored
- To re-monitor, the user must use the Edit button to assign profiles again, at which point icons reappear

This matches the book/author pattern: if an author has no profiles, books show no toggle icons.

## Out of Scope

- **Show/movie list pages**: The `getShowsFn` and `getMoviesFn` list queries currently select `shows.monitored` / `movies.monitored`. After removing these columns, the list views will need updating too. This is a follow-up task, not part of this spec.
- **Bulk bars**: The show and movie bulk action bars reference `monitored` toggles. These will need updating in a follow-up.

## Toggle Behavior Matrix

| Level        | Click ON                                | Click OFF                                                  | Click PARTIAL                                        |
| ------------ | --------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Show icon    | Monitor all episodes for profile        | Unmonitor dialog → remove profile from all episodes        | Monitor all remaining unmonitored episodes           |
| Season icon  | Monitor all season episodes for profile | Unmonitor dialog → remove profile from all season episodes | Monitor all remaining unmonitored episodes in season |
| Episode icon | Monitor episode for profile             | Unmonitor dialog → remove profile from episode             | N/A (episodes are binary)                            |
| Movie icon   | Monitor movie for profile               | Unmonitor dialog → remove profile from movie               | N/A (movies are binary)                              |
