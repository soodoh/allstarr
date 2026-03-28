# Pack Preference & Multi-Pack Support

**Date**: 2026-03-28
**Status**: Design approved
**Scope**: TV shows, books/authors, manga

## Problem

Allstarr's auto-search treats all releases equally regardless of whether they're individual items or packs. When multiple items are wanted (e.g., all episodes in a season, multiple books by an author, several manga volumes), grabbing a single pack is more efficient than grabbing items individually. Additionally, multi-season/multi-volume packs are common for older content but currently unsupported.

## Design

### ReleaseType Enum and Detection

A `ReleaseType` field is added to `IndexerRelease`, detected by parsing release titles in `enrichRelease()` (or a dedicated `detectReleaseType()` helper).

```typescript
enum ReleaseType {
  Unknown = 0,
  // TV Shows
  SingleEpisode = 1,
  MultiEpisode = 2,
  SeasonPack = 3,
  MultiSeasonPack = 4,
  // Books
  SingleBook = 10,
  AuthorPack = 11,
  // Manga
  SingleChapter = 20,
  MultiChapter = 21,
  SingleVolume = 22,
  MultiVolume = 23,
}
```

**Detection patterns:**

- **TV**: `S01-S03` or `Complete Series` → multi-season; `S01` with no episode number → season pack; `S01E01-E03` → multi-episode; `S01E01` → single
- **Books**: Author name + multiple book titles or "Complete"/"Collection" → author pack; otherwise single book
- **Manga**: `Vol 01-05` → multi-volume; `Vol 03` → single volume; `Ch 040-045` → multi-chapter; `Ch 040` → single chapter

**Parsed pack metadata** is stored alongside the release type so qualification logic can check which specific items are included:

```typescript
type ParsedPackInfo = {
  seasons?: number[];
  episodes?: number[];
  volumes?: number[];
  chapters?: number[];
};
```

### Search Strategy

Sonarr-style: pick the broadest applicable search type based on what's missing. One query per level.

**TV Shows:**

- Multiple seasons have missing episodes → search with just show name (surfaces multi-season packs, season packs, and individuals)
- One season has 2+ missing episodes → search with `"show name" S##`
- One episode missing → search with `"show name" S##E##`

**Books:**

- Multiple books by an author are wanted → search with just author name
- One book wanted → search with `"author name" "book title"` (current behavior)

**Manga:**

- Multiple volumes have missing chapters → search with just series title
- One volume has 2+ missing chapters → search with `"title" Vol ##`
- One chapter missing → search with `"title" Vol ## Ch ##` or `"title" Chapter ##`

The existing tiered Newznab fallback (structured query → free-text variations) stays as-is within each search level. Broader queries return diverse results; the scoring comparator picks the best option. No valid results are discarded.

### Pack Qualification Rules

Before a pack release is considered for grabbing, it must pass qualification checks. This runs during candidate selection in `findBestReleaseForProfile` (or a helper called from it).

| Release Type       | Qualification Rule                                                   |
| ------------------ | -------------------------------------------------------------------- |
| Multi-season pack  | Every season in `parsedPackInfo.seasons` must have ≥1 wanted episode |
| Season pack        | ≥2 episodes in that season must be wanted                            |
| Multi-episode      | Every episode in `parsedPackInfo.episodes` must be wanted            |
| Author pack        | Every book in the release must be wanted                             |
| Multi-volume pack  | Every volume in `parsedPackInfo.volumes` must have ≥1 wanted chapter |
| Single volume pack | ≥2 chapters in that volume must be wanted                            |
| Multi-chapter      | Every chapter in `parsedPackInfo.chapters` must be wanted            |

Disqualified packs are skipped during auto-search candidate selection but still appear in interactive search results for manual grabbing. They don't receive a visible rejection reason.

### Scoring Comparator

The current sort order (`quality.weight` → `cfScore` → `size`) is expanded:

1. **Quality weight** DESC
2. **Custom format score** DESC
3. **Release type rank** DESC (new)
4. **Protocol preference** (new — usenet vs torrent, if delay profiles exist; skip otherwise)
5. **Indexer priority** DESC (new)
6. **Seeds/peers** (torrent) or **age** (usenet) (new)
7. **Size** DESC

**Release type ranking per content type:**

| TV Shows          | Rank | Manga          | Rank | Books       | Rank |
| ----------------- | ---- | -------------- | ---- | ----------- | ---- |
| Multi-season pack | 4    | Multi-volume   | 4    | Author pack | 2    |
| Season pack       | 3    | Single volume  | 3    | Single book | 1    |
| Multi-episode     | 2    | Multi-chapter  | 2    |             |      |
| Single episode    | 1    | Single chapter | 1    |             |      |

Release type ranking only applies to qualified packs. A higher-quality single episode always beats a lower-quality season pack.

### Import Mapping

When a pack download completes, files are mapped to database items via filename parsing.

**TV Shows**: Parse each file for `S##E##` patterns → map to matching season/episode.

**Books**: Parse filenames for book titles → fuzzy match (token_set_ratio/partial_ratio) against known books for that author.

**Manga**: Parse filenames for `Vol ##` / `Ch ##` / `Chapter ##` → map to matching chapter records.

**Unmatched files** are left in the download directory untouched (not imported, not tracked). No automatic cleanup since pack directories may still be seeding.

**Already-owned items**: Files from a pack that match items already downloaded at equal or better quality are not imported. Only files that fill gaps or qualify as upgrades get imported.

Import mapping lives in a new module: `src/server/import-mapping.ts`.

## Non-Goals

- No user-facing settings for pack preference (can be added later if needed)
- No metadata probing for import mapping (filename parsing only)
- No automatic cleanup of pack download directories
