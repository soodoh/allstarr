# Partial Edition Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter out partial editions (books split into Part 1/Part 2) from both import and series tab display.

**Architecture:** Two-layer filtering. Layer 1 adds `canonical_id` to the import query and skips books with non-null values. Layer 2 adds title-based detection in `fetchSeriesComplete` — for books at fractional series positions, check if their title starts with the title of the book at the integer position.

**Tech Stack:** TypeScript, Hardcover GraphQL API, Drizzle ORM

---

### File Map

| File                                     | Action | Purpose                                                                                                                           |
| ---------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/hardcover/types.ts`          | Modify | Add `canonicalId` field to `HardcoverRawBook` type                                                                                |
| `src/server/hardcover/import-queries.ts` | Modify | Add `canonical_id` to `AUTHOR_COMPLETE_QUERY`; parse it in `parseRawBook`; add partial edition filtering in `fetchSeriesComplete` |
| `src/server/import.ts`                   | Modify | Skip books with non-null `canonicalId` in both import and refresh loops                                                           |

---

### Task 1: Add `canonical_id` to the import query and type

**Files:**

- Modify: `src/server/hardcover/types.ts:17-32`
- Modify: `src/server/hardcover/import-queries.ts:214-225,314-330`

- [ ] **Step 1: Add `canonicalId` to `HardcoverRawBook` type**

In `src/server/hardcover/types.ts`, add `canonicalId` after `isCompilation`:

```typescript
/** Raw book from the Hardcover "author complete" query */
export type HardcoverRawBook = {
  id: number;
  title: string;
  slug: string | null;
  description: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  rating: number | null;
  ratingsCount: number | null;
  usersCount: number | null;
  coverUrl: string | null;
  isCompilation: boolean;
  canonicalId: number | null;
  defaultCoverEditionId: number | null;
  contributions: HardcoverRawContribution[];
  series: HardcoverRawBookSeries[];
};
```

- [ ] **Step 2: Add `canonical_id` field to `AUTHOR_COMPLETE_QUERY`**

In `src/server/hardcover/import-queries.ts`, add `canonical_id` after the existing `compilation` field (line 224):

```graphql
    compilation
    canonical_id
    default_cover_edition_id
```

- [ ] **Step 3: Parse `canonical_id` in `parseRawBook`**

In `src/server/hardcover/import-queries.ts`, add `canonicalId` to the return object in `parseRawBook` (after `isCompilation` on line 325):

```typescript
return {
  id,
  title,
  slug: firstString(bookRecord, [["slug"]]) ?? null,
  description: firstString(bookRecord, [["description"]]) ?? null,
  releaseDate: firstString(bookRecord, [["release_date"]]) ?? null,
  releaseYear: firstNumber(bookRecord, [["release_year"]]) ?? null,
  rating: firstNumber(bookRecord, [["rating"]]) ?? null,
  ratingsCount: firstNumber(bookRecord, [["ratings_count"]]) ?? null,
  usersCount: firstNumber(bookRecord, [["users_count"]]) ?? null,
  coverUrl: getCoverUrl(bookRecord) ?? null,
  isCompilation: bookRecord.compilation === true,
  canonicalId: firstNumber(bookRecord, [["canonical_id"]]) ?? null,
  defaultCoverEditionId:
    firstNumber(bookRecord, [["default_cover_edition_id"]]) ?? null,
  contributions,
  series,
};
```

- [ ] **Step 4: Verify build passes**

Run: `bun run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/hardcover/types.ts src/server/hardcover/import-queries.ts
git commit -m "feat: add canonical_id to author import query"
```

---

### Task 2: Skip canonical-linked books during import

**Files:**

- Modify: `src/server/import.ts:623-660`

- [ ] **Step 1: Skip books with non-null `canonicalId` in the initial import loop**

In `src/server/import.ts`, add a `canonicalId` check right after the `existingBook` check (after line 640, before the `filterEditionsByProfile` call):

```typescript
    for (const rawBook of rawBooks) {
      // Check if book already in DB
      const existingBook = tx
        .select({ id: books.id })
        .from(books)
        .where(eq(books.foreignBookId, String(rawBook.id)))
        .get();
      if (existingBook) {
        // Book exists — upgrade: ensure this author has a booksAuthors entry
        syncBookAuthors(
          tx,
          existingBook.id,
          rawBook.contributions,
          data.foreignAuthorId,
          author.id,
        );
        continue;
      }

      // Skip partial editions (books that are splits of a canonical book)
      if (rawBook.canonicalId !== null) {
        continue;
      }

      // Filter editions by metadata profile
      const rawEditions = editionsMap.get(rawBook.id) ?? [];
```

- [ ] **Step 2: Skip canonical-linked books in the refresh loop**

In `src/server/import.ts`, in the `refreshAuthorInternal` function's book loop (around line 1200), add the same `canonicalId` check after `seenForeignBookIds.add`:

```typescript
    for (const rawBook of rawBooks) {
      const foreignBookId = String(rawBook.id);
      seenForeignBookIds.add(foreignBookId);

      // Skip partial editions (books that are splits of a canonical book)
      if (rawBook.canonicalId !== null) {
        continue;
      }

      const existingBook = tx
```

- [ ] **Step 3: Verify build passes**

Run: `bun run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/server/import.ts
git commit -m "feat: filter canonical-linked partial editions during import"
```

---

### Task 3: Filter partial editions by title in `fetchSeriesComplete`

**Files:**

- Modify: `src/server/hardcover/import-queries.ts:488-604`

This is the core change. The current code in `fetchSeriesComplete` parses book_series entries in a single pass, deduplicating by position. We need to restructure this into two passes: first collect all entries, then filter partial editions before returning.

- [ ] **Step 1: Restructure `fetchSeriesComplete` parsing to two-pass approach**

Replace the book parsing block inside `fetchSeriesComplete` (lines 496-602, the section starting with `const bookEntries = toRecordArray(s.book_series)` through the end of the `.map` callback that returns the series object) with:

```typescript
const bookEntries = toRecordArray(s.book_series);

// --- Pass 1: Parse all entries and deduplicate by position ---
const seen = new Set<number>();
const allBooks: HardcoverRawSeriesBook[] = bookEntries
  .map((entry) => {
    const position = firstNumber(entry, [["position"]]);
    if (position === undefined) {
      return undefined;
    }
    if (seen.has(position)) {
      return undefined;
    }
    seen.add(position);

    const bookRecord = toRecord(entry.book);
    if (!bookRecord) {
      return undefined;
    }
    const bookId = firstNumber(bookRecord, [["id"]]);
    const bookTitle = firstString(bookRecord, [["title"]]);
    if (!bookId || !bookTitle) {
      return undefined;
    }

    const contributions = toRecordArray(bookRecord.contributions);
    const primaryContribution =
      contributions.length > 0 ? contributions[0] : undefined;
    const primaryAuthor = primaryContribution
      ? toRecord(primaryContribution.author)
      : undefined;

    const defaultCoverEditionId =
      firstNumber(bookRecord, [["default_cover_edition_id"]]) ?? null;

    const editionRecords = toRecordArray(bookRecord.editions);
    const bookEditions: HardcoverRawSeriesBookEdition[] = editionRecords
      .map((edRec) => {
        const edId = firstNumber(edRec, [["id"]]);
        if (!edId) {
          return undefined;
        }
        const langRecord = toRecord(edRec.language);
        const formatRecord = toRecord(edRec.reading_format);
        return {
          id: edId,
          title: firstString(edRec, [["title"]]) ?? "",
          isbn10: firstString(edRec, [["isbn_10"]]) ?? null,
          isbn13: firstString(edRec, [["isbn_13"]]) ?? null,
          asin: firstString(edRec, [["asin"]]) ?? null,
          format: mapEditionFormat(
            formatRecord
              ? (firstString(formatRecord, [["format"]]) ?? null)
              : null,
          ),
          pageCount: firstNumber(edRec, [["pages"]]) ?? null,
          audioLength: firstNumber(edRec, [["audio_seconds"]]) ?? null,
          releaseDate: firstString(edRec, [["release_date"]]) ?? null,
          usersCount: firstNumber(edRec, [["users_count"]]) ?? 0,
          score: firstNumber(edRec, [["score"]]) ?? 0,
          languageCode: langRecord
            ? (firstString(langRecord, [["code2"]]) ?? null)
            : null,
          coverUrl: getCoverUrl(edRec) ?? null,
          isDefaultCover: edId === defaultCoverEditionId,
        } satisfies HardcoverRawSeriesBookEdition;
      })
      .filter(Boolean) as HardcoverRawSeriesBookEdition[];

    return {
      bookId,
      bookTitle,
      bookSlug: firstString(bookRecord, [["slug"]]) ?? null,
      position: position.toString(),
      isCompilation: entry.compilation === true,
      releaseDate: firstString(bookRecord, [["release_date"]]) ?? null,
      releaseYear: firstNumber(bookRecord, [["release_year"]]) ?? null,
      rating: firstNumber(bookRecord, [["rating"]]) ?? null,
      usersCount: firstNumber(bookRecord, [["users_count"]]) ?? null,
      coverUrl: getCoverUrl(bookRecord) ?? null,
      authorId: primaryAuthor
        ? (firstNumber(primaryAuthor, [["id"]]) ?? null)
        : null,
      authorName: primaryAuthor
        ? (firstString(primaryAuthor, [["name"]]) ?? null)
        : null,
      authorSlug: primaryAuthor
        ? (firstString(primaryAuthor, [["slug"]]) ?? null)
        : null,
      authorImageUrl: primaryAuthor
        ? (getCoverUrl(primaryAuthor) ?? null)
        : null,
      defaultCoverEditionId,
      editions: bookEditions,
    };
  })
  .filter(Boolean) as HardcoverRawSeriesBook[];

// --- Pass 2: Filter partial editions ---
// Build a map of integer-position book titles for comparison.
const integerPositionTitles = new Map<number, string>();
for (const book of allBooks) {
  const pos = Number(book.position);
  if (Number.isInteger(pos)) {
    integerPositionTitles.set(pos, book.bookTitle);
  }
}

// Filter out books at fractional positions whose title starts with
// the title of the book at the corresponding integer position
// (e.g., "The Fires of Heaven, Part 2" at 5.2 starts with
// "The Fires of Heaven" at 5 → partial edition → exclude).
const books = allBooks.filter((book) => {
  const pos = Number(book.position);
  if (Number.isInteger(pos)) {
    return true; // Keep all integer-position books
  }
  const intPos = Math.floor(pos);
  const parentTitle = integerPositionTitles.get(intPos);
  if (!parentTitle) {
    return true; // No parent book at integer position → keep
  }
  // If this book's title starts with the parent's title, it's a partial
  return !book.bookTitle.toLowerCase().startsWith(parentTitle.toLowerCase());
});

return {
  id,
  title,
  slug: firstString(s, [["slug"]]) ?? null,
  isCompleted: typeof s.is_completed === "boolean" ? s.is_completed : null,
  books,
};
```

- [ ] **Step 2: Verify build passes**

Run: `bun run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/server/hardcover/import-queries.ts
git commit -m "feat: filter partial editions by title in series queries"
```

---

### Task 4: Verify with production build

- [ ] **Step 1: Run full production build**

Run: `bun run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Final commit if any formatting changes from lint-staged**

If the build or commit hooks made formatting changes, stage and commit them.
