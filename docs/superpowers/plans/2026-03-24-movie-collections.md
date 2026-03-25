# Movie Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Radarr-style TMDB collections for movies with auto-discovery, monitoring, auto-add, and an overview card UI.

**Architecture:** New `movieCollections` table auto-populated from TMDB's `belongs_to_collection` field. Cached TMDB parts in `movieCollectionMovies` table. Monitored collections auto-add missing movies on refresh. Overview card UI at `/movies/collections`.

**Tech Stack:** Drizzle ORM (SQLite), TanStack Start server functions, TanStack Query, React, shadcn/ui, Zod, TMDB API

**Spec:** `docs/superpowers/specs/2026-03-24-movie-collections-design.md`

---

## File Map

### New Files

| File                                                  | Responsibility                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/db/schema/movie-collections.ts`                  | `movieCollections` table definition                                           |
| `src/db/schema/movie-collection-download-profiles.ts` | Join table: collections ↔ download profiles                                   |
| `src/db/schema/movie-collection-movies.ts`            | Cached TMDB parts per collection                                              |
| `src/db/schema/movie-import-list-exclusions.ts`       | Movie import exclusions table                                                 |
| `src/server/utils/movie-helpers.ts`                   | Shared utilities: `mapMovieStatus`, `transformImagePath`, `generateSortTitle` |
| `src/server/tmdb/collections.ts`                      | `getTmdbCollectionDetailFn` — fetch TMDB collection                           |
| `src/server/movie-collections.ts`                     | Collection CRUD + refresh + add-missing + exclusion server functions          |
| `src/hooks/mutations/movie-collections.ts`            | React mutation hooks for collections                                          |
| `src/lib/queries/movie-collections.ts`                | React query options for collections                                           |
| `src/components/movies/collection-card.tsx`           | Single collection overview card                                               |
| `src/components/movies/collection-movie-poster.tsx`   | Mini movie poster with status border                                          |
| `src/components/movies/edit-collection-dialog.tsx`    | Modal for editing collection settings                                         |
| `src/routes/_authed/movies/collections.tsx`           | Collections list page                                                         |

### Modified Files

| File                                            | Changes                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/db/schema/movies.ts`                       | Add `collectionId` FK + index                                                     |
| `src/db/schema/index.ts`                        | Export new schema files                                                           |
| `src/server/tmdb/types.ts`                      | Add `TmdbCollectionDetail` type, add `belongs_to_collection` to `TmdbMovieDetail` |
| `src/server/tmdb/movies.ts`                     | Use shared `mapMovieStatus` and `transformImagePath`                              |
| `src/server/movies.ts`                          | Use shared utils, upsert collection on add/refresh, add exclusion on delete       |
| `src/server/import-list-exclusions.ts`          | Rename functions, add movie exclusion functions                                   |
| `src/lib/tmdb-validators.ts`                    | Add collection validators, add `addImportExclusion` to `deleteMovieSchema`        |
| `src/lib/validators.ts`                         | Add `removeMovieImportExclusionSchema`                                            |
| `src/lib/query-keys.ts`                         | Add `movieCollections` and `importExclusions` namespaces                          |
| `src/components/layout/app-sidebar.tsx`         | Add Collections nav item under Movies                                             |
| `src/components/movies/movie-detail-header.tsx` | Add exclusion checkbox to delete dialog                                           |
| `src/routes/_authed/settings/import-lists.tsx`  | Add tabs for book/movie exclusions                                                |

---

## Task 1: Database Schema — New Tables

**Files:**

- Create: `src/db/schema/movie-collections.ts`
- Create: `src/db/schema/movie-collection-download-profiles.ts`
- Create: `src/db/schema/movie-collection-movies.ts`
- Create: `src/db/schema/movie-import-list-exclusions.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create `movieCollections` table**

```typescript
// src/db/schema/movie-collections.ts
import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const movieCollections = sqliteTable(
  "movie_collections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    sortTitle: text("sort_title").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    overview: text("overview").notNull().default(""),
    posterUrl: text("poster_url"),
    fanartUrl: text("fanart_url"),
    monitored: integer("monitored", { mode: "boolean" })
      .notNull()
      .default(false),
    minimumAvailability: text("minimum_availability")
      .notNull()
      .default("released"),
    lastInfoSync: integer("last_info_sync", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (t) => [unique("movie_collections_tmdb_id_unique").on(t.tmdbId)],
);
```

- [ ] **Step 2: Create `movieCollectionDownloadProfiles` join table**

```typescript
// src/db/schema/movie-collection-download-profiles.ts
import { sqliteTable, integer, unique } from "drizzle-orm/sqlite-core";
import { movieCollections } from "./movie-collections";
import { downloadProfiles } from "./download-profiles";

export const movieCollectionDownloadProfiles = sqliteTable(
  "movie_collection_download_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => movieCollections.id, { onDelete: "cascade" }),
    downloadProfileId: integer("download_profile_id")
      .notNull()
      .references(() => downloadProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.collectionId, t.downloadProfileId)],
);
```

- [ ] **Step 3: Create `movieCollectionMovies` cache table**

```typescript
// src/db/schema/movie-collection-movies.ts
import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";
import { movieCollections } from "./movie-collections";

export const movieCollectionMovies = sqliteTable(
  "movie_collection_movies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => movieCollections.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    title: text("title").notNull(),
    overview: text("overview").notNull().default(""),
    posterUrl: text("poster_url"),
    releaseDate: text("release_date").notNull().default(""),
    year: integer("year"),
  },
  (t) => [unique().on(t.collectionId, t.tmdbId)],
);
```

- [ ] **Step 4: Create `movieImportListExclusions` table**

```typescript
// src/db/schema/movie-import-list-exclusions.ts
import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const movieImportListExclusions = sqliteTable(
  "movie_import_list_exclusions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tmdbId: integer("tmdb_id").notNull(),
    title: text("title").notNull(),
    year: integer("year"),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (t) => [unique("movie_import_list_exclusions_tmdb_id_unique").on(t.tmdbId)],
);
```

- [ ] **Step 5: Export new schemas from barrel**

Add to `src/db/schema/index.ts` after the existing movie exports:

```typescript
export * from "./movie-collections";
export * from "./movie-collection-download-profiles";
export * from "./movie-collection-movies";
export * from "./movie-import-list-exclusions";
```

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/movie-collections.ts src/db/schema/movie-collection-download-profiles.ts src/db/schema/movie-collection-movies.ts src/db/schema/movie-import-list-exclusions.ts src/db/schema/index.ts
git commit -m "feat: add movie collections and exclusions schema tables"
```

---

## Task 2: Database Schema — Modify Movies Table

**Files:**

- Modify: `src/db/schema/movies.ts`

- [ ] **Step 1: Add `collectionId` FK and index to `movies` table**

In `src/db/schema/movies.ts`, add the import and column:

```typescript
import {
  sqliteTable,
  text,
  integer,
  unique,
  index,
} from "drizzle-orm/sqlite-core";
import { movieCollections } from "./movie-collections";
```

Add column to the table definition after `path`:

```typescript
    collectionId: integer("collection_id").references(
      () => movieCollections.id,
      { onDelete: "set null" },
    ),
```

Add index in the constraints array (third argument to `sqliteTable`):

```typescript
  (t) => [
    unique("movies_tmdb_id_unique").on(t.tmdbId),
    index("movies_collection_id_idx").on(t.collectionId),
  ],
```

- [ ] **Step 2: Commit**

```bash
git add src/db/schema/movies.ts
git commit -m "feat: add collectionId FK and index to movies table"
```

---

## Task 3: Generate and Apply Migration

**Files:**

- Generated: `drizzle/XXXX_*.sql`

- [ ] **Step 1: Generate Drizzle migration**

```bash
bun run db:generate
```

Expected: New migration file created in `drizzle/` directory.

- [ ] **Step 2: Apply migration**

```bash
bun run db:migrate
```

Expected: Migration applied successfully.

- [ ] **Step 3: Commit**

```bash
git add drizzle/
git commit -m "chore: generate migration for movie collections tables"
```

---

## Task 4: Shared Movie Utilities

**Files:**

- Create: `src/server/utils/movie-helpers.ts`
- Modify: `src/server/movies.ts`
- Modify: `src/server/tmdb/movies.ts`

- [ ] **Step 1: Create shared helpers module**

```typescript
// src/server/utils/movie-helpers.ts
import { TMDB_IMAGE_BASE } from "../tmdb/types";

export type MovieStatus =
  | "tba"
  | "announced"
  | "inCinemas"
  | "released"
  | "deleted"
  | "canceled";

export function mapMovieStatus(tmdbStatus: string): MovieStatus {
  switch (tmdbStatus) {
    case "Rumored":
    case "Planned": {
      return "tba";
    }
    case "In Production":
    case "Post Production": {
      return "announced";
    }
    case "Released": {
      return "released";
    }
    case "Canceled": {
      return "canceled";
    }
    default: {
      return "announced";
    }
  }
}

export function transformImagePath(
  path: string | null,
  size: string,
): string | null {
  return path === null ? null : `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function generateSortTitle(title: string): string {
  return title.replace(/^(The|A|An)\s+/i, "");
}
```

- [ ] **Step 2: Update `src/server/movies.ts` to use shared helpers**

Remove the local `MovieStatus` type, `mapMovieStatus`, `transformImagePath`, and `generateSortTitle` functions. Replace with imports:

```typescript
import {
  mapMovieStatus,
  transformImagePath,
  generateSortTitle,
} from "./utils/movie-helpers";
```

Also remove the `TMDB_IMAGE_BASE` import since it's no longer used directly.

- [ ] **Step 3: Update `src/server/tmdb/movies.ts` to use shared helpers**

Remove the local `MovieStatus` type, `mapMovieStatus`, and `transformImagePath`. Replace with imports:

```typescript
import { mapMovieStatus, transformImagePath } from "../utils/movie-helpers";
```

Remove the `TMDB_IMAGE_BASE` import from `./client` (it's now used via the shared helpers).

- [ ] **Step 4: Verify build**

```bash
bun run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/utils/movie-helpers.ts src/server/movies.ts src/server/tmdb/movies.ts
git commit -m "refactor: extract shared movie helpers to utils module"
```

---

## Task 5: TMDB Types and Collection Fetch

**Files:**

- Modify: `src/server/tmdb/types.ts`
- Create: `src/server/tmdb/collections.ts`

- [ ] **Step 1: Add types to `src/server/tmdb/types.ts`**

Add `belongs_to_collection` to `TmdbMovieDetail`:

```typescript
export type TmdbMovieDetail = {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  status: string;
  runtime: number | null;
  genres: Array<{ id: number; name: string }>;
  production_companies: Array<{ id: number; name: string }>;
  imdb_id: string | null;
  budget: number;
  revenue: number;
  vote_average: number;
  belongs_to_collection: {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  } | null;
};
```

Add `TmdbCollectionDetail` type:

```typescript
export type TmdbCollectionDetail = {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: Array<{
    id: number;
    title: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string;
    adult: boolean;
  }>;
};
```

- [ ] **Step 2: Create TMDB collection fetch function**

```typescript
// src/server/tmdb/collections.ts
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "../middleware";
import { tmdbFetch } from "./client";
import { TMDB_IMAGE_BASE } from "./types";
import type { TmdbCollectionDetail } from "./types";

export const getTmdbCollectionDetailFn = createServerFn({ method: "GET" })
  .inputValidator((d: { tmdbId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const raw = await tmdbFetch<TmdbCollectionDetail>(
      `/collection/${data.tmdbId}`,
    );
    return {
      ...raw,
      poster_path: raw.poster_path
        ? `${TMDB_IMAGE_BASE}/w500${raw.poster_path}`
        : null,
      backdrop_path: raw.backdrop_path
        ? `${TMDB_IMAGE_BASE}/original${raw.backdrop_path}`
        : null,
      parts: raw.parts.map((part) => ({
        ...part,
        poster_path: part.poster_path
          ? `${TMDB_IMAGE_BASE}/w500${part.poster_path}`
          : null,
        backdrop_path: part.backdrop_path
          ? `${TMDB_IMAGE_BASE}/original${part.backdrop_path}`
          : null,
      })),
    };
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/server/tmdb/types.ts src/server/tmdb/collections.ts
git commit -m "feat: add TMDB collection types and fetch function"
```

---

## Task 6: Validators

**Files:**

- Modify: `src/lib/tmdb-validators.ts`
- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Add collection validators to `src/lib/tmdb-validators.ts`**

Add at the end of the file:

```typescript
export const updateMovieCollectionSchema = z.object({
  id: z.number(),
  monitored: z.boolean().optional(),
  downloadProfileIds: z.array(z.number()).optional(),
  minimumAvailability: z
    .enum(["announced", "inCinemas", "released"])
    .optional(),
});

export const addMissingCollectionMoviesSchema = z.object({
  collectionId: z.number(),
});

export const addMovieImportExclusionSchema = z.object({
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().optional(),
});
```

- [ ] **Step 2: Add `addImportExclusion` to `deleteMovieSchema`**

In `src/lib/tmdb-validators.ts`, modify the existing `deleteMovieSchema`:

```typescript
export const deleteMovieSchema = z.object({
  id: z.number(),
  deleteFiles: z.boolean().default(false),
  addImportExclusion: z.boolean().default(false),
});
```

- [ ] **Step 3: Add movie exclusion removal schema to `src/lib/validators.ts`**

Add at the end of the file:

```typescript
export const removeMovieImportExclusionSchema = z.object({
  id: z.number(),
});
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/tmdb-validators.ts src/lib/validators.ts
git commit -m "feat: add validators for movie collections and exclusions"
```

---

## Task 7: Query Keys and React Queries

**Files:**

- Modify: `src/lib/query-keys.ts`
- Create: `src/lib/queries/movie-collections.ts`

- [ ] **Step 1: Add `movieCollections` and `importExclusions` to query keys**

In `src/lib/query-keys.ts`, add after the `movies` section:

```typescript
  // ─── Movie Collections ────────────────────────────────────────────────
  movieCollections: {
    all: ["movieCollections"] as const,
    list: () => ["movieCollections", "list"] as const,
  },
```

Add after the `settings` section:

```typescript
  // ─── Import Exclusions ────────────────────────────────────────────────
  importExclusions: {
    all: ["importExclusions"] as const,
    books: () => ["importExclusions", "books"] as const,
    movies: () => ["importExclusions", "movies"] as const,
  },
```

- [ ] **Step 2: Create movie collections query**

```typescript
// src/lib/queries/movie-collections.ts
import { queryOptions } from "@tanstack/react-query";
import { getMovieCollectionsFn } from "src/server/movie-collections";
import { queryKeys } from "../query-keys";

export const movieCollectionsListQuery = () =>
  queryOptions({
    queryKey: queryKeys.movieCollections.list(),
    queryFn: () => getMovieCollectionsFn(),
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/query-keys.ts src/lib/queries/movie-collections.ts
git commit -m "feat: add movie collections query keys and query options"
```

---

## Task 8: Import List Exclusions — Server Functions

**Files:**

- Modify: `src/server/import-list-exclusions.ts`

- [ ] **Step 1: Rename existing functions and add movie exclusion functions**

Rewrite `src/server/import-list-exclusions.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "src/db";
import {
  bookImportListExclusions,
  movieImportListExclusions,
} from "src/db/schema";
import {
  removeImportListExclusionSchema,
  removeMovieImportExclusionSchema,
} from "src/lib/validators";
import { requireAuth } from "./middleware";

// ─── Book Exclusions ─────────────────────────────────────────────────────

export const getBookImportExclusionsFn = createServerFn({ method: "GET" })
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

export const removeBookImportExclusionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => removeImportListExclusionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(bookImportListExclusions)
      .where(eq(bookImportListExclusions.id, data.id))
      .run();
    return { success: true };
  });

// ─── Movie Exclusions ────────────────────────────────────────────────────

export const getMovieImportExclusionsFn = createServerFn({ method: "GET" })
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
      .from(movieImportListExclusions)
      .orderBy(movieImportListExclusions.createdAt)
      .limit(data.limit)
      .offset(offset)
      .all();
    const total = db
      .select({ count: sql<number>`count(*)` })
      .from(movieImportListExclusions)
      .get();
    return { items, total: total?.count ?? 0 };
  });

export const removeMovieImportExclusionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => removeMovieImportExclusionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(movieImportListExclusions)
      .where(eq(movieImportListExclusions.id, data.id))
      .run();
    return { success: true };
  });

// ─── Backward Compatibility ─────────────────────────────────────────────
// Keep old names as aliases for any callers not yet updated
export const getImportListExclusionsFn = getBookImportExclusionsFn;
export const removeImportListExclusionFn = removeBookImportExclusionFn;
```

- [ ] **Step 2: Update callers that import old function names**

Search for imports of `getImportListExclusionsFn` and `removeImportListExclusionFn` in:

- `src/routes/_authed/settings/import-lists.tsx` — will be fully rewritten in Task 13
- `src/server/import.ts` — uses `bookImportListExclusions` directly, no server function import; no change needed

The backward-compatible aliases handle any callers during the transition.

- [ ] **Step 3: Commit**

```bash
git add src/server/import-list-exclusions.ts
git commit -m "feat: split import exclusions into book and movie server functions"
```

---

## Task 9: Modify Movies Server Functions

**Files:**

- Modify: `src/server/movies.ts`

- [ ] **Step 1: Add collection upsert to `addMovieFn`**

Add imports at top of `src/server/movies.ts`:

```typescript
import { movieCollections, movieImportListExclusions } from "src/db/schema";
import { generateSortTitle } from "./utils/movie-helpers";
```

In `addMovieFn`, after the TMDB fetch (`const raw = await tmdbFetch...`) and before the movie insert, add collection upsert:

```typescript
// Upsert collection if movie belongs to one
let collectionId: number | null = null;
if (raw.belongs_to_collection) {
  const col = raw.belongs_to_collection;
  const existing = db
    .select({ id: movieCollections.id })
    .from(movieCollections)
    .where(eq(movieCollections.tmdbId, col.id))
    .get();

  if (existing) {
    collectionId = existing.id;
    db.update(movieCollections)
      .set({
        title: col.name,
        sortTitle: generateSortTitle(col.name),
        posterUrl: transformImagePath(col.poster_path, "w500"),
        fanartUrl: transformImagePath(col.backdrop_path, "original"),
        updatedAt: new Date(),
      })
      .where(eq(movieCollections.id, existing.id))
      .run();
  } else {
    const inserted = db
      .insert(movieCollections)
      .values({
        title: col.name,
        sortTitle: generateSortTitle(col.name),
        tmdbId: col.id,
        posterUrl: transformImagePath(col.poster_path, "w500"),
        fanartUrl: transformImagePath(col.backdrop_path, "original"),
      })
      .returning()
      .get();
    collectionId = inserted.id;
  }
}
```

Then add `collectionId` to the movie insert values object:

```typescript
const movie = db.insert(movies).values({
  // ... existing fields ...
  collectionId,
});
```

- [ ] **Step 2: Add same upsert to `refreshMovieMetadataFn`**

Same logic after the TMDB fetch in `refreshMovieMetadataFn`. After computing the metadata fields, add the collection upsert block (same code as Step 1). Then include `collectionId` in the `db.update(movies).set(...)` call.

- [ ] **Step 3: Add import exclusion to `deleteMovieFn`**

In `deleteMovieFn`, after the movie existence check and before the file deletion block, add:

```typescript
// Add to import exclusion list if requested
if (data.addImportExclusion) {
  db.insert(movieImportListExclusions)
    .values({
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year || null,
    })
    .onConflictDoNothing()
    .run();
}
```

This requires reading the full movie (not just `id`) from the initial select — update the select to fetch `tmdbId`, `title`, `year` as well.

- [ ] **Step 4: Verify build**

```bash
bun run build
```

- [ ] **Step 5: Commit**

```bash
git add src/server/movies.ts
git commit -m "feat: upsert collections on movie add/refresh, add import exclusion on delete"
```

---

## Task 10: Movie Collections Server Functions

**Files:**

- Create: `src/server/movie-collections.ts`

- [ ] **Step 1: Create the server functions file**

```typescript
// src/server/movie-collections.ts
import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  movieCollections,
  movieCollectionDownloadProfiles,
  movieCollectionMovies,
  movieImportListExclusions,
  movies,
  movieDownloadProfiles,
  history,
} from "src/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  updateMovieCollectionSchema,
  addMissingCollectionMoviesSchema,
  addMovieImportExclusionSchema,
} from "src/lib/tmdb-validators";
import { tmdbFetch } from "./tmdb/client";
import { TMDB_IMAGE_BASE } from "./tmdb/types";
import type { TmdbCollectionDetail, TmdbMovieDetail } from "./tmdb/types";
import {
  mapMovieStatus,
  transformImagePath,
  generateSortTitle,
} from "./utils/movie-helpers";

// ─── Get All Collections ─────────────────────────────────────────────────

export const getMovieCollectionsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();

    // Get all collections
    const collections = db.select().from(movieCollections).all();

    // Get all cached collection movies
    const allCollectionMovies = db.select().from(movieCollectionMovies).all();

    // Get all download profile junctions
    const allProfileLinks = db
      .select()
      .from(movieCollectionDownloadProfiles)
      .all();

    // Get all existing movie tmdbIds with their internal IDs
    const existingMovies = db
      .select({ id: movies.id, tmdbId: movies.tmdbId })
      .from(movies)
      .all();
    const existingByTmdbId = new Map(
      existingMovies.map((m) => [m.tmdbId, m.id]),
    );

    // Get all excluded tmdbIds
    const exclusions = db
      .select({ tmdbId: movieImportListExclusions.tmdbId })
      .from(movieImportListExclusions)
      .all();
    const excludedTmdbIds = new Set(exclusions.map((e) => e.tmdbId));

    return collections.map((collection) => {
      const collectionMoviesList = allCollectionMovies.filter(
        (cm) => cm.collectionId === collection.id,
      );
      const profileIds = allProfileLinks
        .filter((pl) => pl.collectionId === collection.id)
        .map((pl) => pl.downloadProfileId);

      const annotatedMovies = collectionMoviesList.map((cm) => {
        const movieId = existingByTmdbId.get(cm.tmdbId) ?? null;
        return {
          ...cm,
          isExisting: movieId !== null,
          isExcluded: excludedTmdbIds.has(cm.tmdbId),
          movieId,
        };
      });

      const missingMovies = annotatedMovies.filter(
        (m) => !m.isExisting && !m.isExcluded,
      ).length;

      return {
        ...collection,
        downloadProfileIds: profileIds,
        movies: annotatedMovies,
        missingMovies,
      };
    });
  },
);

// ─── Update Collection ───────────────────────────────────────────────────

export const updateMovieCollectionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateMovieCollectionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const { id, downloadProfileIds, ...updates } = data;

    db.update(movieCollections)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(movieCollections.id, id))
      .run();

    if (downloadProfileIds !== undefined) {
      db.delete(movieCollectionDownloadProfiles)
        .where(eq(movieCollectionDownloadProfiles.collectionId, id))
        .run();
      for (const profileId of downloadProfileIds) {
        db.insert(movieCollectionDownloadProfiles)
          .values({ collectionId: id, downloadProfileId: profileId })
          .run();
      }
    }

    return { success: true };
  });

// ─── Refresh All Monitored Collections ───────────────────────────────────

export const refreshCollectionsFn = createServerFn({
  method: "POST",
}).handler(async () => {
  await requireAuth();

  const monitoredCollections = db
    .select()
    .from(movieCollections)
    .where(eq(movieCollections.monitored, true))
    .all();

  if (monitoredCollections.length === 0) {
    return { added: 0 };
  }

  // Load exclusions and existing movies once
  const excludedTmdbIds = new Set(
    db
      .select({ tmdbId: movieImportListExclusions.tmdbId })
      .from(movieImportListExclusions)
      .all()
      .map((r) => r.tmdbId),
  );
  const existingTmdbIds = new Set(
    db
      .select({ tmdbId: movies.tmdbId })
      .from(movies)
      .all()
      .map((r) => r.tmdbId),
  );

  let totalAdded = 0;

  for (const collection of monitoredCollections) {
    const added = await syncCollection(
      collection,
      excludedTmdbIds,
      existingTmdbIds,
    );
    totalAdded += added;
  }

  return { added: totalAdded };
});

// ─── Add Missing Movies From Single Collection ──────────────────────────

export const addMissingCollectionMoviesFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => addMissingCollectionMoviesSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const collection = db
      .select()
      .from(movieCollections)
      .where(eq(movieCollections.id, data.collectionId))
      .get();

    if (!collection) {
      throw new Error("Collection not found");
    }

    const excludedTmdbIds = new Set(
      db
        .select({ tmdbId: movieImportListExclusions.tmdbId })
        .from(movieImportListExclusions)
        .all()
        .map((r) => r.tmdbId),
    );
    const existingTmdbIds = new Set(
      db
        .select({ tmdbId: movies.tmdbId })
        .from(movies)
        .all()
        .map((r) => r.tmdbId),
    );

    const added = await syncCollection(
      collection,
      excludedTmdbIds,
      existingTmdbIds,
    );

    return { added };
  });

// ─── Add Movie Import Exclusion ─────────────────────────────────────────

export const addMovieImportExclusionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => addMovieImportExclusionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    db.insert(movieImportListExclusions)
      .values({
        tmdbId: data.tmdbId,
        title: data.title,
        year: data.year ?? null,
      })
      .onConflictDoNothing()
      .run();
    return { success: true };
  });

// ─── Internal Helpers ────────────────────────────────────────────────────

async function syncCollection(
  collection: typeof movieCollections.$inferSelect,
  excludedTmdbIds: Set<number>,
  existingTmdbIds: Set<number>,
): Promise<number> {
  // Fetch current collection from TMDB
  const raw = await tmdbFetch<TmdbCollectionDetail>(
    `/collection/${collection.tmdbId}`,
  );

  // Update collection metadata
  db.update(movieCollections)
    .set({
      title: raw.name,
      sortTitle: generateSortTitle(raw.name),
      overview: raw.overview,
      posterUrl: transformImagePath(raw.poster_path, "w500"),
      fanartUrl: transformImagePath(raw.backdrop_path, "original"),
      lastInfoSync: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(movieCollections.id, collection.id))
    .run();

  // Upsert cached parts
  const tmdbPartIds = new Set(raw.parts.map((p) => p.id));
  for (const part of raw.parts) {
    const year = part.release_date
      ? Number.parseInt(part.release_date.split("-")[0], 10) || null
      : null;
    db.insert(movieCollectionMovies)
      .values({
        collectionId: collection.id,
        tmdbId: part.id,
        title: part.title,
        overview: part.overview,
        posterUrl: transformImagePath(part.poster_path, "w500"),
        releaseDate: part.release_date ?? "",
        year,
      })
      .onConflictDoUpdate({
        target: [
          movieCollectionMovies.collectionId,
          movieCollectionMovies.tmdbId,
        ],
        set: {
          title: part.title,
          overview: part.overview,
          posterUrl: transformImagePath(part.poster_path, "w500"),
          releaseDate: part.release_date ?? "",
          year,
        },
      })
      .run();
  }

  // Delete cached parts no longer in TMDB response
  const cachedParts = db
    .select({
      id: movieCollectionMovies.id,
      tmdbId: movieCollectionMovies.tmdbId,
    })
    .from(movieCollectionMovies)
    .where(eq(movieCollectionMovies.collectionId, collection.id))
    .all();
  const toDelete = cachedParts.filter((p) => !tmdbPartIds.has(p.tmdbId));
  if (toDelete.length > 0) {
    db.delete(movieCollectionMovies)
      .where(
        inArray(
          movieCollectionMovies.id,
          toDelete.map((p) => p.id),
        ),
      )
      .run();
  }

  // Get collection's download profile IDs
  const profileLinks = db
    .select({
      downloadProfileId: movieCollectionDownloadProfiles.downloadProfileId,
    })
    .from(movieCollectionDownloadProfiles)
    .where(eq(movieCollectionDownloadProfiles.collectionId, collection.id))
    .all();

  // Add missing movies
  let added = 0;
  for (const part of raw.parts) {
    if (existingTmdbIds.has(part.id)) continue;
    if (excludedTmdbIds.has(part.id)) continue;

    // Fetch full movie detail from TMDB
    const detail = await tmdbFetch<TmdbMovieDetail>(`/movie/${part.id}`);

    const title = detail.title;
    const sortTitle = generateSortTitle(title);
    const status = mapMovieStatus(detail.status);
    const studio = detail.production_companies[0]?.name ?? "";
    const year = detail.release_date
      ? Number.parseInt(detail.release_date.split("-")[0], 10)
      : 0;
    const runtime = detail.runtime ?? 0;
    const genres = detail.genres.map((g) => g.name);
    const posterUrl = transformImagePath(detail.poster_path, "w500") ?? "";
    const fanartUrl =
      transformImagePath(detail.backdrop_path, "original") ?? "";
    const imdbId = detail.imdb_id ?? null;

    const movie = db
      .insert(movies)
      .values({
        title,
        sortTitle,
        overview: detail.overview,
        tmdbId: part.id,
        imdbId,
        status,
        studio,
        year,
        runtime,
        genres,
        posterUrl,
        fanartUrl,
        minimumAvailability: collection.minimumAvailability,
        collectionId: collection.id,
      })
      .returning()
      .get();

    // Create download profile junctions
    for (const link of profileLinks) {
      db.insert(movieDownloadProfiles)
        .values({
          movieId: movie.id,
          downloadProfileId: link.downloadProfileId,
        })
        .run();
    }

    // Log history
    db.insert(history)
      .values({
        eventType: "movieAdded",
        movieId: movie.id,
        data: { title },
      })
      .run();

    existingTmdbIds.add(part.id);
    added++;
  }

  return added;
}
```

- [ ] **Step 2: Verify build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/server/movie-collections.ts
git commit -m "feat: add movie collections server functions with refresh and auto-add"
```

---

## Task 11: Mutation Hooks

**Files:**

- Create: `src/hooks/mutations/movie-collections.ts`

- [ ] **Step 1: Create mutation hooks**

```typescript
// src/hooks/mutations/movie-collections.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  updateMovieCollectionFn,
  refreshCollectionsFn,
  addMissingCollectionMoviesFn,
  addMovieImportExclusionFn,
} from "src/server/movie-collections";
import { queryKeys } from "src/lib/query-keys";
import type {
  updateMovieCollectionSchema,
  addMissingCollectionMoviesSchema,
  addMovieImportExclusionSchema,
} from "src/lib/tmdb-validators";
import type { z } from "zod";

export function useUpdateMovieCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateMovieCollectionSchema>) =>
      updateMovieCollectionFn({ data }),
    onSuccess: () => {
      toast.success("Collection updated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.movieCollections.all,
      });
    },
    onError: () => toast.error("Failed to update collection"),
  });
}

export function useRefreshCollections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => refreshCollectionsFn(),
    onSuccess: (data) => {
      toast.success(
        data.added > 0
          ? `Refreshed collections, added ${data.added} movie${data.added === 1 ? "" : "s"}`
          : "Collections refreshed, no new movies",
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.movieCollections.all,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.movies.all });
    },
    onError: () => toast.error("Failed to refresh collections"),
  });
}

export function useAddMissingCollectionMovies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof addMissingCollectionMoviesSchema>) =>
      addMissingCollectionMoviesFn({ data }),
    onSuccess: (data) => {
      toast.success(
        data.added > 0
          ? `Added ${data.added} movie${data.added === 1 ? "" : "s"}`
          : "No new movies to add",
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.movieCollections.all,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.movies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to add missing movies"),
  });
}

export function useAddMovieImportExclusion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof addMovieImportExclusionSchema>) =>
      addMovieImportExclusionFn({ data }),
    onSuccess: () => {
      toast.success("Movie excluded from import");
      queryClient.invalidateQueries({
        queryKey: queryKeys.movieCollections.all,
      });
    },
    onError: () => toast.error("Failed to exclude movie"),
  });
}
```

- [ ] **Step 2: Update `useDeleteMovie` to invalidate collection cache**

In `src/hooks/mutations/movies.ts`, add an import for `queryKeys` (already imported) and add this invalidation to `useDeleteMovie`'s `onSuccess`:

```typescript
queryClient.invalidateQueries({ queryKey: queryKeys.movieCollections.all });
```

This ensures collection missing counts update when a movie is deleted.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/mutations/movie-collections.ts src/hooks/mutations/movies.ts
git commit -m "feat: add mutation hooks for movie collections"
```

---

## Task 12: Navigation Update

**Files:**

- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Add Collections nav item**

In `src/components/layout/app-sidebar.tsx`:

1. Add `FolderOpen` to the lucide-react import.
2. In the Movies group `children` array, add Collections between Movies and Calendar:

```typescript
  {
    title: "Movies",
    to: "/movies",
    icon: Film,
    matchPrefixes: ["/movies"],
    children: [
      { title: "Add New", to: "/movies/add", icon: Plus },
      { title: "Movies", to: "/movies", icon: Film },
      { title: "Collections", to: "/movies/collections", icon: FolderOpen },
      { title: "Calendar", to: "/movies/calendar", icon: Calendar },
    ],
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat: add Collections to movies sidebar navigation"
```

---

## Task 13: Collection UI Components

**Files:**

- Create: `src/components/movies/collection-movie-poster.tsx`
- Create: `src/components/movies/edit-collection-dialog.tsx`
- Create: `src/components/movies/collection-card.tsx`

- [ ] **Step 0: Install required shadcn/ui components**

```bash
bunx shadcn@latest add context-menu tooltip
```

The `collection-movie-poster.tsx` component uses `ContextMenu` and `Tooltip` from shadcn/ui. Install them if not already present.

- [ ] **Step 1: Create `collection-movie-poster.tsx`**

Mini poster with status border. Green = existing, red/dimmed = missing, strikethrough = excluded.

```typescript
// src/components/movies/collection-movie-poster.tsx
import type { JSX } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "src/lib/utils";
import { Film, Ban } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "src/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "src/components/ui/context-menu";

type CollectionMovie = {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  year: number | null;
  isExisting: boolean;
  isExcluded: boolean;
  movieId: number | null;
};

type Props = {
  movie: CollectionMovie;
  onExclude?: (movie: CollectionMovie) => void;
  onAddMovie?: (tmdbId: number) => void;
};

export default function CollectionMoviePoster({
  movie,
  onExclude,
  onAddMovie,
}: Props): JSX.Element {
  const poster = (
    <div
      className={cn(
        "relative w-[50px] h-[75px] rounded-sm border-2 flex-shrink-0 overflow-hidden",
        movie.isExisting && "border-green-500",
        !movie.isExisting && !movie.isExcluded && "border-red-500 opacity-60",
        movie.isExcluded && "border-muted opacity-40",
      )}
    >
      {movie.posterUrl ? (
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className={cn(
            "w-full h-full object-cover",
            movie.isExcluded && "grayscale",
          )}
        />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <Film className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      {movie.isExcluded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Ban className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );

  const tooltipLabel = movie.isExcluded
    ? `${movie.title} — Excluded from import`
    : movie.isExisting
      ? movie.title
      : `${movie.title} — Missing`;

  // Existing movies link to their detail page
  if (movie.isExisting && movie.movieId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to="/movies/$movieId" params={{ movieId: String(movie.movieId) }}>
            {poster}
          </Link>
        </TooltipTrigger>
        <TooltipContent>{tooltipLabel}</TooltipContent>
      </Tooltip>
    );
  }

  // Missing movies: click to add, right-click to exclude
  if (!movie.isExisting && !movie.isExcluded) {
    return (
      <ContextMenu>
        <ContextMenuTrigger>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onAddMovie?.(movie.tmdbId)}
                className="cursor-pointer"
              >
                {poster}
              </button>
            </TooltipTrigger>
            <TooltipContent>{tooltipLabel}</TooltipContent>
          </Tooltip>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onExclude?.(movie)}>
            <Ban className="mr-2 h-4 w-4" />
            Exclude from import
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  // Excluded movies: just tooltip
  return (
    <Tooltip>
      <TooltipTrigger asChild>{poster}</TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 2: Create `edit-collection-dialog.tsx`**

```typescript
// src/components/movies/edit-collection-dialog.tsx
import type { JSX } from "react";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import { Switch } from "src/components/ui/switch";
import { Label } from "src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import { downloadProfilesListQuery } from "src/lib/queries/download-profiles";
import { useUpdateMovieCollection } from "src/hooks/mutations/movie-collections";
import { Checkbox } from "src/components/ui/checkbox";

type Collection = {
  id: number;
  title: string;
  monitored: boolean;
  minimumAvailability: string;
  downloadProfileIds: number[];
};

type Props = {
  collection: Collection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function EditCollectionDialog({
  collection,
  open,
  onOpenChange,
}: Props): JSX.Element {
  const [monitored, setMonitored] = useState(false);
  const [availability, setAvailability] = useState("released");
  const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>([]);

  const { data: allProfiles = [] } = useQuery(downloadProfilesListQuery());
  const movieProfiles = useMemo(
    () => allProfiles.filter((p) => p.contentType === "movie"),
    [allProfiles],
  );

  const updateCollection = useUpdateMovieCollection();

  useEffect(() => {
    if (collection) {
      setMonitored(collection.monitored);
      setAvailability(collection.minimumAvailability);
      setSelectedProfileIds(collection.downloadProfileIds);
    }
  }, [collection]);

  const toggleProfile = (profileId: number) => {
    setSelectedProfileIds((prev) =>
      prev.includes(profileId)
        ? prev.filter((id) => id !== profileId)
        : [...prev, profileId],
    );
  };

  const handleSave = () => {
    if (!collection) return;
    updateCollection.mutate(
      {
        id: collection.id,
        monitored,
        minimumAvailability: availability as
          | "announced"
          | "inCinemas"
          | "released",
        downloadProfileIds: selectedProfileIds,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {collection?.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="monitored">Monitored</Label>
            <Switch
              id="monitored"
              checked={monitored}
              onCheckedChange={setMonitored}
            />
          </div>

          <div className="space-y-2">
            <Label>Minimum Availability</Label>
            <Select value={availability} onValueChange={setAvailability}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="announced">Announced</SelectItem>
                <SelectItem value="inCinemas">In Cinemas</SelectItem>
                <SelectItem value="released">Released</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Download Profiles</Label>
            <div className="space-y-2">
              {movieProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center gap-2"
                >
                  <Checkbox
                    id={`profile-${profile.id}`}
                    checked={selectedProfileIds.includes(profile.id)}
                    onCheckedChange={() => toggleProfile(profile.id)}
                  />
                  <Label htmlFor={`profile-${profile.id}`}>
                    {profile.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateCollection.isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create `collection-card.tsx`**

```typescript
// src/components/movies/collection-card.tsx
import type { JSX } from "react";
import { Film, Pencil, PlusCircle } from "lucide-react";
import { Button } from "src/components/ui/button";
import CollectionMoviePoster from "./collection-movie-poster";

type CollectionMovie = {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  year: number | null;
  isExisting: boolean;
  isExcluded: boolean;
  movieId: number | null;
};

type Collection = {
  id: number;
  title: string;
  overview: string;
  posterUrl: string | null;
  monitored: boolean;
  minimumAvailability: string;
  downloadProfileIds: number[];
  movies: CollectionMovie[];
  missingMovies: number;
};

type Props = {
  collection: Collection;
  onEdit: (collection: Collection) => void;
  onAddMissing: (collectionId: number) => void;
  onExcludeMovie: (movie: CollectionMovie) => void;
  onAddMovie: (tmdbId: number) => void;
  onToggleMonitor: (collection: Collection) => void;
};

export default function CollectionCard({
  collection,
  onEdit,
  onAddMissing,
  onExcludeMovie,
  onAddMovie,
  onToggleMonitor,
}: Props): JSX.Element {
  const totalMovies = collection.movies.length;

  return (
    <div className="flex gap-4 rounded-lg border border-border bg-card p-4">
      {/* Poster */}
      <div className="w-[80px] h-[120px] flex-shrink-0 rounded-md overflow-hidden bg-muted">
        {collection.posterUrl ? (
          <img
            src={collection.posterUrl}
            alt={collection.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => onToggleMonitor(collection)}
              className="flex-shrink-0"
            >
              <div
                className={`w-3 h-3 rounded-full ${
                  collection.monitored ? "bg-green-500" : "bg-muted-foreground"
                }`}
              />
            </button>
            <h3 className="text-sm font-semibold truncate">
              {collection.title}
            </h3>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(collection)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {collection.missingMovies > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onAddMissing(collection.id)}
              >
                <PlusCircle className="mr-1 h-3.5 w-3.5" />
                Add Missing
              </Button>
            )}
          </div>
        </div>

        {/* Subtitle */}
        <p className="text-xs text-muted-foreground mt-0.5">
          {totalMovies} movie{totalMovies !== 1 ? "s" : ""}
          {collection.missingMovies > 0 && (
            <span className="text-red-400">
              {" "}
              · {collection.missingMovies} missing
            </span>
          )}
        </p>

        {/* Overview */}
        {collection.overview && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {collection.overview}
          </p>
        )}

        {/* Movie posters row */}
        {collection.movies.length > 0 && (
          <div className="flex gap-1.5 mt-3 overflow-x-auto">
            {collection.movies.map((movie) => (
              <CollectionMoviePoster
                key={movie.tmdbId}
                movie={movie}
                onExclude={onExcludeMovie}
                onAddMovie={onAddMovie}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
bun run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/movies/collection-movie-poster.tsx src/components/movies/edit-collection-dialog.tsx src/components/movies/collection-card.tsx
git commit -m "feat: add collection card, movie poster, and edit dialog components"
```

---

## Task 14: Collections Page Route

**Files:**

- Create: `src/routes/_authed/movies/collections.tsx`

- [ ] **Step 1: Create the collections page**

```typescript
// src/routes/_authed/movies/collections.tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useMemo, useCallback } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FolderOpen, RefreshCw, Search } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import PageHeader from "src/components/shared/page-header";
import EmptyState from "src/components/shared/empty-state";
import Skeleton from "src/components/ui/skeleton";
import { TooltipProvider } from "src/components/ui/tooltip";
import { movieCollectionsListQuery } from "src/lib/queries/movie-collections";
import CollectionCard from "src/components/movies/collection-card";
import EditCollectionDialog from "src/components/movies/edit-collection-dialog";
import {
  useRefreshCollections,
  useAddMissingCollectionMovies,
  useAddMovieImportExclusion,
  useUpdateMovieCollection,
} from "src/hooks/mutations/movie-collections";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";

export const Route = createFileRoute("/_authed/movies/collections")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(movieCollectionsListQuery()),
  component: CollectionsPage,
  pendingComponent: CollectionsPageSkeleton,
});

type QuickFilter = "all" | "missing" | "complete";
type SortOption = "title" | "missing";

function CollectionsPage() {
  const { data: collections } = useSuspenseQuery(movieCollectionsListQuery());
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sort, setSort] = useState<SortOption>("title");
  const [editCollection, setEditCollection] = useState<
    (typeof collections)[number] | null
  >(null);

  const refreshCollections = useRefreshCollections();
  const addMissing = useAddMissingCollectionMovies();
  const excludeMovie = useAddMovieImportExclusion();
  const updateCollection = useUpdateMovieCollection();

  const filtered = useMemo(() => {
    let result = collections;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.title.toLowerCase().includes(q));
    }

    // Quick filter
    if (quickFilter === "missing") {
      result = result.filter((c) => c.missingMovies > 0);
    } else if (quickFilter === "complete") {
      result = result.filter((c) => c.missingMovies === 0);
    }

    // Sort
    if (sort === "title") {
      result = [...result].sort((a, b) =>
        a.sortTitle.localeCompare(b.sortTitle),
      );
    } else {
      result = [...result].sort((a, b) => b.missingMovies - a.missingMovies);
    }

    return result;
  }, [collections, search, quickFilter, sort]);

  const handleToggleMonitor = useCallback(
    (collection: (typeof collections)[number]) => {
      updateCollection.mutate({
        id: collection.id,
        monitored: !collection.monitored,
      });
    },
    [updateCollection],
  );

  const router = useRouter();
  const handleAddMovie = useCallback(
    (tmdbId: number) => {
      router.navigate({
        to: "/movies/add",
        search: { tmdbId: String(tmdbId) },
      });
    },
    [router],
  );

  if (collections.length === 0) {
    return (
      <div>
        <PageHeader title="Collections" />
        <EmptyState
          icon={FolderOpen}
          title="No collections found"
          description="Collections are automatically discovered when you add movies that belong to a TMDB collection."
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div>
        <PageHeader
          title="Collections"
          description={`${collections.length} collection${collections.length !== 1 ? "s" : ""}`}
          actions={
            <Button
              variant="outline"
              onClick={() => refreshCollections.mutate()}
              disabled={refreshCollections.isPending}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${refreshCollections.isPending ? "animate-spin" : ""}`}
              />
              Refresh All
            </Button>
          }
        />

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex border border-border rounded-md">
            {(["all", "missing", "complete"] as const).map((f) => (
              <Button
                key={f}
                variant={quickFilter === f ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setQuickFilter(f)}
                className="capitalize"
              >
                {f}
              </Button>
            ))}
          </div>

          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search collections..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select
            value={sort}
            onValueChange={(v) => setSort(v as SortOption)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="missing">Missing</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Collection cards */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No results"
            description="No collections match your filters."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                onEdit={setEditCollection}
                onAddMissing={(id) => addMissing.mutate({ collectionId: id })}
                onExcludeMovie={(movie) =>
                  excludeMovie.mutate({
                    tmdbId: movie.tmdbId,
                    title: movie.title,
                    year: movie.year ?? undefined,
                  })
                }
                onAddMovie={handleAddMovie}
                onToggleMonitor={handleToggleMonitor}
              />
            ))}
          </div>
        )}

        <EditCollectionDialog
          collection={editCollection}
          open={editCollection !== null}
          onOpenChange={(open) => {
            if (!open) setEditCollection(null);
          }}
        />
      </div>
    </TooltipProvider>
  );
}

function CollectionsPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <div>
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-32" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        // oxlint-disable-next-line react/no-array-index-key
        <Skeleton key={i} className="h-40 w-full rounded-lg" />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify dev server**

```bash
bun run dev
```

Navigate to `http://localhost:3000/movies/collections`. Expected: Page renders with empty state (or collections if movies have been added).

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authed/movies/collections.tsx
git commit -m "feat: add movie collections page with filtering and overview cards"
```

---

## Task 15: Import Lists Settings Page Update

**Files:**

- Modify: `src/routes/_authed/settings/import-lists.tsx`

- [ ] **Step 1: Rewrite with book/movie tabs**

Rewrite `src/routes/_authed/settings/import-lists.tsx` to use tabs. The page should use the `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` components from shadcn/ui. Each tab independently queries its own server function.

Key changes:

- Import `getBookImportExclusionsFn`, `removeBookImportExclusionFn`, `getMovieImportExclusionsFn`, `removeMovieImportExclusionFn` from `src/server/import-list-exclusions`
- Import `Tabs, TabsList, TabsTrigger, TabsContent` from `src/components/ui/tabs`
- Use `queryKeys.importExclusions.books()` and `queryKeys.importExclusions.movies()` for cache keys
- Book exclusions tab: Title, Author, Date Excluded columns (existing layout)
- Movie exclusions tab: Title, Year, Date Excluded columns

The book tab is the existing content extracted into a tab. The movie tab follows the same pattern with `year` instead of `authorName`.

- [ ] **Step 2: Verify the page works**

Navigate to `http://localhost:3000/settings/import-lists`. Expected: Two tabs render, switching between book and movie exclusions.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authed/settings/import-lists.tsx
git commit -m "feat: add book/movie tabs to import list exclusions settings page"
```

---

## Task 16: Delete Movie Dialog — Import Exclusion Checkbox

**Files:**

- Modify: `src/components/movies/movie-detail-header.tsx`

- [ ] **Step 1: Add exclusion checkbox to delete dialog**

In `src/components/movies/movie-detail-header.tsx`, find the delete confirmation dialog. Add a checkbox: "Prevent this movie from being re-added by collections". This checkbox should only be visible when the movie has a `collectionId`.

Wire the checkbox state to the `addImportExclusion` field in the `deleteMovieFn` call.

Changes:

1. Add `collectionId` to the movie data type used by this component (it's available from `getMovieDetailFn`)
2. Add `const [addExclusion, setAddExclusion] = useState(false)` state
3. In the delete dialog content, add the checkbox (only rendered when `movie.collectionId` is truthy)
4. Pass `addImportExclusion: addExclusion` to the delete mutation

- [ ] **Step 2: Verify**

Navigate to a movie detail page for a movie that belongs to a collection. Open the delete dialog. Expected: Checkbox appears. For movies without a collection, the checkbox should not appear.

- [ ] **Step 3: Commit**

```bash
git add src/components/movies/movie-detail-header.tsx
git commit -m "feat: add import exclusion checkbox to movie delete dialog"
```

---

## Task 17: Final Verification

- [ ] **Step 1: Build check**

```bash
bun run build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 2: Verify end-to-end flow**

```bash
bun run dev
```

Test the following flow:

1. Add a movie that belongs to a TMDB collection (e.g., any Lord of the Rings movie)
2. Navigate to `/movies/collections` — the collection should appear as a card
3. Click Edit on the collection — verify modal opens with monitor toggle, profiles, availability
4. Toggle monitor on, select profiles, save
5. Click "Refresh All" — verify missing movies are auto-added
6. Right-click a missing movie poster — verify "Exclude from import" option works
7. Navigate to `/settings/import-lists` — verify movie exclusions tab shows the excluded movie
8. Delete a movie from a collection — verify exclusion checkbox appears
9. Verify filters (All/Missing/Complete) and search work on collections page

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
