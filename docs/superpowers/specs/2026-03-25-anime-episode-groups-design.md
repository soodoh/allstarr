# Anime Episode Numbering & TMDB Episode Groups

## Problem

TMDB's default season/episode structure is frequently wrong for anime in two distinct ways:

1. **Lumped seasons** — TMDB's rule states that when episode numbers are continuous (don't reset to 1), all episodes belong to one season. This causes shows like Jujutsu Kaisen (3 seasons, 59 episodes) and Apothecary Diaries (2 seasons, 48 episodes) to appear as a single massive season. 14+ anime are confirmed affected.

2. **Over-split seasons** — Long-running anime like Naruto Shippuden (20 arc-based seasons) and One Piece (22 arc-based seasons) are split by story arc on TMDB, but indexers exclusively use absolute episode numbering (episode 1 through 500+).

Additionally, indexers list anime releases in two distinct formats depending on the release group:

- **Fansubs** (SubsPlease, Erai-raws, etc.) almost universally use **absolute numbering**: `[SubsPlease] Jujutsu Kaisen - 49`
- **WEB-DL/scene groups** (VARYG, EMBER, etc.) almost universally use **seasonal format**: `Jujutsu Kaisen S03E01`

This dual-format reality means searching only one format will always miss releases from the other ecosystem.

## Solution

Two independent features that address different aspects of the problem:

1. **TMDB Episode Group Selection** — Let users pick an alternative episode ordering from TMDB's Episode Groups API. This fixes the season/episode _structure_ in the database (e.g., "Seasons (Production)" splits JJK into proper S1/S2/S3; "Absolute" flattens One Piece into one list). Available for any show with episode groups, not just anime.

2. **Dual-Format Anime Search** — When a show's series type is "anime", always search indexers with both absolute AND seasonal formats. This determines the _search behavior_, independent of which episode group is selected. Results are merged and deduplicated before scoring.

These two features are **independent decisions**:

- **Episode Group** = fixes season/episode structure in the DB
- **Series Type** = determines search format (Standard = S##E## only, Anime = both absolute + S##E##)

A show like Apothecary Diaries would use an episode group to fix lumped seasons AND series type "anime" for dual-format search. A show like My Hero Academia needs no episode group (TMDB default is correct) but still benefits from series type "anime" for dual search.

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
   - First option: "TMDB Default"
   - Groups listed below, organized by type label
   - One option receives a "Recommended" badge (see Smart Defaults below)
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

**Recommendation algorithm:**

1. **Non-anime shows**: "TMDB Default" gets the "Recommended" badge. Western shows are almost always correct out of the box.

2. **Anime shows — detect if default structure is correct**: Check if TMDB default seasons have episodes that reset to E01 at each season boundary AND there are multiple seasons. If so, the default is likely correct (e.g., My Hero Academia, Demon Slayer). Recommend "TMDB Default".

3. **Anime shows — lumped seasons detected**: If the default has a single non-specials season with many episodes (or episodes don't reset across few seasons), recommend the best season-splitting episode group. Prefer types in this order: Production (6) > Original Air Date (1) > TV (7). Among groups of the same preferred type, prefer the one with the most episodes (to include specials and avoid missing data).

4. **Tiebreaker**: When multiple groups of equal type-priority exist, prefer the one with the highest episode count.

**Worked examples:**

| Show               | Default Structure           | Recommended                                    | Why                                                                                         |
| ------------------ | --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| My Hero Academia   | 8 seasons, eps reset        | TMDB Default                                   | Default is correct                                                                          |
| Demon Slayer       | 5 seasons, eps reset        | TMDB Default                                   | Default is correct                                                                          |
| Jujutsu Kaisen     | 1 season, 59 eps            | Seasons (Production) — 4 groups, 64 eps        | Lumped; Production type preferred                                                           |
| Apothecary Diaries | 1 season, 48 eps            | Seasons (Original Air Date) — 3 groups, 98 eps | Lumped; no Production group, Air Date next                                                  |
| Dandadan           | 1 season, 24 eps            | Seasons (Production) — 2 groups, 24 eps        | Lumped; Production type preferred                                                           |
| Bungo Stray Dogs   | 1 season, 60 eps            | Seasons (TV) — 5 groups, 61 eps                | Lumped; no Production/Air Date, TV next                                                     |
| One Piece          | 22 seasons, eps don't reset | TMDB Default                                   | Continuous numbering but multi-season; default is usable (absolute derived from cumulative) |
| Attack on Titan    | 4 seasons, eps reset        | TMDB Default                                   | Default is correct                                                                          |
| The Office         | 9 seasons                   | TMDB Default                                   | Non-anime                                                                                   |

**Series type auto-default**: When adding an anime-detected show, default the `seriesType` dropdown to `"anime"` instead of `"standard"` (user can override).

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

For anime-type shows, `absoluteNumber` is computed at import time and stored on each episode row. The absolute number represents the canonical position of an episode in the full series run.

### Case 1: Single season (lumped or naturally single)

When all episodes are in one season (e.g., Black Clover: 170 eps in S1, or JJK on TMDB default: 59 eps in S1), the episode number IS the absolute number.

Example: S1E49 = absolute 49.

### Case 2: Multiple seasons with continuous numbering (episodes don't reset)

When seasons exist but episode numbers continue across boundaries (e.g., Naruto Shippuden default: S1=E1-E32, S2=E33-E53), the episode number itself is already the absolute number.

Example: S2E33 = absolute 33. The season boundary is just organizational.

### Case 3: Multiple seasons with reset numbering (episodes restart at E01)

When episode numbers reset at each season (e.g., JJK with Production group: S1 has 24 eps, S2 has 23 eps), compute absolute as cumulative count. Season 0 (Specials) is excluded.

Example: S1 has 24 episodes, S2 has 23 episodes. S2E01 = absolute 25, S2E23 = absolute 47.

### Case 4: Absolute episode group selected (type 2)

The group contains all episodes in a single virtual season. Each episode's `order + 1` is the absolute number. This is a special case of Case 1.

### Detection logic

To determine which case applies, check the first episode of each non-specials season:

- If there's only 1 non-specials season -> Case 1
- If season 2's first episode has `episodeNumber > 1` -> Case 2 (continuous)
- If season 2's first episode has `episodeNumber == 1` -> Case 3 (reset, compute cumulative)

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

## Research: Indexer Format by Show

Fansub groups (SubsPlease, Erai-raws) almost universally use absolute numbering for anime. WEB-DL/scene groups (VARYG, EMBER) almost universally use S##E## seasonal format. This dual reality is why dual-format search is needed.

### Long-Running Shows (Absolute dominant)

| Show             | TMDB Default                | Fansub Format   | WEB-DL Format              | Best Episode Group                |
| ---------------- | --------------------------- | --------------- | -------------------------- | --------------------------------- |
| One Piece        | 22 arc seasons, 1155 eps    | Absolute (1155) | S01E1155                   | Default or Absolute (No Specials) |
| Naruto Shippuden | 20 arc seasons, 500 eps     | Absolute (500)  | Absolute                   | Correct Order (Air Date)          |
| Fairy Tail       | 8 seasons, 328 eps          | Absolute (328)  | Absolute                   | Correct Order (Absolute)          |
| Gintama          | 11 seasons, 367 eps         | Absolute (367)  | Absolute                   | Gintama (Absolute, 383 eps)       |
| Bleach           | 1 season, 366 eps + TYBW S2 | Absolute (366)  | Absolute / S01E## for TYBW | TVDB Order (Air Date, 410 eps)    |
| Black Clover     | 1 season, 170 eps           | Absolute (170)  | Absolute                   | Default works (already 1 season)  |
| Boruto           | 1 season, 293 eps           | Absolute (293)  | Absolute                   | Default works (already 1 season)  |
| Detective Conan  | 1 season, 1196 eps          | Absolute (1196) | S01E1196                   | Default works (already 1 season)  |

### Lumped-Season Shows (Both formats on indexers)

| Show                | TMDB Default            | Fansub Format               | WEB-DL Format | Best Episode Group                      |
| ------------------- | ----------------------- | --------------------------- | ------------- | --------------------------------------- |
| Jujutsu Kaisen      | 1 season, 59 eps        | Absolute (49)               | S03E01        | Seasons (Production) — 4 groups, 64 eps |
| Apothecary Diaries  | 1 season, 48 eps        | Absolute (48)               | S02E01        | Seasons (Air Date) — 3 groups, 98 eps   |
| Dandadan            | 1 season, 24 eps        | Absolute (24)               | S02E01        | Seasons (Production) — 2 groups, 24 eps |
| Bungo Stray Dogs    | 1 season, 60 eps        | Absolute (61)               | S05E01        | Seasons (TV) — 5 groups, 61 eps         |
| Kaiju No. 8         | 1 season, 23 eps        | Absolute (23)               | S02E01        | Seasons (Production) — 3 groups, 24 eps |
| Rent-a-Girlfriend   | 1 season, 50 eps        | Absolute (48)               | S03E01        | Seasons (Production) — 4 groups, 48 eps |
| Spy x Family        | 3 seasons (wrong split) | Absolute (50)               | S03E01        | Cours (Air Date) — 4 groups, 50 eps     |
| Oshi no Ko          | 1 season, 35 eps        | Absolute (24) then reset S3 | S03E01        | Seasons (Production) — 4 groups, 37 eps |
| My Dress-Up Darling | 1 season, 24 eps        | Absolute (24)               | S02E01        | Unconfirmed                             |

### Shows Correct Out of the Box

| Show             | TMDB Default                 | Fansub Format  | WEB-DL Format | Episode Group Needed? |
| ---------------- | ---------------------------- | -------------- | ------------- | --------------------- |
| My Hero Academia | 8 seasons, eps reset         | Absolute (170) | S01-S08       | No, default correct   |
| Demon Slayer     | 5 seasons, eps reset per arc | Reset per arc  | S01-S05       | No, default correct   |
| Attack on Titan  | 4 seasons, eps reset         | Absolute (87)  | S01-S04       | No, default correct   |

### Western Shows with Episode Groups

| Show              | Episode Groups | Types                                           |
| ----------------- | -------------- | ----------------------------------------------- |
| The Office        | 8 groups       | DVD, Digital (Peacock, iTunes, Amazon), Blu-ray |
| Doctor Who (1963) | 5 groups       | DVD, Digital, Story Arc                         |
| Firefly           | 2 groups       | Absolute (intended), DVD                        |
| The Simpsons      | 2 groups       | Digital (Disney+), Production                   |
| Game of Thrones   | 1 group        | Original Air Date                               |
| Stranger Things   | 1 group        | Original Air Date (volume splits)               |
| Breaking Bad      | 0 groups       | N/A                                             |

### Episode Group Details for Key Shows

**One Piece** (16 groups): Seasons (Production) 24 groups/1194 eps, TVDB Order 23 groups/1192 eps, Absolute (No Specials) 1 group/1155 eps, Absolute (With Specials) 2 groups/1193 eps, Story Arc 54 groups/1194 eps, plus various Digital groups (Crunchyroll, Netflix, Hulu, etc.)

**Naruto Shippuden** (11 groups): Correct Order 1 group/500 eps, Absolute Order 2 groups/503 eps, plus various Story Arc and TV groups

**Fairy Tail** (8 groups): Correct Order (Absolute) 1 group/328 eps, Production 9 groups/328 eps, plus Crunchyroll, DVD, Arc groups

**Bleach** (11 groups): TVDB Order 18 groups/410 eps, No Specials 2 groups/406 eps, Crunchyroll Season Split 16 groups/392 eps, plus various DVD/Digital/Arc groups

**Attack on Titan** (11 groups): All Episodes (Absolute) 1 group/89 eps, All Episodes + OVAs (Absolute) 1 group/97 eps, Seasons + OVAs (Production) 5 groups/97 eps, Original Production + OVAs (Production) 8 groups/136 eps, plus DVD, Story Arc groups
