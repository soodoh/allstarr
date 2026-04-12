# Import And Monitor Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the verified import and monitoring coverage gaps by fixing unmapped-file relocation, adding a persistent coverage matrix, and layering new server/browser/Playwright proofs over the remaining high-risk flows.

**Architecture:** Keep the implementation in two tracks. First, fix the real behavior gap in unmapped-file mapping and reuse the same canonical book-folder rules already used by managed imports. Second, add a narrow Playwright layer for critical cross-system flows while keeping the full monitor-option matrix in targeted server and browser tests.

**Tech Stack:** TypeScript, Bun, Vitest, Playwright, TanStack Start, Drizzle ORM, node:fs/path

---

## File Map

**Create**

- `docs/superpowers/reports/2026-04-12-import-monitor-coverage.md`
- `src/server/book-paths.ts`
- `src/server/book-paths.test.ts`
- `e2e/tests/12-monitor-discovery.spec.ts`

**Modify**

- `src/server/file-import.ts`
- `src/server/unmapped-files.ts`
- `src/server/unmapped-files.test.ts`
- `src/server/authors.test.ts`
- `e2e/tests/11-unmapped-files.spec.ts`

**Test / Verify**

- `bun run test -- src/server/book-paths.test.ts src/server/file-import.test.ts src/server/unmapped-files.test.ts`
- `bun run test -- src/server/__tests__/import.test.ts src/server/authors.test.ts src/server/series.test.ts src/server/movie-collections.test.ts src/server/shows.test.ts`
- `bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts`
- `bun run test:e2e -- e2e/tests/12-monitor-discovery.spec.ts`

### Task 1: Create The Coverage Matrix Artifact

**Files:**
- Create: `docs/superpowers/reports/2026-04-12-import-monitor-coverage.md`
- Test: `bun run test -- src/server/file-import.test.ts src/server/unmapped-files.test.ts src/server/__tests__/import.test.ts src/server/authors.test.ts src/server/series.test.ts src/server/movie-collections.test.ts src/server/shows.test.ts`

- [ ] **Step 1: Write the report skeleton**

```md
# Import And Monitor Coverage Report

## Status Legend

- `E2E confirmed`
- `lower-layer confirmed`
- `missing test`
- `behavior gap`

## Matrix

| Area | Behavior | Status | Evidence | Follow-up |
| --- | --- | --- | --- | --- |
| Import | Completed download imports into managed library | E2E confirmed | `e2e/tests/07-download-lifecycle.spec.ts` | None |
| Import | Hardlink failure falls back to copy | lower-layer confirmed | `src/server/file-import.test.ts` | Add higher-layer proof only if test hook is stable |
| Unmapped | Mapping moves file into canonical managed directory | behavior gap | `src/server/unmapped-files.ts` stores original `file.path` | Fix server behavior, then add server + E2E assertions |
| Series | Monitored series causes new books to become wanted/searchable | missing test | No direct Playwright proof | Add `e2e/tests/12-monitor-discovery.spec.ts` |
```

- [ ] **Step 2: Run the baseline verification suite and capture the evidence**

Run:

```bash
bun run test -- src/server/file-import.test.ts src/server/unmapped-files.test.ts src/server/__tests__/import.test.ts src/server/authors.test.ts src/server/series.test.ts src/server/movie-collections.test.ts src/server/shows.test.ts
```

Expected:

```text
Test Files  7 passed
Tests       341 passed
```

- [ ] **Step 3: Fill the report with the exact file references from the current test tree**

```md
## Notes

- `src/routes/_authed/authors/$authorId.browser.test.tsx` proves author edit wiring only.
- `src/routes/_authed/movies/collections.browser.test.tsx` proves collection toggle/edit wiring only.
- `src/routes/_authed/series/index.browser.test.tsx` proves series toggle/profile wiring only.
- `e2e/tests/06-auto-search.spec.ts` proves one monitored-book RSS path, not the full discovery matrix.
```

- [ ] **Step 4: Commit the report**

```bash
git add docs/superpowers/reports/2026-04-12-import-monitor-coverage.md
git commit -m "docs(testing): add import monitor coverage matrix"
```

### Task 2: Extract Shared Canonical Book-Folder Rules

**Files:**
- Create: `src/server/book-paths.ts`
- Create: `src/server/book-paths.test.ts`
- Modify: `src/server/file-import.ts`
- Test: `src/server/book-paths.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({
  getMediaSetting: vi.fn(),
}));

vi.mock("./settings-reader", () => ({
  default: settings.getMediaSetting,
}));

import { buildManagedBookFolders } from "./book-paths";

describe("buildManagedBookFolders", () => {
  it("builds the default ebook folders from author, title, and release year", () => {
    settings.getMediaSetting.mockImplementation((key: string, fallback: unknown) => fallback);

    expect(
      buildManagedBookFolders({
        authorName: "Mapped Author",
        bookTitle: "Mapped Book",
        releaseYear: 2025,
        mediaType: "ebook",
        rootFolderPath: "/library",
      }),
    ).toEqual({
      authorFolderName: "Mapped Author",
      bookFolderName: "Mapped Book (2025)",
      destDir: "/library/Mapped Author/Mapped Book (2025)",
    });
  });

  it("respects custom audio naming templates", () => {
    settings.getMediaSetting.mockImplementation((key: string, fallback: unknown) => {
      if (key === "naming.book.audio.authorFolder") return "{Author Name}";
      if (key === "naming.book.audio.bookFolder") return "{Book Title}";
      return fallback;
    });

    expect(
      buildManagedBookFolders({
        authorName: "Audio Author",
        bookTitle: "Audio Book",
        releaseYear: 2024,
        mediaType: "audio",
        rootFolderPath: "/audiobooks",
      }),
    ).toEqual({
      authorFolderName: "Audio Author",
      bookFolderName: "Audio Book",
      destDir: "/audiobooks/Audio Author/Audio Book",
    });
  });
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
bun run test -- src/server/book-paths.test.ts
```

Expected:

```text
FAIL  src/server/book-paths.test.ts
Error: Cannot find module './book-paths'
```

- [ ] **Step 3: Implement the shared helper**

```ts
import path from "node:path";
import getMediaSetting from "./settings-reader";

type ManagedBookFolderInput = {
  authorName: string;
  bookTitle: string;
  releaseYear: number | null;
  mediaType: "ebook" | "audio";
  rootFolderPath: string;
};

function applyNamingTemplate(template: string, vars: Record<string, string>): string {
  let result = template.replaceAll(/\{([\w\s]+):(0+)\}/g, (_match, key: string, zeros: string) => {
    const value = vars[key.trim()] ?? "";
    return value ? value.padStart(zeros.length, "0") : "";
  });
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

function sanitizePath(name: string): string {
  return name.replaceAll(/[<>:"/\\|?*]/g, "_").trim();
}

export function buildManagedBookFolders(input: ManagedBookFolderInput) {
  const namingVars = {
    "Author Name": input.authorName,
    "Book Title": input.bookTitle,
    "Release Year": input.releaseYear ? String(input.releaseYear) : "",
  };

  const authorFolderName = sanitizePath(
    applyNamingTemplate(
      getMediaSetting(`naming.book.${input.mediaType}.authorFolder`, "{Author Name}"),
      namingVars,
    ),
  );

  const bookFolderName = sanitizePath(
    applyNamingTemplate(
      getMediaSetting(`naming.book.${input.mediaType}.bookFolder`, "{Book Title} ({Release Year})"),
      namingVars,
    ),
  );

  return {
    authorFolderName,
    bookFolderName,
    destDir: path.join(input.rootFolderPath, authorFolderName, bookFolderName),
  };
}
```

- [ ] **Step 4: Reuse the helper in `src/server/file-import.ts`**

```ts
import { buildManagedBookFolders } from "./book-paths";

const { destDir } = buildManagedBookFolders({
  authorName: author.name,
  bookTitle: bestMatch.title,
  releaseYear: bestMatch.releaseYear ?? null,
  mediaType: primaryType,
  rootFolderPath,
});

fs.mkdirSync(destDir, { recursive: true });
```

- [ ] **Step 5: Run the helper and import suites**

Run:

```bash
bun run test -- src/server/book-paths.test.ts src/server/file-import.test.ts
```

Expected:

```text
PASS  src/server/book-paths.test.ts
PASS  src/server/file-import.test.ts
```

- [ ] **Step 6: Commit the shared-path extraction**

```bash
git add src/server/book-paths.ts src/server/book-paths.test.ts src/server/file-import.ts
git commit -m "refactor(server): share managed book folder naming"
```

### Task 3: Move Mapped Unmapped Files Into The Managed Library Path

**Files:**
- Modify: `src/server/unmapped-files.ts`
- Modify: `src/server/unmapped-files.test.ts`
- Test: `src/server/unmapped-files.test.ts`

- [ ] **Step 1: Write the failing server tests**

```ts
it("moves mapped ebook files into the managed book folder", async () => {
  const profile = { id: 5, name: "Ebooks", rootFolderPath: "/library", contentType: "ebook" };
  const file = {
    id: 1,
    path: "/incoming/mapped-book.epub",
    size: 5000,
    quality: null,
  };
  const book = { id: 10, title: "Mapped Book", releaseYear: 2025 };
  const author = { authorName: "Mapped Author" };
  let selectIndex = 0;
  mocks.select.mockImplementation(() => {
    selectIndex += 1;
    if (selectIndex === 1) return createSelectChain(profile);
    if (selectIndex === 2) return createSelectChain(file);
    if (selectIndex === 3) return createSelectChain(book);
    if (selectIndex === 4) return createSelectChain(author);
    return createSelectChain(undefined);
  });

  const insertChain = createInsertChain();
  mocks.insert.mockReturnValue(insertChain);

  await mapUnmappedFileFn({
    data: { unmappedFileIds: [1], entityType: "book", entityId: 10, downloadProfileId: 5 },
  });

  expect(mocks.mkdirSync).toHaveBeenCalledWith("/library/Mapped Author/Mapped Book (2025)", {
    recursive: true,
  });
  expect(mocks.renameSync).toHaveBeenCalledWith(
    "/incoming/mapped-book.epub",
    "/library/Mapped Author/Mapped Book (2025)/mapped-book.epub",
  );
  expect(insertChain.values).toHaveBeenCalledWith(
    expect.objectContaining({
      path: "/library/Mapped Author/Mapped Book (2025)/mapped-book.epub",
    }),
  );
});

it("falls back to copy and delete when rename crosses volumes", async () => {
  mocks.renameSync.mockImplementationOnce(() => {
    const error = new Error("EXDEV");
    // @ts-expect-error test-only property
    error.code = "EXDEV";
    throw error;
  });

  await mapUnmappedFileFn({
    data: { unmappedFileIds: [1], entityType: "book", entityId: 10, downloadProfileId: 5 },
  });

  expect(mocks.copyFileSync).toHaveBeenCalledWith(
    "/incoming/mapped-book.epub",
    "/library/Mapped Author/Mapped Book (2025)/mapped-book.epub",
  );
  expect(mocks.unlinkSync).toHaveBeenCalledWith("/incoming/mapped-book.epub");
});
```

- [ ] **Step 2: Run the server test to verify it fails**

Run:

```bash
bun run test -- src/server/unmapped-files.test.ts
```

Expected:

```text
FAIL  src/server/unmapped-files.test.ts
AssertionError: expected "renameSync" to have been called
```

- [ ] **Step 3: Implement canonical relocation in `src/server/unmapped-files.ts`**

```ts
import { buildManagedBookFolders } from "./book-paths";

function moveFileToDestination(fs: typeof import("node:fs"), sourcePath: string, destPath: string) {
  try {
    fs.renameSync(sourcePath, destPath);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code !== "EXDEV") throw error;
    fs.copyFileSync(sourcePath, destPath);
    fs.unlinkSync(sourcePath);
  }
}

const book = db.select({ title: books.title, releaseYear: books.releaseYear }).from(books).where(eq(books.id, data.entityId)).get();
const primaryAuthor = db
  .select({ authorName: booksAuthors.authorName })
  .from(booksAuthors)
  .where(and(eq(booksAuthors.bookId, data.entityId), eq(booksAuthors.isPrimary, true)))
  .get();

const { destDir } = buildManagedBookFolders({
  authorName: primaryAuthor?.authorName ?? "Unknown Author",
  bookTitle: book?.title ?? path.basename(file.path, path.extname(file.path)),
  releaseYear: book?.releaseYear ?? null,
  mediaType: isAudio ? "audio" : "ebook",
  rootFolderPath: profile.rootFolderPath,
});

const destPath = path.join(destDir, path.basename(file.path));
fs.mkdirSync(destDir, { recursive: true });
moveFileToDestination(fs, file.path, destPath);

db.insert(bookFiles).values({
  bookId: data.entityId,
  path: destPath,
  size: fs.statSync(destPath).size,
  quality: file.quality,
  downloadProfileId: data.downloadProfileId,
  part,
  partCount,
}).run();
```

- [ ] **Step 4: Run the unmapped server suite**

Run:

```bash
bun run test -- src/server/unmapped-files.test.ts src/server/book-paths.test.ts
```

Expected:

```text
PASS  src/server/unmapped-files.test.ts
PASS  src/server/book-paths.test.ts
```

- [ ] **Step 5: Commit the behavior fix**

```bash
git add src/server/unmapped-files.ts src/server/unmapped-files.test.ts src/server/book-paths.ts src/server/book-paths.test.ts src/server/file-import.ts
git commit -m "fix(server): move mapped unmapped files into library paths"
```

### Task 4: Add The End-To-End Proof For Unmapped Relocation

**Files:**
- Modify: `e2e/tests/11-unmapped-files.spec.ts`
- Test: `e2e/tests/11-unmapped-files.spec.ts`

- [ ] **Step 1: Change the existing mapping test to assert the managed destination**

```ts
const expectedPath = join(
  tempDir,
  "Mapped Author",
  "Mapped Book (2025)",
  file.filename,
);

await expect
  .poll(() =>
    db
      .select({
        bookId: schema.bookFiles.bookId,
        downloadProfileId: schema.bookFiles.downloadProfileId,
        path: schema.bookFiles.path,
      })
      .from(schema.bookFiles)
      .where(eq(schema.bookFiles.bookId, book.id))
      .get() ?? null,
  )
  .toEqual({
    bookId: book.id,
    downloadProfileId: profile.id,
    path: expectedPath,
  });

await expect.poll(() => existsSync(expectedPath)).toBe(true);
await expect.poll(() => existsSync(file.path)).toBe(false);
```

- [ ] **Step 2: Run the single Playwright spec to verify it fails before the server fix lands**

Run:

```bash
bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts
```

Expected:

```text
FAIL  e2e/tests/11-unmapped-files.spec.ts
Expected assertion diff showing the stored path still points at the incoming location
```

- [ ] **Step 3: Re-run the same spec after Task 3**

Run:

```bash
bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts
```

Expected:

```text
1 passed
```

- [ ] **Step 4: Commit the E2E proof**

```bash
git add e2e/tests/11-unmapped-files.spec.ts
git commit -m "test(e2e): verify unmapped files move into library paths"
```

### Task 5: Refresh The Lower-Layer Monitor Evidence

**Files:**
- Modify: `src/server/authors.test.ts`
- Modify: `docs/superpowers/reports/2026-04-12-import-monitor-coverage.md`
- Test: `src/server/__tests__/import.test.ts`, `src/server/authors.test.ts`, `src/server/series.test.ts`, `src/server/movie-collections.test.ts`, `src/server/shows.test.ts`

- [ ] **Step 1: Add the missing author edit branch**

```ts
it("persists monitorNewBooks='none' without dropping existing profile links", async () => {
  mocks.authorRow = { id: 1, name: "Author One" };
  setupUpdateMocks();

  await updateAuthorFn({
    data: { id: 1, monitorNewBooks: "none", downloadProfileIds: [11] },
  });

  const updateChain = mocks.updateFn.mock.results[0]?.value as UpdateChain;
  expect(updateChain.set).toHaveBeenCalledWith(
    expect.objectContaining({ monitorNewBooks: "none" }),
  );
  expect(mocks.insertFn).toHaveBeenCalledWith(schemaMocks.authorDownloadProfiles);
});
```

- [ ] **Step 2: Re-run the server suites that already own the rest of the matrix**

Run:

```bash
bun run test -- src/server/__tests__/import.test.ts src/server/authors.test.ts src/server/series.test.ts src/server/movie-collections.test.ts src/server/shows.test.ts
```

Expected:

```text
PASS  src/server/__tests__/import.test.ts
PASS  src/server/authors.test.ts
PASS  src/server/series.test.ts
PASS  src/server/movie-collections.test.ts
PASS  src/server/shows.test.ts
```

- [ ] **Step 3: Update the report rows with the verified server evidence**

```md
| Books | `monitorOption` / `monitorNewBooks` import matrix | lower-layer confirmed | `src/server/__tests__/import.test.ts`, `src/server/authors.test.ts` | Closed at server layer |
| Series | `monitorSeries` import behavior and series refresh | lower-layer confirmed | `src/server/series.test.ts` | Closed at server layer |
| Collections | Collection monitor and `searchOnAdd` branches | lower-layer confirmed | `src/server/movie-collections.test.ts` | Closed at server layer |
| TV | Show monitoring, new episodes, new seasons | lower-layer confirmed | `src/server/shows.test.ts` | Closed at server layer |
```

- [ ] **Step 4: Commit the refreshed lower-layer evidence**

```bash
git add src/server/authors.test.ts docs/superpowers/reports/2026-04-12-import-monitor-coverage.md
git commit -m "test(server): refresh monitor matrix evidence"
```

### Task 6: Add Focused Playwright Proofs For Monitor Discovery

**Files:**
- Create: `e2e/tests/12-monitor-discovery.spec.ts`
- Test: `e2e/tests/12-monitor-discovery.spec.ts`

- [ ] **Step 1: Write the failing Playwright scenarios**

```ts
test("editing an author to monitor new books changes the next RSS sync", async ({ page, appUrl, db, fakeServers }) => {
  await navigateTo(page, appUrl, `/authors/${authorId}`);
  await page.getByRole("button", { name: /edit/i }).click();
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "All Books" }).click();
  await page.getByRole("button", { name: /save/i }).click();

  await triggerTask(page, appUrl, "RSS Sync");

  const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then((r) => r.json());
  expect(qbState.addedDownloads.length).toBeGreaterThan(0);
});

test("refreshing a monitored series adds a newly discovered book to the wanted set", async ({ page, appUrl, db }) => {
  await navigateTo(page, appUrl, "/series");
  await page.getByRole("button", { name: /refresh all/i }).click();

  await expect
    .poll(() =>
      db.select().from(schema.editionDownloadProfiles).all().some((row) => row.downloadProfileId === profileId),
    )
    .toBe(true);
});

test("refreshing monitored collections makes a newly discovered movie searchable", async ({ page, appUrl, db }) => {
  await navigateTo(page, appUrl, "/movies/collections");
  await page.getByRole("button", { name: /refresh all/i }).click();

  await expect
    .poll(() => db.select().from(schema.trackedDownloads).all().some((row) => row.movieId === newMovieId))
    .toBe(true);
});

test("refreshing monitored shows picks up new-season episodes", async ({ page, appUrl, db }) => {
  await triggerTask(page, appUrl, "Refresh TMDB Metadata");

  await expect
    .poll(() => db.select().from(schema.episodeDownloadProfiles).all().some((row) => row.episodeId === newEpisodeId))
    .toBe(true);
});
```

- [ ] **Step 2: Run the new spec to expose the missing end-to-end proof**

Run:

```bash
bun run test:e2e -- e2e/tests/12-monitor-discovery.spec.ts
```

Expected:

```text
FAIL  e2e/tests/12-monitor-discovery.spec.ts
```

- [ ] **Step 3: Seed the fake servers and fixtures so each flow has one deterministic new item**

```ts
await fetch(`${fakeServers.HARDCOVER}/__control`, {
  method: "POST",
  body: JSON.stringify({
    authors: [mockAuthor],
    books: [existingBook, newlyDiscoveredSeriesBook],
    editions: [existingEdition, newlyDiscoveredEdition],
  }),
});

await fetch(`${fakeServers.NEWZNAB}/__control`, {
  method: "POST",
  body: JSON.stringify({
    releases: [
      {
        guid: "series-new-book",
        title: "Mapped Author - New Series Book [EPUB]",
        category: "7020",
        protocol: "torrent",
        downloadUrl: "http://example.com/series-new-book.torrent",
        magnetUrl: "magnet:?xt=urn:btih:series-new-book",
        size: 5_242_880,
        publishDate: "Fri, 10 Apr 2026 12:00:00 GMT",
      },
    ],
  }),
});

await triggerTask(page, appUrl, "RSS Sync");
await triggerTask(page, appUrl, "Refresh TMDB Metadata");
```

- [ ] **Step 4: Re-run the spec until all four scenarios pass**

Run:

```bash
bun run test:e2e -- e2e/tests/12-monitor-discovery.spec.ts
```

Expected:

```text
4 passed
```

- [ ] **Step 5: Commit the Playwright proofs**

```bash
git add e2e/tests/12-monitor-discovery.spec.ts
git commit -m "test(e2e): cover monitor-driven discovery flows"
```

### Task 7: Final Verification And Coverage Report Update

**Files:**
- Modify: `docs/superpowers/reports/2026-04-12-import-monitor-coverage.md`
- Test: all targeted suites from Tasks 2-6

- [ ] **Step 1: Update the report statuses based on the new proofs**

```md
| Unmapped | Mapping moves file into canonical managed directory | E2E confirmed | `src/server/unmapped-files.test.ts`, `e2e/tests/11-unmapped-files.spec.ts` | Closed |
| Series | Monitored series causes new books to become wanted/searchable | E2E confirmed | `e2e/tests/12-monitor-discovery.spec.ts` | Closed |
| Collections | Monitored collection causes newly discovered movies to become wanted/searchable | E2E confirmed | `e2e/tests/12-monitor-discovery.spec.ts` | Closed |
| TV | Monitored show causes newly discovered episodes to become wanted/searchable | E2E confirmed | `e2e/tests/12-monitor-discovery.spec.ts` | Closed |
```

- [ ] **Step 2: Run the full targeted verification set**

Run:

```bash
bun run test -- src/server/book-paths.test.ts src/server/file-import.test.ts src/server/unmapped-files.test.ts src/server/__tests__/import.test.ts src/server/authors.test.ts src/server/series.test.ts src/server/movie-collections.test.ts src/server/shows.test.ts
bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts e2e/tests/12-monitor-discovery.spec.ts
```

Expected:

```text
All targeted server suites pass
All targeted Playwright specs pass
```

- [ ] **Step 3: Commit the final coverage report update**

```bash
git add docs/superpowers/reports/2026-04-12-import-monitor-coverage.md
git commit -m "docs(testing): mark import and monitor gaps closed"
```

## Self-Review Checklist

- [ ] Every spec requirement maps to at least one task above.
- [ ] No task leaves the unmapped-file relocation semantics ambiguous.
- [ ] The plan adds only four new Playwright flows and keeps the rest of the matrix at server/browser level.
- [ ] The final report has no remaining `behavior gap` or `missing test` rows for the requested scenarios.
