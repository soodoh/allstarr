# Book Series Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add series-level monitoring for books — series become first-class monitored entities with download profiles, a dedicated refresh task, and a new top-level Series page.

**Architecture:** Mirror the movie collections pattern. Add `monitored`/`updatedAt` columns to the existing `series` table and a `seriesDownloadProfiles` join table. A new scheduled task refreshes monitored series via `fetchSeriesComplete()`, auto-adding books and importing authors as needed. The new `/series` route and updated author Series tab both allow monitoring and profile management.

**Tech Stack:** TanStack Start, Drizzle ORM (SQLite), React Query, Zod, shadcn/ui

---

## Task 1: Schema — Add `monitored` and `updatedAt` to `series` Table

**Files:**
- Modify: `src/db/schema/series.ts`

- [ ] **Step 1: Add columns to series table**

In `src/db/schema/series.ts`, add `monitored` and `updatedAt` columns to the `series` table definition:

```typescript
// After the existing createdAt column, add:
monitored: integer("monitored", { mode: "boolean" })
    .notNull()
    .default(false),
updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
),
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run build`
Expected: Build succeeds (no type errors from the schema change)

- [ ] **Step 3: Generate migration**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run db:generate`
Expected: New migration file created in `drizzle/` adding the two columns

- [ ] **Step 4: Run migration**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run db:migrate`
Expected: Migration applies successfully

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/series.ts drizzle/
git commit -m "feat(series): add monitored and updatedAt columns to series table"
```

---

## Task 2: Schema — Create `seriesDownloadProfiles` Join Table

**Files:**
- Create: `src/db/schema/series-download-profiles.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create join table schema**

Create `src/db/schema/series-download-profiles.ts`:

```typescript
import { integer, sqliteTable, unique } from "drizzle-orm/sqlite-core";
import { downloadProfiles } from "./download-profiles";
import { series } from "./series";

export const seriesDownloadProfiles = sqliteTable(
    "series_download_profiles",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        seriesId: integer("series_id")
            .notNull()
            .references(() => series.id, { onDelete: "cascade" }),
        downloadProfileId: integer("download_profile_id")
            .notNull()
            .references(() => downloadProfiles.id, { onDelete: "cascade" }),
    },
    (t) => [unique().on(t.seriesId, t.downloadProfileId)],
);
```

- [ ] **Step 2: Export from schema index**

In `src/db/schema/index.ts`, add this line in alphabetical order (between the `series` and `settings` exports):

```typescript
export * from "./series-download-profiles";
```

- [ ] **Step 3: Generate and run migration**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run db:generate && bun run db:migrate`
Expected: Migration creates `series_download_profiles` table

- [ ] **Step 4: Verify build**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/series-download-profiles.ts src/db/schema/index.ts drizzle/
git commit -m "feat(series): add seriesDownloadProfiles join table"
```

---

## Task 3: Validators — Add Series Schemas

**Files:**
- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Add series Zod schemas**

At the end of `src/lib/validators.ts` (before the closing of the file), add:

```typescript
// ─── Series ──────────────────────────────────────────────────────────────

export const updateSeriesSchema = z.object({
    id: z.number(),
    monitored: z.boolean().optional(),
    downloadProfileIds: z.array(z.number()).optional(),
});

export const refreshSeriesSchema = z.object({
    seriesId: z.number().optional(),
});
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/lib/validators.ts
git commit -m "feat(series): add updateSeries and refreshSeries Zod schemas"
```

---

## Task 4: Query Keys — Add Series Namespace

**Files:**
- Modify: `src/lib/query-keys.ts`

- [ ] **Step 1: Add series query keys**

In `src/lib/query-keys.ts`, add a new `series` block after the `books` block (around line 53):

```typescript
// ─── Series ─────────────────────────────────────────────────────────────
series: {
    all: ["series"] as const,
    list: () => ["series", "list"] as const,
},
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/lib/query-keys.ts
git commit -m "feat(series): add series query key namespace"
```

---

## Task 5: Server Functions — Create `src/server/series.ts`

**Files:**
- Create: `src/server/series.ts`

This file contains three server functions: `getSeriesListFn`, `updateSeriesFn`, and `refreshSeriesFn`. The refresh logic (auto-add books, import authors) is implemented in Task 6 as a helper called by both the server function and the scheduled task.

- [ ] **Step 1: Create getSeriesListFn**

Create `src/server/series.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "src/db";
import {
    books,
    editionDownloadProfiles,
    editions,
    series,
    seriesBookLinks,
    seriesDownloadProfiles,
} from "src/db/schema";
import { updateSeriesSchema } from "src/lib/validators";
import { requireAuth } from "./middleware";

// ─── Get Series List ────────────────────────────────────────────────────
// Returns all series containing at least one monitored book.
// A "monitored book" = has at least one edition with a download profile.

export const getSeriesListFn = createServerFn({ method: "GET" }).handler(
    async () => {
        await requireAuth();

        // Find series IDs that have at least one monitored book
        const seriesWithMonitoredBooks = db
            .selectDistinct({ seriesId: seriesBookLinks.seriesId })
            .from(seriesBookLinks)
            .where(
                sql`EXISTS (
                    SELECT 1 FROM ${editionDownloadProfiles}
                    INNER JOIN ${editions} ON ${editions.id} = ${editionDownloadProfiles.editionId}
                    WHERE ${editions.bookId} = ${seriesBookLinks.bookId}
                )`,
            )
            .all();

        const seriesIds = seriesWithMonitoredBooks.map((r) => r.seriesId);
        if (seriesIds.length === 0) {
            return [];
        }

        // Fetch series records
        const seriesRecords = db
            .select()
            .from(series)
            .where(inArray(series.id, seriesIds))
            .all();

        // Fetch all book links for these series
        const allLinks = db
            .select()
            .from(seriesBookLinks)
            .where(inArray(seriesBookLinks.seriesId, seriesIds))
            .all();

        // Fetch download profile assignments for these series
        const allProfileLinks = db
            .select()
            .from(seriesDownloadProfiles)
            .where(inArray(seriesDownloadProfiles.seriesId, seriesIds))
            .all();

        return seriesRecords.map((s) => {
            const bookLinks = allLinks.filter((l) => l.seriesId === s.id);
            const profileIds = allProfileLinks
                .filter((pl) => pl.seriesId === s.id)
                .map((pl) => pl.downloadProfileId);

            return {
                ...s,
                bookCount: bookLinks.length,
                books: bookLinks.map((l) => ({
                    bookId: l.bookId,
                    position: l.position,
                })),
                downloadProfileIds: profileIds,
            };
        });
    },
);

// ─── Update Series ──────────────────────────────────────────────────────

export const updateSeriesFn = createServerFn({ method: "POST" })
    .inputValidator((d: unknown) => updateSeriesSchema.parse(d))
    .handler(async ({ data }) => {
        await requireAuth();

        const { id, downloadProfileIds, ...updates } = data;

        db.update(series)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(series.id, id))
            .run();

        if (downloadProfileIds !== undefined) {
            db.delete(seriesDownloadProfiles)
                .where(eq(seriesDownloadProfiles.seriesId, id))
                .run();
            for (const profileId of downloadProfileIds) {
                db.insert(seriesDownloadProfiles)
                    .values({ seriesId: id, downloadProfileId: profileId })
                    .run();
            }
        }

        return { success: true };
    });
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/server/series.ts
git commit -m "feat(series): add getSeriesListFn and updateSeriesFn server functions"
```

---

## Task 6: Server Functions — Series Refresh Logic

**Files:**
- Modify: `src/server/series.ts`

This adds `refreshSeriesInternal` (the core refresh logic) and `refreshSeriesFn` (the public server function). The refresh discovers new books in monitored series, imports authors if needed, and monitors books with the series' download profiles.

- [ ] **Step 1: Add refresh imports and helper**

At the top of `src/server/series.ts`, add these additional imports:

```typescript
import {
    authors,
    bookImportListExclusions,
    books,
    editionDownloadProfiles,
    editions,
    history,
    series,
    seriesBookLinks,
    seriesDownloadProfiles,
} from "src/db/schema";
import { refreshSeriesSchema, updateSeriesSchema } from "src/lib/validators";
import { fetchSeriesComplete } from "./hardcover/import-queries";
import { ensureEditionProfileLinks, importAuthorInternal } from "./import";
import { getMetadataProfile, getProfileLanguages } from "./metadata-profile";
```

Note: You'll need to verify the exact import paths for `importAuthorInternal`, `ensureEditionProfileLinks`, `getMetadataProfile`, and `getProfileLanguages`. Check that `importAuthorInternal` and `ensureEditionProfileLinks` are exported from `src/server/import.ts`. If they aren't, add `export` to their declarations.

- [ ] **Step 2: Add refreshSeriesInternal function**

Add after the `updateSeriesFn` in `src/server/series.ts`:

```typescript
// ─── Refresh Series (Internal) ──────────────────────────────────────────

export async function refreshSeriesInternal(
    seriesId?: number,
    updateProgress: (message: string) => void = () => {},
): Promise<{ seriesRefreshed: number; booksAdded: number; authorsImported: number; errors: number }> {
    const targetSeries = seriesId
        ? db.select().from(series).where(eq(series.id, seriesId)).all()
        : db.select().from(series).where(eq(series.monitored, true)).all();

    if (targetSeries.length === 0) {
        return { seriesRefreshed: 0, booksAdded: 0, authorsImported: 0, errors: 0 };
    }

    // Get excluded foreign book IDs
    const exclusions = db
        .select({ foreignBookId: bookImportListExclusions.foreignBookId })
        .from(bookImportListExclusions)
        .all();
    const excludedForeignIds = new Set(exclusions.map((e) => e.foreignBookId));

    // Get existing foreign book IDs
    const existingBooks = db
        .select({ foreignBookId: books.foreignBookId })
        .from(books)
        .all();
    const existingForeignBookIds = new Set(
        existingBooks.filter((b) => b.foreignBookId).map((b) => b.foreignBookId),
    );

    // Get language codes from metadata profile
    const profileLanguages = getProfileLanguages();
    const langCodes = profileLanguages.length > 0 ? profileLanguages : ["en"];

    let totalBooksAdded = 0;
    let totalAuthorsImported = 0;
    let totalErrors = 0;

    for (const s of targetSeries) {
        if (!s.foreignSeriesId) {
            continue;
        }

        try {
            updateProgress(`Refreshing series: ${s.title}`);

            // Fetch complete series from Hardcover (all authors, no exclusions)
            const rawSeriesList = await fetchSeriesComplete(
                [Number(s.foreignSeriesId)],
                langCodes,
                0, // excludeAuthorId=0 means include all authors
            );

            if (rawSeriesList.length === 0) {
                continue;
            }

            const rawSeries = rawSeriesList[0];

            // Update series metadata
            db.update(series)
                .set({
                    title: rawSeries.title,
                    slug: rawSeries.slug,
                    isCompleted: rawSeries.isCompleted,
                    metadataUpdatedAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(series.id, s.id))
                .run();

            // Get series download profiles for auto-added books
            const seriesProfiles = db
                .select({ downloadProfileId: seriesDownloadProfiles.downloadProfileId })
                .from(seriesDownloadProfiles)
                .where(eq(seriesDownloadProfiles.seriesId, s.id))
                .all();
            const seriesProfileIds = seriesProfiles.map((p) => p.downloadProfileId);

            // Find new books not yet in library
            for (const rawBook of rawSeries.books) {
                const foreignBookId = String(rawBook.bookId);

                // Skip if already exists or excluded
                if (existingForeignBookIds.has(foreignBookId)) {
                    continue;
                }
                if (excludedForeignIds.has(foreignBookId)) {
                    continue;
                }

                // Determine if the author exists locally
                const authorForeignId = rawBook.authorId ? String(rawBook.authorId) : null;
                if (!authorForeignId) {
                    continue;
                }

                const existingAuthor = db
                    .select({ id: authors.id })
                    .from(authors)
                    .where(eq(authors.foreignAuthorId, authorForeignId))
                    .get();

                try {
                    if (!existingAuthor) {
                        // Import author with monitoring disabled
                        updateProgress(`Importing author: ${rawBook.authorName ?? "Unknown"}`);
                        await importAuthorInternal({
                            foreignAuthorId: rawBook.authorId!,
                            downloadProfileIds: seriesProfileIds,
                            monitorOption: "none",
                            monitorNewBooks: "none",
                        });
                        totalAuthorsImported += 1;
                    }

                    // The book should now exist from the author import.
                    // Ensure it's monitored with the series' download profiles.
                    const importedBook = db
                        .select({ id: books.id })
                        .from(books)
                        .where(eq(books.foreignBookId, foreignBookId))
                        .get();

                    if (importedBook && seriesProfileIds.length > 0) {
                        // Use existing helper for proper edition-profile matching
                        ensureEditionProfileLinks(importedBook.id, seriesProfileIds);

                        db.insert(history)
                            .values({
                                eventType: "bookAdded",
                                bookId: importedBook.id,
                                data: {
                                    title: rawBook.bookTitle,
                                    source: "series-refresh",
                                    seriesId: s.id,
                                    seriesTitle: s.title,
                                },
                            })
                            .run();

                        totalBooksAdded += 1;
                    }

                    existingForeignBookIds.add(foreignBookId);
                } catch (error) {
                    console.error(`Failed to import book ${rawBook.bookTitle} for series ${s.title}:`, error);
                    totalErrors += 1;
                }
            }
        } catch (error) {
            console.error(`Failed to refresh series ${s.title}:`, error);
            totalErrors += 1;
        }
    }

    return {
        seriesRefreshed: targetSeries.length,
        booksAdded: totalBooksAdded,
        authorsImported: totalAuthorsImported,
        errors: totalErrors,
    };
}
```

- [ ] **Step 3: Add refreshSeriesFn server function**

Add after `refreshSeriesInternal`:

```typescript
// ─── Refresh Series (Public) ────────────────────────────────────────────

export const refreshSeriesFn = createServerFn({ method: "POST" })
    .inputValidator((d: unknown) => refreshSeriesSchema.parse(d))
    .handler(async ({ data }) => {
        await requireAuth();
        return refreshSeriesInternal(data.seriesId);
    });
```

- [ ] **Step 4: Ensure importAuthorInternal is exported**

In `src/server/import.ts`, check that `importAuthorInternal` (around line 439) has an `export` keyword. If it doesn't, add `export` to make it:

```typescript
export async function importAuthorInternal(
```

Also verify that `ensureEditionProfileLinks` is exported (around line 359) — the refresh logic in Step 2 calls it for proper edition-profile matching.

- [ ] **Step 5: Verify build**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run build`
Expected: Build succeeds. Fix any import path issues.

- [ ] **Step 6: Commit**

```bash
git add src/server/series.ts src/server/import.ts
git commit -m "feat(series): add series refresh logic with auto-import"
```

---

## Task 7: Scheduled Task — Register Series Refresh

**Files:**
- Create: `src/server/scheduler/tasks/refresh-series-metadata.ts`
- Modify: `src/server/scheduler/index.ts`

- [ ] **Step 1: Create task file**

Create `src/server/scheduler/tasks/refresh-series-metadata.ts`:

```typescript
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";
import { refreshSeriesInternal } from "src/server/series";

registerTask({
    id: "refresh-series-metadata",
    name: "Refresh Series Metadata",
    description:
        "Refresh metadata for all monitored book series from Hardcover. Discovers and imports new books and authors.",
    defaultInterval: 12 * 60 * 60, // 12 hours
    group: "metadata",
    handler: async (updateProgress): Promise<TaskResult> => {
        const result = await refreshSeriesInternal(undefined, updateProgress);

        if (result.seriesRefreshed === 0) {
            return { success: true, message: "No monitored series" };
        }

        const parts: string[] = [];
        parts.push(`${result.seriesRefreshed} series`);
        if (result.booksAdded > 0) {
            parts.push(`${result.booksAdded} books added`);
        }
        if (result.authorsImported > 0) {
            parts.push(`${result.authorsImported} authors imported`);
        }
        if (result.errors > 0) {
            parts.push(`${result.errors} errors`);
        }

        return {
            success: result.errors === 0,
            message: `Refreshed ${parts.join(", ")}`,
        };
    },
});
```

- [ ] **Step 2: Register task in scheduler index**

In `src/server/scheduler/index.ts`, add this import after the other task imports (around line 18):

```typescript
import "./tasks/refresh-series-metadata";
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run build`
Expected: Build succeeds. The task will auto-seed into `scheduledTasks` table on next startup.

- [ ] **Step 4: Commit**

```bash
git add src/server/scheduler/tasks/refresh-series-metadata.ts src/server/scheduler/index.ts
git commit -m "feat(series): add refresh-series-metadata scheduled task"
```

---

## Task 8: Query & Mutation Hooks

**Files:**
- Create: `src/lib/queries/series.ts`
- Create: `src/hooks/mutations/series.ts`

- [ ] **Step 1: Create series query**

Create `src/lib/queries/series.ts`:

```typescript
import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getSeriesListFn } from "src/server/series";

export const seriesListQuery = () =>
    queryOptions({
        queryKey: queryKeys.series.list(),
        queryFn: () => getSeriesListFn(),
    });
```

- [ ] **Step 2: Create series mutation hooks**

Create `src/hooks/mutations/series.ts`:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import type { updateSeriesSchema } from "src/lib/validators";
import { refreshSeriesFn, updateSeriesFn } from "src/server/series";
import type { z } from "zod";

export function useUpdateSeries() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: z.infer<typeof updateSeriesSchema>) =>
            updateSeriesFn({ data }),
        onSuccess: () => {
            toast.success("Series updated");
            queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
        },
        onError: () => toast.error("Failed to update series"),
    });
}

export function useRefreshSeries() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data?: { seriesId?: number }) =>
            refreshSeriesFn({ data: data ?? {} }),
        onSuccess: (data) => {
            const msg =
                data.booksAdded > 0
                    ? `Refreshed series, added ${data.booksAdded} book${data.booksAdded === 1 ? "" : "s"}`
                    : "Series refreshed, no new books";
            toast.success(msg);
            queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
        },
        onError: () => toast.error("Failed to refresh series"),
    });
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/series.ts src/hooks/mutations/series.ts
git commit -m "feat(series): add series query and mutation hooks"
```

---

## Task 9: Sidebar Navigation — Add Series Link

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Add Layers icon import**

In `src/components/layout/app-sidebar.tsx`, add `Layers` to the lucide-react import (line 3-18). This icon represents series/stacking well:

```typescript
import {
    Activity,
    BookOpen,
    BookOpenText,
    Calendar,
    Download,
    Film,
    FolderOpen,
    History,
    Layers,
    Library as LibraryIcon,
    Monitor,
    Plus,
    Settings,
    ShieldBan,
    Tv,
    Users,
} from "lucide-react";
```

- [ ] **Step 2: Add Series nav item to Books group**

In the `navGroups` array (line 53), update the Books group to add Series and include `/series` in matchPrefixes:

```typescript
{
    title: "Books",
    to: "/books",
    icon: LibraryIcon,
    matchPrefixes: ["/books", "/authors", "/series"],
    children: [
        { title: "Add New", to: "/books/add", icon: Plus },
        { title: "Authors", to: "/authors", icon: Users },
        { title: "Series", to: "/series", icon: Layers },
        { title: "Books", to: "/books", icon: BookOpen },
    ],
},
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat(series): add Series link to Books sidebar group"
```

---

## Task 10: Series List Page — Route and UI

**Files:**
- Create: `src/routes/_authed/series/index.tsx`

This is the largest task. The page reuses the expandable series row pattern from the author's Series tab. It fetches local series via `getSeriesListFn` and merges Hardcover data via the existing `hardcoverSeriesCompleteQuery`.

- [ ] **Step 1: Create the series route file**

Create `src/routes/_authed/series/index.tsx`. This page should:

1. Use `seriesListQuery()` in the route loader
2. Fetch Hardcover series data for all series with `foreignSeriesId` using the existing `getSeriesFromHardcoverFn` / `hardcoverSeriesCompleteQuery` pattern
3. Display expandable series rows with the same structure as the author Series tab
4. Add series-level monitoring toggle (calls `useUpdateSeries`)
5. Add filter/search by series name
6. Add language filter

The page structure should closely follow the `SeriesTab` component from `src/routes/_authed/authors/$authorId.tsx` (lines 782-1455), but adapted to:
- Load data from `seriesListQuery()` instead of receiving it as props from the author page
- Show all series with monitored books (not scoped to a single author)
- Include a `PageHeader` with "Series" title and a "Refresh All" button
- Add a monitoring toggle and edit-profiles button per series row

Key implementation details:
- Reuse the `MergedSeriesEntry` type pattern (local vs external books)
- Reuse `dedupeByPosition` and `filterPartialEditions` logic
- Use the existing `BookPreviewModal` for external book previews
- Use `ProfileCheckboxGroup` for series download profile editing (in a dialog)

Since this is a large component, the implementer should reference the author Series tab code and adapt it. The core rendering loop, dedup logic, and Hardcover merging should be extracted to shared utilities if the duplication is significant, or inlined if the pages diverge enough.

- [ ] **Step 2: Verify build and dev server**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run build`
Expected: Build succeeds. Route auto-generates in `src/routeTree.gen.ts`.

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run dev`
Navigate to `http://localhost:3000/series` — page should load (may be empty if no monitored books exist).

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authed/series/index.tsx src/routeTree.gen.ts
git commit -m "feat(series): add top-level Series page with expandable rows"
```

---

## Task 11: Author Series Tab — Add Monitoring Controls

**Files:**
- Modify: `src/routes/_authed/authors/$authorId.tsx`

- [ ] **Step 1: Add series mutation import**

Add the import for the series mutation hook near the top of the file:

```typescript
import { useUpdateSeries } from "src/hooks/mutations/series";
```

- [ ] **Step 2: Add monitoring toggle to series row headers**

Inside the `SeriesTab` component, find the series row header (the expandable button for each series, around line 1102-1127). Add a monitoring toggle button before or after the series title. This should be a small icon button that:
- Shows a filled bookmark/monitor icon when `monitored === true`
- Shows an outline bookmark icon when `monitored === false`
- Calls `updateSeries.mutate({ id: seriesId, monitored: !currentMonitored })` on click
- Stops event propagation so it doesn't toggle the expand/collapse

You'll need to pass the series' `monitored` and `downloadProfileIds` status. Currently `AuthorSeries` type (lines 200-207) doesn't include `monitored`. Update the `getAuthorFn` server function to include `monitored` and `downloadProfileIds` in the series data it returns, or query it separately.

The simplest approach: extend the `seriesLinks` query in `getAuthorFn` (in `src/server/authors.ts`) to also select `series.monitored`, and include it in the `AuthorSeries` type.

- [ ] **Step 3: Add edit-profiles button per series**

Add a small gear/settings icon button next to the monitoring toggle that opens a dialog for editing the series' download profiles. This dialog should contain:
- `ProfileCheckboxGroup` for selecting download profiles (filtered to ebook/audiobook)
- Save/Cancel buttons
- On save: calls `updateSeries.mutate({ id: seriesId, downloadProfileIds: selectedIds })`

- [ ] **Step 4: Verify build and test**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run build`
Expected: Build succeeds.

Manually verify: navigate to an author with series, toggle monitoring, edit profiles.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authed/authors/$authorId.tsx src/server/authors.ts
git commit -m "feat(series): add monitoring toggle and profile editor to author Series tab"
```

---

## Task 12: Book Add Flow — "Monitor Book & Series" Option

**Files:**
- Modify: `src/components/bookshelf/hardcover/book-preview-modal.tsx`
- Modify: `src/server/import.ts`

- [ ] **Step 1: Add monitorSeries option to import schema**

In `src/server/import.ts`, update `importBookSchema` (around line 413) to add a `monitorSeries` boolean:

```typescript
const importBookSchema = z.object({
    foreignBookId: z.number().int().positive(),
    downloadProfileIds: z.array(z.number().int().positive()).default([]),
    monitorOption: monitorOptionEnum,
    monitorNewBooks: z.enum(["all", "none", "new"]).default("all"),
    searchOnAdd: z.boolean().default(false),
    monitorSeries: z.boolean().default(false),
});
```

- [ ] **Step 2: Handle monitorSeries in importBookHandler**

In `importBookHandler` (around line 897), after the book is successfully imported and editions are linked (around line 1127), add logic to handle series monitoring:

```typescript
// After ensureEditionProfileLinks and before co-author cascade
if (data.monitorSeries) {
    // Find all series this book belongs to
    const bookSeriesLinks = db
        .select({ seriesId: seriesBookLinks.seriesId })
        .from(seriesBookLinks)
        .where(eq(seriesBookLinks.bookId, txResult.bookId))
        .all();

    for (const link of bookSeriesLinks) {
        // Set series as monitored
        db.update(series)
            .set({ monitored: true, updatedAt: new Date() })
            .where(eq(series.id, link.seriesId))
            .run();

        // Copy download profiles to series (if it doesn't have any)
        const existingProfiles = db
            .select()
            .from(seriesDownloadProfiles)
            .where(eq(seriesDownloadProfiles.seriesId, link.seriesId))
            .all();

        if (existingProfiles.length === 0) {
            for (const profileId of data.downloadProfileIds) {
                db.insert(seriesDownloadProfiles)
                    .values({
                        seriesId: link.seriesId,
                        downloadProfileId: profileId,
                    })
                    .onConflictDoNothing()
                    .run();
            }
        }

        // Trigger immediate series refresh
        void refreshSeriesInternal(link.seriesId).catch((error) =>
            console.error("Series refresh after book add failed:", error),
        );
    }
}
```

Add the necessary imports at the top of `import.ts`:
```typescript
import { seriesDownloadProfiles } from "src/db/schema";
import { refreshSeriesInternal } from "./series";
```

- [ ] **Step 3: Add "Monitor Series" checkbox to book preview modal**

In `src/components/bookshelf/hardcover/book-preview-modal.tsx`, inside the `AddBookForm` component:

Add state for `monitorSeries`:
```typescript
const [monitorSeries, setMonitorSeries] = useState(false);
```

Add a checkbox after the "Start search for new book" checkbox (around line 193), only visible when the book has series data:

```typescript
{bookDetail?.series && bookDetail.series.length > 0 && (
    <div className="flex items-center gap-2">
        <Checkbox
            id="monitor-series"
            checked={monitorSeries}
            onCheckedChange={(checked) => setMonitorSeries(Boolean(checked))}
        />
        <Label htmlFor="monitor-series" className="text-sm cursor-pointer">
            Monitor series ({bookDetail.series.map((s) => s.title).join(", ")})
        </Label>
    </div>
)}
```

Pass `monitorSeries` in the `importBook.mutate()` call:
```typescript
importBook.mutate({
    foreignBookId: Number(book.id),
    downloadProfileIds,
    monitorOption,
    monitorNewBooks,
    searchOnAdd,
    monitorSeries,
});
```

Also add `bookDetail` to the `AddBookFormProps` type destructuring — it's currently `_bookDetail` (unused). Change it to `bookDetail` and use it.

- [ ] **Step 4: Verify build**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/server/import.ts src/components/bookshelf/hardcover/book-preview-modal.tsx
git commit -m "feat(series): add 'Monitor Series' option to book add flow"
```

---

## Task 13: End-to-End Verification

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

Run: `cd /Users/pauldiloreto/Projects/allstarr/.claude/worktrees/book-series && bun run dev`

- [ ] **Step 2: Verify Series page**

Navigate to `http://localhost:3000/series`. Should load (empty if no monitored books).

- [ ] **Step 3: Verify sidebar**

Check that "Series" appears in the Books sidebar group between "Authors" and "Books".

- [ ] **Step 4: Verify system tasks**

Navigate to `http://localhost:3000/system/tasks`. "Refresh Series Metadata" should appear in the metadata group.

- [ ] **Step 5: Verify author Series tab**

Navigate to an author with series. The Series tab should show monitoring toggles and profile edit buttons per series.

- [ ] **Step 6: Verify book add flow**

Search for a book that has series associations. Open the add dialog. The "Monitor series" checkbox should appear when the book has series data.

- [ ] **Step 7: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during series monitoring verification"
```
