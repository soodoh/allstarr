# Custom Formats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Custom Formats scoring system to download profiles with quality tier grouping, per-profile scoring, built-in presets, and import/export.

**Architecture:** New `custom_formats` and `profile_custom_formats` tables alongside existing `download_formats`/`download_profiles`. Quality tiers (download_formats) handle format identity; custom formats handle scoring. Profile items change from flat array to grouped array for tier equivalency. CF scores break ties within a quality group.

**Tech Stack:** Drizzle ORM (SQLite), TanStack Start server functions, TanStack Query, React + shadcn/ui, Zod validation, dnd-kit for drag-and-drop.

**Spec:** `docs/superpowers/specs/2026-03-23-custom-formats-design.md`

---

## Critical Codebase Conventions

All code snippets in this plan MUST be adapted to match these verified codebase patterns:

**Server functions use `.inputValidator()`, NOT `.validator()`:**

```typescript
// CORRECT:
export const myFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => mySchema.parse(d as MyType))
  .handler(async ({ data }) => { ... });

// For simple ID validators:
export const myFn = createServerFn({ method: "GET" })
  .inputValidator((d: number) => d)
  .handler(async ({ data: id }) => { ... });
```

**Zod imports from `"zod"` (NOT `"zod/v4"`):**

```typescript
import { z } from "zod";
```

**Path alias is `src/`, NOT `~/`:**

```typescript
import { db } from "src/db";
import { customFormats } from "src/db/schema";
import { requireAuth } from "./middleware"; // relative for same-directory
```

**Mutation hooks use `useQueryClient()`, NOT `useRouter()`:**

```typescript
export function useMyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MyType) => myServerFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customFormats.all });
      toast.success("Done");
    },
  });
}
```

**Drizzle migrations live in `drizzle/`, NOT `src/db/migrations/`:**

```bash
git add drizzle/
```

**Regex evaluation must be wrapped in try/catch** (users can enter invalid regex):

```typescript
try {
  match = new RegExp(spec.value, "i").test(input);
} catch {
  match = false;
}
```

**`indexerFlag` specs use bitwise flag checking**, NOT string search:

```typescript
case "indexerFlag": {
  const flagBit = Number(spec.value);
  match = attrs.indexerFlags != null ? (attrs.indexerFlags & flagBit) !== 0 : false;
  break;
}
```

---

## File Structure

### New Files

| File                                                               | Responsibility                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/db/schema/custom-formats.ts`                                  | Drizzle schema for `custom_formats` table                                       |
| `src/db/schema/profile-custom-formats.ts`                          | Drizzle schema for `profile_custom_formats` join table                          |
| `src/server/custom-formats.ts`                                     | CRUD server functions for custom formats + profile CF scores                    |
| `src/server/indexers/cf-scoring.ts`                                | Custom format matching engine (evaluate specs against releases, compute scores) |
| `src/lib/queries/custom-formats.ts`                                | TanStack Query factories for custom formats                                     |
| `src/hooks/mutations/custom-formats.ts`                            | Mutation hooks for custom formats + profile CF scores                           |
| `src/routes/_authed/settings/custom-formats.tsx`                   | Custom Formats management page route                                            |
| `src/components/settings/custom-formats/custom-format-list.tsx`    | List/table of custom formats with category filtering                            |
| `src/components/settings/custom-formats/custom-format-form.tsx`    | Editor dialog for creating/editing a custom format                              |
| `src/components/settings/custom-formats/specification-builder.tsx` | Visual specification condition builder                                          |
| `src/components/settings/custom-formats/cf-score-section.tsx`      | Profile editor section for managing CF scores                                   |
| `src/components/settings/custom-formats/preset-selector.tsx`       | Preset selection dialog for one-click profile setup                             |
| `src/components/settings/download-profiles/tier-group-list.tsx`    | Nested drag-drop component for quality tier grouping                            |
| `src/server/custom-format-presets.ts`                              | Built-in preset definitions and application logic                               |
| `src/server/custom-format-import-export.ts`                        | Import/export server functions (JSON + TRaSH Guide)                             |

### Modified Files

| File                                                                  | Changes                                                                                      |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/db/schema/download-profiles.ts`                                  | Add `minCustomFormatScore`, `upgradeUntilCustomFormatScore` columns                          |
| `src/db/schema/download-formats.ts`                                   | Remove `specifications` field (Phase 7)                                                      |
| `src/db/schema/index.ts`                                              | Export new schema modules                                                                    |
| `src/lib/validators.ts`                                               | New custom format schemas, update profile schemas for items grouping                         |
| `src/server/download-profiles.ts`                                     | Update deleteDownloadFormatFn cascade for grouped items                                      |
| `src/server/indexers/format-parser.ts`                                | Update `getProfileWeight()` for grouped items, move spec eval to cf-scoring                  |
| `src/server/indexers.ts`                                              | Update `ProfileInfo`, `unionProfileItems`, `computeReleaseMetrics`, `dedupeAndScoreReleases` |
| `src/server/auto-search.ts`                                           | Update all `profile.items` access for `number[][]`, integrate CF scoring                     |
| `src/lib/query-keys.ts`                                               | Add customFormats query keys                                                                 |
| `src/components/settings/download-profiles/download-profile-form.tsx` | Replace flat items list with tier grouping, add CF scores section                            |
| `src/components/settings/download-profiles/download-profile-list.tsx` | Update format badge rendering for grouped items                                              |
| `src/components/layout/app-sidebar.tsx`                               | Add Custom Formats nav item under Settings                                                   |
| `src/routes/_authed/settings/profiles.tsx`                            | Pass custom formats data to profile form                                                     |

---

## Phase 1: Data Foundation (Additive, Non-Breaking)

### Task 1: Create custom_formats schema

**Files:**

- Create: `src/db/schema/custom-formats.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create custom_formats schema file**

```typescript
// src/db/schema/custom-formats.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type CustomFormatSpecification = {
  name: string;
  type: string;
  value?: string;
  min?: number;
  max?: number;
  negate: boolean;
  required: boolean;
};

export const customFormats = sqliteTable("custom_formats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  specifications: text("specifications", { mode: "json" })
    .notNull()
    .$type<CustomFormatSpecification[]>()
    .default([]),
  defaultScore: integer("default_score").notNull().default(0),
  contentTypes: text("content_types", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
  includeInRenaming: integer("include_in_renaming", { mode: "boolean" })
    .notNull()
    .default(false),
  description: text("description"),
  origin: text("origin"), // "builtin", "imported", or null
  userModified: integer("user_modified", { mode: "boolean" })
    .notNull()
    .default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});
```

- [ ] **Step 2: Export from schema index**

Add to `src/db/schema/index.ts`:

```typescript
export * from "./custom-formats";
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/custom-formats.ts src/db/schema/index.ts
git commit -m "feat: add custom_formats schema"
```

---

### Task 2: Create profile_custom_formats schema

**Files:**

- Create: `src/db/schema/profile-custom-formats.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create profile_custom_formats schema file**

```typescript
// src/db/schema/profile-custom-formats.ts
import { integer, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { customFormats } from "./custom-formats";
import { downloadProfiles } from "./download-profiles";

export const profileCustomFormats = sqliteTable(
  "profile_custom_formats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => downloadProfiles.id, { onDelete: "cascade" }),
    customFormatId: integer("custom_format_id")
      .notNull()
      .references(() => customFormats.id, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
  },
  (table) => [
    uniqueIndex("profile_custom_format_idx").on(
      table.profileId,
      table.customFormatId,
    ),
  ],
);
```

- [ ] **Step 2: Export from schema index**

Add to `src/db/schema/index.ts`:

```typescript
export * from "./profile-custom-formats";
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/profile-custom-formats.ts src/db/schema/index.ts
git commit -m "feat: add profile_custom_formats join table schema"
```

---

### Task 3: Add new columns to download_profiles

**Files:**

- Modify: `src/db/schema/download-profiles.ts:3-24`

- [ ] **Step 1: Add CF score columns to download_profiles**

Add after the existing `language` column (line 23 of `download-profiles.ts`):

```typescript
minCustomFormatScore: integer("min_custom_format_score").notNull().default(0),
upgradeUntilCustomFormatScore: integer("upgrade_until_custom_format_score").notNull().default(0),
```

- [ ] **Step 2: Commit**

```bash
git add src/db/schema/download-profiles.ts
git commit -m "feat: add CF score fields to download_profiles schema"
```

---

### Task 4: Add validators for custom formats

**Files:**

- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Add custom format specification and entity schemas**

Add after the existing `specificationSchema` (around line 38 of `validators.ts`):

```typescript
export const customFormatContentTypes = [
  "movie",
  "tv",
  "ebook",
  "audiobook",
] as const;

export const customFormatCategories = [
  "Audio Codec",
  "Audio Channels",
  "Video Codec",
  "HDR",
  "Resolution",
  "Source",
  "Quality Modifier",
  "Streaming Service",
  "Release Group",
  "Edition",
  "Release Type",
  "Unwanted",
  "Language",
  "File Format",
  "Audiobook Quality",
  "Publisher",
] as const;

export const cfSpecificationTypes = [
  // Universal
  "releaseTitle",
  "releaseGroup",
  "size",
  "indexerFlag",
  "language",
  // Video
  "videoSource",
  "resolution",
  "qualityModifier",
  "edition",
  "videoCodec",
  "audioCodec",
  "audioChannels",
  "hdrFormat",
  "streamingService",
  "releaseType",
  "year",
  // Book/Audiobook
  "fileFormat",
  "audioBitrate",
  "narrator",
  "publisher",
  "audioDuration",
] as const;

export const cfSpecificationSchema = z.object({
  name: z.string().min(1),
  type: z.enum(cfSpecificationTypes),
  value: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  negate: z.boolean().default(false),
  required: z.boolean().default(true),
});

export const createCustomFormatSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(customFormatCategories),
  specifications: z.array(cfSpecificationSchema).default([]),
  defaultScore: z.number().default(0),
  contentTypes: z
    .array(z.enum(customFormatContentTypes))
    .min(1, "At least one content type required"),
  includeInRenaming: z.boolean().default(false),
  description: z.string().nullable().default(null),
  enabled: z.boolean().default(true),
});

export const updateCustomFormatSchema = createCustomFormatSchema.extend({
  id: z.number(),
});
```

- [ ] **Step 2: Add profile custom format score schema**

```typescript
export const profileCustomFormatScoreSchema = z.object({
  profileId: z.number(),
  customFormatId: z.number(),
  score: z.number(),
});

export const bulkSetProfileCFScoresSchema = z.object({
  profileId: z.number(),
  scores: z.array(
    z.object({
      customFormatId: z.number(),
      score: z.number(),
    }),
  ),
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/validators.ts
git commit -m "feat: add custom format and CF score validators"
```

---

### Task 5: Generate migration

- [ ] **Step 1: Generate Drizzle migration**

Run: `bun run db:generate`

This generates SQL for the new tables and columns. Verify the migration file includes:

- `CREATE TABLE custom_formats` with all columns
- `CREATE TABLE profile_custom_formats` with FK constraints and unique index
- `ALTER TABLE download_profiles ADD COLUMN min_custom_format_score`
- `ALTER TABLE download_profiles ADD COLUMN upgrade_until_custom_format_score`

- [ ] **Step 2: Run migration**

Run: `bun run db:migrate`

- [ ] **Step 3: Commit migration files**

```bash
git add src/db/migrations/
git commit -m "feat: add custom formats migration"
```

---

## Phase 2: Custom Formats Server API

### Task 6: Custom formats CRUD server functions

**Files:**

- Create: `src/server/custom-formats.ts`

- [ ] **Step 1: Create server functions file with CRUD operations**

```typescript
// src/server/custom-formats.ts
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "~/db";
import { customFormats, profileCustomFormats } from "~/db/schema";
import {
  createCustomFormatSchema,
  updateCustomFormatSchema,
} from "~/lib/validators";
import { requireAuth } from "./middleware";

export const getCustomFormatsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db.select().from(customFormats).all();
  },
);

export const getCustomFormatFn = createServerFn({ method: "GET" })
  .validator(z.number())
  .handler(async ({ data: id }) => {
    await requireAuth();
    const [cf] = await db
      .select()
      .from(customFormats)
      .where(eq(customFormats.id, id));
    if (!cf) throw new Error("Custom format not found");
    return cf;
  });

export const createCustomFormatFn = createServerFn({ method: "POST" })
  .validator(createCustomFormatSchema)
  .handler(async ({ data }) => {
    await requireAuth();
    const [cf] = await db.insert(customFormats).values(data).returning();
    return cf;
  });

export const updateCustomFormatFn = createServerFn({ method: "POST" })
  .validator(updateCustomFormatSchema)
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;

    // If editing a builtin CF, mark as user-modified
    const [existing] = await db
      .select()
      .from(customFormats)
      .where(eq(customFormats.id, id));
    const updates =
      existing?.origin === "builtin"
        ? { ...values, userModified: true }
        : values;

    const [cf] = await db
      .update(customFormats)
      .set(updates)
      .where(eq(customFormats.id, id))
      .returning();
    return cf;
  });

export const deleteCustomFormatFn = createServerFn({ method: "POST" })
  .validator(z.number())
  .handler(async ({ data: id }) => {
    await requireAuth();
    // profile_custom_formats rows cascade-deleted via FK
    await db.delete(customFormats).where(eq(customFormats.id, id));
  });

export const duplicateCustomFormatFn = createServerFn({ method: "POST" })
  .validator(z.number())
  .handler(async ({ data: id }) => {
    await requireAuth();
    const [source] = await db
      .select()
      .from(customFormats)
      .where(eq(customFormats.id, id));
    if (!source) throw new Error("Custom format not found");

    const { id: _, origin, userModified, ...rest } = source;
    const [cf] = await db
      .insert(customFormats)
      .values({ ...rest, name: `${rest.name} (Copy)`, origin: null })
      .returning();
    return cf;
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/server/custom-formats.ts
git commit -m "feat: add custom formats CRUD server functions"
```

---

### Task 7: Profile custom format score management

**Files:**

- Modify: `src/server/custom-formats.ts`

- [ ] **Step 1: Add profile CF score management functions**

Append to `src/server/custom-formats.ts`:

```typescript
export const getProfileCustomFormatsFn = createServerFn({ method: "GET" })
  .validator(z.number())
  .handler(async ({ data: profileId }) => {
    await requireAuth();
    return db
      .select({
        id: profileCustomFormats.id,
        profileId: profileCustomFormats.profileId,
        customFormatId: profileCustomFormats.customFormatId,
        score: profileCustomFormats.score,
        name: customFormats.name,
        category: customFormats.category,
        defaultScore: customFormats.defaultScore,
        contentTypes: customFormats.contentTypes,
      })
      .from(profileCustomFormats)
      .innerJoin(
        customFormats,
        eq(profileCustomFormats.customFormatId, customFormats.id),
      )
      .where(eq(profileCustomFormats.profileId, profileId))
      .all();
  });

export const setProfileCFScoreFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      profileId: z.number(),
      customFormatId: z.number(),
      score: z.number(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    // Upsert: insert or update score
    const existing = await db
      .select()
      .from(profileCustomFormats)
      .where(
        and(
          eq(profileCustomFormats.profileId, data.profileId),
          eq(profileCustomFormats.customFormatId, data.customFormatId),
        ),
      )
      .get();

    if (existing) {
      await db
        .update(profileCustomFormats)
        .set({ score: data.score })
        .where(eq(profileCustomFormats.id, existing.id));
    } else {
      await db.insert(profileCustomFormats).values(data);
    }
  });

export const bulkSetProfileCFScoresFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      profileId: z.number(),
      scores: z.array(
        z.object({ customFormatId: z.number(), score: z.number() }),
      ),
    }),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    // Delete all existing scores for this profile, then bulk insert
    await db
      .delete(profileCustomFormats)
      .where(eq(profileCustomFormats.profileId, data.profileId));

    if (data.scores.length > 0) {
      await db.insert(profileCustomFormats).values(
        data.scores.map((s) => ({
          profileId: data.profileId,
          customFormatId: s.customFormatId,
          score: s.score,
        })),
      );
    }
  });

export const removeProfileCFsFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      profileId: z.number(),
      customFormatIds: z.array(z.number()),
    }),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    for (const cfId of data.customFormatIds) {
      await db
        .delete(profileCustomFormats)
        .where(
          and(
            eq(profileCustomFormats.profileId, data.profileId),
            eq(profileCustomFormats.customFormatId, cfId),
          ),
        );
    }
  });

export const addCategoryToProfileFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      profileId: z.number(),
      category: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    // Get all enabled CFs in this category
    const cfs = await db
      .select()
      .from(customFormats)
      .where(eq(customFormats.category, data.category))
      .all();

    // Get existing profile CFs to avoid duplicates
    const existing = await db
      .select()
      .from(profileCustomFormats)
      .where(eq(profileCustomFormats.profileId, data.profileId))
      .all();
    const existingIds = new Set(existing.map((e) => e.customFormatId));

    const toInsert = cfs
      .filter((cf) => cf.enabled && !existingIds.has(cf.id))
      .map((cf) => ({
        profileId: data.profileId,
        customFormatId: cf.id,
        score: cf.defaultScore,
      }));

    if (toInsert.length > 0) {
      await db.insert(profileCustomFormats).values(toInsert);
    }
  });
```

Note: add `import { and } from "drizzle-orm"` to the import line at top.

- [ ] **Step 2: Commit**

```bash
git add src/server/custom-formats.ts
git commit -m "feat: add profile CF score management server functions"
```

---

### Task 8: Query infrastructure for custom formats

**Files:**

- Create: `src/lib/queries/custom-formats.ts`
- Create: `src/hooks/mutations/custom-formats.ts`
- Modify: `src/lib/query-keys.ts`

- [ ] **Step 1: Add query keys**

Add to `src/lib/query-keys.ts` after the existing `downloadFormats` keys (~line 97):

```typescript
customFormats: {
  all: ["customFormats"] as const,
  lists: () => [...queryKeys.customFormats.all, "list"] as const,
  detail: (id: number) => [...queryKeys.customFormats.all, "detail", id] as const,
  profileScores: (profileId: number) =>
    [...queryKeys.customFormats.all, "profileScores", profileId] as const,
},
```

- [ ] **Step 2: Create query factories**

```typescript
// src/lib/queries/custom-formats.ts
import { queryOptions } from "@tanstack/react-query";
import {
  getCustomFormatsFn,
  getCustomFormatFn,
  getProfileCustomFormatsFn,
} from "~/server/custom-formats";
import { queryKeys } from "../query-keys";

export const customFormatsListQuery = () =>
  queryOptions({
    queryKey: queryKeys.customFormats.lists(),
    queryFn: () => getCustomFormatsFn(),
  });

export const customFormatDetailQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.customFormats.detail(id),
    queryFn: () => getCustomFormatFn({ data: id }),
  });

export const profileCustomFormatsQuery = (profileId: number) =>
  queryOptions({
    queryKey: queryKeys.customFormats.profileScores(profileId),
    queryFn: () => getProfileCustomFormatsFn({ data: profileId }),
  });
```

- [ ] **Step 3: Create mutation hooks**

```typescript
// src/hooks/mutations/custom-formats.ts
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { queryKeys } from "~/lib/query-keys";
import {
  createCustomFormatFn,
  updateCustomFormatFn,
  deleteCustomFormatFn,
  duplicateCustomFormatFn,
  setProfileCFScoreFn,
  bulkSetProfileCFScoresFn,
  removeProfileCFsFn,
  addCategoryToProfileFn,
} from "~/server/custom-formats";

export function useCreateCustomFormat() {
  const router = useRouter();
  return useMutation({
    mutationFn: createCustomFormatFn,
    onSuccess: () => {
      router.invalidate();
      toast.success("Custom format created");
    },
  });
}

export function useUpdateCustomFormat() {
  const router = useRouter();
  return useMutation({
    mutationFn: updateCustomFormatFn,
    onSuccess: () => {
      router.invalidate();
      toast.success("Custom format updated");
    },
  });
}

export function useDeleteCustomFormat() {
  const router = useRouter();
  return useMutation({
    mutationFn: deleteCustomFormatFn,
    onSuccess: () => {
      router.invalidate();
      toast.success("Custom format deleted");
    },
  });
}

export function useDuplicateCustomFormat() {
  const router = useRouter();
  return useMutation({
    mutationFn: duplicateCustomFormatFn,
    onSuccess: () => {
      router.invalidate();
      toast.success("Custom format duplicated");
    },
  });
}

export function useSetProfileCFScore() {
  const router = useRouter();
  return useMutation({
    mutationFn: setProfileCFScoreFn,
    onSuccess: () => router.invalidate(),
  });
}

export function useBulkSetProfileCFScores() {
  const router = useRouter();
  return useMutation({
    mutationFn: bulkSetProfileCFScoresFn,
    onSuccess: () => {
      router.invalidate();
      toast.success("Custom format scores updated");
    },
  });
}

export function useRemoveProfileCFs() {
  const router = useRouter();
  return useMutation({
    mutationFn: removeProfileCFsFn,
    onSuccess: () => router.invalidate(),
  });
}

export function useAddCategoryToProfile() {
  const router = useRouter();
  return useMutation({
    mutationFn: addCategoryToProfileFn,
    onSuccess: () => {
      router.invalidate();
      toast.success("Category formats added to profile");
    },
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/query-keys.ts src/lib/queries/custom-formats.ts src/hooks/mutations/custom-formats.ts
git commit -m "feat: add custom formats query infrastructure"
```

---

## Phase 3: Custom Formats UI

### Task 9: Custom Formats settings page

**Files:**

- Create: `src/routes/_authed/settings/custom-formats.tsx`
- Create: `src/components/settings/custom-formats/custom-format-list.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Create custom format list component**

Create `src/components/settings/custom-formats/custom-format-list.tsx`:

Follow the pattern in `src/components/settings/download-profiles/download-profile-list.tsx`. Build a table displaying:

- Name column
- Category badge (use `<Badge variant="outline">`)
- Content types badges (small colored badges for movie/tv/ebook/audiobook)
- Default score (number)
- Origin badge (builtin=blue, imported=purple, custom=gray)
- Enabled toggle (`<Switch>` inline, calls mutation on change)
- Actions: Edit, Duplicate, Delete buttons

Add category filter tabs above the table using existing tab patterns. Include "All" as default, then each category from `customFormatCategories` constant.

The list component receives:

- `customFormats: CustomFormat[]` — all custom formats from query
- `onEdit: (cf: CustomFormat) => void` — open edit dialog
- `onDelete: (id: number) => void` — delete with confirmation
- `onDuplicate: (id: number) => void` — duplicate CF

- [ ] **Step 2: Create settings page route**

Create `src/routes/_authed/settings/custom-formats.tsx`:

Follow the pattern in `src/routes/_authed/settings/profiles.tsx`:

- Route loader ensures `customFormatsListQuery()` is loaded
- Page component uses `useSuspenseQuery(customFormatsListQuery())`
- State for edit dialog open/close and selected CF
- PageHeader with title "Custom Formats", description, and "Add Custom Format" + "Import" buttons
- Render `<CustomFormatList>` with data
- Render `<CustomFormatForm>` dialog when editing/creating (built in Task 10)

- [ ] **Step 3: Add navigation link**

In `src/components/layout/app-sidebar.tsx`, add a "Custom Formats" nav item under the Settings section, after the existing "Download Profiles" link. Use the `Sliders` icon from lucide-react.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authed/settings/custom-formats.tsx src/components/settings/custom-formats/custom-format-list.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat: add custom formats settings page and navigation"
```

---

### Task 10: Custom Format editor dialog

**Files:**

- Create: `src/components/settings/custom-formats/custom-format-form.tsx`
- Create: `src/components/settings/custom-formats/specification-builder.tsx`

- [ ] **Step 1: Create specification builder component**

Create `src/components/settings/custom-formats/specification-builder.tsx`:

A visual condition builder. Each specification row shows:

- **Type dropdown**: Select from `cfSpecificationTypes`. Group options by category (Universal / Video / Book).
- **Value input**: Adapts based on type:
  - Regex types (`releaseTitle`, `releaseGroup`, `edition`, `videoCodec`, `audioCodec`, `narrator`, `publisher`): Text input with monospace font
  - Enum types (`videoSource`, `resolution`, `qualityModifier`, `audioChannels`, `hdrFormat`, `streamingService`, `releaseType`, `fileFormat`, `language`): Select dropdown with predefined options
  - Range types (`size`, `audioBitrate`, `audioDuration`, `year`): Two number inputs (min/max)
  - Flag type (`indexerFlag`): Select from known flags
- **Required toggle**: Checkbox labeled "Required" (AND vs OR logic)
- **Negate toggle**: Checkbox labeled "Negate" (NOT logic)
- **Remove button**: X icon to delete the spec row
- **Add button**: "+ Add Condition" at bottom

The component receives `value: CfSpecification[]` and `onChange: (specs: CfSpecification[]) => void` as controlled input props.

Include a small info tooltip explaining AND/OR logic: "Required conditions must ALL match. Non-required conditions need at least ONE match."

- [ ] **Step 2: Create custom format editor form**

Create `src/components/settings/custom-formats/custom-format-form.tsx`:

A sheet/dialog (use `<Sheet>` like existing profile form) containing:

- **Name**: Text input
- **Category**: Select dropdown from `customFormatCategories`
- **Content Types**: Multi-select checkboxes for movie/tv/ebook/audiobook
- **Default Score**: Number input with helper text showing score range conventions
- **Description**: Textarea (optional)
- **Include in Renaming**: Switch toggle
- **Enabled**: Switch toggle
- **Specifications**: `<SpecificationBuilder>` component
- **Save/Cancel** buttons

Use `react-hook-form` + `zodResolver` with `createCustomFormatSchema`. On submit, call `useCreateCustomFormat()` or `useUpdateCustomFormat()` mutation depending on whether editing.

- [ ] **Step 3: Wire form into the settings page**

Update `src/routes/_authed/settings/custom-formats.tsx` to render `<CustomFormatForm>` when creating/editing. Pass `open`, `onClose`, `initialValues`, `downloadFormats` as props.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/custom-formats/
git commit -m "feat: add custom format editor with specification builder"
```

---

## Phase 4: Quality Tier Grouping

### Task 11: Update items type and getProfileWeight for grouping

**Files:**

- Modify: `src/server/indexers/format-parser.ts:329-335`
- Modify: `src/server/indexers.ts:51-58, 102-110`
- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Update profile items validator**

In `src/lib/validators.ts`, change the `items` field in `downloadProfileBaseSchema` (line 8):

```typescript
// Old:
items: z.array(z.number()).min(1, "At least one quality must be added"),
// New:
items: z
  .array(z.array(z.number()).min(1))
  .min(1, "At least one quality must be added"),
```

- [ ] **Step 2: Update getProfileWeight for grouped items**

In `src/server/indexers/format-parser.ts`, replace the `getProfileWeight` function (lines 329-335):

```typescript
/**
 * Get weight for a format ID within grouped profile items.
 * All formats in the same group get the same weight (group index from end).
 * Returns 0 if format is not in any group.
 */
export function getProfileWeight(qualityId: number, items: number[][]): number {
  for (let i = 0; i < items.length; i++) {
    if (items[i].includes(qualityId)) {
      return items.length - i; // First group = highest weight
    }
  }
  return 0; // Not in profile
}

/**
 * Check if a format ID is allowed by the profile.
 */
export function isFormatInProfile(
  qualityId: number,
  items: number[][],
): boolean {
  return items.some((group) => group.includes(qualityId));
}

/**
 * Flatten grouped items into a flat array of all format IDs.
 */
export function flattenProfileItems(items: number[][]): number[] {
  return items.flat();
}
```

- [ ] **Step 3: Update ProfileInfo type**

In `src/server/indexers.ts`, update the `ProfileInfo` type (line 54):

```typescript
// Old:
items: number[];
// New:
items: number[][];
```

- [ ] **Step 4: Update unionProfileItems**

In `src/server/indexers.ts`, update `unionProfileItems` (lines 102-110):

```typescript
export function unionProfileItems(profiles: ProfileInfo[]): number[][] | null {
  if (profiles.length === 0) return null;
  const seen = new Set<number>();
  const result: number[][] = [];
  for (const profile of profiles) {
    for (const group of profile.items) {
      const newGroup = group.filter((id) => !seen.has(id));
      if (newGroup.length > 0) {
        result.push(newGroup);
        for (const id of newGroup) seen.add(id);
      }
    }
  }
  return result.length > 0 ? result : null;
}
```

Note: Return type stays nullable to preserve existing `if (profileItems)` guard at callers.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators.ts src/server/indexers/format-parser.ts src/server/indexers.ts
git commit -m "feat: update items type to number[][] for quality tier grouping"
```

---

### Task 12: Update all profile.items consumers

**Files:**

- Modify: `src/server/auto-search.ts` (lines 106, 220, 248, 552, 560)
- Modify: `src/server/indexers.ts` (lines 276, 278, 482, 522-536)
- Modify: `src/server/download-profiles.ts` (lines 418-427)

- [ ] **Step 1: Update auto-search.ts**

Replace all `profile.items.includes(...)` with `isFormatInProfile(...)`:

Import at top:

```typescript
import {
  getProfileWeight,
  isFormatInProfile,
  flattenProfileItems,
} from "./indexers/format-parser";
```

Line 560 (approx): Change:

```typescript
// Old:
if (!profile.items.includes(release.quality.id))
// New:
if (!isFormatInProfile(release.quality.id, profile.items))
```

Lines 220, 248, 552: `getProfileWeight` calls already use the correct signature (pass `profile.items` which is now `number[][]`).

- [ ] **Step 2: Update indexers.ts**

Line 276: Change:

```typescript
// Old:
const allowed = profile.items.includes(release.quality.id);
// New:
const allowed = isFormatInProfile(release.quality.id, profile.items);
```

Line 482: Change:

```typescript
// Old:
const profileItems = profiles ? unionProfileItems(profiles) : null;
// Then later: profileItems.includes(...)
// New:
const profileItems = profiles ? unionProfileItems(profiles) : null;
// Change includes checks to use isFormatInProfile or flattenProfileItems
```

Lines 522-536: Update `dedupeAndScoreReleases` to use `getProfileWeight` with `number[][]`:

```typescript
// These calls already pass profileItems to getProfileWeight
// Just ensure profileItems is number[][] from unionProfileItems
let bestWeight = getProfileWeight(bestMatch.id, profileItems);
```

- [ ] **Step 3: Update download-profiles.ts deleteDownloadFormatFn**

Lines 418-427: Update format deletion cascade to handle grouped items:

```typescript
// Old:
const updatedItems = profile.items.filter((id: number) => id !== data);
// New:
const updatedItems = (profile.items as number[][])
  .map((group: number[]) => group.filter((id) => id !== data))
  .filter((group: number[]) => group.length > 0);
```

- [ ] **Step 4: Commit**

```bash
git add src/server/auto-search.ts src/server/indexers.ts src/server/download-profiles.ts
git commit -m "feat: update all profile.items consumers for grouped format arrays"
```

---

### Task 13: Data migration for items format

**Files:**

- Modify: `src/db/seed.ts` or create a migration script

- [ ] **Step 1: Write migration logic**

This needs to run during `db:migrate`. Add a custom migration that converts existing `items` data:

```sql
-- Convert items from [1, 2, 3] to [[1], [2], [3]]
-- SQLite JSON manipulation
UPDATE download_profiles
SET items = (
  SELECT json_group_array(json_array(value))
  FROM json_each(download_profiles.items)
);
```

Alternatively, handle this in the seed/migrate script in TypeScript:

```typescript
// In migration or post-migrate hook
const profiles = db.select().from(downloadProfiles).all();
for (const profile of profiles) {
  const oldItems = profile.items as unknown as number[];
  if (
    Array.isArray(oldItems) &&
    oldItems.length > 0 &&
    !Array.isArray(oldItems[0])
  ) {
    const newItems = oldItems.map((id) => [id]);
    db.update(downloadProfiles)
      .set({ items: newItems })
      .where(eq(downloadProfiles.id, profile.id))
      .run();
  }
}
```

- [ ] **Step 2: Test migration with existing data**

Run: `bun run db:migrate`

Verify in Drizzle Studio (`bun run db:studio`) that existing profiles have items converted from `[1, 2, 3]` to `[[1], [2], [3]]`.

- [ ] **Step 3: Commit**

```bash
git add src/db/
git commit -m "feat: migrate profile items to grouped format"
```

---

### Task 14: Profile form UI for tier grouping

**Files:**

- Create: `src/components/settings/download-profiles/tier-group-list.tsx`
- Modify: `src/components/settings/download-profiles/download-profile-form.tsx`

- [ ] **Step 1: Create tier group list component**

Create `src/components/settings/download-profiles/tier-group-list.tsx`:

A nested drag-and-drop component that renders groups of format badges:

- Each group is a visual container (bordered box) containing format badges
- Formats can be dragged between groups or reordered within groups
- Groups can be reordered relative to each other
- A "Create Group" drop zone appears between groups for creating new groups by dragging a format there
- Single-format groups render as individual badges (no container border) for visual simplicity
- Use `@dnd-kit/core` and `@dnd-kit/sortable` (already in the project)

Props:

```typescript
type TierGroupListProps = {
  items: number[][]; // Grouped format IDs
  onChange: (items: number[][]) => void;
  downloadFormats: { id: number; title: string; color: string }[];
  cutoff: number;
  upgradeAllowed: boolean;
  onAddFormat: (formatId: number) => void;
  onRemoveFormat: (formatId: number) => void;
};
```

Visual design:

- Groups with >1 format show a bracket/border on the left with "=" icon indicating equivalence
- The cutoff format gets a blue highlight (same as current)
- Each format badge has a drag handle and remove button (same as current `SortableFormatItem`)

- [ ] **Step 2: Update download-profile-form.tsx**

Replace the `QualitiesSection` component (~lines 427-517) to use `<TierGroupList>` instead of the flat sortable list.

Update state management:

```typescript
// Old:
const [items, setItems] = useState<number[]>(initialItems);
// New:
const [items, setItems] = useState<number[][]>(initialItems);
```

Update the `FormatSearchDropdown` add handler to append as a new single-item group:

```typescript
// Old:
setItems([...items, formatId]);
// New:
setItems([...items, [formatId]]);
```

Update cutoff selection dropdown to show format names from flattened items.

Update form submission to pass `number[][]` items.

- [ ] **Step 3: Update profile list display**

In `src/components/settings/download-profiles/download-profile-list.tsx`, update format badge rendering (~line 169):

```typescript
// Old: map over flat items
{itemIds.map((id) => ...)}
// New: map over groups, show grouping indicators
{(profile.items as number[][]).map((group, groupIdx) => (
  <div key={groupIdx} className="flex items-center gap-0.5">
    {group.length > 1 && <span className="text-muted-foreground text-xs">[</span>}
    {group.map((id) => {
      const def = definitions.find((d) => d.id === id);
      const isCutoff = profile.upgradeAllowed && profile.cutoff === id;
      return (
        <Badge key={id} variant={isCutoff ? "default" : "secondary"}
          style={{ backgroundColor: def?.color }}>
          {def?.title ?? `Unknown (${id})`}
        </Badge>
      );
    })}
    {group.length > 1 && <span className="text-muted-foreground text-xs">]</span>}
    {groupIdx < (profile.items as number[][]).length - 1 && (
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
    )}
  </div>
))}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/download-profiles/
git commit -m "feat: add quality tier grouping UI to profile editor"
```

---

## Phase 5: CF Scoring Engine

### Task 15: Custom format matching engine

**Files:**

- Create: `src/server/indexers/cf-scoring.ts`

- [ ] **Step 1: Create CF scoring module**

```typescript
// src/server/indexers/cf-scoring.ts
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { customFormats, profileCustomFormats } from "~/db/schema";
import type { CustomFormatSpecification } from "~/db/schema/custom-formats";

type ReleaseAttributes = {
  title: string;
  group?: string;
  sizeMB?: number;
  indexerFlags?: number;
  language?: string;
  // Video
  videoSource?: string;
  resolution?: string;
  qualityModifier?: string;
  edition?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: string;
  hdrFormat?: string;
  streamingService?: string;
  releaseType?: string;
  year?: number;
  // Book
  fileFormat?: string;
  audioBitrateKbps?: number;
  narrator?: string;
  publisher?: string;
  audioDurationMinutes?: number;
};

// Cache for profile CF scoring configs
let cfCache: Map<
  number,
  { cfId: number; score: number; specs: CustomFormatSpecification[] }[]
> | null = null;

export function invalidateCFCache() {
  cfCache = null;
}

type CachedCF = {
  cfId: number;
  name: string;
  score: number;
  specs: CustomFormatSpecification[];
  contentTypes: string[];
};

/**
 * Load CF scoring config for a profile.
 * Returns array of { cfId, name, score, specs, contentTypes } for enabled CFs.
 */
async function getProfileCFs(profileId: number): Promise<CachedCF[]> {
  if (cfCache?.has(profileId)) return cfCache.get(profileId)!;

  const rows = await db
    .select({
      cfId: customFormats.id,
      name: customFormats.name,
      score: profileCustomFormats.score,
      specifications: customFormats.specifications,
      enabled: customFormats.enabled,
      contentTypes: customFormats.contentTypes,
    })
    .from(profileCustomFormats)
    .innerJoin(
      customFormats,
      eq(profileCustomFormats.customFormatId, customFormats.id),
    )
    .where(eq(profileCustomFormats.profileId, profileId))
    .all();

  const result: CachedCF[] = rows
    .filter((r) => r.enabled)
    .map((r) => ({
      cfId: r.cfId,
      name: r.name,
      score: r.score,
      specs: (typeof r.specifications === "string"
        ? JSON.parse(r.specifications)
        : r.specifications) as CustomFormatSpecification[],
      contentTypes: (typeof r.contentTypes === "string"
        ? JSON.parse(r.contentTypes)
        : r.contentTypes) as string[],
    }));

  if (!cfCache) cfCache = new Map();
  cfCache.set(profileId, result);
  return result;
}

/**
 * Evaluate a single specification against release attributes.
 */
function evaluateCFSpec(
  spec: CustomFormatSpecification,
  attrs: ReleaseAttributes,
): boolean {
  let match = false;

  switch (spec.type) {
    // Regex types
    case "releaseTitle":
      match = spec.value
        ? new RegExp(spec.value, "i").test(attrs.title)
        : false;
      break;
    case "releaseGroup":
      match =
        spec.value && attrs.group
          ? new RegExp(spec.value, "i").test(attrs.group)
          : false;
      break;
    case "edition":
      match =
        spec.value && attrs.edition
          ? new RegExp(spec.value, "i").test(attrs.edition)
          : false;
      break;
    case "videoCodec":
      match = spec.value
        ? new RegExp(spec.value, "i").test(attrs.title)
        : false;
      break;
    case "audioCodec":
      match = spec.value
        ? new RegExp(spec.value, "i").test(attrs.title)
        : false;
      break;
    case "narrator":
      match =
        spec.value && attrs.narrator
          ? new RegExp(spec.value, "i").test(attrs.narrator)
          : false;
      break;
    case "publisher":
      match =
        spec.value && attrs.publisher
          ? new RegExp(spec.value, "i").test(attrs.publisher)
          : false;
      break;

    // Enum types
    case "videoSource":
      match = attrs.videoSource === spec.value;
      break;
    case "resolution":
      match = attrs.resolution === spec.value;
      break;
    case "qualityModifier":
      match = attrs.qualityModifier === spec.value;
      break;
    case "audioChannels":
      match = attrs.audioChannels === spec.value;
      break;
    case "hdrFormat":
      match = attrs.hdrFormat === spec.value;
      break;
    case "streamingService":
      match = attrs.streamingService === spec.value;
      break;
    case "releaseType":
      match = attrs.releaseType === spec.value;
      break;
    case "fileFormat":
      match = attrs.fileFormat === spec.value;
      break;
    case "language":
      match = attrs.language === spec.value;
      break;

    // Range types
    case "size":
      match =
        (spec.min == null || (attrs.sizeMB ?? 0) >= spec.min) &&
        (spec.max == null || (attrs.sizeMB ?? 0) <= spec.max);
      break;
    case "audioBitrate":
      match =
        attrs.audioBitrateKbps != null &&
        (spec.min == null || attrs.audioBitrateKbps >= spec.min) &&
        (spec.max == null || attrs.audioBitrateKbps <= spec.max);
      break;
    case "audioDuration":
      match =
        attrs.audioDurationMinutes != null &&
        (spec.min == null || attrs.audioDurationMinutes >= spec.min) &&
        (spec.max == null || attrs.audioDurationMinutes <= spec.max);
      break;
    case "year":
      match =
        attrs.year != null &&
        (spec.min == null || attrs.year >= spec.min) &&
        (spec.max == null || attrs.year <= spec.max);
      break;

    // Flag type
    case "indexerFlag":
      match = spec.value
        ? attrs.title.toLowerCase().includes(spec.value.toLowerCase())
        : false;
      break;
  }

  return spec.negate ? !match : match;
}

/**
 * Evaluate whether a custom format matches a release.
 * Uses AND/OR logic: all required specs must match, at least one non-required must match.
 */
function evaluateCF(
  specs: CustomFormatSpecification[],
  attrs: ReleaseAttributes,
): boolean {
  const required = specs.filter((s) => s.required);
  const optional = specs.filter((s) => !s.required);

  // All required must match
  if (required.length > 0) {
    const allRequiredMatch = required.every((s) => evaluateCFSpec(s, attrs));
    if (!allRequiredMatch) return false;
  }

  // At least one optional must match (if any exist)
  if (optional.length > 0) {
    const anyOptionalMatch = optional.some((s) => evaluateCFSpec(s, attrs));
    if (!anyOptionalMatch) return false;
  }

  return specs.length > 0; // Empty specs = no match
}

export type CFScoreResult = {
  totalScore: number;
  matchedFormats: { cfId: number; name: string; score: number }[];
};

/**
 * Map profile contentType+mediaType to CF contentTypes vocabulary.
 * E.g., contentType:"book" + mediaType:"audio" -> "audiobook"
 */
export function profileToCFContentType(
  contentType: string,
  mediaType: string,
): string {
  if (contentType === "book" && mediaType === "ebook") return "ebook";
  if (contentType === "book" && mediaType === "audio") return "audiobook";
  return contentType; // "movie" or "tv"
}

/**
 * Calculate the total CF score for a release against a profile.
 * Filters by contentType (defense in depth - UI also filters).
 */
export async function calculateCFScore(
  profileId: number,
  attrs: ReleaseAttributes,
  cfContentType?: string,
): Promise<CFScoreResult> {
  const profileCFs = await getProfileCFs(profileId);
  const matchedFormats: { cfId: number; name: string; score: number }[] = [];
  let totalScore = 0;

  for (const { cfId, name, score, specs, contentTypes } of profileCFs) {
    // Skip CFs that don't match the profile's content type
    if (cfContentType && !contentTypes.includes(cfContentType)) continue;

    if (evaluateCF(specs, attrs)) {
      matchedFormats.push({ cfId, name, score });
      totalScore += score;
    }
  }

  return { totalScore, matchedFormats };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/indexers/cf-scoring.ts
git commit -m "feat: add custom format matching and scoring engine"
```

---

### Task 16: Integrate CF scoring into release evaluation

**Files:**

- Modify: `src/server/indexers.ts` (~lines 220-303, 460-576)
- Modify: `src/server/auto-search.ts` (~lines 538-586)

- [ ] **Step 1: Add CF score to release metrics**

In `src/server/indexers.ts`, update `computeReleaseMetrics` (~line 220):

Import at top:

```typescript
import { calculateCFScore, type CFScoreResult } from "./indexers/cf-scoring";
```

**Important:** Adding `await calculateCFScore()` makes `computeReleaseMetrics` async. All callers must be updated to `await` the result. Check the calling loop in `dedupeAndScoreReleases` (~line 552) and any other callers.

After computing format score for each profile, also compute CF score:

```typescript
// After existing format scoring (line ~283):
const cfResult = await calculateCFScore(profile.id, {
  title: release.title,
  group: release.releaseGroup,
  sizeMB: release.size ? release.size / (1024 * 1024) : undefined,
  indexerFlags: release.indexerFlags,
});
// Attach CF score to the release metric
```

Add `cfScore` and `cfDetails` to the release metrics return type.

- [ ] **Step 2: Update findBestReleaseForProfile in auto-search.ts**

In `src/server/auto-search.ts`, update `findBestReleaseForProfile` (~line 538):

After the existing quality tier comparison, add CF score as tiebreaker:

- If two releases are in the same quality tier group (same `getProfileWeight`), prefer the one with higher CF score
- Check `minCustomFormatScore` — reject releases below threshold
- Check `upgradeUntilCustomFormatScore` — stop upgrading if current file meets threshold

```typescript
// In the release comparison logic:
// 1. First compare quality tier weight (existing)
// 2. If same tier weight, compare CF score (new)
// 3. Apply minCustomFormatScore filter
// 4. Apply upgradeUntilCustomFormatScore check
```

- [ ] **Step 3: Add CF score invalidation hook**

In `src/server/custom-formats.ts`, call `invalidateCFCache()` from the cf-scoring module when CF scores or CFs are modified:

```typescript
import { invalidateCFCache } from "./indexers/cf-scoring";
// Add invalidateCFCache() calls in:
// - updateCustomFormatFn
// - deleteCustomFormatFn
// - setProfileCFScoreFn
// - bulkSetProfileCFScoresFn
// - removeProfileCFsFn
// - addCategoryToProfileFn
```

- [ ] **Step 4: Commit**

```bash
git add src/server/indexers.ts src/server/auto-search.ts src/server/custom-formats.ts
git commit -m "feat: integrate CF scoring into release evaluation pipeline"
```

---

### Task 17: CF scores section in profile editor

**Files:**

- Create: `src/components/settings/custom-formats/cf-score-section.tsx`
- Modify: `src/components/settings/download-profiles/download-profile-form.tsx`
- Modify: `src/routes/_authed/settings/profiles.tsx`

- [ ] **Step 1: Create CF score section component**

Create `src/components/settings/custom-formats/cf-score-section.tsx`:

A section that shows CFs assigned to this profile in a table. Uses the query from `profileCustomFormatsQuery(profileId)` when editing an existing profile, or local state for new profiles.

UI:

- `minCustomFormatScore` and `upgradeUntilCustomFormatScore` number inputs at top
- Table columns: Name, Category badge, Default Score, Profile Score (inline editable `<Input type="number">`), Modified badge (if score !== defaultScore)
- Actions above table: "Add Format" dropdown (searchable, filtered by profile's content type), "Add Category" dropdown, "Apply Preset" button, "Remove Selected" button
- Each row has a remove button and "Reset to Default" button

Props:

```typescript
type CFScoreSectionProps = {
  profileId?: number; // undefined for new profiles
  contentType: string;
  mediaType: string;
  minCustomFormatScore: number;
  upgradeUntilCustomFormatScore: number;
  onMinScoreChange: (score: number) => void;
  onUpgradeUntilScoreChange: (score: number) => void;
  // For new profiles, manage scores locally:
  localScores?: { customFormatId: number; score: number }[];
  onLocalScoresChange?: (
    scores: { customFormatId: number; score: number }[],
  ) => void;
};
```

- [ ] **Step 2: Add CF section to profile form**

In `src/components/settings/download-profiles/download-profile-form.tsx`, add `<CFScoreSection>` after the `<QualitiesSection>` (around line 900).

Add `minCustomFormatScore` and `upgradeUntilCustomFormatScore` to the form state and submission data.

**New profile two-step save:** When creating a new profile with CF scores, the profile must be created first (to get the `profileId`), then CF scores are bulk-inserted in a second call. The create handler should return the new profile ID, then immediately call `bulkSetProfileCFScoresFn` with the local scores.

- [ ] **Step 3: Load custom formats data in profiles page**

In `src/routes/_authed/settings/profiles.tsx`, ensure `customFormatsListQuery()` is loaded in the route loader and passed to the form.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/custom-formats/cf-score-section.tsx src/components/settings/download-profiles/download-profile-form.tsx src/routes/_authed/settings/profiles.tsx
git commit -m "feat: add custom format scores section to profile editor"
```

---

## Phase 6: Presets & Import/Export

### Task 18: Built-in preset definitions

**Files:**

- Create: `src/server/custom-format-presets.ts`

- [ ] **Step 1: Define preset data structures and initial presets**

```typescript
// src/server/custom-format-presets.ts
import type { CustomFormatSpecification } from "~/db/schema/custom-formats";

type PresetCF = {
  name: string;
  category: string;
  specifications: CustomFormatSpecification[];
  defaultScore: number;
  contentTypes: string[];
  description: string;
};

type Preset = {
  name: string;
  category: string; // "Video - Movies", "Video - TV", "Books - Ebook", "Books - Audiobook"
  contentType: string;
  mediaType: string;
  customFormats: PresetCF[];
  scores: Record<string, number>; // CF name -> profile score override
  suggestedItems: string; // Description of suggested tier grouping
  minCustomFormatScore: number;
  upgradeUntilCustomFormatScore: number;
};
```

Define at least one preset per category:

- **"HD Bluray + WEB"** (Video - Movies): Tiered release groups (Bluray Tier 01-03, WEB Tier 01-03), audio codecs (TrueHD ATMOS, DTS-X, etc.), unwanted (LQ, BR-DISK, 3D, x265 HD)
- **"HD WEB Streaming"** (Video - TV): WEB tier groups, audio codecs, season pack preference, unwanted
- **"Retail EPUB Preferred"** (Books - Ebook): Release group quality, retail vs scene, file format preference
- **"High Bitrate M4B"** (Books - Audiobook): Bitrate thresholds, narrator reputation, format preference

Each preset includes 10-30 custom format definitions with scores that mirror TRaSH Guide recommendations where applicable for video.

- [ ] **Step 2: Create preset application server function**

```typescript
export const applyPresetFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      profileId: z.number(),
      presetName: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const preset = PRESETS.find((p) => p.name === data.presetName);
    if (!preset) throw new Error("Preset not found");

    // Ensure all CFs exist (create if not, reuse by name if present)
    for (const cfDef of preset.customFormats) {
      const existing = await db
        .select()
        .from(customFormats)
        .where(eq(customFormats.name, cfDef.name))
        .get();

      if (!existing) {
        await db.insert(customFormats).values({
          ...cfDef,
          origin: "builtin",
          userModified: false,
          includeInRenaming: false,
          enabled: true,
        });
      }
    }

    // Get all CF IDs by name
    const allCFs = await db.select().from(customFormats).all();
    const cfByName = new Map(allCFs.map((cf) => [cf.name, cf]));

    // Set profile scores
    const scores = preset.customFormats
      .map((cfDef) => {
        const cf = cfByName.get(cfDef.name);
        if (!cf) return null;
        return {
          customFormatId: cf.id,
          score: preset.scores[cfDef.name] ?? cfDef.defaultScore,
        };
      })
      .filter(Boolean);

    // Bulk insert scores (after clearing existing)
    await bulkSetProfileCFScoresFn({
      data: { profileId: data.profileId, scores },
    });

    // Update profile CF score thresholds
    await db
      .update(downloadProfiles)
      .set({
        minCustomFormatScore: preset.minCustomFormatScore,
        upgradeUntilCustomFormatScore: preset.upgradeUntilCustomFormatScore,
      })
      .where(eq(downloadProfiles.id, data.profileId));

    return { applied: preset.name, cfCount: scores.length };
  });

export const getPresetsFn = createServerFn({ method: "GET" })
  .validator(z.object({ contentType: z.string(), mediaType: z.string() }))
  .handler(async ({ data }) => {
    await requireAuth();
    return PRESETS.filter(
      (p) =>
        p.contentType === data.contentType && p.mediaType === data.mediaType,
    ).map((p) => ({
      name: p.name,
      category: p.category,
      cfCount: p.customFormats.length,
      minScore: p.minCustomFormatScore,
      upgradeUntilScore: p.upgradeUntilCustomFormatScore,
    }));
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/server/custom-format-presets.ts
git commit -m "feat: add built-in custom format presets"
```

---

### Task 19: Preset selector UI

**Files:**

- Create: `src/components/settings/custom-formats/preset-selector.tsx`
- Modify: `src/components/settings/custom-formats/cf-score-section.tsx`

- [ ] **Step 1: Create preset selector dialog**

Create `src/components/settings/custom-formats/preset-selector.tsx`:

A dialog showing available presets for the profile's content/media type:

- Card layout with preset name, description, CF count, score thresholds
- "Apply" button on each card
- Warning text: "This will replace all current custom format scores for this profile"
- Calls `applyPresetFn` mutation on apply

- [ ] **Step 2: Wire into CF score section**

Add "Apply Preset" button in `cf-score-section.tsx` that opens `<PresetSelector>`.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/custom-formats/preset-selector.tsx src/components/settings/custom-formats/cf-score-section.tsx
git commit -m "feat: add preset selector to profile CF scores"
```

---

### Task 20: Import/Export

**Files:**

- Create: `src/server/custom-format-import-export.ts`
- Modify: `src/routes/_authed/settings/custom-formats.tsx`

- [ ] **Step 1: Create import/export server functions**

```typescript
// src/server/custom-format-import-export.ts

export const exportCustomFormatsFn = createServerFn({ method: "POST" })
  .validator(z.object({ customFormatIds: z.array(z.number()) }))
  .handler(async ({ data }) => {
    await requireAuth();
    const cfs = await db
      .select()
      .from(customFormats)
      .where(inArray(customFormats.id, data.customFormatIds))
      .all();

    return {
      customFormats: cfs.map((cf) => ({
        name: cf.name,
        category: cf.category,
        contentTypes: cf.contentTypes,
        defaultScore: cf.defaultScore,
        description: cf.description,
        specifications: cf.specifications,
        includeInRenaming: cf.includeInRenaming,
      })),
    };
  });

export const importCustomFormatsFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      customFormats: z.array(createCustomFormatSchema),
      mode: z.enum(["skip", "overwrite", "copy"]).default("skip"),
    }),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    let imported = 0;
    let skipped = 0;

    for (const cfData of data.customFormats) {
      const existing = await db
        .select()
        .from(customFormats)
        .where(eq(customFormats.name, cfData.name))
        .get();

      if (existing) {
        if (data.mode === "overwrite") {
          await db
            .update(customFormats)
            .set({ ...cfData, origin: "imported" })
            .where(eq(customFormats.id, existing.id));
          imported++;
        } else if (data.mode === "copy") {
          await db.insert(customFormats).values({
            ...cfData,
            name: `${cfData.name} (Imported)`,
            origin: "imported",
          });
          imported++;
        } else {
          skipped++;
        }
      } else {
        await db
          .insert(customFormats)
          .values({ ...cfData, origin: "imported" });
        imported++;
      }
    }

    invalidateCFCache();
    return { imported, skipped };
  });
```

- [ ] **Step 2: Add import/export UI to custom formats page**

In `src/routes/_authed/settings/custom-formats.tsx`:

- "Export Selected" button: Calls `exportCustomFormatsFn`, triggers JSON file download
- "Import" button: Opens file picker, parses JSON, calls `importCustomFormatsFn`, shows results toast
- Handle both Allstarr format and TRaSH Guide JSON format (detect by presence of `trash_id` field)

- [ ] **Step 3: Commit**

```bash
git add src/server/custom-format-import-export.ts src/routes/_authed/settings/custom-formats.tsx
git commit -m "feat: add custom format import/export"
```

---

## Phase 7: Migration & Cleanup

### Task 21: Migrate existing specifications to custom formats

**Files:**

- Modify: `src/db/seed.ts` or create migration script

- [ ] **Step 1: Write specification migration logic**

Create a migration function that:

1. Reads all `download_formats` with non-empty `specifications`
2. For each format with specs, creates a corresponding `custom_format`:
   - Name: auto-generated from format title + spec summary (e.g., "EPUB: releaseTitle match")
   - Category: inferred from format type (ebook → "File Format", audio → "Audiobook Quality", video → "Release Group")
   - Specifications: copied from format, with `name` auto-generated from `type + value`
   - Default score: derived from format weight
   - Content types: mapped from format type
   - Origin: null (user-created, since these are migrated user data)
3. For each profile that includes this format, create `profile_custom_formats` rows with scores

- [ ] **Step 2: Run migration and verify**

Run the migration script. Verify:

- Custom formats created for each format that had specifications
- Profile scores set appropriately
- No data loss

- [ ] **Step 3: Commit**

```bash
git add src/db/
git commit -m "feat: migrate existing format specifications to custom formats"
```

---

### Task 22: Remove specifications from download_formats

**Files:**

- Modify: `src/db/schema/download-formats.ts`
- Modify: `src/server/indexers/format-parser.ts`
- Modify: `src/server/download-profiles.ts`
- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Remove specifications from schema**

In `src/db/schema/download-formats.ts`, remove:

- The `FormatSpecification` type export (lines 4-11)
- The `specifications` column (lines 21-24)

- [ ] **Step 2: Update format parser**

In `src/server/indexers/format-parser.ts`:

- Remove `parseSpecs()` function
- Update `getFormatDefs()` to no longer load/filter by specs
- The `matchFormat` and `matchAllFormats` functions should now match purely by source/resolution/type identity (quality tier matching), NOT by specs
- All spec-based matching is now handled by the CF scoring engine in `cf-scoring.ts`

- [ ] **Step 3: Update validators**

In `src/lib/validators.ts`:

- Remove the old `specificationSchema` (lines 31-38)
- Remove `specifications` field from `createDownloadFormatSchema` (line 47)

- [ ] **Step 4: Update format CRUD**

In `src/server/download-profiles.ts`, remove any references to `specifications` in format create/update handlers.

- [ ] **Step 5: Update format management UI**

In `src/routes/_authed/settings/formats.tsx`, remove the specifications editing section from the format form (if one exists in the UI).

- [ ] **Step 6: Generate migration to drop column**

Run: `bun run db:generate`

This should generate a migration removing the `specifications` column from `download_formats`.

Run: `bun run db:migrate`

- [ ] **Step 7: Commit**

```bash
git add src/db/ src/server/ src/lib/validators.ts src/routes/_authed/settings/formats.tsx
git commit -m "refactor: remove specifications from download_formats, now handled by custom formats"
```

---

## Summary

| Phase | Tasks | Description                                            |
| ----- | ----- | ------------------------------------------------------ |
| 1     | 1-5   | Schema, validators, migration (additive, non-breaking) |
| 2     | 6-8   | Custom formats server API + query infrastructure       |
| 3     | 9-10  | Custom formats management UI                           |
| 4     | 11-14 | Quality tier grouping (items → number[][])             |
| 5     | 15-17 | CF scoring engine + profile editor integration         |
| 6     | 18-20 | Presets + import/export                                |
| 7     | 21-22 | Migrate existing specs, remove old specifications      |

Each phase produces a commit-able, independently testable increment. Phase 1-3 adds the custom formats entity without breaking anything. Phase 4 changes the items format (breaking change, deploy atomically). Phase 5 activates scoring. Phase 6-7 add polish and clean up.
