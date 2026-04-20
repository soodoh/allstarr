# Servarr-Style Manual Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert unmapped manual import for movies, ebooks, audiobooks, and TV into one per-file Servarr-style row workflow, add managed movie imports, and support movie sidecar movement with persisted defaults.

**Architecture:** Reuse the existing TV row-based mapping flow as the shared modal model, then replace the non-TV single-target request shape with a row-based server contract. Keep the existing managed book and audiobook filesystem behavior, add a managed movie destination builder parallel to TV, and stage the rollout through focused server tests, browser tests, and one e2e spec update.

**Tech Stack:** TypeScript, React, TanStack Query, TanStack Start server functions, Drizzle, Vitest, Playwright, Bun

---

## File Structure

- Modify: `src/server/unmapped-files.ts`
  Purpose: replace the mixed single-target manual import contract with one row-based contract, add managed movie imports, and support optional movie sidecar movement.
- Modify: `src/server/unmapped-files.test.ts`
  Purpose: lock the new request shape, per-row import behavior, managed movie paths, audiobook row mapping, and movie sidecar handling.
- Modify: `src/server/file-import.ts`
  Purpose: extract or add a reusable managed movie destination helper parallel to the existing TV path builder.
- Modify: `src/server/hint-extractor.ts`
  Purpose: tighten per-row hint extraction expectations for movie and bookish rows where tests show ranking gaps.
- Modify: `src/components/unmapped-files/mapping-dialog.tsx`
  Purpose: generalize the current TV row UI into a shared row-based modal for all content types and conditionally show sidecar options.
- Modify: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`
  Purpose: cover row rendering, independent row edits, sidecar checkbox visibility, and row-based payload submission for non-TV types.
- Modify: `src/components/unmapped-files/unmapped-files-table.tsx`
  Purpose: always launch mapping with file rows instead of single-target hint state for bulk actions.
- Modify: `src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
  Purpose: verify single-file and bulk launches pass row data for movie, ebook, audiobook, and TV.
- Modify: `src/server/user-settings.test.ts`
  Purpose: keep coverage around the persisted unmapped-files add-defaults sidecar setting if the non-TV flows begin to consume it.
- Modify: `e2e/tests/11-unmapped-files.spec.ts`
  Purpose: prove the new row-based import behavior for movies and audiobooks and preserve the existing TV flow.

## Task 1: Lock the Row-Based Manual Import Contract

**Files:**
- Modify: `src/server/unmapped-files.test.ts`
- Test: `src/server/unmapped-files.test.ts`

- [ ] **Step 1: Write the failing server tests for the unified row payload**

```ts
it("maps multiple movie rows to different movie ids in one request", async () => {
  setupMovieRowMapping({
    profile: { id: 7, rootFolderPath: "/library/movies", contentType: "movie" },
    rows: [
      { file: { id: 1, path: "/downloads/Alien (1979).mkv", size: 2_000_000_000, quality: null }, movie: { id: 11, title: "Alien", year: 1979 } },
      { file: { id: 2, path: "/downloads/Aliens (1986).mkv", size: 2_100_000_000, quality: null }, movie: { id: 12, title: "Aliens", year: 1986 } },
    ],
  });

  const result = await mapUnmappedFileFn({
    data: {
      downloadProfileId: 7,
      rows: [
        { unmappedFileId: 1, entityType: "movie", entityId: 11 },
        { unmappedFileId: 2, entityType: "movie", entityId: 12 },
      ],
      moveRelatedSidecars: false,
    },
  });

  expect(result).toEqual({ success: true, mappedCount: 2 });
});

it("maps multiple audiobook rows to the same book id without a bulk entityId", async () => {
  setupBookRowMapping({
    profile: { id: 5, rootFolderPath: "/library/books", contentType: "audiobook" },
    files: [
      { id: 1, path: "/downloads/Foundation Part 1.mp3", size: 50_000, quality: null },
      { id: 2, path: "/downloads/Foundation Part 2.mp3", size: 50_000, quality: null },
    ],
    book: { id: 10, title: "Foundation", releaseYear: 1951, authorName: "Isaac Asimov" },
  });

  await mapUnmappedFileFn({
    data: {
      downloadProfileId: 5,
      rows: [
        { unmappedFileId: 1, entityType: "book", entityId: 10 },
        { unmappedFileId: 2, entityType: "book", entityId: 10 },
      ],
    },
  });

  expect(bookFilesInsert.values).toHaveBeenCalledWith(expect.objectContaining({ part: 1, partCount: 2 }));
  expect(bookFilesInsert.values).toHaveBeenCalledWith(expect.objectContaining({ part: 2, partCount: 2 }));
});
```

- [ ] **Step 2: Run the focused server suite to verify the old single-target contract fails**

Run: `bun run test -- src/server/unmapped-files.test.ts`
Expected: FAIL because `mapUnmappedFileFn` still expects `entityId` plus `unmappedFileIds` for non-TV rows.

- [ ] **Step 3: Replace the mixed schema in `src/server/unmapped-files.ts` with a single row-based shape**

```ts
const importRowSchema = z.object({
  unmappedFileId: z.number(),
  entityType: z.enum(["book", "movie", "episode"]),
  entityId: z.number(),
});

const mapUnmappedFileSchema = z
  .object({
    downloadProfileId: z.number(),
    rows: z.array(importRowSchema).min(1),
    moveRelatedSidecars: z.boolean().default(false),
  })
  .strict();
```

- [ ] **Step 4: Add row grouping helpers before changing import logic**

```ts
function groupRowsByEntityType(rows: Array<z.infer<typeof importRowSchema>>) {
  return {
    books: rows.filter((row) => row.entityType === "book"),
    movies: rows.filter((row) => row.entityType === "movie"),
    episodes: rows.filter((row) => row.entityType === "episode"),
  };
}
```

- [ ] **Step 5: Re-run the server suite and keep it red only for the still-missing import behavior**

Run: `bun run test -- src/server/unmapped-files.test.ts`
Expected: FAIL only in movie pathing, browser-facing payload expectations, and sidecar behavior.

- [ ] **Step 6: Commit the contract migration harness**

```bash
git add src/server/unmapped-files.ts src/server/unmapped-files.test.ts
git commit -m "test(server): lock row-based manual import contract"
```

## Task 2: Convert the Modal and Table to One Row-Based UI

**Files:**
- Modify: `src/components/unmapped-files/mapping-dialog.tsx`
- Modify: `src/components/unmapped-files/unmapped-files-table.tsx`
- Modify: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`
- Modify: `src/components/unmapped-files/unmapped-files-table.browser.test.tsx`

- [ ] **Step 1: Write the failing browser tests for row-based movie and audiobook mapping**

```tsx
it("renders one movie mapping row per selected file and submits independent targets", async () => {
  mappingDialogMocks.searchResults = {
    Alien: [{ id: 11, title: "Alien", subtitle: "1979", entityType: "movie" }],
    Aliens: [{ id: 12, title: "Aliens", subtitle: "1986", entityType: "movie" }],
  };

  render(
    <MappingDialog
      contentType="movie"
      files={[
        { id: 1, path: "/downloads/Alien (1979).mkv", hints: { title: "Alien", year: 1979, source: "filename" } },
        { id: 2, path: "/downloads/Aliens (1986).mkv", hints: { title: "Aliens", year: 1986, source: "filename" } },
      ]}
      onClose={vi.fn()}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Map Selected Files" }));

  expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
    data: {
      downloadProfileId: 7,
      rows: [
        { unmappedFileId: 1, entityType: "movie", entityId: 11 },
        { unmappedFileId: 2, entityType: "movie", entityId: 12 },
      ],
      moveRelatedSidecars: false,
    },
  });
});

it("passes audiobook file rows into the mapping dialog for bulk launch", async () => {
  await userEvent.click(page.getByRole("checkbox", { name: "checkbox" }).nth(0));
  await userEvent.click(page.getByRole("checkbox", { name: "checkbox" }).nth(1));
  await userEvent.click(page.getByRole("button", { name: "Map Selected" }));

  expect(tableMocks.mappingDialogProps).toEqual(
    expect.objectContaining({
      contentType: "audiobook",
      files: [
        expect.objectContaining({ id: 1, path: "/library/audio/Foundation Part 1.mp3" }),
        expect.objectContaining({ id: 2, path: "/library/audio/Foundation Part 2.mp3" }),
      ],
    }),
  );
});
```

- [ ] **Step 2: Run the two browser suites to verify the old modal still assumes one target**

Run: `bun run test -- src/components/unmapped-files/mapping-dialog.browser.test.tsx src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
Expected: FAIL because the modal still renders the old search-results list for non-TV and the table still passes single-target state.

- [ ] **Step 3: Generalize the dialog state in `mapping-dialog.tsx` from TV-only rows to shared import rows**

```ts
type ImportRowState = {
  fileId: number;
  path: string;
  search: string;
  entityType: "book" | "movie" | "episode";
  selectedEntityId: number | null;
};

const rows = useMemo(
  () =>
    files.map((file) => ({
      file,
      state: rowStateById[file.id] ?? {
        fileId: file.id,
        path: file.path,
        search: buildInitialRowSearch(file, contentType),
        entityType: resolveEntityType(contentType),
        selectedEntityId: null,
      },
    })),
  [files, rowStateById, contentType],
);
```

- [ ] **Step 4: Submit the new shared payload from the modal**

```ts
await mapUnmappedFileFn({
  data: {
    downloadProfileId: profileId,
    rows: rows
      .filter((row) => row.state.selectedEntityId != null)
      .map((row) => ({
        unmappedFileId: row.file.id,
        entityType: row.state.entityType,
        entityId: row.state.selectedEntityId as number,
      })),
    moveRelatedSidecars: supportsSidecars(contentType) ? moveRelatedSidecars : false,
  },
});
```

- [ ] **Step 5: Update the table launch path to always pass real file rows**

```ts
const launchMappingDialog = (files: Array<MappingDialogFile & { contentType: string }>) => {
  if (files.length === 0) return;

  setMappingFileIds(files.map((file) => file.id));
  setMappingContentType(files[0].contentType);
  setMappingFiles(files.map(({ id, path, hints }) => ({ id, path, hints })));
  setMappingHints(null);
};
```

- [ ] **Step 6: Re-run the browser suites and make them green**

Run: `bun run test -- src/components/unmapped-files/mapping-dialog.browser.test.tsx src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit the row-based UI conversion**

```bash
git add src/components/unmapped-files/mapping-dialog.tsx src/components/unmapped-files/unmapped-files-table.tsx src/components/unmapped-files/mapping-dialog.browser.test.tsx src/components/unmapped-files/unmapped-files-table.browser.test.tsx
git commit -m "feat(unmapped-files): use row-based manual import UI"
```

## Task 3: Add Managed Movie Import Paths

**Files:**
- Modify: `src/server/file-import.ts`
- Modify: `src/server/unmapped-files.ts`
- Modify: `src/server/unmapped-files.test.ts`

- [ ] **Step 1: Write the failing server tests for managed movie imports**

```ts
it("moves mapped movie files into the managed movie folder", async () => {
  setupMovieRowMapping({
    profile: { id: 7, rootFolderPath: "/library/movies", contentType: "movie" },
    rows: [
      { file: { id: 1, path: "/downloads/Alien (1979).mkv", size: 2_000_000_000, quality: null }, movie: { id: 11, title: "Alien", year: 1979 } },
    ],
  });

  mocks.renameSync.mockImplementation(() => undefined);

  await mapUnmappedFileFn({
    data: {
      downloadProfileId: 7,
      rows: [{ unmappedFileId: 1, entityType: "movie", entityId: 11 }],
      moveRelatedSidecars: false,
    },
  });

  expect(mocks.renameSync).toHaveBeenCalledWith(
    "/downloads/Alien (1979).mkv",
    "/library/movies/Alien (1979)/Alien (1979).mkv",
  );
  expect(movieFilesInsert.values).toHaveBeenCalledWith(
    expect.objectContaining({
      movieId: 11,
      path: "/library/movies/Alien (1979)/Alien (1979).mkv",
    }),
  );
});
```

- [ ] **Step 2: Run the server suite to verify movies still keep source paths**

Run: `bun run test -- src/server/unmapped-files.test.ts`
Expected: FAIL because the movie branch still writes `file.path` directly to `movieFiles`.

- [ ] **Step 3: Add a managed movie destination helper to `src/server/file-import.ts`**

```ts
export function buildManagedMovieDestination({
  rootFolderPath,
  movieTitle,
  movieYear,
  sourcePath,
}: {
  rootFolderPath: string;
  movieTitle: string;
  movieYear: number | null;
  sourcePath: string;
}) {
  const movieFolderName = movieYear
    ? `${movieTitle} (${movieYear})`
    : movieTitle;

  return path.join(rootFolderPath, movieFolderName, path.basename(sourcePath));
}
```

- [ ] **Step 4: Update the movie branch in `src/server/unmapped-files.ts` to move files before DB writes**

```ts
const destinationPath = buildManagedMovieDestination({
  rootFolderPath: managedRootPath,
  movieTitle: movie.title,
  movieYear: movie.year,
  sourcePath: file.path,
});

moveFileToManagedPath(fs, file.path, destinationPath);

try {
  db.transaction((tx) => {
    tx.insert(movieFiles).values({ movieId: row.entityId, path: destinationPath, ...metadata }).run();
    tx.insert(history).values({ eventType: "movieFileAdded", movieId: row.entityId, data: { path: destinationPath, source: "unmappedFileMapping" } }).run();
    tx.delete(unmappedFiles).where(eq(unmappedFiles.id, file.id)).run();
  });
} catch (error) {
  moveFileToManagedPath(fs, destinationPath, file.path);
  throw error;
}
```

- [ ] **Step 5: Re-run the server suite and make the movie path assertions pass**

Run: `bun run test -- src/server/unmapped-files.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the managed movie import behavior**

```bash
git add src/server/file-import.ts src/server/unmapped-files.ts src/server/unmapped-files.test.ts
git commit -m "feat(server): import unmapped movies into managed paths"
```

## Task 4: Add Movie Sidecar Movement and Persisted Defaults

**Files:**
- Modify: `src/server/unmapped-files.ts`
- Modify: `src/server/unmapped-files.test.ts`
- Modify: `src/components/unmapped-files/mapping-dialog.tsx`
- Modify: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`
- Modify: `src/server/user-settings.test.ts`

- [ ] **Step 1: Write the failing tests for movie sidecars and checkbox visibility**

```ts
it("moves matched movie sidecars when enabled", async () => {
  setupMovieSidecarRows({
    media: { id: 1, path: "/downloads/Alien (1979).mkv" },
    sidecars: [
      { id: 2, path: "/downloads/Alien (1979).nfo" },
      { id: 3, path: "/downloads/Alien (1979).srt" },
      { id: 4, path: "/downloads/poster.jpg" },
    ],
  });

  await mapUnmappedFileFn({
    data: {
      downloadProfileId: 7,
      rows: [{ unmappedFileId: 1, entityType: "movie", entityId: 11 }],
      moveRelatedSidecars: true,
    },
  });

  expect(mocks.renameSync).toHaveBeenCalledWith(
    "/downloads/Alien (1979).nfo",
    "/library/movies/Alien (1979)/Alien (1979).nfo",
  );
  expect(mocks.renameSync).not.toHaveBeenCalledWith("/downloads/poster.jpg", expect.any(String));
});
```

```tsx
it("shows the sidecar checkbox for movies but hides it for audiobooks", async () => {
  render(<MappingDialog contentType="movie" files={[movieFile]} onClose={vi.fn()} />);
  expect(screen.getByLabelText("Move related sidecar files")).toBeInTheDocument();

  rerender(<MappingDialog contentType="audiobook" files={[audioFile]} onClose={vi.fn()} />);
  expect(screen.queryByLabelText("Move related sidecar files")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused suites to verify sidecars are still TV-only**

Run: `bun run test -- src/server/unmapped-files.test.ts src/components/unmapped-files/mapping-dialog.browser.test.tsx src/server/user-settings.test.ts`
Expected: FAIL because the movie path has no sidecar logic and the checkbox rendering is still TV-specific.

- [ ] **Step 3: Reuse the sidecar persistence for movies in the dialog**

```ts
const supportsSidecarToggle = contentType === "tv" || contentType === "movie";

useEffect(() => {
  if (!supportsSidecarToggle || !isUserSettingsFetched || sidecarDefaultHydrated.current) return;

  setMoveRelatedSidecars(Boolean(userSettings?.addDefaults?.moveRelatedSidecars ?? false));
  sidecarDefaultHydrated.current = true;
}, [supportsSidecarToggle, isUserSettingsFetched, userSettings]);
```

- [ ] **Step 4: Add movie-sidecar matching in `src/server/unmapped-files.ts`**

```ts
const MOVIE_SIDECAR_EXTENSIONS = new Set([".nfo", ".srt", ".ass", ".ssa", ".sub", ".idx", ".xml"]);

function isRelatedMovieSidecar(sourcePath: string, candidatePath: string) {
  return (
    path.dirname(sourcePath) === path.dirname(candidatePath) &&
    stripFileExtension(path.basename(sourcePath)) === stripFileExtension(path.basename(candidatePath)) &&
    MOVIE_SIDECAR_EXTENSIONS.has(path.extname(candidatePath).toLowerCase())
  );
}
```

- [ ] **Step 5: Re-run the focused suites and make them green**

Run: `bun run test -- src/server/unmapped-files.test.ts src/components/unmapped-files/mapping-dialog.browser.test.tsx src/server/user-settings.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the movie sidecar support**

```bash
git add src/server/unmapped-files.ts src/server/unmapped-files.test.ts src/components/unmapped-files/mapping-dialog.tsx src/components/unmapped-files/mapping-dialog.browser.test.tsx src/server/user-settings.test.ts
git commit -m "feat(unmapped-files): support movie sidecar imports"
```

## Task 5: Tighten Search Seeding and E2E Coverage

**Files:**
- Modify: `src/server/hint-extractor.ts`
- Modify: `src/components/unmapped-files/mapping-dialog.tsx`
- Modify: `e2e/tests/11-unmapped-files.spec.ts`

- [ ] **Step 1: Write the failing tests for per-row search seeding and end-to-end imports**

```tsx
it("seeds each non-tv row from its own hints instead of the first selected file", async () => {
  render(
    <MappingDialog
      contentType="ebook"
      files={[
        { id: 1, path: "/downloads/Dune.epub", hints: { title: "Dune", author: "Frank Herbert", source: "filename" } },
        { id: 2, path: "/downloads/Foundation.epub", hints: { title: "Foundation", author: "Isaac Asimov", source: "filename" } },
      ]}
      onClose={vi.fn()}
    />,
  );

  expect(screen.getByLabelText("Search target for Dune.epub")).toHaveValue("Dune Frank Herbert");
  expect(screen.getByLabelText("Search target for Foundation.epub")).toHaveValue("Foundation Isaac Asimov");
});
```

```ts
test("bulk movie mapping imports distinct files into managed movie folders", async ({ page }) => {
  await seedUnmappedMovieFile({ path: "/imports/Alien (1979).mkv" });
  await seedUnmappedMovieFile({ path: "/imports/Aliens (1986).mkv" });

  await page.goto("/unmapped-files");
  await page.getByLabel("Select Alien (1979).mkv").check();
  await page.getByLabel("Select Aliens (1986).mkv").check();
  await page.getByRole("button", { name: "Map Selected" }).click();
  await page.getByLabel("Move related sidecar files").check();
  await page.getByRole("button", { name: "Map Selected Files" }).click();

  await expect.poll(() => fs.existsSync("/library/movies/Alien (1979)/Alien (1979).mkv")).toBe(true);
  await expect.poll(() => fs.existsSync("/library/movies/Aliens (1986)/Aliens (1986).mkv")).toBe(true);
});
```

- [ ] **Step 2: Run the focused browser and e2e suites to verify the remaining gaps**

Run: `bun run test -- src/components/unmapped-files/mapping-dialog.browser.test.tsx`
Expected: FAIL because non-TV rows still share the old search seeding path.

Run: `bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts`
Expected: FAIL because movie imports still lack the end-to-end row workflow until the UI and server changes are fully wired.

- [ ] **Step 3: Update the modal search seeding to use per-row hints**

```ts
function buildInitialRowSearch(file: MappingDialogFile, contentType: string): string {
  const parts: string[] = [];
  if (file.hints?.title) parts.push(file.hints.title);
  if ((contentType === "ebook" || contentType === "audiobook") && file.hints?.author) {
    parts.push(file.hints.author);
  }
  return parts.join(" ").trim();
}
```

- [ ] **Step 4: Extend the existing `11-unmapped-files` Playwright spec for movies and audiobooks**

```ts
await expect
  .poll(() => db.select().from(movieFiles).where(eq(movieFiles.movieId, alienMovieId)).all())
  .toHaveLength(1);

await expect
  .poll(() => db.select().from(bookFiles).where(eq(bookFiles.bookId, foundationBookId)).all())
  .toEqual(
    expect.arrayContaining([
      expect.objectContaining({ part: 1, partCount: 2 }),
      expect.objectContaining({ part: 2, partCount: 2 }),
    ]),
  );
```

- [ ] **Step 5: Run the verification trio and make it green**

Run: `bun run lint`
Expected: PASS

Run: `bun run typecheck`
Expected: PASS

Run: `bun run test -- src/server/unmapped-files.test.ts src/components/unmapped-files/mapping-dialog.browser.test.tsx src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
Expected: PASS

Run: `bun run build`
Expected: PASS

Run: `bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit the finishing coverage**

```bash
git add src/server/hint-extractor.ts src/components/unmapped-files/mapping-dialog.tsx e2e/tests/11-unmapped-files.spec.ts
git commit -m "test(e2e): cover servarr-style manual import flows"
```

## Spec Coverage Check

- Shared row-based import model: Task 1, Task 2
- Managed movie imports: Task 3
- Managed ebook and audiobook behavior preserved under row-based mapping: Task 1, Task 2
- Audiobook multi-file mapping and deterministic `part` / `partCount`: Task 1, Task 5
- Movie and TV sidecar movement with persisted defaults: Task 4
- Per-row inference and search seeding: Task 2, Task 5
- Browser and end-to-end coverage: Task 2, Task 5

## Placeholder Scan

- No `TODO`, `TBD`, or "implement later" markers remain.
- Every code-changing step includes the target file and a concrete code sketch.
- Every verification step includes an exact command and expected result.

## Type Consistency Check

- Unified payload uses `rows`, `entityType`, `entityId`, and `unmappedFileId` consistently in every task.
- Non-TV row state uses `selectedEntityId` consistently in the modal plan steps.
- Managed movie helper is named `buildManagedMovieDestination` consistently in the server tasks.
