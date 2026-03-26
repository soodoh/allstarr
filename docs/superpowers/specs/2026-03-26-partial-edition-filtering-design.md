# Partial Edition Filtering

## Problem

Partial editions — books split into Part 1/Part 2 for regional publishing — appear in both the series tab and during author import. Hardcover's `canonical_id` field catches some but not all: many partial editions have `canonical_id: null` despite being splits of canonical books.

### Examples

**Wheel of Time series (Robert Jordan):**

- Position 5: "The Fires of Heaven" (1,731 users, `canonical_id: null`)
- Position 5.1: "The Fires of Heaven, Part 1: The White Tower" (6 users, `canonical_id: null`)
- Position 5.2: "The Fires of Heaven, Part 2" (2 users, `canonical_id: null`)
- The Part 2 book has editions mislabeled as English ("Nebeski oganj - deo drugi" is Serbian) so it passes language filtering
- This pattern repeats for every book in the series (2.1/2.2, 3.1/3.2, ..., 14.1/14.2)

**The Expanse series (James S. A. Corey) — legitimate fractional positions:**

- Position 1.5: "The Butcher of Anderson Station" (864 users) — standalone novella
- Position 2.5: "Gods of Risk" (780 users) — standalone novella
- Position 8.1: "The Last Flight of the Cassandra" (160 users) — standalone short story
- These are NOT partial editions and must be kept

### Root cause

Hardcover's website shows "This is a partial edition of: The Fires of Heaven" for the Part 2 book, but the API returns `canonical_id: null`. The `canonical` relationship, `book_mappings.original_book_id`, and all other API fields are also null. The website appears to compute this heuristically — the API does not expose a reliable partial edition flag for these entries.

## Solution

Two-layer filtering: `canonical_id` for the majority of cases, title-based detection for the rest.

### Layer 1: `canonical_id` filtering in the import path

The `AUTHOR_COMPLETE_QUERY` currently fetches all books for an author without requesting or filtering by `canonical_id`. Many partial editions (especially non-English translations) DO have `canonical_id` set — for example, 15+ translations of "The Fires of Heaven" at position 5 all have `canonical_id: 104011`.

**Changes:**

- Add `canonical_id` to the `AUTHOR_COMPLETE_QUERY` response fields
- Add `canonicalId` to the `HardcoverRawBook` type
- Skip books with non-null `canonical_id` early in the import loop (before `shouldSkipBook`)

The `SERIES_COMPLETE_QUERY` already filters with `canonical_id: { _is_null: true }` — no change needed there.

### Layer 2: Title-based partial edition detection

For books at fractional series positions, check if their book-level title starts with the title of the book at the integer position. If it does, it's a partial edition.

**Detection logic:**

```
for each book in series results:
  if position is fractional (has decimal part):
    integerPosition = floor(position)
    parentBook = book at integerPosition in same series
    if parentBook exists AND book.title.lower().startsWith(parentBook.title.lower()):
      mark as partial edition → exclude
```

**Where this runs:**

1. **`fetchSeriesComplete` (import-queries.ts):** After parsing all `book_series` entries for a series, build a map of integer-position book titles. For each fractional-position entry, check the startsWith condition. Filter before returning results. This is the right location because all series books are available for cross-referencing.

2. **Import path (import.ts):** During import, we process books sequentially without full series context. For books with fractional series positions, we can't cross-reference against sibling books. However, Layer 1 (`canonical_id`) handles the majority of import-time filtering. The series tab filtering (via `fetchSeriesComplete`) handles the display-time cases that slip through.

### Edge cases

| Case                                                                   | Handling                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Legitimate novellas at x.5 (The Expanse)                               | Unique titles — no startsWith match — kept                                                 |
| Short stories at x.1 (Expanse 8.1: "The Last Flight of the Cassandra") | Doesn't start with "Tiamat's Wrath" — kept                                                 |
| Non-English partial titles ("Nebeski oganj - deo drugi")               | Book-level API title is "The Fires of Heaven, Part 2" — startsWith match — filtered        |
| Multiple parts (WoT x.1, x.2, x.3)                                     | All start with parent title — all filtered                                                 |
| No book exists at integer position                                     | No title to compare — kept (safe default)                                                  |
| Book title is a prefix of another unrelated book                       | Extremely unlikely for series entries at adjacent integer/fractional positions             |
| Parent book at integer position also has `canonical_id: null`          | Normal case — the canonical book is the one without `canonical_id` at the integer position |

## Files to modify

| File                                     | Change                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/hardcover/import-queries.ts` | Add `canonical_id` field to `AUTHOR_COMPLETE_QUERY`; add partial edition filtering logic in `fetchSeriesComplete` after parsing book_series entries |
| `src/server/hardcover/types.ts`          | Add `canonicalId: number \| null` to `HardcoverRawBook` type                                                                                        |
| `src/server/import.ts`                   | Skip books with non-null `canonicalId` in the import loop before `shouldSkipBook`                                                                   |
