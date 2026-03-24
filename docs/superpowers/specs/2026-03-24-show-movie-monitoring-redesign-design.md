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

### Unmonitor Dialog Reuse

The existing `UnmonitorDialog` component from the books feature should be reused for episodes, seasons, and show-level unmonitoring. It already handles the confirmation + file deletion pattern.

## Toggle Behavior Matrix

| Level        | Click ON                                | Click OFF                                                  | Click PARTIAL                                        |
| ------------ | --------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Show icon    | Monitor all episodes for profile        | Unmonitor dialog → remove profile from all episodes        | Monitor all remaining unmonitored episodes           |
| Season icon  | Monitor all season episodes for profile | Unmonitor dialog → remove profile from all season episodes | Monitor all remaining unmonitored episodes in season |
| Episode icon | Monitor episode for profile             | Unmonitor dialog → remove profile from episode             | N/A (episodes are binary)                            |
| Movie icon   | Monitor movie for profile               | Unmonitor dialog → remove profile from movie               | N/A (movies are binary)                              |
