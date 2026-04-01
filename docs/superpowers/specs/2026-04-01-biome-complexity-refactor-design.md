# Biome Complexity Override Refactor

Remove the `noExcessiveCognitiveComplexity` override (raised from default 15 to 25) by refactoring all 8 violating functions to comply with the default threshold.

## Current State

The biome.json override applies to 5 file paths, but one is stale (`src/components/hardcover/book-preview-modal.tsx` was moved). The 8 actual violations are:

| File | Function | Current | Target |
|------|----------|---------|--------|
| `src/routes/_authed/movies/index.tsx` | `MoviesPage` | 16 | ≤15 |
| `src/routes/_authed/tv/index.tsx` | `ShowsPage` | 16 | ≤15 |
| `src/server/hardcover/import-queries.ts` | `parseSeriesBookEntry` | 22 | ≤15 |
| `src/server/hardcover/import-queries.ts` | `parseEdition` | 23 | ≤15 |
| `src/server/search.ts` | inline `.map()` in `fetchSeriesBooks` | 21 | ≤15 |
| `src/server/search.ts` | `toHardcoverAuthorBook` | 19 | ≤15 |
| `src/server/search.ts` | `fetchAuthorDetails` | 24 | ≤15 |
| `src/server/search.ts` | `parseEditionRecord` | 20 | ≤15 |

## Design

### 1. Shared helpers module: `src/server/hardcover/record-helpers.ts`

Both `search.ts` and `import-queries.ts` duplicate the same base helpers (noted in a comment in import-queries.ts). Consolidate into a shared module.

**Base helpers** (consolidated from both files, using the `search.ts` implementations which use `getNestedValue` for cleaner traversal):

- `toRecord(value)` - type-narrow unknown to Record
- `toRecordArray(value)` - parse unknown into Record[]
- `getNestedValue(record, path)` - walk a dot-path safely
- `firstString(record, paths)` - first non-empty string from multiple paths
- `firstNumber(record, paths)` - first finite number from multiple paths
- `firstId(record, paths)` - firstString or firstNumber-as-string
- `getCoverUrl(record)` - uses the `search.ts` version (checks `image`, `images` array, and fallback fields)
- `getStringList(value)` - extract string[] from unknown
- `parseYear(value)` - regex year from a date string
- `normalizeLanguageCode(value)` - trim + lowercase

**Domain extractors** (new functions that replace the ternary chains causing complexity):

- `extractLanguage(record)` -> `{ code: string | null; name: string | null }` - reads `record.language.code2` and `record.language.language`
- `extractPublisher(record)` -> `string | null` - reads `record.publisher.name`
- `extractFormat(record)` -> `string | null` - reads `record.reading_format.format`
- `extractCountry(record)` -> `string | null` - reads `record.country.name`
- `extractContributorNames(record)` -> `string[]` - reads `record.contributions[].author.name` or `record.cached_contributors[].author.name`

Both `search.ts` and `import-queries.ts` delete their local copies and import from this module.

### 2. `import-queries.ts` parser refactoring

**`parseSeriesBookEntry` (22 -> ≤15):**
- Use `extractContributorNames` for the primary author logic (replaces inline `.map()` + `toRecord` + `firstString` chain)
- Edition parsing already delegates to `parseSeriesBookEdition` - no change needed

**`parseEdition` (23 -> ≤15):**
- Replace publisher extraction with `extractPublisher(record)`
- Replace format extraction with `extractFormat(record)` + existing `mapEditionFormat()`
- Replace language extraction with `extractLanguage(record)` (for `languageCode`)
- Replace country extraction with `extractCountry(record)`
- Replace contributors extraction with `extractContributorNames`
- Five replacements, each removing ~2-3 complexity points

### 3. `search.ts` parser refactoring

**Inline `.map()` in `fetchSeriesBooks` (21 -> ≤15):**
- Extract the inline `.map()` callback to a named function `toSeriesBook(entry): HardcoverSeriesBook | undefined`
- Use `extractContributorNames` for the author name logic
- Use `extractLanguage` for the language extraction from the first edition

**`toHardcoverAuthorBook` (19 -> ≤15):**
- Use `extractContributorNames` for the `all_contributions` -> contributors string
- Use `extractLanguage` for the edition language logic
- If still over 15, extract a `parseBookSeries(entries)` helper for the series sub-block

**`fetchAuthorDetails` (24 -> ≤15):**
- Extract `buildLanguageMap(editions): Map<string, string>` - the language map loop that iterates edition records, extracts codes and names, and populates a Map. Should remove ~8 complexity points.
- If still over 15 after that, extract the page clamping + re-fetch block into `fetchClampedPage(...)`.

**`parseEditionRecord` (20 -> ≤15):**
- Same approach as `parseEdition` in import-queries.ts
- Use `extractPublisher`, `extractFormat`, `extractLanguage`, `extractCountry`, `extractContributorNames`

### 4. Movies/TV page refactoring

**`MoviesPage` (16 -> ≤15) and `ShowsPage` (16 -> ≤15):**
- Extract header actions JSX into a sibling component (`MoviesPageActions` / `ShowsPageActions`) in the same file
- The header actions contain view toggle, mass edit button, and add button with conditionals for `massEditMode` (~3 complexity points)
- Each page is refactored independently (no shared component)

### 5. Biome config cleanup

- Remove the entire complexity override block (lines 46-67 of `biome.json`)
- Keep the `src/routes/api/**` console override (unrelated)

## Verification

After all changes, run `bunx biome check src/` with no overrides and confirm zero `noExcessiveCognitiveComplexity` violations.
