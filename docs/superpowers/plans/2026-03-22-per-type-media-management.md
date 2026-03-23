# Per-Type Media Management Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split all global media management settings into per-type (ebook/audiobook) keys, restructure the UI with top-level tabs, add naming template validation, and update server-side consumers.

**Architecture:** New migration (0008) copies global settings to per-type keys and deletes the originals. The media management page gets top-level Ebook/Audiobook tabs with consolidated state. Server-side `readImportSettings()` gains a `type` parameter. Client-side validation ensures naming templates include required tokens.

**Tech Stack:** SQLite (Drizzle ORM), React (TanStack Start), shadcn/ui Tabs component

**Spec:** `docs/superpowers/specs/2026-03-22-per-type-media-management-design.md`

---

### Task 1: Database Migration — Split Global Keys to Per-Type

**Files:**

- Create: `drizzle/0008_per_type_media_management.sql`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Create the migration SQL file**

Create `drizzle/0008_per_type_media_management.sql`:

```sql
-- Copy existing global values to per-type keys
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.renameBooks', value FROM settings WHERE key = 'mediaManagement.renameBooks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.renameBooks', value FROM settings WHERE key = 'mediaManagement.renameBooks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.replaceIllegalCharacters', value FROM settings WHERE key = 'mediaManagement.replaceIllegalCharacters';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.replaceIllegalCharacters', value FROM settings WHERE key = 'mediaManagement.replaceIllegalCharacters';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.createEmptyAuthorFolders', value FROM settings WHERE key = 'mediaManagement.createEmptyAuthorFolders';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.createEmptyAuthorFolders', value FROM settings WHERE key = 'mediaManagement.createEmptyAuthorFolders';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.deleteEmptyAuthorFolders', value FROM settings WHERE key = 'mediaManagement.deleteEmptyAuthorFolders';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.deleteEmptyAuthorFolders', value FROM settings WHERE key = 'mediaManagement.deleteEmptyAuthorFolders';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.useHardLinks', value FROM settings WHERE key = 'mediaManagement.useHardLinks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.useHardLinks', value FROM settings WHERE key = 'mediaManagement.useHardLinks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.skipFreeSpaceCheck', value FROM settings WHERE key = 'mediaManagement.skipFreeSpaceCheck';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.skipFreeSpaceCheck', value FROM settings WHERE key = 'mediaManagement.skipFreeSpaceCheck';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.minimumFreeSpace', value FROM settings WHERE key = 'mediaManagement.minimumFreeSpace';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.minimumFreeSpace', value FROM settings WHERE key = 'mediaManagement.minimumFreeSpace';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.importExtraFiles', value FROM settings WHERE key = 'mediaManagement.importExtraFiles';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.importExtraFiles', value FROM settings WHERE key = 'mediaManagement.importExtraFiles';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.propersAndRepacks', value FROM settings WHERE key = 'mediaManagement.propersAndRepacks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.propersAndRepacks', value FROM settings WHERE key = 'mediaManagement.propersAndRepacks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.ignoreDeletedBooks', value FROM settings WHERE key = 'mediaManagement.ignoreDeletedBooks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.ignoreDeletedBooks', value FROM settings WHERE key = 'mediaManagement.ignoreDeletedBooks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.changeFileDate', value FROM settings WHERE key = 'mediaManagement.changeFileDate';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.changeFileDate', value FROM settings WHERE key = 'mediaManagement.changeFileDate';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.recyclingBin', value FROM settings WHERE key = 'mediaManagement.recyclingBin';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.recyclingBin', value FROM settings WHERE key = 'mediaManagement.recyclingBin';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.recyclingBinCleanup', value FROM settings WHERE key = 'mediaManagement.recyclingBinCleanup';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.recyclingBinCleanup', value FROM settings WHERE key = 'mediaManagement.recyclingBinCleanup';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.setPermissions', value FROM settings WHERE key = 'mediaManagement.setPermissions';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.setPermissions', value FROM settings WHERE key = 'mediaManagement.setPermissions';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.fileChmod', value FROM settings WHERE key = 'mediaManagement.fileChmod';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.fileChmod', value FROM settings WHERE key = 'mediaManagement.fileChmod';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.folderChmod', value FROM settings WHERE key = 'mediaManagement.folderChmod';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.folderChmod', value FROM settings WHERE key = 'mediaManagement.folderChmod';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.chownGroup', value FROM settings WHERE key = 'mediaManagement.chownGroup';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.chownGroup', value FROM settings WHERE key = 'mediaManagement.chownGroup';--> statement-breakpoint
-- Delete old global keys
DELETE FROM settings WHERE key IN ('mediaManagement.renameBooks', 'mediaManagement.replaceIllegalCharacters', 'mediaManagement.createEmptyAuthorFolders', 'mediaManagement.deleteEmptyAuthorFolders', 'mediaManagement.useHardLinks', 'mediaManagement.skipFreeSpaceCheck', 'mediaManagement.minimumFreeSpace', 'mediaManagement.importExtraFiles', 'mediaManagement.propersAndRepacks', 'mediaManagement.ignoreDeletedBooks', 'mediaManagement.changeFileDate', 'mediaManagement.recyclingBin', 'mediaManagement.recyclingBinCleanup', 'mediaManagement.setPermissions', 'mediaManagement.fileChmod', 'mediaManagement.folderChmod', 'mediaManagement.chownGroup');--> statement-breakpoint
-- Seed defaults for fresh installs (INSERT OR IGNORE skips if rows exist from copy above)
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.renameBooks', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.renameBooks', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.replaceIllegalCharacters', 'true');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.replaceIllegalCharacters', 'true');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.createEmptyAuthorFolders', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.createEmptyAuthorFolders', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.deleteEmptyAuthorFolders', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.deleteEmptyAuthorFolders', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.useHardLinks', 'true');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.useHardLinks', 'true');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.skipFreeSpaceCheck', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.skipFreeSpaceCheck', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.minimumFreeSpace', '100');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.minimumFreeSpace', '100');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.importExtraFiles', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.importExtraFiles', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.propersAndRepacks', '"preferAndUpgrade"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.propersAndRepacks', '"preferAndUpgrade"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.ignoreDeletedBooks', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.ignoreDeletedBooks', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.changeFileDate', '"none"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.changeFileDate', '"none"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.recyclingBin', '""');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.recyclingBin', '""');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.recyclingBinCleanup', '7');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.recyclingBinCleanup', '7');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.setPermissions', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.setPermissions', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.fileChmod', '"0644"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.fileChmod', '"0644"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.folderChmod', '"0755"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.folderChmod', '"0755"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.chownGroup', '""');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.chownGroup', '""');
```

- [ ] **Step 2: Add journal entry**

Add a new entry to `drizzle/meta/_journal.json` in the `entries` array:

```json
{
  "idx": 8,
  "version": "6",
  "when": 1774310400000,
  "tag": "0008_per_type_media_management",
  "breakpoints": true
}
```

- [ ] **Step 3: Run migration and verify**

Run: `bun run db:migrate`

Then verify with: `bun run db:studio` — check that `settings` table has `mediaManagement.ebook.renameBooks`, `mediaManagement.audiobook.renameBooks`, etc. and no more bare `mediaManagement.renameBooks`.

- [ ] **Step 4: Commit**

```bash
git add drizzle/0008_per_type_media_management.sql drizzle/meta/_journal.json
git commit -m "feat: migration 0008 splits global media management settings into per-type keys"
```

---

### Task 2: Update Server-Side Import Settings Reader

**Files:**

- Modify: `src/server/file-import.ts`

**Context:** `readImportSettings()` at line 204 currently reads global keys. `buildScanExtensions()` at line 223 reads `cfg.importExtraFiles`. `importCompletedDownload()` at line 435 calls both. The recycling bin read is at line 570. Folder template resolution is at lines 511-525. The download profile lookup is already done at line 100 in `resolveRootFolder()` — we need to also look up its `type` field.

- [ ] **Step 1: Update `readImportSettings()` to accept type parameter**

Change the function signature and all `getMediaSetting` calls inside. In `src/server/file-import.ts`, replace lines 204-221:

```ts
function readImportSettings(type: MediaType): ImportSettings {
  return {
    useHardLinks: getMediaSetting(`mediaManagement.${type}.useHardLinks`, true),
    skipFreeSpaceCheck: getMediaSetting(
      `mediaManagement.${type}.skipFreeSpaceCheck`,
      false,
    ),
    minimumFreeSpace: getMediaSetting(
      `mediaManagement.${type}.minimumFreeSpace`,
      100,
    ),
    renameBooks: getMediaSetting(`mediaManagement.${type}.renameBooks`, false),
    applyPermissions: getMediaSetting(
      `mediaManagement.${type}.setPermissions`,
      false,
    ),
    fileChmod: getMediaSetting(`mediaManagement.${type}.fileChmod`, "0644"),
    folderChmod: getMediaSetting(`mediaManagement.${type}.folderChmod`, "0755"),
    importExtraFiles: getMediaSetting(
      `mediaManagement.${type}.importExtraFiles`,
      false,
    ),
  };
}
```

- [ ] **Step 2: Update `buildScanExtensions()` to read both types' flags directly**

Replace lines 223-244:

```ts
function buildScanExtensions(): Set<string> {
  const extensions = new Set(SUPPORTED_EXTENSIONS);
  const ebookImportExtra = getMediaSetting(
    "mediaManagement.ebook.importExtraFiles",
    false,
  );
  const audioImportExtra = getMediaSetting(
    "mediaManagement.audiobook.importExtraFiles",
    false,
  );
  if (ebookImportExtra || audioImportExtra) {
    const ebookExtra = getMediaSetting(
      "mediaManagement.ebook.extraFileExtensions",
      "",
    );
    const audioExtra = getMediaSetting(
      "mediaManagement.audiobook.extraFileExtensions",
      "",
    );
    for (const extStr of [ebookExtra, audioExtra]) {
      for (const ext of extStr.split(",")) {
        const trimmed = ext.trim();
        if (trimmed) {
          extensions.add(trimmed.startsWith(".") ? trimmed : `.${trimmed}`);
        }
      }
    }
  }
  return extensions;
}
```

- [ ] **Step 3: Add `resolveProfileType()` helper**

Add after `resolveRootFolder()` (after line 113):

```ts
function resolveProfileType(downloadProfileId: number | null): MediaType {
  if (downloadProfileId) {
    const profile = db
      .select({ type: downloadProfiles.type })
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, downloadProfileId))
      .get();
    if (profile?.type === "audiobook") return "audiobook";
  }
  return "ebook";
}
```

- [ ] **Step 4: Update `importCompletedDownload()` to use per-type settings**

In `importCompletedDownload()`, replace line 464:

```ts
const cfg = readImportSettings();
```

with:

```ts
const primaryType = resolveProfileType(td.downloadProfileId);
const cfg = readImportSettings(primaryType);
```

Replace line 465:

```ts
const files = scanForBookFiles(sourceDir, buildScanExtensions(cfg));
```

with:

```ts
const files = scanForBookFiles(sourceDir, buildScanExtensions());
```

- [ ] **Step 5: Update folder template resolution to use primaryType**

Replace lines 511-525:

```ts
const authorFolderName = sanitizePath(
  applyNamingTemplate(
    getMediaSetting(`naming.${primaryType}.authorFolder`, "{Author Name}"),
    namingVars,
  ),
);
const bookFolderName = sanitizePath(
  applyNamingTemplate(
    getMediaSetting(
      `naming.${primaryType}.bookFolder`,
      "{Book Title} ({Release Year})",
    ),
    namingVars,
  ),
);
```

- [ ] **Step 6: Update recycling bin to use per-file type**

Replace lines 569-591 (the recycling bin cleanup block):

```ts
if (existingFiles.length > 0) {
  for (const oldFile of existingFiles) {
    const ext = path.extname(oldFile.path).toLowerCase();
    const fileType: MediaType = AUDIO_EXTENSIONS.has(ext)
      ? "audiobook"
      : "ebook";
    const recyclingBin = getMediaSetting(
      `mediaManagement.${fileType}.recyclingBin`,
      "",
    );
    try {
      if (recyclingBin) {
        fs.mkdirSync(recyclingBin, { recursive: true });
        const recycleDest = path.join(
          recyclingBin,
          path.basename(oldFile.path),
        );
        fs.renameSync(oldFile.path, recycleDest);
      } else {
        fs.unlinkSync(oldFile.path);
      }
    } catch {
      // File may already be gone
    }
    db.delete(bookFiles).where(eq(bookFiles.id, oldFile.id)).run();
  }
  console.log(
    `[file-import] Cleaned up ${existingFiles.length} old file(s) for "${bookTitle}"`,
  );
}
```

- [ ] **Step 7: Verify build compiles**

Run: `bun run build`
Expected: No TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/file-import.ts
git commit -m "feat: update file-import to read per-type media management settings"
```

---

### Task 3: Restructure Media Management UI with Top-Level Tabs

**Files:**

- Modify: `src/routes/_authed/settings/media-management.tsx`

**Context:** The current page has 30+ individual `useState` calls and inner ebook/audiobook tabs only for the naming section. We'll replace all of this with a consolidated state object keyed by type and top-level tabs.

- [ ] **Step 1: Replace the entire component**

Replace the full contents of `src/routes/_authed/settings/media-management.tsx` with:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Switch from "src/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import PageHeader from "src/components/shared/page-header";
import { settingsMapQuery, downloadProfilesListQuery } from "src/lib/queries";
import { useUpdateSettings } from "src/hooks/mutations";

export const Route = createFileRoute("/_authed/settings/media-management")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(settingsMapQuery()),
      context.queryClient.ensureQueryData(downloadProfilesListQuery()),
    ]);
  },
  component: MediaManagementPage,
});

function getSetting<T>(
  settings: Record<string, unknown>,
  key: string,
  defaultValue: T,
): T {
  const v = settings[key];
  if (v === undefined || v === null) {
    return defaultValue;
  }
  return v as T;
}

type MediaType = "ebook" | "audiobook";

type TypeSettings = {
  renameBooks: boolean;
  replaceIllegalCharacters: boolean;
  bookFile: string;
  authorFolder: string;
  bookFolder: string;
  extraExtensions: string;
  createEmptyAuthorFolders: boolean;
  deleteEmptyAuthorFolders: boolean;
  useHardLinks: boolean;
  skipFreeSpaceCheck: boolean;
  minimumFreeSpace: number;
  importExtraFiles: boolean;
  propersAndRepacks: string;
  ignoreDeletedBooks: boolean;
  changeFileDate: string;
  recyclingBin: string;
  recyclingBinCleanup: number;
  setPermissions: boolean;
  fileChmod: string;
  folderChmod: string;
  chownGroup: string;
};

const EBOOK_NAMING_TOKENS =
  "{Author Name}, {Book Title}, {Book Series}, {Book SeriesPosition}, {Release Year}";
const AUDIOBOOK_NAMING_TOKENS =
  "{Author Name}, {Book Title}, {Book Series}, {Book SeriesPosition}, {Release Year}, {PartNumber}, {PartNumber:00}, {PartCount}";

function buildTypeSettings(
  settings: Record<string, unknown>,
  type: MediaType,
): TypeSettings {
  const t = type;
  return {
    renameBooks: getSetting(
      settings,
      `mediaManagement.${t}.renameBooks`,
      false,
    ),
    replaceIllegalCharacters: getSetting(
      settings,
      `mediaManagement.${t}.replaceIllegalCharacters`,
      true,
    ),
    bookFile: getSetting(
      settings,
      `naming.${t}.bookFile`,
      t === "audiobook"
        ? "{Author Name} - {Book Title} - Part {PartNumber:00}"
        : "{Author Name} - {Book Title}",
    ),
    authorFolder: getSetting(
      settings,
      `naming.${t}.authorFolder`,
      "{Author Name}",
    ),
    bookFolder: getSetting(
      settings,
      `naming.${t}.bookFolder`,
      "{Book Title} ({Release Year})",
    ),
    extraExtensions: getSetting(
      settings,
      `mediaManagement.${t}.extraFileExtensions`,
      t === "audiobook" ? ".cue,.nfo" : "",
    ),
    createEmptyAuthorFolders: getSetting(
      settings,
      `mediaManagement.${t}.createEmptyAuthorFolders`,
      false,
    ),
    deleteEmptyAuthorFolders: getSetting(
      settings,
      `mediaManagement.${t}.deleteEmptyAuthorFolders`,
      false,
    ),
    useHardLinks: getSetting(
      settings,
      `mediaManagement.${t}.useHardLinks`,
      true,
    ),
    skipFreeSpaceCheck: getSetting(
      settings,
      `mediaManagement.${t}.skipFreeSpaceCheck`,
      false,
    ),
    minimumFreeSpace: getSetting(
      settings,
      `mediaManagement.${t}.minimumFreeSpace`,
      100,
    ),
    importExtraFiles: getSetting(
      settings,
      `mediaManagement.${t}.importExtraFiles`,
      false,
    ),
    propersAndRepacks: getSetting(
      settings,
      `mediaManagement.${t}.propersAndRepacks`,
      "preferAndUpgrade",
    ),
    ignoreDeletedBooks: getSetting(
      settings,
      `mediaManagement.${t}.ignoreDeletedBooks`,
      false,
    ),
    changeFileDate: getSetting(
      settings,
      `mediaManagement.${t}.changeFileDate`,
      "none",
    ),
    recyclingBin: getSetting(settings, `mediaManagement.${t}.recyclingBin`, ""),
    recyclingBinCleanup: getSetting(
      settings,
      `mediaManagement.${t}.recyclingBinCleanup`,
      7,
    ),
    setPermissions: getSetting(
      settings,
      `mediaManagement.${t}.setPermissions`,
      false,
    ),
    fileChmod: getSetting(settings, `mediaManagement.${t}.fileChmod`, "0644"),
    folderChmod: getSetting(
      settings,
      `mediaManagement.${t}.folderChmod`,
      "0755",
    ),
    chownGroup: getSetting(settings, `mediaManagement.${t}.chownGroup`, ""),
  };
}

function validateBookFile(type: MediaType, value: string): string | null {
  if (!value.includes("{Book Title}")) {
    return "Template must include {Book Title}";
  }
  if (
    type === "audiobook" &&
    !value.includes("{PartNumber}") &&
    !value.includes("{PartNumber:00}") &&
    !value.includes("{PartCount}")
  ) {
    return "Template must include {Book Title} and at least one of {PartNumber}, {PartNumber:00}, or {PartCount}";
  }
  return null;
}

function MediaManagementPage() {
  const { data: settings } = useSuspenseQuery(settingsMapQuery());
  const { data: profiles } = useSuspenseQuery(downloadProfilesListQuery());
  const updateSettings = useUpdateSettings();

  const [activeTab, setActiveTab] = useState<MediaType>("ebook");
  const [state, setState] = useState<Record<MediaType, TypeSettings>>({
    ebook: buildTypeSettings(settings, "ebook"),
    audiobook: buildTypeSettings(settings, "audiobook"),
  });

  function updateField<K extends keyof TypeSettings>(
    type: MediaType,
    key: K,
    value: TypeSettings[K],
  ) {
    setState((prev) => ({
      ...prev,
      [type]: { ...prev[type], [key]: value },
    }));
  }

  function getRootFolderMap(type: MediaType) {
    const map = new Map<string, string[]>();
    for (const profile of profiles) {
      if (profile.rootFolderPath && profile.type === type) {
        const existing = map.get(profile.rootFolderPath) ?? [];
        existing.push(profile.name);
        map.set(profile.rootFolderPath, existing);
      }
    }
    return map;
  }

  const handleSave = () => {
    const t = activeTab;
    const s = state[t];
    updateSettings.mutate([
      { key: `mediaManagement.${t}.renameBooks`, value: String(s.renameBooks) },
      {
        key: `mediaManagement.${t}.replaceIllegalCharacters`,
        value: String(s.replaceIllegalCharacters),
      },
      { key: `naming.${t}.bookFile`, value: s.bookFile },
      { key: `naming.${t}.authorFolder`, value: s.authorFolder },
      { key: `naming.${t}.bookFolder`, value: s.bookFolder },
      {
        key: `mediaManagement.${t}.extraFileExtensions`,
        value: s.extraExtensions,
      },
      {
        key: `mediaManagement.${t}.createEmptyAuthorFolders`,
        value: String(s.createEmptyAuthorFolders),
      },
      {
        key: `mediaManagement.${t}.deleteEmptyAuthorFolders`,
        value: String(s.deleteEmptyAuthorFolders),
      },
      {
        key: `mediaManagement.${t}.useHardLinks`,
        value: String(s.useHardLinks),
      },
      {
        key: `mediaManagement.${t}.skipFreeSpaceCheck`,
        value: String(s.skipFreeSpaceCheck),
      },
      {
        key: `mediaManagement.${t}.minimumFreeSpace`,
        value: String(s.minimumFreeSpace),
      },
      {
        key: `mediaManagement.${t}.importExtraFiles`,
        value: String(s.importExtraFiles),
      },
      {
        key: `mediaManagement.${t}.propersAndRepacks`,
        value: s.propersAndRepacks,
      },
      {
        key: `mediaManagement.${t}.ignoreDeletedBooks`,
        value: String(s.ignoreDeletedBooks),
      },
      { key: `mediaManagement.${t}.changeFileDate`, value: s.changeFileDate },
      { key: `mediaManagement.${t}.recyclingBin`, value: s.recyclingBin },
      {
        key: `mediaManagement.${t}.recyclingBinCleanup`,
        value: String(s.recyclingBinCleanup),
      },
      {
        key: `mediaManagement.${t}.setPermissions`,
        value: String(s.setPermissions),
      },
      { key: `mediaManagement.${t}.fileChmod`, value: s.fileChmod },
      { key: `mediaManagement.${t}.folderChmod`, value: s.folderChmod },
      { key: `mediaManagement.${t}.chownGroup`, value: s.chownGroup },
    ]);
  };

  return (
    <div>
      <PageHeader title="Media Management" />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as MediaType)}
      >
        <TabsList>
          <TabsTrigger value="ebook">Ebook</TabsTrigger>
          <TabsTrigger value="audiobook">Audiobook</TabsTrigger>
        </TabsList>

        {(["ebook", "audiobook"] as const).map((type) => {
          const current = state[type];
          const namingTokens =
            type === "audiobook"
              ? AUDIOBOOK_NAMING_TOKENS
              : EBOOK_NAMING_TOKENS;
          const bookFileError = validateBookFile(type, current.bookFile);
          const rootFolderMap = getRootFolderMap(type);

          return (
            <TabsContent key={type} value={type}>
              <div className="space-y-6 max-w-2xl">
                {/* Book Naming */}
                <Card>
                  <CardHeader>
                    <CardTitle>Book Naming</CardTitle>
                    <CardDescription>
                      Configure how {type} files and folders are named.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Rename Books</Label>
                        <p className="text-sm text-muted-foreground">
                          Rename imported book files using the configured
                          format.
                        </p>
                      </div>
                      <Switch
                        checked={current.renameBooks}
                        onCheckedChange={(v) =>
                          updateField(type, "renameBooks", v)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Replace Illegal Characters</Label>
                        <p className="text-sm text-muted-foreground">
                          Replace characters that are not allowed in file paths.
                        </p>
                      </div>
                      <Switch
                        checked={current.replaceIllegalCharacters}
                        onCheckedChange={(v) =>
                          updateField(type, "replaceIllegalCharacters", v)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Standard Book Format</Label>
                      <Input
                        value={current.bookFile}
                        onChange={(e) =>
                          updateField(type, "bookFile", e.target.value)
                        }
                        disabled={!current.renameBooks}
                      />
                      {bookFileError && (
                        <p className="text-xs text-destructive">
                          {bookFileError}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Available tokens: {namingTokens}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Author Folder Format</Label>
                      <Input
                        value={current.authorFolder}
                        onChange={(e) =>
                          updateField(type, "authorFolder", e.target.value)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Available tokens: {namingTokens}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Book Folder Format</Label>
                      <Input
                        value={current.bookFolder}
                        onChange={(e) =>
                          updateField(type, "bookFolder", e.target.value)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Available tokens: {namingTokens}
                      </p>
                    </div>

                    {current.importExtraFiles && (
                      <div className="space-y-2">
                        <Label>Extra File Extensions</Label>
                        <Input
                          value={current.extraExtensions}
                          onChange={(e) =>
                            updateField(type, "extraExtensions", e.target.value)
                          }
                          placeholder={
                            type === "audiobook" ? ".cue,.nfo" : ".jpg,.opf"
                          }
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Folders */}
                <Card>
                  <CardHeader>
                    <CardTitle>Folders</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Create empty author folders</Label>
                        <p className="text-sm text-muted-foreground">
                          Create folders for authors even if they have no books.
                        </p>
                      </div>
                      <Switch
                        checked={current.createEmptyAuthorFolders}
                        onCheckedChange={(v) =>
                          updateField(type, "createEmptyAuthorFolders", v)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Delete empty author folders</Label>
                        <p className="text-sm text-muted-foreground">
                          Remove author folders when they no longer contain any
                          books.
                        </p>
                      </div>
                      <Switch
                        checked={current.deleteEmptyAuthorFolders}
                        onCheckedChange={(v) =>
                          updateField(type, "deleteEmptyAuthorFolders", v)
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Importing */}
                <Card>
                  <CardHeader>
                    <CardTitle>Importing</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Copy using Hard Links</Label>
                        <p className="text-sm text-muted-foreground">
                          Use hard links instead of copying files when
                          importing.
                        </p>
                      </div>
                      <Switch
                        checked={current.useHardLinks}
                        onCheckedChange={(v) =>
                          updateField(type, "useHardLinks", v)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Skip Free Space Check</Label>
                        <p className="text-sm text-muted-foreground">
                          Skip checking available disk space before importing.
                        </p>
                      </div>
                      <Switch
                        checked={current.skipFreeSpaceCheck}
                        onCheckedChange={(v) =>
                          updateField(type, "skipFreeSpaceCheck", v)
                        }
                      />
                    </div>

                    {!current.skipFreeSpaceCheck && (
                      <div className="space-y-2">
                        <Label>Minimum Free Space (MB)</Label>
                        <Input
                          type="number"
                          value={current.minimumFreeSpace}
                          onChange={(e) =>
                            updateField(
                              type,
                              "minimumFreeSpace",
                              Number(e.target.value),
                            )
                          }
                          min={0}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Import Extra Files</Label>
                        <p className="text-sm text-muted-foreground">
                          Import additional non-book files alongside the book.
                          Configure extensions in the Book Naming section above.
                        </p>
                      </div>
                      <Switch
                        checked={current.importExtraFiles}
                        onCheckedChange={(v) =>
                          updateField(type, "importExtraFiles", v)
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* File Management */}
                <Card>
                  <CardHeader>
                    <CardTitle>File Management</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>Propers and Repacks</Label>
                      <Select
                        value={current.propersAndRepacks}
                        onValueChange={(v) =>
                          updateField(type, "propersAndRepacks", v)
                        }
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="preferAndUpgrade">
                            Prefer and Upgrade
                          </SelectItem>
                          <SelectItem value="doNotUpgrade">
                            Do Not Upgrade
                          </SelectItem>
                          <SelectItem value="doNotPrefer">
                            Do Not Prefer
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Ignore Deleted Books</Label>
                        <p className="text-sm text-muted-foreground">
                          Do not unmonitor books when their files are deleted
                          from disk.
                        </p>
                      </div>
                      <Switch
                        checked={current.ignoreDeletedBooks}
                        onCheckedChange={(v) =>
                          updateField(type, "ignoreDeletedBooks", v)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Change File Date</Label>
                      <Select
                        value={current.changeFileDate}
                        onValueChange={(v) =>
                          updateField(type, "changeFileDate", v)
                        }
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="releaseDate">
                            Release Date
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Recycling Bin</Label>
                      <Input
                        value={current.recyclingBin}
                        onChange={(e) =>
                          updateField(type, "recyclingBin", e.target.value)
                        }
                        placeholder="Leave empty to disable"
                      />
                    </div>

                    {current.recyclingBin && (
                      <div className="space-y-2">
                        <Label>Recycling Bin Cleanup (days)</Label>
                        <Input
                          type="number"
                          value={current.recyclingBinCleanup}
                          onChange={(e) =>
                            updateField(
                              type,
                              "recyclingBinCleanup",
                              Number(e.target.value),
                            )
                          }
                          min={0}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Permissions */}
                <Card>
                  <CardHeader>
                    <CardTitle>Permissions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Set Permissions</Label>
                        <p className="text-sm text-muted-foreground">
                          Apply chmod and chown to imported files and folders.
                        </p>
                      </div>
                      <Switch
                        checked={current.setPermissions}
                        onCheckedChange={(v) =>
                          updateField(type, "setPermissions", v)
                        }
                      />
                    </div>

                    {current.setPermissions && (
                      <>
                        <div className="space-y-2">
                          <Label>File chmod</Label>
                          <Input
                            value={current.fileChmod}
                            onChange={(e) =>
                              updateField(type, "fileChmod", e.target.value)
                            }
                            placeholder="0644"
                            className="font-mono"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Folder chmod</Label>
                          <Input
                            value={current.folderChmod}
                            onChange={(e) =>
                              updateField(type, "folderChmod", e.target.value)
                            }
                            placeholder="0755"
                            className="font-mono"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>chown Group</Label>
                          <Input
                            value={current.chownGroup}
                            onChange={(e) =>
                              updateField(type, "chownGroup", e.target.value)
                            }
                            placeholder="Leave empty to skip"
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Root Folders */}
                <Card>
                  <CardHeader>
                    <CardTitle>Root Folders</CardTitle>
                    <CardDescription>
                      Root folders are configured per download profile.{" "}
                      <Link
                        to="/settings/profiles"
                        className="text-primary hover:underline"
                      >
                        Manage Profiles
                      </Link>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {rootFolderMap.size === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No {type} root folders configured. Add a root folder
                        path in your {type} download profiles.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {[...rootFolderMap.entries()].map(
                          ([folderPath, profileNames]) => (
                            <div
                              key={folderPath}
                              className="flex items-center justify-between rounded-md border px-4 py-3"
                            >
                              <code className="text-sm">{folderPath}</code>
                              <span className="text-sm text-muted-foreground">
                                {profileNames.join(", ")}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Button
                  onClick={handleSave}
                  disabled={updateSettings.isPending || !!bookFileError}
                >
                  {updateSettings.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verify dev server renders correctly**

Run: `bun run dev`
Navigate to `http://localhost:3000/settings/media-management`
Expected: Top-level Ebook/Audiobook tabs visible. Switching tabs shows all cards. Root folders filtered by type.

- [ ] **Step 3: Verify validation**

On the Ebook tab, clear the Standard Book Format field. Expected: red error "Template must include {Book Title}", Save button disabled.
On the Audiobook tab, set template to `{Book Title}` only. Expected: error about missing part token.
On the Audiobook tab, set template to `{Book Title} - Part {PartNumber:00}`. Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authed/settings/media-management.tsx
git commit -m "feat: restructure media management UI with per-type tabs and validation"
```

---

### Task 4: Update E2E Tests

**Files:**

- Modify: `e2e/tests/07-download-lifecycle.spec.ts` (lines 505, 572)
- Modify: `e2e/tests/02-settings-config.spec.ts` (lines 678-733)

**Context:** Two E2E tests seed global `mediaManagement.*` keys that no longer exist. The settings config test interacts with the old inner tab structure.

- [ ] **Step 1: Update download lifecycle test — rename books setting**

In `e2e/tests/07-download-lifecycle.spec.ts`, replace line 505:

```ts
seedSetting(db, "mediaManagement.renameBooks", true);
```

with:

```ts
seedSetting(db, "mediaManagement.ebook.renameBooks", true);
```

- [ ] **Step 2: Update download lifecycle test — hard links setting**

In the same file, replace line 572:

```ts
seedSetting(db, "mediaManagement.useHardLinks", true);
```

with:

```ts
seedSetting(db, "mediaManagement.ebook.useHardLinks", true);
```

- [ ] **Step 3: Update settings config test — media management save test**

In `e2e/tests/02-settings-config.spec.ts`, the "save media management settings" test (line 678) toggles the "Rename Books" switch. With top-level tabs, the Ebook tab is now the default view. The test should still work since "Rename Books" is still visible on the Ebook tab. No changes needed for this test — the switch is still accessible.

Verify by reading the test: the `renameBooksSwitch` selector finds the switch via text "Rename Books" which still exists in the new layout. The "Save Settings" button is still present. No change needed.

- [ ] **Step 4: Update settings config test — ebook and audiobook naming tabs test**

In `e2e/tests/02-settings-config.spec.ts`, the "ebook and audiobook naming tabs render and save" test (line 700) already tests for Ebook/Audiobook tabs and the presence of `{PartNumber}` on the audiobook tab. Since the tabs are now top-level instead of nested, the test selectors should still work — `getByRole("tab", { name: "Ebook" })` will find top-level tabs.

However, the test clicks "Save Settings" after switching to the Audiobook tab. With the new design, save writes only the active tab's settings. The audiobook naming template default includes `{PartNumber:00}` which passes validation. No change needed for this test either.

Verify by re-reading the test selectors against the new JSX to confirm they still match.

- [ ] **Step 5: Run the E2E tests (just the affected specs)**

Run: `bunx playwright test e2e/tests/02-settings-config.spec.ts e2e/tests/07-download-lifecycle.spec.ts`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add e2e/tests/07-download-lifecycle.spec.ts e2e/tests/02-settings-config.spec.ts
git commit -m "fix: update E2E tests for per-type media management settings keys"
```

---

### Task 5: Full Build Verification and Final Commit

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

Run: `bun run build`
Expected: No TypeScript errors, clean build.

- [ ] **Step 2: Run full E2E suite**

Run: `bunx playwright test`
Expected: All tests pass.

- [ ] **Step 3: Verify migration on fresh database**

Delete `data/sqlite.db` (or use a temporary path), run `bun run db:migrate`, then start the dev server and navigate to `/settings/media-management`. Expected: Both tabs show correct defaults. Ebook Standard Book Format = `{Author Name} - {Book Title}`. Audiobook Standard Book Format = `{Author Name} - {Book Title} - Part {PartNumber:00}`.

- [ ] **Step 4: Final commit if any fixups needed**

If any fixes were needed during verification:

```bash
git add -A
git commit -m "fix: address issues found during per-type media management verification"
```
