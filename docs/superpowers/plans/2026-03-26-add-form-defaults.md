# Add Form Defaults & Autofocus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist last-used add form options per content type, autofocus search inputs on add pages, and default download profiles to unchecked.

**Architecture:** Extend the existing `user_settings` table with an `addDefaults` JSON column. Each content type (movies, tv, books) stores its own shape. Forms initialize from saved defaults, and save current values fire-and-forget on every add.

**Tech Stack:** SQLite + Drizzle ORM, TanStack Query, React, Zod

**Spec:** `docs/superpowers/specs/2026-03-26-add-form-defaults-design.md`

---

### Task 1: Add `addDefaults` Column to Database Schema

**Files:**

- Modify: `src/db/schema/user-settings.ts`

- [ ] **Step 1: Add the addDefaults column to the schema**

In `src/db/schema/user-settings.ts`, add a new nullable JSON column after `viewMode`:

```typescript
addDefaults: text("add_defaults", { mode: "json" }).$type<Record<string, unknown>>(),
```

The full schema should look like:

```typescript
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const userSettings = sqliteTable(
  "user_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tableId: text("table_id").notNull(),
    columnOrder: text("column_order", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    hiddenColumns: text("hidden_columns", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    viewMode: text("view_mode").$type<"table" | "grid">(),
    addDefaults: text("add_defaults", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
  },
  (table) => [
    uniqueIndex("user_settings_user_table_idx").on(table.userId, table.tableId),
  ],
);
```

- [ ] **Step 2: Generate the migration**

Run: `bun run db:generate`

Expected: A new migration file in `drizzle/` that adds `add_defaults` column to `user_settings`.

- [ ] **Step 3: Apply the migration**

Run: `bun run db:migrate`

Expected: Migration applied successfully.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/user-settings.ts drizzle/
git commit -m "feat: add addDefaults column to user_settings table"
```

---

### Task 2: Update Validators, Server Functions, and Mutation Hook

**Files:**

- Modify: `src/lib/validators.ts`
- Modify: `src/server/user-settings.ts`
- Modify: `src/hooks/mutations/user-settings.ts`

- [ ] **Step 1: Add addDefaults to the upsert validator**

In `src/lib/validators.ts`, update `upsertUserSettingsSchema` (around line 460):

```typescript
export const upsertUserSettingsSchema = z.object({
  tableId: tableIdSchema,
  columnOrder: z.array(z.string()).optional(),
  hiddenColumns: z.array(z.string()).optional(),
  viewMode: z.enum(["table", "grid"]).optional(),
  addDefaults: z.record(z.string(), z.unknown()).optional(),
});
```

- [ ] **Step 2: Update the server upsert function to handle addDefaults**

In `src/server/user-settings.ts`, update `upsertUserSettingsFn` handler to include `addDefaults` in the partial update pattern. Add after the `viewMode` check (around line 52):

```typescript
if (data.addDefaults !== undefined) {
  set.addDefaults = data.addDefaults;
}
```

And add `addDefaults` to the insert values (around line 60):

```typescript
.values({
  userId: session.user.id,
  tableId: data.tableId,
  columnOrder: data.columnOrder ?? [],
  hiddenColumns: data.hiddenColumns ?? [],
  viewMode: data.viewMode ?? null,
  addDefaults: data.addDefaults ?? null,
})
```

Also update `getUserSettingsFn` to return `addDefaults` (around line 32):

```typescript
return {
  columnOrder: row.columnOrder,
  hiddenColumns: row.hiddenColumns,
  viewMode: row.viewMode,
  addDefaults: row.addDefaults,
};
```

- [ ] **Step 3: Update the mutation hook type**

In `src/hooks/mutations/user-settings.ts`, update the `useUpsertUserSettings` mutation type to include `addDefaults` (around line 12):

```typescript
mutationFn: (data: {
  tableId: string;
  columnOrder?: string[];
  hiddenColumns?: string[];
  viewMode?: "table" | "grid";
  addDefaults?: Record<string, unknown>;
}) => upsertUserSettingsFn({ data }),
```

- [ ] **Step 4: Verify build passes**

Run: `bun run build`

Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators.ts src/server/user-settings.ts src/hooks/mutations/user-settings.ts
git commit -m "feat: extend user settings to support addDefaults"
```

---

### Task 3: Movies — Autofocus, Saved Defaults, Save on Add

**Files:**

- Modify: `src/routes/_authed/movies/add.tsx`
- Modify: `src/components/movies/tmdb-movie-search.tsx`

- [ ] **Step 1: Add route loader prefetch for user settings**

In `src/routes/_authed/movies/add.tsx`, add a loader that prefetches user settings. Update the route definition:

```typescript
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import TmdbMovieSearch from "src/components/movies/tmdb-movie-search";
import { userSettingsQuery } from "src/lib/queries/user-settings";

export const Route = createFileRoute("/_authed/movies/add")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(userSettingsQuery("movies"));
  },
  component: AddMoviePage,
});
```

The rest of the component stays the same.

- [ ] **Step 2: Add autofocus to the movie search input**

In `src/components/movies/tmdb-movie-search.tsx`, add `autoFocus` to the `Input` on line 429:

```tsx
<Input
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  placeholder="Search for a movie by title..."
  autoComplete="off"
  aria-label="Search movies"
  className="pl-9"
  autoFocus
/>
```

- [ ] **Step 3: Accept addDefaults prop and initialize form state**

Update `MoviePreviewModalProps` to accept saved defaults:

```typescript
export type MoviePreviewModalProps = {
  movie: TmdbMovieResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
  addDefaults?: Record<string, unknown> | null;
};
```

Update the component signature to destructure `addDefaults`:

```typescript
export function MoviePreviewModal({
  movie,
  open,
  onOpenChange,
  onAdded,
  addDefaults,
}: MoviePreviewModalProps): JSX.Element {
```

Replace the hardcoded state initializers (lines 77-83) with defaults-aware versions:

```typescript
const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>(
  () => (addDefaults?.downloadProfileIds as number[] | undefined) ?? [],
);
const [minimumAvailability, setMinimumAvailability] = useState<string>(
  () => (addDefaults?.minimumAvailability as string | undefined) ?? "released",
);
const [monitorOption, setMonitorOption] = useState<
  "movieOnly" | "movieAndCollection" | "none"
>(
  () =>
    (addDefaults?.monitorOption as
      | "movieOnly"
      | "movieAndCollection"
      | "none"
      | undefined) ?? "movieOnly",
);
const [searchOnAdd, setSearchOnAdd] = useState(
  () => (addDefaults?.searchOnAdd as boolean | undefined) ?? false,
);
```

Remove the `useEffect` that auto-selects all profiles (lines 85-90). It's no longer needed — defaults come from saved settings or empty array.

- [ ] **Step 4: Save defaults on add**

Add the `useUpsertUserSettings` import at the top of the file:

```typescript
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
```

Inside `MoviePreviewModal`, initialize the mutation:

```typescript
const upsertSettings = useUpsertUserSettings();
```

In the `handleAdd` function, save current form values fire-and-forget right before the add mutation call. Update `handleAdd`:

```typescript
const handleAdd = () => {
  if (monitorOption !== "none" && downloadProfileIds.length === 0) {
    return;
  }
  upsertSettings.mutate({
    tableId: "movies",
    addDefaults: {
      downloadProfileIds,
      minimumAvailability,
      monitorOption,
      searchOnAdd,
    },
  });
  addMovie.mutate(
    {
      tmdbId: movie.id,
      downloadProfileIds,
      minimumAvailability: minimumAvailability as
        | "announced"
        | "inCinemas"
        | "released",
      monitorOption,
      searchOnAdd,
    },
    {
      onSuccess: (result) => {
        onOpenChange(false);
        if (onAdded) {
          onAdded();
        } else {
          navigate({
            to: "/movies/$movieId",
            params: { movieId: String(result.id) },
          });
        }
      },
    },
  );
};
```

- [ ] **Step 5: Pass addDefaults from TmdbMovieSearch to MoviePreviewModal**

In `TmdbMovieSearch`, import and use the user settings query:

```typescript
import { useQuery } from "@tanstack/react-query";
import { userSettingsQuery } from "src/lib/queries/user-settings";
```

Note: `useQuery` is already imported. Just add the `userSettingsQuery` import.

Inside the `TmdbMovieSearch` component, add:

```typescript
const { data: settings } = useQuery(userSettingsQuery("movies"));
```

Then pass `addDefaults` to the `MoviePreviewModal`:

```tsx
{
  previewMovie && (
    <MoviePreviewModal
      movie={previewMovie}
      open={Boolean(previewMovie)}
      onOpenChange={(open) => {
        if (!open) {
          setPreviewMovie(undefined);
        }
      }}
      addDefaults={settings?.addDefaults}
    />
  );
}
```

- [ ] **Step 6: Verify build passes**

Run: `bun run build`

Expected: Build succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/_authed/movies/add.tsx src/components/movies/tmdb-movie-search.tsx
git commit -m "feat: movies add page autofocus and saved form defaults"
```

---

### Task 4: TV Shows — Autofocus, Saved Defaults, Save on Add

**Files:**

- Modify: `src/routes/_authed/tv/add.tsx`
- Modify: `src/components/tv/tmdb-show-search.tsx`

- [ ] **Step 1: Add route loader prefetch for user settings**

In `src/routes/_authed/tv/add.tsx`, add a loader:

```typescript
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import TmdbShowSearch from "src/components/tv/tmdb-show-search";
import { userSettingsQuery } from "src/lib/queries/user-settings";

export const Route = createFileRoute("/_authed/tv/add")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(userSettingsQuery("tv"));
  },
  component: AddShowPage,
});
```

The rest of the component stays the same.

- [ ] **Step 2: Add autofocus to the TV search input**

In `src/components/tv/tmdb-show-search.tsx`, add `autoFocus` to the `Input` on line 500:

```tsx
<Input
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  placeholder="Search for a TV show by title..."
  autoComplete="off"
  aria-label="Search TV shows"
  className="pl-9"
  autoFocus
/>
```

- [ ] **Step 3: Accept addDefaults prop and initialize form state**

Update `ShowPreviewModalProps`:

```typescript
type ShowPreviewModalProps = {
  show: TmdbTvResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addDefaults?: Record<string, unknown> | null;
};
```

Update the component to destructure `addDefaults`:

```typescript
function ShowPreviewModal({
  show,
  open,
  onOpenChange,
  addDefaults,
}: ShowPreviewModalProps): JSX.Element {
```

Replace the hardcoded state initializers (lines 99-105) with defaults-aware versions. Note: `seriesType` always defaults to `"standard"` regardless of saved preferences:

```typescript
const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>(
  () => (addDefaults?.downloadProfileIds as number[] | undefined) ?? [],
);
const [monitorOption, setMonitorOption] = useState<string>(
  () => (addDefaults?.monitorOption as string | undefined) ?? "all",
);
const [seriesType, setSeriesType] = useState<string>("standard");
const [useSeasonFolder, setSeasonFolder] = useState(
  () => (addDefaults?.useSeasonFolder as boolean | undefined) ?? true,
);
const [searchOnAdd, setSearchOnAdd] = useState(
  () => (addDefaults?.searchOnAdd as boolean | undefined) ?? false,
);
const [searchCutoffUnmet, setSearchCutoffUnmet] = useState(
  () => (addDefaults?.searchCutoffUnmet as boolean | undefined) ?? false,
);
const [episodeGroupId, setEpisodeGroupId] = useState<string | null>(null);
```

Remove the `useEffect` that auto-selects all profiles (lines 112-117).

- [ ] **Step 4: Save defaults on add**

Add the import:

```typescript
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
```

Inside `ShowPreviewModal`, initialize the mutation:

```typescript
const upsertSettings = useUpsertUserSettings();
```

Update `handleAdd` to save defaults fire-and-forget (do NOT save seriesType):

```typescript
const handleAdd = () => {
  if (downloadProfileIds.length === 0) {
    return;
  }
  upsertSettings.mutate({
    tableId: "tv",
    addDefaults: {
      downloadProfileIds,
      monitorOption,
      useSeasonFolder,
      searchOnAdd,
      searchCutoffUnmet,
    },
  });
  addShow.mutate(
    {
      tmdbId: show.id,
      downloadProfileIds,
      monitorOption: monitorOption as
        | "all"
        | "future"
        | "missing"
        | "existing"
        | "pilot"
        | "firstSeason"
        | "lastSeason"
        | "none",
      seriesType: seriesType as "standard" | "daily" | "anime",
      useSeasonFolder,
      searchOnAdd,
      searchCutoffUnmet,
      episodeGroupId,
    },
    {
      onSuccess: (result) => {
        onOpenChange(false);
        navigate({
          to: "/tv/series/$showId",
          params: { showId: String(result.id) },
        });
      },
    },
  );
};
```

- [ ] **Step 5: Pass addDefaults from TmdbShowSearch to ShowPreviewModal**

In `TmdbShowSearch`, add the user settings query import:

```typescript
import { userSettingsQuery } from "src/lib/queries/user-settings";
```

Note: `useQuery` is already imported. Inside the `TmdbShowSearch` component, add:

```typescript
const { data: settings } = useQuery(userSettingsQuery("tv"));
```

Pass `addDefaults` to `ShowPreviewModal`:

```tsx
{
  previewShow && (
    <ShowPreviewModal
      show={previewShow}
      open={Boolean(previewShow)}
      onOpenChange={(open) => {
        if (!open) {
          setPreviewShow(undefined);
        }
      }}
      addDefaults={settings?.addDefaults}
    />
  );
}
```

- [ ] **Step 6: Verify build passes**

Run: `bun run build`

Expected: Build succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/_authed/tv/add.tsx src/components/tv/tmdb-show-search.tsx
git commit -m "feat: TV add page autofocus and saved form defaults"
```

---

### Task 5: Books — Autofocus, Saved Defaults, Save on Add

**Files:**

- Modify: `src/routes/_authed/books/add.tsx`
- Modify: `src/components/bookshelf/hardcover/book-preview-modal.tsx`
- Modify: `src/components/bookshelf/hardcover/author-preview-modal.tsx`

- [ ] **Step 1: Add autofocus and route loader prefetch to books add page**

In `src/routes/_authed/books/add.tsx`, add the loader and autofocus. Update the imports and route definition:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import EmptyState from "src/components/shared/empty-state";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import { Badge } from "src/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { searchHardcoverFn } from "src/server/search";
import type {
  HardcoverSearchItem,
  HardcoverSearchMode,
} from "src/server/search";
import AuthorPreviewModal from "src/components/bookshelf/hardcover/author-preview-modal";
import BookPreviewModal from "src/components/bookshelf/hardcover/book-preview-modal";
import OptimizedImage from "src/components/shared/optimized-image";
import { userSettingsQuery } from "src/lib/queries/user-settings";

export const Route = createFileRoute("/_authed/books/add")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(userSettingsQuery("books"));
  },
  component: AddToBookshelfPage,
});
```

Inside the `AddToBookshelfPage` component, add the settings query:

```typescript
const { data: settings } = useQuery(userSettingsQuery("books"));
```

Add `autoFocus` to the `Input` element (around line 158):

```tsx
<Input
  value={query}
  onChange={(event) => setQuery(event.target.value)}
  placeholder={`Search ${resultTypeConfig[searchType].description.toLowerCase()}`}
  autoComplete="off"
  aria-label="Search query"
  autoFocus
/>
```

Pass `addDefaults` to both preview modals:

```tsx
{
  previewAuthor && (
    <AuthorPreviewModal
      author={previewAuthor}
      open={Boolean(previewAuthor)}
      onOpenChange={(open) => {
        if (!open) {
          setPreviewAuthor(undefined);
        }
      }}
      addDefaults={settings?.addDefaults}
    />
  );
}

{
  previewBook && (
    <BookPreviewModal
      book={previewBook}
      open={Boolean(previewBook)}
      onOpenChange={(open) => {
        if (!open) {
          setPreviewBook(undefined);
        }
      }}
      addDefaults={settings?.addDefaults}
    />
  );
}
```

- [ ] **Step 2: Update BookPreviewModal to accept and use addDefaults**

In `src/components/bookshelf/hardcover/book-preview-modal.tsx`:

Update `BookPreviewModalProps`:

```typescript
type BookPreviewModalProps = {
  book: HardcoverSearchItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addDefaults?: Record<string, unknown> | null;
};
```

Update the component to destructure `addDefaults`:

```typescript
export default function BookPreviewModal({
  book,
  open,
  onOpenChange,
  addDefaults,
}: BookPreviewModalProps): JSX.Element {
```

Pass `addDefaults` to `AddBookForm`:

```tsx
{
  addOpen && !inLibrary && (
    <AddBookForm
      book={book}
      bookDetail={hcBook}
      authorExists={authorExists}
      onSuccess={() => onOpenChange(false)}
      onCancel={() => setAddOpen(false)}
      addDefaults={addDefaults}
    />
  );
}
```

Update `AddBookFormProps`:

```typescript
type AddBookFormProps = {
  book: HardcoverSearchItem;
  bookDetail: HardcoverBookDetail | undefined;
  authorExists: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  addDefaults?: Record<string, unknown> | null;
};
```

Update `AddBookForm` to destructure and use `addDefaults`:

```typescript
function AddBookForm({
  book,
  bookDetail: _bookDetail,
  authorExists,
  onSuccess,
  onCancel,
  addDefaults,
}: AddBookFormProps) {
```

Replace the hardcoded state initializers (lines 76-80):

```typescript
const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>(
  () => (addDefaults?.downloadProfileIds as number[] | undefined) ?? [],
);
const [monitorOption, setMonitorOption] = useState<MonitorOption>(
  () => (addDefaults?.monitorOption as MonitorOption | undefined) ?? "all",
);
const [monitorNewBooks, setMonitorNewBooks] = useState<MonitorNewBooks>(
  () => (addDefaults?.monitorNewBooks as MonitorNewBooks | undefined) ?? "all",
);
const [searchOnAdd, setSearchOnAdd] = useState(
  () => (addDefaults?.searchOnAdd as boolean | undefined) ?? false,
);
```

Remove the `useEffect` that auto-selects all profiles (lines 82-86).

Add the save-on-add call. Import the mutation:

```typescript
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
```

Inside `AddBookForm`, initialize:

```typescript
const upsertSettings = useUpsertUserSettings();
```

Update `handleSubmit`:

```typescript
const handleSubmit = () => {
  upsertSettings.mutate({
    tableId: "books",
    addDefaults: {
      downloadProfileIds,
      monitorOption,
      monitorNewBooks,
      searchOnAdd,
    },
  });
  importBook.mutate({
    foreignBookId: Number(book.id),
    downloadProfileIds,
    monitorOption,
    monitorNewBooks,
    searchOnAdd,
  });
  onSuccess();
};
```

- [ ] **Step 3: Update AuthorPreviewModal to accept and use addDefaults**

In `src/components/bookshelf/hardcover/author-preview-modal.tsx`:

Update `AuthorPreviewModalProps`:

```typescript
type AuthorPreviewModalProps = {
  author: HardcoverSearchItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addDefaults?: Record<string, unknown> | null;
};
```

Update the component to destructure `addDefaults`:

```typescript
export default function AuthorPreviewModal({
  author,
  open,
  onOpenChange,
  addDefaults,
}: AuthorPreviewModalProps): JSX.Element {
```

Pass `addDefaults` to `AddForm`:

```tsx
{
  addOpen && !inLibrary && fullAuthor && (
    <AddForm
      fullAuthor={fullAuthor}
      onSuccess={() => onOpenChange(false)}
      onCancel={() => setAddOpen(false)}
      addDefaults={addDefaults}
    />
  );
}
```

Update `AddFormProps`:

```typescript
type AddFormProps = {
  fullAuthor: HardcoverAuthorDetail;
  onSuccess: () => void;
  onCancel: () => void;
  addDefaults?: Record<string, unknown> | null;
};
```

Update `AddForm` to destructure and use `addDefaults`:

```typescript
function AddForm({ fullAuthor, onSuccess, onCancel, addDefaults }: AddFormProps) {
```

Replace the hardcoded state initializers (lines 63-66):

```typescript
const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>(
  () => (addDefaults?.downloadProfileIds as number[] | undefined) ?? [],
);
const [monitorOption, setMonitorOption] = useState(
  () => (addDefaults?.monitorOption as string | undefined) ?? "all",
);
const [monitorNewBooks, setMonitorNewBooks] = useState(
  () => (addDefaults?.monitorNewBooks as string | undefined) ?? "all",
);
const [searchOnAdd, setSearchOnAdd] = useState(
  () => (addDefaults?.searchOnAdd as boolean | undefined) ?? false,
);
```

Remove the `useEffect` that auto-selects all profiles (lines 69-73).

Add the save-on-add call. Import the mutation:

```typescript
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
```

Inside `AddForm`, initialize:

```typescript
const upsertSettings = useUpsertUserSettings();
```

Update `handleSubmit`:

```typescript
const handleSubmit = () => {
  upsertSettings.mutate({
    tableId: "books",
    addDefaults: {
      downloadProfileIds,
      monitorOption,
      monitorNewBooks,
      searchOnAdd,
    },
  });
  importAuthor.mutate({
    foreignAuthorId: Number(fullAuthor.id),
    downloadProfileIds,
    monitorOption,
    monitorNewBooks,
    searchOnAdd,
  });
  onSuccess();
};
```

- [ ] **Step 4: Verify build passes**

Run: `bun run build`

Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authed/books/add.tsx src/components/bookshelf/hardcover/book-preview-modal.tsx src/components/bookshelf/hardcover/author-preview-modal.tsx
git commit -m "feat: books add page autofocus and saved form defaults"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run full production build**

Run: `bun run build`

Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify by reading key files**

Quickly confirm:

1. `src/db/schema/user-settings.ts` has the `addDefaults` column
2. All three search inputs have `autoFocus`
3. All `useEffect` auto-select-all-profiles blocks are removed
4. All add forms save defaults fire-and-forget
5. TV shows do NOT persist `seriesType`
