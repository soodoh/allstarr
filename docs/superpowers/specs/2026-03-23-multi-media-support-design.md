# Multi-Media Support Design Spec

> Add TV show and movie management with Sonarr/Radarr feature parity, TMDB metadata integration, and a unified multi-media architecture.

## 1. Conceptual Model: Content Type vs Media Type

Two orthogonal axes govern the system:

**Media Type** (physical file format) — drives quality definitions, file extensions, file import, media probing:

| Media Type | File Formats                      | Purpose                                   |
| ---------- | --------------------------------- | ----------------------------------------- |
| `ebook`    | EPUB, PDF, MOBI, AZW3             | Digital text files                        |
| `audio`    | MP3, M4B, FLAC                    | Audio files (audiobooks now, music later) |
| `video`    | MKV, MP4, AVI, TS, WMV, FLV, WEBM | Video files                               |

**Content Type** (what the user is managing) — drives navigation, metadata source, UI, settings, naming:

| Content Type | Metadata Source | Valid Media Types |
| ------------ | --------------- | ----------------- |
| `book`       | Hardcover       | ebook, audio      |
| `tv`         | TMDB            | video             |
| `movie`      | TMDB            | video             |

The existing `"audiobook"` media type is renamed to `"audio"` for generality. Hardcover integration still requests Audiobook-format editions when the media type is `audio` — this is an internal mapping, not exposed to the user.

Future content types (e.g., `music` using MusicBrainz with media type `audio`) slot in without rework.

### Cross-reference with Sonarr/Radarr

Sonarr and Radarr are separate applications, each handling one content type. Allstarr unifies them under one roof. The content type/media type separation mirrors how Sonarr and Radarr both use the same video quality definitions but apply them in different content contexts.

**Deliberate differences from Sonarr/Radarr:**

- Root folders are stored on the download profile, not per content item. Sonarr/Radarr store root folder path per series/movie AND on the quality profile. Allstarr simplifies this to profile-only.
- TMDB is used for TV shows instead of TVDB. Radarr already uses TMDB; Sonarr uses TVDB but this is widely criticized and TMDB has equivalent TV data.
- Books (Hardcover) and video (TMDB) coexist in one application with shared infrastructure (download clients, indexers, activity queue).

## 2. Media Type Rename: Audiobook to Audio

### Database Migration

```sql
-- Rename media type values
UPDATE download_formats SET type = 'audio' WHERE type = 'audiobook';
UPDATE download_profiles SET type = 'audio' WHERE type = 'audiobook';

-- Rename settings keys: audiobook -> audio in naming keys
UPDATE settings SET key = REPLACE(key, 'naming.audiobook.', 'naming.audio.')
  WHERE key LIKE 'naming.audiobook.%';

-- Rename settings keys: media management audiobook -> audio
UPDATE settings SET key = REPLACE(key, 'mediaManagement.audiobook.', 'mediaManagement.audio.')
  WHERE key LIKE 'mediaManagement.audiobook.%';
```

### Code Changes

- `src/lib/validators.ts`: `z.enum(["ebook", "audiobook"])` becomes `z.enum(["ebook", "audio", "video"])`
- `src/server/file-import.ts`: audio extension mapping returns `"audio"` instead of `"audiobook"`
- `src/routes/_authed/settings/media-management.tsx`: tab labels update
- All references to `"audiobook"` media type throughout the codebase

No behavioral changes — purely a rename plus enum expansion.

## 3. Content Type on Download Profiles

### Schema Change

Add a `contentType` column to `download_profiles` with values `"book" | "tv" | "movie"`. **Keep the existing `type` column** (renamed from `"audiobook"` to `"audio"` in Section 2) as `mediaType` to preserve the distinction between ebook and audiobook profiles.

```sql
-- Add contentType column
ALTER TABLE download_profiles ADD COLUMN contentType TEXT NOT NULL DEFAULT 'book';

-- Set contentType based on existing type
UPDATE download_profiles SET contentType = 'book';

-- Rename type -> mediaType for clarity
ALTER TABLE download_profiles RENAME COLUMN type TO mediaType;
```

This means book profiles carry both:

- `contentType = 'book'` (what content this manages)
- `mediaType = 'ebook'` or `'audio'` (what file formats this targets)

Video profiles carry:

- `contentType = 'tv'` or `'movie'`
- `mediaType = 'video'`

This preserves the ability for `resolveProfileType()` in `file-import.ts` and `readImportSettings()` in `settings-reader.ts` to determine the correct media type and settings namespace from the profile, without needing to infer from format IDs.

### Enabled/Disabled Profiles

Add `enabled` boolean column (default `true`) to `download_profiles`.

- Disabled profiles are visible in the profile list but visually muted
- Disabled profiles do not appear in assignment dropdowns (when adding authors, shows, movies)
- Users can enable/disable via a toggle on the profile list or edit form
- Conservative (out-of-box) profiles are seeded as disabled; TRaSH-style profiles are enabled

## 4. Video Download Formats (Quality Definitions)

### Schema Changes to `download_formats`

New columns:

- `source` (text, nullable) — Television, Web, WebRip, Bluray, BlurayRaw, DVD, Unknown. Used for release matching (maps to Sonarr/Radarr's `QualitySource` enum).
- `resolution` (integer, default 0) — 0, 480, 576, 720, 1080, 2160. Used for release matching.
- `enabled` (boolean, default true) — allows disabling formats without deletion.

### Max Size Representation

Change `maxSize = 0` (meaning unlimited) to `maxSize = NULL`:

```sql
UPDATE download_formats SET maxSize = NULL WHERE maxSize = 0;
```

- TypeScript type: `maxSize: number | null` where `null` means no limit
- Same applies to `preferredSize`
- Server logic: `if (maxSize === null) return true` (always passes size check)
- UI: "No Limit" checkbox next to the max size number input. When checked, the input is disabled and value stored as `null`. When unchecked, input populates with a sensible default.
- Slider: rightmost position = no limit (`null`), dragging left sets a numeric value

### Video Format Definitions

One shared set of video formats using Sonarr (TV series) TRaSH minimum values. These are lower than Radarr's movie minimums to accommodate x265/HEVC encodes, which achieve 25-50% better compression than x264 at equivalent quality. Sonarr/Radarr handle codec preference through Custom Formats scoring, not quality definition sizes.

Preferred and max values are effectively unlimited in both TRaSH guides (Sonarr: 995/1000, Radarr: 1999/2000). We store these as `NULL` (no limit).

**TRaSH Video Formats (enabled by default):**

| Title         | Weight | Min (MB/min) | Preferred | Max  | Source     | Resolution | Media Type |
| ------------- | ------ | ------------ | --------- | ---- | ---------- | ---------- | ---------- |
| Unknown Video | 0      | 1            | NULL      | NULL | Unknown    | 0          | video      |
| SDTV          | 1      | 5            | NULL      | NULL | Television | 480        | video      |
| WEBRip-480p   | 2      | 5            | NULL      | NULL | WebRip     | 480        | video      |
| WEBDL-480p    | 3      | 5            | NULL      | NULL | Web        | 480        | video      |
| DVD           | 4      | 5            | NULL      | NULL | DVD        | 480        | video      |
| Bluray-480p   | 5      | 5            | NULL      | NULL | Bluray     | 480        | video      |
| HDTV-720p     | 10     | 10           | NULL      | NULL | Television | 720        | video      |
| WEBRip-720p   | 11     | 10           | NULL      | NULL | WebRip     | 720        | video      |
| WEBDL-720p    | 12     | 10           | NULL      | NULL | Web        | 720        | video      |
| Bluray-720p   | 13     | 17.1         | NULL      | NULL | Bluray     | 720        | video      |
| HDTV-1080p    | 20     | 15           | NULL      | NULL | Television | 1080       | video      |
| WEBRip-1080p  | 21     | 15           | NULL      | NULL | WebRip     | 1080       | video      |
| WEBDL-1080p   | 22     | 15           | NULL      | NULL | Web        | 1080       | video      |
| Bluray-1080p  | 23     | 50.4         | NULL      | NULL | Bluray     | 1080       | video      |
| Remux-1080p   | 24     | 69.1         | NULL      | NULL | BlurayRaw  | 1080       | video      |
| HDTV-2160p    | 30     | 25           | NULL      | NULL | Television | 2160       | video      |
| WEBRip-2160p  | 31     | 25           | NULL      | NULL | WebRip     | 2160       | video      |
| WEBDL-2160p   | 32     | 25           | NULL      | NULL | Web        | 2160       | video      |
| Bluray-2160p  | 33     | 94.6         | NULL      | NULL | Bluray     | 2160       | video      |
| Remux-2160p   | 34     | 187.4        | NULL      | NULL | BlurayRaw  | 2160       | video      |

Note: SD/480p minimum values (5 MB/min) are Allstarr defaults, not from TRaSH. TRaSH guides only cover HD (720p+) and above. Unknown Video (weight 0, min 1) is an Allstarr-specific addition for unrecognized files — it does not exist in TRaSH or Sonarr/Radarr.

**Conservative Video Formats (disabled by default):**

Same format names with `min: 0`, `preferred: NULL`, `max: NULL` for all — matching Sonarr/Radarr out-of-box behavior (no restrictions).

### Cross-reference with Sonarr/Radarr

- Format names, sources, and resolutions match Sonarr's `Quality.cs` (22 qualities) and Radarr's `Quality.cs` (30 qualities). We use the common subset that appears in both.
- Radarr has additional pre-release qualities (WORKPRINT, CAM, TELESYNC, TELECINE, DVDSCR, REGIONAL, BR-DISK) that are not included since they are niche and can be added later.
- Sonarr has `Bluray-576p` (ID 22) and `Raw-HD` (ID 10) which are omitted as uncommon — can be added later.
- TRaSH minimum values for HD+ taken from [Sonarr series quality-size JSON](https://github.com/TRaSH-Guides/Guides/tree/master/docs/json/sonarr/quality-size/series.json) to be x265-safe.
- Sonarr max=1000 and Radarr max=2000 both represent "unlimited" — we use `NULL`.
- Source names use Sonarr conventions (Web, WebRip). The release parser handles both Sonarr-style and Radarr-style source names (WEBDL, WEBRIP) when matching actual release titles.

### Existing Book Formats

Existing ebook and audiobook formats are unchanged (already well-tuned). Conservative book formats are added (disabled) matching Readarr defaults: `min: 0`, `max: 350 MB` (absolute MB, not per-minute — books don't have a duration concept) for all except FLAC which has `max: NULL`.

| Title                        | Weight | Min | Preferred | Max (MB) | Media Type | Enabled |
| ---------------------------- | ------ | --- | --------- | -------- | ---------- | ------- |
| Unknown Text (Conservative)  | 0      | 0   | NULL      | 350      | ebook      | false   |
| PDF (Conservative)           | 1      | 0   | NULL      | 350      | ebook      | false   |
| MOBI (Conservative)          | 2      | 0   | NULL      | 350      | ebook      | false   |
| EPUB (Conservative)          | 3      | 0   | NULL      | 350      | ebook      | false   |
| AZW3 (Conservative)          | 4      | 0   | NULL      | 350      | ebook      | false   |
| Unknown Audio (Conservative) | 5      | 0   | NULL      | 350      | audio      | false   |
| MP3 (Conservative)           | 6      | 0   | NULL      | 350      | audio      | false   |
| M4B (Conservative)           | 7      | 0   | NULL      | 350      | audio      | false   |
| FLAC (Conservative)          | 8      | 0   | NULL      | NULL     | audio      | false   |

## 5. Download Profiles

### TRaSH-Style Profiles (enabled by default)

| Name              | Content Type | Media Type | Items (format names in priority order)                                                       | Cutoff       | Upgrade | Icon         |
| ----------------- | ------------ | ---------- | -------------------------------------------------------------------------------------------- | ------------ | ------- | ------------ |
| Ebook             | book         | ebook      | EPUB, AZW3, MOBI, PDF                                                                        | EPUB         | false   | book-marked  |
| Audiobook         | book         | audio      | M4B, MP3, FLAC                                                                               | M4B          | false   | audio-lines  |
| WEB-1080p         | tv           | video      | WEBDL-1080p, WEBRip-1080p, HDTV-1080p                                                        | WEBDL-1080p  | true    | tv           |
| WEB-2160p         | tv           | video      | WEBDL-2160p, WEBRip-2160p, Bluray-2160p                                                      | WEBDL-2160p  | true    | tv-minimal   |
| HD Bluray + WEB   | movie        | video      | Bluray-1080p, WEBDL-1080p, WEBRip-1080p, Bluray-720p, WEBDL-720p, WEBRip-720p                | Bluray-1080p | true    | film         |
| Remux + WEB 2160p | movie        | video      | Remux-2160p, Bluray-2160p, WEBDL-2160p, WEBRip-2160p, Remux-1080p, Bluray-1080p, WEBDL-1080p | Remux-2160p  | true    | clapperboard |

### Conservative Profiles (disabled by default)

| Name                     | Content Type | Media Type | Items                                                            | Cutoff | Upgrade | Icon         |
| ------------------------ | ------------ | ---------- | ---------------------------------------------------------------- | ------ | ------- | ------------ |
| Ebook (Conservative)     | book         | ebook      | EPUB, AZW3, MOBI, PDF, Unknown Text                              | none   | false   | book-marked  |
| Audiobook (Conservative) | book         | audio      | MP3, M4B, FLAC, Unknown Audio                                    | none   | false   | audio-lines  |
| Any 1080p                | tv           | video      | WEBDL-1080p, WEBRip-1080p, HDTV-1080p, Bluray-1080p              | none   | false   | tv           |
| Any 2160p                | tv           | video      | WEBDL-2160p, WEBRip-2160p, HDTV-2160p, Bluray-2160p              | none   | false   | tv-minimal   |
| Any 1080p                | movie        | video      | WEBDL-1080p, WEBRip-1080p, HDTV-1080p, Bluray-1080p, Remux-1080p | none   | false   | film         |
| Any 2160p                | movie        | video      | WEBDL-2160p, WEBRip-2160p, HDTV-2160p, Bluray-2160p, Remux-2160p | none   | false   | clapperboard |

### Default Newznab/Torznab Categories per Profile

| Profile Content Type | Categories                                                                  |
| -------------------- | --------------------------------------------------------------------------- |
| book (ebook)         | 7020 (Ebooks), 8010 (Books)                                                 |
| book (audio)         | 3030 (Audiobooks)                                                           |
| tv                   | 5030 (TV/SD), 5040 (TV/HD), 5045 (TV/UHD)                                   |
| movie                | 2030 (Movies/SD), 2040 (Movies/HD), 2045 (Movies/UHD), 2050 (Movies/BluRay) |

### Cross-reference with Sonarr/Radarr/TRaSH

- TV profiles match [TRaSH Sonarr quality profile guide](https://trash-guides.info/Sonarr/sonarr-setup-quality-profiles/): WEB-1080p and WEB-2160p with upgrade enabled.
- Movie profiles match [TRaSH Radarr quality profile guide](https://trash-guides.info/Radarr/radarr-setup-quality-profiles/): HD Bluray+WEB and Remux+WEB 2160p.
- Conservative profiles match Sonarr/Radarr out-of-box behavior: broad quality acceptance, no cutoff, no upgrades.
- Newznab categories match Sonarr/Radarr defaults.

## 6. Data Model

### New Tables: TV Shows

**`shows`**

| Column     | Type       | Notes                                                                                                        |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| id         | integer PK | auto-increment                                                                                               |
| title      | text       |                                                                                                              |
| sortTitle  | text       | for alphabetical sorting                                                                                     |
| overview   | text       | synopsis                                                                                                     |
| tmdbId     | integer    | TMDB series ID, unique                                                                                       |
| imdbId     | text       | nullable                                                                                                     |
| status     | text       | "continuing", "ended", "upcoming", "canceled"                                                                |
| seriesType | text       | "standard", "daily", "anime" — matches Sonarr                                                                |
| network    | text       | e.g., "HBO", "Netflix"                                                                                       |
| year       | integer    | first air year                                                                                               |
| runtime    | integer    | typical episode minutes                                                                                      |
| genres     | JSON       | string array                                                                                                 |
| tags       | JSON       | integer array (tag IDs), matching authors/books pattern                                                      |
| posterUrl  | text       |                                                                                                              |
| fanartUrl  | text       | backdrop                                                                                                     |
| monitored  | boolean    | default true                                                                                                 |
| path       | text       | cached computed path (profile root + show folder naming template). Updated when profile root folder changes. |
| createdAt  | integer    | timestamp mode, matching existing convention                                                                 |
| updatedAt  | integer    | timestamp mode, matching existing convention                                                                 |

The `seriesType` field matches Sonarr's series types which affect search behavior:

- `standard` — searches by S00E00 pattern
- `daily` — searches by air date (YYYY-MM-DD)
- `anime` — searches by absolute episode number in addition to S00E00

The `path` column is a cached computed value derived from the profile's root folder path + the show folder naming template. It is recomputed when the profile root folder changes (see Section 10, Root Folder File Move). The profile remains the source of truth for root folder; `path` is a convenience cache for file operations.

**`seasons`**

| Column       | Type       | Notes                         |
| ------------ | ---------- | ----------------------------- |
| id           | integer PK |                               |
| showId       | integer FK | references shows              |
| seasonNumber | integer    | 0 = specials (matches Sonarr) |
| monitored    | boolean    | default true                  |
| overview     | text       | nullable                      |
| posterUrl    | text       | nullable                      |

**`episodes`**

| Column         | Type       | Notes                                                                                                       |
| -------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| id             | integer PK |                                                                                                             |
| showId         | integer FK | references shows                                                                                            |
| seasonId       | integer FK | references seasons                                                                                          |
| episodeNumber  | integer    |                                                                                                             |
| absoluteNumber | integer    | nullable, for anime                                                                                         |
| title          | text       |                                                                                                             |
| overview       | text       | nullable                                                                                                    |
| airDate        | text       | ISO date, nullable (unaired)                                                                                |
| runtime        | integer    | minutes, nullable                                                                                           |
| tmdbId         | integer    |                                                                                                             |
| hasFile        | boolean    | default false (denormalized — kept in sync on import/delete for query performance, matching Sonarr pattern) |
| monitored      | boolean    | default true                                                                                                |

**`episode_files`**

| Column    | Type       | Notes                                                                                  |
| --------- | ---------- | -------------------------------------------------------------------------------------- |
| id        | integer PK |                                                                                        |
| episodeId | integer FK | references episodes                                                                    |
| path      | text       |                                                                                        |
| size      | integer    | bytes                                                                                  |
| quality   | JSON       | `{ quality: { id, name }, revision: { version, real } }` — matches `book_files` schema |
| dateAdded | integer    | timestamp mode, matching `book_files` convention                                       |
| sceneName | text       | original release name                                                                  |
| duration  | integer    | seconds                                                                                |
| codec     | text       | x264, x265, etc.                                                                       |
| container | text       | mkv, mp4                                                                               |

### New Tables: Movies

**`movies`**

| Column              | Type       | Notes                                                              |
| ------------------- | ---------- | ------------------------------------------------------------------ |
| id                  | integer PK |                                                                    |
| title               | text       |                                                                    |
| sortTitle           | text       |                                                                    |
| overview            | text       |                                                                    |
| tmdbId              | integer    | unique                                                             |
| imdbId              | text       | nullable                                                           |
| status              | text       | "tba", "announced", "inCinemas", "released"                        |
| studio              | text       |                                                                    |
| year                | integer    |                                                                    |
| runtime             | integer    | minutes                                                            |
| genres              | JSON       | string array                                                       |
| tags                | JSON       | integer array (tag IDs), matching authors/books pattern            |
| posterUrl           | text       |                                                                    |
| fanartUrl           | text       | backdrop                                                           |
| monitored           | boolean    | default true                                                       |
| minimumAvailability | text       | "announced", "inCinemas", "released"                               |
| path                | text       | cached computed path (profile root + movie folder naming template) |
| createdAt           | integer    | timestamp mode                                                     |
| updatedAt           | integer    | timestamp mode                                                     |

`status` includes `"tba"` for movies in a "rumored" or "planned" state on TMDB that haven't been formally announced. TMDB statuses "Rumored" and "Planned" map to `"tba"`.

`minimumAvailability` matches Radarr's options (excluding `preDB` which Radarr documents as deprecated — it behaves identically to `released`).

**`movie_files`**

| Column    | Type       | Notes                                                                                  |
| --------- | ---------- | -------------------------------------------------------------------------------------- |
| id        | integer PK |                                                                                        |
| movieId   | integer FK | references movies                                                                      |
| path      | text       |                                                                                        |
| size      | integer    | bytes                                                                                  |
| quality   | JSON       | `{ quality: { id, name }, revision: { version, real } }` — matches `book_files` schema |
| dateAdded | integer    | timestamp mode, matching `book_files` convention                                       |
| sceneName | text       | original release name                                                                  |
| duration  | integer    | seconds                                                                                |
| codec     | text       |                                                                                        |
| container | text       |                                                                                        |

### Profile Association Tables

- **`show_download_profiles`** — `showId` FK, `downloadProfileId` FK (mirrors `author_download_profiles`)
- **`movie_download_profiles`** — `movieId` FK, `downloadProfileId` FK

### Changes to Existing Tables

**`tracked_downloads`** — add nullable columns:

- `showId` (integer FK, nullable)
- `episodeId` (integer FK, nullable)
- `movieId` (integer FK, nullable)

Existing `bookId` column unchanged.

**`blocklist`** — add nullable columns:

- `showId` (integer FK, nullable)
- `movieId` (integer FK, nullable)

**`history`** — add nullable columns and extend event types:

New nullable columns:

- `showId` (integer FK, nullable)
- `episodeId` (integer FK, nullable)
- `movieId` (integer FK, nullable)

New event types:

- `showAdded`, `showDeleted`, `episodeFileImported`, `episodeFileDeleted`
- `movieAdded`, `movieDeleted`, `movieFileImported`, `movieFileDeleted`

### Download Profile `language` Column

The existing `language` column on `download_profiles` is used for book edition language filtering (Hardcover). For TV/movie profiles, this column is ignored — TMDB language preferences are handled via the `metadata.tmdb.language` setting (Section 8). The column remains on all profiles for schema simplicity but is only functionally relevant for `contentType = 'book'`.

### Cross-reference with Sonarr/Radarr

- `shows` table maps to Sonarr's `Series` entity. Fields match: title, sortTitle, overview, tvdbId (we use tmdbId), imdbId, status, seriesType, network, year, runtime, genres, images, monitored, path, tags.
- `seasons` and `episodes` match Sonarr's Season and Episode entities. `absoluteNumber` on episodes supports anime (Sonarr feature).
- `episode_files` matches Sonarr's EpisodeFile: path, size, quality JSON, sceneName, mediaInfo fields.
- `movies` table maps to Radarr's Movie entity. Fields match: title, sortTitle, overview, tmdbId, imdbId, status, studio, year, runtime, genres, images, monitored, minimumAvailability, path, tags.
- `movie_files` matches Radarr's MovieFile.
- `seriesType` values ("standard", "daily", "anime") match Sonarr exactly.
- Movie `status` includes `"tba"` mapping from TMDB's "Rumored"/"Planned" states, matching Radarr's `TBA (0)` status.
- Quality JSON on file tables uses the same `{ quality: { id, name }, revision: { version, real } }` structure as existing `book_files`, enabling shared code for quality comparison, upgrade detection, and propers/repacks tracking.
- Timestamps use `integer` with timestamp mode matching existing `authors`/`books` convention, not text ISO dates.

**Deliberate difference:** Root folders are on the profile, not on the show/movie. Sonarr/Radarr store `rootFolderPath` on both the series/movie AND use it from the quality profile. Allstarr uses profile-only, which is already the established pattern from the book system. The `path` column on shows/movies is a computed cache, not a root folder.

## 7. TMDB Integration

### New File: `src/server/tmdb.ts`

All TMDB API interactions, mirroring `src/server/search.ts` for Hardcover.

**Authentication:** TMDB v3 API key stored in `metadata.tmdb.apiKey` setting. Free for non-commercial use with attribution.

**API Functions:**

| Function                 | TMDB Endpoint                         | Purpose                      |
| ------------------------ | ------------------------------------- | ---------------------------- |
| `searchTmdbFn`           | `GET /search/multi`                   | Combined TV + movie search   |
| `searchTmdbShowsFn`      | `GET /search/tv`                      | TV show search only          |
| `searchTmdbMoviesFn`     | `GET /search/movie`                   | Movie search only            |
| `getTmdbShowDetailFn`    | `GET /tv/{id}`                        | Show detail with season list |
| `getTmdbSeasonDetailFn`  | `GET /tv/{id}/season/{n}`             | Season with all episodes     |
| `getTmdbEpisodeDetailFn` | `GET /tv/{id}/season/{n}/episode/{n}` | Single episode               |
| `getTmdbMovieDetailFn`   | `GET /movie/{id}`                     | Movie detail                 |
| `getTmdbShowImagesFn`    | `GET /tv/{id}/images`                 | Posters, backdrops           |
| `getTmdbMovieImagesFn`   | `GET /movie/{id}/images`              | Posters, backdrops           |

**Data flow — adding a TV show:**

1. User searches TMDB, selects a show
2. `getTmdbShowDetailFn` fetches full detail
3. Insert into `shows` table
4. For each season, `getTmdbSeasonDetailFn` fetches episodes
5. Insert `seasons` and `episodes` rows
6. User assigns download profile via `show_download_profiles`

**Data flow — adding a movie:**

1. User searches TMDB, selects a movie
2. `getTmdbMovieDetailFn` fetches detail
3. Insert into `movies` table
4. User assigns profile + sets minimum availability on the `movies` row

**Monitoring options for TV (matching Sonarr):**

- `all` — monitor all seasons and episodes
- `future` — only episodes that haven't aired yet
- `missing` — episodes that have aired but have no file
- `existing` — episodes that already have files
- `pilot` — only the first episode
- `firstSeason` — only season 1
- `lastSeason` — only the most recent season (Sonarr's current name; `latestSeason` is deprecated)
- `none` — add but don't monitor

Intentionally omitted Sonarr options: `recent` (monitor recent episodes only), `monitorSpecials`, `unmonitorSpecials`, `skip`. These are less commonly used and can be added later without schema changes.

**Metadata refresh:**

- New scheduled task: `refresh-tmdb-metadata` (12-hour interval)
- Updates: show status changes, new episodes for continuing shows, air dates, movie status transitions (tba -> announced -> inCinemas -> released)
- Rate limiting: TMDB allows ~40 requests per 10 seconds. Implement request queue with throttle.

**Attribution:**
Per TMDB terms of use, include in the app: "This product uses the TMDB API but is not endorsed or certified by TMDB." Place in Settings > About or app footer.

### Cross-reference with Sonarr/Radarr

- Sonarr uses TVDB as its metadata source. Allstarr uses TMDB for TV, which Radarr already uses for movies. TMDB has equivalent TV data (shows, seasons, episodes, images) and is free without per-user subscription.
- Sonarr's monitoring options are replicated with the exception of `recent`, `monitorSpecials`, `unmonitorSpecials`, and `skip` which are intentionally deferred. `latestSeason` is renamed to `lastSeason` to match Sonarr's non-deprecated name.
- Radarr's minimum availability concept is replicated (announced, inCinemas, released) minus deprecated preDB.
- Metadata refresh interval (12 hours) matches Sonarr/Radarr defaults.

## 8. Metadata Settings

### Settings Page: `/settings/metadata`

Two tabs organized by metadata source:

**Hardcover tab:**

- API Token (masked input). Reads from `metadata.hardcover.apiKey` setting, falls back to `HARDCOVER_TOKEN` env var for backwards compatibility. Shows note "Currently using environment variable" when DB setting is empty but env var is set. Once saved to DB, DB value takes precedence. The code change to `src/server/search.ts` (reading from DB setting with env var fallback) is part of Phase 1.
- Skip books with missing release date (boolean)
- Skip books with no ISBN or ASIN (boolean)
- Skip compilations and box sets (boolean)
- Minimum popularity threshold (number, readers count)
- Minimum pages for ebooks (number)

**TMDB tab:**

- API Key (masked input). Stored in `metadata.tmdb.apiKey`.
- Language preference (dropdown, default "en")
- Include adult content (boolean, default false)
- Region (dropdown, filters release dates/certifications)

### Settings Key Migration

```sql
-- Move existing metadata profile under hardcover namespace
UPDATE settings SET key = 'metadata.hardcover.profile' WHERE key = 'metadata.profile';

-- Seed TMDB defaults
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('metadata.tmdb.language', '"en"'),
  ('metadata.tmdb.includeAdult', 'false'),
  ('metadata.tmdb.region', '""');
```

## 9. Media Management Settings

### Settings Page: `/settings/media-management`

Three tabs organized by content type:

**Books tab:**

- Ebook naming section:
  - Book file: `{Author Name} - {Book Title}` (default)
  - Author folder: `{Author Name}`
  - Book folder: `{Book Title} ({Release Year})`
  - Available tokens: `{Author Name}`, `{Book Title}`, `{Book Series}`, `{Book SeriesPosition}`, `{Release Year}`
- Audiobook naming section:
  - Book file: `{Author Name} - {Book Title} - Part {PartNumber:00}` (default)
  - Author folder: `{Author Name}`
  - Book folder: `{Book Title} ({Release Year})`
  - Additional tokens: `{PartNumber}`, `{PartNumber:00}`, `{PartCount}`
- Shared book media management settings (rename, illegal chars, author folders, hard links, free space, import extra files, propers/repacks, recycling bin, permissions)

**TV Shows tab:**

- Naming:
  - Standard episode: `{Show Title} - S{Season:00}E{Episode:00} - {Episode Title}` (default, simplified from TRaSH)
  - Daily episode: `{Show Title} - {Air-Date} - {Episode Title}` (default)
  - Anime episode: `{Show Title} - S{Season:00}E{Episode:00} - {Absolute:000} - {Episode Title}` (default)
  - Season folder: `Season {Season:00}` (default)
  - Show folder: `{Show Title} ({Year})` (default)
  - Available tokens: `{Show Title}`, `{Season}`, `{Season:00}`, `{Episode}`, `{Episode:00}`, `{Episode Title}`, `{Absolute}`, `{Absolute:000}`, `{Air-Date}`, `{Year}`, `{Quality}`, `{Codec}`, `{Source}`
- TV media management settings (same options as books: rename, illegal chars, hard links, etc.)

**Movies tab:**

- Naming:
  - Movie file: `{Movie Title} ({Year})` (default, simplified from TRaSH)
  - Movie folder: `{Movie Title} ({Year})` (default)
  - Available tokens: `{Movie Title}`, `{Year}`, `{Quality}`, `{Codec}`, `{Source}`, `{Edition}`
- Movie media management settings (same options)

### Settings Key Structure

```
naming.book.ebook.bookFile
naming.book.ebook.authorFolder
naming.book.ebook.bookFolder
naming.book.audio.bookFile
naming.book.audio.authorFolder
naming.book.audio.bookFolder
naming.tv.standardEpisode
naming.tv.dailyEpisode
naming.tv.animeEpisode
naming.tv.seasonFolder
naming.tv.showFolder
naming.movie.movieFile
naming.movie.movieFolder
mediaManagement.book.*
mediaManagement.tv.*
mediaManagement.movie.*
```

### Settings Key Migration (Complete)

```sql
-- Naming: ebook keys move under book namespace
UPDATE settings SET key = REPLACE(key, 'naming.ebook.', 'naming.book.ebook.')
  WHERE key LIKE 'naming.ebook.%';

-- Naming: audio keys move under book namespace (after audiobook->audio rename in Section 2)
UPDATE settings SET key = REPLACE(key, 'naming.audio.', 'naming.book.audio.')
  WHERE key LIKE 'naming.audio.%';

-- Media management: ebook keys move to book namespace
UPDATE settings SET key = REPLACE(key, 'mediaManagement.ebook.', 'mediaManagement.book.')
  WHERE key LIKE 'mediaManagement.ebook.%';

-- Media management: audio keys also move to book namespace (books share one set of media mgmt settings)
-- Only migrate keys that don't already exist under book namespace (ebook keys take precedence)
INSERT OR IGNORE INTO settings (key, value)
  SELECT REPLACE(key, 'mediaManagement.audio.', 'mediaManagement.book.'), value
  FROM settings WHERE key LIKE 'mediaManagement.audio.%';
DELETE FROM settings WHERE key LIKE 'mediaManagement.audio.%';

-- Seed TV and Movie naming defaults
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('naming.tv.standardEpisode', '"{Show Title} - S{Season:00}E{Episode:00} - {Episode Title}"'),
  ('naming.tv.dailyEpisode', '"{Show Title} - {Air-Date} - {Episode Title}"'),
  ('naming.tv.animeEpisode', '"{Show Title} - S{Season:00}E{Episode:00} - {Absolute:000} - {Episode Title}"'),
  ('naming.tv.seasonFolder', '"Season {Season:00}"'),
  ('naming.tv.showFolder', '"{Show Title} ({Year})"'),
  ('naming.movie.movieFile', '"{Movie Title} ({Year})"'),
  ('naming.movie.movieFolder', '"{Movie Title} ({Year})"');

-- Seed TV and Movie media management defaults (same defaults as books)
-- These will be seeded programmatically using the same default values as mediaManagement.book.*
```

Note: Media management settings are per-content-type (`mediaManagement.book.*`, `mediaManagement.tv.*`, `mediaManagement.movie.*`). Books share one set for both ebook and audiobook imports — the media type distinction for books is only in naming templates, not media management behavior. This is a simplification from the previous per-media-type pattern.

### Cross-reference with Sonarr/Radarr/TRaSH

- TV naming defaults are simplified versions of the [TRaSH Sonarr recommended naming scheme](https://trash-guides.info/Sonarr/Sonarr-recommended-naming-scheme/). The full TRaSH scheme includes mediainfo tokens (audio codec, channels, HDR type, video codec, release group) which are available as tokens but not in the default template for simplicity.
- TRaSH Sonarr series folder: `{Series TitleYear}` — we use `{Show Title} ({Year})` which is equivalent.
- TRaSH Sonarr season folder: `Season {season:00}` — we match this exactly.
- TRaSH Radarr movie folder: `{Movie CleanTitle} ({Release Year})` — we use `{Movie Title} ({Year})` which is equivalent.
- Sonarr supports three episode naming formats (standard, daily, anime) — we replicate all three.
- Media management settings (rename, illegal chars, hard links, recycling bin, permissions) match the options available in Sonarr/Radarr Settings > Media Management.

## 10. Navigation & UI Structure

### Sidebar

```
Books
  Add New           /books/add
  Authors           /books/authors
  Titles            /books/titles
TV Shows
  Add New           /tv/add
  Series            /tv/series
  Calendar          /tv/calendar
Movies
  Add New           /movies/add
  Movies            /movies
  Calendar          /movies/calendar
Activity
  Queue             /activity
  History           /activity/history
  Blocklist         /activity/blocklist
Settings            /settings (7 sub-pages)
System              /system (3 sub-pages)
```

### Key Pages

**Books** — largely unchanged from current "Bookshelf":

- `/books` — dashboard/overview
- `/books/add` — Hardcover search
- `/books/authors` — author list with monitoring
- `/books/titles` — book list
- Author detail, book detail pages preserved

**TV Shows:**

- `/tv/add` — TMDB search for shows
- `/tv/series` — all monitored series (poster grid or table, filterable by status/profile/network)
- `/tv/series/$showId` — show detail: seasons accordion, episode list with file status per episode, edit show metadata, interactive search
- `/tv/calendar` — upcoming episodes calendar

**Movies:**

- `/movies/add` — TMDB search for movies
- `/movies` — movie list (poster grid/table, filterable by status/profile/studio/year)
- `/movies/$movieId` — movie detail: file info, history, interactive search
- `/movies/calendar` — upcoming releases calendar

**Activity** — unified with content-type filter:

- Queue, History, Blocklist each have filter tabs: All / Books / TV / Movies

### Mass Editor

Accessible from each content type's list view via a "Mass Editor" toggle/button:

- **Books**: bulk change profile, monitored status on authors
- **TV**: bulk change profile, monitored status, series type on shows
- **Movies**: bulk change profile, monitored status, minimum availability on movies

All use multi-select checkboxes with a bulk action bar.

### Root Folder File Move

When editing a download profile's root folder path:

- Detect if existing files (book files, episode files, movie files) reference paths under the old root
- Show confirmation dialog: "X files will be moved from /old/path to /new/path. Proceed?"
- File move executes as a background task with progress indicator
- On completion, update all affected file path records in the DB and recompute `path` on shows/movies

## 11. File Import & Video Probing

### Video File Import Flow

1. **Scan root folders** — `rescan-folders` task extended for video. Extensions: `.mkv`, `.mp4`, `.avi`, `.ts`, `.wmv`, `.flv`, `.webm`
2. **Determine content type** — based on which profile's root folder the file is under
3. **Parse release name** — new `src/server/release-parser.ts` extracts from filename:
   - Title, year, season number, episode number(s), absolute number
   - Source (HDTV, WEB-DL, WEBRip, BluRay), resolution (720p, 1080p, 2160p)
   - Codec (x264, x265/HEVC, AV1), release group
   - Example: `Show.Name.S02E05.1080p.WEB-DL.x265.mkv` -> show="Show Name", S02E05, source=Web, res=1080, codec=x265
4. **Probe with ffprobe** — extract duration, video codec, resolution, bitrate, audio codec, container (existing infrastructure)
5. **Match to library** — find show+episode or movie in DB by parsed title
6. **Quality assessment** — match source+resolution to a download format, check against profile's format list and size constraints
7. **Import** — move/hardlink to destination using naming template, create `episode_files` or `movie_files` record, set `hasFile = true` on episode

### Season Pack Handling

- Detect folder containing multiple episode files for the same season
- Import each file individually, matching episode numbers from filenames
- If episode numbers can't be parsed, present manual assignment UI (list of unmatched files alongside unmatched episodes)

### Release Name Parser (`src/server/release-parser.ts`)

Regex-based parser for scene naming conventions. Used during:

- File import (matching files to library items)
- Indexer search result evaluation (parsing release titles from RSS/search results)

### Naming Tokens for Video

**TV:** `{Show Title}`, `{Season}`, `{Season:00}`, `{Episode}`, `{Episode:00}`, `{Episode Title}`, `{Absolute}`, `{Absolute:000}`, `{Air-Date}`, `{Year}`, `{Quality}`, `{Codec}`, `{Source}`

**Movies:** `{Movie Title}`, `{Year}`, `{Quality}`, `{Codec}`, `{Source}`, `{Edition}`

## 12. Indexer & Download Integration

### Indexer Search

| Content Type | Search Strategy                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| book         | by book title + author name (existing)                                                                   |
| tv           | by show title + S00E00 (standard), by show title + date (daily), by show title + absolute number (anime) |
| movie        | by movie title + year                                                                                    |

RSS sync and automatic search use the profile's Newznab categories to filter results.

### Download Tracking

`tracked_downloads` gains nullable `showId`, `episodeId`, `movieId` columns. Queue UI shows a content-type icon per item.

### Availability Logic (Movies)

`minimumAvailability` on the movie controls when automatic searching begins:

- `announced` — search immediately after adding
- `inCinemas` — search when theatrical release date is reached
- `released` — search when digital/physical release date is reached

Status transitions are detected during `refresh-tmdb-metadata` task.

### Automatic Search Triggers

- **TV**: episode's air date has passed (detected during metadata refresh)
- **Movies**: movie status meets minimum availability threshold
- **Books**: unchanged (existing logic)

## 13. Implementation Phases

### Phase 1: Foundation

No new content UI pages. Structural and settings changes only.

- DB migration: rename audiobook -> audio, add contentType + keep mediaType on profiles, add source/resolution/enabled columns to formats, migrate all settings keys to new namespaces, NULL for unlimited max/preferred sizes, seed video formats + profiles + conservative book formats
- Update enums, validators, settings-reader, file-import to use new column names
- Update download formats UI: "No Limit" checkbox for max size
- Update download profiles UI: enabled toggle, contentType + mediaType fields
- Update media management settings: Books/TV/Movies tabs
- Update metadata settings: Hardcover/TMDB tabs, move Hardcover API token to DB with env var fallback

**API compatibility note:** Phase 1 changes column names and settings keys. All existing server functions and UI components that reference the old names must be updated atomically. The book UI must remain fully functional after Phase 1.

### Phase 2: Data Model & TMDB Integration

- DB migration: create shows, seasons, episodes, episode_files, movies, movie_files, join tables, extend tracked_downloads/blocklist/history with showId/episodeId/movieId columns
- Implement `src/server/tmdb.ts`
- Implement `src/server/release-parser.ts`
- Video file probing extensions
- `refresh-tmdb-metadata` scheduled task
- TMDB rate limiting

### Phase 3: Movies UI + Features

- `/movies`, `/movies/add`, `/movies/$movieId`, `/movies/calendar`
- Movie file import flow
- Movie search + grab
- Movie mass editor
- Movie history in Activity

### Phase 4: TV Shows UI + Features

- `/tv/add`, `/tv/series`, `/tv/series/$showId`, `/tv/calendar`
- Episode file import + season pack handling
- TV search + grab (standard, daily, anime)
- TV mass editor
- TV history in Activity

### Phase 5: Advanced Features

- Custom format scoring system
- Interactive search refinements
- Cross-content Activity filters
- Root folder file-move with confirmation
- TMDB attribution

Each phase is its own spec -> plan -> implementation cycle.
