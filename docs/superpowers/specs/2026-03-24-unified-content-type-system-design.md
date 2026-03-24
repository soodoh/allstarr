# Unified Content Type System

**Date:** 2026-03-24
**Status:** Draft

## Problem

The codebase has three different type systems for categorizing content:

- **Download Formats** use `type`: "ebook" | "audio" | "video"
- **Download Profiles** use two fields: `contentType` ("book" | "tv" | "movie") + `mediaType` ("ebook" | "audio" | "video")
- **Custom Formats** use `contentTypes` array: ["movie", "tv", "ebook", "audiobook"]

This creates confusion, requires a conversion function (`profileToCFContentType()`), and makes filtering inconsistent across settings pages.

## Solution

Unify everything around a single content type enum matching the Custom Formats model:

```
"movie" | "tv" | "ebook" | "audiobook"
```

All three systems (formats, profiles, custom formats) will use the same enum values, eliminating conversion logic.

## Content Type Mapping

| Value         | Replaces                                                                      | Size Unit    | Default Setting                  |
| ------------- | ----------------------------------------------------------------------------- | ------------ | -------------------------------- |
| `"ebook"`     | formats.type="ebook", profiles.contentType="book"+mediaType="ebook"           | MB/100 pages | Default Page Count (300)         |
| `"audiobook"` | formats.type="audio", profiles.contentType="book"+mediaType="audio"           | kbps         | Default Audio Duration (600 min) |
| `"movie"`     | formats.type="video" (shared), profiles.contentType="movie"+mediaType="video" | MB/minute    | Default Runtime (130 min)        |
| `"tv"`        | formats.type="video" (shared), profiles.contentType="tv"+mediaType="video"    | MB/minute    | Default Episode Runtime (45 min) |

Size units are derived from content type:

- `"ebook"` -> MB/100 pages
- `"audiobook"` -> kbps
- `"movie"` or `"tv"` -> MB/minute

## Schema Changes

### `download_formats` table

Remove the `type` column. Add `content_types` as a JSON array of strings (same pattern as `custom_formats.content_types`).

```
Before: type TEXT NOT NULL DEFAULT 'ebook'
After:  content_types TEXT NOT NULL DEFAULT '["ebook"]'  -- JSON array
```

Seed data mapping:

- All ebook formats (EPUB, MOBI, PDF, AZW3, etc.) -> `["ebook"]`
- All audio formats (MP3, AAC, FLAC, OGG, M4B, etc.) -> `["audiobook"]`
- All video formats (Bluray-1080p, HDTV-720p, WEB-DL, etc.) -> `["movie", "tv"]`

### `download_profiles` table

Remove `type` (mediaType) and `content_type` columns. Add single `content_type` column.

```
Before: type TEXT NOT NULL DEFAULT 'ebook'          -- mediaType
        content_type TEXT NOT NULL DEFAULT 'book'    -- contentType
After:  content_type TEXT NOT NULL DEFAULT 'ebook'   -- unified
```

Valid values: `"movie"` | `"tv"` | `"ebook"` | `"audiobook"`

### `settings` table — key changes

Existing keys use a flat `format.*` prefix. Rename to `format.{contentType}.*` for consistency:

| Key                                | Default | Notes                                                     |
| ---------------------------------- | ------- | --------------------------------------------------------- |
| `format.movie.defaultRuntime`      | 130     | New — default movie runtime in minutes (a la Radarr)      |
| `format.tv.defaultEpisodeRuntime`  | 45      | New — default TV episode runtime in minutes (a la Sonarr) |
| `format.ebook.defaultPageCount`    | 300     | Renamed from `format.defaultPageCount`                    |
| `format.audiobook.defaultDuration` | 600     | Renamed from `format.defaultAudioDuration`                |

### Validator changes (`src/lib/validators.ts`)

- Download profile schema: replace `mediaType` + `contentType` with single `contentType: z.enum(["movie", "tv", "ebook", "audiobook"])`
- Download format schema: replace `type: z.enum(["ebook", "audio", "video"])` with `contentTypes` array
- Remove `profileToCFContentType()` from `src/server/indexers/cf-scoring.ts` — profiles and custom formats now share the same enum directly

### Migration strategy

Flatten into the base migration (`0000_*.sql`). Delete the existing SQLite database and regenerate from the updated schema. This is appropriate since the app is pre-release with no production data.

## UI Changes

### Settings page (`/settings`)

Add a "Custom Formats" navigation card to the existing grid:

- **Title:** Custom Formats
- **Description:** Custom scoring rules for release quality
- **Icon:** lucide-react icon matching card style
- **Route:** `/settings/custom-formats`

### Formats page (`/settings/formats`)

**Tabs:** Replace current Ebook | Audio | Video tabs with All | Movie | TV | Ebook | Audiobook.

**Content Type column:** Add a "Content Type" column next to the Title column. Uses colored badges matching Custom Formats:

- Movie: blue
- TV: purple
- Ebook: green
- Audiobook: amber

Video formats (tagged Movie+TV) show both badges.

**Defaults section:** Each content-type tab shows its own defaults section:

- Ebook: Default Page Count (300 pages)
- Audiobook: Default Audio Duration (600 min)
- Movie: Default Runtime (130 min)
- TV: Default Episode Runtime (45 min)

The "All" tab shows no defaults section (mixed content types with different units).

**Size units** are contextual per content type:

- Ebook: MB/100 pages
- Audiobook: kbps
- Movie/TV: MB/minute

### Profiles page (`/settings/profiles`)

**Tabs:** Add All | Movie | TV | Ebook | Audiobook tabs (matching Formats and Custom Formats).

**Content Type column:** Replace the current "Content" and "Media" columns with a single "Content Type" column using colored badges.

### Profile form (add/edit dialog)

Replace the two-dropdown approach (Content Type + Media Type) with a single "Content Type" select:

- Options: Movie, TV, Ebook, Audiobook
- Helper text: "Determines which formats and custom formats are available"

When content type changes, filter the available format items to those matching the new content type's `contentTypes` array.

### Author add/edit filtering

When adding or editing an author, the profile dropdown must show profiles where `contentType` is either `"ebook"` or `"audiobook"` (replacing the current `contentType === "book"` filter).

Similarly:

- Show pages filter profiles by `contentType === "tv"`
- Movie pages filter profiles by `contentType === "movie"`

## Affected Files

### Schema

- `src/db/schema/download-formats.ts` — replace `type` with `contentTypes`
- `src/db/schema/download-profiles.ts` — replace dual columns with single `contentType`

### Validators

- `src/lib/validators.ts` — update download profile and format schemas

### Server functions

- `src/server/indexers/cf-scoring.ts` — remove `profileToCFContentType()`
- `src/server/shows.ts` — update profile filtering
- `src/server/movies.ts` — update profile filtering (if exists)
- Any server function that references `mediaType` or the old `contentType` values

### Seed data

- `drizzle/0000_*.sql` — format and profile seed data lives in the base migration SQL
- `src/db/seed-custom-formats.ts` — update preset matching logic (no longer needs mediaType+contentType combo)
- `src/lib/custom-format-preset-data.ts` — simplify preset type to use single `contentType`

### Routes

- `src/routes/_authed/settings/index.tsx` — add Custom Formats card
- `src/routes/_authed/settings/formats.tsx` — new tabs, defaults, content type column
- `src/routes/_authed/settings/profiles.tsx` — new tabs, single content type column

### Components

- `src/components/settings/download-profiles/download-profile-form.tsx` — single Content Type select
- Format list components — add content type column, update type-based logic
- Author add/edit components — update profile filtering from `"book"` to `["ebook", "audiobook"]`

### Migration

- `drizzle/0000_*.sql` — regenerate base migration from updated schema
- Delete `data/sqlite.db` and regenerate
