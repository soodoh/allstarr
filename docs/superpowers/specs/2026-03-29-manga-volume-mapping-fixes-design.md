# Manga Volume Mapping Fixes

## Problem

Manga volume-to-chapter mappings have multiple data quality issues across series:

- **One Piece**: Uncategorized chapters between volumes 3-4 (chapters 22-24), chapters 25-26 missing entirely, Volume 40 incorrectly includes 802 chapters
- **Berserk**: First 200+ chapters missing entirely
- **Witch Hat Atelier**: Latest ~30 chapters missing

Root causes identified across three areas:

1. **Wikipedia integration is broken** for many series (subpage discovery fails, search returns wrong pages, chapter formats unrecognized)
2. **`deriveVolumeRanges` design flaw** makes the last parsed volume absorb all chapters up to `latestChapter`
3. **MangaUpdates data gaps** -- missing chapter releases for older series (Berserk 1-226) and latest chapters (Witch Hat 69-94), plus only ~50% of releases have volume assignments

## Data Source Investigation

Investigated six potential data sources. Results:

| Source                                 | Volume-Chapter Mapping                                | Chapter Discovery                           | Viable?                            |
| -------------------------------------- | ----------------------------------------------------- | ------------------------------------------- | ---------------------------------- |
| **MangaDex** `/aggregate`              | Pre-computed, structured, single API call             | Full chapter lists available                | Yes -- new primary                 |
| **Wikipedia** `{{Graphic novel list}}` | Complete for popular series, standardized template    | N/A                                         | Yes -- fallback (with fixes)       |
| **MangaUpdates** releases              | 50-70% of releases have volume data, often inaccurate | Good but has gaps for older/latest chapters | Yes -- lowest priority fallback    |
| **Fandom wikis**                       | Good data but every wiki uses different templates     | Varies                                      | No -- per-wiki parsers too complex |
| **AniList / MyAnimeList**              | Series-level counts only, no per-chapter data         | N/A                                         | No                                 |
| **Kitsu**                              | Bulk-generated placeholder data, inaccurate           | Unreliable                                  | No                                 |

### MangaDex coverage for affected series

| Series                | MangaDex Volume Coverage                   | MangaDex Chapter Coverage |
| --------------------- | ------------------------------------------ | ------------------------- |
| **One Piece**         | 60 of 114 volumes (gap at vols 7-60)       | Partial                   |
| **Berserk**           | All 40 volumes, all 380+ chapters          | Complete                  |
| **Witch Hat Atelier** | 15 volumes, only latest unassigned missing | Near-complete             |

### Wikipedia coverage (with parser fixes applied)

| Series                | Volumes Available          | Notes                                                              |
| --------------------- | -------------------------- | ------------------------------------------------------------------ |
| **One Piece**         | 100+ across 6 subpages     | Requires subpage discovery fix                                     |
| **Berserk**           | 37 of 43                   | Vols 1-4 need new chapter extraction strategy                      |
| **Witch Hat Atelier** | 15 volumes on main article | Requires search to check main article, new chapter format strategy |

## Design

### 1. MangaDex Integration (New Primary Volume Source)

**New module**: `src/server/mangadex.ts`

Mirrors the `wikipedia.ts` pattern: cached API fetcher with rate limiting and retry.

**Two core operations**:

1. **Search & match**: `GET /manga?title={title}` to search MangaDex. Verify match by comparing the `links.mu` slug from MangaDex against our stored `mangaUpdatesSlug`. This prevents false matches on similarly-named series.

2. **Fetch aggregate**: `GET /manga/{id}/aggregate` (no `translatedLanguage` filter for maximum coverage). Returns a pre-computed volume-to-chapter structure:
   ```json
   {
     "volumes": {
       "1": { "volume": "1", "count": 8, "chapters": { "1": {...}, "2": {...}, ... } },
       "2": { "volume": "2", "count": 9, "chapters": { "9": {...}, ... } }
     }
   }
   ```

**Output**: Converts to `VolumeMappings[]` (renamed from `WikipediaVolumeMapping[]`) with `{ volumeNumber, firstChapter, lastChapter }` derived from the min/max chapter numbers per volume. Chapters in the `"none"` bucket (no volume assigned) are left unmapped.

**Schema change**: Add nullable `mangaDexId` text column to the `manga` table. Populated on first successful match, reused for subsequent refreshes.

**Staleness**: Same 7-day refresh window as Wikipedia. Stored as `mangaDexFetchedAt` timestamp on the manga row.

### 2. Wikipedia Parser Fixes (Fallback Source)

Four targeted fixes to `src/server/wikipedia.ts`:

**Fix 1: Subpage discovery** (`extractSubpageLinks`)

Currently only matches `{{further|...}}` and `{{main|...}}`. Add detection of plain wikilinks matching chapter list subpage patterns:

```
[[List of X chapters (N-M)|...]]
```

This covers hub pages like "Lists of One Piece chapters" that use standard wikilinks instead of template transclusions.

**Fix 2: Search ranking** (`searchChapterListPage`)

Currently returns the first search result matching `/list of .* chapters/i`. This can match "List of One Piece manga **volumes**" before the actual chapters page. Fix:

- Deprioritize results containing "volumes" in the title
- Prefer exact matches on "chapters"
- If no "List of" page found, also check the main article page for `{{Graphic novel list}}` templates (handles Witch Hat Atelier where volume data lives on the main series article)

**Fix 3: Chapter format recognition** (`extractFirstChapterNumber`)

Add one new extraction strategy:

- Strategy 6: `* Chapters X-Y` format -- regex `/Chapters?\s+(\d+)/i` to extract X (covers Witch Hat Atelier)

Note: Berserk vols 1-4 use plain bullet chapters with no numeric prefix -- no parser strategy can extract them. The existing Strategy 3 (`/^\s*\*\s+(\d+)\./m`) already handles vols 5+ which use `* 001. {{Nihongo|...}}`. MangaDex fills the vols 1-4 gap.

**Fix 4: Last-volume absorption** (`deriveVolumeRanges`)

Currently: final volume's `lastChapter = latestChapter ?? vol.firstChapter`. This makes Volume 40 absorb 800+ chapters for incomplete data.

Fix: the final volume's `lastChapter` is only derived from explicit data source boundaries. If there is no next volume to derive a boundary from, `lastChapter = firstChapter` (single-chapter volume). Chapters beyond the last known volume range remain ungrouped (`volumeNumber = null`).

This is conservative -- a volume might have more chapters than just its first -- but it's correct. The merge strategy (MangaDex -> Wikipedia -> MangaUpdates) means gaps are filled by other sources rather than by guessing.

### 3. Merge Strategy & Priority Chain

During import and refresh, volume mappings are resolved per-chapter in priority order:

```
1. MangaDex aggregate     →  got volume for this chapter?  →  use it
2. Wikipedia (with fixes) →  got volume for this chapter?  →  use it
3. MangaUpdates release   →  got volume for this chapter?  →  use it
4. None of the above      →  ungrouped (volumeNumber = null)
```

**Key rules**:

- A chapter is "mapped" once any source assigns it a volume. Later sources only fill gaps, never override.
- The `mappingSource` column on `mangaVolumes` reflects the source that provided the majority of mappings for that volume. If a volume has chapters from multiple sources, use the highest-priority source.
- MangaUpdates remains the primary source for **chapter discovery** (which chapters exist, release dates, scanlation groups). Its volume assignments become lowest-priority fallback.

**Implementation**: Rename `applyWikipediaVolumeMappings` to a generic `applyVolumeMappings`. Run it twice: first with MangaDex mappings, then with Wikipedia mappings (only affecting chapters still unmapped). MangaUpdates volume data is already on the chapter objects from deduplication.

### 4. Chapter Discovery from MangaDex

MangaUpdates has significant chapter gaps. MangaDex can supplement chapter discovery:

**During import/refresh**: After fetching MangaUpdates releases and MangaDex aggregate data, compare chapter sets. Chapters present in MangaDex aggregate but absent from MangaUpdates are added as additional chapter entries.

These supplemental chapters:

- Have no `releaseDate` or `scanlationGroup` (MangaDex aggregate doesn't provide these)
- Get their volume assignment directly from MangaDex
- Are marked with `fromExpansion: false` in the dedup map

This fills gaps like Berserk's chapters 1-226 and Witch Hat Atelier's latest chapters.

### 5. Bug Fix: One Piece Chapters 25-26

MangaUpdates confirms chapters 25-26 exist in their release data but they're being dropped during processing. Likely causes to investigate during implementation:

- A compound release format (e.g., `"24-26 + extra"`) hitting the `+` skip path in `deduplicateReleases`
- A range like `"25-26"` that overlaps with another release in an unexpected merge order
- An edge case in `normalizeChapterNumber` producing an empty/falsy result

Fix: add debug logging during dedup to trace which releases are being skipped and why, then fix the specific edge case. Also add test cases for the identified pattern.

## Schema Changes

```sql
ALTER TABLE manga ADD COLUMN manga_dex_id TEXT;
ALTER TABLE manga ADD COLUMN manga_dex_fetched_at INTEGER;
```

The `mappingSource` column on `mangaVolumes` gains a new value: `"mangadex"`. Existing values (`"wikipedia"`, `"mangaupdates"`, `"none"`) remain valid.

## Files to Create/Modify

| File                                | Change                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `src/server/mangadex.ts`            | **New** -- MangaDex API client (search, match, aggregate)                          |
| `src/server/wikipedia.ts`           | Fix subpage discovery, search ranking, chapter formats, last-volume                |
| `src/server/manga-import.ts`        | Integrate MangaDex into import/refresh pipeline, merge strategy, chapter discovery |
| `src/server/manga-chapter-utils.ts` | Bug fix for chapters 25-26 edge case                                               |
| `src/db/schema/manga.ts`            | Add `mangaDexId` and `mangaDexFetchedAt` columns                                   |
| `drizzle/NNNN_*.sql`                | Migration for new columns                                                          |
| `src/__tests__/mangadex.test.ts`    | **New** -- tests for MangaDex parsing and matching                                 |
| `src/__tests__/wikipedia.test.ts`   | Additional tests for new parser strategies                                         |

## Testing Strategy

- **Unit tests**: MangaDex aggregate parsing, Wikipedia subpage link extraction, new chapter format strategies, `deriveVolumeRanges` with no next volume, merge priority logic
- **Integration test**: Import One Piece, Berserk, and Witch Hat Atelier against live APIs and verify correct volume-chapter assignments
- **Regression test**: Verify chapters 25-26 appear for One Piece after bug fix
