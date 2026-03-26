# Anime Episode Numbering & TMDB Episode Groups

## Problem

TMDB's default season/episode structure is frequently wrong for anime in two distinct ways:

1. **Lumped seasons** — TMDB's rule states that when episode numbers are continuous (don't reset to 1), all episodes belong to one season. This causes shows like Jujutsu Kaisen (3 seasons, 59 episodes) and Apothecary Diaries (2 seasons, 48 episodes) to appear as a single massive season. 14+ anime are confirmed affected.

2. **Over-split seasons** — Long-running anime like Naruto Shippuden (20 arc-based seasons) and One Piece (22 arc-based seasons) are split by story arc on TMDB, but indexers exclusively use absolute episode numbering (episode 1 through 500+).

Additionally, indexers list anime releases in mixed formats — some use absolute numbering (`[SubsPlease] Jujutsu Kaisen - 49`), others use seasonal (`Jujutsu Kaisen S03E01`). Searching only one format misses releases in the other.

## Solution

Two features that work together:

1. **TMDB Episode Group Selection** — Let users pick an alternative episode ordering from TMDB's Episode Groups API. This fixes both lumped and over-split seasons by letting users choose the correct structure (e.g., "Seasons (Production)" for JJK, "Absolute" for One Piece).

2. **Dual-Format Anime Search** — When a show's series type is "anime", always search indexers with both absolute AND seasonal formats. Results are merged and deduplicated before scoring.

## Data Model Changes

### `shows` table — new column

| Column           | Type            | Default | Description                                                                            |
| ---------------- | --------------- | ------- | -------------------------------------------------------------------------------------- |
| `episodeGroupId` | text (nullable) | `null`  | TMDB episode group ID (24-char hex string). `null` means using TMDB default structure. |

### `episodes` table — existing column

| Column           | Type               | Description                                                               |
| ---------------- | ------------------ | ------------------------------------------------------------------------- |
| `absoluteNumber` | integer (nullable) | Already exists. Will now be populated for anime-type shows during import. |

No new tables needed.

## Feature 1: Episode Group Selection

### TMDB Episode Groups API

Two endpoints:

- **List groups**: `GET /tv/{series_id}/episode_groups` — returns available groups with `id`, `name`, `type`, `episode_count`, `group_count`, `network`
- **Get group detail**: `GET /tv/episode_group/{group_id}` — returns full structure with `groups[]` (virtual seasons), each containing `episodes[]` with an `order` field

Episode group types (integer enum):

| Type | Name              | Use Case                                |
| ---- | ----------------- | --------------------------------------- |
| 1    | Original Air Date | Broadcast order                         |
| 2    | Absolute          | Sequential numbering (common for anime) |
| 3    | DVD               | Physical media order                    |
| 4    | Digital           | Streaming platform order                |
| 5    | Story Arc         | Narrative grouping                      |
| 6    | Production        | Production order / official seasons     |
| 7    | TV                | Network-specific broadcast order        |

### Add Flow

When adding a show from TMDB search:

1. Fetch episode groups alongside show detail via `/tv/{id}/episode_groups`.
2. **If no groups exist** — import from TMDB default seasons. No episode group UI shown.
3. **If groups exist** — show a selector in the add form:
   - First option: "TMDB Default" with a "Recommended" badge for non-anime shows
   - Groups listed below, organized by type label
   - For anime shows, groups of type Absolute (2) or Production (6) get the "Recommended" badge instead
   - Each option displays: group name, type badge, episode count, group count
4. **Preview** — selecting a group shows a collapsible season breakdown (season names + episode counts). Individual episodes are not shown here.
5. **On confirm** — if a group is selected, fetch full group detail from `/tv/episode_group/{group_id}` and import from the group structure. Store `episodeGroupId` on the show row.

### Importing from an Episode Group

When importing seasons/episodes from an episode group instead of TMDB default:

- Each `group` in the response becomes a **season** (using `order` as season number, `name` as season name)
- Each episode's `order` field becomes its `episodeNumber` within that season
- The canonical `season_number` and `episode_number` from the episode object are available for cross-reference but not stored as the primary identifiers
- `absoluteNumber` is populated for anime-type shows (see Absolute Number Derivation)
- All other episode metadata (title, overview, airDate, tmdbId, etc.) comes from the canonical episode data

### Edit Flow (Switching Groups)

When changing the episode group on an already-imported show:

**Remapping process:**

1. **Snapshot existing links** — build map: `{ tmdbEpisodeId -> { episodeId, fileIds[], downloadProfileIds[] } }`
2. **Delete existing structure** — delete all seasons and episodes for the show (cascade handles episodeFiles and episodeDownloadProfiles)
3. **Re-import** — create new seasons/episodes from the new group (or TMDB default if switching back)
4. **Re-link by TMDB episode ID** — for each new episode, look up its `tmdbId` in the snapshot and re-create the associated `episodeDownloadProfiles` and `episodeFiles` entries with the new `episodeId`
5. **Handle orphans:**
   - Episodes in the old group but NOT in the new: files exist on disk but have no episode. Surface a warning in the UI so the user can decide what to do.
   - Episodes in the new group but NOT in the old: no files or profiles. Treated as new episodes; user can apply monitoring options.

**UI:**

- Available in show settings/edit page
- Same selector as add flow (dropdown with type badges, recommended badges)
- Confirmation dialog: "This will reorganize seasons and episodes. Existing files and monitoring will be remapped. N episodes in the current structure have no match in the new one — their files will be orphaned."

### Episode Group UI Visibility

- Episode group UI is shown for **any show that has episode groups**, regardless of whether it's anime
- If a show has no episode groups, no UI is shown — the TMDB default is used silently
- Western shows (The Office, Doctor Who, Firefly, etc.) also have episode groups and benefit from this feature
- The only anime-specific behavior is which groups get the "Recommended" badge

### Smart Defaults / Recommendations

Anime detection heuristic: `origin_country` includes `"JP"` AND `genres` includes Animation (ID 16).

| Show Type | "Recommended" Badge On                        |
| --------- | --------------------------------------------- |
| Anime     | Groups of type Absolute (2) or Production (6) |
| Non-anime | "TMDB Default" option                         |

When adding an anime-detected show, also default the `seriesType` dropdown to `"anime"` instead of `"standard"` (user can override).

## Feature 2: Dual-Format Anime Search

When `seriesType` is `"anime"`, the search fires two requests per wanted episode:

### Search 1 — Absolute format

- API mode: `t=search` (free text query)
- Query: `?t=search&q={title}+{absoluteNumber}` (zero-padded to 2+ digits)
- Categories: anime categories from indexer config

### Search 2 — Seasonal format

- API mode: `t=tvsearch` (structured parameters)
- Query: `?t=tvsearch&q={title}&season={seasonNumber}&ep={episodeNumber}`
- Categories: same anime categories

### Result Handling

- Results from both searches are merged
- Deduplicated by release GUID (or title+size fallback) via existing `dedupeAndScoreReleases()`
- Scored and ranked as normal after merge

### Edge Cases

- If `absoluteNumber` is null for an episode (e.g., a special), only the seasonal search fires
- Standard and daily series types are unchanged — single search format as today

### Code Impact

- `buildEpisodeSearchQuery()` in `src/server/auto-search.ts` needs to return multiple queries (or the caller invokes it twice with different modes)
- `WantedEpisode` type needs `absoluteNumber` added to it
- The search execution path needs to handle merging results from two queries per episode

## Absolute Number Derivation

For anime-type shows, `absoluteNumber` is computed at import time and stored on each episode row.

### Case 1: Absolute episode group selected (type 2)

The group contains all episodes in a single virtual season. Each episode's `order + 1` is the absolute number.

### Case 2: Non-Absolute group or TMDB default with multiple seasons

Compute as cumulative count across seasons, ordered by season number. Season 0 (Specials) is excluded.

Example: S1 has 24 episodes, S2 has 23 episodes. S2E01 = absolute 25, S2E23 = absolute 47.

### Case 3: Single TMDB season (already lumped)

Episode numbers already are absolute numbers. S1E150 = absolute 150.

### Recomputation

Absolute numbers are recomputed whenever:

- A show is first added
- An episode group is switched
- The series type is changed to/from "anime"

## Non-Goals

- No external mapping files (anime-lists, TheXEM) — TMDB episode groups are the sole source
- No automatic episode group selection — user always chooses (with smart recommendations)
- No changes to standard/daily series type behavior
- No anime-specific indexer categories configuration (use existing indexer setup)

## Research: Affected Shows

### Lumped Seasons (TMDB puts multiple seasons into one)

| Show                | TMDB Default       | Actual Seasons  | Episode Group Fix           |
| ------------------- | ------------------ | --------------- | --------------------------- |
| Jujutsu Kaisen      | 1 season, 59 eps   | 3 seasons       | Seasons (Production)        |
| Apothecary Diaries  | 1 season, 48 eps   | 2 seasons       | Seasons (Original Air Date) |
| Dandadan            | 1 season, 24 eps   | 2 seasons       | Seasons (Production)        |
| Bungo Stray Dogs    | 1 season, 60 eps   | 5 seasons       | Available                   |
| Kaiju No. 8         | 1 season, 23 eps   | 2 seasons       | Available                   |
| Rent-a-Girlfriend   | 1 season, 50 eps   | 4 seasons       | Available                   |
| My Dress-Up Darling | 1 season, 24 eps   | 2 seasons       | Unconfirmed                 |
| Boruto              | 1 season, 293 eps  | Continuous      | Arc-based groups            |
| Black Clover        | 1 season, 170 eps  | Continuous      | 4-season split in groups    |
| Dragon Ball Super   | 1 season, 131 eps  | Continuous      | Story arc groups            |
| Detective Conan     | 1 season, 1196 eps | Continuous      | Season split groups         |
| Bleach (original)   | 1 season, 366 eps  | 16 TVDB seasons | Crunchyroll/TVDB splits     |
| Gundam IBO          | 1 season, 50 eps   | 2 seasons       | Available                   |

### Absolute Numbering (indexers use absolute, TMDB has multiple seasons)

| Show                 | TMDB Seasons   | Eps Reset?      | Absolute Group? | Heuristic Works? |
| -------------------- | -------------- | --------------- | --------------- | ---------------- |
| One Piece            | 22 arc seasons | No (continuous) | Yes             | Yes              |
| Naruto               | 4 seasons      | No (continuous) | N/A             | Yes              |
| Naruto Shippuden     | 20 seasons     | No (continuous) | N/A             | Yes              |
| Hunter x Hunter 2011 | 3 seasons      | No (continuous) | Yes             | Yes              |
| Fairy Tail           | 8 seasons      | Yes (resets)    | Yes             | No               |
| Gintama              | 11 seasons     | Yes (resets)    | Yes             | No               |
| Dragon Ball Z        | 9 seasons      | Yes (resets)    | No              | No               |
| InuYasha             | 2 seasons      | Yes (resets)    | Yes             | No               |
| Pokemon              | 25 seasons     | Yes (resets)    | Yes             | No               |

### Shows Correct Out of the Box

| Show             | TMDB Seasons | Indexer Format     | Match?  |
| ---------------- | ------------ | ------------------ | ------- |
| My Hero Academia | 8 seasons    | S01-S08            | Yes     |
| Demon Slayer     | 5 seasons    | S01-S05            | Mostly  |
| Attack on Titan  | 4 seasons    | S01-S04 + absolute | Partial |

### Western Shows with Episode Groups (not affected by anime issues)

| Show              | Episode Groups | Types                                           |
| ----------------- | -------------- | ----------------------------------------------- |
| The Office        | 8 groups       | DVD, Digital (Peacock, iTunes, Amazon), Blu-ray |
| Doctor Who (1963) | 5 groups       | DVD, Digital, Story Arc                         |
| Firefly           | 2 groups       | Absolute (intended), DVD                        |
| The Simpsons      | 2 groups       | Digital (Disney+), Production                   |
| Game of Thrones   | 1 group        | Original Air Date                               |
| Stranger Things   | 1 group        | Original Air Date (volume splits)               |
| Breaking Bad      | 0 groups       | N/A                                             |
