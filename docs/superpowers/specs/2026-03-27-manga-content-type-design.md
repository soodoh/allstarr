# Manga Content Type Design Spec

## Overview

Add manga as a first-class content type in Allstarr, using MangaUpdates as the authoritative metadata source and existing Newznab/Torznab indexers for downloads. Manga follows the same Manga → Volume → Chapter hierarchy as Show → Season → Episode, reusing shared infrastructure (download profiles, tracked downloads, history) while adding manga-specific schema and UI.

**Scope:** Manga, manhwa, and manhua. Track + download only — no in-app reader. Users read with external apps (Komga, Kavita, etc.).

## Metadata Source: MangaUpdates

MangaUpdates (Baka-Updates) is the authoritative metadata source. It provides a public REST API (`api.mangaupdates.com/v1`) with no authentication required for reads.

### Why MangaUpdates

- **No DMCA issues** — metadata-only database, no hosted content
- **Chapter-level release tracking** — individual release records with chapter number, volume number, scanlation group, and date
- **Up-to-date** — weekly releases appear within hours (Chainsaw Man ch.232 added Mar 24, 2026)
- **Broad coverage** — tested across popular ongoing (One Piece, Dandadan), completed classics (Naruto, Death Note, FMA), niche titles (Yokohama Kaidashi Kikou, Spirit Circle, Houseki no Kuni), and manhwa (Solo Leveling, Tower of God)
- **Rich metadata** — series info, volume/chapter counts, status with volume breakdowns, genres, ratings, cover art, scanlation group details
- **Supports decimal chapters** (22.5), multi-part series (Chainsaw Man Part 1/2), and season structures (Tower of God S1/S2/S3)

### Why Not Alternatives

- **MangaDex** — Hit by massive DMCA takedown (700+ series). New chapters cannot be uploaded for affected titles. Metadata entries still exist but chapter lists frozen for popular series.
- **AniList/MAL** — Only store total chapter count as a single integer. No individual chapter records, release dates, or group info.
- **ComicVine** — Western comics only.

### API Endpoints Used

| Endpoint                     | Purpose                                    |
| ---------------------------- | ------------------------------------------ |
| `POST /v1/series/search`     | Search manga by title                      |
| `GET /v1/series/{id}`        | Full series metadata                       |
| `POST /v1/releases/search`   | Chapter/volume release history with groups |
| `GET /v1/series/{id}/groups` | Scanlation groups for a series             |
| `GET /v1/series/{id}/rss`    | RSS feed for new releases                  |

### Rate Limiting

No documented strict limits. Implement a request queue at ~2 req/s to be respectful.

## Data Model

### New Tables

#### `manga`

The series entity, mirrors `shows`.

| Column                       | Type        | Notes                                              |
| ---------------------------- | ----------- | -------------------------------------------------- |
| `id`                         | integer     | PK, auto-increment                                 |
| `title`                      | text        | NOT NULL                                           |
| `sortTitle`                  | text        | NOT NULL                                           |
| `overview`                   | text        |                                                    |
| `mangaUpdatesId`             | integer     | UNIQUE, external ID                                |
| `mangaUpdatesSlug`           | text        | URL slug                                           |
| `type`                       | text        | `manga` \| `manhwa` \| `manhua`                    |
| `year`                       | text        |                                                    |
| `status`                     | text        | `ongoing` \| `complete` \| `hiatus` \| `cancelled` |
| `latestChapter`              | integer     | Latest known chapter from MangaUpdates             |
| `posterUrl`                  | text        |                                                    |
| `fanartUrl`                  | text        |                                                    |
| `images`                     | text (JSON) | `{ url: string; coverType: string }[]`             |
| `tags`                       | text (JSON) | Tag ID array                                       |
| `genres`                     | text (JSON) | Genre string array                                 |
| `monitored`                  | integer     | Boolean: 0/1                                       |
| `monitorNewChapters`         | text        | `all` \| `future` \| `missing` \| `none`           |
| `rootFolderPath`             | text        |                                                    |
| `qualityProfileId`           | integer     | FK to quality_profiles                             |
| `createdAt`                  | text        | ISO timestamp                                      |
| `updatedAt`                  | text        | ISO timestamp                                      |
| `metadataUpdatedAt`          | text        | ISO timestamp                                      |
| `metadataSourceMissingSince` | text        | ISO timestamp, nullable                            |

#### `manga_volumes`

Volume containers, mirrors `seasons`.

| Column         | Type    | Notes                                  |
| -------------- | ------- | -------------------------------------- |
| `id`           | integer | PK                                     |
| `mangaId`      | integer | FK to manga, NOT NULL                  |
| `volumeNumber` | integer | Nullable (for chapters with no volume) |
| `title`        | text    | Optional                               |
| `monitored`    | integer | Boolean                                |

#### `manga_chapters`

Individual chapters, mirrors `episodes`.

| Column            | Type    | Notes                                |
| ----------------- | ------- | ------------------------------------ |
| `id`              | integer | PK                                   |
| `mangaVolumeId`   | integer | FK to manga_volumes                  |
| `mangaId`         | integer | FK to manga, NOT NULL                |
| `chapterNumber`   | text    | Supports "10.5", "Extra", "Prologue" |
| `title`           | text    | Optional                             |
| `releaseDate`     | text    | From MangaUpdates                    |
| `scanlationGroup` | text    | Primary group name                   |
| `monitored`       | integer | Boolean                              |

#### `manga_files`

Downloaded files, mirrors `episode_files`.

| Column            | Type    | Notes                             |
| ----------------- | ------- | --------------------------------- |
| `id`              | integer | PK                                |
| `mangaChapterId`  | integer | FK to manga_chapters              |
| `mangaId`         | integer | FK to manga                       |
| `path`            | text    | NOT NULL                          |
| `size`            | integer | File size in bytes                |
| `format`          | text    | `cbz` \| `cbr` \| `pdf` \| `epub` |
| `quality`         | text    | Resolution/source info            |
| `scanlationGroup` | text    |                                   |
| `language`        | text    | ISO 639-1 code                    |
| `createdAt`       | text    |                                   |
| `updatedAt`       | text    |                                   |

#### `manga_download_profiles`

Junction table, mirrors `show_download_profiles`.

| Column              | Type    | Notes                   |
| ------------------- | ------- | ----------------------- |
| `mangaId`           | integer | FK to manga             |
| `downloadProfileId` | integer | FK to download_profiles |

### Existing Tables Extended

**`download_profiles`:** Add `"manga"` to `contentType` values.

**`tracked_downloads`:** Add nullable FKs:

- `mangaId` → manga
- `mangaChapterId` → manga_chapters

**`history`:** Add nullable FKs:

- `mangaId` → manga
- `mangaChapterId` → manga_chapters

New history event types: `manga.added`, `manga.deleted`, `manga.updated`, `mangaChapter.added`, `mangaChapter.grabbed`, `mangaChapter.imported`, `mangaChapter.deleted`, `mangaChapter.fileDeleted`, `mangaChapter.upgraded`.

## MangaUpdates Integration

### Server Modules

**`src/server/manga-search.ts`** — Search and metadata fetching:

- `searchMangaFn(query)` — search series
- `getMangaDetailFn(seriesId)` — full series metadata
- `getMangaReleasesFn(seriesId)` — chapter/volume release history
- `getMangaGroupsFn(seriesId)` — scanlation groups

**`src/server/manga-import.ts`** — Import and refresh:

- `importMangaFn(seriesId, options)` — fetch metadata + releases, deduplicate into volumes/chapters, insert in single transaction
- `refreshMangaMetadataFn(mangaId)` — re-fetch and detect new chapters/volumes
- Default refresh interval: every 6 hours

### Import Flow

1. User searches MangaUpdates, selects a series
2. Fetch full series detail + all releases
3. Deduplicate releases into volumes and chapters (multiple groups may release the same chapter — use first occurrence for chapter list, store all groups as metadata)
4. Single DB transaction: insert manga → volumes → chapters
5. Create history entry (`manga.added`)

### Release Deduplication

MangaUpdates releases are per-group — the same chapter appears multiple times if multiple groups release it. During import:

- Group releases by chapter number
- Use the earliest release date as the chapter's release date
- Store the primary group (first/official) on the chapter record
- All groups are available via the MangaUpdates API for quality profile scoring at download time

## Quality Profiles

Reuses the existing `download_profiles` table with `contentType: "manga"`. Manga-specific quality dimensions:

### Scanlation Group Ranking

- Ordered list of preferred groups within the profile
- Groups sourced from MangaUpdates per-series group data
- Ranked top to bottom (higher = preferred): e.g., `["Viz", "MANGA Plus", "TCB Scans"]`
- Configurable behavior for unlisted groups: accept at baseline score or reject

### Language Preference

- Primary language (e.g., `en`) — required match
- Filters at search time, not scoring time

### Release Type Preference

- `volume` — official volume rips (higher quality, complete)
- `chapter` — individual chapter releases (more timely)
- Configurable priority: prefer volumes when available with chapter fallback, or always grab chapters for speed

### File Format Preference

- Ordered preference: e.g., `["cbz", "epub", "pdf", "cbr"]`
- CBZ is the standard; others are fallbacks
- Maps to existing quality items pattern (format + weight)

### Scoring

When a release is found on an indexer, score by:

1. **Group match** (highest weight) — is this a preferred group?
2. **Format match** — is it the preferred file type?
3. **Release type match** — volume vs chapter preference
4. **Language** — must match (filter, not score)

Fits into the existing `findBestReleaseForProfile()` pattern in auto-search.

## Download & Auto-Search

### Indexer Search

Same Newznab/Torznab pipeline as shows/movies. Search query patterns:

- Chapter: `"One Piece" chapter 1177` or `"One Piece" c1177`
- Volume: `"One Piece" volume 108` or `"One Piece" v108`
- Batch: `"One Piece" v01-v50` (for backfill)

### Indexer Result Parsing

Parse release titles from Nyaa/usenet to extract:

- Series name, chapter number(s), volume number(s)
- Scanlation group (typically in brackets: `[TCB Scans]`)
- Language (from tags or title)
- Format (from file extension)

### Auto-Search: `getWantedChapters()`

Follows the `getWantedEpisodes()` pattern:

1. Find chapters where: `monitored = true` AND has download profile AND no file on disk AND no active tracked download
2. For each wanted chapter: build search query → query enabled indexers → score against profile → grab best match → create tracked download
3. Respects monitoring mode: `future` only searches chapters released after import, `missing` searches all monitored without files

### Volume Intelligence

- If a volume release covers multiple wanted chapters, prefer it over individual chapter grabs (fewer downloads, usually higher quality)
- After a volume download, mark all contained chapters as having files

### Post-Download Processing

1. Verify file is valid CBZ/CBR (ZIP with images)
2. Move to correct path per naming template
3. Create `manga_files` record
4. Update history (`mangaChapter.grabbed`, `mangaChapter.imported`)

## File Organization & Naming

Configurable via naming templates under `naming.manga.*`, following the existing `naming.ebook.*` / `naming.audiobook.*` pattern.

### Default Template

```
{Manga Title}/Volume {Volume Number}/{Manga Title} - Chapter {Chapter Number}.cbz
```

Example: `One Piece/Volume 108/One Piece - Chapter 1177.cbz`

### Edge Cases

- **No volume assigned:** `One Piece/Ungrouped/One Piece - Chapter 1177.cbz`
- **Decimal chapters:** `Otoyomegatari - Chapter 022.5.cbz`
- **Volume-level downloads:** `One Piece/Volume 108/One Piece - Volume 108.cbz`
- **Batch downloads:** Extracted into individual volume folders

### Available Tokens

`{Manga Title}`, `{Manga Title (Year)}`, `{Volume Number}`, `{Volume Number (00)}`, `{Chapter Number}`, `{Chapter Number (000)}`, `{Scanlation Group}`, `{Language}`, `{Format}`

## UI & Routes

### Routes

| Route                                   | Purpose                      |
| --------------------------------------- | ---------------------------- |
| `src/routes/_authed/manga/index.tsx`    | Library grid/list view       |
| `src/routes/_authed/manga/add.tsx`      | Search MangaUpdates + import |
| `src/routes/_authed/manga/$mangaId.tsx` | Series detail page           |

### Components (`src/components/manga/`)

- `manga-card.tsx` — Library grid card (poster, title, chapter progress bar)
- `manga-detail-header.tsx` — Series banner with metadata and actions
- `manga-volume-list.tsx` — Expandable volume/chapter table (volumes expand to show chapters, like seasons/episodes)
- `manga-search-result.tsx` — Search result card for add flow
- `manga-quality-profile.tsx` — Profile editor with group ranking, format prefs, release type, language

### Sidebar

Add "Manga" entry to `AppSidebar` under existing content types.

### Add Flow

1. Search by title → MangaUpdates results displayed
2. Select series → preview detail with volumes/chapters
3. Configure: root folder, quality profile, monitoring mode, search-on-add toggle
4. Import → creates manga + volumes + chapters → optionally triggers auto-search

### Quality Profile UI

Extends the existing quality profile editor with manga-specific sections:

- Group ranking (drag to reorder)
- Language dropdown
- Release type preference toggle (volume vs chapter priority)
- Format preference list

## Monitoring & Notifications

### Monitoring Modes (manga level)

| Mode      | Behavior                                |
| --------- | --------------------------------------- |
| `all`     | Monitor every chapter (past and future) |
| `future`  | Only chapters released after import     |
| `missing` | All chapters without files on disk      |
| `none`    | Track metadata but don't download       |

### Granular Overrides

- **Volume level:** Toggle `monitored` on individual volumes (skip filler arcs, completed volumes already owned)
- **Chapter level:** Toggle `monitored` on individual chapters (skip recaps, specials)

### New Chapter Detection

- Metadata refresh polls MangaUpdates (default every 6 hours)
- New chapters detected → insert into DB → apply monitoring rules → trigger auto-search if mode matches
- History event: `mangaChapter.added`

### History Events

Added to existing polymorphic `history` table:

- `manga.added`, `manga.deleted`, `manga.updated`
- `mangaChapter.added`, `mangaChapter.grabbed`, `mangaChapter.imported`, `mangaChapter.deleted`
- `mangaChapter.fileDeleted`, `mangaChapter.upgraded`

## Server Functions

### `src/server/manga.ts`

**Read functions:**

- `getMangasFn()` — list all manga with pagination
- `getMangaDetailFn(mangaId)` — single manga with volumes/chapters
- `getPaginatedMangaFn()` — paginated with filtering

**Write functions:**

- `createMangaFn()` — add from MangaUpdates import
- `updateMangaFn()` — modify properties
- `deleteMangaFn()` — remove (cascade)
- `monitorMangaProfileFn()` — link to download profile
- `unmonitorMangaProfileFn()` — unlink
- `bulkMonitorMangaProfileFn()` — batch operations

### `src/hooks/mutations/manga.ts`

React Query mutation hooks wrapping all server functions, following the existing pattern (loading toast, invalidate query keys, success/error toast).

## Shared Infrastructure Reuse

| Component           | What's Reused                                        | What's New                                             |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| `download_profiles` | Table + scoring engine                               | `contentType: "manga"` value                           |
| `tracked_downloads` | Polymorphic tracking table                           | `mangaId`, `mangaChapterId` FKs                        |
| `history`           | Polymorphic event table                              | `mangaId`, `mangaChapterId` FKs                        |
| Indexer pipeline    | Newznab/Torznab search + download client integration | Manga search query builder + result parser             |
| Auto-search         | Scheduling, grabbing, deduplication                  | `getWantedChapters()` + manga scoring                  |
| Quality profiles UI | Profile editor shell                                 | Manga-specific sections (groups, format, release type) |
| Naming templates    | Template engine + settings storage                   | `naming.manga.*` tokens                                |
| Add flow            | Dialog/page patterns                                 | MangaUpdates search integration                        |
