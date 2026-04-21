# Preserve Import Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve attached non-primary files during unmapped imports without losing Servarr-style per-primary-file assignment, including optional deletion of deselected attached assets and cleanup of emptied source folders.

**Architecture:** Introduce a focused server-side asset ownership and migration layer that expands each import row into explicit attached asset actions before import. Keep the existing top-level row UI, but extend the modal with a collapsible asset review drawer, persisted asset options, and row-scoped ownership summaries. Roll the change out with server-first TDD, then browser tests, then one end-to-end data-preservation spec.

**Tech Stack:** TypeScript, React, TanStack Start server functions, TanStack Query, Drizzle, Vitest, Playwright, Bun

---

## File Structure

- Create: `src/server/import-assets.ts`
  Purpose: isolate asset ownership discovery, destination mapping, cleanup pruning, and row-scoped move/delete planning from `unmapped-files.ts`.
- Create: `src/server/import-assets.test.ts`
  Purpose: cover ownership heuristics, nested directory preservation, collision detection, and cleanup pruning.
- Modify: `src/server/unmapped-files.ts`
  Purpose: extend the import payload with explicit asset actions, call the new planner, execute row-scoped move/delete/rollback flows, and persist new defaults.
- Modify: `src/server/unmapped-files.test.ts`
  Purpose: lock asset-aware row imports across TV, movies, books, and audiobooks, including show-level ownership and delete-deselected behavior.
- Modify: `src/components/unmapped-files/mapping-dialog.tsx`
  Purpose: render asset summaries and expandable row drawers, collect per-asset selection state, and submit explicit asset actions.
- Modify: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`
  Purpose: cover asset drawer UX, persisted defaults, per-asset toggles, and payload submission.
- Modify: `src/components/unmapped-files/unmapped-files-table.tsx`
  Purpose: pass any additional row bootstrap data needed by the asset-aware modal without changing the top-level row model.
- Modify: `src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
  Purpose: verify the table still launches one top-level row per primary file and does not explode nested assets into the table.
- Modify: `src/server/user-settings.test.ts`
  Purpose: lock both persisted unmapped import defaults.
- Modify: `e2e/tests/11-unmapped-files.spec.ts`
  Purpose: prove preservation of current real-world file shapes and cleanup behavior.

## Task 1: Lock Asset Ownership and Cleanup Rules in a Dedicated Server Helper

**Files:**
- Create: `src/server/import-assets.ts`
- Create: `src/server/import-assets.test.ts`

- [ ] **Step 1: Write the failing ownership and cleanup tests**

```ts
import { describe, expect, it } from "vitest";
import {
  assignImportAssets,
  buildAssetOperations,
  pruneEmptyDirectories,
} from "./import-assets";

describe("assignImportAssets", () => {
  it("attaches tv episode assets, trickplay trees, and show-level theme audio to one owning row", () => {
    const rows = [
      {
        rowId: "tv-101",
        contentType: "tv",
        sourcePath: "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.mkv",
        destinationPath: "/library/tv/Severance/Season 1/Severance S01E01.mkv",
      },
    ];

    const result = assignImportAssets({
      rows,
      discoveredPaths: [
        "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.nfo",
        "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell-thumb.jpg",
        "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320 - 10x10/0.jpg",
        "/downloads/Severance/theme.mp3",
      ],
    });

    expect(result.rows[0].assets.map((asset) => asset.sourcePath)).toEqual([
      "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.nfo",
      "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell-thumb.jpg",
      "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay",
      "/downloads/Severance/theme.mp3",
    ]);
  });

  it("marks ambiguous container files as unrelated instead of attaching twice", () => {
    const result = assignImportAssets({
      rows: [
        {
          rowId: "audio-1",
          contentType: "audiobook",
          sourcePath: "/downloads/Foundation/Foundation (1).mp3",
          destinationPath: "/library/books/Isaac Asimov/Foundation/Foundation (1).mp3",
        },
        {
          rowId: "audio-2",
          contentType: "audiobook",
          sourcePath: "/downloads/Foundation/Foundation (2).mp3",
          destinationPath: "/library/books/Isaac Asimov/Foundation/Foundation (2).mp3",
        },
      ],
      discoveredPaths: ["/downloads/Foundation/random.bin"],
    });

    expect(result.unrelatedPaths).toEqual(["/downloads/Foundation/random.bin"]);
  });
});

describe("buildAssetOperations", () => {
  it("keeps trickplay directories as preserved subtrees instead of flattening them", () => {
    const operations = buildAssetOperations({
      row: {
        destinationPath: "/library/tv/Severance/Season 1/Severance S01E01.mkv",
        assets: [
          {
            sourcePath: "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay",
            relativeSourcePath: "Season 1/Severance - S01E01 - Good News About Hell.trickplay",
            destinationRelativePath: "Season 1/Severance S01E01.trickplay",
            kind: "directory",
            selected: true,
            ownershipReason: "nested",
          },
        ],
      },
      deleteDeselectedAssets: false,
    });

    expect(operations.moves).toEqual([
      {
        from: "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay",
        to: "/library/tv/Severance/Season 1/Severance S01E01.trickplay",
        kind: "directory",
      },
    ]);
  });
});

describe("pruneEmptyDirectories", () => {
  it("removes only empty directories below the bounded container root", () => {
    const deleted = pruneEmptyDirectories({
      startDirectories: [
        "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320 - 10x10",
      ],
      stopAt: "/downloads/Severance",
      listEntries: (dir) =>
        ({
          "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320 - 10x10": [],
          "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320": [],
          "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay": [],
          "/downloads/Severance/Season 1": ["unrelated.keep"],
        })[dir] ?? [],
      removeDirectory: (dir) => dir,
    });

    expect(deleted).toEqual([
      "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320 - 10x10",
      "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320",
      "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay",
    ]);
  });
});
```

- [ ] **Step 2: Run the focused helper suite and confirm the helper does not exist yet**

Run: `bun run test -- src/server/import-assets.test.ts`
Expected: FAIL with module-not-found or missing export errors for `src/server/import-assets.ts`.

- [ ] **Step 3: Create the helper module with explicit row and asset types**

```ts
export type ImportAssetKind = "file" | "directory";
export type ImportAssetOwnershipReason =
  | "direct"
  | "token"
  | "nested"
  | "container";

export type ImportAssetSelection = {
  sourcePath: string;
  relativeSourcePath: string;
  destinationRelativePath: string;
  kind: ImportAssetKind;
  selected: boolean;
  ownershipReason: ImportAssetOwnershipReason;
};

export type ImportAssetRow = {
  rowId: string;
  contentType: "tv" | "movie" | "book" | "audiobook";
  sourcePath: string;
  destinationPath: string;
  assets: ImportAssetSelection[];
};
```

- [ ] **Step 4: Implement deterministic ownership assignment and bounded cleanup helpers**

```ts
export function assignImportAssets(args: {
  rows: Array<Omit<ImportAssetRow, "assets">>;
  discoveredPaths: string[];
}) {
  // 1. Collapse nested subtree files into owned directory roots such as `.trickplay`.
  // 2. Score ownership candidates as direct > token > nested > container.
  // 3. Attach each asset to at most one row; return ambiguous leftovers as unrelated.
}

export function pruneEmptyDirectories(args: {
  startDirectories: string[];
  stopAt: string;
  listEntries: (dir: string) => string[];
  removeDirectory: (dir: string) => void;
}) {
  // Walk upward until stopAt, removing directories that are empty after row cleanup.
}
```

- [ ] **Step 5: Re-run the helper suite until it passes**

Run: `bun run test -- src/server/import-assets.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the helper and tests**

```bash
git add src/server/import-assets.ts src/server/import-assets.test.ts
git commit -m "test(server): lock import asset ownership rules"
```

## Task 2: Extend the Server Import Contract With Explicit Asset Actions

**Files:**
- Modify: `src/server/unmapped-files.ts`
- Modify: `src/server/unmapped-files.test.ts`
- Modify: `src/server/user-settings.test.ts`

- [ ] **Step 1: Write the failing server integration tests for asset-aware imports**

```ts
it("moves selected movie title assets and deletes deselected attached assets when enabled", async () => {
  setupMovieImport({
    file: "/downloads/Maria by Callas (2017)/Maria.by.Callas.2017.720p.BluRay.800MB.x264-GalaxyRG.mkv",
    attachedAssets: [
      {
        sourcePath: "/downloads/Maria by Callas (2017)/movie.nfo",
        kind: "file",
        selected: false,
        action: "delete",
      },
    ],
  });

  await mapUnmappedFileFn({
    data: {
      downloadProfileId: 7,
      rows: [
        {
          unmappedFileId: 31,
          entityType: "movie",
          entityId: 701,
          assets: [
            {
              sourcePath: "/downloads/Maria by Callas (2017)/movie.nfo",
              kind: "file",
              ownershipReason: "container",
              selected: false,
              action: "delete",
              relativeSourcePath: "movie.nfo",
            },
          ],
        },
      ],
      moveRelatedFiles: true,
      deleteDeselectedRelatedFiles: true,
    },
  });

  expect(mockFs.rmSync).toHaveBeenCalledWith(
    "/downloads/Maria by Callas (2017)/movie.nfo",
    { force: true, recursive: false },
  );
});

it("preserves show-level and nested tv assets when selected", async () => {
  await mapUnmappedFileFn({
    data: {
      downloadProfileId: 9,
      rows: [
        {
          unmappedFileId: 11,
          entityType: "episode",
          entityId: 101,
          assets: [
            {
              sourcePath: "/downloads/Severance/theme.mp3",
              kind: "file",
              ownershipReason: "container",
              selected: true,
              action: "move",
              relativeSourcePath: "theme.mp3",
            },
            {
              sourcePath: "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay",
              kind: "directory",
              ownershipReason: "nested",
              selected: true,
              action: "move",
              relativeSourcePath: "Season 1/Severance - S01E01 - Good News About Hell.trickplay",
            },
          ],
        },
      ],
      moveRelatedFiles: true,
      deleteDeselectedRelatedFiles: false,
    },
  });

  expect(mockFs.renameSync).toHaveBeenCalledWith(
    "/downloads/Severance/theme.mp3",
    "/library/tv/Severance/theme.mp3",
  );
  expect(mockFs.renameSync).toHaveBeenCalledWith(
    "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay",
    "/library/tv/Severance/Season 1/Severance S01E01.trickplay",
  );
});
```

- [ ] **Step 2: Run the server suite and verify the current payload rejects `assets` and the new settings**

Run: `bun run test -- src/server/unmapped-files.test.ts src/server/user-settings.test.ts`
Expected: FAIL because the row schema does not accept `assets`, the option names do not exist, and cleanup logic is not implemented.

- [ ] **Step 3: Expand the import row schema in `src/server/unmapped-files.ts`**

```ts
const importAssetSchema = z.object({
  sourcePath: z.string(),
  kind: z.enum(["file", "directory"]),
  ownershipReason: z.enum(["direct", "token", "nested", "container"]),
  selected: z.boolean(),
  action: z.enum(["move", "delete", "ignore"]),
  relativeSourcePath: z.string(),
});

const importRowSchema = z.object({
  unmappedFileId: z.number(),
  entityType: z.enum(["book", "movie", "episode"]),
  entityId: z.number(),
  assets: z.array(importAssetSchema).default([]),
});
```

- [ ] **Step 4: Replace the sidecar-only toggle with asset-aware defaults and row execution**

```ts
const mapUnmappedFileSchema = z.object({
  downloadProfileId: z.number(),
  rows: z.array(importRowSchema).min(1),
  moveRelatedFiles: z.boolean().default(false),
  deleteDeselectedRelatedFiles: z.boolean().default(false),
});

const operations = buildAssetOperations({
  row,
  deleteDeselectedAssets: data.deleteDeselectedRelatedFiles,
});
```

- [ ] **Step 5: Execute primary moves, asset moves, deletes, rollback, and bounded pruning per row**

```ts
const completedMoves: Array<{ from: string; to: string; kind: "file" | "directory" }> = [];

try {
  movePrimaryFile(primaryMove);
  completedMoves.push(primaryMove);

  for (const move of operations.moves) {
    movePath(move);
    completedMoves.push(move);
  }

  writeDatabaseRows();

  for (const deletion of operations.deletes) {
    removePath(deletion);
  }

  pruneEmptySourceDirectories(operations.pruneDirectories, operations.stopAt);
} catch (error) {
  rollbackMoves(completedMoves);
  throw error;
}
```

- [ ] **Step 6: Persist the new unmapped import default in the user-settings tests**

```ts
await upsertUserSettingsFn({
  data: {
    tableId: "unmapped-files",
    addDefaults: {
      moveRelatedFiles: true,
      deleteDeselectedRelatedFiles: true,
    },
  },
});
```

- [ ] **Step 7: Re-run the server suites until they pass**

Run: `bun run test -- src/server/import-assets.test.ts src/server/unmapped-files.test.ts src/server/user-settings.test.ts`
Expected: PASS

- [ ] **Step 8: Commit the asset-aware server import flow**

```bash
git add src/server/import-assets.ts src/server/import-assets.test.ts src/server/unmapped-files.ts src/server/unmapped-files.test.ts src/server/user-settings.test.ts
git commit -m "feat(server): preserve attached import assets"
```

## Task 3: Add Row-Scoped Asset Review to the Mapping Modal

**Files:**
- Modify: `src/components/unmapped-files/mapping-dialog.tsx`
- Modify: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`
- Modify: `src/components/unmapped-files/unmapped-files-table.tsx`
- Modify: `src/components/unmapped-files/unmapped-files-table.browser.test.tsx`

- [ ] **Step 1: Write the failing browser tests for the new asset drawer UX**

```tsx
it("shows attached asset counts without creating extra top-level rows", async () => {
  unmappedDialogMocks.suggestions = [
    {
      file: { id: 11, path: "/downloads/Severance/Season 1/Severance - S01E01.mkv" },
      assets: [
        { sourcePath: "/downloads/Severance/Season 1/Severance - S01E01-thumb.jpg", selected: true },
        { sourcePath: "/downloads/Severance/theme.mp3", selected: true },
      ],
    },
  ];

  render(<MappingDialog {...buildTvDialogProps()} />);

  expect(screen.getAllByRole("row")).toHaveLength(2);
  expect(screen.getByText("2 selected / 2 total")).toBeInTheDocument();
});

it("lets the user deselect one asset and persists both asset options after import", async () => {
  render(<MappingDialog {...buildTvDialogProps()} />);

  await userEvent.click(screen.getByRole("button", { name: /2 selected \/ 2 total/i }));
  await userEvent.click(screen.getByRole("checkbox", { name: /theme.mp3/i }));
  await userEvent.click(screen.getByLabelText("Delete deselected related files"));
  await userEvent.click(screen.getByRole("button", { name: "Map Selected Files" }));

  expect(unmappedDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
    data: expect.objectContaining({
      moveRelatedFiles: true,
      deleteDeselectedRelatedFiles: true,
      rows: [
        expect.objectContaining({
          assets: expect.arrayContaining([
            expect.objectContaining({
              sourcePath: "/downloads/Severance/theme.mp3",
              selected: false,
              action: "delete",
            }),
          ]),
        }),
      ],
    }),
  });

  expect(unmappedDialogMocks.upsertUserSettingsFn).toHaveBeenCalledWith({
    data: {
      tableId: "unmapped-files",
      addDefaults: {
        moveRelatedFiles: true,
        deleteDeselectedRelatedFiles: true,
      },
    },
  });
});
```

- [ ] **Step 2: Run the browser suites and confirm there is no asset UI yet**

Run: `bun run test -- src/components/unmapped-files/mapping-dialog.browser.test.tsx src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
Expected: FAIL because the modal has only the old sidecar toggle and no asset drawer state.

- [ ] **Step 3: Add asset-aware row state and derived summaries to `mapping-dialog.tsx`**

```ts
type ImportAssetState = {
  sourcePath: string;
  relativeSourcePath: string;
  kind: "file" | "directory";
  ownershipReason: "direct" | "token" | "nested" | "container";
  selected: boolean;
};

type ImportRowState = {
  selectedEntityId: number | null;
  assets: ImportAssetState[];
  assetsExpanded: boolean;
};

function summarizeAssets(assets: ImportAssetState[]) {
  const selectedCount = assets.filter((asset) => asset.selected).length;
  return `${selectedCount} selected / ${assets.length} total`;
}
```

- [ ] **Step 4: Render a collapsible asset drawer under each primary row**

```tsx
<Button
  type="button"
  variant="ghost"
  onClick={() => toggleAssets(row.file.id)}
>
  {summarizeAssets(row.state.assets)}
</Button>

{row.state.assetsExpanded ? (
  <div className="space-y-3 rounded-md border p-3">
    {groupAssets(row.state.assets).map((group) => (
      <section key={group.label}>
        <div className="flex items-center justify-between">
          <span>{group.label}</span>
          <Checkbox
            checked={group.assets.every((asset) => asset.selected)}
            onCheckedChange={(checked) =>
              setGroupSelected(row.file.id, group.label, checked === true)
            }
          />
        </div>
        {group.assets.map((asset) => (
          <label key={asset.sourcePath} className="flex items-center gap-2">
            <Checkbox
              checked={asset.selected}
              onCheckedChange={(checked) =>
                setAssetSelected(row.file.id, asset.sourcePath, checked === true)
              }
            />
            <span>{asset.relativeSourcePath}</span>
          </label>
        ))}
      </section>
    ))}
  </div>
) : null}
```

- [ ] **Step 5: Replace the old sidecar-only checkbox wiring with the new defaults**

```ts
const [moveRelatedFiles, setMoveRelatedFiles] = useState(true);
const [deleteDeselectedRelatedFiles, setDeleteDeselectedRelatedFiles] = useState(false);

const savedDefaults = userSettings?.addDefaults as
  | {
      moveRelatedFiles?: boolean;
      deleteDeselectedRelatedFiles?: boolean;
      moveRelatedSidecars?: boolean;
    }
  | undefined;

setMoveRelatedFiles(savedDefaults?.moveRelatedFiles ?? savedDefaults?.moveRelatedSidecars ?? true);
setDeleteDeselectedRelatedFiles(savedDefaults?.deleteDeselectedRelatedFiles ?? false);
```

- [ ] **Step 6: Submit explicit asset actions from the modal**

```ts
rows.map((row) => ({
  unmappedFileId: row.file.id,
  entityType: row.state.entityType,
  entityId: row.state.selectedEntityId as number,
  assets: row.state.assets.map((asset) => ({
    sourcePath: asset.sourcePath,
    kind: asset.kind,
    ownershipReason: asset.ownershipReason,
    selected: asset.selected,
    action: !moveRelatedFiles
      ? "ignore"
      : asset.selected
        ? "move"
        : deleteDeselectedRelatedFiles
          ? "delete"
          : "ignore",
    relativeSourcePath: asset.relativeSourcePath,
  })),
}));
```

- [ ] **Step 7: Re-run the browser suites until they pass**

Run: `bun run test -- src/components/unmapped-files/mapping-dialog.browser.test.tsx src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit the modal UX update**

```bash
git add src/components/unmapped-files/mapping-dialog.tsx src/components/unmapped-files/mapping-dialog.browser.test.tsx src/components/unmapped-files/unmapped-files-table.tsx src/components/unmapped-files/unmapped-files-table.browser.test.tsx
git commit -m "feat(unmapped-files): add attached asset review"
```

## Task 4: Prove Real-Shape Preservation and Cleanup End to End

**Files:**
- Modify: `e2e/tests/11-unmapped-files.spec.ts`

- [ ] **Step 1: Add the failing end-to-end coverage for preserved assets**

```ts
test("tv import preserves selected episode and show assets and cleans emptied folders", async ({
  page,
}) => {
  await seedUnmappedTree({
    profile: "tv",
    files: [
      "Severance/Season 1/Severance - S01E01 - Good News About Hell.mkv",
      "Severance/Season 1/Severance - S01E01 - Good News About Hell.nfo",
      "Severance/Season 1/Severance - S01E01 - Good News About Hell-thumb.jpg",
      "Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320 - 10x10/0.jpg",
      "Severance/theme.mp3",
    ],
  });

  await openMappingModal(page);
  await page.getByRole("button", { name: /4 selected \/ 4 total/i }).click();
  await page.getByLabel("Delete deselected related files").check();
  await page.getByRole("button", { name: "Map Selected Files" }).click();

  await expectPathToExist("data/tv_shows/1080p/Severance/theme.mp3");
  await expectPathToExist("data/tv_shows/1080p/Severance/Season 1/Severance S01E01-thumb.jpg");
  await expectPathToExist("data/tv_shows/1080p/Severance/Season 1/Severance S01E01.trickplay/320 - 10x10/0.jpg");
  await expectPathNotToExist("data/downloads/complete/Severance/Season 1");
});
```

- [ ] **Step 2: Run the e2e spec and confirm the current flow drops or ignores these assets**

Run: `bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts`
Expected: FAIL because the modal does not expose assets and the server does not move or prune them.

- [ ] **Step 3: Update the e2e fixtures and selectors to exercise the new drawer UI**

```ts
await page.getByRole("button", { name: /selected \/ total/i }).click();
await page.getByLabel("theme.mp3").uncheck();
await page.getByLabel("Delete deselected related files").check();
```

- [ ] **Step 4: Re-run the focused regression stack**

Run: `bun run test -- src/server/import-assets.test.ts src/server/unmapped-files.test.ts src/server/user-settings.test.ts src/components/unmapped-files/mapping-dialog.browser.test.tsx src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
Expected: PASS

Run: `bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts`
Expected: PASS

- [ ] **Step 5: Run final repo verification**

Run: `bun run lint`
Expected: PASS

Run: `bun run typecheck`
Expected: PASS

Run: `bun run build`
Expected: PASS

- [ ] **Step 6: Commit the end-to-end coverage and final verification**

```bash
git add e2e/tests/11-unmapped-files.spec.ts
git commit -m "test(e2e): cover preserved import assets"
```
