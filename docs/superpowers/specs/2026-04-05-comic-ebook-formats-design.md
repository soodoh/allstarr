# Comic Ebook Formats & Profile

## Summary

Repurpose the existing manga download formats and profile to serve as comic/manga ebook formats. The manga content type is being retired (commit `41a7ee1`), but the underlying formats (CBZ, CBR, PDF, EPUB) are the same formats used for comics. Rather than removing and re-adding, we update them in place.

## Changes

### Seed Migration (`0000_deep_morlun.sql`)

Update existing manga formats (IDs 30-34) to ebook content type with comic-appropriate size rates:

| ID | Title | Weight | Min | Max (per 100pg) | Preferred (per 100pg) | Color | Content Type |
|----|-------|--------|-----|------------------|----------------------|-------|--------------|
| 30 | Unknown Comic | 1 | 0 | 300 | 100 | gray | ebook |
| 31 | CBR | 2 | 0 | 300 | 100 | orange | ebook |
| 32 | CBZ | 3 | 0 | 300 | 100 | green | ebook |
| 33 | PDF | 4 | 0 | 300 | 100 | yellow | ebook |
| 34 | EPUB | 5 | 0 | 300 | 100 | blue | ebook |

Size rationale: Comic pages are image-heavy (~1-3 MB/page). 300 MB/100pg max (3 MB/page) accommodates high-res scans. 100 MB/100pg preferred (1 MB/page) targets well-compressed releases. Sizes scale dynamically via `computeEffectiveSizes()` in `src/lib/format-size-calc.ts`.

### Seed Migration — Profile

Update existing Manga profile (ID 8):

| Field | Old Value | New Value |
|-------|-----------|-----------|
| name | Manga | Comics/Manga |
| contentType | manga | ebook |
| rootFolderPath | ./data/manga | ./data/comics |
| items | `[[CBZ], [CBR], [EPUB], [PDF]]` | same priority order, updated IDs |

Icon remains `book-open-text`.

### New Data Migration

A new SQL migration updates existing databases with the same changes:

1. Update `download_formats` where `content_types LIKE '%manga%'` — set content type to `["ebook"]`, update title for "Unknown Manga" → "Unknown Comic", set new size rates
2. Update `download_profiles` where `name = 'Manga'` — set name, content type, root folder path

### What Doesn't Change

- No schema changes — data-only updates
- No UI changes — formats appear automatically under ebook profiles
- `sizeMode()` in `format-size-calc.ts` already routes non-audio/non-video to `"ebook"` mode
- The `0023` migration dropping manga tables stays as-is
