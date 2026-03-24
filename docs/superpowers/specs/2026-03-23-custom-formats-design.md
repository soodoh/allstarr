# Custom Formats for Download Profiles

## Overview

Add a Custom Formats scoring system to Allstarr's download profiles, providing Sonarr/Radarr-equivalent functionality with a better native UX. Custom Formats are global matching rules that assign numeric scores to releases. Within a quality tier group, the release with the highest total Custom Format score wins.

This design cleanly separates **quality tiers** (what format/resolution is acceptable) from **custom format scoring** (which release is preferred within an acceptable tier). It replaces the current dual-role `download_formats` system where specifications and quality identity are mixed together.

## Goals

- Parity with Sonarr/Radarr custom format scoring behavior for video (movies, TV, anime)
- Flexible matching conditions for book/audiobook-specific criteria (narrator, bitrate, publisher, etc.)
- Better UX than Sonarr/Radarr: built-in preset library, categorized formats, default scores, one-click setup
- Import/export support for sharing configs and one-time TRaSH Guide JSON import

## Non-Goals

- Recyclarr API compatibility or live sync
- Real-time release score preview UI (future enhancement, noted but not in scope)

## Data Model

### Refactor: `download_formats` (quality tiers)

Strip out `specifications`. These become pure quality tier definitions:

| Column          | Type           | Description                                                |
| --------------- | -------------- | ---------------------------------------------------------- |
| `id`            | integer PK     | Auto-increment                                             |
| `title`         | text           | Display name (e.g., "EPUB", "Bluray-1080p")                |
| `type`          | text           | `ebook`, `audio`, or `video`                               |
| `source`        | text, nullable | Source identifier (e.g., "EPUB", "MP3", "WEBDL", "Bluray") |
| `resolution`    | integer        | Video resolution (0 for non-video)                         |
| `weight`        | integer        | Used for size limit calculations                           |
| `minSize`       | real           | Minimum acceptable size                                    |
| `maxSize`       | real, nullable | Maximum acceptable size                                    |
| `preferredSize` | real, nullable | Preferred size target                                      |
| `color`         | text           | UI badge color                                             |
| `enabled`       | boolean        | Whether this tier is available                             |

Removed fields: `specifications` (moves to custom formats).

### Refactor: `download_profiles`

#### Quality tier grouping

Change `items` from `number[]` to `number[][]`. Each inner array is a **group** of equivalent quality tiers:

```
[[5, 6], [3], [1, 2]]
```

- `[5, 6]` = highest priority group (formats 5 and 6 are considered equal quality)
- `[3]` = middle priority (single format)
- `[1, 2]` = lowest priority group

Formats within the same group are considered equal quality. Custom Format scores break ties within a group. Between groups, the ordering always wins regardless of CF score.

#### New fields

| Column                          | Type    | Default | Description                                    |
| ------------------------------- | ------- | ------- | ---------------------------------------------- |
| `minCustomFormatScore`          | integer | 0       | Reject releases with total CF score below this |
| `upgradeUntilCustomFormatScore` | integer | 0       | Stop upgrading once this CF score is reached   |

### New: `custom_formats` table

| Column              | Type           | Description                                                  |
| ------------------- | -------------- | ------------------------------------------------------------ |
| `id`                | integer PK     | Auto-increment                                               |
| `name`              | text           | Display name (e.g., "TrueHD ATMOS", "LQ Groups")             |
| `category`          | text           | Organizational category (see Category List below)            |
| `specifications`    | JSON           | Array of matching conditions (see Specification Types)       |
| `defaultScore`      | integer        | Out-of-the-box score for this CF                             |
| `contentTypes`      | JSON           | Array of applicable content types: `["movie", "tv", "book"]` |
| `includeInRenaming` | boolean        | Whether matched CF name appears in file renaming             |
| `description`       | text, nullable | Plain-english explanation of what this CF does               |
| `source`            | text, nullable | `"builtin"`, `"imported"`, or null for user-created          |
| `enabled`           | boolean        | Whether this CF is active                                    |

### New: `profile_custom_formats` join table

| Column           | Type       | Description                       |
| ---------------- | ---------- | --------------------------------- |
| `profileId`      | integer FK | References `download_profiles.id` |
| `customFormatId` | integer FK | References `custom_formats.id`    |
| `score`          | integer    | Score for this CF in this profile |

Unique constraint on `(profileId, customFormatId)`.

A CF only affects a profile if a row exists in this table. New profiles start empty. Presets populate this table.

### Custom Format Categories

Categories are fixed strings used for UI organization, not a separate table:

| Category            | Content Types | Examples                                  |
| ------------------- | ------------- | ----------------------------------------- |
| `Audio Codec`       | movie, tv     | TrueHD ATMOS, DTS-X, DTS-HD MA, FLAC, AAC |
| `Audio Channels`    | movie, tv     | 7.1 Surround, 5.1 Surround, 2.0 Stereo    |
| `Video Codec`       | movie, tv     | x265/HEVC, x264, AV1                      |
| `HDR`               | movie, tv     | Dolby Vision, HDR10+, HDR10, HLG          |
| `Resolution`        | movie, tv     | 2160p, 1080p, 720p                        |
| `Source`            | movie, tv     | Bluray, WEBDL, WEBRip, HDTV               |
| `Quality Modifier`  | movie, tv     | Remux, BR-DISK, Screener                  |
| `Streaming Service` | movie, tv     | AMZN, NF, ATVP, DSNP, HMAX                |
| `Release Group`     | all           | Tiered release group reputation lists     |
| `Edition`           | movie         | Extended, Director's Cut, IMAX, Criterion |
| `Release Type`      | tv            | Season Pack, Multi-Episode                |
| `Unwanted`          | all           | LQ Groups, BR-DISK, 3D, Upscaled          |
| `Language`          | all           | Language preferences and penalties        |
| `File Format`       | book          | EPUB preference, PDF penalty, etc.        |
| `Audiobook Quality` | book          | Bitrate, narrator, duration criteria      |
| `Publisher`         | book          | Publisher/imprint preferences             |

## Specification Types

Each custom format contains a `specifications` array. Each specification:

```typescript
type Specification = {
  name: string; // Display name for this condition
  type: SpecificationType; // Condition type (see below)
  value: string; // Primary value (regex, enum, etc.)
  min?: number; // For range types
  max?: number; // For range types
  negate: boolean; // Invert the match
  required: boolean; // AND logic (true) vs OR logic (false)
};
```

### Matching logic

Follows Sonarr/Radarr's AND/OR model:

- **Required specs** (`required: true`): ALL must match (AND logic)
- **Non-required specs** (`required: false`): At least ONE must match (OR logic)
- **Negate** (`negate: true`): The spec matches when the condition does NOT match
- A CF with only required specs matches when all of them match
- A CF with only non-required specs matches when at least one matches
- A CF with both types matches when all required AND at least one non-required match

### Universal types (all content types)

| Type           | Matches Against            | Value Type      | Example                    |
| -------------- | -------------------------- | --------------- | -------------------------- |
| `releaseTitle` | Regex on full release name | regex string    | `\b(ATMOS)\b`              |
| `releaseGroup` | Regex on release group     | regex string    | `^(FraMeSToR\|BHDStudio)$` |
| `size`         | File size in MB            | min/max numbers | `{min: 0, max: 500}`       |
| `indexerFlag`  | Indexer-specific flags     | flag string     | `freeleech`, `internal`    |
| `language`     | Audio/text language        | language code   | `en`, `ja`                 |

### Video types (movies, TV, anime)

| Type               | Matches Against             | Value Type   | Example                                       |
| ------------------ | --------------------------- | ------------ | --------------------------------------------- |
| `videoSource`      | Media source                | enum string  | `webdl`, `webrip`, `bluray`, `hdtv`           |
| `resolution`       | Video resolution            | enum string  | `r2160p`, `r1080p`, `r720p`                   |
| `qualityModifier`  | Quality modifier flags      | enum string  | `remux`, `brdisk`, `screener`                 |
| `edition`          | Regex on edition info       | regex string | `\b(Extended\|Director)\b`                    |
| `videoCodec`       | Regex on codec info         | regex string | `\b(x265\|HEVC)\b`                            |
| `audioCodec`       | Regex on audio codec        | regex string | `\b(TrueHD\|DTS-HD)\b`                        |
| `audioChannels`    | Channel layout              | enum string  | `7.1`, `5.1`, `2.0`                           |
| `hdrFormat`        | HDR metadata format         | enum string  | `dolbyvision`, `hdr10plus`, `hdr10`, `hlg`    |
| `streamingService` | Streaming platform          | enum string  | `amzn`, `nf`, `atvp`, `dsnp`                  |
| `releaseType`      | Episode packaging (TV only) | enum string  | `singleEpisode`, `multiEpisode`, `seasonPack` |

### Book/Audiobook types

| Type            | Matches Against             | Value Type      | Example                             |
| --------------- | --------------------------- | --------------- | ----------------------------------- |
| `fileFormat`    | File extension/format       | enum string     | `epub`, `mobi`, `pdf`, `m4b`, `mp3` |
| `audioBitrate`  | Bitrate range in kbps       | min/max numbers | `{min: 128, max: 320}`              |
| `narrator`      | Regex on narrator metadata  | regex string    | `Stephen Fry`                       |
| `publisher`     | Regex on publisher metadata | regex string    | `\b(Penguin\|Random House)\b`       |
| `audioDuration` | Duration range in minutes   | min/max numbers | `{min: 60}`                         |

Note: `fileFormat` intentionally overlaps with quality tiers. A CF can score within an audiobook tier group (e.g., prefer M4B over MP3) independent of tier ordering.

## Scoring & Upgrade Mechanics

### Release evaluation priority

1. **Quality tier** -- a release in a higher-ranked tier group always wins, regardless of CF score
2. **Custom Format score** -- sum of all matching CF scores; breaks ties within the same tier group
3. **Protocol preference** -- usenet vs torrent (existing setting)
4. **Indexer priority** -- existing indexer ranking
5. **Seeds/age** -- existing tiebreakers

### Score calculation

When a release is evaluated:

1. Parse release attributes (title, group, size, codec, format, etc.)
2. Test every CF assigned to the profile against those attributes
3. For each matching CF, add its score to a running total
4. The total is the release's Custom Format Score

### Upgrade flow

1. **Initial grab**: Release must meet minimum quality tier AND `minCustomFormatScore`. First qualifying release is grabbed.
2. **Upgrade evaluation**: A new release replaces the current one if:
   - It's in a higher quality tier group, OR
   - It's in the same tier group with a higher CF score
   - AND `upgradeAllowed` is true on the profile
3. **Upgrade stops when**: The current file meets BOTH the `cutoff` tier AND `upgradeUntilCustomFormatScore`

### Score range conventions (for built-in presets)

| Range          | Meaning           | Usage                                       |
| -------------- | ----------------- | ------------------------------------------- |
| +1500 to +2500 | Strongly prefer   | Top-tier release groups, best codecs        |
| +500 to +1499  | Prefer            | Good release groups, preferred formats      |
| +1 to +499     | Slight preference | Nice-to-haves (specific audio format, HDR)  |
| 0              | Neutral           | Informational only (streaming service tags) |
| -1 to -999     | Penalize          | Discouraged but not blocked                 |
| -10000         | Block             | Hard reject (LQ groups, BR-DISK, unwanted)  |

A CF scored at -10000 effectively blocks a release because the total score will fall below any reasonable `minCustomFormatScore`. No separate "block" concept is needed.

## Preset & Import/Export System

### Built-in Presets

A preset is a packaged bundle that populates a profile:

- A set of Custom Formats (created if they don't already exist)
- Score assignments for each CF
- Suggested quality tier grouping and ordering
- Suggested `minCustomFormatScore` and `upgradeUntilCustomFormatScore` values

Presets ship with the app as seed data. CFs created by presets are tagged `source: "builtin"`. Presets can be updated with app releases (only updating CFs that haven't been user-modified).

#### Preset categories

| Category          | Examples                                                |
| ----------------- | ------------------------------------------------------- |
| Video - Movies    | "HD Bluray + WEB", "4K HDR Remux", "Minimal Setup"      |
| Video - TV        | "HD WEB Streaming", "4K Anime", "Season Pack Preferred" |
| Books - Ebook     | "Retail EPUB Preferred", "Multi-Format Library"         |
| Books - Audiobook | "High Bitrate M4B", "Narrator Quality"                  |

#### Applying a preset

1. User creates a new profile, picks content/media type
2. System shows available presets for that type
3. User picks a preset: CFs are created (or reused if they exist by name), scores populated, tier groups suggested
4. User can tweak anything from there

### Import/Export

Custom formats and profile scoring configs can be exported as JSON:

```json
{
  "customFormats": [
    {
      "name": "TrueHD ATMOS",
      "category": "Audio Codec",
      "contentTypes": ["movie", "tv"],
      "defaultScore": 500,
      "specifications": [
        {
          "name": "TrueHD",
          "type": "releaseTitle",
          "value": "\\b(TrueHD)\\b",
          "negate": false,
          "required": true
        },
        {
          "name": "ATMOS",
          "type": "releaseTitle",
          "value": "\\b(ATMOS)\\b",
          "negate": false,
          "required": true
        }
      ]
    }
  ],
  "profileScores": {
    "HD Bluray + WEB": [
      { "formatName": "TrueHD ATMOS", "score": 500 },
      { "formatName": "LQ Groups", "score": -10000 }
    ]
  }
}
```

**Import behavior:**

- CFs matched by name. If a CF with the same name exists, user is prompted to: skip, overwrite, or import as copy
- Profile scores are applied to the selected profile
- TRaSH Guide JSON files can be imported directly: the system maps their specification structure to Allstarr's spec types. One-time import, not live sync.

## UI Changes

### Custom Formats Management Page

New page under Settings, organized by category tabs/filters (Audio Codec, HDR, Release Group, Unwanted, etc.) with an "All" default view.

Each CF shown as a card or row with:

- Name
- Category badge
- Content type badges (book/tv/movie)
- Default score
- Source badge (builtin/imported/custom)
- Enabled toggle

Actions: create new, edit, delete, duplicate, import, bulk export.

### Custom Format Editor (dialog/sheet)

- Name input
- Category dropdown
- Content types multi-select (book/tv/movie)
- Default score input with scoring convention ranges shown as helper text
- Description field
- Include in renaming toggle
- **Specifications builder**: Visual condition builder. Each row shows:
  - Type dropdown
  - Value input (adapts per type: regex field, enum select, min/max range)
  - Required toggle
  - Negate toggle
  - Clear labels like "Release title matches [regex]" / "Resolution is NOT [2160p]"

### Profile Editor Changes

Two new sections added to the existing download profile form:

#### 1. Quality Tier Grouping

The current sortable format list evolves. Users can drag formats into groups (visually shown as bracketed rows sharing a rank). Formats within a group show a "tied" indicator. Same drag-to-reorder for group ordering.

#### 2. Custom Format Scores

New section below quality tiers. Shows CFs assigned to this profile in a table:

- Name
- Category
- Default score
- Profile score (editable inline)
- "Modified" badge if score differs from default

Actions:

- Add individual CFs (searchable dropdown filtered by content type)
- Add all CFs from a category (one click)
- Apply a preset (bulk-adds CFs with preset scores)
- Remove CF from profile
- Reset score to default
- `minCustomFormatScore` and `upgradeUntilCustomFormatScore` fields at the top of this section

### Future Enhancement: Release Score Visibility

Not in initial scope, but worth noting: when viewing a book/movie/show detail page, releases or grabbed files could show their CF score breakdown (which CFs matched, individual scores, total). This makes the scoring system transparent rather than a black box.

## Migration Strategy

### Schema migration

1. Add `custom_formats` and `profile_custom_formats` tables
2. Add `minCustomFormatScore` and `upgradeUntilCustomFormatScore` columns to `download_profiles` (default 0, backward compatible)
3. Convert `download_profiles.items` from `number[]` to `number[][]` (each existing item becomes a single-element group: `[1, 2, 3]` becomes `[[1], [2], [3]]`)
4. Migrate existing `download_formats.specifications` data into new `custom_formats` entries where applicable
5. Remove `specifications` column from `download_formats`

### Seed data

Seed built-in presets and their associated custom formats during migration. Tag all seeded CFs with `source: "builtin"`.

### Backward compatibility

- Existing profiles continue to work unchanged (all formats become single-element groups, no CFs assigned = score 0 for everything = no scoring behavior change)
- Existing format definitions retain their quality tier identity
- No breaking changes to the author/book/show/movie profile assignment system
