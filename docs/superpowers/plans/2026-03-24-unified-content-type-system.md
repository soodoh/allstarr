# Unified Content Type System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the three content type systems (download formats, download profiles, custom formats) into a single `"movie" | "tv" | "ebook" | "audiobook"` enum.

**Architecture:** Replace `download_formats.type` with a `contentTypes` JSON array. Collapse `download_profiles.mediaType` + `download_profiles.contentType` into a single `contentType` field. Flatten the schema change into the base migration. Remove the `profileToCFContentType()` conversion function.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), React (TanStack Start), Zod, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-24-unified-content-type-system-design.md`

---

## File Map

### Modified Files

| File                                                                  | Responsibility                                                              |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/db/schema/download-formats.ts`                                   | Replace `type` column with `contentTypes` JSON array                        |
| `src/db/schema/download-profiles.ts`                                  | Replace `mediaType` + `contentType` with single `contentType`               |
| `src/lib/validators.ts`                                               | Update Zod schemas for profiles and formats                                 |
| `src/lib/custom-format-preset-data.ts`                                | Remove `mediaType` from `Preset` type, update preset data                   |
| `src/lib/format-size-calc.ts`                                         | Change type param from `"ebook" \| "audio" \| "video"` to content type enum |
| `src/lib/editions.ts`                                                 | Change `mediaType` references to `contentType`                              |
| `src/db/seed-custom-formats.ts`                                       | Match presets by `contentType` only                                         |
| `src/server/indexers/cf-scoring.ts`                                   | Remove `profileToCFContentType()`                                           |
| `src/server/indexers/format-parser.ts`                                | Update cached type references and settings keys                             |
| `src/server/download-profiles.ts`                                     | Update `contentType` switch cases ("book" → "ebook"/"audiobook")            |
| `src/server/file-import.ts`                                           | Replace `mediaType` references with `contentType`                           |
| `src/server/custom-format-presets.ts`                                 | Remove `mediaType` filter from presets API                                  |
| `src/routes/_authed/settings/index.tsx`                               | Add Custom Formats card                                                     |
| `src/routes/_authed/settings/formats.tsx`                             | New tabs, defaults section, content type column                             |
| `src/routes/_authed/settings/profiles.tsx`                            | Remove `mediaType` from ProfileValues, update form props                    |
| `src/components/settings/download-formats/download-format-list.tsx`   | Add content type column, update type-based helpers                          |
| `src/components/settings/download-formats/download-format-form.tsx`   | Replace `type` prop with `contentTypes`                                     |
| `src/components/settings/download-profiles/download-profile-list.tsx` | Replace Content+Media columns with single Content Type                      |
| `src/components/settings/download-profiles/download-profile-form.tsx` | Single Content Type select, remove media type                               |
| `src/components/settings/custom-formats/cf-score-section.tsx`         | Remove `getCFContentType()`, use `contentType` directly                     |
| `src/components/bookshelf/hardcover/book-preview-modal.tsx`           | Filter profiles by `["ebook", "audiobook"]`                                 |
| `src/components/bookshelf/hardcover/author-preview-modal.tsx`         | Filter profiles by `["ebook", "audiobook"]`                                 |
| `src/components/bookshelf/books/edition-selection-modal.tsx`          | Replace `mediaType` with `contentType`                                      |
| `src/components/bookshelf/books/editions-tab.tsx`                     | Replace `mediaType` with `contentType`                                      |
| `src/components/bookshelf/books/profile-edition-card.tsx`             | Replace `mediaType` type with `contentType`                                 |
| `src/components/settings/custom-formats/preset-selector.tsx`          | Remove `mediaType` from presets API call and query key                      |
| `src/routes/_authed/bookshelf/authors/$authorId.tsx`                  | Filter profiles by `["ebook", "audiobook"]`                                 |
| `src/routes/_authed/bookshelf/books/$bookId.tsx`                      | Replace `mediaType` reference with `contentType`                            |
| `src/routes/_authed/settings/media-management.tsx`                    | Update `contentType` checks to include "ebook"/"audiobook"                  |

---

### Task 1: Schema — Download Formats

**Files:**

- Modify: `src/db/schema/download-formats.ts`

- [ ] **Step 1: Replace `type` with `contentTypes` in schema**

```typescript
// src/db/schema/download-formats.ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const downloadFormats = sqliteTable("download_formats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  weight: integer("weight").notNull().default(1),
  minSize: real("min_size").default(0),
  maxSize: real("max_size"),
  preferredSize: real("preferred_size"),
  color: text("color").notNull().default("gray"),
  contentTypes: text("content_types", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(["ebook"]),
  source: text("source"),
  resolution: integer("resolution").notNull().default(0),
  noMaxLimit: integer("no_max_limit").notNull().default(0),
  noPreferredLimit: integer("no_preferred_limit").notNull().default(0),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/db/schema/download-formats.ts
git commit -m "refactor: replace download_formats.type with contentTypes JSON array"
```

---

### Task 2: Schema — Download Profiles

**Files:**

- Modify: `src/db/schema/download-profiles.ts`

- [ ] **Step 1: Replace `mediaType` + `contentType` with single `contentType`**

```typescript
// src/db/schema/download-profiles.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const downloadProfiles = sqliteTable("download_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  rootFolderPath: text("root_folder_path").notNull().default(""),
  cutoff: integer("cutoff").notNull().default(0),
  items: text("items", { mode: "json" })
    .$type<number[][]>()
    .notNull()
    .default([]),
  upgradeAllowed: integer("upgrade_allowed", { mode: "boolean" })
    .notNull()
    .default(false),
  icon: text("icon").notNull().default("book-open"),
  categories: text("categories", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default([]),
  contentType: text("content_type").notNull().default("ebook"),
  language: text("language").notNull().default("en"),
  minCustomFormatScore: integer("min_custom_format_score").notNull().default(0),
  upgradeUntilCustomFormatScore: integer("upgrade_until_custom_format_score")
    .notNull()
    .default(0),
});
```

Note: The old `mediaType` field was stored as column `type` and `contentType` as column `content_type`. Now there's just `contentType` stored as `content_type`. The column `type` is removed entirely.

- [ ] **Step 2: Commit**

```bash
git add src/db/schema/download-profiles.ts
git commit -m "refactor: collapse download_profiles mediaType+contentType into single contentType"
```

---

### Task 3: Validators

**Files:**

- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Update download profile schema**

Replace lines 4-19 (`downloadProfileBaseSchema`):

```typescript
const downloadProfileBaseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  rootFolderPath: z.string().min(1, "Root folder is required"),
  cutoff: z.number().default(0),
  items: z
    .array(z.array(z.number()).min(1))
    .min(1, "At least one quality must be added"),
  upgradeAllowed: z.boolean().default(false),
  icon: z.string().min(1, "Icon is required"),
  categories: z.array(z.number()).default([]),
  contentType: z.enum(["movie", "tv", "ebook", "audiobook"]),
  language: z.string().min(2).max(3),
  minCustomFormatScore: z.number().default(0),
  upgradeUntilCustomFormatScore: z.number().default(0),
});
```

- [ ] **Step 2: Update download format schemas**

Replace `createDownloadFormatSchema` (lines 129-141):

```typescript
export const createDownloadFormatSchema = z.object({
  title: z.string().min(1),
  weight: z.number().default(1),
  color: z.string().default("gray"),
  minSize: z.number().default(0),
  maxSize: z.number().default(0),
  preferredSize: z.number().default(0),
  contentTypes: z
    .array(z.enum(["movie", "tv", "ebook", "audiobook"]))
    .min(1, "At least one content type required"),
  source: z.string().nullable().default(null),
  resolution: z.number().default(0),
  noMaxLimit: z.number().default(0),
  noPreferredLimit: z.number().default(0),
});
```

Replace `updateDownloadFormatSchema` (lines 143-156):

```typescript
export const updateDownloadFormatSchema = z.object({
  id: z.number(),
  title: z.string().min(1),
  weight: z.number(),
  color: z.string().default("gray"),
  minSize: z.number().default(0),
  maxSize: z.number().default(0),
  preferredSize: z.number().default(0),
  contentTypes: z
    .array(z.enum(["movie", "tv", "ebook", "audiobook"]))
    .min(1, "At least one content type required"),
  source: z.string().nullable().default(null),
  resolution: z.number().default(0),
  noMaxLimit: z.number().default(0),
  noPreferredLimit: z.number().default(0),
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/validators.ts
git commit -m "refactor: update validators for unified content type enum"
```

---

### Task 4: Format Size Calculation

**Files:**

- Modify: `src/lib/format-size-calc.ts`

- [ ] **Step 1: Add content type helper and update `computeEffectiveSizes`**

The function signature changes from `type: "ebook" | "audio" | "video"` to accept the content type enum and derive the size calculation mode. Add a helper to derive the "size mode" from a content type or content types array:

```typescript
/** Derive size calculation mode from content type(s) */
export function sizeMode(
  contentType: string | string[],
): "ebook" | "audio" | "video" {
  const ct = Array.isArray(contentType) ? contentType[0] : contentType;
  if (ct === "audiobook") return "audio";
  if (ct === "movie" || ct === "tv") return "video";
  return "ebook";
}
```

Update `computeEffectiveSizes` signature to accept `type: "ebook" | "audio" | "video"` (keep it, since callers will use `sizeMode()` to derive the value). No change needed to the function body — just export the helper.

- [ ] **Step 2: Commit**

```bash
git add src/lib/format-size-calc.ts
git commit -m "feat: add sizeMode helper to derive size calculation type from content type"
```

---

### Task 5: Preset Data & Seed

**Files:**

- Modify: `src/lib/custom-format-preset-data.ts`
- Modify: `src/db/seed-custom-formats.ts`

- [ ] **Step 1: Update Preset type — remove `mediaType`, keep `contentType`**

In `src/lib/custom-format-preset-data.ts`, change the `Preset` type:

```typescript
export type Preset = {
  name: string;
  description: string;
  category: string;
  contentType: string; // "movie" | "tv" | "ebook" | "audiobook"
  customFormats: PresetCF[];
  scores: Record<string, number>;
  minCustomFormatScore: number;
  upgradeUntilCustomFormatScore: number;
};
```

- [ ] **Step 2: Update preset data — remove `mediaType` field, fix content types**

For each preset in the `PRESETS` array:

- Remove the `mediaType` field
- Movie preset: `contentType: "movie"` (was already "movie")
- TV preset: `contentType: "tv"` (was already "tv")
- Ebook preset: change `contentType: "book"` → `contentType: "ebook"`
- Audiobook preset: change `contentType: "book"` → `contentType: "audiobook"`

- [ ] **Step 3: Update seed matching logic**

In `src/db/seed-custom-formats.ts`, line 68-73, change preset matching from dual-axis to single:

```typescript
// Find matching preset by contentType
const preset = PRESETS.find((p) => p.contentType === profile.contentType);
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/custom-format-preset-data.ts src/db/seed-custom-formats.ts
git commit -m "refactor: remove mediaType from presets, match by contentType only"
```

---

### Task 6: Server Functions — CF Scoring & Format Parser

**Files:**

- Modify: `src/server/indexers/cf-scoring.ts`
- Modify: `src/server/indexers/format-parser.ts`

- [ ] **Step 1: Remove `profileToCFContentType` from cf-scoring.ts**

Delete the entire function (lines 297-314):

```typescript
// DELETE the entire profileToCFContentType function and its comment block
```

Search for any callers of `profileToCFContentType` in the codebase and replace with direct `profile.contentType` access.

- [ ] **Step 2: Update format-parser.ts — CachedDef type and settings keys**

In `src/server/indexers/format-parser.ts`:

Update the `CachedDef` type (line 8-16) — replace `type: string` with `contentTypes: string[]`:

```typescript
type CachedDef = {
  id: number;
  name: string;
  weight: number;
  color: string;
  contentTypes: string[];
  source: string | null;
  resolution: number;
};
```

Update `getFormatDefs()` (line 29-46) — change `type: row.type` to `contentTypes: row.contentTypes`:

```typescript
function getFormatDefs(): CachedDef[] {
  if (!cachedDefs) {
    const rows = db.select().from(downloadFormats).all();
    cachedDefs = rows
      .map((row) => ({
        id: row.id,
        name: row.title,
        weight: row.weight,
        color: row.color,
        contentTypes: row.contentTypes,
        source: row.source,
        resolution: row.resolution,
      }))
      .toSorted((a, b) => b.weight - a.weight);
  }
  return cachedDefs;
}
```

Update `sizeLimitsCache` type (line 19-22) — replace `type: string` with `contentTypes: string[]`:

```typescript
let sizeLimitsCache: Map<
  number,
  {
    minSize: number;
    maxSize: number;
    noMaxLimit: number;
    contentTypes: string[];
  }
> | null = null;
```

Update the cache population (around line 63-72):

```typescript
sizeLimitsCache.set(r.id, {
  minSize: r.minSize ?? 0,
  maxSize: r.noMaxLimit ? 0 : (r.maxSize ?? 0),
  noMaxLimit: r.noMaxLimit ?? 0,
  contentTypes: r.contentTypes,
});
```

Update `cachedDefaults` to include video defaults and use new settings keys (lines 24-27, 80-98):

```typescript
let cachedDefaults: {
  defaultPageCount: number;
  defaultAudioDuration: number;
  defaultMovieRuntime: number;
  defaultTvEpisodeRuntime: number;
} | null = null;
```

Update the defaults loading block to use new settings keys:

```typescript
if (!cachedDefaults) {
  const rows = db.select().from(settings).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const parse = (key: string, fallback: number) => {
    const v = map.get(key);
    return v ? Number(JSON.parse(String(v))) : fallback;
  };
  cachedDefaults = {
    defaultPageCount: parse("format.ebook.defaultPageCount", 300),
    defaultAudioDuration: parse("format.audiobook.defaultDuration", 600),
    defaultMovieRuntime: parse("format.movie.defaultRuntime", 130),
    defaultTvEpisodeRuntime: parse("format.tv.defaultEpisodeRuntime", 45),
  };
}
```

Update the `computeEffectiveSizes` call (around line 101-108) to use `sizeMode()`:

```typescript
import { sizeMode, computeEffectiveSizes } from "src/lib/format-size-calc";

// ...
const effective = computeEffectiveSizes(
  sizeMode(cached.contentTypes),
  cached.minSize,
  cached.maxSize,
  0,
  editionMeta,
  cachedDefaults,
);
```

- [ ] **Step 3: Commit**

```bash
git add src/server/indexers/cf-scoring.ts src/server/indexers/format-parser.ts
git commit -m "refactor: remove profileToCFContentType, update format-parser for unified types"
```

---

### Task 7: Server Functions — Profiles, File Import, Presets

**Files:**

- Modify: `src/server/download-profiles.ts`
- Modify: `src/server/file-import.ts`
- Modify: `src/server/custom-format-presets.ts`
- Modify: `src/components/settings/custom-formats/preset-selector.tsx` (caller of `getPresetsFn`)

- [ ] **Step 1: Update download-profiles.ts switch cases**

In `countProfileFilesFn` (line 115) and `moveProfileFilesFn` (line 188), the switch on `profile.contentType` currently uses `"book"`, `"tv"`, `"movie"`. Update to handle both `"ebook"` and `"audiobook"` for the book case:

```typescript
switch (profile.contentType) {
  case "ebook":
  case "audiobook": {
    // ... same book file counting/moving logic ...
    break;
  }
  case "tv": {
    // ... unchanged ...
    break;
  }
  case "movie": {
    // ... unchanged ...
    break;
  }
}
```

- [ ] **Step 2: Update file-import.ts**

In `resolveProfileType` (line 115-127), replace `mediaType` with `contentType`:

```typescript
function resolveProfileType(downloadProfileId: number | null): MediaType {
  if (downloadProfileId) {
    const profile = db
      .select({ contentType: downloadProfiles.contentType })
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, downloadProfileId))
      .get();
    if (profile?.contentType === "audiobook") {
      return "audio";
    }
  }
  return "ebook";
}
```

Also update any other references in the file that use `profile.mediaType` — they should now reference `profile.contentType`. Search for `mediaType` in the file and update references at lines ~359, 363, 367, 412 to use the resolved type from `resolveProfileType()` or the content type directly.

- [ ] **Step 3: Update custom-format-presets.ts**

In `getPresetsFn` (lines 18-40), remove the `mediaType` filter since presets no longer have `mediaType`:

```typescript
export const getPresetsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { contentType?: string }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    let filtered = PRESETS;

    if (data.contentType) {
      filtered = filtered.filter((p) => p.contentType === data.contentType);
    }

    return filtered.map((p) => ({
      name: p.name,
      description: p.description,
      category: p.category,
      contentType: p.contentType,
      cfCount: p.customFormats.length,
      scores: p.scores,
      minCustomFormatScore: p.minCustomFormatScore,
      upgradeUntilCustomFormatScore: p.upgradeUntilCustomFormatScore,
    }));
  });
```

- [ ] **Step 4: Update preset-selector.tsx — remove `mediaType` from API call**

In `src/components/settings/custom-formats/preset-selector.tsx`, remove `mediaType` from the `getPresetsFn` call and query key. Only pass `contentType`:

```typescript
// Before:
getPresetsFn({ data: { contentType, mediaType } });
// After:
getPresetsFn({ data: { contentType } });
```

Remove `mediaType` from the component props and any query key arrays that include it.

- [ ] **Step 5: Commit**

```bash
git add src/server/download-profiles.ts src/server/file-import.ts src/server/custom-format-presets.ts src/components/settings/custom-formats/preset-selector.tsx
git commit -m "refactor: update server functions for unified content type"
```

---

### Task 8: Editions & Book Components

**Files:**

- Modify: `src/lib/editions.ts` (~line 80)
- Modify: `src/components/bookshelf/books/edition-selection-modal.tsx` (~lines 94, 124)
- Modify: `src/components/bookshelf/books/profile-edition-card.tsx` (~line 29)
- Modify: `src/routes/_authed/bookshelf/books/$bookId.tsx` (~line 104)
- Modify: `src/components/bookshelf/books/editions-tab.tsx` (~lines 95, 103, 111)

- [ ] **Step 1: Update editions.ts profile type**

Change the profile parameter type at line 80:

```typescript
  profile: { language: string; contentType: "ebook" | "audiobook" },
```

Update the filter call at line 87:

```typescript
const formatMatched = editions.filter((e) =>
  matchesProfileFormat(
    e.format,
    profile.contentType === "audiobook" ? "audio" : "ebook",
  ),
);
```

Note: `matchesProfileFormat` is a helper that checks format compatibility. If it accepts `"ebook" | "audio"`, we derive from `contentType`.

- [ ] **Step 2: Update edition-selection-modal.tsx and editions-tab.tsx**

Replace all `profile.mediaType` references with the equivalent derived from `profile.contentType`. For example:

```typescript
// edition-selection-modal.tsx line 94
matchesProfileFormat(item.format, profile.contentType === "audiobook" ? "audio" : "ebook"),

// editions-tab.tsx lines 95, 103, 111
mediaType: (profile.contentType === "audiobook" ? "audio" : "ebook") as "ebook" | "audio",
```

Or introduce a small helper if this pattern repeats:

```typescript
function profileMediaType(contentType: string): "ebook" | "audio" {
  return contentType === "audiobook" ? "audio" : "ebook";
}
```

- [ ] **Step 3: Update profile-edition-card.tsx and $bookId.tsx**

In `src/components/bookshelf/books/profile-edition-card.tsx` (~line 29), change the type from `mediaType: "ebook" | "audio"` to `contentType: "ebook" | "audiobook"` and update all references.

In `src/routes/_authed/bookshelf/books/$bookId.tsx` (~line 104), change `mediaType: p.mediaType` to `contentType: p.contentType`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/editions.ts src/components/bookshelf/books/edition-selection-modal.tsx src/components/bookshelf/books/editions-tab.tsx src/components/bookshelf/books/profile-edition-card.tsx src/routes/_authed/bookshelf/books/\$bookId.tsx
git commit -m "refactor: update edition components for unified content type"
```

---

### Task 9: Settings Page — Custom Formats Card

**Files:**

- Modify: `src/routes/_authed/settings/index.tsx`

- [ ] **Step 1: Add Custom Formats card to settings grid**

Add `Wand2` (or `ListFilter`) import from lucide-react and add entry to `settingsItems` array after the "Formats" entry:

```typescript
import {
  Settings,
  Sliders,
  FileType,
  Download,
  HardDrive,
  Radar,
  FileText,
  ListFilter,
} from "lucide-react";

// In settingsItems array, after "Formats":
  {
    title: "Custom Formats",
    to: "/settings/custom-formats" as const,
    icon: ListFilter,
    description: "Custom scoring rules for release quality and preferences.",
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/_authed/settings/index.tsx
git commit -m "feat: add Custom Formats card to settings page"
```

---

### Task 10: Formats Page — Tabs, Defaults, Content Type Column

**Files:**

- Modify: `src/routes/_authed/settings/formats.tsx`
- Modify: `src/components/settings/download-formats/download-format-list.tsx`
- Modify: `src/components/settings/download-formats/download-format-form.tsx`

- [ ] **Step 1: Rewrite DefaultsSection to support all four content types**

Replace the `DefaultsSection` component in `formats.tsx`:

```typescript
function DefaultsSection({
  contentType,
  settingsMap,
  onUpdate,
}: {
  contentType: "ebook" | "audiobook" | "movie" | "tv";
  settingsMap: Record<string, unknown>;
  onUpdate: (key: string, value: number) => void;
}) {
  if (contentType === "ebook") {
    const val = Number(settingsMap["format.ebook.defaultPageCount"] ?? 300);
    return (
      <div className="mb-4 rounded-lg border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-2">Size Calculation Defaults</h4>
        <div className="flex items-center gap-3">
          <Label htmlFor="defaultPageCount" className="text-sm text-muted-foreground">
            Default Page Count
          </Label>
          <Input
            id="defaultPageCount"
            type="number"
            className="w-20 h-8"
            defaultValue={val}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v > 0 && v !== val) onUpdate("format.ebook.defaultPageCount", v);
            }}
          />
          <span className="text-xs text-muted-foreground">pages</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Used when an edition&apos;s page count is unavailable
        </p>
      </div>
    );
  }

  if (contentType === "audiobook") {
    const val = Number(settingsMap["format.audiobook.defaultDuration"] ?? 600);
    const hours = Math.round((val / 60) * 10) / 10;
    return (
      <div className="mb-4 rounded-lg border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-2">Size Calculation Defaults</h4>
        <div className="flex items-center gap-3">
          <Label htmlFor="defaultAudioDuration" className="text-sm text-muted-foreground">
            Default Audio Duration
          </Label>
          <Input
            id="defaultAudioDuration"
            type="number"
            className="w-20 h-8"
            defaultValue={val}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v > 0 && v !== val) onUpdate("format.audiobook.defaultDuration", v);
            }}
          />
          <span className="text-xs text-muted-foreground">minutes ({hours} hours)</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Used when an edition&apos;s audio duration is unavailable
        </p>
      </div>
    );
  }

  if (contentType === "movie") {
    const val = Number(settingsMap["format.movie.defaultRuntime"] ?? 130);
    const hours = Math.round((val / 60) * 10) / 10;
    return (
      <div className="mb-4 rounded-lg border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-2">Size Calculation Defaults</h4>
        <div className="flex items-center gap-3">
          <Label htmlFor="defaultMovieRuntime" className="text-sm text-muted-foreground">
            Default Runtime
          </Label>
          <Input
            id="defaultMovieRuntime"
            type="number"
            className="w-20 h-8"
            defaultValue={val}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v > 0 && v !== val) onUpdate("format.movie.defaultRuntime", v);
            }}
          />
          <span className="text-xs text-muted-foreground">minutes ({hours} hours)</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Default movie runtime for file size calculations
        </p>
      </div>
    );
  }

  // tv
  const val = Number(settingsMap["format.tv.defaultEpisodeRuntime"] ?? 45);
  return (
    <div className="mb-4 rounded-lg border bg-muted/30 p-4">
      <h4 className="text-sm font-medium mb-2">Size Calculation Defaults</h4>
      <div className="flex items-center gap-3">
        <Label htmlFor="defaultTvRuntime" className="text-sm text-muted-foreground">
          Default Episode Runtime
        </Label>
        <Input
          id="defaultTvRuntime"
          type="number"
          className="w-20 h-8"
          defaultValue={val}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v > 0 && v !== val) onUpdate("format.tv.defaultEpisodeRuntime", v);
          }}
        />
        <span className="text-xs text-muted-foreground">minutes</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Default episode runtime for file size calculations
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite FormatsPage tabs and filtering**

Replace the `FormatsPage` component to use All | Movie | TV | Ebook | Audiobook tabs and filter by `contentTypes`:

```typescript
type ContentTab = "all" | "movie" | "tv" | "ebook" | "audiobook";

function FormatsPage() {
  const { data: definitions } = useSuspenseQuery(downloadFormatsListQuery());
  const { data: settingsMap } = useSuspenseQuery(settingsMapQuery());
  const queryClient = useQueryClient();

  const handleUpdateSetting = async (key: string, value: number) => {
    await updateSettingFn({ data: { key, value } });
    queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
  };

  const createDefinition = useCreateDownloadFormat();
  const updateDefinition = useUpdateDownloadFormat();
  const deleteDefinition = useDeleteDownloadFormat();

  const [activeTab, setActiveTab] = useState<ContentTab>("all");
  const [defDialogOpen, setDefDialogOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<
    (typeof definitions)[number] | undefined
  >(undefined);

  const filteredFormats = useMemo(() => {
    if (activeTab === "all") return definitions;
    return definitions.filter((d) => d.contentTypes.includes(activeTab));
  }, [definitions, activeTab]);

  // ... (keep existing handlers, update type references)

  return (
    <div>
      <PageHeader
        title="Formats"
        description="Define format types and matching rules"
        actions={
          <Button onClick={() => { setEditingDef(undefined); setDefDialogOpen(true); }}>
            Add Format
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContentTab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="movie">Movie</TabsTrigger>
          <TabsTrigger value="tv">TV</TabsTrigger>
          <TabsTrigger value="ebook">Ebook</TabsTrigger>
          <TabsTrigger value="audiobook">Audiobook</TabsTrigger>
        </TabsList>

        {/* Only show defaults for specific content type tabs, not "all" */}
        {activeTab !== "all" && (
          <DefaultsSection
            contentType={activeTab}
            settingsMap={settingsMap}
            onUpdate={handleUpdateSetting}
          />
        )}

        <DownloadFormatList
          definitions={filteredFormats}
          onEdit={handleEditDef}
          onDelete={(id) => deleteDefinition.mutate(id)}
        />
      </Tabs>

      {/* Dialog — update to pass contentTypes instead of type */}
      <Dialog open={defDialogOpen} onOpenChange={setDefDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDef ? "Edit Format" : "Add Format"}</DialogTitle>
          </DialogHeader>
          <DownloadFormatForm
            defaultContentTypes={activeTab === "all" ? ["ebook"] : [activeTab]}
            initialValues={editingDef ? {
              title: editingDef.title,
              weight: editingDef.weight,
              color: editingDef.color ?? "gray",
              minSize: editingDef.minSize ?? 0,
              maxSize: editingDef.maxSize ?? 0,
              preferredSize: editingDef.preferredSize ?? 0,
              noMaxLimit: editingDef.noMaxLimit ?? 0,
              noPreferredLimit: editingDef.noPreferredLimit ?? 0,
              contentTypes: editingDef.contentTypes,
              source: editingDef.source ?? null,
              resolution: editingDef.resolution ?? 0,
            } : undefined}
            onSubmit={editingDef ? handleUpdateDefinition : handleCreateDefinition}
            onCancel={() => setDefDialogOpen(false)}
            loading={defLoading}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Also update the `FormatValues` type to use `contentTypes: string[]` instead of `type`.

- [ ] **Step 3: Add Content Type column to download-format-list.tsx**

In `src/components/settings/download-formats/download-format-list.tsx`:

Import `CONTENT_TYPE_LABELS` from custom-format-list or define locally. Add a "Content Type" column after "Title" in the table header and body. Use colored badges matching the Custom Formats pattern:

```typescript
const CONTENT_TYPE_BADGE_CLASSES: Record<string, string> = {
  movie: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  tv: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  ebook: "bg-green-500/20 text-green-400 border-green-500/30",
  audiobook: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  movie: "Movie",
  tv: "TV",
  ebook: "Ebook",
  audiobook: "Audiobook",
};
```

Add to table header after `<TableHead>Title</TableHead>`:

```typescript
<TableHead>Content Type</TableHead>
```

Add to table body after the title cell:

```typescript
<TableCell>
  <div className="flex gap-1">
    {def.contentTypes.map((ct) => (
      <Badge
        key={ct}
        variant="outline"
        className={CONTENT_TYPE_BADGE_CLASSES[ct] ?? ""}
      >
        {CONTENT_TYPE_LABELS[ct] ?? ct}
      </Badge>
    ))}
  </div>
</TableCell>
```

Also update `sliderMaxRange`, `sliderUnit`, and `exampleSamples` to use `sizeMode(def.contentTypes)` instead of `def.type`.

- [ ] **Step 4: Update download-format-form.tsx**

Replace all `type: "ebook" | "audio" | "video"` references with `contentTypes: string[]`. The form should accept `defaultContentTypes` prop and include a content types selector (checkboxes matching the custom format form pattern). Update `DownloadFormatFormValues`, `DownloadFormatFormProps`, and the form submission logic.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authed/settings/formats.tsx src/components/settings/download-formats/download-format-list.tsx src/components/settings/download-formats/download-format-form.tsx
git commit -m "feat: formats page — unified tabs, content type column, per-tab defaults"
```

---

### Task 11: Profiles Page & Form

**Files:**

- Modify: `src/routes/_authed/settings/profiles.tsx`
- Modify: `src/components/settings/download-profiles/download-profile-list.tsx`
- Modify: `src/components/settings/download-profiles/download-profile-form.tsx`
- Modify: `src/components/settings/custom-formats/cf-score-section.tsx`

- [ ] **Step 1: Update ProfileValues type in profiles.tsx**

Remove `mediaType` from `ProfileValues`:

```typescript
type ProfileValues = {
  name: string;
  icon: string;
  rootFolderPath: string;
  cutoff: number;
  items: number[][];
  upgradeAllowed: boolean;
  categories: number[];
  contentType: string;
  language: string;
  minCustomFormatScore: number;
  upgradeUntilCustomFormatScore: number;
};
```

Remove `mediaType` from the `editingProfile` initial values object (line 166). Add tabs to the profiles page layout following the same pattern as Formats.

- [ ] **Step 2: Update download-profile-list.tsx — single Content Type column**

Remove `mediaTypeLabel` function and the "Media" column. Update `contentTypeLabel` to handle the new values:

```typescript
function contentTypeLabel(contentType: string): string {
  switch (contentType) {
    case "tv":
      return "TV";
    case "movie":
      return "Movie";
    case "ebook":
      return "Ebook";
    case "audiobook":
      return "Audiobook";
    default:
      return contentType;
  }
}
```

Use colored badges (same `CONTENT_TYPE_BADGE_CLASSES` as formats list) instead of outline badges. Remove the "Media" `<TableHead>` and `<TableCell>`. Remove `mediaType` from the `DownloadProfile` type.

- [ ] **Step 3: Rewrite ContentMediaSection in download-profile-form.tsx**

Replace `ContentMediaSection` with a single Content Type select:

```typescript
function ContentTypeSection({
  contentType,
  language,
  onContentTypeChange,
  onLanguageChange,
}: {
  contentType: string;
  language: string;
  onContentTypeChange: (v: string) => void;
  onLanguageChange: (v: string) => void;
}): JSX.Element {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="profile-content-type">Content Type</Label>
        <Select value={contentType} onValueChange={onContentTypeChange}>
          <SelectTrigger id="profile-content-type" className="w-full">
            <SelectValue placeholder="Select content type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ebook">Ebook</SelectItem>
            <SelectItem value="audiobook">Audiobook</SelectItem>
            <SelectItem value="movie">Movie</SelectItem>
            <SelectItem value="tv">TV</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Determines which formats and custom formats are available
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-language">Language</Label>
        <LanguageSingleSelect value={language} onChange={onLanguageChange} />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Update profile form state and handlers**

Remove `mediaType` state variable. Update `handleContentTypeChange`:

```typescript
const handleContentTypeChange = (newContentType: string) => {
  setContentType(newContentType);
  // Filter format items to those matching new content type
  const validIds = new Set(
    downloadFormats
      .filter((d) => d.contentTypes.includes(newContentType))
      .map((d) => d.id),
  );
  setItems((prev) =>
    prev
      .map((group) => group.filter((id) => validIds.has(id)))
      .filter((group) => group.length > 0),
  );
  setCutoff(0);
};
```

Remove `handleMediaTypeChange`. Update `filteredFormats`:

```typescript
const filteredFormats = useMemo(
  () => downloadFormats.filter((d) => d.contentTypes.includes(contentType)),
  [downloadFormats, contentType],
);
```

Update `PROFILE_DEFAULTS` — remove `mediaType`, change `contentType` default:

```typescript
const PROFILE_DEFAULTS: ProfileDefaults = {
  name: "",
  icon: "book-open",
  rootFolderPath: "",
  upgradeAllowed: false,
  cutoff: 0,
  categories: [],
  contentType: "ebook",
  language: "en",
  minCustomFormatScore: 0,
  upgradeUntilCustomFormatScore: 0,
};
```

Update the form submission to omit `mediaType` from the payload.

Also remove the `isBookContent = contentType === "book"` guard (line 478) and all code that depended on it (the `isBookContent` variable controlled the media type selector and its disabled state — both are gone now since there's only one Content Type select). Remove the `handleMediaTypeChange` function entirely.

- [ ] **Step 5: Simplify cf-score-section.tsx**

Remove `getCFContentType` function. The component receives `contentType` directly which now matches CF content types. Update props:

```typescript
type CFScoreSectionProps = {
  profileId?: number;
  contentType: string; // "movie" | "tv" | "ebook" | "audiobook" — matches CF contentTypes directly
  minCustomFormatScore: number;
  upgradeUntilCustomFormatScore: number;
  onMinScoreChange: (score: number) => void;
  onUpgradeUntilScoreChange: (score: number) => void;
  localScores?: Array<{ customFormatId: number; score: number }>;
  onLocalScoresChange?: (
    scores: Array<{ customFormatId: number; score: number }>,
  ) => void;
};
```

Remove `mediaType` prop. Use `contentType` directly for filtering CFs:

```typescript
const filteredCFs = useMemo(() => {
  return allCustomFormats.filter(
    (cf) =>
      Array.isArray(cf.contentTypes) && cf.contentTypes.includes(contentType),
  );
}, [allCustomFormats, contentType]);
```

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authed/settings/profiles.tsx src/components/settings/download-profiles/download-profile-list.tsx src/components/settings/download-profiles/download-profile-form.tsx src/components/settings/custom-formats/cf-score-section.tsx
git commit -m "feat: profiles page — unified content type, single select, tabs"
```

---

### Task 12: Author & Content Filtering

**Files:**

- Modify: `src/routes/_authed/bookshelf/authors/$authorId.tsx` (~line 1317)
- Modify: `src/components/bookshelf/hardcover/book-preview-modal.tsx` (~line 45)
- Modify: `src/components/bookshelf/hardcover/author-preview-modal.tsx` (~line 46)
- Modify: `src/routes/_authed/settings/media-management.tsx` (~line 621)

- [ ] **Step 1: Update all `contentType === "book"` filters to `["ebook", "audiobook"]`**

For each file, find the profile filtering line and update:

```typescript
// Before:
downloadProfiles.filter((p) => p.contentType === "book");

// After:
downloadProfiles.filter(
  (p) => p.contentType === "ebook" || p.contentType === "audiobook",
);
```

For `media-management.tsx` (line 621), update the `contentType` check to handle both ebook and audiobook:

```typescript
// Before:
if (profile.rootFolderPath && profile.contentType === contentType)

// After — the ContentType in media-management may also need updating to use the new enum
```

Note: The `contentType === "tv"` and `contentType === "movie"` filters in show/movie components should already work since those values haven't changed.

- [ ] **Step 2: Commit**

```bash
git add src/routes/_authed/bookshelf/authors/$authorId.tsx src/components/bookshelf/hardcover/book-preview-modal.tsx src/components/bookshelf/hardcover/author-preview-modal.tsx src/routes/_authed/settings/media-management.tsx
git commit -m "refactor: update profile filtering — book to ebook|audiobook"
```

---

### Task 13: Migration — Flatten & Regenerate

**Files:**

- Delete: `data/sqlite.db`
- Delete: all files in `drizzle/` except `drizzle.config.ts` (if it exists at root)
- Regenerate: base migration via `bun run db:generate`

- [ ] **Step 1: Delete database and old migrations**

```bash
rm -f data/sqlite.db
rm -f drizzle/0000_*.sql drizzle/0001_*.sql
rm -f drizzle/meta/_journal.json drizzle/meta/0000_snapshot.json drizzle/meta/0001_snapshot.json
```

- [ ] **Step 2: Create empty journal for Drizzle Kit**

```bash
echo '{"version":"7","dialect":"sqlite","entries":[]}' > drizzle/meta/_journal.json
```

- [ ] **Step 3: Generate new flattened migration**

```bash
bun run db:generate
```

- [ ] **Step 4: Update seed data in generated migration**

Open the generated `drizzle/0000_*.sql` file and update the seed INSERT statements:

For download formats — change `type` column references to `content_types`:

- Ebook formats: `content_types = '["ebook"]'`
- Audio formats: `content_types = '["audiobook"]'`
- Video formats: `content_types = '["movie","tv"]'`

For download profiles — change to single `content_type`:

- Ebook profiles: `content_type = 'ebook'`
- Audiobook profiles: `content_type = 'audiobook'`
- Movie profiles: `content_type = 'movie'`
- TV profiles: `content_type = 'tv'`

For settings — update keys:

- `format.defaultPageCount` → `format.ebook.defaultPageCount`
- `format.defaultAudioDuration` → `format.audiobook.defaultDuration`
- Add: `format.movie.defaultRuntime` with value `130`
- Add: `format.tv.defaultEpisodeRuntime` with value `45`

- [ ] **Step 5: Run migration to create fresh DB**

```bash
bun run db:migrate
```

- [ ] **Step 6: Verify the database**

```bash
bun run db:studio
```

Check:

- `download_formats` table has `content_types` column with JSON arrays
- `download_profiles` table has single `content_type` column, no `type` column
- `settings` table has the new key names

- [ ] **Step 7: Commit**

```bash
git add drizzle/ data/
git commit -m "feat: flatten migration for unified content type schema"
```

---

### Task 14: Smoke Test & Fix Remaining References

- [ ] **Step 1: Start dev server**

```bash
bun run dev
```

- [ ] **Step 2: Test each settings page**

Navigate to:

1. `/settings` — verify Custom Formats card appears
2. `/settings/formats` — verify new tabs, content type badges, defaults sections
3. `/settings/profiles` — verify new tabs, single Content Type column
4. Click "Add Profile" — verify single Content Type dropdown
5. `/settings/custom-formats` — verify still works (should be unchanged)

- [ ] **Step 3: Grep for remaining old references**

```bash
grep -rn 'mediaType\|"audio"\|"video"\|"book"' src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.gen.ts'
```

Fix any remaining references to old type values. Be careful to distinguish:

- `"audio"` as a content type (should be `"audiobook"`) vs. `"audio"` as an audio format string in file-import or media probing (leave those)
- `"video"` as a format type (update) vs. video in media management (may be different)
- `"book"` as content type (update) vs. "book" as a general noun (leave)

- [ ] **Step 4: Fix and commit any remaining issues**

```bash
git add -A
git commit -m "fix: resolve remaining old content type references"
```

---

### Task 15: Final Build Verification

- [ ] **Step 1: Run production build**

```bash
bun run build
```

- [ ] **Step 2: Fix any TypeScript errors and commit**

If the build fails, fix type errors and commit:

```bash
git add -A
git commit -m "fix: resolve TypeScript errors from content type unification"
```
