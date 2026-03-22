# Dynamic File Format Sizing

## Summary

Replace the static flat-MB size limits on download formats with rate-based dynamic sizing. Ebook formats use MB per 100 pages (scaled by page count), audiobook formats use kbps (scaled by duration). When edition metadata is missing, configurable default dimensions (page count / audio duration) are used as fallbacks.

## Data Model

### download_formats table — no schema changes

The existing columns `minSize`, `maxSize`, `preferredSize` (all `real`) are reinterpreted:

| Format Type | Unit                | Meaning                                                           |
| ----------- | ------------------- | ----------------------------------------------------------------- |
| Ebook       | MB per 100 pages    | Rate multiplied by `pageCount / 100` to get effective MB          |
| Audiobook   | kbps (kilobits/sec) | Rate multiplied by `128 * durationSeconds` to get effective bytes |

No new columns are added to this table.

### settings table — two new entries

| Key                    | Default | Description                                                  |
| ---------------------- | ------- | ------------------------------------------------------------ |
| `defaultPageCount`     | `300`   | Assumed page count when edition lacks `pageCount`            |
| `defaultAudioDuration` | `600`   | Assumed duration in minutes when edition lacks `audioLength` |

These follow the Sonarr/Radarr pattern of using default dimension values (Sonarr: 45 min, Radarr: 110 min) rather than flat size fallbacks.

## Size Calculation Logic

### Ebook formats

```
effectivePages = edition.pageCount ?? settings.defaultPageCount
effectiveMinMB = minSize * (effectivePages / 100)
effectiveMaxMB = maxSize * (effectivePages / 100)
effectivePreferredMB = preferredSize * (effectivePages / 100)
```

`preferredSize` is UI-only — it controls the slider's middle thumb to show the user's ideal target. It is not used in rejection logic.

### Audiobook formats

```
effectiveDurationMin = edition.audioLength ?? settings.defaultAudioDuration
effectiveDurationSec = effectiveDurationMin * 60
effectiveMinMB = (minSize * 128 * effectiveDurationSec) / (1024 * 1024)
effectiveMaxMB = (maxSize * 128 * effectiveDurationSec) / (1024 * 1024)
effectivePreferredMB = (preferredSize * 128 * effectiveDurationSec) / (1024 * 1024)
```

The factor `128` converts kbps to bytes/sec using the binary computing convention (1 kbit = 1024 bits, so 1024/8 = 128). This matches Lidarr's `NumberExtensions.Kilobits()` implementation and is consistent with the rest of the codebase which uses binary MB (`/ (1024 * 1024)`).

### Special cases

- `maxSize = 0` or `null` → unlimited (no upper bound check), displayed as "Unlimited" in UI
- `minSize = 0` → no lower bound check
- Unknown Text / Unknown Audio formats: all rates set to 0 (no size filtering)

## Release Rejection Changes

### Current behavior (format-parser.ts + indexers.ts)

`getDefSizeLimits(qualityId)` returns flat `{ minSize, maxSize }` in MB. `computeReleaseMetrics` compares `release.size / (1024 * 1024)` against these flat values.

### New behavior

1. **Cache stores raw rates + type.** The `sizeLimitsCache` is updated to store `{ minSize, maxSize, type }` (raw rate values and format type). Effective MB is computed on each call, not cached, since it varies per edition.

2. **`getDefSizeLimits` accepts edition metadata:**
   - Signature: `getDefSizeLimits(qualityId, editionMeta?)` where `editionMeta = { pageCount?: number, audioLength?: number }`
   - Reads cached raw rates + type, applies the rate formula with edition metadata or settings fallbacks
   - Returns `{ minSize, maxSize }` in effective MB (same return shape, callers don't change)

3. **Edition metadata lookup:** `dedupeAndScoreReleases` already receives `bookId`. It looks up the **monitored edition** for the book once (not per-release), extracts `{ pageCount, audioLength }`, and passes this to `computeReleaseMetrics`. When a book has multiple editions, use the edition that is currently monitored/selected. `computeReleaseMetrics` gains an `editionMeta?` parameter and threads it to `getDefSizeLimits`. This avoids N+1 queries.

4. When `bookId` is null (free-form search), `editionMeta` is omitted and `getDefSizeLimits` uses the default dimension settings for calculation.

5. Rejection messages include the dimension context:
   - `"150 MB is above maximum 45 MB for EPUB (based on 300 pages)"`
   - `"250 MB is above maximum 192 MB for MP3 (based on 10h duration)"`

## Default Seed Values

### Ebook formats (MB per 100 pages)

| Format       | Min | Preferred | Max | Reasoning                                        |
| ------------ | --- | --------- | --- | ------------------------------------------------ |
| EPUB         | 0   | 1.5       | 15  | Typical EPUB ~0.5-5 MB for 300pg                 |
| MOBI         | 0   | 2         | 15  | Slightly larger than EPUB due to format overhead |
| AZW3         | 0   | 2         | 15  | Similar to MOBI                                  |
| PDF          | 0   | 5         | 50  | Scanned/image-heavy PDFs run much larger         |
| Unknown Text | 0   | 0         | 0   | No size filtering                                |

### Audiobook formats (kbps)

| Format        | Min | Preferred | Max           | Reasoning                               |
| ------------- | --- | --------- | ------------- | --------------------------------------- |
| MP3           | 0   | 195       | 350           | Based on Lidarr MP3-320 defaults        |
| M4B           | 0   | 195       | 350           | AAC container, similar bitrates         |
| FLAC          | 0   | 895       | 0 (unlimited) | Based on Lidarr FLAC defaults, lossless |
| Unknown Audio | 0   | 0         | 0             | No size filtering                       |

## UI Changes

### Formats settings page (`src/routes/_authed/settings/formats.tsx`)

#### Per-tab fallback section

Each tab (Ebook / Audiobook) gets a "Size Calculation Defaults" section at the top, above the format list:

- **Ebook tab**: "Default Page Count" number input (default 300), with helper text "Used when an edition's page count is unavailable"
- **Audiobook tab**: "Default Audio Duration" number input in minutes (default 600), with helper text "Used when an edition's audio duration is unavailable", and a parenthetical showing the hours equivalent (e.g., "10 hours")

These inputs read/write to the `settings` table via existing settings server functions.

#### Slider label changes

- **Ebook formats**: Slider labels change from "MB" to "MB/100pg"
- **Audiobook formats**: Slider labels change to "kbps"
- Slider max range stays type-dependent (already implemented)

#### Example size table

Below each format row's slider, add an "Example sizes" row showing calculated effective sizes at sample dimensions using that row's specific rates:

- **Ebook**: 200 pages, 400 pages, 800 pages
- **Audiobook**: 5 hours, 10 hours, 20 hours

Format: `"200 pg: 0 – 30 MB"` / `"5 hr: 0 – 769 MB"`

When max is unlimited (0), show "No limit".

### Format form dialog

The create/edit format dialog does not need changes — it already has fields for min/max/preferred size values. The interpretation just changes based on type.

## Migration

### Migration file: `drizzle/0006_dynamic_format_sizes.sql`

For **new/default installations** (formats still at seed values), the migration replaces flat MB values with the new rate-based defaults from the seed tables above.

For **existing users with customized values**, the migration converts their values using these formulas:

- **Ebook formats**: `newRate = existingMB / (defaultPageCount / 100)` → i.e., divide by 3 (assuming 300 pages). Example: existing EPUB maxSize=50 MB → `50 / 3 = 16.67` MB/100pg.
- **Audiobook formats**: `newRate = (existingMB * 1024 * 1024) / (128 * defaultDurationSec)` → convert flat MB back to kbps assuming 10h duration. Example: existing MP3 maxSize=2000 MB → `(2000 * 1048576) / (128 * 36000) = 455` kbps.

In practice, since the app is pre-release, we can simplify by just setting the new seed defaults unconditionally. If preserving custom values becomes important, the conversion formulas above can be applied.

Additional migration steps:

1. Insert `defaultPageCount = 300` and `defaultAudioDuration = 600` into settings table

No DDL changes — only data updates. The column types and names remain the same.

### Seed SQL update

Update the initial seed in `drizzle/0000_puzzling_scarlet_spider.sql` (or equivalent) to use the new rate-based default values instead of flat MB values.

## Files to Modify

### Server/logic

- `src/server/indexers/format-parser.ts` — update `sizeLimitsCache` to store raw rates + type; update `getDefSizeLimits` to accept edition metadata and compute dynamic sizes per call
- `src/server/indexers.ts` — look up monitored edition metadata in `dedupeAndScoreReleases`; thread `editionMeta` through `computeReleaseMetrics` to `getDefSizeLimits`; update rejection messages to include dimension context
- `src/server/settings.ts` — add server functions to read/write the new default settings (if not already generic)

### UI

- `src/routes/_authed/settings/formats.tsx` — add per-tab fallback input sections; update slider labels
- `src/components/settings/download-formats/download-format-list.tsx` — change slider unit labels; add example size table below each format row

### Database

- `drizzle/0006_dynamic_format_sizes.sql` — migration to update existing format values and add default settings
- Seed SQL — update default values for new installations
