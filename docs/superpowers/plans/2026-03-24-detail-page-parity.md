# Detail Page Parity & Edit Modal Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring all detail pages to feature parity with standardized action buttons, enhanced edit modals with content-type-specific options, and a book deletion exclusion system.

**Architecture:** Schema-first approach — add new columns and tables, then update validators/server functions, then mutation hooks, then UI. The per-profile monitoring pattern (authors + TV shows) shares a component extension to `ProfileCheckboxGroup`. The book delete dialog is a custom component since `ConfirmDialog` doesn't support children.

**Tech Stack:** TanStack Start, Drizzle ORM (SQLite), shadcn/ui, Zod, React

**Spec:** `docs/superpowers/specs/2026-03-24-detail-page-parity-design.md`

---

## Phase 1: Schema & Validators

### Task 1: Add `autoSwitchEdition` column to books table

**Files:**

- Modify: `src/db/schema/books.ts:33-35`

- [ ] **Step 1: Add column**

Add after the `updatedAt` column (before the closing parenthesis):

```typescript
autoSwitchEdition: integer("auto_switch_edition").default(1).notNull(),
```

- [ ] **Step 2: Generate migration**

Run: `bun run db:generate`

- [ ] **Step 3: Run migration**

Run: `bun run db:migrate`

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/books.ts drizzle/
git commit -m "feat: add autoSwitchEdition column to books table"
```

---

### Task 2: Create `bookImportListExclusions` table

**Files:**

- Create: `src/db/schema/book-import-list-exclusions.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create schema file**

Create `src/db/schema/book-import-list-exclusions.ts`:

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const bookImportListExclusions = sqliteTable(
  "book_import_list_exclusions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    foreignBookId: text("foreign_book_id").unique().notNull(),
    title: text("title").notNull(),
    authorName: text("author_name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);
```

- [ ] **Step 2: Export from index**

Add to `src/db/schema/index.ts`:

```typescript
export * from "./book-import-list-exclusions";
```

- [ ] **Step 3: Generate and run migration**

Run: `bun run db:generate && bun run db:migrate`

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/book-import-list-exclusions.ts src/db/schema/index.ts drizzle/
git commit -m "feat: create bookImportListExclusions table"
```

---

### Task 3: Add `monitorNewBooks` to `authorDownloadProfiles` junction

**Files:**

- Modify: `src/db/schema/author-download-profiles.ts:5-17`

- [ ] **Step 1: Add column**

Add after the `downloadProfileId` column:

```typescript
monitorNewBooks: text("monitor_new_books").default("all").notNull(),
```

- [ ] **Step 2: Generate and run migration**

Run: `bun run db:generate && bun run db:migrate`

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/author-download-profiles.ts drizzle/
git commit -m "feat: add monitorNewBooks column to authorDownloadProfiles"
```

---

### Task 4: Add `monitorNewSeasons` to `showDownloadProfiles` junction

**Files:**

- Modify: `src/db/schema/show-download-profiles.ts:5-17`

- [ ] **Step 1: Add column**

Add after the `downloadProfileId` column:

```typescript
monitorNewSeasons: text("monitor_new_seasons").default("all").notNull(),
```

- [ ] **Step 2: Generate and run migration**

Run: `bun run db:generate && bun run db:migrate`

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/show-download-profiles.ts drizzle/
git commit -m "feat: add monitorNewSeasons column to showDownloadProfiles"
```

---

### Task 5: Add `useSeasonFolder` to `shows` table

**Files:**

- Modify: `src/db/schema/shows.ts:3-30`

- [ ] **Step 1: Add column**

Add after the `updatedAt` column:

```typescript
useSeasonFolder: integer("use_season_folder").default(1).notNull(),
```

- [ ] **Step 2: Generate and run migration**

Run: `bun run db:generate && bun run db:migrate`

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/shows.ts drizzle/
git commit -m "feat: add useSeasonFolder column to shows table"
```

---

### Task 6: Add new validators

**Files:**

- Modify: `src/lib/validators.ts:198-201`
- Modify: `src/lib/tmdb-validators.ts:18-22`

- [ ] **Step 1: Add shared enum and book schemas to `validators.ts`**

Add the shared monitoring enum near the top of the file (after existing imports):

```typescript
export const monitorNewItemsEnum = z.enum(["all", "none", "new"]);
```

Add new book schemas after the existing `updateAuthorSchema`:

```typescript
export const updateBookSchema = z.object({
  id: z.number(),
  autoSwitchEdition: z.boolean(),
});

export const deleteBookSchema = z.object({
  id: z.number(),
  deleteFiles: z.boolean().default(false),
  addImportExclusion: z.boolean().default(false),
});

export const addImportListExclusionSchema = z.object({
  foreignBookId: z.string(),
  title: z.string(),
  authorName: z.string(),
});

export const removeImportListExclusionSchema = z.object({
  id: z.number(),
});
```

- [ ] **Step 2: Update `updateAuthorSchema` in `validators.ts`**

Replace the existing `updateAuthorSchema` (lines 198-201):

```typescript
export const updateAuthorSchema = z.object({
  id: z.number(),
  downloadProfiles: z.array(
    z.object({
      downloadProfileId: z.number(),
      monitorNewBooks: monitorNewItemsEnum,
    }),
  ),
});
```

- [ ] **Step 3: Update `updateShowSchema` in `tmdb-validators.ts`**

Replace the existing `updateShowSchema` (lines 18-22). Import `monitorNewItemsEnum` from `./validators`:

```typescript
import { monitorNewItemsEnum } from "./validators";

export const updateShowSchema = z.object({
  id: z.number(),
  downloadProfiles: z.array(
    z.object({
      downloadProfileId: z.number(),
      monitorNewSeasons: monitorNewItemsEnum,
    }),
  ),
  useSeasonFolder: z.boolean(),
  seriesType: z.enum(["standard", "daily", "anime"]).optional(),
});
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`

Fix any type errors from the schema changes — callers of `updateAuthorFn` and `updateShowFn` will break here since the input shape changed. That's expected; we'll fix the callers in later tasks.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators.ts src/lib/tmdb-validators.ts
git commit -m "feat: add new validators and update author/show schemas"
```

---

## Phase 2: Server Functions & Mutations

### Task 7: Add `updateBookFn` server function and mutation hook

**Files:**

- Modify: `src/server/books.ts`
- Modify: `src/hooks/mutations/books.ts`

- [ ] **Step 1: Add `updateBookFn` to `src/server/books.ts`**

Add near the existing book server functions. Import `updateBookSchema` from `src/lib/validators`. Follow the existing pattern from `updateAuthorFn`:

```typescript
export const updateBookFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateBookSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...updates } = data;
    db.update(books)
      .set({
        autoSwitchEdition: updates.autoSwitchEdition ? 1 : 0,
        updatedAt: new Date(),
      })
      .where(eq(books.id, id))
      .run();
    return { success: true };
  });
```

- [ ] **Step 2: Add `useUpdateBook` mutation hook**

Add to `src/hooks/mutations/books.ts`:

```typescript
export function useUpdateBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number; autoSwitchEdition: boolean }) =>
      updateBookFn({ data }),
    onSuccess: () => {
      toast.success("Book updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
    },
    onError: () => {
      toast.error("Failed to update book");
    },
  });
}
```

Add the import for `updateBookFn` at the top of the file.

- [ ] **Step 3: Commit**

```bash
git add src/server/books.ts src/hooks/mutations/books.ts
git commit -m "feat: add updateBookFn server function and useUpdateBook hook"
```

---

### Task 8: Extend `deleteBookFn` with file deletion and import exclusion

**Files:**

- Modify: `src/server/books.ts:988-1016`
- Modify: `src/hooks/mutations/books.ts`

- [ ] **Step 1: Update `deleteBookFn` in `src/server/books.ts`**

Replace the existing `deleteBookFn`. Import `deleteBookSchema` from validators, `bookImportListExclusions` and `bookFiles` from schema, and `fs` from `node:fs`. Follow the `deleteMovieFn` pattern (lines 225-264 in `src/server/movies.ts`) for file deletion:

```typescript
export const deleteBookFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deleteBookSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const book = db.select().from(books).where(eq(books.id, data.id)).get();

    if (!book) throw new Error("Book not found");

    // Get primary author for history
    const primaryAuthor = db
      .select()
      .from(booksAuthors)
      .where(
        and(eq(booksAuthors.bookId, data.id), eq(booksAuthors.isPrimary, true)),
      )
      .get();

    // Delete files from disk if requested
    if (data.deleteFiles) {
      const files = db
        .select({ path: bookFiles.path })
        .from(bookFiles)
        .where(eq(bookFiles.bookId, data.id))
        .all();
      for (const file of files) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // File may already be missing
        }
      }
    }

    // Add to import exclusion list if requested
    if (data.addImportExclusion && book.foreignBookId) {
      db.insert(bookImportListExclusions)
        .values({
          foreignBookId: book.foreignBookId,
          title: book.title,
          authorName: primaryAuthor?.authorName ?? "Unknown",
        })
        .onConflictDoNothing()
        .run();
    }

    // Delete book (cascades to editions, files, etc.)
    db.delete(books).where(eq(books.id, data.id)).run();

    // Log history
    db.insert(history)
      .values({
        eventType: "bookDeleted",
        authorId: primaryAuthor?.authorId,
        data: { title: book.title },
      })
      .run();

    return { success: true };
  });
```

- [ ] **Step 2: Update `useDeleteBook` mutation hook**

Update the hook in `src/hooks/mutations/books.ts` to pass the full schema data:

```typescript
export function useDeleteBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      id: number;
      deleteFiles: boolean;
      addImportExclusion: boolean;
    }) => deleteBookFn({ data }),
    onSuccess: () => {
      toast.success("Book deleted");
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => {
      toast.error("Failed to delete book");
    },
  });
}

// Follow the existing pattern in this file — use useQueryClient + specific query key
// invalidation, not useRouter().invalidate().
```

- [ ] **Step 3: Commit**

```bash
git add src/server/books.ts src/hooks/mutations/books.ts
git commit -m "feat: extend deleteBookFn with file deletion and import exclusion"
```

---

### Task 9: Create import list exclusion server functions

**Files:**

- Create: `src/server/import-list-exclusions.ts`

- [ ] **Step 1: Create server functions**

Create `src/server/import-list-exclusions.ts` with three functions following existing patterns in `src/server/blocklist.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "src/db";
import { bookImportListExclusions } from "src/db/schema";
import { removeImportListExclusionSchema } from "src/lib/validators";
import { requireAuth } from "./middleware";

export const getImportListExclusionsFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ page: z.number().default(1), limit: z.number().default(50) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const offset = (data.page - 1) * data.limit;
    const items = db
      .select()
      .from(bookImportListExclusions)
      .orderBy(bookImportListExclusions.createdAt)
      .limit(data.limit)
      .offset(offset)
      .all();
    const total = db
      .select({ count: sql<number>`count(*)` })
      .from(bookImportListExclusions)
      .get();
    return { items, total: total?.count ?? 0 };
  });

export const removeImportListExclusionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => removeImportListExclusionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(bookImportListExclusions)
      .where(eq(bookImportListExclusions.id, data.id))
      .run();
    return { success: true };
  });
```

Note: `addImportListExclusion` is handled inline in `deleteBookFn` (Task 8), not as a separate server function.

- [ ] **Step 2: Add `sql` import**

Make sure `sql` is imported from `drizzle-orm` at the top.

- [ ] **Step 3: Commit**

```bash
git add src/server/import-list-exclusions.ts
git commit -m "feat: add import list exclusion server functions"
```

---

### Task 10: Update `updateAuthorFn` for per-profile monitoring

**Files:**

- Modify: `src/server/authors.ts:483-518`
- Modify: `src/hooks/mutations/authors.ts:31-44`

- [ ] **Step 1: Update `updateAuthorFn`**

Replace the existing handler logic in `src/server/authors.ts`. The fn now receives `downloadProfiles` array instead of `downloadProfileIds`. It needs to sync the junction table — delete removed profiles, insert new ones, update existing ones:

```typescript
export const updateAuthorFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateAuthorSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, downloadProfiles } = data;

    // Get current junction rows
    const current = db
      .select()
      .from(authorDownloadProfiles)
      .where(eq(authorDownloadProfiles.authorId, id))
      .all();

    const currentIds = new Set(current.map((c) => c.downloadProfileId));
    const newIds = new Set(downloadProfiles.map((p) => p.downloadProfileId));

    // Delete removed profiles
    for (const row of current) {
      if (!newIds.has(row.downloadProfileId)) {
        db.delete(authorDownloadProfiles)
          .where(eq(authorDownloadProfiles.id, row.id))
          .run();
      }
    }

    // Insert or update profiles
    for (const profile of downloadProfiles) {
      if (currentIds.has(profile.downloadProfileId)) {
        // Update existing
        db.update(authorDownloadProfiles)
          .set({ monitorNewBooks: profile.monitorNewBooks })
          .where(
            and(
              eq(authorDownloadProfiles.authorId, id),
              eq(
                authorDownloadProfiles.downloadProfileId,
                profile.downloadProfileId,
              ),
            ),
          )
          .run();
      } else {
        // Insert new
        db.insert(authorDownloadProfiles)
          .values({
            authorId: id,
            downloadProfileId: profile.downloadProfileId,
            monitorNewBooks: profile.monitorNewBooks,
          })
          .run();
      }
    }

    // Update author timestamp
    db.update(authors)
      .set({ updatedAt: new Date() })
      .where(eq(authors.id, id))
      .run();

    // Log history (preserve existing behavior)
    db.insert(history)
      .values({
        eventType: "authorUpdated",
        authorId: id,
        data: {},
      })
      .run();

    return { success: true };
  });
```

**Important:** The existing `updateAuthorFn` includes history logging — make sure to preserve it. Also check for any other logic in the current implementation (e.g., cascading profile changes to books) and preserve that too.

- [ ] **Step 2: Update `useUpdateAuthor` mutation hook**

Update in `src/hooks/mutations/authors.ts` to match the new schema shape:

```typescript
export function useUpdateAuthor() {
  const router = useRouter();
  return useMutation({
    mutationFn: (data: {
      id: number;
      downloadProfiles: Array<{
        downloadProfileId: number;
        monitorNewBooks: "all" | "none" | "new";
      }>;
    }) => updateAuthorFn({ data }),
    onSuccess: () => {
      toast.success("Author updated");
      router.invalidate();
    },
    onError: () => {
      toast.error("Failed to update author");
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/authors.ts src/hooks/mutations/authors.ts
git commit -m "feat: update author mutations for per-profile monitorNewBooks"
```

---

### Task 11: Update `updateShowFn` for per-profile monitoring and season folders

**Files:**

- Modify: `src/server/shows.ts:424-496`
- Modify: `src/hooks/mutations/shows.ts:32-43`

- [ ] **Step 1: Update `updateShowFn`**

Replace the handler logic in `src/server/shows.ts`. The fn now receives `downloadProfiles` array with `monitorNewSeasons`, plus `useSeasonFolder`. Follow the same sync pattern as the author update (Task 10), plus update the show's `useSeasonFolder` field:

```typescript
export const updateShowFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateShowSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, downloadProfiles, useSeasonFolder, seriesType } = data;

    // Update show-level fields
    const showUpdates: Record<string, unknown> = {
      useSeasonFolder: useSeasonFolder ? 1 : 0,
      updatedAt: new Date(),
    };
    if (seriesType) showUpdates.seriesType = seriesType;
    db.update(shows).set(showUpdates).where(eq(shows.id, id)).run();

    // Sync showDownloadProfiles junction
    const current = db
      .select()
      .from(showDownloadProfiles)
      .where(eq(showDownloadProfiles.showId, id))
      .all();

    const currentIds = new Set(current.map((c) => c.downloadProfileId));
    const newIds = new Set(downloadProfiles.map((p) => p.downloadProfileId));

    // Delete removed profiles
    for (const row of current) {
      if (!newIds.has(row.downloadProfileId)) {
        db.delete(showDownloadProfiles)
          .where(eq(showDownloadProfiles.id, row.id))
          .run();
      }
    }

    // Insert or update profiles
    for (const profile of downloadProfiles) {
      if (currentIds.has(profile.downloadProfileId)) {
        db.update(showDownloadProfiles)
          .set({ monitorNewSeasons: profile.monitorNewSeasons })
          .where(
            and(
              eq(showDownloadProfiles.showId, id),
              eq(
                showDownloadProfiles.downloadProfileId,
                profile.downloadProfileId,
              ),
            ),
          )
          .run();
      } else {
        db.insert(showDownloadProfiles)
          .values({
            showId: id,
            downloadProfileId: profile.downloadProfileId,
            monitorNewSeasons: profile.monitorNewSeasons,
          })
          .run();
      }
    }

    return { success: true };
  });
```

Note: The existing `updateShowFn` may also handle episode-level profile syncing (bulk monitor/unmonitor episodes when profiles change). Review the current implementation carefully and preserve that logic — the profile sync pattern above replaces only the junction table management, not any episode cascade logic.

- [ ] **Step 2: Update `useUpdateShow` mutation hook**

Update in `src/hooks/mutations/shows.ts`:

```typescript
export function useUpdateShow() {
  const router = useRouter();
  return useMutation({
    mutationFn: (data: {
      id: number;
      downloadProfiles: Array<{
        downloadProfileId: number;
        monitorNewSeasons: "all" | "none" | "new";
      }>;
      useSeasonFolder: boolean;
      seriesType?: "standard" | "daily" | "anime";
    }) => updateShowFn({ data }),
    onSuccess: () => {
      toast.success("Show updated");
      router.invalidate();
    },
    onError: () => {
      toast.error("Failed to update show");
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/shows.ts src/hooks/mutations/shows.ts
git commit -m "feat: update show mutations for per-profile monitorNewSeasons and useSeasonFolder"
```

---

### Task 12: Extend history query to support `bookId` filter

**Files:**

- Modify: `src/server/history.ts:8-48`
- Modify: `src/lib/queries/history.ts:27-35`

- [ ] **Step 1: Update `getHistoryFn` in `src/server/history.ts`**

Add optional `bookId` parameter to the input validator and the query filter. Look at how the existing `eventType` filter is applied and follow the same pattern:

```typescript
// In the validator, add:
bookId: z.number().optional(),

// In the query, add a WHERE condition when bookId is provided:
// where: and(existing conditions, bookId ? eq(history.bookId, bookId) : undefined)
```

- [ ] **Step 2: Update `historyListQuery` in `src/lib/queries/history.ts`**

Add `bookId` parameter and include in the query key:

```typescript
export function historyListQuery(opts: {
  page: number;
  eventType?: string;
  bookId?: number;
}) {
  return queryOptions({
    queryKey: ["history", "list", opts.page, opts.eventType, opts.bookId],
    queryFn: () =>
      getHistoryFn({
        data: {
          page: opts.page,
          limit: 25,
          eventType: opts.eventType,
          bookId: opts.bookId,
        },
      }),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/history.ts src/lib/queries/history.ts
git commit -m "feat: extend history query to support bookId filter"
```

---

## Phase 3: Book Detail Page

### Task 13: Add ActionButtonGroup to book detail page

**Files:**

- Modify: `src/routes/_authed/books/$bookId.tsx:181-198`

- [ ] **Step 1: Replace action buttons**

In `src/routes/_authed/books/$bookId.tsx`, replace the current ad-hoc buttons (back link row and separate refresh/external link buttons) with the same layout used on `src/routes/_authed/authors/$authorId.tsx`:

- Back link on the left (using the `Link` component with `ChevronLeft` icon)
- `ActionButtonGroup` on the right in a `flex items-center justify-between` row

```tsx
import { ActionButtonGroup } from "src/components/shared/action-button-group";

// In the component, add state for edit and delete dialogs:
const [editOpen, setEditOpen] = useState(false);
const [deleteOpen, setDeleteOpen] = useState(false);

// Replace the button section with:
<div className="flex items-center justify-between">
  <Link
    to="/authors/$authorId"
    params={{ authorId: String(book.bookAuthors[0]?.authorId) }}
  >
    <Button variant="ghost" size="sm">
      <ChevronLeft className="mr-1 h-4 w-4" />
      {book.bookAuthors[0]?.authorName}
    </Button>
  </Link>
  <ActionButtonGroup
    onRefreshMetadata={() => refreshMetadata.mutate(book.id)}
    isRefreshing={refreshMetadata.isPending}
    onEdit={() => setEditOpen(true)}
    onDelete={() => setDeleteOpen(true)}
    externalUrl={
      book.foreignBookId ? `https://hardcover.app/books/${book.slug}` : null
    }
    externalLabel="Open in Hardcover"
  />
</div>;
```

Note: Check what refresh metadata mutation exists for books. If `useRefreshBookMetadata` doesn't exist, you may need to use the existing `refreshBookInternal` pattern or create a new mutation.

- [ ] **Step 2: Commit**

```bash
git add src/routes/_authed/books/\$bookId.tsx
git commit -m "feat: add ActionButtonGroup to book detail page"
```

---

### Task 14: Create BookFilesTab component

**Files:**

- Create: `src/components/bookshelf/books/book-files-tab.tsx`

- [ ] **Step 1: Create component**

Follow the pattern from `src/components/movies/movie-files-tab.tsx`. The book files tab shows a table of `bookFiles` with format-aware columns:

```tsx
import { BookOpen } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { EmptyState } from "src/components/shared/empty-state";
import { formatBytes } from "src/lib/format";

type BookFile = {
  id: number;
  path: string;
  size: number;
  quality: unknown;
  dateAdded: Date | null;
  part: number | null;
  partCount: number | null;
  duration: number | null;
  bitrate: number | null;
  codec: string | null;
  pageCount: number | null;
};

export function BookFilesTab({ files }: { files: BookFile[] }) {
  if (files.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No book files"
        description="No files have been imported for this book yet."
      />
    );
  }

  const hasAudioFiles = files.some((f) => f.duration != null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Path</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Format</TableHead>
          {hasAudioFiles && (
            <>
              <TableHead>Duration</TableHead>
              <TableHead>Bitrate</TableHead>
              <TableHead>Codec</TableHead>
            </>
          )}
          {!hasAudioFiles && <TableHead>Pages</TableHead>}
          <TableHead>Part</TableHead>
          <TableHead>Date Added</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((file) => (
          <TableRow key={file.id}>
            <TableCell className="max-w-xs truncate font-mono text-xs">
              {file.path}
            </TableCell>
            <TableCell>{formatBytes(file.size)}</TableCell>
            <TableCell>{getQualityName(file.quality)}</TableCell>
            {hasAudioFiles && (
              <>
                <TableCell>
                  {file.duration ? formatDuration(file.duration) : "—"}
                </TableCell>
                <TableCell>
                  {file.bitrate ? `${file.bitrate} kbps` : "—"}
                </TableCell>
                <TableCell>{file.codec ?? "—"}</TableCell>
              </>
            )}
            {!hasAudioFiles && <TableCell>{file.pageCount ?? "—"}</TableCell>}
            <TableCell>
              {file.partCount && file.partCount > 1
                ? `${file.part} of ${file.partCount}`
                : "—"}
            </TableCell>
            <TableCell>
              {file.dateAdded
                ? new Date(file.dateAdded).toLocaleDateString()
                : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

Adapt the helper functions (`formatDuration`, `getQualityName`) from the movie files tab or create simple versions. For date formatting, use `new Date(timestamp).toLocaleDateString()` or check the movie files tab for the pattern used there — `formatDate` does not exist in the codebase.

- [ ] **Step 2: Commit**

```bash
git add src/components/bookshelf/books/book-files-tab.tsx
git commit -m "feat: create BookFilesTab component"
```

---

### Task 15: Add Files and History tabs to book detail page

**Files:**

- Modify: `src/server/books.ts` (in `getBookFn`)
- Modify: `src/routes/_authed/books/$bookId.tsx:233-247`

- [ ] **Step 1: Extend `getBookFn` to return `files` and `autoSwitchEdition`**

The current `getBookFn` explicitly selects specific columns (it does NOT use `select()` with all columns) and only returns `fileCount`, not actual file records. Two changes needed:

1. Add `autoSwitchEdition` to the select clause so it's available for the edit dialog
2. Add a query for `bookFiles` records and include them in the response:

```typescript
// After the main book query, add:
const files = db
  .select()
  .from(bookFiles)
  .where(eq(bookFiles.bookId, bookId))
  .all();

// Include in the return object:
return { ...book, files, autoSwitchEdition: book.autoSwitchEdition };
```

- [ ] **Step 2: Update tabs**

In the book detail page, update the tabs section. The current tabs are `editions` and `search`. Add `files` and `history` between them:

```tsx
import { BookFilesTab } from "src/components/bookshelf/books/book-files-tab";
import { HistoryTab } from "src/components/activity/history-tab";

// In the Tabs component:
<Tabs defaultValue="editions">
  <TabsList>
    <TabsTrigger value="editions">Editions</TabsTrigger>
    <TabsTrigger value="files">Files</TabsTrigger>
    <TabsTrigger value="history">History</TabsTrigger>
    <TabsTrigger value="search">Search Releases</TabsTrigger>
  </TabsList>
  <TabsContent value="editions">
    <EditionsTab ... />
  </TabsContent>
  <TabsContent value="files">
    <BookFilesTab files={book.files} />
  </TabsContent>
  <TabsContent value="history">
    <HistoryTab bookId={book.id} />
  </TabsContent>
  <TabsContent value="search">
    <SearchReleasesTab ... />
  </TabsContent>
</Tabs>
```

Note: Step 1 above adds `files` and `autoSwitchEdition` to `getBookFn`. `HistoryTab` needs the `bookId` prop added (from Task 12).

- [ ] **Step 2: Update `HistoryTab` component to accept optional `bookId` prop**

In `src/components/activity/history-tab.tsx`, add the optional prop and pass it through to the query:

```tsx
export function HistoryTab({ bookId }: { bookId?: number }) {
  // Use bookId in the historyListQuery call
}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authed/books/\$bookId.tsx src/components/activity/history-tab.tsx
git commit -m "feat: add Files and History tabs to book detail page"
```

---

### Task 16: Create book edit dialog

**Files:**

- Create: `src/components/bookshelf/books/book-edit-dialog.tsx`
- Modify: `src/routes/_authed/books/$bookId.tsx`

- [ ] **Step 1: Create dialog component**

```tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import { Switch } from "src/components/ui/switch";
import { Label } from "src/components/ui/label";
import { useUpdateBook } from "src/hooks/mutations/books";

type BookEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: {
    id: number;
    title: string;
    autoSwitchEdition: number;
  };
};

export function BookEditDialog({
  open,
  onOpenChange,
  book,
}: BookEditDialogProps) {
  const [autoSwitch, setAutoSwitch] = useState(Boolean(book.autoSwitchEdition));
  const updateBook = useUpdateBook();

  const handleSave = () => {
    updateBook.mutate(
      { id: book.id, autoSwitchEdition: autoSwitch },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit — {book.title}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between py-4">
          <div className="space-y-1">
            <Label htmlFor="auto-switch">Automatically switch edition</Label>
            <p className="text-sm text-muted-foreground">
              Re-evaluate the best edition for each profile when new editions
              are discovered during metadata imports.
            </p>
          </div>
          <Switch
            id="auto-switch"
            checked={autoSwitch}
            onCheckedChange={setAutoSwitch}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateBook.isPending}>
            {updateBook.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire into book detail page**

In `src/routes/_authed/books/$bookId.tsx`, import and render the dialog, controlled by `editOpen` state (from Task 13):

```tsx
import { BookEditDialog } from "src/components/bookshelf/books/book-edit-dialog";

// In JSX:
<BookEditDialog open={editOpen} onOpenChange={setEditOpen} book={book} />;
```

- [ ] **Step 3: Commit**

```bash
git add src/components/bookshelf/books/book-edit-dialog.tsx src/routes/_authed/books/\$bookId.tsx
git commit -m "feat: create book edit dialog with auto-switch edition toggle"
```

---

### Task 17: Create BookDeleteDialog component

**Files:**

- Create: `src/components/bookshelf/books/book-delete-dialog.tsx`
- Modify: `src/routes/_authed/books/$bookId.tsx`

- [ ] **Step 1: Create dialog component**

This is a custom dialog (not `ConfirmDialog`) because it needs checkboxes:

```tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import { Label } from "src/components/ui/label";
import { useDeleteBook } from "src/hooks/mutations/books";
import { useRouter } from "@tanstack/react-router";

type BookDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: {
    id: number;
    title: string;
    fileCount: number;
    foreignBookId: string | null;
    authorId: number | null;
  };
};

export function BookDeleteDialog({
  open,
  onOpenChange,
  book,
}: BookDeleteDialogProps) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [addExclusion, setAddExclusion] = useState(true);
  const deleteBook = useDeleteBook();
  const router = useRouter();

  const handleConfirm = () => {
    deleteBook.mutate(
      {
        id: book.id,
        deleteFiles,
        addImportExclusion: book.foreignBookId ? addExclusion : false,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          // Navigate back to the specific author page (or /authors if no author)
          if (book.authorId) {
            router.navigate({
              to: "/authors/$authorId",
              params: { authorId: String(book.authorId) },
            });
          } else {
            router.navigate({ to: "/authors" });
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Book</DialogTitle>
          <DialogDescription>
            This will permanently delete {book.title} from your library.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {book.fileCount > 0 && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="delete-files"
                checked={deleteFiles}
                onCheckedChange={(checked) => setDeleteFiles(checked === true)}
              />
              <Label htmlFor="delete-files">Delete book files from disk</Label>
            </div>
          )}
          {book.foreignBookId && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="add-exclusion"
                checked={addExclusion}
                onCheckedChange={(checked) => setAddExclusion(checked === true)}
              />
              <Label htmlFor="add-exclusion">
                Prevent this book from being re-added during author refresh
              </Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleteBook.isPending}
          >
            {deleteBook.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire into book detail page**

In `src/routes/_authed/books/$bookId.tsx`, import and render:

```tsx
import { BookDeleteDialog } from "src/components/bookshelf/books/book-delete-dialog";

// In JSX:
<BookDeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} book={book} />;
```

- [ ] **Step 3: Commit**

```bash
git add src/components/bookshelf/books/book-delete-dialog.tsx src/routes/_authed/books/\$bookId.tsx
git commit -m "feat: create BookDeleteDialog with file deletion and import exclusion options"
```

---

## Phase 4: Edit Modal Enhancements

### Task 18: Extend ProfileCheckboxGroup with per-profile dropdown support

**Files:**

- Modify: `src/components/shared/profile-checkbox-group.tsx`

- [ ] **Step 1: Add optional per-profile render slot**

Extend `ProfileCheckboxGroup` to accept an optional `renderExtra` callback that renders additional content (like a `Select` dropdown) for each checked profile:

```tsx
type ProfileCheckboxGroupProps = {
  profiles: Array<{ id: number; name: string; icon: string }>;
  selectedIds: number[];
  onToggle: (id: number) => void;
  renderExtra?: (profileId: number) => React.ReactNode;
};
```

For each profile row, after the checkbox + label, conditionally render `renderExtra(profile.id)` when the profile is checked and `renderExtra` is provided:

```tsx
{
  profiles.map((profile) => (
    <div key={profile.id} className="space-y-2">
      <div className="flex items-center space-x-2">
        <Checkbox
          id={`profile-${profile.id}`}
          checked={selectedIds.includes(profile.id)}
          onCheckedChange={() => onToggle(profile.id)}
        />
        <Label htmlFor={`profile-${profile.id}`}>
          {profile.icon} {profile.name}
        </Label>
      </div>
      {selectedIds.includes(profile.id) && renderExtra?.(profile.id)}
    </div>
  ));
}
```

This is backward-compatible — existing callers that don't pass `renderExtra` work unchanged.

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/profile-checkbox-group.tsx
git commit -m "feat: add renderExtra slot to ProfileCheckboxGroup for per-profile settings"
```

---

### Task 19: Update author edit modal with Monitor New Books dropdown

**Files:**

- Modify: `src/components/bookshelf/authors/author-form.tsx`
- Modify: `src/routes/_authed/authors/$authorId.tsx`

- [ ] **Step 1: Update AuthorForm**

Update the `AuthorForm` component to manage per-profile `monitorNewBooks` state. The form should:

- Track `downloadProfiles` as `Array<{ downloadProfileId: number; monitorNewBooks: "all" | "none" | "new" }>` instead of just `downloadProfileIds: number[]`
- Use `ProfileCheckboxGroup` with the new `renderExtra` prop to show a `Select` dropdown for each checked profile
- Default new profiles to `monitorNewBooks: "all"`

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";

// State:
const [profiles, setProfiles] = useState<
  Array<{ downloadProfileId: number; monitorNewBooks: "all" | "none" | "new" }>
>(initialValues?.downloadProfiles ?? []);

// Toggle handler:
const handleToggle = (id: number) => {
  setProfiles((prev) =>
    prev.some((p) => p.downloadProfileId === id)
      ? prev.filter((p) => p.downloadProfileId !== id)
      : [...prev, { downloadProfileId: id, monitorNewBooks: "all" }],
  );
};

// Monitor change handler:
const handleMonitorChange = (id: number, value: "all" | "none" | "new") => {
  setProfiles((prev) =>
    prev.map((p) =>
      p.downloadProfileId === id ? { ...p, monitorNewBooks: value } : p,
    ),
  );
};

// In the ProfileCheckboxGroup:
<ProfileCheckboxGroup
  profiles={downloadProfiles}
  selectedIds={profiles.map((p) => p.downloadProfileId)}
  onToggle={handleToggle}
  renderExtra={(profileId) => (
    <div className="ml-6 flex items-center gap-2">
      <Label className="text-sm text-muted-foreground">Monitor New Books</Label>
      <Select
        value={
          profiles.find((p) => p.downloadProfileId === profileId)
            ?.monitorNewBooks
        }
        onValueChange={(v) =>
          handleMonitorChange(profileId, v as "all" | "none" | "new")
        }
      >
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="none">None</SelectItem>
          <SelectItem value="new">New</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )}
/>;
```

- [ ] **Step 2: Update callers in `$authorId.tsx`**

Update the author detail page's edit dialog to pass the new data shape. The initial values need to include `monitorNewBooks` from the `authorDownloadProfiles` junction. Check if the author loader already returns this data; if not, extend `getAuthorFn` to include `monitorNewBooks` in the response.

- [ ] **Step 3: Update any add-author flows**

Search for other callers of `useUpdateAuthor` or `AuthorForm` and update them to pass the new shape. New profiles added during author creation should default to `monitorNewBooks: "all"`.

- [ ] **Step 4: Commit**

```bash
git add src/components/bookshelf/authors/author-form.tsx src/routes/_authed/authors/\$authorId.tsx
git commit -m "feat: add Monitor New Books dropdown to author edit modal"
```

---

### Task 20: Update TV series edit modal with Monitor New Seasons and Use Season Folder

**Files:**

- Modify: `src/components/tv/show-detail-header.tsx`

- [ ] **Step 1: Update edit dialog**

In the show detail header's edit dialog, apply the same pattern as Task 19:

1. Track `downloadProfiles` as `Array<{ downloadProfileId, monitorNewSeasons }>` instead of `selectedProfileIds`
2. Add `useSeasonFolder` boolean state initialized from `show.useSeasonFolder`
3. Use `ProfileCheckboxGroup` with `renderExtra` for the "Monitor New Seasons" dropdown per profile
4. Add a `Switch` toggle for "Use Season Folder" below the profiles section

```tsx
// Additional state:
const [useSeasonFolder, setUseSeasonFolder] = useState(
  Boolean(show.useSeasonFolder),
);

// Below the ProfileCheckboxGroup, add:
<div className="flex items-center justify-between pt-4 border-t">
  <div className="space-y-1">
    <Label>Use Season Folder</Label>
    <p className="text-sm text-muted-foreground">
      Organize episodes into season-based folder structure.
    </p>
  </div>
  <Switch checked={useSeasonFolder} onCheckedChange={setUseSeasonFolder} />
</div>;
```

Update the save handler to call `updateShow.mutate` with the new shape.

- [ ] **Step 2: Ensure show loader returns `monitorNewSeasons` and `useSeasonFolder`**

Check `getShowFn` — if it doesn't return `useSeasonFolder` or the per-profile `monitorNewSeasons`, extend it.

- [ ] **Step 3: Commit**

```bash
git add src/components/tv/show-detail-header.tsx
git commit -m "feat: add Monitor New Seasons and Use Season Folder to TV series edit modal"
```

---

### Task 21: Update movie edit modal with Minimum Availability dropdown

**Files:**

- Modify: `src/components/movies/movie-detail-header.tsx`

- [ ] **Step 1: Add Minimum Availability dropdown to edit dialog**

In the movie detail header's edit dialog, add a `Select` dropdown below the `ProfileCheckboxGroup`:

```tsx
const [minimumAvailability, setMinimumAvailability] = useState(
  movie.minimumAvailability ?? "released",
);

// Below the ProfileCheckboxGroup, add:
<div className="flex items-center justify-between pt-4 border-t">
  <div className="space-y-1">
    <Label>Minimum Availability</Label>
    <p className="text-sm text-muted-foreground">
      When the movie is considered available for download.
    </p>
  </div>
  <Select value={minimumAvailability} onValueChange={setMinimumAvailability}>
    <SelectTrigger className="w-36">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="announced">Announced</SelectItem>
      <SelectItem value="inCinemas">In Cinemas</SelectItem>
      <SelectItem value="released">Released</SelectItem>
    </SelectContent>
  </Select>
</div>;
```

Update the save handler to include `minimumAvailability` in the mutation call. Since `updateMovieFn` already accepts this field, this is a UI-only change.

- [ ] **Step 2: Commit**

```bash
git add src/components/movies/movie-detail-header.tsx
git commit -m "feat: add Minimum Availability dropdown to movie edit modal"
```

---

## Phase 5: Import Lists Settings Page

### Task 22: Add Import Lists to settings navigation

**Files:**

- Modify: `src/lib/nav-config.ts:15-44`

- [ ] **Step 1: Add nav item**

Add to the `settingsNavItems` array:

```typescript
{
  title: "Import Lists",
  to: "/settings/import-lists",
  icon: ListPlus,
  description: "Manage import lists and exclusions",
},
```

Import `ListPlus` from `lucide-react`.

- [ ] **Step 2: Commit**

```bash
git add src/lib/nav-config.ts
git commit -m "feat: add Import Lists to settings navigation"
```

---

### Task 23: Create Import Lists settings page

**Files:**

- Create: `src/routes/_authed/settings/import-lists.tsx`

- [ ] **Step 1: Create route file**

Follow the pattern from other settings pages. The page shows a table of import list exclusions with remove buttons:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "src/components/shared/page-header";
import { Button } from "src/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { ConfirmDialog } from "src/components/shared/confirm-dialog";
import { EmptyState } from "src/components/shared/empty-state";
import { ListPlus } from "lucide-react";
import { toast } from "sonner";
import {
  getImportListExclusionsFn,
  removeImportListExclusionFn,
} from "src/server/import-list-exclusions";
export const Route = createFileRoute("/_authed/settings/import-lists")({
  component: ImportListsPage,
});

function ImportListsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ["import-list-exclusions", page],
    queryFn: () => getImportListExclusionsFn({ data: { page, limit: 50 } }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => removeImportListExclusionFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Exclusion removed");
      queryClient.invalidateQueries({ queryKey: ["import-list-exclusions"] });
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to remove exclusion"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Lists"
        description="Manage import lists and exclusions"
      />

      <div className="space-y-4">
        <h3 className="text-lg font-medium">Import List Exclusions</h3>
        <p className="text-sm text-muted-foreground">
          Books in this list will not be re-added during author refresh or
          import list sync.
        </p>

        {!data?.items.length ? (
          <EmptyState
            icon={ListPlus}
            title="No excluded books"
            description="Books added to this list when deleted will be prevented from being re-imported."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Date Excluded</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.title}</TableCell>
                  <TableCell>{item.authorName}</TableCell>
                  <TableCell>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteId(item.id)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remove Exclusion"
        description="This book will be eligible for re-import during author refresh."
        onConfirm={() => deleteId && removeMutation.mutate(deleteId)}
        loading={removeMutation.isPending}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify route is auto-generated**

Run: `bun run dev` briefly (or `bunx tsr generate`) to trigger TanStack Router's route generation. Check that `src/routeTree.gen.ts` includes the new route.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authed/settings/import-lists.tsx
git commit -m "feat: create Import Lists settings page with exclusion management"
```

---

## Phase 6: Import Integration

### Task 24: Add exclusion check to author refresh

**Files:**

- Modify: `src/server/import.ts` (around line 1280 where new books are inserted)

- [ ] **Step 1: Add exclusion lookup**

At the top of the `refreshAuthorInternal` function (or before the book insertion loop), query all excluded `foreignBookId`s:

```typescript
import { bookImportListExclusions } from "src/db/schema";

const excludedBookIds = new Set(
  db
    .select({ foreignBookId: bookImportListExclusions.foreignBookId })
    .from(bookImportListExclusions)
    .all()
    .map((r) => r.foreignBookId),
);
```

Then, in the book processing loop, before inserting a new book, check:

```typescript
if (excludedBookIds.has(hardcoverBook.foreignBookId)) {
  continue; // Skip excluded book
}
```

Find the exact insertion point by reading the function — look for where new books are added to the database and add the check just before that insert.

- [ ] **Step 2: Commit**

```bash
git add src/server/import.ts
git commit -m "feat: check import list exclusions during author refresh"
```

---

### Task 25: Add auto-switch edition logic to metadata refresh

**Files:**

- Modify: `src/server/import.ts` (in the book metadata refresh logic)

- [ ] **Step 1: Add auto-switch edition check**

In the `refreshBookInternal` function (or wherever book metadata is refreshed after new editions are fetched), add logic:

```typescript
// After new editions are inserted/updated for a book:
if (book.autoSwitchEdition) {
  // Re-run the edition selection logic for each profile
  // This is the same logic used when clicking the Ebook/Audiobook monitor icon
  // Find the existing function that selects the best edition and call it here
}
```

The exact implementation depends on how the "best edition selection" logic is currently structured. Search for the function that runs when a user clicks the monitor icon on an edition — it likely lives in `src/server/books.ts` or `src/server/import.ts`. Call that same function here when `autoSwitchEdition` is true and new editions were discovered.

- [ ] **Step 2: Commit**

```bash
git add src/server/import.ts
git commit -m "feat: auto-switch edition on metadata refresh when enabled"
```

---

## Phase 7: Verification

### Task 26: End-to-end verification

- [ ] **Step 1: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run dev server**

Run: `bun run dev`
Verify: All pages load without errors.

- [ ] **Step 3: Manual testing checklist**

Test each feature:

- [ ] Book detail page: ActionButtonGroup renders with all 4 buttons
- [ ] Book detail page: Files tab shows book files (or empty state)
- [ ] Book detail page: History tab shows book events
- [ ] Book edit dialog: Toggle works and persists
- [ ] Book delete dialog: Checkboxes show/hide correctly based on file count and foreignBookId
- [ ] Author edit modal: Per-profile Monitor New Books dropdown appears for each checked profile
- [ ] TV series edit modal: Per-profile Monitor New Seasons dropdown + Use Season Folder toggle
- [ ] Movie edit modal: Minimum Availability dropdown
- [ ] Settings > Import Lists page: Shows exclusions table or empty state
- [ ] Deleting a book with "Prevent re-add" adds it to the exclusions list

- [ ] **Step 4: Run e2e tests**

Run: `bun run test:e2e` (or however e2e tests are invoked)
Expected: All existing tests pass.

- [ ] **Step 5: Commit any fixes**

If any issues were found and fixed during verification, commit them.
