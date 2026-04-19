# Unmapped TV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make unmapped TV imports suggest season and episode targets from filenames, allow a different target per selected file, move mapped files into managed TV folders, and optionally move related sidecars using a persisted per-user default.

**Architecture:** Extend the unmapped TV import flow into a per-row mapping model while preserving the simpler single-target book and movie paths. Reuse existing TV naming and user-settings infrastructure instead of inventing new persistence or path-building systems, and drive the change through TDD across server, browser, and Playwright layers.

**Tech Stack:** TypeScript, React, TanStack Query, TanStack Start server functions, Drizzle, Vitest, Playwright, Bun

---

## File Structure

- Modify: `src/server/unmapped-files.ts`
  Purpose: extend the mapping contract for TV rows, add episode suggestion support, move mapped TV files into managed paths, and optionally move matched sidecars.
- Modify: `src/server/unmapped-files.test.ts`
  Purpose: add failing server tests for per-row episode mapping, managed relocation, sidecar movement, and suggestion helpers.
- Modify: `src/server/file-import.ts`
  Purpose: extract or reuse TV destination path building logic if `unmapped-files.ts` should share the same naming code.
- Modify: `src/components/unmapped-files/mapping-dialog.tsx`
  Purpose: render per-row TV mapping UI, row suggestions, and the sidecar checkbox with persisted defaults.
- Modify: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`
  Purpose: drive the new TV dialog behavior with focused UI tests.
- Modify: `src/components/unmapped-files/unmapped-files-table.tsx`
  Purpose: pass selected TV files and row hints into the new mapping dialog shape.
- Modify: `src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
  Purpose: verify single-file and bulk TV launch behavior stays wired correctly.
- Modify: `src/db/schema/user-settings.ts`
  Purpose: reuse or extend `addDefaults` storage for unmapped-import defaults without adding a second persistence mechanism.
- Modify: `src/lib/table-column-defaults.ts`
  Purpose: add a dedicated `tableId` if the implementation chooses to store unmapped import defaults separately from `tv`.
- Modify: `src/lib/validators.ts`
  Purpose: allow the chosen user-settings table id and add-defaults payload shape.
- Modify: `src/server/user-settings.ts`
  Purpose: continue serving stored defaults for the chosen settings row.
- Modify: `src/server/user-settings.test.ts`
  Purpose: cover the persisted unmapped-import default path if a new table id is introduced.
- Modify: `e2e/tests/11-unmapped-files.spec.ts`
  Purpose: prove multi-row TV mapping, managed file moves, sidecar moves, and destination preservation.

## Task 1: Lock the Server Contract with Failing Tests

**Files:**
- Modify: `src/server/unmapped-files.test.ts`
- Test: `src/server/unmapped-files.test.ts`

- [ ] **Step 1: Write the failing tests for TV row mappings and suggestion lookup**

```ts
it("maps multiple tv files to different episode ids in one request", async () => {
  const profile = { id: 5, name: "TV", rootFolderPath: "/library/tv", contentType: "tv" };
  const show = { id: 20, title: "Severance", year: 2022, useSeasonFolder: true };
  const files = [
    { id: 1, path: "/incoming/Severance.S01E01.mkv", size: 4_000_000, quality: { quality: { name: "720p" } } },
    { id: 2, path: "/incoming/Severance.S01E02.mkv", size: 4_100_000, quality: { quality: { name: "720p" } } },
  ];

  setupEpisodeMappingSelects({
    profile,
    show,
    files,
    episodes: [
      { id: 101, showId: 20, title: "Good News About Hell", seasonNumber: 1, episodeNumber: 1 },
      { id: 102, showId: 20, title: "Half Loop", seasonNumber: 1, episodeNumber: 2 },
    ],
  });

  const result = await mapUnmappedFileFn({
    data: {
      entityType: "episode",
      downloadProfileId: 5,
      moveRelatedSidecars: false,
      tvMappings: [
        { unmappedFileId: 1, episodeId: 101 },
        { unmappedFileId: 2, episodeId: 102 },
      ],
    },
  });

  expect(result).toEqual({ mappedCount: 2, success: true });
});

it("suggests a matching episode from title plus season and episode hints", async () => {
  const result = await suggestUnmappedTvMappingsFn({
    data: {
      rows: [
        {
          fileId: 1,
          contentType: "tv",
          path: "/incoming/Severance.S01E02.mkv",
          hints: { title: "Severance", season: 1, episode: 2, source: "filename" },
        },
      ],
    },
  });

  expect(result.rows[0]).toEqual(
    expect.objectContaining({
      suggestedEpisodeId: 102,
      subtitle: "S01E02 - Half Loop",
    }),
  );
});
```

- [ ] **Step 2: Run the focused server suite to verify it fails for the missing contract**

Run: `bun run test -- src/server/unmapped-files.test.ts`
Expected: FAIL with missing `tvMappings` / `moveRelatedSidecars` support and missing suggestion handler.

- [ ] **Step 3: Implement the schema and handler skeleton in `src/server/unmapped-files.ts`**

```ts
const tvMappingSchema = z.object({
  unmappedFileId: z.number(),
  episodeId: z.number(),
});

const mapUnmappedFileSchema = z.union([
  z.object({
    entityType: z.enum(["book", "movie"]),
    unmappedFileIds: z.array(z.number()),
    entityId: z.number(),
    downloadProfileId: z.number(),
  }),
  z.object({
    entityType: z.literal("episode"),
    downloadProfileId: z.number(),
    moveRelatedSidecars: z.boolean().default(false),
    tvMappings: z.array(tvMappingSchema).min(1),
  }),
]);

const suggestUnmappedTvMappingsSchema = z.object({
  rows: z.array(
    z.object({
      fileId: z.number(),
      contentType: z.literal("tv"),
      path: z.string(),
      hints: z
        .object({
          title: z.string().optional(),
          season: z.number().optional(),
          episode: z.number().optional(),
          source: z.enum(["filename", "path", "metadata"]).optional(),
        })
        .nullable(),
    }),
  ),
});
```

- [ ] **Step 4: Re-run the server suite and keep it red until the assertions shift to pathing behavior**

Run: `bun run test -- src/server/unmapped-files.test.ts`
Expected: remaining FAILs for managed destination pathing and sidecar behavior, but no schema or handler-not-found failures.

- [ ] **Step 5: Commit the contract test harness**

```bash
git add src/server/unmapped-files.ts src/server/unmapped-files.test.ts
git commit -m "test(server): lock unmapped tv mapping contract"
```

## Task 2: Implement Managed TV Moves and Sidecar Movement

**Files:**
- Modify: `src/server/unmapped-files.ts`
- Modify: `src/server/unmapped-files.test.ts`
- Modify: `src/server/file-import.ts`
- Test: `src/server/unmapped-files.test.ts`

- [ ] **Step 1: Write the failing relocation and sidecar tests**

```ts
it("moves mapped tv files into the managed season folder", async () => {
  mocks.renameSync.mockImplementation(() => undefined);

  await mapUnmappedFileFn({
    data: {
      entityType: "episode",
      downloadProfileId: 5,
      moveRelatedSidecars: false,
      tvMappings: [{ unmappedFileId: 1, episodeId: 101 }],
    },
  });

  expect(mocks.renameSync).toHaveBeenCalledWith(
    "/incoming/Severance.S01E01.mkv",
    "/library/tv/Severance (2022)/Season 01/Severance S01E01.mkv",
  );
  expect(insertChain.values).toHaveBeenCalledWith(
    expect.objectContaining({
      episodeId: 101,
      path: "/library/tv/Severance (2022)/Season 01/Severance S01E01.mkv",
    }),
  );
});

it("moves only matched sidecars when enabled", async () => {
  mocks.readdirSync.mockReturnValue([
    "Severance.S01E01.mkv",
    "Severance.S01E01.nfo",
    "Severance.S01E01.xml",
    "folder.jpg",
  ]);

  await mapUnmappedFileFn({
    data: {
      entityType: "episode",
      downloadProfileId: 5,
      moveRelatedSidecars: true,
      tvMappings: [{ unmappedFileId: 1, episodeId: 101 }],
    },
  });

  expect(mocks.renameSync).toHaveBeenCalledWith(
    "/incoming/Severance.S01E01.nfo",
    "/library/tv/Severance (2022)/Season 01/Severance S01E01.nfo",
  );
  expect(mocks.renameSync).not.toHaveBeenCalledWith(
    "/incoming/folder.jpg",
    expect.any(String),
  );
});
```

- [ ] **Step 2: Run the server suite to verify the relocation tests fail**

Run: `bun run test -- src/server/unmapped-files.test.ts`
Expected: FAIL showing episode rows still use the source path and no sidecar handling exists.

- [ ] **Step 3: Extract or reuse TV naming helpers before wiring `unmapped-files.ts`**

```ts
export function buildManagedEpisodeDestination({
  rootFolderPath,
  showTitle,
  showYear,
  seasonNumber,
  useSeasonFolder,
  sourcePath,
}: {
  rootFolderPath: string;
  showTitle: string;
  showYear: number | null;
  seasonNumber: number;
  useSeasonFolder: boolean;
  sourcePath: string;
}) {
  const showFolderName = sanitizePath(
    applyNamingTemplate(
      getMediaSetting("naming.tv.showFolder", "{Show Title} ({Year})"),
      { "Show Title": showTitle, Year: showYear ? String(showYear) : "" },
    ),
  );

  const seasonFolderName = sanitizePath(
    applyNamingTemplate(
      getMediaSetting("naming.tv.seasonFolder", "Season {Season:00}"),
      { Season: String(seasonNumber) },
    ),
  );

  const baseDir = useSeasonFolder
    ? path.join(rootFolderPath, showFolderName, seasonFolderName)
    : path.join(rootFolderPath, showFolderName);

  return path.join(baseDir, path.basename(sourcePath));
}
```

- [ ] **Step 4: Implement TV relocation and row-scoped sidecar moves in `src/server/unmapped-files.ts`**

```ts
if (data.entityType === "episode") {
  for (const row of data.tvMappings) {
    const file = loadUnmappedFile(row.unmappedFileId);
    const episode = loadEpisodeForMapping(row.episodeId);
    const destinationPath = buildManagedEpisodeDestination({
      rootFolderPath: managedRootPath,
      showTitle: episode.showTitle,
      showYear: episode.showYear,
      seasonNumber: episode.seasonNumber,
      useSeasonFolder: episode.useSeasonFolder,
      sourcePath: file.path,
    });

    moveFileToManagedPath(fs, file.path, destinationPath);

    const movedSidecars = data.moveRelatedSidecars
      ? moveMappedEpisodeSidecars(fs, file.path, destinationPath, {
          season: episode.seasonNumber,
          episode: episode.episodeNumber,
        })
      : [];

    try {
      db.transaction((tx) => {
        tx.insert(episodeFiles).values({ episodeId: row.episodeId, path: destinationPath, ...metadata }).run();
        tx.insert(history).values({ eventType: "episodeFileAdded", episodeId: row.episodeId, data: { path: destinationPath, source: "unmappedFileMapping" } }).run();
        tx.delete(unmappedFiles).where(eq(unmappedFiles.id, row.unmappedFileId)).run();
      });
    } catch (error) {
      rollbackMovedFiles(fs, destinationPath, file.path, movedSidecars);
      throw error;
    }
  }
}
```

- [ ] **Step 5: Re-run the server suite and make it green**

Run: `bun run test -- src/server/unmapped-files.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the managed TV import behavior**

```bash
git add src/server/unmapped-files.ts src/server/unmapped-files.test.ts src/server/file-import.ts
git commit -m "fix(server): move mapped tv imports into managed paths"
```

## Task 3: Persist the Sidecar Checkbox Default Per User

**Files:**
- Modify: `src/lib/table-column-defaults.ts`
- Modify: `src/lib/validators.ts`
- Modify: `src/server/user-settings.test.ts`
- Test: `src/server/user-settings.test.ts`

- [ ] **Step 1: Write the failing user-settings test for the unmapped import defaults row**

```ts
it("persists unmapped tv import defaults in addDefaults", async () => {
  await upsertUserSettingsFn({
    data: {
      tableId: "unmapped-files",
      addDefaults: { moveRelatedSidecars: true },
    },
  });

  await expect(
    getUserSettingsFn({ data: { tableId: "unmapped-files" } }),
  ).resolves.toEqual(
    expect.objectContaining({
      addDefaults: { moveRelatedSidecars: true },
    }),
  );
});
```

- [ ] **Step 2: Run the focused user-settings suite to verify it fails**

Run: `bun run test -- src/server/user-settings.test.ts`
Expected: FAIL because `unmapped-files` is not an allowed `tableId`.

- [ ] **Step 3: Add the dedicated settings row id and validator support**

```ts
export const TABLE_IDS = [
  "authors",
  "author-books",
  "author-series",
  "books",
  "book-editions",
  "tv",
  "movies",
  "unmapped-files",
] as const;

unmapped-files: []
```

- [ ] **Step 4: Re-run the user-settings suite and make it green**

Run: `bun run test -- src/server/user-settings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the preference storage support**

```bash
git add src/lib/table-column-defaults.ts src/lib/validators.ts src/server/user-settings.test.ts
git commit -m "feat(settings): persist unmapped import defaults per user"
```

## Task 4: Build the TV Mapping Dialog with TDD

**Files:**
- Modify: `src/components/unmapped-files/mapping-dialog.tsx`
- Modify: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`
- Test: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`

- [ ] **Step 1: Write the failing browser tests for row suggestions and the checkbox default**

```tsx
it("renders one tv row per selected file and loads suggested episodes", async () => {
  mappingDialogState.profiles = [{ contentType: "tv", id: 8, name: "TV Only" }];
  mappingDialogState.suggestions = [
    { fileId: 11, suggestedEpisodeId: 101, title: "Severance", subtitle: "S01E01 - Good News About Hell" },
    { fileId: 12, suggestedEpisodeId: 102, title: "Severance", subtitle: "S01E02 - Half Loop" },
  ];
  mappingDialogState.userSettings = { addDefaults: { moveRelatedSidecars: true } };

  await renderWithProviders(
    <MappingDialog
      contentType="tv"
      files={[
        { id: 11, path: "/incoming/Severance.S01E01.mkv", hints: { title: "Severance", season: 1, episode: 1 } },
        { id: 12, path: "/incoming/Severance.S01E02.mkv", hints: { title: "Severance", season: 1, episode: 2 } },
      ]}
      onClose={vi.fn()}
    />,
  );

  await expect.element(page.getByLabelText("Move related sidecar files")).toBeChecked();
  await expect.element(page.getByText("S01E01 - Good News About Hell")).toBeInTheDocument();
  await expect.element(page.getByText("S01E02 - Half Loop")).toBeInTheDocument();
});

it("submits different episode ids per tv row and persists the checkbox value", async () => {
  await page.getByLabelText("Move related sidecar files").click();
  await page.getByRole("button", { name: "Map Selected Files" }).click();

  expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
    data: {
      entityType: "episode",
      downloadProfileId: 8,
      moveRelatedSidecars: false,
      tvMappings: [
        { unmappedFileId: 11, episodeId: 101 },
        { unmappedFileId: 12, episodeId: 102 },
      ],
    },
  });
  expect(mappingDialogMocks.upsertUserSettings).toHaveBeenCalledWith({
    tableId: "unmapped-files",
    addDefaults: { moveRelatedSidecars: false },
  });
});
```

- [ ] **Step 2: Run the browser tests to verify they fail**

Run: `bun run test -- src/components/unmapped-files/mapping-dialog.browser.test.tsx`
Expected: FAIL because the dialog still expects `fileIds` plus one shared target.

- [ ] **Step 3: Refactor the dialog props and internal state around TV rows**

```tsx
type MappingDialogFile = {
  id: number;
  path: string;
  hints: UnmappedFileHints | null;
};

type TvMappingRow = {
  fileId: number;
  path: string;
  search: string;
  selectedEpisodeId: number | null;
  suggestionLabel: string | null;
  status: "ready" | "needsSelection" | "loading";
};

type MappingDialogProps = {
  contentType: string;
  files: MappingDialogFile[];
  onClose: () => void;
};
```

- [ ] **Step 4: Implement the TV-only row UI and preference load/persist path**

```tsx
const { data: userSettings } = useQuery(userSettingsQuery("unmapped-files"));
const [moveRelatedSidecars, setMoveRelatedSidecars] = useState(
  () => (userSettings?.addDefaults?.moveRelatedSidecars as boolean | undefined) ?? false,
);

const handleTvMap = async () => {
  await mapUnmappedFileFn({
    data: {
      entityType: "episode",
      downloadProfileId: profileId,
      moveRelatedSidecars,
      tvMappings: rows.map((row) => ({
        unmappedFileId: row.fileId,
        episodeId: row.selectedEpisodeId!,
      })),
    },
  });

  upsertSettings.mutate({
    tableId: "unmapped-files",
    addDefaults: { moveRelatedSidecars },
  });
};
```

- [ ] **Step 5: Re-run the dialog browser tests and make them green**

Run: `bun run test -- src/components/unmapped-files/mapping-dialog.browser.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit the dialog rewrite**

```bash
git add src/components/unmapped-files/mapping-dialog.tsx src/components/unmapped-files/mapping-dialog.browser.test.tsx
git commit -m "feat(unmapped-files): add per-row tv mapping dialog"
```

## Task 5: Wire the Table Launch Path for Single and Bulk TV Imports

**Files:**
- Modify: `src/components/unmapped-files/unmapped-files-table.tsx`
- Modify: `src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
- Test: `src/components/unmapped-files/unmapped-files-table.browser.test.tsx`

- [ ] **Step 1: Write the failing table test for passing full TV file rows into the modal**

```tsx
it("passes selected tv files with individual hints into the mapping dialog", async () => {
  tableMocks.state.groups = [
    {
      contentType: "tv",
      profileName: "TV",
      rootFolderPath: "/incoming/tv",
      files: [
        { id: 4, contentType: "tv", format: "mkv", ignored: false, path: "/incoming/tv/Severance.S01E01.mkv", rootFolderPath: "/incoming/tv", size: 1, hints: { title: "Severance", season: 1, episode: 1 } },
        { id: 5, contentType: "tv", format: "mkv", ignored: false, path: "/incoming/tv/Severance.S01E02.mkv", rootFolderPath: "/incoming/tv", size: 1, hints: { title: "Severance", season: 1, episode: 2 } },
      ],
    },
  ];

  await renderWithProviders(<UnmappedFilesTable />);
  await page.getByRole("checkbox", { name: "checkbox" }).nth(1).click();
  await page.getByRole("checkbox", { name: "checkbox" }).nth(2).click();
  await page.getByRole("button", { name: "Map Selected" }).click();

  await expect.element(page.getByTestId("mapping-dialog")).toHaveTextContent(
    "mapping:tv:4,5:2-files",
  );
});
```

- [ ] **Step 2: Run the table browser suite to verify it fails**

Run: `bun run test -- src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
Expected: FAIL because the table still passes `fileIds` and one hint object.

- [ ] **Step 3: Change the table mapping state to store selected file rows**

```tsx
type MappingSelection = {
  contentType: string;
  files: Array<{
    id: number;
    path: string;
    hints: UnmappedFileHints | null;
  }>;
};

const [mappingSelection, setMappingSelection] = useState<MappingSelection | null>(null);
```

- [ ] **Step 4: Re-run the table browser suite and make it green**

Run: `bun run test -- src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the table wiring**

```bash
git add src/components/unmapped-files/unmapped-files-table.tsx src/components/unmapped-files/unmapped-files-table.browser.test.tsx
git commit -m "feat(unmapped-files): pass tv file rows into mapping modal"
```

## Task 6: Prove the Full Flow End to End

**Files:**
- Modify: `e2e/tests/11-unmapped-files.spec.ts`
- Test: `e2e/tests/11-unmapped-files.spec.ts`

- [ ] **Step 1: Write the failing Playwright test for multi-row TV mapping and sidecar moves**

```ts
test("maps multiple tv files with per-row targets and moves selected sidecars", async ({ page, appUrl, db, tempDir, checkpoint }) => {
  const rootFolderPath = join(tempDir, "tv");
  const profile = seedDownloadProfile(db, {
    name: "TV Profile",
    rootFolderPath,
    contentType: "tv",
  });

  const show = seedShowWithEpisodes(db, {
    title: "Severance",
    year: 2022,
    useSeasonFolder: true,
    episodes: [
      { id: 101, seasonNumber: 1, episodeNumber: 1, title: "Good News About Hell" },
      { id: 102, seasonNumber: 1, episodeNumber: 2, title: "Half Loop" },
    ],
  });

  seedUnmappedTvFileWithSidecars(db, rootFolderPath, "Severance.S01E01.mkv", ["Severance.S01E01.nfo", "Severance.S01E01.xml", "folder.jpg"]);
  seedUnmappedTvFileWithSidecars(db, rootFolderPath, "Severance.S01E02.mkv", ["Severance.S01E02.nfo"]);
  checkpoint();

  await navigateTo(page, appUrl, "/unmapped-files");
  await page.getByRole("checkbox", { name: "checkbox" }).nth(1).click();
  await page.getByRole("checkbox", { name: "checkbox" }).nth(2).click();
  await page.getByRole("button", { name: "Map Selected" }).click();
  await page.getByLabel("Move related sidecar files").check();
  await page.getByRole("button", { name: "Map Selected Files" }).click();

  await expect.poll(() => existsSync(join(rootFolderPath, "Severance (2022)", "Season 01", "Severance.S01E01.nfo"))).toBe(true);
  await expect.poll(() => existsSync(join(rootFolderPath, "incoming", "folder.jpg"))).toBe(true);
});
```

- [ ] **Step 2: Run the focused E2E test to verify it fails**

Run: `bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts`
Expected: FAIL because the current UI cannot assign different episode targets per file or move sidecars.

- [ ] **Step 3: Implement the missing fixture helpers or test wiring needed by the scenario**

```ts
function seedUnmappedTvFileWithSidecars(...) {
  writeFileSync(join(incomingDir, filename), "video");
  for (const sidecar of sidecars) {
    writeFileSync(join(incomingDir, sidecar), "sidecar");
  }

  return db.insert(schema.unmappedFiles).values({
    path: join(incomingDir, filename),
    rootFolderPath,
    contentType: "tv",
    format: "MKV",
    hints: { title: "Severance", season: 1, episode: parsedEpisode, source: "filename" },
    ignored: false,
    size: 1024,
  }).returning().get();
}
```

- [ ] **Step 4: Re-run the focused E2E test and make it green**

Run: `bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts`
Expected: PASS

- [ ] **Step 5: Run the final verification set**

Run: `bun run test -- src/server/unmapped-files.test.ts src/server/user-settings.test.ts src/components/unmapped-files/mapping-dialog.browser.test.tsx src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
Expected: PASS

Run: `bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit the E2E proof**

```bash
git add e2e/tests/11-unmapped-files.spec.ts
git commit -m "test(e2e): cover unmapped tv mapping and sidecars"
```

## Self-Review

- Spec coverage check:
  - per-file TV suggestions: Task 1 and Task 4
  - different mapping per selected file: Task 1, Task 4, Task 5, Task 6
  - managed TV destination moves: Task 2 and Task 6
  - sidecar checkbox and persistence: Task 3, Task 4, Task 6
  - move only related sidecars and preserve destination contents: Task 2 and Task 6
- Placeholder scan:
  - no `TODO`, `TBD`, or deferred implementation markers remain
  - each task includes explicit files, commands, and representative code
- Type consistency:
  - `tvMappings`, `moveRelatedSidecars`, and `tableId: "unmapped-files"` are used consistently across server, UI, and tests
