# Manga Content Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manga as a first-class content type using MangaUpdates for metadata and existing Newznab/Torznab indexers for downloads.

**Architecture:** New manga-specific schema tables (manga → volumes → chapters) mirror the existing show → season → episode pattern. MangaUpdates REST API replaces TMDB/Hardcover as the metadata source. Shared infrastructure (download profiles, tracked downloads, history, indexer pipeline) is extended with manga FKs and content type values.

**Tech Stack:** Drizzle ORM (SQLite), TanStack Start server functions, React Query, shadcn/ui, Zod validation, MangaUpdates REST API

**Spec:** `docs/superpowers/specs/2026-03-27-manga-content-type-design.md`

---

## File Map

### New Files

| File                                            | Responsibility                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `src/db/schema/manga.ts`                        | manga, mangaVolumes, mangaChapters table definitions                |
| `src/db/schema/manga-files.ts`                  | mangaFiles table for downloaded chapter files                       |
| `src/db/schema/manga-download-profiles.ts`      | Junction table: manga ↔ download_profiles                           |
| `src/server/manga-updates.ts`                   | MangaUpdates REST API client with rate limiting                     |
| `src/server/manga-search.ts`                    | Server functions for searching MangaUpdates                         |
| `src/server/manga-import.ts`                    | Server functions for importing + refreshing manga metadata          |
| `src/server/manga.ts`                           | Manga CRUD server functions (list, detail, update, delete, monitor) |
| `src/lib/queries/manga.ts`                      | React Query query options for manga                                 |
| `src/hooks/mutations/manga.ts`                  | React Query mutation hooks for manga                                |
| `src/hooks/mutations/manga-chapter-profiles.ts` | Mutation hooks for chapter-level profile monitoring                 |
| `src/routes/_authed/manga/index.tsx`            | Manga library page (grid/table view)                                |
| `src/routes/_authed/manga/add.tsx`              | Add manga page (MangaUpdates search)                                |
| `src/routes/_authed/manga/series/$mangaId.tsx`  | Manga detail page                                                   |
| `src/components/manga/manga-card.tsx`           | Library grid card                                                   |
| `src/components/manga/manga-table.tsx`          | Library table view                                                  |
| `src/components/manga/manga-detail-header.tsx`  | Detail page header with profile toggles                             |
| `src/components/manga/manga-updates-search.tsx` | MangaUpdates search + import component                              |
| `src/components/manga/volume-accordion.tsx`     | Expandable volume/chapter list                                      |
| `src/components/manga/chapter-row.tsx`          | Individual chapter row in volume accordion                          |
| `src/components/manga/manga-bulk-bar.tsx`       | Bulk edit bar for library                                           |

### Modified Files

| File                                               | Change                                                      |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `src/db/schema/index.ts`                           | Add exports for manga, manga-files, manga-download-profiles |
| `src/db/schema/tracked-downloads.ts`               | Add `mangaId`, `mangaChapterId` nullable FKs                |
| `src/db/schema/history.ts`                         | Add `mangaId`, `mangaChapterId` nullable FKs                |
| `src/lib/validators.ts`                            | Add `"manga"` to contentType enum, add manga Zod schemas    |
| `src/lib/query-keys.ts`                            | Add `manga` and `mangaUpdates` query key factories          |
| `src/lib/queries/index.ts`                         | Add manga query re-export                                   |
| `src/hooks/mutations/index.ts`                     | Add manga mutation re-exports                               |
| `src/components/layout/app-sidebar.tsx`            | Add "Manga" nav group                                       |
| `src/routes/_authed/settings/media-management.tsx` | Add manga naming tab                                        |
| `src/routes/_authed/settings/profiles.tsx`         | Add manga tab to profile editor                             |
| `src/routes/_authed/settings/formats.tsx`          | Add manga default format settings                           |
| `src/server/auto-search.ts`                        | Add `getWantedChapters()` and manga search query builder    |

---

## Task 1: Database Schema + Migration

**Files:**

- Create: `src/db/schema/manga.ts`
- Create: `src/db/schema/manga-files.ts`
- Create: `src/db/schema/manga-download-profiles.ts`
- Modify: `src/db/schema/tracked-downloads.ts`
- Modify: `src/db/schema/history.ts`
- Modify: `src/db/schema/index.ts`

**Reference files to read first:**

- `src/db/schema/shows.ts` — shows/seasons/episodes pattern to mirror
- `src/db/schema/episode-files.ts` — file tracking pattern
- `src/db/schema/show-download-profiles.ts` — junction table pattern
- `src/db/schema/tracked-downloads.ts` — polymorphic FK pattern
- `src/db/schema/history.ts` — polymorphic FK pattern

- [ ] **Step 1: Create `src/db/schema/manga.ts`**

Define three tables in one file (mirroring how shows.ts contains shows + seasons + episodes):

```typescript
import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const manga = sqliteTable(
  "manga",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    sortTitle: text("sort_title").notNull(),
    overview: text("overview").notNull().default(""),
    mangaUpdatesId: integer("manga_updates_id").notNull(),
    mangaUpdatesSlug: text("manga_updates_slug"),
    type: text("type").notNull().default("manga"), // manga | manhwa | manhua
    year: text("year"),
    status: text("status").notNull().default("ongoing"), // ongoing | complete | hiatus | cancelled
    latestChapter: integer("latest_chapter"),
    posterUrl: text("poster_url").notNull().default(""),
    fanartUrl: text("fanart_url").notNull().default(""),
    images: text("images", { mode: "json" }).$type<
      { url: string; coverType: string }[]
    >(),
    tags: text("tags", { mode: "json" }).$type<number[]>(),
    genres: text("genres", { mode: "json" }).$type<string[]>(),
    monitored: integer("monitored", { mode: "boolean" }).default(true),
    monitorNewChapters: text("monitor_new_chapters").notNull().default("all"), // all | future | missing | none
    path: text("path").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    metadataUpdatedAt: integer("metadata_updated_at", {
      mode: "timestamp",
    }),
  },
  (t) => [unique("manga_manga_updates_id_unique").on(t.mangaUpdatesId)],
);

export const mangaVolumes = sqliteTable(
  "manga_volumes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mangaId: integer("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    volumeNumber: integer("volume_number"), // nullable for ungrouped chapters
    title: text("title"),
    monitored: integer("monitored", { mode: "boolean" }).default(true),
  },
  (t) => [
    unique("manga_volumes_manga_volume_unique").on(t.mangaId, t.volumeNumber),
  ],
);

export const mangaChapters = sqliteTable("manga_chapters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mangaVolumeId: integer("manga_volume_id")
    .notNull()
    .references(() => mangaVolumes.id, { onDelete: "cascade" }),
  mangaId: integer("manga_id")
    .notNull()
    .references(() => manga.id, { onDelete: "cascade" }),
  chapterNumber: text("chapter_number").notNull(), // supports "10.5", "Extra"
  title: text("title"),
  releaseDate: text("release_date"),
  scanlationGroup: text("scanlation_group"),
  hasFile: integer("has_file", { mode: "boolean" }).default(false),
  monitored: integer("monitored", { mode: "boolean" }).default(true),
});
```

- [ ] **Step 2: Create `src/db/schema/manga-files.ts`**

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { mangaChapters } from "./manga";

export const mangaFiles = sqliteTable("manga_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chapterId: integer("chapter_id")
    .notNull()
    .references(() => mangaChapters.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  size: integer("size").notNull().default(0),
  format: text("format"), // cbz | cbr | pdf | epub
  quality: text("quality"),
  scanlationGroup: text("scanlation_group"),
  language: text("language"),
  dateAdded: integer("date_added", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

- [ ] **Step 3: Create `src/db/schema/manga-download-profiles.ts`**

```typescript
import { sqliteTable, integer, unique } from "drizzle-orm/sqlite-core";
import { manga } from "./manga";
import { downloadProfiles } from "./download-profiles";

export const mangaDownloadProfiles = sqliteTable(
  "manga_download_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mangaId: integer("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    downloadProfileId: integer("download_profile_id")
      .notNull()
      .references(() => downloadProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.mangaId, t.downloadProfileId)],
);
```

- [ ] **Step 4: Extend `src/db/schema/tracked-downloads.ts`**

Add two nullable FKs after the existing `movieId` field:

```typescript
// Add these imports at the top:
import { manga, mangaChapters } from "./manga";

// Add these columns after movieId:
mangaId: integer("manga_id").references(() => manga.id, {
  onDelete: "set null",
}),
mangaChapterId: integer("manga_chapter_id").references(
  () => mangaChapters.id,
  { onDelete: "set null" },
),
```

- [ ] **Step 5: Extend `src/db/schema/history.ts`**

Add two nullable FKs after the existing `movieId` field:

```typescript
// Add these imports at the top:
import { manga, mangaChapters } from "./manga";

// Add these columns after movieId:
mangaId: integer("manga_id").references(() => manga.id, {
  onDelete: "set null",
}),
mangaChapterId: integer("manga_chapter_id").references(
  () => mangaChapters.id,
  { onDelete: "set null" },
),
```

- [ ] **Step 6: Update `src/db/schema/index.ts`**

Add these three exports alongside the existing content type exports:

```typescript
export * from "./manga";
export * from "./manga-files";
export * from "./manga-download-profiles";
```

- [ ] **Step 7: Generate and apply migration**

Run: `bun run db:generate`

Then run: `bun run db:migrate`

Verify the migration SQL was created in `drizzle/` and applied successfully.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema/manga.ts src/db/schema/manga-files.ts src/db/schema/manga-download-profiles.ts src/db/schema/tracked-downloads.ts src/db/schema/history.ts src/db/schema/index.ts drizzle/
git commit -m "feat: add manga database schema and migration

Adds manga, manga_volumes, manga_chapters, manga_files, and
manga_download_profiles tables. Extends tracked_downloads and
history with manga foreign keys."
```

---

## Task 2: Validators + Query Keys

**Files:**

- Modify: `src/lib/validators.ts`
- Modify: `src/lib/query-keys.ts`

**Reference files to read first:**

- `src/lib/validators.ts` — existing contentType enum and schema patterns
- `src/lib/tmdb-validators.ts` — addShowSchema/updateShowSchema patterns
- `src/lib/query-keys.ts` — existing query key factory

- [ ] **Step 1: Add "manga" to contentType enum in validators.ts**

Find the `contentType` field in `downloadProfileBaseSchema` and add `"manga"`:

```typescript
contentType: z.enum(["movie", "tv", "ebook", "audiobook", "manga"]),
```

- [ ] **Step 2: Add manga Zod schemas to validators.ts**

Add these at the end of the file, before the final export (or at end of file):

```typescript
// ─── Manga ──────────────────────────────────────────────────────────────

export const addMangaSchema = z.object({
  mangaUpdatesId: z.number(),
  title: z.string(),
  sortTitle: z.string(),
  overview: z.string().default(""),
  mangaUpdatesSlug: z.string().nullable().default(null),
  type: z.string().default("manga"),
  year: z.string().nullable().default(null),
  status: z.string().default("ongoing"),
  latestChapter: z.number().nullable().default(null),
  posterUrl: z.string().default(""),
  genres: z.array(z.string()).default([]),
  downloadProfileIds: z.array(z.number()).default([]),
  monitorOption: z.enum(["all", "future", "missing", "none"]).default("all"),
  rootFolderPath: z.string().default(""),
  searchOnAdd: z.boolean().default(false),
});

export const updateMangaSchema = z.object({
  id: z.number(),
  downloadProfileIds: z.array(z.number()).optional(),
  monitorNewChapters: z.enum(["all", "future", "missing", "none"]).optional(),
  path: z.string().optional(),
});

export const deleteMangaSchema = z.object({
  id: z.number(),
  deleteFiles: z.boolean().default(false),
});

export const monitorMangaProfileSchema = z.object({
  mangaId: z.number(),
  downloadProfileId: z.number(),
});

export const unmonitorMangaProfileSchema = z.object({
  mangaId: z.number(),
  downloadProfileId: z.number(),
  deleteFiles: z.boolean().default(false),
});

export const bulkMonitorMangaChapterProfileSchema = z.object({
  chapterIds: z.array(z.number()),
  downloadProfileId: z.number(),
});

export const bulkUnmonitorMangaChapterProfileSchema = z.object({
  chapterIds: z.array(z.number()),
  downloadProfileId: z.number(),
  deleteFiles: z.boolean().default(false),
});

export const refreshMangaSchema = z.object({
  mangaId: z.number(),
});

export const searchMangaUpdatesSchema = z.object({
  query: z.string().min(1),
});

export const getMangaUpdatesDetailSchema = z.object({
  seriesId: z.number(),
});

export const checkMangaExistsSchema = z.object({
  mangaUpdatesId: z.number(),
});
```

- [ ] **Step 3: Add manga query keys to `src/lib/query-keys.ts`**

Add this block alongside the existing domain sections (e.g., after the Shows section):

```typescript
// ─── Manga ───────────────────────────────────────────────────────────────
manga: {
  all: ["manga"] as const,
  lists: () => ["manga", "list"] as const,
  detail: (id: number) => ["manga", "detail", id] as const,
  existence: (mangaUpdatesId: number) =>
    ["manga", "existence", mangaUpdatesId] as const,
},

// ─── MangaUpdates ─────────────────────────────────────────────────────
mangaUpdates: {
  all: ["mangaUpdates"] as const,
  search: (query: string) => ["mangaUpdates", "search", query] as const,
  detail: (seriesId: number) =>
    ["mangaUpdates", "detail", seriesId] as const,
  releases: (seriesId: number) =>
    ["mangaUpdates", "releases", seriesId] as const,
  groups: (seriesId: number) =>
    ["mangaUpdates", "groups", seriesId] as const,
},
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/validators.ts src/lib/query-keys.ts
git commit -m "feat: add manga validators and query keys"
```

---

## Task 3: MangaUpdates API Client

**Files:**

- Create: `src/server/manga-updates.ts`

**Reference files to read first:**

- `src/server/search.ts` — existing API integration pattern (Hardcover GraphQL)
- `src/server/middleware.ts` — `requireAuth()` pattern

This task creates a typed client for the MangaUpdates REST API (`api.mangaupdates.com/v1`). No authentication required for read endpoints.

- [ ] **Step 1: Create `src/server/manga-updates.ts`**

```typescript
/**
 * MangaUpdates REST API client.
 * Docs: https://api.mangaupdates.com
 * No authentication required for read endpoints.
 */

const BASE_URL = "https://api.mangaupdates.com/v1";

// Simple rate limiter: ~2 req/s
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 500;

async function rateLimitedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_INTERVAL_MS - elapsed),
    );
  }
  lastRequestTime = Date.now();
  return fetch(url, init);
}

// ─── Types ────────────────────────────────────────────────────────────────

export type MangaUpdatesSeriesResult = {
  series_id: number;
  title: string;
  url: string;
  description: string;
  image: {
    url: { original: string; thumb: string };
    height: number;
    width: number;
  } | null;
  type: string;
  year: string;
  bayesian_rating: number;
  rating_votes: number;
  genres: { genre: string }[];
};

export type MangaUpdatesSeriesDetail = MangaUpdatesSeriesResult & {
  associated: { title: string }[];
  status: string;
  latest_chapter: number | null;
  completed: boolean;
  licensed: boolean;
  last_updated: {
    timestamp: number;
    as_rfc3339: string;
    as_string: string;
  } | null;
  categories: {
    series_id: number;
    category: string;
    votes: number;
    votes_plus: number;
    votes_minus: number;
    added_by: number;
  }[];
  authors: {
    name: string;
    author_id: number;
    type: string;
  }[];
};

export type MangaUpdatesRelease = {
  id: number;
  title: string;
  volume: string | null;
  chapter: string;
  groups: {
    name: string;
    group_id: number;
  }[];
  release_date: string;
  time_added: {
    timestamp: number;
    as_rfc3339: string;
  };
};

export type MangaUpdatesGroup = {
  group_id: number;
  name: string;
  url: string;
  active: boolean;
  social: {
    site: string | null;
    discord: string | null;
  };
};

// ─── API Functions ────────────────────────────────────────────────────────

export async function searchMangaUpdatesSeries(
  query: string,
  perPage = 25,
): Promise<{
  totalHits: number;
  results: MangaUpdatesSeriesResult[];
}> {
  const res = await rateLimitedFetch(`${BASE_URL}/series/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ search: query, per_page: perPage }),
  });
  if (!res.ok) throw new Error(`MangaUpdates search failed: ${res.status}`);
  const data = await res.json();
  return {
    totalHits: data.total_hits ?? 0,
    results: (data.results ?? []).map(
      (r: { record: MangaUpdatesSeriesResult }) => r.record,
    ),
  };
}

export async function getMangaUpdatesSeriesDetail(
  seriesId: number,
): Promise<MangaUpdatesSeriesDetail> {
  const res = await rateLimitedFetch(`${BASE_URL}/series/${seriesId}`);
  if (!res.ok)
    throw new Error(`MangaUpdates series detail failed: ${res.status}`);
  return res.json();
}

export async function getMangaUpdatesReleases(
  title: string,
  perPage = 100,
  page = 1,
): Promise<{
  totalHits: number;
  results: MangaUpdatesRelease[];
}> {
  const res = await rateLimitedFetch(`${BASE_URL}/releases/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ search: title, per_page: perPage, page }),
  });
  if (!res.ok)
    throw new Error(`MangaUpdates releases search failed: ${res.status}`);
  const data = await res.json();
  return {
    totalHits: data.total_hits ?? 0,
    results: (data.results ?? []).map(
      (r: { record: MangaUpdatesRelease }) => r.record,
    ),
  };
}

export async function getMangaUpdatesSeriesGroups(
  seriesId: number,
): Promise<MangaUpdatesGroup[]> {
  const res = await rateLimitedFetch(`${BASE_URL}/series/${seriesId}/groups`);
  if (!res.ok) throw new Error(`MangaUpdates groups failed: ${res.status}`);
  const data = await res.json();
  return data.group_list ?? [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/manga-updates.ts
git commit -m "feat: add MangaUpdates REST API client"
```

---

## Task 4: Manga Search Server Functions

**Files:**

- Create: `src/server/manga-search.ts`

**Reference files to read first:**

- `src/server/search.ts` — existing search server function pattern
- `src/server/manga-updates.ts` — the API client from Task 3
- `src/server/middleware.ts` — `requireAuth()` usage

- [ ] **Step 1: Create `src/server/manga-search.ts`**

```typescript
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./middleware";
import {
  searchMangaUpdatesSeries,
  getMangaUpdatesSeriesDetail,
  getMangaUpdatesReleases,
  getMangaUpdatesSeriesGroups,
} from "./manga-updates";
import {
  searchMangaUpdatesSchema,
  getMangaUpdatesDetailSchema,
} from "src/lib/validators";

export const searchMangaFn = createServerFn({ method: "GET" })
  .validator(searchMangaUpdatesSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();
    const { query } = data;
    const result = await searchMangaUpdatesSeries(query);
    return result;
  });

export const getMangaUpdatesDetailFn = createServerFn({ method: "GET" })
  .validator(getMangaUpdatesDetailSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();
    const detail = await getMangaUpdatesSeriesDetail(data.seriesId);
    return detail;
  });

export const getMangaUpdatesReleasesFn = createServerFn({ method: "GET" })
  .validator(getMangaUpdatesDetailSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();
    const detail = await getMangaUpdatesSeriesDetail(data.seriesId);
    // Fetch all releases, paginating if needed
    const allReleases: Awaited<
      ReturnType<typeof getMangaUpdatesReleases>
    >["results"] = [];
    let page = 1;
    let totalHits = 0;
    do {
      const result = await getMangaUpdatesReleases(detail.title, 100, page);
      totalHits = result.totalHits;
      allReleases.push(...result.results);
      page++;
    } while (allReleases.length < totalHits && page <= 50);

    return { releases: allReleases, totalHits };
  });

export const getMangaUpdatesGroupsFn = createServerFn({ method: "GET" })
  .validator(getMangaUpdatesDetailSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();
    const groups = await getMangaUpdatesSeriesGroups(data.seriesId);
    return groups;
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/server/manga-search.ts
git commit -m "feat: add manga search server functions"
```

---

## Task 5: Manga Import + CRUD Server Functions

**Files:**

- Create: `src/server/manga-import.ts`
- Create: `src/server/manga.ts`

**Reference files to read first:**

- `src/server/import.ts` — import pattern (transaction, deduplication, history)
- `src/server/shows.ts` — CRUD pattern (add, update, delete, list, detail, monitor)
- `src/db/schema/manga.ts` — table definitions from Task 1
- `src/lib/validators.ts` — schemas from Task 2

- [ ] **Step 1: Create `src/server/manga-import.ts`**

This handles importing a manga from MangaUpdates into the local DB:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import { manga, mangaVolumes, mangaChapters } from "src/db/schema/manga";
import { mangaDownloadProfiles } from "src/db/schema/manga-download-profiles";
import { history } from "src/db/schema/history";
import { requireAuth } from "./middleware";
import {
  getMangaUpdatesSeriesDetail,
  getMangaUpdatesReleases,
  type MangaUpdatesRelease,
} from "./manga-updates";
import { addMangaSchema, refreshMangaSchema } from "src/lib/validators";

type DeduplicatedChapter = {
  chapterNumber: string;
  volumeNumber: number | null;
  releaseDate: string | null;
  scanlationGroup: string | null;
};

/**
 * Deduplicate MangaUpdates releases into unique chapters.
 * Multiple groups may release the same chapter — we keep the earliest.
 */
function deduplicateReleases(
  releases: MangaUpdatesRelease[],
): DeduplicatedChapter[] {
  const chapterMap = new Map<string, DeduplicatedChapter>();

  for (const release of releases) {
    const chNum = release.chapter;
    if (!chNum || chapterMap.has(chNum)) continue;

    const volNum = release.volume ? Number.parseInt(release.volume, 10) : null;
    const groupName = release.groups.length > 0 ? release.groups[0].name : null;

    chapterMap.set(chNum, {
      chapterNumber: chNum,
      volumeNumber: Number.isNaN(volNum) ? null : volNum,
      releaseDate: release.release_date || null,
      scanlationGroup: groupName,
    });
  }

  return [...chapterMap.values()];
}

/**
 * Group chapters into volumes. Chapters without a volume go into
 * a special "ungrouped" volume (volumeNumber = null).
 */
function groupByVolume(
  chapters: DeduplicatedChapter[],
): Map<number | null, DeduplicatedChapter[]> {
  const volumeMap = new Map<number | null, DeduplicatedChapter[]>();
  for (const ch of chapters) {
    const key = ch.volumeNumber;
    if (!volumeMap.has(key)) volumeMap.set(key, []);
    volumeMap.get(key)!.push(ch);
  }
  return volumeMap;
}

export const importMangaFn = createServerFn({ method: "POST" })
  .validator(addMangaSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();

    // Check for duplicate
    const existing = db
      .select({ id: manga.id })
      .from(manga)
      .where(eq(manga.mangaUpdatesId, data.mangaUpdatesId))
      .get();
    if (existing) {
      throw new Error("Manga already exists in library");
    }

    // Fetch releases for volume/chapter structure
    const allReleases: MangaUpdatesRelease[] = [];
    let page = 1;
    let totalHits = 0;
    do {
      const result = await getMangaUpdatesReleases(data.title, 100, page);
      totalHits = result.totalHits;
      allReleases.push(...result.results);
      page++;
    } while (allReleases.length < totalHits && page <= 50);

    const chapters = deduplicateReleases(allReleases);
    const volumeGroups = groupByVolume(chapters);

    // Determine which chapters to monitor based on monitorOption
    const monitorAll = data.monitorOption === "all";
    const monitorFuture = data.monitorOption === "future";
    const monitorMissing = data.monitorOption === "missing";

    return db.transaction((tx) => {
      // Insert manga
      const mangaRow = tx
        .insert(manga)
        .values({
          title: data.title,
          sortTitle: data.sortTitle,
          overview: data.overview,
          mangaUpdatesId: data.mangaUpdatesId,
          mangaUpdatesSlug: data.mangaUpdatesSlug,
          type: data.type,
          year: data.year,
          status: data.status,
          latestChapter: data.latestChapter,
          posterUrl: data.posterUrl,
          genres: data.genres,
          monitored: true,
          monitorNewChapters: data.monitorOption,
          path: data.rootFolderPath
            ? `${data.rootFolderPath}/${data.title}`
            : "",
        })
        .returning()
        .get();

      // Insert download profiles
      for (const profileId of data.downloadProfileIds) {
        tx.insert(mangaDownloadProfiles)
          .values({
            mangaId: mangaRow.id,
            downloadProfileId: profileId,
          })
          .run();
      }

      // Insert volumes and chapters
      let chaptersAdded = 0;
      for (const [volNum, volChapters] of volumeGroups) {
        const volumeRow = tx
          .insert(mangaVolumes)
          .values({
            mangaId: mangaRow.id,
            volumeNumber: volNum,
            monitored: true,
          })
          .returning()
          .get();

        for (const ch of volChapters) {
          // For "future" mode, only monitor chapters without a release date
          // or with a release date after now (since they haven't been released yet)
          const shouldMonitor =
            monitorAll || monitorMissing || (monitorFuture && !ch.releaseDate);

          tx.insert(mangaChapters)
            .values({
              mangaVolumeId: volumeRow.id,
              mangaId: mangaRow.id,
              chapterNumber: ch.chapterNumber,
              releaseDate: ch.releaseDate,
              scanlationGroup: ch.scanlationGroup,
              monitored: shouldMonitor,
            })
            .run();
          chaptersAdded++;
        }
      }

      // History
      tx.insert(history)
        .values({
          eventType: "manga.added",
          mangaId: mangaRow.id,
          data: {
            title: data.title,
            chaptersAdded,
            volumesAdded: volumeGroups.size,
          },
        })
        .run();

      return {
        mangaId: mangaRow.id,
        chaptersAdded,
        volumesAdded: volumeGroups.size,
      };
    });
  });

export const refreshMangaMetadataFn = createServerFn({ method: "POST" })
  .validator(refreshMangaSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();

    const mangaRow = db
      .select()
      .from(manga)
      .where(eq(manga.id, data.mangaId))
      .get();
    if (!mangaRow) throw new Error("Manga not found");

    const detail = await getMangaUpdatesSeriesDetail(mangaRow.mangaUpdatesId);

    // Update manga metadata
    db.update(manga)
      .set({
        title: detail.title,
        overview: detail.description ?? mangaRow.overview,
        status: detail.completed ? "complete" : "ongoing",
        latestChapter: detail.latest_chapter,
        posterUrl: detail.image?.url.original ?? mangaRow.posterUrl,
        genres: detail.genres.map((g) => g.genre),
        metadataUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(manga.id, data.mangaId))
      .run();

    // Fetch releases and detect new chapters
    const allReleases: MangaUpdatesRelease[] = [];
    let page = 1;
    let totalHits = 0;
    do {
      const result = await getMangaUpdatesReleases(detail.title, 100, page);
      totalHits = result.totalHits;
      allReleases.push(...result.results);
      page++;
    } while (allReleases.length < totalHits && page <= 50);

    const chapters = deduplicateReleases(allReleases);

    // Get existing chapter numbers
    const existingChapters = db
      .select({ chapterNumber: mangaChapters.chapterNumber })
      .from(mangaChapters)
      .where(eq(mangaChapters.mangaId, data.mangaId))
      .all();
    const existingSet = new Set(existingChapters.map((c) => c.chapterNumber));

    // Insert new chapters
    let newChaptersAdded = 0;
    for (const ch of chapters) {
      if (existingSet.has(ch.chapterNumber)) continue;

      // Find or create volume
      let volumeRow = db
        .select()
        .from(mangaVolumes)
        .where(eq(mangaVolumes.mangaId, data.mangaId))
        .all()
        .find((v) => v.volumeNumber === ch.volumeNumber);

      if (!volumeRow) {
        volumeRow = db
          .insert(mangaVolumes)
          .values({
            mangaId: data.mangaId,
            volumeNumber: ch.volumeNumber,
            monitored: true,
          })
          .returning()
          .get();
      }

      const shouldMonitor =
        mangaRow.monitorNewChapters === "all" ||
        mangaRow.monitorNewChapters === "missing" ||
        mangaRow.monitorNewChapters === "future";

      db.insert(mangaChapters)
        .values({
          mangaVolumeId: volumeRow.id,
          mangaId: data.mangaId,
          chapterNumber: ch.chapterNumber,
          releaseDate: ch.releaseDate,
          scanlationGroup: ch.scanlationGroup,
          monitored: shouldMonitor,
        })
        .run();

      newChaptersAdded++;
    }

    if (newChaptersAdded > 0) {
      db.insert(history)
        .values({
          eventType: "manga.updated",
          mangaId: data.mangaId,
          data: { newChaptersAdded },
        })
        .run();
    }

    return { newChaptersAdded };
  });
```

- [ ] **Step 2: Create `src/server/manga.ts`**

CRUD server functions following the `src/server/shows.ts` pattern:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { db } from "src/db";
import { manga, mangaVolumes, mangaChapters } from "src/db/schema/manga";
import { mangaFiles } from "src/db/schema/manga-files";
import { mangaDownloadProfiles } from "src/db/schema/manga-download-profiles";
import { history } from "src/db/schema/history";
import { requireAuth } from "./middleware";
import {
  updateMangaSchema,
  deleteMangaSchema,
  monitorMangaProfileSchema,
  unmonitorMangaProfileSchema,
  checkMangaExistsSchema,
} from "src/lib/validators";
import { z } from "zod";

export const getMangasFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();

    const rows = db
      .select({
        id: manga.id,
        title: manga.title,
        sortTitle: manga.sortTitle,
        type: manga.type,
        year: manga.year,
        status: manga.status,
        posterUrl: manga.posterUrl,
        monitored: manga.monitored,
        monitorNewChapters: manga.monitorNewChapters,
        latestChapter: manga.latestChapter,
        path: manga.path,
        chapterCount: sql<number>`(
          SELECT COUNT(*) FROM manga_chapters
          WHERE manga_chapters.manga_id = ${manga.id}
        )`,
        chapterFileCount: sql<number>`(
          SELECT COUNT(*) FROM manga_chapters
          WHERE manga_chapters.manga_id = ${manga.id}
            AND manga_chapters.has_file = 1
        )`,
        volumeCount: sql<number>`(
          SELECT COUNT(*) FROM manga_volumes
          WHERE manga_volumes.manga_id = ${manga.id}
        )`,
      })
      .from(manga)
      .all();

    // Attach download profile IDs
    const allLinks = db
      .select({
        mangaId: mangaDownloadProfiles.mangaId,
        downloadProfileId: mangaDownloadProfiles.downloadProfileId,
      })
      .from(mangaDownloadProfiles)
      .all();

    const profileMap = new Map<number, number[]>();
    for (const link of allLinks) {
      if (!profileMap.has(link.mangaId)) profileMap.set(link.mangaId, []);
      profileMap.get(link.mangaId)!.push(link.downloadProfileId);
    }

    return rows.map((row) => ({
      ...row,
      downloadProfileIds: profileMap.get(row.id) ?? [],
    }));
  },
);

export const getMangaDetailFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.number() }).parse)
  .handler(async ({ data }) => {
    await requireAuth();

    const mangaRow = db.select().from(manga).where(eq(manga.id, data.id)).get();
    if (!mangaRow) throw new Error("Manga not found");

    const volumes = db
      .select()
      .from(mangaVolumes)
      .where(eq(mangaVolumes.mangaId, data.id))
      .all();

    const chapters = db
      .select()
      .from(mangaChapters)
      .where(eq(mangaChapters.mangaId, data.id))
      .all();

    const files = db
      .select()
      .from(mangaFiles)
      .where(
        sql`${mangaFiles.chapterId} IN (
          SELECT id FROM manga_chapters WHERE manga_id = ${data.id}
        )`,
      )
      .all();

    const profileLinks = db
      .select({
        downloadProfileId: mangaDownloadProfiles.downloadProfileId,
      })
      .from(mangaDownloadProfiles)
      .where(eq(mangaDownloadProfiles.mangaId, data.id))
      .all();

    // Build chapter file map
    const fileMap = new Map<number, (typeof files)[0][]>();
    for (const f of files) {
      if (!fileMap.has(f.chapterId)) fileMap.set(f.chapterId, []);
      fileMap.get(f.chapterId)!.push(f);
    }

    // Build volume → chapters structure
    const volumesWithChapters = volumes.map((vol) => ({
      ...vol,
      chapters: chapters
        .filter((ch) => ch.mangaVolumeId === vol.id)
        .map((ch) => ({
          ...ch,
          files: fileMap.get(ch.id) ?? [],
          downloadProfileIds: profileLinks.map((l) => l.downloadProfileId),
        })),
    }));

    return {
      ...mangaRow,
      downloadProfileIds: profileLinks.map((l) => l.downloadProfileId),
      volumes: volumesWithChapters,
    };
  });

export const updateMangaFn = createServerFn({ method: "POST" })
  .validator(updateMangaSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();

    db.update(manga)
      .set({
        ...(data.monitorNewChapters && {
          monitorNewChapters: data.monitorNewChapters,
        }),
        ...(data.path && { path: data.path }),
        updatedAt: new Date(),
      })
      .where(eq(manga.id, data.id))
      .run();

    if (data.downloadProfileIds) {
      // Replace all profile links
      db.delete(mangaDownloadProfiles)
        .where(eq(mangaDownloadProfiles.mangaId, data.id))
        .run();
      for (const profileId of data.downloadProfileIds) {
        db.insert(mangaDownloadProfiles)
          .values({ mangaId: data.id, downloadProfileId: profileId })
          .run();
      }
    }

    return { success: true };
  });

export const deleteMangaFn = createServerFn({ method: "POST" })
  .validator(deleteMangaSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();

    const mangaRow = db.select().from(manga).where(eq(manga.id, data.id)).get();
    if (!mangaRow) throw new Error("Manga not found");

    if (data.deleteFiles && mangaRow.path) {
      const { rm } = await import("node:fs/promises");
      await rm(mangaRow.path, { recursive: true, force: true }).catch(() => {});
    }

    db.insert(history)
      .values({
        eventType: "manga.deleted",
        data: { title: mangaRow.title },
      })
      .run();

    db.delete(manga).where(eq(manga.id, data.id)).run();

    return { success: true };
  });

export const monitorMangaProfileFn = createServerFn({ method: "POST" })
  .validator(monitorMangaProfileSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();
    db.insert(mangaDownloadProfiles)
      .values({
        mangaId: data.mangaId,
        downloadProfileId: data.downloadProfileId,
      })
      .onConflictDoNothing()
      .run();
    return { success: true };
  });

export const unmonitorMangaProfileFn = createServerFn({ method: "POST" })
  .validator(unmonitorMangaProfileSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(mangaDownloadProfiles)
      .where(
        sql`${mangaDownloadProfiles.mangaId} = ${data.mangaId}
          AND ${mangaDownloadProfiles.downloadProfileId} = ${data.downloadProfileId}`,
      )
      .run();
    return { success: true };
  });

export const checkMangaExistsFn = createServerFn({ method: "GET" })
  .validator(checkMangaExistsSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();
    const existing = db
      .select({ id: manga.id })
      .from(manga)
      .where(eq(manga.mangaUpdatesId, data.mangaUpdatesId))
      .get();
    return { exists: !!existing, mangaId: existing?.id ?? null };
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/server/manga-import.ts src/server/manga.ts
git commit -m "feat: add manga import and CRUD server functions"
```

---

## Task 6: Query Options + Mutation Hooks

**Files:**

- Create: `src/lib/queries/manga.ts`
- Create: `src/hooks/mutations/manga.ts`
- Create: `src/hooks/mutations/manga-chapter-profiles.ts`
- Modify: `src/lib/queries/index.ts`
- Modify: `src/hooks/mutations/index.ts`

**Reference files to read first:**

- `src/lib/queries/shows.ts` — query option pattern
- `src/hooks/mutations/shows.ts` — mutation hook pattern
- `src/hooks/mutations/episode-profiles.ts` — bulk profile mutation pattern

- [ ] **Step 1: Create `src/lib/queries/manga.ts`**

```typescript
// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions } from "@tanstack/react-query";
import {
  getMangasFn,
  getMangaDetailFn,
  checkMangaExistsFn,
} from "src/server/manga";
import { queryKeys } from "../query-keys";

export const mangaListQuery = () =>
  queryOptions({
    queryKey: queryKeys.manga.lists(),
    queryFn: () => getMangasFn(),
  });

export const mangaDetailQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.manga.detail(id),
    queryFn: () => getMangaDetailFn({ data: { id } }),
  });

export const mangaExistenceQuery = (mangaUpdatesId: number) =>
  queryOptions({
    queryKey: queryKeys.manga.existence(mangaUpdatesId),
    queryFn: () => checkMangaExistsFn({ data: { mangaUpdatesId } }),
    enabled: mangaUpdatesId > 0,
  });
```

- [ ] **Step 2: Add to `src/lib/queries/index.ts`**

Add this line:

```typescript
export * from "./manga";
```

- [ ] **Step 3: Create `src/hooks/mutations/manga.ts`**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import {
  updateMangaFn,
  deleteMangaFn,
  monitorMangaProfileFn,
  unmonitorMangaProfileFn,
} from "src/server/manga";
import { importMangaFn, refreshMangaMetadataFn } from "src/server/manga-import";
import type { z } from "zod";
import type {
  addMangaSchema,
  updateMangaSchema,
  deleteMangaSchema,
  monitorMangaProfileSchema,
  unmonitorMangaProfileSchema,
  refreshMangaSchema,
} from "src/lib/validators";

export function useAddManga() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof addMangaSchema>) =>
      importMangaFn({ data }),
    onSuccess: () => {
      toast.success("Manga added");
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to add manga",
      ),
  });
}

export function useUpdateManga() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateMangaSchema>) =>
      updateMangaFn({ data }),
    onSuccess: () => {
      toast.success("Manga updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
    },
    onError: () => toast.error("Failed to update manga"),
  });
}

export function useDeleteManga() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof deleteMangaSchema>) =>
      deleteMangaFn({ data }),
    onSuccess: () => {
      toast.success("Manga deleted");
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to delete manga"),
  });
}

export function useMonitorMangaProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof monitorMangaProfileSchema>) =>
      monitorMangaProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
    },
  });
}

export function useUnmonitorMangaProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof unmonitorMangaProfileSchema>) =>
      unmonitorMangaProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
    },
  });
}

export function useRefreshMangaMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof refreshMangaSchema>) =>
      refreshMangaMetadataFn({ data }),
    onSuccess: (result) => {
      toast.success(
        result.newChaptersAdded > 0
          ? `Found ${result.newChaptersAdded} new chapter(s)`
          : "Metadata up to date",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
    },
    onError: () => toast.error("Failed to refresh metadata"),
  });
}
```

- [ ] **Step 4: Create `src/hooks/mutations/manga-chapter-profiles.ts`**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import { queryKeys } from "src/lib/query-keys";
import {
  bulkMonitorMangaChapterProfileSchema,
  bulkUnmonitorMangaChapterProfileSchema,
} from "src/lib/validators";
import { requireAuth } from "src/server/middleware";
import { db } from "src/db";
import { mangaDownloadProfiles } from "src/db/schema/manga-download-profiles";
import { mangaChapters } from "src/db/schema/manga";

const bulkMonitorMangaChapterProfileFn = createServerFn({ method: "POST" })
  .validator(bulkMonitorMangaChapterProfileSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();
    for (const chapterId of data.chapterIds) {
      // Get the mangaId from the chapter
      const chapter = db
        .select({ mangaId: mangaChapters.mangaId })
        .from(mangaChapters)
        .where(sql`${mangaChapters.id} = ${chapterId}`)
        .get();
      if (!chapter) continue;

      db.insert(mangaDownloadProfiles)
        .values({
          mangaId: chapter.mangaId,
          downloadProfileId: data.downloadProfileId,
        })
        .onConflictDoNothing()
        .run();
    }
    return { success: true };
  });

const bulkUnmonitorMangaChapterProfileFn = createServerFn({ method: "POST" })
  .validator(bulkUnmonitorMangaChapterProfileSchema.parse)
  .handler(async ({ data }) => {
    await requireAuth();
    // Get mangaId from first chapter
    const chapter = db
      .select({ mangaId: mangaChapters.mangaId })
      .from(mangaChapters)
      .where(sql`${mangaChapters.id} = ${data.chapterIds[0]}`)
      .get();
    if (!chapter) return { success: true };

    db.delete(mangaDownloadProfiles)
      .where(
        sql`${mangaDownloadProfiles.mangaId} = ${chapter.mangaId}
          AND ${mangaDownloadProfiles.downloadProfileId} = ${data.downloadProfileId}`,
      )
      .run();
    return { success: true };
  });

export function useBulkMonitorMangaChapterProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { chapterIds: number[]; downloadProfileId: number }) =>
      bulkMonitorMangaChapterProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
    },
  });
}

export function useBulkUnmonitorMangaChapterProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      chapterIds: number[];
      downloadProfileId: number;
      deleteFiles: boolean;
    }) => bulkUnmonitorMangaChapterProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
    },
  });
}
```

- [ ] **Step 5: Update `src/hooks/mutations/index.ts`**

Add these lines:

```typescript
export * from "./manga";
export * from "./manga-chapter-profiles";
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/manga.ts src/lib/queries/index.ts src/hooks/mutations/manga.ts src/hooks/mutations/manga-chapter-profiles.ts src/hooks/mutations/index.ts
git commit -m "feat: add manga query options and mutation hooks"
```

---

## Task 7: Sidebar + Manga Library Page

**Files:**

- Modify: `src/components/layout/app-sidebar.tsx`
- Create: `src/routes/_authed/manga/index.tsx`
- Create: `src/components/manga/manga-card.tsx`
- Create: `src/components/manga/manga-table.tsx`
- Create: `src/components/manga/manga-bulk-bar.tsx`

**Reference files to read first:**

- `src/components/layout/app-sidebar.tsx` — nav group structure
- `src/routes/_authed/tv/index.tsx` — library page pattern (grid/table, search, mass editor)
- `src/components/tv/show-card.tsx` — card component pattern
- `src/components/tv/show-table.tsx` — table component pattern
- `src/components/tv/show-bulk-bar.tsx` — bulk bar pattern

**Implementation notes:**

- Add a "Manga" nav group to the sidebar `navGroups` array, using `BookOpen` icon from lucide-react (or another suitable icon). Include children: "Add New" → `/manga/add`, "Library" → `/manga`, with `matchPrefixes: ["/manga"]`.
- The manga library page follows the exact same structure as `tv/index.tsx`: view mode toggle (grid/table), search filter, mass editor with bulk profile assignment. Filter profiles to `contentType === "manga"`.
- `manga-card.tsx` mirrors `show-card.tsx`: poster image, title, year, status badge, chapter progress (`chapterFileCount/chapterCount`). Links to `/manga/series/$mangaId`.
- `manga-table.tsx` mirrors `show-table.tsx`: sortable columns (title, type, year, volumes, chapters, status), profile toggle, selectable rows.
- `manga-bulk-bar.tsx` mirrors `show-bulk-bar.tsx`: profile selection, apply to selected.

Status colors for manga: `ongoing` → green, `complete` → blue, `hiatus` → yellow, `cancelled` → red.

- [ ] **Step 1: Add manga to sidebar**

In the `navGroups` array in `app-sidebar.tsx`, add a new entry. Import `BookOpenText` from lucide-react for the icon:

```typescript
{
  title: "Manga",
  to: "/manga",
  icon: BookOpenText,
  matchPrefixes: ["/manga"],
  children: [
    { title: "Add New", to: "/manga/add", icon: Plus },
    { title: "Library", to: "/manga", icon: BookOpenText },
  ],
},
```

- [ ] **Step 2: Create `manga-card.tsx`, `manga-table.tsx`, `manga-bulk-bar.tsx`**

Follow the patterns from show-card.tsx, show-table.tsx, and show-bulk-bar.tsx exactly, adapting field names (show → manga, episodes → chapters, seasons → volumes). See reference files above.

- [ ] **Step 3: Create `src/routes/_authed/manga/index.tsx`**

Follow the `tv/index.tsx` pattern. Loader preloads `mangaListQuery()`, `downloadProfilesListQuery()`, `userSettingsQuery("manga")`. Filter profiles to `contentType === "manga"`.

- [ ] **Step 4: Run `bun run build` to verify compilation**

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/app-sidebar.tsx src/routes/_authed/manga/ src/components/manga/
git commit -m "feat: add manga sidebar nav and library page with grid/table views"
```

---

## Task 8: Manga Add Page + Search Component

**Files:**

- Create: `src/routes/_authed/manga/add.tsx`
- Create: `src/components/manga/manga-updates-search.tsx`

**Reference files to read first:**

- `src/routes/_authed/tv/add.tsx` — add page shell
- `src/components/tv/tmdb-show-search.tsx` — search component pattern (debounced input, result cards, preview modal with config, user settings defaults)
- `src/server/manga-search.ts` — search server functions from Task 4
- `src/hooks/mutations/manga.ts` — `useAddManga()` from Task 6

**Implementation notes:**

- `add.tsx` is a simple shell: back link to `/manga`, PageHeader "Add Manga", Card containing `<MangaUpdatesSearch />`.
- `manga-updates-search.tsx` follows `tmdb-show-search.tsx` pattern:
  - Debounced search input calling `searchMangaFn`
  - Result cards showing: poster thumbnail, title, year, type badge (Manga/Manhwa/Manhua), rating, overview (2-line clamp)
  - On click → preview modal with:
    - Full series metadata
    - Configuration: root folder path, download profile selection (filtered to `contentType === "manga"`), monitor option (`all`/`future`/`missing`/`none`), search on add toggle
    - "Add" button calling `useAddManga()`
  - After successful add, show toast and optionally navigate to detail page

Monitor options for manga:

```typescript
const MANGA_MONITOR_OPTIONS = [
  { value: "all", label: "All Chapters" },
  { value: "future", label: "Future Chapters" },
  { value: "missing", label: "Missing Chapters" },
  { value: "none", label: "None" },
] as const;
```

- [ ] **Step 1: Create `src/routes/_authed/manga/add.tsx`**
- [ ] **Step 2: Create `src/components/manga/manga-updates-search.tsx`**
- [ ] **Step 3: Run `bun run build` to verify**
- [ ] **Step 4: Commit**

```bash
git add src/routes/_authed/manga/add.tsx src/components/manga/manga-updates-search.tsx
git commit -m "feat: add manga search page with MangaUpdates integration"
```

---

## Task 9: Manga Detail Page + Components

**Files:**

- Create: `src/routes/_authed/manga/series/$mangaId.tsx`
- Create: `src/components/manga/manga-detail-header.tsx`
- Create: `src/components/manga/volume-accordion.tsx`
- Create: `src/components/manga/chapter-row.tsx`

**Reference files to read first:**

- `src/routes/_authed/tv/series/$showId.tsx` — detail page pattern (loader, not-found, skeleton)
- `src/components/tv/show-detail-header.tsx` — header with profile toggles, edit dialog, delete confirm
- `src/components/tv/season-accordion.tsx` — expandable container with per-item profile monitoring
- `src/components/tv/episode-row.tsx` — individual item row with file status and profile toggles

**Implementation notes:**

**`$mangaId.tsx`:**

- Loader: preload `mangaDetailQuery(id)` and `downloadProfilesListQuery()`
- Component: renders `MangaDetailHeader` + `Accordion` with sorted volumes (ungrouped volumes with `volumeNumber === null` at the end, otherwise descending)
- Not found and skeleton components

**`manga-detail-header.tsx`:**

- Three-column layout: poster, metadata column (title, year, type, status, genres), overview
- Profile monitoring toggles (active/partial state computed from chapter-level profiles)
- Edit dialog: download profiles, monitor new chapters mode
- Delete button with confirmation
- Refresh metadata button
- MangaUpdates external link

**`volume-accordion.tsx`:**

- Mirrors `season-accordion.tsx` exactly
- Volume label: `"Volume X"` or `"Ungrouped"` for null volume number
- Per-volume profile toggle (bulk monitors/unmonitors all chapters)
- Chapter progress count with color coding (green = all files, yellow = partial, gray = none)
- Column headers: profile toggles, #, Title, Release Date, Group, File

**`chapter-row.tsx`:**

- Chapter number display (supports decimal like "10.5")
- Title (optional)
- Release date
- Scanlation group
- File status indicator (green check / red X)
- Per-chapter profile toggle icons

- [ ] **Step 1: Create `chapter-row.tsx` and `volume-accordion.tsx`**
- [ ] **Step 2: Create `manga-detail-header.tsx`**
- [ ] **Step 3: Create `$mangaId.tsx` route**
- [ ] **Step 4: Run `bun run build` to verify**
- [ ] **Step 5: Commit**

```bash
git add src/routes/_authed/manga/series/ src/components/manga/manga-detail-header.tsx src/components/manga/volume-accordion.tsx src/components/manga/chapter-row.tsx
git commit -m "feat: add manga detail page with volume/chapter accordion"
```

---

## Task 10: Settings Integration

**Files:**

- Modify: `src/routes/_authed/settings/media-management.tsx`
- Modify: `src/routes/_authed/settings/profiles.tsx`
- Modify: `src/routes/_authed/settings/formats.tsx`

**Reference files to read first:**

- `src/routes/_authed/settings/media-management.tsx` — naming template tabs, state builders, save handlers
- `src/routes/_authed/settings/profiles.tsx` — tabbed profile editor
- `src/routes/_authed/settings/formats.tsx` — format defaults config

**Implementation notes:**

**media-management.tsx:**

- Add a "Manga" tab alongside existing tabs
- Create `buildMangaState()` with these naming settings:
  - `naming.manga.chapterFile`: default `"{Manga Title} - Chapter {Chapter:000}"`
  - `naming.manga.volumeFolder`: default `"Volume {Volume:00}"`
  - `naming.manga.mangaFolder`: default `"{Manga Title} ({Year})"`
- Create `handleSaveManga()` following the pattern of `handleSaveTv()`
- Add a manga naming tokens string: `"{Manga Title}, {Volume}, {Volume:00}, {Chapter}, {Chapter:000}, {Chapter Title}, {Scanlation Group}, {Year}"`
- Include the standard media management settings (rename, replace illegal chars, import extra files, etc.) via `buildMediaManagementSettings(settings, "manga")` and `MediaManagementSection`

**profiles.tsx:**

- Add a "Manga" tab that filters `downloadProfiles` to `contentType === "manga"`
- Create and edit dialogs should work with `contentType: "manga"` automatically

**formats.tsx:**

- Add `manga` to the `DEFAULTS_CONFIG` object:

```typescript
manga: {
  label: "Default Manga Chapter Pages",
  key: "format.manga.defaultChapterPages",
  fallback: 20,
  unit: "pages",
  hint: "Used when a chapter's page count is unavailable",
},
```

- Add "Manga" to the tabs list

- [ ] **Step 1: Add manga tab to media-management.tsx**
- [ ] **Step 2: Add manga tab to profiles.tsx**
- [ ] **Step 3: Add manga to formats.tsx**
- [ ] **Step 4: Run `bun run build` to verify**
- [ ] **Step 5: Commit**

```bash
git add src/routes/_authed/settings/media-management.tsx src/routes/_authed/settings/profiles.tsx src/routes/_authed/settings/formats.tsx
git commit -m "feat: add manga to settings (naming, profiles, formats)"
```

---

## Task 11: Build Verification + Fixes

**Files:**

- Any files that fail compilation

- [ ] **Step 1: Run full build**

Run: `bun run build`

Expected: Clean build with no TypeScript errors.

- [ ] **Step 2: Fix any compilation errors**

Common issues to watch for:

- Missing imports (schema types, server functions)
- Route tree auto-generation (`src/routeTree.gen.ts`) — run `bun run dev` briefly to trigger regeneration if needed
- Type mismatches between server function return types and component prop types
- Missing re-exports in barrel files

- [ ] **Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve build errors for manga content type"
```

---

## Deferred: Auto-Search Integration (Task 12)

> **Note:** This task is deferred because auto-search for manga requires indexer search query patterns specific to Nyaa/manga torrents, which need real-world testing against actual indexer responses. The core functionality (schema, metadata, UI, CRUD) works without it.

**Files to modify when ready:**

- `src/server/auto-search.ts` — add `getWantedChapters()` following `getWantedEpisodes()` pattern
- Manga search query builder: `"${title}" chapter ${chapterNumber}` and `"${title}" volume ${volumeNumber}`
- Scoring logic for scanlation group matching against profile preferences
