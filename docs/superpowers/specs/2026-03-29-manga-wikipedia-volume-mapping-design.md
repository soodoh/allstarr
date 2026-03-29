# Manga Wikipedia Volume Mapping Enrichment

## Problem

MangaUpdates — our primary manga metadata source — tracks scanlation releases, not tankoubon (collected volume) publications. The `volume` field on releases is optional and rarely populated by scanlation groups. Real-world results:

| Series          | Chapters with Volume | Expected Volumes | Coverage                        |
| --------------- | -------------------- | ---------------- | ------------------------------- |
| Chainsaw Man    | 0%                   | 24               | None                            |
| Attack on Titan | 7.4%                 | 34               | 6 volumes                       |
| Naruto          | 47%                  | 72               | 30 volumes (gaps: 10-26, 38-41) |

This means most manga display as a single ungrouped chapter list with no volume structure, which hurts both the library browsing experience and file organization/naming.

## Solution

Enrich manga volume grouping by parsing chapter-to-volume mappings from Wikipedia's "List of X chapters" pages. Wikipedia has ~450 manga chapter list pages that are actively maintained by editors, use mostly consistent wikitext templates, and cover exactly the popular licensed titles where MangaUpdates and other APIs fail.

## Architecture

```
MangaUpdates (existing)          Wikipedia (new)
  |                                |
  | chapters, release dates,       | volume -> chapter range
  | scanlation groups              | mappings
  |                                |
  +----------+--------------------+
             |
        Merge Logic
             |
     +-------+-------+
     | mangaVolumes   | <- chapters assigned to correct volumes
     | mangaChapters  | <- ungrouped fallback preserved
     +---------------+
```

**MangaUpdates** remains the sole source for chapter lists, release dates, and scanlation groups. **Wikipedia** provides only the volume-to-chapter-range mapping. These are merged during import and refresh.

No UI changes are needed — the existing volume accordion and ungrouped chapter display already handle both volumed and ungrouped chapters.

## Wikipedia Parser

### Finding the Right Page

Search Wikipedia using the MediaWiki API:

```
GET /w/api.php?action=query&list=search
    &srsearch=intitle:"List of" intitle:"chapters" "MANGA TITLE"
    &format=json
```

Match results against the manga title and pick the best result. Validate that the page contains `{{Graphic novel list}}` templates before using it to avoid false matches.

For long series split across subpages (One Piece has 6 pages), follow `{{further}}` / `{{main}}` links and parse each subpage.

### Parsing Strategy

Extract the **first chapter number per volume** from `{{Graphic novel list}}` template entries. Derive the chapter range for volume N as `[first_ch(vol N), first_ch(vol N+1) - 1]`. The last volume's range extends to the manga's latest known chapter.

This approach works across four wikitext formats:

| Format                        | Example                             | Used By                                                 |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------- |
| `{{Numbered list\|start=N}}`  | `start=37` -> vol starts at ch 37   | One Piece, Chainsaw Man, JJK, Dandadan, MHA, Death Note |
| Bullet list `* NNN. "Title"`  | `* 108.` -> vol starts at ch 108    | Bleach, FMA, Dragon Ball, Blue Lock                     |
| Hash list `# <li value="N">`  | `value=200` -> vol starts at ch 200 | Naruto                                                  |
| Range notation `Mission: X-Y` | `45-52` -> vol starts at ch 45      | Spy x Family                                            |

One known unparseable format: title-only lists without chapter numbers (e.g., Berserk). These return empty and fall back to ungrouped.

### Output

```typescript
type WikipediaVolumeMapping = {
  volumeNumber: number;
  firstChapter: number;
  lastChapter: number;
}[];
```

## Applying Volume Mappings

### On Initial Import

1. Fetch and deduplicate chapters from MangaUpdates (existing flow, unchanged)
2. Fetch volume mappings from Wikipedia
3. For each deduplicated chapter, find which volume range it falls into
4. Group chapters into volumes using Wikipedia assignments; chapters beyond the last mapped volume go ungrouped
5. Insert volumes and chapters into the database (existing flow)

Wikipedia mappings take priority over MangaUpdates' sparse volume field for volume assignment.

### On Metadata Refresh

1. Re-fetch chapters from MangaUpdates (existing flow)
2. Re-fetch volume mappings from Wikipedia (only if last Wikipedia fetch was 7+ days ago)
3. New chapters: assign to volumes using Wikipedia mapping, insert
4. Existing ungrouped chapters that now have a Wikipedia mapping: reassign to the correct volume (same graduation logic as existing MangaUpdates volume reassignment)
5. Chapters already assigned to a volume are not reassigned — avoids churn

### Conflict Resolution

- **Volume assignment:** Wikipedia wins (sourced from official tankoubon data)
- **Chapter existence, release dates, scanlation groups:** MangaUpdates wins (comprehensive release tracking)

## Schema Changes

### `manga` table — one new column

```sql
ALTER TABLE manga ADD COLUMN wikipedia_page_title TEXT;
```

Stores the Wikipedia page title used for volume mappings (e.g., `"List_of_Naruto_chapters"`). Null if no page was found. Avoids re-searching Wikipedia on every refresh.

### `mangaVolumes` table — one new column

```sql
ALTER TABLE manga_volumes ADD COLUMN mapping_source TEXT NOT NULL DEFAULT 'mangaupdates';
-- Migration: set existing ungrouped volumes to 'none'
UPDATE manga_volumes SET mapping_source = 'none' WHERE volume_number IS NULL;
```

Values: `'wikipedia'` | `'mangaupdates'` | `'none'`

Tracks where the volume assignment came from. The ungrouped volume (`volumeNumber = null`) always has source `'none'`. The migration retroactively sets existing ungrouped volumes to the correct source.

## Fetch Cadence & Caching

**On import:** Fetch immediately — 1-2 API calls per series (search + page parse, more for subpages).

**On refresh:** Wikipedia volume mappings only re-fetch if last Wikipedia fetch was 7+ days ago. MangaUpdates chapter refreshes continue on their existing 12-hour cadence. Volume boundaries change infrequently (new tankoubon releases are monthly at most).

**Rate limiting:** Max 1 request per second to Wikipedia. Cache parsed mappings in memory with the same TTL/cache structure used for MangaUpdates (10-minute TTL, 500 max entries).

**Failure handling:** Wikipedia fetch failures are non-blocking. If the API is down or the page can't be parsed, the import proceeds with MangaUpdates-only data. The next refresh retries.

## Scope

### In scope

- Wikipedia API client and wikitext parser (~150 lines)
- Integration into existing manga import and refresh flows
- Two schema additions (one column each on `manga` and `mangaVolumes`)
- Graceful fallback when no Wikipedia page exists

### Out of scope

- No UI changes (existing volume/ungrouped display handles both cases)
- No manual volume assignment UI
- No MangaDex or Kitsu integration
- No manhwa/manhua-specific handling (Wikipedia coverage is shonen-heavy)
- No parsing of title-only chapter lists (Berserk style)

## Risks

| Risk                                    | Likelihood                                               | Mitigation                                                                           |
| --------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Wikipedia template changes break parser | Low — `{{Graphic novel list}}` has been stable for years | Parser fails gracefully: returns empty, no enrichment, not a crash                   |
| Wrong Wikipedia page matched            | Low                                                      | Validate page contains `{{Graphic novel list}}` before using                         |
| Stale volume data for ongoing series    | Medium                                                   | Chapters beyond last mapped volume go ungrouped; weekly refresh picks up new volumes |
| Wikipedia API downtime                  | Low                                                      | Non-blocking fetch; import continues with MangaUpdates data only                     |

## Research Findings

### Why Not Other Sources?

| Source                | Chapter-to-Volume Mapping?          | Why Not Primary                                                        |
| --------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| MangaDex `/aggregate` | Yes, but sparse for licensed titles | DMCA takedowns gut data: Naruto 1.4%, AoT 1.4%, One Piece 54% coverage |
| Kitsu `/chapters`     | Yes, but degrades for long-runners  | Data quality cliff after ~680 chapters; 20/page pagination is slow     |
| AniList / MAL         | Totals only                         | No per-chapter data                                                    |
| Community JSON repos  | None exist                          | No maintained dataset found                                            |

### Wikipedia Coverage Tested

13/13 popular series successfully parsed across 4 wikitext formats. Coverage skews toward popular shonen but includes the exact titles that other APIs fail on (Naruto, Attack on Titan, Jujutsu Kaisen, One Piece).
