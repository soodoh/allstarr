# Per-Type Media Management Settings

**Date:** 2026-03-22
**Status:** Approved

## Summary

Restructure the media management settings page so that every setting is specific to a media type (ebook or audiobook). The page gets top-level tabs that wrap the entire view. A new migration splits all global `mediaManagement.*` keys into per-type keys. The Standard Book Format field gains client-side validation requiring `{Book Title}` for ebooks and additionally a part token for audiobooks.

## Approach

Option C: Independent per-type settings with shared initial defaults. Each tab is fully independent — no override/inheritance logic. The migration seeds both types with identical defaults (copied from existing global values for upgrades, hardcoded defaults for fresh installs).

## Settings Key Structure

All global `mediaManagement.*` keys split into `mediaManagement.ebook.*` and `mediaManagement.audiobook.*`:

| Current Global Key                         | Ebook Key                                        | Audiobook Key                                        |
| ------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------- |
| `mediaManagement.renameBooks`              | `mediaManagement.ebook.renameBooks`              | `mediaManagement.audiobook.renameBooks`              |
| `mediaManagement.replaceIllegalCharacters` | `mediaManagement.ebook.replaceIllegalCharacters` | `mediaManagement.audiobook.replaceIllegalCharacters` |
| `mediaManagement.createEmptyAuthorFolders` | `mediaManagement.ebook.createEmptyAuthorFolders` | `mediaManagement.audiobook.createEmptyAuthorFolders` |
| `mediaManagement.deleteEmptyAuthorFolders` | `mediaManagement.ebook.deleteEmptyAuthorFolders` | `mediaManagement.audiobook.deleteEmptyAuthorFolders` |
| `mediaManagement.useHardLinks`             | `mediaManagement.ebook.useHardLinks`             | `mediaManagement.audiobook.useHardLinks`             |
| `mediaManagement.skipFreeSpaceCheck`       | `mediaManagement.ebook.skipFreeSpaceCheck`       | `mediaManagement.audiobook.skipFreeSpaceCheck`       |
| `mediaManagement.minimumFreeSpace`         | `mediaManagement.ebook.minimumFreeSpace`         | `mediaManagement.audiobook.minimumFreeSpace`         |
| `mediaManagement.importExtraFiles`         | `mediaManagement.ebook.importExtraFiles`         | `mediaManagement.audiobook.importExtraFiles`         |
| `mediaManagement.propersAndRepacks`        | `mediaManagement.ebook.propersAndRepacks`        | `mediaManagement.audiobook.propersAndRepacks`        |
| `mediaManagement.ignoreDeletedBooks`       | `mediaManagement.ebook.ignoreDeletedBooks`       | `mediaManagement.audiobook.ignoreDeletedBooks`       |
| `mediaManagement.changeFileDate`           | `mediaManagement.ebook.changeFileDate`           | `mediaManagement.audiobook.changeFileDate`           |
| `mediaManagement.recyclingBin`             | `mediaManagement.ebook.recyclingBin`             | `mediaManagement.audiobook.recyclingBin`             |
| `mediaManagement.recyclingBinCleanup`      | `mediaManagement.ebook.recyclingBinCleanup`      | `mediaManagement.audiobook.recyclingBinCleanup`      |
| `mediaManagement.setPermissions`           | `mediaManagement.ebook.setPermissions`           | `mediaManagement.audiobook.setPermissions`           |
| `mediaManagement.fileChmod`                | `mediaManagement.ebook.fileChmod`                | `mediaManagement.audiobook.fileChmod`                |
| `mediaManagement.folderChmod`              | `mediaManagement.ebook.folderChmod`              | `mediaManagement.audiobook.folderChmod`              |
| `mediaManagement.chownGroup`               | `mediaManagement.ebook.chownGroup`               | `mediaManagement.audiobook.chownGroup`               |

Already per-type keys (unchanged): `naming.ebook.*`, `naming.audiobook.*`, `mediaManagement.ebook.extraFileExtensions`, `mediaManagement.audiobook.extraFileExtensions`.

## Migration (0008)

### Step 1: Copy global values to both types

For each of the 17 global keys:

```sql
INSERT INTO settings (key, value)
  SELECT 'mediaManagement.ebook.<setting>', value
  FROM settings WHERE key = 'mediaManagement.<setting>';
INSERT INTO settings (key, value)
  SELECT 'mediaManagement.audiobook.<setting>', value
  FROM settings WHERE key = 'mediaManagement.<setting>';
```

### Step 2: Delete old global keys

```sql
DELETE FROM settings WHERE key IN (
  'mediaManagement.renameBooks',
  'mediaManagement.replaceIllegalCharacters',
  'mediaManagement.createEmptyAuthorFolders',
  'mediaManagement.deleteEmptyAuthorFolders',
  'mediaManagement.useHardLinks',
  'mediaManagement.skipFreeSpaceCheck',
  'mediaManagement.minimumFreeSpace',
  'mediaManagement.importExtraFiles',
  'mediaManagement.propersAndRepacks',
  'mediaManagement.ignoreDeletedBooks',
  'mediaManagement.changeFileDate',
  'mediaManagement.recyclingBin',
  'mediaManagement.recyclingBinCleanup',
  'mediaManagement.setPermissions',
  'mediaManagement.fileChmod',
  'mediaManagement.folderChmod',
  'mediaManagement.chownGroup'
);
```

### Step 3: Seed defaults for fresh installs

`INSERT OR IGNORE` for all 34 per-type keys (17 x 2 types). Default values:

| Setting                  | Default            |
| ------------------------ | ------------------ |
| renameBooks              | `false`            |
| replaceIllegalCharacters | `true`             |
| createEmptyAuthorFolders | `false`            |
| deleteEmptyAuthorFolders | `false`            |
| useHardLinks             | `true`             |
| skipFreeSpaceCheck       | `false`            |
| minimumFreeSpace         | `100`              |
| importExtraFiles         | `false`            |
| propersAndRepacks        | `preferAndUpgrade` |
| ignoreDeletedBooks       | `false`            |
| changeFileDate           | `none`             |
| recyclingBin             | `""`               |
| recyclingBinCleanup      | `7`                |
| setPermissions           | `false`            |
| fileChmod                | `0644`             |
| folderChmod              | `0755`             |
| chownGroup               | `""`               |

Both ebook and audiobook types receive identical defaults. Values are JSON-encoded in the `value` column (e.g., `'"preferAndUpgrade"'` for strings, `'false'` for booleans, `'100'` for numbers).

## Naming Template Validation

Client-side only. Inline error below the Standard Book Format input. Save button disabled when invalid.

**Ebook:** Must contain `{Book Title}`.

- Error: `"Template must include {Book Title}"`

**Audiobook:** Must contain `{Book Title}` AND at least one of `{PartNumber}`, `{PartNumber:00}`, or `{PartCount}`.

- Error: `"Template must include {Book Title} and at least one of {PartNumber}, {PartNumber:00}, or {PartCount}"`

## UI Structure

### Layout

```
PageHeader: "Media Management"
[Ebook]  [Audiobook]              <- top-level tabs
  Card: Book Naming               <- naming templates + extra extensions
  Card: Folders
  Card: Importing
  Card: File Management
  Card: Permissions
  Card: Root Folders              <- filtered by profile.type
  [Save Settings]
```

### Key changes from current page

- Top-level Ebook/Audiobook tabs replace the inner naming-only tabs
- Each tab renders all cards bound to that type's settings
- Available naming tokens differ per tab (audiobooks include `{PartNumber}`, `{PartNumber:00}`, `{PartCount}`)
- Root Folders card filters profiles by `profile.type === activeTab`
- Save button writes only the active tab's settings
- State consolidates into a single object keyed by type:

```ts
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

const [state, setState] = useState<Record<MediaType, TypeSettings>>({
  ebook: {
    /* defaults from settings map */
  },
  audiobook: {
    /* defaults from settings map */
  },
});
```

## Server-Side Changes

### `readImportSettings()` in `src/server/file-import.ts`

Gains a `type: "ebook" | "audiobook"` parameter. All `getMediaSetting()` calls change from global keys to per-type keys:

```ts
function readImportSettings(type: "ebook" | "audiobook"): ImportSettings {
  return {
    useHardLinks: getMediaSetting(`mediaManagement.${type}.useHardLinks`, true),
    // ... etc
  };
}
```

Callers already know media type from file extension or quality definition context.

### `buildScanExtensions()`

During disk scan, union both types' extra extensions if either type has `importExtraFiles` enabled (since scan doesn't know file types in advance). At import time, use the specific type's `importExtraFiles` flag to decide whether extras are actually imported.

### Recycling bin

The `recyclingBin` read at line 570 of `file-import.ts` similarly becomes `getMediaSetting(\`mediaManagement.${type}.recyclingBin\`, "")`.

## Files Changed

- `drizzle/0008_per_type_media_management.sql` — new migration
- `drizzle/meta/_journal.json` — migration journal entry
- `src/routes/_authed/settings/media-management.tsx` — full UI restructure
- `src/server/file-import.ts` — `readImportSettings(type)`, `buildScanExtensions()`, recycling bin
