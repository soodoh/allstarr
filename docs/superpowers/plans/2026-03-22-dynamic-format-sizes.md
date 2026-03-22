# Dynamic File Format Sizing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static flat-MB size limits on download formats with rate-based dynamic sizing — MB/100 pages for ebooks, kbps for audiobooks — with configurable default dimensions as fallbacks.

**Architecture:** Reinterpret existing `minSize`/`maxSize`/`preferredSize` columns as rate values (no schema changes). Add two settings (`defaultPageCount`, `defaultAudioDuration`) for fallback dimensions. Update the size checking logic in `format-parser.ts` to compute effective MB per call using edition metadata. Update the formats settings UI with rate labels, example size tables, and per-tab default dimension inputs.

**Tech Stack:** TypeScript, React, Drizzle ORM, SQLite, TanStack Router/Query, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-22-dynamic-format-sizes-design.md`

---

### Task 1: Migration — Update format size values and add default settings

**Files:**

- Create: `drizzle/0006_dynamic_format_sizes.sql`
- Modify: `drizzle/0000_puzzling_scarlet_spider.sql:305-314` (seed defaults)

- [ ] **Step 1: Create migration file**

Create `drizzle/0006_dynamic_format_sizes.sql`:

```sql
-- Convert ebook format sizes from flat MB to MB/100 pages
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 1.5, `max_size` = 15 WHERE `title` = 'EPUB';
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 2, `max_size` = 15 WHERE `title` = 'MOBI';
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 2, `max_size` = 15 WHERE `title` = 'AZW3';
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 5, `max_size` = 50 WHERE `title` = 'PDF';

-- Convert audiobook format sizes from flat MB to kbps
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 195, `max_size` = 350 WHERE `title` = 'MP3';
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 195, `max_size` = 350 WHERE `title` = 'M4B';
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 895, `max_size` = 0 WHERE `title` = 'FLAC';

-- Add default dimension settings for fallback calculations
INSERT OR IGNORE INTO `settings` (`key`, `value`) VALUES ('format.defaultPageCount', '300');
INSERT OR IGNORE INTO `settings` (`key`, `value`) VALUES ('format.defaultAudioDuration', '600');
```

- [ ] **Step 2: Update seed SQL**

In `drizzle/0000_puzzling_scarlet_spider.sql`, update the download_formats INSERT (around line 305) to use the new rate-based defaults. Change the values to match the migration:

```sql
INSERT INTO `quality_definitions` (`title`, `weight`, `min_size`, `max_size`, `preferred_size`, `color`, `specifications`, `type`) VALUES
	('Unknown Text', 1, 0, 0, 0, 'gray', '[]', 'ebook'),
	('PDF', 2, 0, 50, 5, 'yellow', '[{"type":"releaseTitle","value":"\\bpdf\\b","negate":false,"required":true}]', 'ebook'),
	('MOBI', 3, 0, 15, 2, 'amber', '[{"type":"releaseTitle","value":"\\bmobi\\b","negate":false,"required":true}]', 'ebook'),
	('EPUB', 4, 0, 15, 1.5, 'green', '[{"type":"releaseTitle","value":"\\bepub\\b","negate":false,"required":true}]', 'ebook'),
	('AZW3', 5, 0, 15, 2, 'blue', '[{"type":"releaseTitle","value":"\\bazw3?\\b","negate":false,"required":true}]', 'ebook'),
	('MP3', 6, 0, 350, 195, 'orange', '[{"type":"releaseTitle","value":"\\bmp3\\b","negate":false,"required":true}]', 'audiobook'),
	('M4B', 7, 0, 350, 195, 'cyan', '[{"type":"releaseTitle","value":"\\bm4b\\b","negate":false,"required":true}]', 'audiobook'),
	('FLAC', 8, 0, 0, 895, 'purple', '[{"type":"releaseTitle","value":"\\bflac\\b","negate":false,"required":true}]', 'audiobook'),
	('Unknown Audio', 1, 0, 0, 0, 'gray', '[]', 'audiobook');
```

Also add the default settings seed at the end of the settings INSERT block:

```sql
INSERT OR IGNORE INTO `settings` (`key`, `value`) VALUES ('format.defaultPageCount', '300');
INSERT OR IGNORE INTO `settings` (`key`, `value`) VALUES ('format.defaultAudioDuration', '600');
```

- [ ] **Step 3: Run migration**

Run: `bun run db:migrate`
Expected: Migration applies successfully, existing format rows updated with new values.

- [ ] **Step 4: Verify migration**

Run: `bun run db:studio`
Check `download_formats` table — EPUB should show `min_size=0, preferred_size=1.5, max_size=15`. MP3 should show `min_size=0, preferred_size=195, max_size=350`. Check `settings` table has `format.defaultPageCount=300` and `format.defaultAudioDuration=600`.

- [ ] **Step 5: Commit**

```bash
git add drizzle/0006_dynamic_format_sizes.sql drizzle/0000_puzzling_scarlet_spider.sql
git commit -m "feat: migrate format sizes to rate-based values (MB/100pg, kbps)"
```

---

### Task 2: Size calculation utility

**Files:**

- Create: `src/lib/format-size-calc.ts`

This utility module centralizes the rate-to-MB conversion logic so it can be shared between the server-side rejection code and the UI example table.

- [ ] **Step 1: Create the utility module**

Create `src/lib/format-size-calc.ts`:

```typescript
/**
 * Convert rate-based format size limits to effective MB values.
 *
 * Ebook rates are in MB per 100 pages.
 * Audiobook rates are in kbps (kilobits/sec, binary convention: 1 kbit = 1024 bits).
 */

export type EditionMeta = {
  pageCount?: number | null;
  audioLength?: number | null; // in minutes
};

export type EffectiveSizeLimits = {
  minSize: number; // MB
  maxSize: number; // MB (0 = unlimited)
  preferredSize: number; // MB
};

const DEFAULT_PAGE_COUNT = 300;
const DEFAULT_AUDIO_DURATION = 600; // minutes

/**
 * Compute effective MB size limits from rate values.
 *
 * @param type - "ebook" or "audiobook"
 * @param minRate - rate value (MB/100pg for ebook, kbps for audiobook)
 * @param maxRate - rate value
 * @param preferredRate - rate value
 * @param editionMeta - optional edition metadata (pageCount, audioLength)
 * @param defaults - optional override for default dimensions
 */
export function computeEffectiveSizes(
  type: "ebook" | "audiobook",
  minRate: number,
  maxRate: number,
  preferredRate: number,
  editionMeta?: EditionMeta | null,
  defaults?: { defaultPageCount?: number; defaultAudioDuration?: number },
): EffectiveSizeLimits {
  if (type === "ebook") {
    const pages =
      editionMeta?.pageCount ??
      defaults?.defaultPageCount ??
      DEFAULT_PAGE_COUNT;
    return {
      minSize: minRate * (pages / 100),
      maxSize: maxRate === 0 ? 0 : maxRate * (pages / 100),
      preferredSize: preferredRate * (pages / 100),
    };
  }

  // audiobook: kbps → MB
  const durationMin =
    editionMeta?.audioLength ??
    defaults?.defaultAudioDuration ??
    DEFAULT_AUDIO_DURATION;
  const durationSec = durationMin * 60;

  return {
    minSize: (minRate * 128 * durationSec) / (1024 * 1024),
    maxSize: maxRate === 0 ? 0 : (maxRate * 128 * durationSec) / (1024 * 1024),
    preferredSize: (preferredRate * 128 * durationSec) / (1024 * 1024),
  };
}

/** Format a size in MB as a human-readable string (e.g., "45 MB", "1.5 GB", "No limit") */
export function formatEffectiveSize(mb: number): string {
  if (mb === 0) return "No limit";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/format-size-calc.ts
git commit -m "feat: add format size calculation utility for rate-to-MB conversion"
```

---

### Task 3: Update server-side size checking in format-parser.ts

**Files:**

- Modify: `src/server/indexers/format-parser.ts:14-81`

- [ ] **Step 1: Update the cached type to include format type**

In `src/server/indexers/format-parser.ts`, update the `sizeLimitsCache` to store raw rates and type instead of flat MB values. Replace the type and the cache population logic (lines 22-81):

Change the cache type from:

```typescript
let sizeLimitsCache: Map<number, { minSize: number; maxSize: number }> | null =
  null;
```

to:

```typescript
let sizeLimitsCache: Map<
  number,
  { minSize: number; maxSize: number; type: string }
> | null = null;
let cachedDefaults: {
  defaultPageCount: number;
  defaultAudioDuration: number;
} | null = null;
```

Also update `invalidateFormatDefCache` to clear the new cache:

```typescript
export function invalidateFormatDefCache(): void {
  cachedDefs = null;
  sizeLimitsCache = null;
  cachedDefaults = null;
}
```

- [ ] **Step 2: Update getDefSizeLimits to accept edition metadata and compute dynamic sizes**

Replace the `getDefSizeLimits` function (lines 63-81) with:

```typescript
import {
  computeEffectiveSizes,
  type EditionMeta,
} from "src/lib/format-size-calc";
import { settings } from "src/db/schema";
import { eq } from "drizzle-orm";

/** Get effective min/max size limits (in MB) for a format, computed from rates + edition metadata */
export function getDefSizeLimits(
  qualityId: number,
  editionMeta?: EditionMeta | null,
): { minSize: number; maxSize: number } | null {
  if (qualityId === 0) {
    return null;
  }
  if (!sizeLimitsCache) {
    const rows = db.select().from(downloadFormats).all();
    sizeLimitsCache = new Map();
    for (const r of rows) {
      sizeLimitsCache.set(r.id, {
        minSize: r.minSize ?? 0,
        maxSize: r.maxSize ?? 0,
        type: r.type,
      });
    }
  }
  const cached = sizeLimitsCache.get(qualityId);
  if (!cached) return null;

  // Cache default dimension settings (read once, cleared on invalidate)
  if (!cachedDefaults) {
    const defaultPageCountRow = db
      .select()
      .from(settings)
      .where(eq(settings.key, "format.defaultPageCount"))
      .get();
    const defaultAudioDurationRow = db
      .select()
      .from(settings)
      .where(eq(settings.key, "format.defaultAudioDuration"))
      .get();
    cachedDefaults = {
      defaultPageCount: defaultPageCountRow?.value
        ? Number(JSON.parse(String(defaultPageCountRow.value)))
        : 300,
      defaultAudioDuration: defaultAudioDurationRow?.value
        ? Number(JSON.parse(String(defaultAudioDurationRow.value)))
        : 600,
    };
  }

  const effective = computeEffectiveSizes(
    cached.type as "ebook" | "audiobook",
    cached.minSize,
    cached.maxSize,
    0, // preferredSize not needed for rejection logic
    editionMeta,
    cachedDefaults,
  );

  return { minSize: effective.minSize, maxSize: effective.maxSize };
}
```

Add the imports at the top of the file (after existing imports):

```typescript
import {
  computeEffectiveSizes,
  type EditionMeta,
} from "src/lib/format-size-calc";
import { settings } from "src/db/schema";
import { eq } from "drizzle-orm";
```

Re-export `EditionMeta` for use by callers:

```typescript
export type { EditionMeta } from "src/lib/format-size-calc";
```

Also add a `getFormatType` export for use by rejection message helpers:

```typescript
/** Get the format type for a quality ID (populates cache if needed) */
export function getFormatType(qualityId: number): string | null {
  if (!sizeLimitsCache) {
    getDefSizeLimits(qualityId);
  }
  return sizeLimitsCache?.get(qualityId)?.type ?? null;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/indexers/format-parser.ts
git commit -m "feat: compute dynamic format size limits from rates + edition metadata"
```

---

### Task 4: Thread edition metadata through release rejection logic

**Files:**

- Modify: `src/server/indexers.ts:190-268` (computeReleaseMetrics)
- Modify: `src/server/indexers.ts:426-518` (dedupeAndScoreReleases)

- [ ] **Step 1: Look up edition metadata in dedupeAndScoreReleases**

In `src/server/indexers.ts`, add an edition metadata lookup at the start of `dedupeAndScoreReleases` (after the `profiles` lookup around line 447). Import the editions table and the EditionMeta type.

Add to imports at top of file:

```typescript
import { editions, editionDownloadProfiles } from "src/db/schema";
import type { EditionMeta } from "./indexers/format-parser";
```

Inside `dedupeAndScoreReleases`, after the `profiles` lookup (around line 447), add:

```typescript
// Look up monitored edition metadata for dynamic size calculations
let editionMeta: EditionMeta | null = null;
if (bookId) {
  const monitoredEdition = db
    .select({
      pageCount: editions.pageCount,
      audioLength: editions.audioLength,
    })
    .from(editions)
    .innerJoin(
      editionDownloadProfiles,
      eq(editionDownloadProfiles.editionId, editions.id),
    )
    .where(eq(editions.bookId, bookId))
    .limit(1)
    .get();
  if (monitoredEdition) {
    editionMeta = {
      pageCount: monitoredEdition.pageCount,
      audioLength: monitoredEdition.audioLength,
    };
  }
}
```

- [ ] **Step 2: Pass editionMeta to computeReleaseMetrics**

Update the `computeReleaseMetrics` call inside the scoring loop (around line 494):

Change:

```typescript
const metrics = computeReleaseMetrics(release, profiles);
```

To:

```typescript
const metrics = computeReleaseMetrics(release, profiles, editionMeta);
```

- [ ] **Step 3: Update computeReleaseMetrics signature and size check**

Update the `computeReleaseMetrics` function (starting at line 190):

Add `editionMeta` parameter:

```typescript
export function computeReleaseMetrics(
  release: IndexerRelease,
  profiles: ProfileInfo[] | null,
  editionMeta?: EditionMeta | null,
): {
```

Update the size limit check (around lines 211-226) to pass editionMeta:

Change:

```typescript
const sizeLimits = getDefSizeLimits(release.quality.id);
```

To:

```typescript
const sizeLimits = getDefSizeLimits(release.quality.id, editionMeta);
```

Update the rejection messages to include dimension context. Replace the rejection push blocks:

```typescript
if (sizeLimits.minSize > 0 && sizeMB < sizeLimits.minSize) {
  const context = getDimensionContext(release.quality.id, editionMeta);
  rejections.push({
    reason: "belowMinimumSize",
    message: `${release.sizeFormatted} is below minimum ${Math.round(sizeLimits.minSize)} MB for ${release.quality.name}${context}`,
  });
}
if (sizeLimits.maxSize > 0 && sizeMB > sizeLimits.maxSize) {
  const context = getDimensionContext(release.quality.id, editionMeta);
  rejections.push({
    reason: "aboveMaximumSize",
    message: `${release.sizeFormatted} is above maximum ${Math.round(sizeLimits.maxSize)} MB for ${release.quality.name}${context}`,
  });
}
```

- [ ] **Step 4: Add getDimensionContext helper**

Add this helper near `computeReleaseMetrics` in `src/server/indexers.ts`:

Import `getFormatType` from format-parser (added in Task 3):

```typescript
import {
  enrichRelease,
  matchAllFormats,
  getProfileWeight,
  getDefSizeLimits,
  getFormatType,
} from "./indexers/format-parser";
```

Then add the helper:

```typescript
/** Build a human-readable context string for rejection messages */
function getDimensionContext(
  qualityId: number,
  editionMeta?: EditionMeta | null,
): string {
  const formatType = getFormatType(qualityId);
  if (!formatType) return "";

  if (formatType === "ebook") {
    const pages = editionMeta?.pageCount;
    return pages
      ? ` (based on ${pages} pages)`
      : " (based on default page count)";
  }
  if (formatType === "audiobook") {
    const minutes = editionMeta?.audioLength;
    if (minutes) {
      const hours = Math.round((minutes / 60) * 10) / 10;
      return ` (based on ${hours}h duration)`;
    }
    return " (based on default duration)";
  }
  return "";
}
```

- [ ] **Step 5: Verify the app builds**

Run: `bun run build`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/indexers.ts src/server/indexers/format-parser.ts
git commit -m "feat: thread edition metadata through release rejection for dynamic sizing"
```

---

### Task 5: Update slider labels and add example size table in UI

**Files:**

- Modify: `src/components/settings/download-formats/download-format-list.tsx`

- [ ] **Step 1: Update SizeSlider labels to show rate units**

In `src/components/settings/download-formats/download-format-list.tsx`, update the `SizeSlider` component (lines 29-90).

Change the max range display label (line 86) from `{values[2]} MB` to show the correct unit:

```tsx
<span className="text-xs text-muted-foreground w-16 tabular-nums">
  {values[2]} {def.type === "audiobook" ? "kbps" : "MB/100pg"}
</span>
```

Also update the table header (line 113) from "Size Limit" to be dynamic. Pass the format type into the list component or just use a generic label:

```tsx
<TableHead>Size Limit</TableHead>
```

This can stay generic since the unit is shown on each slider.

- [ ] **Step 2: Add example size table below slider**

Add an `ExampleSizes` component below the slider in the `SizeSlider` component. Import `computeEffectiveSizes` and `formatEffectiveSize` from `src/lib/format-size-calc`:

```tsx
import {
  computeEffectiveSizes,
  formatEffectiveSize,
} from "src/lib/format-size-calc";
```

Add this component after the `SizeSlider` function:

```tsx
function ExampleSizes({ def }: { def: DownloadFormat }): JSX.Element | null {
  if (def.title.startsWith("Unknown")) return null;

  const samples =
    def.type === "audiobook"
      ? [
          { label: "5 hr", meta: { audioLength: 300 } },
          { label: "10 hr", meta: { audioLength: 600 } },
          { label: "20 hr", meta: { audioLength: 1200 } },
        ]
      : [
          { label: "200 pg", meta: { pageCount: 200 } },
          { label: "400 pg", meta: { pageCount: 400 } },
          { label: "800 pg", meta: { pageCount: 800 } },
        ];

  return (
    <div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
      {samples.map((s) => {
        const eff = computeEffectiveSizes(
          def.type as "ebook" | "audiobook",
          def.minSize ?? 0,
          def.maxSize ?? 0,
          def.preferredSize ?? 0,
          s.meta,
        );
        return (
          <span key={s.label}>
            <span className="font-medium text-foreground/70">{s.label}:</span>{" "}
            {formatEffectiveSize(eff.minSize)} –{" "}
            {formatEffectiveSize(eff.maxSize)}
          </span>
        );
      })}
    </div>
  );
}
```

Then render it inside the `SizeSlider` return, below the slider div:

```tsx
return (
  <div>
    <div className="flex items-center gap-3 min-w-[250px]">
      {/* existing slider content */}
    </div>
    <ExampleSizes def={def} />
  </div>
);
```

- [ ] **Step 3: Verify in browser**

Run: `bun run dev`
Navigate to Settings > Formats. Verify:

- Ebook tab shows "MB/100pg" labels
- Audiobook tab shows "kbps" labels
- Example sizes appear below each format (e.g., EPUB: "200 pg: 0 MB – 30 MB")

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/download-formats/download-format-list.tsx
git commit -m "feat: update format slider labels to rate units with example size table"
```

---

### Task 6: Add per-tab default dimension settings inputs

**Files:**

- Modify: `src/routes/_authed/settings/formats.tsx`

- [ ] **Step 1: Add settings query and mutation to the formats page**

In `src/routes/_authed/settings/formats.tsx`, add imports and loader pre-fetch for settings:

Add to imports:

```tsx
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { settingsMapQuery } from "src/lib/queries";
import { updateSettingFn } from "src/server/settings";
import { queryKeys } from "src/lib/query-keys";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
```

Update the loader (line 28-30) to also fetch settings:

```tsx
loader: async ({ context }) => {
  await Promise.all([
    context.queryClient.ensureQueryData(downloadFormatsListQuery()),
    context.queryClient.ensureQueryData(settingsMapQuery()),
  ]);
},
```

- [ ] **Step 2: Add settings state and handlers**

Inside the `FormatsPage` component, add settings query and state:

```tsx
const { data: settingsMap } = useSuspenseQuery(settingsMapQuery());
const queryClient = useQueryClient();

const defaultPageCount = Number(settingsMap["format.defaultPageCount"] ?? 300);
const defaultAudioDuration = Number(
  settingsMap["format.defaultAudioDuration"] ?? 600,
);

const handleUpdateSetting = async (key: string, value: number) => {
  await updateSettingFn({ data: { key, value } });
  queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
};
```

- [ ] **Step 3: Add DefaultsSection component**

Create an inline component for the defaults section:

```tsx
function DefaultsSection({
  type,
  defaultPageCount,
  defaultAudioDuration,
  onUpdate,
}: {
  type: "ebook" | "audiobook";
  defaultPageCount: number;
  defaultAudioDuration: number;
  onUpdate: (key: string, value: number) => void;
}) {
  if (type === "ebook") {
    return (
      <div className="mb-4 rounded-lg border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-2">Size Calculation Defaults</h4>
        <div className="flex items-center gap-3">
          <Label
            htmlFor="defaultPageCount"
            className="text-sm text-muted-foreground"
          >
            Default Page Count
          </Label>
          <Input
            id="defaultPageCount"
            type="number"
            className="w-20 h-8"
            defaultValue={defaultPageCount}
            onBlur={(e) => {
              const val = Number(e.target.value);
              if (val > 0 && val !== defaultPageCount) {
                onUpdate("format.defaultPageCount", val);
              }
            }}
          />
          <span className="text-xs text-muted-foreground">pages</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Used when an edition's page count is unavailable
        </p>
      </div>
    );
  }

  const hours = Math.round((defaultAudioDuration / 60) * 10) / 10;
  return (
    <div className="mb-4 rounded-lg border bg-muted/30 p-4">
      <h4 className="text-sm font-medium mb-2">Size Calculation Defaults</h4>
      <div className="flex items-center gap-3">
        <Label
          htmlFor="defaultAudioDuration"
          className="text-sm text-muted-foreground"
        >
          Default Audio Duration
        </Label>
        <Input
          id="defaultAudioDuration"
          type="number"
          className="w-20 h-8"
          defaultValue={defaultAudioDuration}
          onBlur={(e) => {
            const val = Number(e.target.value);
            if (val > 0 && val !== defaultAudioDuration) {
              onUpdate("format.defaultAudioDuration", val);
            }
          }}
        />
        <span className="text-xs text-muted-foreground">
          minutes ({hours} hours)
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Used when an edition's audio duration is unavailable
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Render DefaultsSection above format lists in each tab**

Update the TabsContent sections (around lines 127-140):

```tsx
<TabsContent value="ebook">
  <DefaultsSection
    type="ebook"
    defaultPageCount={defaultPageCount}
    defaultAudioDuration={defaultAudioDuration}
    onUpdate={handleUpdateSetting}
  />
  <DownloadFormatList
    definitions={ebookFormats}
    onEdit={handleEditDef}
    onDelete={(id) => deleteDefinition.mutate(id)}
  />
</TabsContent>
<TabsContent value="audiobook">
  <DefaultsSection
    type="audiobook"
    defaultPageCount={defaultPageCount}
    defaultAudioDuration={defaultAudioDuration}
    onUpdate={handleUpdateSetting}
  />
  <DownloadFormatList
    definitions={audiobookFormats}
    onEdit={handleEditDef}
    onDelete={(id) => deleteDefinition.mutate(id)}
  />
</TabsContent>
```

- [ ] **Step 5: Verify in browser**

Run: `bun run dev`
Navigate to Settings > Formats. Verify:

- Ebook tab shows "Size Calculation Defaults" section with "Default Page Count" input (300)
- Audiobook tab shows "Default Audio Duration" input (600 minutes / 10 hours)
- Changing the value and blurring saves to DB

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authed/settings/formats.tsx
git commit -m "feat: add per-tab default dimension settings for format size calculations"
```

---

### Task 7: Update slider max range for new units

**Files:**

- Modify: `src/components/settings/download-formats/download-format-list.tsx:30`

- [ ] **Step 1: Update maxRange for audiobook kbps scale**

The current `maxRange` is 5000 for audiobooks (was for flat MB). For kbps, 1500 is a better max (matches Readarr's UI max). Update line 30:

```typescript
const maxRange = def.type === "audiobook" ? 1500 : 100;
```

The ebook max changes from 500 (flat MB) to 100 (MB/100pg) since rates are much smaller numbers. 100 MB/100pg for an 800-page book would allow up to 800 MB — generous upper bound.

- [ ] **Step 2: Update slider step for ebook fractional values**

The current slider uses `step={1}` (line 79). For ebook rates like 1.5 MB/100pg, users need fractional precision. Update the step to be type-dependent:

```tsx
<Slider
  min={0}
  max={maxRange}
  step={def.type === "audiobook" ? 1 : 0.5}
  value={values}
  onValueChange={handleChange}
  onValueCommit={handleCommit}
  className="flex-1"
/>
```

- [ ] **Step 3: Verify slider range feels right in browser**

Run: `bun run dev`
Check that the slider for EPUB (max 15 MB/100pg) feels proportional on a 0-100 range, and MP3 (max 350 kbps) feels proportional on a 0-1500 range.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/download-formats/download-format-list.tsx
git commit -m "feat: adjust slider max ranges and step for rate-based units (kbps, MB/100pg)"
```

---

### Task 8: Build verification and final cleanup

**Files:**

- All modified files

- [ ] **Step 1: Run full build**

Run: `bun run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Run E2E tests**

Run: `bunx playwright test`
Expected: All existing tests pass (format size changes shouldn't affect E2E flows since they test UI interactions, not size calculations).

- [ ] **Step 3: Manual smoke test**

1. Go to Settings > Formats
2. Verify ebook tab: Default Page Count input (300), sliders show MB/100pg, example sizes visible
3. Verify audiobook tab: Default Audio Duration input (600), sliders show kbps, example sizes visible
4. Change EPUB max slider, verify example sizes update
5. Change default page count to 500, verify this persists on page reload

- [ ] **Step 4: Commit any fixes and final commit**

```bash
git add -A
git commit -m "feat: dynamic format sizing — rate-based limits with edition metadata"
```
