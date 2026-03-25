# Anime Custom Formats & Series Type Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 39 TRaSH Guides anime custom formats, an "Anime 1080p" TV download profile, series type filtering on download profiles, and a series type editor in the show edit dialog.

**Architecture:** New `seriesTypes` JSON column on download profiles enables filtering TV profiles by show series type. Preset data gets a `profileName` field to fix the seeder's 1:many contentType matching. The show edit dialog gains a series type selector with conflict resolution when changing types invalidates assigned profiles.

**Tech Stack:** TanStack Start, Drizzle ORM (SQLite), React, shadcn/ui, Zod, TRaSH Guides JSON specs

**Spec:** `docs/superpowers/specs/2026-03-25-anime-formats-design.md`

---

## File Map

| File                                       | Action | Responsibility                                                          |
| ------------------------------------------ | ------ | ----------------------------------------------------------------------- |
| `src/lib/custom-format-preset-data.ts`     | Modify | Add `profileName` to Preset type, add Anime 1080p preset with 39 CFs    |
| `src/db/schema/download-profiles.ts`       | Modify | Add `seriesTypes` JSON column                                           |
| `src/db/seed-custom-formats.ts`            | Modify | Fix preset→profile matching to use `profileName`                        |
| `src/lib/validators.ts`                    | Modify | Add `seriesTypes` to download profile validators                        |
| `src/server/download-profiles.ts`          | Verify | Likely no changes — Drizzle auto-includes new column in queries         |
| `src/server/shows.ts`                      | Modify | Add `migrateProfiles` field to updateShowFn for profile reassignment    |
| `src/lib/tmdb-validators.ts`               | Modify | Add `migrateProfiles` to updateShowSchema                               |
| `src/components/tv/tmdb-show-search.tsx`   | Modify | Filter profiles by series type in add flow                              |
| `src/components/tv/show-detail-header.tsx` | Modify | Add series type dropdown + conflict resolution UI                       |
| `src/routes/_authed/tv/index.tsx`          | Verify | Mass edit uses all TV profiles — likely no series type filtering needed |
| `drizzle/0005_*.sql`                       | Create | Migration for seriesTypes column, anime CFs, Anime 1080p profile        |

---

### Task 1: Add `profileName` to Preset type and fix seeder

**Files:**

- Modify: `src/lib/custom-format-preset-data.ts:16-25`
- Modify: `src/db/seed-custom-formats.ts:69`

- [ ] **Step 1: Add `profileName` field to Preset type**

In `src/lib/custom-format-preset-data.ts`, add `profileName` to the `Preset` type:

```ts
export type Preset = {
  name: string;
  profileName: string; // Maps to download_profiles.name for seeder matching
  description: string;
  category: string;
  contentType: string;
  customFormats: PresetCF[];
  scores: Record<string, number>;
  minCustomFormatScore: number;
  upgradeUntilCustomFormatScore: number;
};
```

Add `profileName` to each existing preset:

- `"HD Bluray + WEB"` → `profileName: "720-1080p (Movie)"`
- `"HD WEB Streaming"` → `profileName: "1080p (TV)"`
- `"Retail EPUB Preferred"` → `profileName: "Ebook"`
- `"High Bitrate M4B"` → `profileName: "Audiobook"`

- [ ] **Step 2: Fix seeder matching**

In `src/db/seed-custom-formats.ts`, change line 69 from:

```ts
const preset = PRESETS.find((p) => p.contentType === profile.contentType);
```

To:

```ts
const preset = PRESETS.find((p) => p.profileName === profile.name);
```

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: Clean build, no type errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/custom-format-preset-data.ts src/db/seed-custom-formats.ts
git commit -m "fix: match presets to profiles by profileName instead of contentType"
```

---

### Task 2: Add `seriesTypes` column to download profiles schema

**Files:**

- Modify: `src/db/schema/download-profiles.ts`
- Modify: `src/lib/validators.ts:6-32`

- [ ] **Step 1: Add seriesTypes column to schema**

In `src/db/schema/download-profiles.ts`, add after the `language` field:

```ts
seriesTypes: text("series_types", { mode: "json" })
  .$type<string[]>()
  .notNull()
  .default(["standard", "daily", "anime"]),
```

- [ ] **Step 2: Add seriesTypes to validators**

In `src/lib/validators.ts`, add `seriesTypes` to `downloadProfileBaseSchema`:

```ts
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
  seriesTypes: z
    .array(z.enum(["standard", "daily", "anime"]))
    .default(["standard", "daily", "anime"]),
  language: z.string().min(2).max(3),
  minCustomFormatScore: z.number().default(0),
  upgradeUntilCustomFormatScore: z.number().default(0),
});
```

Update both `createDownloadProfileSchema` and `updateDownloadProfileSchema` to add the TV-specific refinement. Chain an additional `.refine()` after the existing cutoff refinement:

```ts
export const createDownloadProfileSchema = downloadProfileBaseSchema
  .refine((data) => !data.upgradeAllowed || data.cutoff > 0, {
    message: "Upgrade cutoff quality is required",
    path: ["cutoff"],
  })
  .refine((data) => data.contentType !== "tv" || data.seriesTypes.length > 0, {
    message: "At least one series type is required for TV profiles",
    path: ["seriesTypes"],
  });
```

Apply the same pattern to `updateDownloadProfileSchema`.

- [ ] **Step 3: Generate migration**

Run: `bun run db:generate`

This creates the migration SQL for the new column. Rename the generated file to note its purpose.

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/download-profiles.ts src/lib/validators.ts drizzle/
git commit -m "feat: add seriesTypes column to download profiles"
```

---

### Task 3: Add all 39 anime custom formats to preset data

**Files:**

- Modify: `src/lib/custom-format-preset-data.ts`

This is the largest task — adding the "Anime 1080p" preset entry with all 39 custom format definitions. The regex patterns come from TRaSH Guides JSON files at `https://github.com/TRaSH-Guides/Guides/tree/master/docs/json/sonarr/cf/`.

- [ ] **Step 1: Add the Anime 1080p preset**

Add a new entry to the `PRESETS` array in `src/lib/custom-format-preset-data.ts`. The full specification data is documented in the design spec sections 1 and 6. Key mapping rules:

**Sonarr → Allstarr type mapping:**

- `SourceSpecification` value 6 → `{ type: "videoSource", value: "Bluray" }`
- `SourceSpecification` value 7 → `{ type: "videoSource", value: "BlurayRaw" }`
- `SourceSpecification` value 5 → `{ type: "videoSource", value: "DVD" }`
- `SourceSpecification` value 3 → `{ type: "videoSource", value: "Web" }`
- `SourceSpecification` value 4 → `{ type: "videoSource", value: "WebRip" }`
- `SourceSpecification` value 1 → `{ type: "videoSource", value: "Web" }`
- `ReleaseTitleSpecification` → `{ type: "releaseTitle", value: "<regex>" }`
- `ReleaseGroupSpecification` → `{ type: "releaseGroup", value: "<regex>" }`
- `LanguageSpecification` → `{ type: "language", value: "<lang>" }`

**Preset structure:**

```ts
{
  name: "Anime 1080p",
  profileName: "Anime 1080p",
  description: "TRaSH Guides anime profile. Prefers high-quality fansub groups for Bluray and WEB sources with dual audio detection.",
  category: "Video - TV",
  contentType: "tv",
  customFormats: [
    // 8 Anime BD Tiers (each with videoSource + releaseTitle specs)
    // 6 Anime Web Tiers (each with videoSource + releaseTitle specs)
    // 2 Remux Tiers (releaseGroup + videoSource specs)
    // 4 Penalty formats (releaseTitle specs)
    // 5 Version formats (releaseTitle specs)
    // 3 Quality indicators (releaseTitle + language specs)
    // 11 Streaming services (releaseTitle + videoSource specs)
  ],
  scores: {
    "Anime BD Tier 01": 1400,
    "Anime BD Tier 02": 1300,
    "Anime BD Tier 03": 1200,
    "Anime BD Tier 04": 1100,
    "Anime BD Tier 05": 1000,
    "Anime BD Tier 06": 900,
    "Anime BD Tier 07": 800,
    "Anime BD Tier 08": 700,
    "Anime Web Tier 01": 600,
    "Anime Web Tier 02": 500,
    "Anime Web Tier 03": 400,
    "Anime Web Tier 04": 300,
    "Anime Web Tier 05": 200,
    "Anime Web Tier 06": 100,
    "Remux Tier 01": 975,
    "Remux Tier 02": 950,
    "Anime Raws": -10_000,
    "Anime LQ Groups": -10_000,
    "AV1": -10_000,
    "Dubs Only": -10_000,
    "v0": -51,
    "v1": 1,
    "v2": 2,
    "v3": 3,
    "v4": 4,
    "10bit": 0,
    "Anime Dual Audio": 0,
    "Uncensored": 0,
    "CR": 6,
    "DSNP": 5,
    "NF": 4,
    "AMZN": 3,
    "VRV": 3,
    "FUNi": 2,
    "ABEMA": 1,
    "ADN": 1,
    "B-Global": 0,
    "Bilibili": 0,
    "HIDIVE": 0,
  },
  minCustomFormatScore: 0,
  upgradeUntilCustomFormatScore: 10_000,
}
```

Each custom format within `customFormats` array must include the full `specifications` array with all regex patterns from TRaSH. Fetch each JSON file from the TRaSH Guides repo and translate specs using the mapping above. For the large formats (Anime LQ Groups ~264 specs, Anime Raws ~22 specs), include ALL patterns.

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: Clean build, no type errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/custom-format-preset-data.ts
git commit -m "feat: add 39 TRaSH anime custom formats to preset data"
```

---

### Task 4: Write the migration

**Files:**

- Create: `drizzle/0005_*.sql` (Drizzle-generated name after `db:generate` in Task 2)

The Task 2 migration only adds the `series_types` column. This task adds the data migration as a hand-written SQL appended to that migration file, OR as a separate migration file. The data migration must:

- [ ] **Step 1: Update existing TV profiles' seriesTypes**

Append to the migration file:

```sql
-- Set existing TV profiles to standard+daily only
UPDATE download_profiles SET series_types = '["standard","daily"]'
  WHERE content_type = 'tv';
```

- [ ] **Step 2: Insert the Anime 1080p download profile**

```sql
-- Insert Anime 1080p profile
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, icon, categories, content_type, language, series_types, min_custom_format_score, upgrade_until_custom_format_score)
VALUES ('Anime 1080p', './data/anime/1080p', 0, '[]', 1, 'tv', '[5070]', 'tv', 'en', '["anime"]', 0, 10000);

-- Set quality items for Anime 1080p profile
UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'Remux-1080p' AND content_types LIKE '%"movie"%' LIMIT 1),
  items = json_array(
    json_array(
      (SELECT id FROM download_formats WHERE title = 'Remux-1080p'  AND content_types LIKE '%"movie"%' LIMIT 1),
      (SELECT id FROM download_formats WHERE title = 'Bluray-1080p' AND content_types LIKE '%"movie"%' LIMIT 1)
    ),
    json_array(
      (SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'  AND content_types LIKE '%"movie"%' LIMIT 1),
      (SELECT id FROM download_formats WHERE title = 'WEBRip-1080p' AND content_types LIKE '%"movie"%' LIMIT 1),
      (SELECT id FROM download_formats WHERE title = 'HDTV-1080p'   AND content_types LIKE '%"movie"%' LIMIT 1)
    ),
    json_array(
      (SELECT id FROM download_formats WHERE title = 'WEBDL-720p'  AND content_types LIKE '%"movie"%' LIMIT 1),
      (SELECT id FROM download_formats WHERE title = 'WEBRip-720p' AND content_types LIKE '%"movie"%' LIMIT 1),
      (SELECT id FROM download_formats WHERE title = 'HDTV-720p'   AND content_types LIKE '%"movie"%' LIMIT 1)
    )
  )
WHERE name = 'Anime 1080p';
```

Note: Video download formats have `content_types LIKE '%"movie"%'` because they were seeded with `["movie","tv"]` in the initial migration. The `LIKE '%"movie"%'` pattern works for matching.

- [ ] **Step 3: Insert all 39 custom formats**

Insert each of the 39 custom formats. Use the specifications JSON from the preset data. Example for a simple format:

```sql
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('AV1', 'Unwanted', '[{"name":"AV1","type":"releaseTitle","value":"\\bAV1\\b","negate":false,"required":true}]', -10000, '["tv"]', 'AV1 codec releases', 'builtin', 0);
```

Repeat for all 39 formats. Use `INSERT OR IGNORE` or check for existence to be idempotent.

- [ ] **Step 4: Insert profile-custom-format links**

Link all 39 CFs to the Anime 1080p profile with their scores:

```sql
INSERT INTO profile_custom_formats (profile_id, custom_format_id, score)
SELECT
  (SELECT id FROM download_profiles WHERE name = 'Anime 1080p'),
  cf.id,
  CASE cf.name
    WHEN 'Anime BD Tier 01' THEN 1400
    WHEN 'Anime BD Tier 02' THEN 1300
    -- ... all 39 mappings
    WHEN 'HIDIVE' THEN 0
  END
FROM custom_formats cf
WHERE cf.name IN ('Anime BD Tier 01', 'Anime BD Tier 02', /* ... all 39 names */);
```

- [ ] **Step 5: Run migration**

Run: `bun run db:migrate`
Expected: Migration applies successfully

- [ ] **Step 6: Verify data**

Run: `bun run db:studio`
Check:

- `download_profiles` table has "Anime 1080p" with `series_types = ["anime"]`
- `download_profiles` table has "1080p (TV)" with `series_types = ["standard","daily"]`
- `custom_formats` table has 39 new anime entries with `origin = "builtin"`
- `profile_custom_formats` has 39 rows linking to the Anime 1080p profile

- [ ] **Step 7: Commit**

```bash
git add drizzle/
git commit -m "feat: add anime custom formats migration and Anime 1080p profile"
```

---

### Task 5: Filter profiles by series type in add flow

**Files:**

- Modify: `src/components/tv/tmdb-show-search.tsx:87-104`

- [ ] **Step 1: Filter tvProfiles by series type**

In `src/components/tv/tmdb-show-search.tsx`, update the `tvProfiles` memo to also filter by series type. The `seriesType` state variable already exists (line 94):

```ts
const tvProfiles = useMemo(
  () =>
    allProfiles.filter(
      (p) =>
        p.contentType === "tv" &&
        (p.seriesTypes as string[]).includes(seriesType),
    ),
  [allProfiles, seriesType],
);
```

- [ ] **Step 2: Reset selected profiles when series type changes**

Add a `useEffect` that clears selected profiles when `seriesType` changes and re-selects all matching profiles:

```ts
useEffect(() => {
  if (tvProfiles.length > 0) {
    setDownloadProfileIds(tvProfiles.map((p) => p.id));
  } else {
    setDownloadProfileIds([]);
  }
}, [seriesType, tvProfiles]);
```

Remove the existing auto-select effect (lines 100-104) since this new one replaces it.

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/components/tv/tmdb-show-search.tsx
git commit -m "feat: filter download profiles by series type in show add flow"
```

---

### Task 6: Add Series Type dropdown and conflict resolution to show edit dialog

**Files:**

- Modify: `src/components/tv/show-detail-header.tsx:109-219`
- Modify: `src/lib/tmdb-validators.ts` (updateShowSchema)
- Modify: `src/server/shows.ts:436-524` (updateShowFn)

This is the most complex UI task. The edit dialog needs:

1. A Series Type dropdown
2. Profile filtering by the selected series type
3. Conflict detection when series type changes
4. Conflict resolution UI (remove or migrate)

- [ ] **Step 1: Add `migrateProfiles` to updateShowSchema**

In `src/lib/tmdb-validators.ts`, add to `updateShowSchema`:

```ts
export const updateShowSchema = z.object({
  id: z.number(),
  downloadProfileIds: z.array(z.number()).optional(),
  monitorNewSeasons: z.enum(["all", "none", "new"]).optional(),
  useSeasonFolder: z.boolean().optional(),
  seriesType: z.enum(["standard", "daily", "anime"]).optional(),
  migrateProfiles: z
    .array(
      z.object({
        fromProfileId: z.number(),
        toProfileId: z.number(),
      }),
    )
    .optional(),
});
```

- [ ] **Step 2: Handle profile migration in updateShowFn**

In `src/server/shows.ts`, inside `updateShowFn`, after the `downloadProfileIds` block (after line 521), add migration logic:

```ts
// Handle profile migrations (reassign episodes from one profile to another)
if (data.migrateProfiles && data.migrateProfiles.length > 0) {
  const showEpisodeIds = db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.showId, id))
    .all()
    .map((e) => e.id);

  if (showEpisodeIds.length > 0) {
    for (const migration of data.migrateProfiles) {
      // Update episode download profiles from old to new
      db.update(episodeDownloadProfiles)
        .set({ downloadProfileId: migration.toProfileId })
        .where(
          and(
            inArray(episodeDownloadProfiles.episodeId, showEpisodeIds),
            eq(
              episodeDownloadProfiles.downloadProfileId,
              migration.fromProfileId,
            ),
          ),
        )
        .run();
    }
  }

  // Also update show download profiles
  for (const migration of data.migrateProfiles) {
    db.update(showDownloadProfiles)
      .set({ downloadProfileId: migration.toProfileId })
      .where(
        and(
          eq(showDownloadProfiles.showId, id),
          eq(showDownloadProfiles.downloadProfileId, migration.fromProfileId),
        ),
      )
      .run();
  }
}
```

- [ ] **Step 3: Add Series Type dropdown to EditShowDialog**

In `src/components/tv/show-detail-header.tsx`, inside `EditShowDialog`, add the Series Type dropdown between the Monitor New Seasons select and the ProfileCheckboxGroup.

**Important:** The `EditShowDialogProps` type for `tvProfiles` (line 104) is currently `Array<{ id: number; name: string; icon: string }>`. This must be widened to include `seriesTypes: string[]` so the conflict detection logic in Step 4 can access `p.seriesTypes`. Update the prop type and ensure the parent passes full profile objects.

```tsx
{
  /* Series Type */
}
<div className="space-y-2">
  <Label>Series Type</Label>
  <Select value={seriesType} onValueChange={setSeriesType}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="standard">Standard</SelectItem>
      <SelectItem value="daily">Daily</SelectItem>
      <SelectItem value="anime">Anime</SelectItem>
    </SelectContent>
  </Select>
</div>;
```

- [ ] **Step 4: Add conflict detection and resolution state**

Add state and computed values for conflict detection:

```tsx
type ProfileConflict = {
  profileId: number;
  profileName: string;
  resolution: "remove" | "migrate" | null;
  migrateToId?: number;
};

const [conflicts, setConflicts] = useState<ProfileConflict[]>([]);

// Filter available profiles by current series type
const availableProfiles = useMemo(
  () =>
    tvProfiles.filter((p) => (p.seriesTypes as string[]).includes(seriesType)),
  [tvProfiles, seriesType],
);

// Detect conflicts when series type changes
useEffect(() => {
  if (seriesType === (show.seriesType ?? "standard")) {
    setConflicts([]);
    return;
  }
  const availableIds = new Set(availableProfiles.map((p) => p.id));
  const conflicting = selectedProfileIds
    .filter((id) => !availableIds.has(id))
    .map((id) => {
      const profile = tvProfiles.find((p) => p.id === id);
      return {
        profileId: id,
        profileName: profile?.name ?? `Profile ${id}`,
        resolution: null as "remove" | "migrate" | null,
      };
    });
  setConflicts(conflicting);
}, [
  seriesType,
  selectedProfileIds,
  availableProfiles,
  tvProfiles,
  show.seriesType,
]);

const allConflictsResolved = conflicts.every((c) => c.resolution !== null);
const hasConflicts = conflicts.length > 0;
```

- [ ] **Step 5: Add conflict resolution UI**

Render conflict resolution below the profile checkboxes:

```tsx
{
  conflicts.length > 0 && (
    <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-3">
      <p className="text-sm font-medium text-destructive">
        Profile conflicts detected
      </p>
      {conflicts.map((conflict) => (
        <div key={conflict.profileId} className="space-y-2">
          <p className="text-sm">
            <span className="font-medium">{conflict.profileName}</span> is not
            available for {seriesType} series
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={conflict.resolution === "remove" ? "default" : "outline"}
              onClick={() =>
                setConflicts((prev) =>
                  prev.map((c) =>
                    c.profileId === conflict.profileId
                      ? { ...c, resolution: "remove", migrateToId: undefined }
                      : c,
                  ),
                )
              }
            >
              Remove
            </Button>
            {availableProfiles.length > 0 && (
              <Select
                value={
                  conflict.resolution === "migrate"
                    ? String(conflict.migrateToId)
                    : ""
                }
                onValueChange={(val) =>
                  setConflicts((prev) =>
                    prev.map((c) =>
                      c.profileId === conflict.profileId
                        ? {
                            ...c,
                            resolution: "migrate",
                            migrateToId: Number(val),
                          }
                        : c,
                    ),
                  )
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Migrate to..." />
                </SelectTrigger>
                <SelectContent>
                  {availableProfiles.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Update handleSave to process conflicts**

Update the `handleSave` function to include migrations and filter out removed profiles:

```tsx
const handleSave = () => {
  const removedIds = new Set(
    conflicts.filter((c) => c.resolution === "remove").map((c) => c.profileId),
  );
  const migrateProfiles = conflicts
    .filter((c) => c.resolution === "migrate" && c.migrateToId)
    .map((c) => ({
      fromProfileId: c.profileId,
      toProfileId: c.migrateToId!,
    }));

  // Build final profile list: keep non-conflicting + add migration targets
  const finalProfileIds = [
    ...selectedProfileIds.filter(
      (id) =>
        !removedIds.has(id) &&
        !migrateProfiles.some((m) => m.fromProfileId === id),
    ),
    ...migrateProfiles.map((m) => m.toProfileId),
  ];
  // Deduplicate
  const uniqueProfileIds = [...new Set(finalProfileIds)];

  updateShow.mutate(
    {
      id: show.id,
      downloadProfileIds: uniqueProfileIds,
      monitorNewSeasons: monitorNewSeasons as "all" | "none" | "new",
      useSeasonFolder,
      seriesType: seriesType as "standard" | "daily" | "anime",
      migrateProfiles: migrateProfiles.length > 0 ? migrateProfiles : undefined,
    },
    {
      onSuccess: () => {
        onOpenChange(false);
        router.invalidate();
      },
    },
  );
};
```

- [ ] **Step 7: Disable save button when conflicts unresolved**

Update the Save button:

```tsx
<Button
  onClick={handleSave}
  disabled={updateShow.isPending || (hasConflicts && !allConflictsResolved)}
>
  {updateShow.isPending ? "Saving..." : "Save"}
</Button>
```

- [ ] **Step 8: Pass all TV profiles to EditShowDialog**

In `ShowDetailHeader`, ensure `tvProfiles` passed to `EditShowDialog` includes ALL TV profiles (not pre-filtered by series type), so the conflict detection can reference profiles from any series type. Check that the `tvProfiles` prop is filtered only by `contentType === "tv"`.

- [ ] **Step 9: Filter ProfileCheckboxGroup to available profiles only**

Only show profiles matching the current series type in the checkbox group:

```tsx
<ProfileCheckboxGroup
  profiles={availableProfiles}
  selectedIds={selectedProfileIds.filter((id) =>
    availableProfiles.some((p) => p.id === id),
  )}
  onToggle={toggleProfile}
/>
```

- [ ] **Step 10: Verify build**

Run: `bun run build`
Expected: Clean build

- [ ] **Step 11: Commit**

```bash
git add src/components/tv/show-detail-header.tsx src/lib/tmdb-validators.ts src/server/shows.ts
git commit -m "feat: add series type editor with conflict resolution to show edit dialog"
```

---

### Task 7: Verify TV index page (likely no-op)

**Files:**

- Verify: `src/routes/_authed/tv/index.tsx:34-36`

- [ ] **Step 1: Verify no changes needed**

The TV index page uses profiles for mass edit mode across multiple shows with potentially different series types. The existing `contentType === "tv"` filter is correct — no series type filtering should be added here. Verify by reading the file and confirming profiles are only used in the mass edit context.

---

### Task 8: Production build verification

- [ ] **Step 1: Full build**

Run: `bun run build`
Expected: Clean build with no errors

- [ ] **Step 2: Start and verify**

Run: `bun run db:migrate && bun run start`
Expected: Server starts, navigate to TV section, verify:

- Adding a show filters profiles by series type
- Editing a show shows series type dropdown
- Changing series type shows conflict resolution if applicable
- Anime 1080p profile appears in profile list

- [ ] **Step 3: Final commit if any fixes needed**
