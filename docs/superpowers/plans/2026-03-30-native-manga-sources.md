# Native Manga Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing MangaUpdates/MangaDex/Wikipedia manga metadata pipeline with a native TypeScript manga source system that serves as the unified metadata, indexer, and download mechanism for manga content.

**Architecture:** Plugin-style source engine hierarchy. API-based sources (MangaDex, Comick, MangaPlus, AsuraScans) extend an `ApiEngine` base. HTML-scraping sources use theme engines (Madara, MangaThemesia, MadTheme, MangaBox) that extend an `HtmlEngine` base. All sources implement a common `MangaSource` interface. The source registry manages enabled/disabled state persisted in the DB. Chapter downloads fetch page images and package them into CBZ files.

**Tech Stack:** TypeScript, cheerio (HTML parsing), adm-zip (CBZ generation), Drizzle ORM (SQLite), TanStack Start (server functions + React), shadcn/ui (settings UI)

**Spec:** `docs/superpowers/specs/2026-03-30-native-manga-sources-design.md`

---

## File Map

### New Files (Create)

| File                                                        | Responsibility                                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/server/manga-sources/types.ts`                         | `MangaSource` interface, `MangaPage`, `SourceManga`, `MangaDetails`, `SourceChapter`, `Filter` types                       |
| `src/server/manga-sources/registry.ts`                      | Source registry: loads sources, manages enabled/disabled state from DB, provides lookup                                    |
| `src/server/manga-sources/downloader.ts`                    | Page image fetcher + CBZ packager, rate-limited concurrent downloads                                                       |
| `src/server/manga-sources/engines/api-engine.ts`            | Base class for JSON API sources: request building, JSON parsing, rate limiting                                             |
| `src/server/manga-sources/engines/html-engine.ts`           | Base class for HTML scrapers: `fetchDocument()`, cheerio helpers, element-to-model mapping                                 |
| `src/server/manga-sources/engines/madara-engine.ts`         | Madara theme engine: AJAX chapter loading, lazy-load image attrs, date parsing                                             |
| `src/server/manga-sources/engines/manga-themesia-engine.ts` | MangaThemesia theme engine: HTML img + JS JSON fallback for page images                                                    |
| `src/server/manga-sources/engines/mad-theme-engine.ts`      | MadTheme engine                                                                                                            |
| `src/server/manga-sources/engines/manga-box-engine.ts`      | MangaBox engine (Mangakakalot, Manganato, Mangabat)                                                                        |
| `src/server/manga-sources/sources/mangadex.ts`              | MangaDex source: public API, at-home image delivery, content rating filters                                                |
| `src/server/manga-sources/sources/comick.ts`                | Comick source: internal JSON API                                                                                           |
| `src/server/manga-sources/sources/mangaplus.ts`             | MangaPlus source: Shueisha internal API                                                                                    |
| `src/server/manga-sources/sources/asura-scans.ts`           | AsuraScans source: JSON API + HTML                                                                                         |
| `src/server/manga-sources/sources/mangafire.ts`             | MangaFire standalone HTML + AJAX scraper                                                                                   |
| `src/server/manga-sources/sources/webtoons.ts`              | Webtoons standalone HTML scraper                                                                                           |
| `src/server/manga-sources/sources/ninemanga.ts`             | NineManga standalone HTML scraper                                                                                          |
| `src/server/manga-sources/sites/madara-sites.ts`            | Declarative config for 20 Madara sites                                                                                     |
| `src/server/manga-sources/sites/themesia-sites.ts`          | Declarative config for 10 MangaThemesia sites                                                                              |
| `src/server/manga-sources/sites/mad-theme-sites.ts`         | Declarative config for 19 MadTheme sites                                                                                   |
| `src/server/manga-sources/sites/manga-box-sites.ts`         | Declarative config for 3 MangaBox sites                                                                                    |
| `src/server/manga-sources/index.ts`                         | Re-exports registry, types, and initializes all sources                                                                    |
| `src/server/scheduler/tasks/refresh-manga-sources.ts`       | Scheduled task: iterates monitored manga, refreshes from assigned source                                                   |
| `src/components/manga/manga-source-search.tsx`              | New search component: searches across enabled sources with source badges                                                   |
| `src/routes/_authed/settings/manga-sources.tsx`             | Settings page: list all sources grouped by type, enable/disable toggles                                                    |
| `drizzle/NNNN_<name>.sql`                                   | Migration: add `sourceId`/`sourceMangaUrl`/`sourceMangaThumbnail` to manga, add `mangaSources` table, drop removed columns |

### Modified Files

| File                                            | Changes                                                                                                                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/db/schema/manga.ts`                        | Remove 6 columns (mangaUpdatesId, mangaUpdatesSlug, mangaDexId, mangaDexFetchedAt, wikipediaPageTitle, wikipediaFetchedAt), remove mappingSource from mangaVolumes, add sourceId/sourceMangaUrl/sourceMangaThumbnail, add mangaSources table |
| `src/db/schema/index.ts`                        | Remove `manga-download-profiles` export                                                                                                                                                                                                      |
| `src/server/manga-import.ts`                    | Rewrite: import from source instead of MangaUpdates/MangaDex/Wikipedia                                                                                                                                                                       |
| `src/server/manga-search.ts`                    | Rewrite: search across enabled sources instead of MangaUpdates                                                                                                                                                                               |
| `src/lib/validators.ts`                         | Update `addMangaSchema` (replace mangaUpdatesId with sourceId/sourceMangaUrl), remove `searchMangaUpdatesSchema`, `getMangaUpdatesDetailSchema`, `checkMangaExistsSchema`, add `searchMangaSourcesSchema`, `mangaSourceConfigSchema`         |
| `src/lib/query-keys.ts`                         | Replace `mangaUpdates` keys with `mangaSources` keys                                                                                                                                                                                         |
| `src/lib/queries/manga.ts`                      | Update `mangaExistenceQuery` to use sourceMangaUrl instead of mangaUpdatesId                                                                                                                                                                 |
| `src/hooks/mutations/manga.ts`                  | Update `useAddManga` to pass source fields instead of MangaUpdates fields                                                                                                                                                                    |
| `src/components/manga/manga-detail-header.tsx`  | Show source badge, add "Migrate Source" action, remove MangaUpdates external link                                                                                                                                                            |
| `src/components/manga/manga-updates-search.tsx` | Replace with `manga-source-search.tsx` (or rewrite in place)                                                                                                                                                                                 |
| `src/routes/_authed/manga/add.tsx`              | Use new source search component                                                                                                                                                                                                              |
| `src/routes/_authed/manga/series/$mangaId.tsx`  | Remove download profile references for manga detail                                                                                                                                                                                          |
| `src/server/scheduler/index.ts`                 | Replace `refresh-mangaupdates-metadata` import with `refresh-manga-sources`                                                                                                                                                                  |
| `src/lib/nav-config.ts`                         | Add "Manga Sources" entry to settingsNavItems                                                                                                                                                                                                |
| `src/server/indexers/types.ts`                  | Remove manga release types (SingleChapter, MultiChapter, SingleVolume, MultiVolume)                                                                                                                                                          |

### Deleted Files

| File                                                          | Reason                                     |
| ------------------------------------------------------------- | ------------------------------------------ |
| `src/server/mangadex.ts`                                      | Replaced by MangaDex source                |
| `src/server/wikipedia.ts`                                     | No longer needed                           |
| `src/server/manga-chapter-utils.ts`                           | Tied to MangaUpdates format                |
| `src/server/scheduler/tasks/refresh-mangaupdates-metadata.ts` | Replaced by refresh-manga-sources          |
| `src/db/schema/manga-download-profiles.ts`                    | Download profiles no longer used for manga |
| `src/lib/queries/manga-updates.ts`                            | MangaUpdates queries no longer used        |

---

## Task Breakdown

### Task 1: Source Types and Interface

**Files:**

- Create: `src/server/manga-sources/types.ts`

- [ ] **Step 1: Create the MangaSource interface and supporting types**

```typescript
// src/server/manga-sources/types.ts

export interface MangaSource {
  id: string;
  name: string;
  baseUrl: string;
  lang: string;
  supportsLatest: boolean;

  searchManga(
    page: number,
    query: string,
    filters?: FilterList,
  ): Promise<MangaPage>;
  getPopularManga(page: number): Promise<MangaPage>;
  getLatestUpdates(page: number): Promise<MangaPage>;
  getMangaDetails(mangaUrl: string): Promise<MangaDetails>;
  getChapterList(mangaUrl: string): Promise<SourceChapter[]>;
  getPageList(chapterUrl: string): Promise<PageUrl[]>;
}

export interface MangaPage {
  manga: SourceManga[];
  hasNextPage: boolean;
}

export interface SourceManga {
  url: string;
  title: string;
  thumbnailUrl?: string;
}

export interface MangaDetails {
  title: string;
  author?: string;
  artist?: string;
  description?: string;
  genres?: string[];
  status?: "ongoing" | "complete" | "hiatus" | "cancelled";
  type?: "manga" | "manhwa" | "manhua";
  thumbnailUrl?: string;
}

export interface SourceChapter {
  url: string;
  name: string;
  chapterNumber?: number;
  volumeNumber?: number;
  scanlator?: string;
  dateUpload?: Date;
}

export type PageUrl = string;

export type FilterList = Filter[];
export type Filter =
  | { type: "select"; name: string; options: string[]; value: number }
  | { type: "checkbox"; name: string; value: boolean }
  | {
      type: "tristate";
      name: string;
      value: "include" | "exclude" | "ignore";
    }
  | { type: "text"; name: string; value: string }
  | {
      type: "sort";
      name: string;
      values: string[];
      ascending: boolean;
      index: number;
    }
  | { type: "group"; name: string; filters: Filter[] };

/** Config for a theme-based site (Madara, MangaThemesia, etc.) */
export interface ThemeSiteConfig {
  name: string;
  url: string;
  lang: string;
  overrides?: Record<string, unknown>;
}

/** Source definition used by the registry */
export interface SourceDefinition {
  id: string;
  name: string;
  lang: string;
  group:
    | "api"
    | "madara"
    | "mangathemesia"
    | "madtheme"
    | "mangabox"
    | "standalone";
  factory: () => MangaSource;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/manga-sources/types.ts
git commit -m "feat(manga-sources): add MangaSource interface and supporting types"
```

---

### Task 2: API Engine Base Class

**Files:**

- Create: `src/server/manga-sources/engines/api-engine.ts`

The `ApiEngine` provides JSON request/response handling with rate limiting using the existing `createApiFetcher` from `src/server/api-cache.ts`.

- [ ] **Step 1: Create ApiEngine base class**

```typescript
// src/server/manga-sources/engines/api-engine.ts
import { createApiFetcher } from "src/server/api-cache";
import type {
  MangaSource,
  MangaPage,
  MangaDetails,
  SourceChapter,
  PageUrl,
  FilterList,
} from "../types";

export interface ApiEngineConfig {
  id: string;
  name: string;
  baseUrl: string;
  lang: string;
  supportsLatest: boolean;
  rateLimit?: { maxRequests: number; windowMs: number };
}

export abstract class ApiEngine implements MangaSource {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly lang: string;
  readonly supportsLatest: boolean;
  protected readonly fetcher: ReturnType<typeof createApiFetcher>;

  constructor(config: ApiEngineConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.lang = config.lang;
    this.supportsLatest = config.supportsLatest;
    this.fetcher = createApiFetcher({
      name: `manga-source-${config.id}`,
      cache: { ttlMs: 5 * 60 * 1000, maxEntries: 200 },
      rateLimit: config.rateLimit ?? { maxRequests: 3, windowMs: 1000 },
      retry: { maxRetries: 2, baseDelayMs: 1000 },
    });
  }

  protected async fetchJson<T>(url: string, cacheKey?: string): Promise<T> {
    return this.fetcher.fetch<T>(cacheKey ?? url, async () => {
      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${url}`);
      }
      return response.json() as Promise<T>;
    });
  }

  protected getHeaders(): Record<string, string> {
    return { "User-Agent": "Allstarr/1.0" };
  }

  abstract searchManga(
    page: number,
    query: string,
    filters?: FilterList,
  ): Promise<MangaPage>;
  abstract getPopularManga(page: number): Promise<MangaPage>;
  abstract getLatestUpdates(page: number): Promise<MangaPage>;
  abstract getMangaDetails(mangaUrl: string): Promise<MangaDetails>;
  abstract getChapterList(mangaUrl: string): Promise<SourceChapter[]>;
  abstract getPageList(chapterUrl: string): Promise<PageUrl[]>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/manga-sources/engines/api-engine.ts
git commit -m "feat(manga-sources): add ApiEngine base class with rate-limited JSON fetching"
```

---

### Task 3: HTML Engine Base Class

**Files:**

- Create: `src/server/manga-sources/engines/html-engine.ts`

- [ ] **Step 1: Install cheerio**

```bash
bun add cheerio
```

- [ ] **Step 2: Create HtmlEngine base class**

```typescript
// src/server/manga-sources/engines/html-engine.ts
import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio, AnyNode } from "cheerio";
import { createApiFetcher } from "src/server/api-cache";
import type {
  MangaSource,
  MangaPage,
  MangaDetails,
  SourceChapter,
  PageUrl,
  FilterList,
} from "../types";

export interface HtmlEngineConfig {
  id: string;
  name: string;
  baseUrl: string;
  lang: string;
  supportsLatest: boolean;
  rateLimit?: { maxRequests: number; windowMs: number };
}

export abstract class HtmlEngine implements MangaSource {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly lang: string;
  readonly supportsLatest: boolean;
  protected readonly fetcher: ReturnType<typeof createApiFetcher>;

  constructor(config: HtmlEngineConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.lang = config.lang;
    this.supportsLatest = config.supportsLatest;
    this.fetcher = createApiFetcher({
      name: `manga-source-${config.id}`,
      cache: { ttlMs: 5 * 60 * 1000, maxEntries: 200 },
      rateLimit: config.rateLimit ?? { maxRequests: 2, windowMs: 1000 },
      retry: { maxRetries: 2, baseDelayMs: 1000 },
    });
  }

  protected async fetchDocument(
    url: string,
    cacheKey?: string,
  ): Promise<CheerioAPI> {
    return this.fetcher.fetch<CheerioAPI>(cacheKey ?? url, async () => {
      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${url}`);
      }
      const html = await response.text();
      return cheerio.load(html);
    });
  }

  protected getHeaders(): Record<string, string> {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
  }

  /** Extract the best image URL from an element (handles lazy-loading attrs). */
  protected imgAttr(el: Cheerio<AnyNode>): string {
    return (
      el.attr("data-src") ??
      el.attr("data-lazy-src") ??
      el.attr("srcset")?.split(" ")[0] ??
      el.attr("src") ??
      ""
    );
  }

  /** Make a relative URL absolute using this source's baseUrl. */
  protected absUrl(path: string): string {
    if (path.startsWith("http")) return path;
    return `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  abstract searchManga(
    page: number,
    query: string,
    filters?: FilterList,
  ): Promise<MangaPage>;
  abstract getPopularManga(page: number): Promise<MangaPage>;
  abstract getLatestUpdates(page: number): Promise<MangaPage>;
  abstract getMangaDetails(mangaUrl: string): Promise<MangaDetails>;
  abstract getChapterList(mangaUrl: string): Promise<SourceChapter[]>;
  abstract getPageList(chapterUrl: string): Promise<PageUrl[]>;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/manga-sources/engines/html-engine.ts
git commit -m "feat(manga-sources): add HtmlEngine base class with cheerio HTML parsing"
```

---

### Task 4: Source Registry

**Files:**

- Create: `src/server/manga-sources/registry.ts`

The registry follows the same pattern as `src/server/download-clients/registry.ts` but adds DB-persisted enabled/disabled state.

- [ ] **Step 1: Create the source registry**

```typescript
// src/server/manga-sources/registry.ts
import { db } from "src/db";
import { mangaSources } from "src/db/schema";
import { eq } from "drizzle-orm";
import type { MangaSource, SourceDefinition } from "./types";

const definitions: SourceDefinition[] = [];
const instances = new Map<string, MangaSource>();

export function registerSource(def: SourceDefinition): void {
  definitions.push(def);
}

export function getAllSourceDefinitions(): SourceDefinition[] {
  return definitions;
}

export function getSource(sourceId: string): MangaSource {
  let instance = instances.get(sourceId);
  if (!instance) {
    const def = definitions.find((d) => d.id === sourceId);
    if (!def) {
      throw new Error(`Unknown manga source: ${sourceId}`);
    }
    instance = def.factory();
    instances.set(sourceId, instance);
  }
  return instance;
}

export function getEnabledSources(): MangaSource[] {
  const enabledRows = db
    .select({ sourceId: mangaSources.sourceId })
    .from(mangaSources)
    .where(eq(mangaSources.enabled, true))
    .all();
  const enabledIds = new Set(enabledRows.map((r) => r.sourceId));
  return definitions
    .filter((d) => enabledIds.has(d.id))
    .map((d) => getSource(d.id));
}

export function getSourceConfig(
  sourceId: string,
): Record<string, unknown> | null {
  const row = db
    .select({ config: mangaSources.config })
    .from(mangaSources)
    .where(eq(mangaSources.sourceId, sourceId))
    .get();
  if (!row?.config) return null;
  return JSON.parse(row.config) as Record<string, unknown>;
}

export function setSourceEnabled(sourceId: string, enabled: boolean): void {
  db.insert(mangaSources)
    .values({ sourceId, enabled, config: null })
    .onConflictDoUpdate({
      target: mangaSources.sourceId,
      set: { enabled },
    })
    .run();
}

export function setSourceConfig(
  sourceId: string,
  config: Record<string, unknown>,
): void {
  db.insert(mangaSources)
    .values({ sourceId, enabled: true, config: JSON.stringify(config) })
    .onConflictDoUpdate({
      target: mangaSources.sourceId,
      set: { config: JSON.stringify(config) },
    })
    .run();
}

/** Seed DB rows for all registered sources (disabled by default). */
export function seedSourcesIfNeeded(): void {
  const existing = db
    .select({ sourceId: mangaSources.sourceId })
    .from(mangaSources)
    .all();
  const existingIds = new Set(existing.map((r) => r.sourceId));

  for (const def of definitions) {
    if (!existingIds.has(def.id)) {
      db.insert(mangaSources)
        .values({ sourceId: def.id, enabled: false, config: null })
        .run();
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/manga-sources/registry.ts
git commit -m "feat(manga-sources): add source registry with DB-persisted enabled/disabled state"
```

---

### Task 5: Database Schema Changes

**Files:**

- Modify: `src/db/schema/manga.ts`
- Delete: `src/db/schema/manga-download-profiles.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Update manga schema — remove old columns, add source columns, add mangaSources table**

In `src/db/schema/manga.ts`, replace the entire file with:

```typescript
import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const manga = sqliteTable(
  "manga",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    sortTitle: text("sort_title").notNull(),
    overview: text("overview").notNull().default(""),
    sourceId: text("source_id").notNull(),
    sourceMangaUrl: text("source_manga_url").notNull(),
    sourceMangaThumbnail: text("source_manga_thumbnail"),
    type: text("type").notNull().default("manga"), // manga | manhwa | manhua
    year: text("year"),
    status: text("status").notNull().default("ongoing"), // ongoing | complete | hiatus | cancelled
    latestChapter: integer("latest_chapter"),
    posterUrl: text("poster_url").notNull().default(""),
    cachedPosterPath: text("cached_poster_path"),
    fanartUrl: text("fanart_url").notNull().default(""),
    images: text("images", { mode: "json" }).$type<
      Array<{ url: string; coverType: string }>
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
  (t) => [unique("manga_source_url_unique").on(t.sourceId, t.sourceMangaUrl)],
);

export const mangaVolumes = sqliteTable(
  "manga_volumes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mangaId: integer("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    volumeNumber: integer("volume_number"),
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
  chapterNumber: text("chapter_number").notNull(),
  title: text("title"),
  sourceChapterUrl: text("source_chapter_url"),
  releaseDate: text("release_date"),
  scanlationGroup: text("scanlation_group"),
  hasFile: integer("has_file", { mode: "boolean" }).default(false),
  monitored: integer("monitored", { mode: "boolean" }).default(true),
  lastSearchedAt: integer("last_searched_at"),
});

export const mangaSources = sqliteTable("manga_sources", {
  sourceId: text("source_id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  config: text("config"), // JSON blob for source-specific settings
});
```

Note the additions: `sourceId`, `sourceMangaUrl`, `sourceMangaThumbnail` on `manga`; `sourceChapterUrl` on `mangaChapters`; new `mangaSources` table. Removals: `mangaUpdatesId`, `mangaUpdatesSlug`, `mangaDexId`, `mangaDexFetchedAt`, `wikipediaPageTitle`, `wikipediaFetchedAt` from `manga`; `mappingSource` from `mangaVolumes`. Unique constraint changed from `mangaUpdatesId` to `(sourceId, sourceMangaUrl)`.

- [ ] **Step 2: Delete manga-download-profiles.ts**

Delete `src/db/schema/manga-download-profiles.ts`.

- [ ] **Step 3: Update schema index exports**

In `src/db/schema/index.ts`, remove the line:

```typescript
export * from "./manga-download-profiles";
```

- [ ] **Step 4: Generate Drizzle migration**

```bash
bun run db:generate
```

Review the generated SQL migration. It should:

- Add `source_id`, `source_manga_url`, `source_manga_thumbnail` columns to `manga`
- Add `source_chapter_url` column to `manga_chapters`
- Drop `manga_updates_id`, `manga_updates_slug`, `manga_dex_id`, `manga_dex_fetched_at`, `wikipedia_page_title`, `wikipedia_fetched_at` from `manga`
- Drop `mapping_source` from `manga_volumes`
- Drop `manga_download_profiles` table
- Create `manga_sources` table
- Update unique constraint on `manga`

Note: SQLite doesn't support `DROP COLUMN` directly — Drizzle generates table recreation. Review carefully.

- [ ] **Step 5: Run migration**

```bash
bun run db:migrate
```

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/manga.ts src/db/schema/index.ts drizzle/
git commit -m "feat(manga-sources): update manga schema for source-based architecture

Remove MangaUpdates/MangaDex/Wikipedia columns, add sourceId/sourceMangaUrl,
add mangaSources table, drop manga-download-profiles table."
```

---

### Task 6: MangaDex Source

**Files:**

- Create: `src/server/manga-sources/sources/mangadex.ts`

MangaDex is the most important source — it has a public API, broad coverage, and Allstarr already had MangaDex integration code to reference. This source handles search, details, chapter list, and at-home page delivery.

- [ ] **Step 1: Implement MangaDex source**

Reference the existing `src/server/mangadex.ts` for API patterns (rate limits, endpoint URLs, response types). The MangaDex API base is `https://api.mangadex.org`.

Key endpoints:

- Search: `GET /manga?title={query}&limit=20&includes[]=cover_art`
- Details: `GET /manga/{id}?includes[]=cover_art&includes[]=author&includes[]=artist`
- Chapters: `GET /manga/{id}/feed?translatedLanguage[]={lang}&order[chapter]=asc&limit=500`
- Pages: `GET /at-home/server/{chapterId}` → returns baseUrl + hash + filenames

```typescript
// src/server/manga-sources/sources/mangadex.ts
import { ApiEngine } from "../engines/api-engine";
import type {
  MangaPage,
  MangaDetails,
  SourceChapter,
  PageUrl,
  FilterList,
} from "../types";
import { registerSource } from "../registry";

const MANGADEX_API = "https://api.mangadex.org";

// Response DTOs (trimmed to fields we use)
interface MdMangaResponse {
  data: MdManga[];
  total: number;
  limit: number;
  offset: number;
}

interface MdManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    description: Record<string, string>;
    status: string;
    year: number | null;
    tags: Array<{
      attributes: { name: Record<string, string>; group: string };
    }>;
    originalLanguage: string;
    publicationDemographic: string | null;
  };
  relationships: Array<{
    id: string;
    type: string;
    attributes?: Record<string, unknown>;
  }>;
}

interface MdChapterResponse {
  data: MdChapter[];
  total: number;
  limit: number;
  offset: number;
}

interface MdChapter {
  id: string;
  attributes: {
    chapter: string | null;
    volume: string | null;
    title: string | null;
    translatedLanguage: string;
    publishAt: string;
    pages: number;
    externalUrl: string | null;
  };
  relationships: Array<{
    id: string;
    type: string;
    attributes?: { name?: string };
  }>;
}

interface MdAtHomeResponse {
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

class MangaDexSource extends ApiEngine {
  constructor() {
    super({
      id: "mangadex",
      name: "MangaDex",
      baseUrl: MANGADEX_API,
      lang: "all",
      supportsLatest: true,
      rateLimit: { maxRequests: 3, windowMs: 1000 },
    });
  }

  async searchManga(page: number, query: string): Promise<MangaPage> {
    const offset = (page - 1) * 20;
    const url = `${MANGADEX_API}/manga?title=${encodeURIComponent(query)}&limit=20&offset=${offset}&includes[]=cover_art&order[relevance]=desc`;
    const resp = await this.fetchJson<MdMangaResponse>(url);
    return {
      manga: resp.data.map((m) => ({
        url: m.id,
        title: this.getTitle(m),
        thumbnailUrl: this.getCoverUrl(m),
      })),
      hasNextPage: offset + resp.limit < resp.total,
    };
  }

  async getPopularManga(page: number): Promise<MangaPage> {
    const offset = (page - 1) * 20;
    const url = `${MANGADEX_API}/manga?limit=20&offset=${offset}&includes[]=cover_art&order[followedCount]=desc`;
    const resp = await this.fetchJson<MdMangaResponse>(url);
    return {
      manga: resp.data.map((m) => ({
        url: m.id,
        title: this.getTitle(m),
        thumbnailUrl: this.getCoverUrl(m),
      })),
      hasNextPage: offset + resp.limit < resp.total,
    };
  }

  async getLatestUpdates(page: number): Promise<MangaPage> {
    const offset = (page - 1) * 20;
    const url = `${MANGADEX_API}/manga?limit=20&offset=${offset}&includes[]=cover_art&order[latestUploadedChapter]=desc`;
    const resp = await this.fetchJson<MdMangaResponse>(url);
    return {
      manga: resp.data.map((m) => ({
        url: m.id,
        title: this.getTitle(m),
        thumbnailUrl: this.getCoverUrl(m),
      })),
      hasNextPage: offset + resp.limit < resp.total,
    };
  }

  async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
    const url = `${MANGADEX_API}/manga/${mangaUrl}?includes[]=cover_art&includes[]=author&includes[]=artist`;
    const resp = await this.fetchJson<{ data: MdManga }>(url);
    const m = resp.data;
    const author = m.relationships.find((r) => r.type === "author");
    const artist = m.relationships.find((r) => r.type === "artist");

    return {
      title: this.getTitle(m),
      author: (author?.attributes?.name as string) ?? undefined,
      artist: (artist?.attributes?.name as string) ?? undefined,
      description:
        m.attributes.description.en ??
        Object.values(m.attributes.description)[0] ??
        undefined,
      genres: m.attributes.tags
        .filter((t) => t.attributes.group === "genre")
        .map(
          (t) => t.attributes.name.en ?? Object.values(t.attributes.name)[0],
        ),
      status: this.mapStatus(m.attributes.status),
      type: this.mapType(m.attributes.originalLanguage),
      thumbnailUrl: this.getCoverUrl(m),
    };
  }

  async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
    const chapters: SourceChapter[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const url = `${MANGADEX_API}/manga/${mangaUrl}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=${limit}&offset=${offset}&includes[]=scanlation_group`;
      const resp = await this.fetchJson<MdChapterResponse>(url);

      for (const ch of resp.data) {
        if (ch.attributes.externalUrl) continue; // Skip external chapters
        const group = ch.relationships.find(
          (r) => r.type === "scanlation_group",
        );
        chapters.push({
          url: ch.id,
          name: ch.attributes.title
            ? `Chapter ${ch.attributes.chapter ?? "?"} - ${ch.attributes.title}`
            : `Chapter ${ch.attributes.chapter ?? "?"}`,
          chapterNumber: ch.attributes.chapter
            ? parseFloat(ch.attributes.chapter)
            : undefined,
          volumeNumber: ch.attributes.volume
            ? parseInt(ch.attributes.volume, 10)
            : undefined,
          scanlator: (group?.attributes?.name as string) ?? undefined,
          dateUpload: new Date(ch.attributes.publishAt),
        });
      }

      if (offset + limit >= resp.total) break;
      offset += limit;
    }

    // Deduplicate: keep first chapter per chapterNumber (prefer earliest upload)
    const seen = new Map<number, SourceChapter>();
    for (const ch of chapters) {
      if (ch.chapterNumber !== undefined && !seen.has(ch.chapterNumber)) {
        seen.set(ch.chapterNumber, ch);
      }
    }
    return [...seen.values()];
  }

  async getPageList(chapterUrl: string): Promise<PageUrl[]> {
    const url = `${MANGADEX_API}/at-home/server/${chapterUrl}`;
    // Don't cache at-home URLs — they expire in ~15 minutes
    const resp = await this.fetcher.fetch<MdAtHomeResponse>(
      `at-home-${chapterUrl}-${Date.now()}`,
      async () => {
        const r = await fetch(url, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(15_000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
        return r.json() as Promise<MdAtHomeResponse>;
      },
    );
    const { baseUrl, chapter } = resp;
    return chapter.data.map((f) => `${baseUrl}/data/${chapter.hash}/${f}`);
  }

  private getTitle(m: MdManga): string {
    return (
      m.attributes.title.en ?? Object.values(m.attributes.title)[0] ?? "Unknown"
    );
  }

  private getCoverUrl(m: MdManga): string | undefined {
    const cover = m.relationships.find((r) => r.type === "cover_art");
    const fileName = cover?.attributes?.fileName as string | undefined;
    if (!fileName) return undefined;
    return `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg`;
  }

  private mapStatus(status: string): MangaDetails["status"] {
    const map: Record<string, MangaDetails["status"]> = {
      ongoing: "ongoing",
      completed: "complete",
      hiatus: "hiatus",
      cancelled: "cancelled",
    };
    return map[status] ?? "ongoing";
  }

  private mapType(originalLang: string): MangaDetails["type"] {
    if (originalLang === "ko") return "manhwa";
    if (originalLang === "zh" || originalLang === "zh-hk") return "manhua";
    return "manga";
  }
}

registerSource({
  id: "mangadex",
  name: "MangaDex",
  lang: "all",
  group: "api",
  factory: () => new MangaDexSource(),
});
```

- [ ] **Step 2: Verify the source compiles**

```bash
bunx tsc --noEmit src/server/manga-sources/sources/mangadex.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/server/manga-sources/sources/mangadex.ts
git commit -m "feat(manga-sources): implement MangaDex source with public API"
```

---

### Task 7: Remaining API Sources (Comick, MangaPlus, AsuraScans)

**Files:**

- Create: `src/server/manga-sources/sources/comick.ts`
- Create: `src/server/manga-sources/sources/mangaplus.ts`
- Create: `src/server/manga-sources/sources/asura-scans.ts`

Each source follows the same pattern as MangaDex: extends `ApiEngine`, implements the 6 core methods, calls `registerSource()`.

- [ ] **Step 1: Implement Comick source**

Comick uses internal JSON API endpoints at `https://api.comick.fun`. Key endpoints:

- Search: `GET /v1.0/search?q={query}&limit=20`
- Details: `GET /comic/{slug}`
- Chapters: `GET /comic/{hid}/chapters?lang=en&limit=300`
- Pages: `GET /chapter/{hid}` → returns chapter with `md_images` array

Implement in `src/server/manga-sources/sources/comick.ts` following the same structure as MangaDex. Call `registerSource()` at module level.

- [ ] **Step 2: Implement MangaPlus source**

MangaPlus uses Shueisha's internal API at `https://jumpg-webapi.tokyo-cdn.com`. Key endpoints:

- Search/Popular: `/api/title_list/allV2` (returns all titles, filter client-side)
- Details: `/api/title_detailV3?title_id={id}`
- Chapters: Included in title detail response
- Pages: `/api/manga_viewer?chapter_id={id}&split=yes&img_quality=high`

Implement in `src/server/manga-sources/sources/mangaplus.ts`. Call `registerSource()`.

- [ ] **Step 3: Implement AsuraScans source**

AsuraScans uses a JSON API at `https://api.asurascans.com`. Key endpoints:

- Search: `GET /api/series?search={query}&limit=20`
- Details: `GET /api/series/{slug}`
- Chapters: Parsed from SSR HTML at `https://asurascans.com/series/{slug}`
- Pages: Extracted from embedded JSON props in chapter HTML

Implement in `src/server/manga-sources/sources/asura-scans.ts`. Call `registerSource()`.

- [ ] **Step 4: Commit**

```bash
git add src/server/manga-sources/sources/comick.ts src/server/manga-sources/sources/mangaplus.ts src/server/manga-sources/sources/asura-scans.ts
git commit -m "feat(manga-sources): implement Comick, MangaPlus, and AsuraScans API sources"
```

---

### Task 8: Madara Theme Engine + Sites

**Files:**

- Create: `src/server/manga-sources/engines/madara-engine.ts`
- Create: `src/server/manga-sources/sites/madara-sites.ts`

Madara is the biggest theme (342 sites). The engine handles WordPress manga sites with AJAX chapter loading via `wp-admin/admin-ajax.php`.

- [ ] **Step 1: Implement MadaraEngine**

Key Madara patterns (reference Keiyoushi's `lib-multisrc/madara/` source):

- Popular: `GET {baseUrl}/manga/page/{page}/?m_orderby=views`
- Latest: `GET {baseUrl}/manga/page/{page}/?m_orderby=latest`
- Search: `GET {baseUrl}/?s={query}&post_type=wp-manga`
- Details: `GET {baseUrl}/manga/{slug}/` → parse HTML for title, cover, status, genres
- Chapters: `POST {baseUrl}/wp-admin/admin-ajax.php` with `action=manga_get_chapters&manga={postId}` (or fallback to `GET {baseUrl}/manga/{slug}/ajax/chapters/`)
- Pages: `GET {chapterUrl}` → parse `<img>` tags with lazy-load attributes

```typescript
// src/server/manga-sources/engines/madara-engine.ts
import { HtmlEngine } from "./html-engine";
import type { ThemeSiteConfig } from "../types";
import { registerSource } from "../registry";
// ... implement class MadaraEngine extends HtmlEngine
// Key: handle AJAX chapter loading, lazy-load image extraction, date parsing
```

- [ ] **Step 2: Create Madara site configs**

```typescript
// src/server/manga-sources/sites/madara-sites.ts
import type { ThemeSiteConfig } from "../types";

export const madaraSites: ThemeSiteConfig[] = [
  { name: "ManhuaUS", url: "https://manhuaus.com", lang: "en" },
  { name: "ManhwaClan", url: "https://manhwaclan.com", lang: "en" },
  { name: "ManhuaTop", url: "https://mangatop.org", lang: "en" },
  { name: "Toonily", url: "https://toonily.com", lang: "en" },
  { name: "KunManga", url: "https://kunmanga.com", lang: "en" },
  { name: "CoffeeManga", url: "https://coffeemanga.ink", lang: "en" },
  { name: "Hiperdex", url: "https://hiperdex.com", lang: "en" },
  { name: "ZinManga", url: "https://mangazin.org", lang: "en" },
  { name: "HariManga", url: "https://harimanga.me", lang: "en" },
  { name: "WebtoonXYZ", url: "https://www.webtoon.xyz", lang: "en" },
  { name: "ManhuaPlus", url: "https://manhuaplus.com", lang: "en" },
  { name: "Manga18fx", url: "https://manga18fx.com", lang: "en" },
  { name: "ToonClash", url: "https://toonclash.com", lang: "en" },
  { name: "ManhuaHot", url: "https://manhuahot.com", lang: "en" },
  { name: "MangaRead", url: "https://mangaread.co", lang: "en" },
  { name: "S2Manga", url: "https://s2manga.com", lang: "en" },
  { name: "ManhwaTop", url: "https://manhwatop.com", lang: "en" },
  { name: "MangaDistrict", url: "https://mangadistrict.com", lang: "en" },
  { name: "Toonizy", url: "https://toonizy.com", lang: "en" },
  { name: "NovelCool", url: "https://www.novelcool.com", lang: "all" },
];
```

- [ ] **Step 3: Register all Madara sites in the registry**

At the bottom of `madara-sites.ts`, loop through the array and call `registerSource()` for each site:

```typescript
import { MadaraEngine } from "../engines/madara-engine";
import { registerSource } from "../registry";

for (const site of madaraSites) {
  const siteId = `madara:${site.name.toLowerCase().replace(/\s+/g, "-")}`;
  registerSource({
    id: siteId,
    name: site.name,
    lang: site.lang,
    group: "madara",
    factory: () => new MadaraEngine({ ...site, id: siteId }),
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/server/manga-sources/engines/madara-engine.ts src/server/manga-sources/sites/madara-sites.ts
git commit -m "feat(manga-sources): implement Madara theme engine with 20 sites"
```

---

### Task 9: MangaThemesia Engine + Sites

**Files:**

- Create: `src/server/manga-sources/engines/manga-themesia-engine.ts`
- Create: `src/server/manga-sources/sites/themesia-sites.ts`

- [ ] **Step 1: Implement MangaThemesiaEngine**

Key MangaThemesia patterns (reference Keiyoushi's `lib-multisrc/mangathemesia/` source):

- Popular: `GET {baseUrl}/manga/?page={page}&order=popular`
- Latest: `GET {baseUrl}/manga/?page={page}&order=update`
- Search: `GET {baseUrl}/?s={query}`
- Details: `GET {baseUrl}/manga/{slug}/` → CSS selectors for metadata
- Chapters: Parsed from manga detail page HTML (all chapters listed)
- Pages: Two strategies — try HTML `<img>` tags first, fallback to JavaScript JSON array extraction via regex `ts_reader.run\((\{.*\})\)`

```typescript
// src/server/manga-sources/engines/manga-themesia-engine.ts
import { HtmlEngine } from "./html-engine";
// ... implement class MangaThemesiaEngine extends HtmlEngine
```

- [ ] **Step 2: Create MangaThemesia site configs and register**

```typescript
// src/server/manga-sources/sites/themesia-sites.ts
import type { ThemeSiteConfig } from "../types";
import { MangaThemesiaEngine } from "../engines/manga-themesia-engine";
import { registerSource } from "../registry";

export const themesiaSites: ThemeSiteConfig[] = [
  { name: "Comic Asura", url: "https://comicasura.net", lang: "en" },
  { name: "Rizz Fables", url: "https://rizzfables.com", lang: "en" },
  { name: "Rage Scans", url: "https://ragescans.com", lang: "en" },
  { name: "Violet Scans", url: "https://violetscans.org", lang: "en" },
  { name: "Drake Scans", url: "https://drakecomic.org", lang: "en" },
  { name: "MangaTX", url: "https://mangatx.cc", lang: "en" },
  { name: "Eva Scans", url: "https://evascans.org", lang: "en" },
  { name: "Kappa Beast", url: "https://kappabeast.com", lang: "en" },
  { name: "Rest Scans", url: "https://restscans.com", lang: "en" },
  { name: "Galaxy Manga", url: "https://galaxymanga.io", lang: "en" },
];

for (const site of themesiaSites) {
  const siteId = `themesia:${site.name.toLowerCase().replace(/\s+/g, "-")}`;
  registerSource({
    id: siteId,
    name: site.name,
    lang: site.lang,
    group: "mangathemesia",
    factory: () => new MangaThemesiaEngine({ ...site, id: siteId }),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/manga-sources/engines/manga-themesia-engine.ts src/server/manga-sources/sites/themesia-sites.ts
git commit -m "feat(manga-sources): implement MangaThemesia engine with 10 sites"
```

---

### Task 10: MadTheme + MangaBox Engines and Sites

**Files:**

- Create: `src/server/manga-sources/engines/mad-theme-engine.ts`
- Create: `src/server/manga-sources/engines/manga-box-engine.ts`
- Create: `src/server/manga-sources/sites/mad-theme-sites.ts`
- Create: `src/server/manga-sources/sites/manga-box-sites.ts`

- [ ] **Step 1: Implement MadThemeEngine**

MadTheme pattern (reference Keiyoushi `lib-multisrc/madtheme/`):

- Popular: `GET {baseUrl}/az-list/page/{page}`
- Latest: `GET {baseUrl}/latest-manga/page/{page}`
- Search: `GET {baseUrl}/search?q={query}&page={page}`
- Chapters: `GET {baseUrl}/api/manga/{slug}/chapters?source=detail`
- Pages: `GET {chapterUrl}` → parse `<img>` in `#chapter-images` container

- [ ] **Step 2: Create MadTheme sites config (all 19 sites) and register**

```typescript
// src/server/manga-sources/sites/mad-theme-sites.ts
export const madThemeSites: ThemeSiteConfig[] = [
  { name: "MangaBuddy", url: "https://mangabuddy.com", lang: "en" },
  { name: "MangaForest", url: "https://mangaforest.me", lang: "en" },
  { name: "MangaPuma", url: "https://mangapuma.com", lang: "en" },
  { name: "MangaFab", url: "https://mangafab.com", lang: "en" },
  { name: "MangaXYZ", url: "https://mangaxyz.com", lang: "en" },
  { name: "MangaMonk", url: "https://mangamonk.com", lang: "en" },
  { name: "MangaCute", url: "https://mangacute.com", lang: "en" },
  { name: "MangaSpin", url: "https://mangaspin.com", lang: "en" },
  { name: "MangaSaga", url: "https://mangasaga.com", lang: "en" },
  { name: "ManhuaNow", url: "https://manhuanow.com", lang: "en" },
  { name: "ManhuaSite", url: "https://manhuasite.com", lang: "en" },
  { name: "ToonilyMe", url: "https://toonily.me", lang: "en" },
  { name: "TooniTube", url: "https://toonitube.com", lang: "en" },
  { name: "BoxManhwa", url: "https://boxmanhwa.com", lang: "en" },
  { name: "KaliScan", url: "https://kaliscan.com", lang: "en" },
  { name: "KaliScan.io", url: "https://kaliscan.io", lang: "en" },
  { name: "KaliScan.me", url: "https://kaliscan.me", lang: "en" },
  { name: "BeeHentai", url: "https://beehentai.com", lang: "en" },
  { name: "MGJinx", url: "https://mgjinx.com", lang: "en" },
];
// ... registerSource loop
```

- [ ] **Step 3: Implement MangaBoxEngine**

MangaBox pattern (reference Keiyoushi `lib-multisrc/mangabox/`):

- Popular: `GET {baseUrl}/manga_list?type=topview&category=all&state=all&page={page}`
- Latest: `GET {baseUrl}/manga_list?type=latest&category=all&state=all&page={page}`
- Search: `GET {baseUrl}/search/story/{query}?page={page}`
- Details: `GET {baseUrl}/{slug}` → CSS selectors
- Chapters: Parsed from detail page
- Pages: `GET {chapterUrl}` → `<img>` in `#vungdoc` or similar container

- [ ] **Step 4: Create MangaBox sites config (all 3 sites) and register**

```typescript
// src/server/manga-sources/sites/manga-box-sites.ts
export const mangaBoxSites: ThemeSiteConfig[] = [
  { name: "Mangakakalot", url: "https://www.mangakakalot.gg", lang: "en" },
  { name: "Manganato", url: "https://www.natomanga.com", lang: "en" },
  { name: "Mangabat", url: "https://www.mangabats.com", lang: "en" },
];
// ... registerSource loop
```

- [ ] **Step 5: Commit**

```bash
git add src/server/manga-sources/engines/mad-theme-engine.ts src/server/manga-sources/engines/manga-box-engine.ts src/server/manga-sources/sites/mad-theme-sites.ts src/server/manga-sources/sites/manga-box-sites.ts
git commit -m "feat(manga-sources): implement MadTheme (19 sites) and MangaBox (3 sites) engines"
```

---

### Task 11: Standalone HTML Scrapers (MangaFire, Webtoons, NineManga)

**Files:**

- Create: `src/server/manga-sources/sources/mangafire.ts`
- Create: `src/server/manga-sources/sources/webtoons.ts`
- Create: `src/server/manga-sources/sources/ninemanga.ts`

- [ ] **Step 1: Implement MangaFire source**

MangaFire (`https://mangafire.to`): HTML + AJAX. Search uses `/filter?keyword={query}`. Chapters listed on manga detail page. Pages fetched via AJAX endpoint.

- [ ] **Step 2: Implement Webtoons source**

Webtoons (`https://www.webtoons.com`): HTML scraping. Search uses `/search?keyword={query}`. Chapter list on title page. Pages are image URLs from chapter viewer.

- [ ] **Step 3: Implement NineManga source**

NineManga (`https://www.ninemanga.com`): HTML scraping with CSS selectors. Search at `/search/?wd={query}`. Chapter list from manga detail. Pages from chapter viewer.

Each source extends `HtmlEngine` and calls `registerSource()`.

- [ ] **Step 4: Commit**

```bash
git add src/server/manga-sources/sources/mangafire.ts src/server/manga-sources/sources/webtoons.ts src/server/manga-sources/sources/ninemanga.ts
git commit -m "feat(manga-sources): implement MangaFire, Webtoons, and NineManga standalone scrapers"
```

---

### Task 12: Source Index and Initialization

**Files:**

- Create: `src/server/manga-sources/index.ts`

- [ ] **Step 1: Create the index file that imports all sources for side-effect registration**

```typescript
// src/server/manga-sources/index.ts

// Re-export public API
export {
  getSource,
  getEnabledSources,
  getAllSourceDefinitions,
  setSourceEnabled,
  setSourceConfig,
  seedSourcesIfNeeded,
} from "./registry";
export type {
  MangaSource,
  MangaPage,
  SourceManga,
  MangaDetails,
  SourceChapter,
  PageUrl,
  SourceDefinition,
} from "./types";

// Side-effect imports: register all sources
// API sources
import "./sources/mangadex";
import "./sources/comick";
import "./sources/mangaplus";
import "./sources/asura-scans";

// Theme sites (each file registers its sites)
import "./sites/madara-sites";
import "./sites/themesia-sites";
import "./sites/mad-theme-sites";
import "./sites/manga-box-sites";

// Standalone scrapers
import "./sources/mangafire";
import "./sources/webtoons";
import "./sources/ninemanga";
```

- [ ] **Step 2: Commit**

```bash
git add src/server/manga-sources/index.ts
git commit -m "feat(manga-sources): add index module that registers all 59 sources"
```

---

### Task 13: CBZ Downloader

**Files:**

- Create: `src/server/manga-sources/downloader.ts`

- [ ] **Step 1: Implement the chapter downloader and CBZ packager**

```typescript
// src/server/manga-sources/downloader.ts
import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as path from "node:path";
import { getSource } from "./registry";

interface DownloadChapterOptions {
  sourceId: string;
  chapterUrl: string;
  outputDir: string; // e.g., /books/manga-title/
  chapterFileName: string; // e.g., "Chapter 045.cbz"
}

interface DownloadResult {
  filePath: string;
  fileSize: number;
  pageCount: number;
}

export async function downloadChapterAsCbz(
  options: DownloadChapterOptions,
): Promise<DownloadResult> {
  const source = getSource(options.sourceId);

  // 1. Get page image URLs
  const pageUrls = await source.getPageList(options.chapterUrl);
  if (pageUrls.length === 0) {
    throw new Error("No pages found for chapter");
  }

  // 2. Fetch all page images concurrently (batched to respect rate limits)
  const images: { index: number; data: Buffer; ext: string }[] = [];
  const batchSize = 5;

  for (let i = 0; i < pageUrls.length; i += batchSize) {
    const batch = pageUrls.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (url, batchIdx) => {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Referer: source.baseUrl,
          },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          throw new Error(
            `Failed to fetch page ${i + batchIdx + 1}: HTTP ${response.status}`,
          );
        }
        const data = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get("content-type") ?? "";
        const ext = contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
            ? "webp"
            : "jpg";
        return { index: i + batchIdx, data, ext };
      }),
    );
    images.push(...results);
  }

  // 3. Sort by index and package into CBZ
  images.sort((a, b) => a.index - b.index);
  const zip = new AdmZip();
  for (const img of images) {
    const pageName = `${String(img.index + 1).padStart(3, "0")}.${img.ext}`;
    zip.addFile(pageName, img.data);
  }

  // 4. Write to disk
  fs.mkdirSync(options.outputDir, { recursive: true });
  const filePath = path.join(options.outputDir, options.chapterFileName);
  zip.writeZip(filePath);

  const stats = fs.statSync(filePath);
  return {
    filePath,
    fileSize: stats.size,
    pageCount: images.length,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/manga-sources/downloader.ts
git commit -m "feat(manga-sources): implement CBZ chapter downloader with batched image fetching"
```

---

### Task 14: Delete Old Manga Pipeline Files

**Files:**

- Delete: `src/server/mangadex.ts`
- Delete: `src/server/wikipedia.ts`
- Delete: `src/server/manga-chapter-utils.ts`
- Delete: `src/server/scheduler/tasks/refresh-mangaupdates-metadata.ts`
- Delete: `src/db/schema/manga-download-profiles.ts`
- Delete: `src/lib/queries/manga-updates.ts`

- [ ] **Step 1: Delete the old files**

```bash
rm src/server/mangadex.ts src/server/wikipedia.ts src/server/manga-chapter-utils.ts src/server/scheduler/tasks/refresh-mangaupdates-metadata.ts src/db/schema/manga-download-profiles.ts src/lib/queries/manga-updates.ts
```

- [ ] **Step 2: Update scheduler index to remove old import and add new one**

In `src/server/scheduler/index.ts`, replace:

```typescript
import "./tasks/refresh-mangaupdates-metadata";
```

with:

```typescript
import "./tasks/refresh-manga-sources";
```

- [ ] **Step 3: Remove manga release types from indexer types**

In `src/server/indexers/types.ts`, remove:

```typescript
  // Manga
  SingleChapter: 20,
  MultiChapter: 21,
  SingleVolume: 22,
  MultiVolume: 23,
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(manga-sources): delete old MangaUpdates/MangaDex/Wikipedia pipeline

Remove mangadex.ts, wikipedia.ts, manga-chapter-utils.ts,
refresh-mangaupdates-metadata.ts, manga-download-profiles schema,
manga-updates queries, and manga indexer release types."
```

---

### Task 15: Rewrite Manga Import (Server Functions)

**Files:**

- Modify: `src/server/manga-import.ts`
- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Update validators**

In `src/lib/validators.ts`, replace the manga schemas:

```typescript
export const addMangaSchema = z.object({
  sourceId: z.string(),
  sourceMangaUrl: z.string(),
  title: z.string(),
  sortTitle: z.string(),
  overview: z.string().default(""),
  type: z.string().default("manga"),
  year: z.string().nullable().default(null),
  status: z.string().default("ongoing"),
  posterUrl: z.string().default(""),
  sourceMangaThumbnail: z.string().nullable().default(null),
  genres: z.array(z.string()).default([]),
  monitorOption: z.enum(["all", "future", "missing", "none"]).default("all"),
});

export const updateMangaSchema = z.object({
  id: z.number(),
  monitorNewChapters: z.enum(["all", "future", "missing", "none"]).optional(),
  path: z.string().optional(),
});

export const deleteMangaSchema = z.object({
  id: z.number(),
  deleteFiles: z.boolean().default(false),
});

export const refreshMangaSchema = z.object({
  mangaId: z.number(),
});

export const searchMangaSourcesSchema = z.object({
  query: z.string().min(1),
});

export const checkMangaExistsSchema = z.object({
  sourceId: z.string(),
  sourceMangaUrl: z.string(),
});

export const mangaSourceConfigSchema = z.object({
  sourceId: z.string(),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});
```

Remove: `searchMangaUpdatesSchema`, `getMangaUpdatesDetailSchema`, `monitorMangaProfileSchema`, `unmonitorMangaProfileSchema`, `bulkMonitorMangaChapterProfileSchema`, `bulkUnmonitorMangaChapterProfileSchema`.

- [ ] **Step 2: Rewrite manga-import.ts**

Replace the entire file. The new version is much simpler — it imports from a source rather than orchestrating MangaUpdates + MangaDex + Wikipedia:

```typescript
// src/server/manga-import.ts
import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { manga, mangaVolumes, mangaChapters, history } from "src/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "./middleware";
import { addMangaSchema, refreshMangaSchema } from "src/lib/validators";
import { submitCommand } from "./commands";
import type { CommandHandler } from "./commands";
import { getSource } from "./manga-sources";
import { downloadChapterAsCbz } from "./manga-sources/downloader";
import type { SourceChapter } from "./manga-sources";

// ─── Import Handler ────────────────────────────────────────────────

const importMangaHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as unknown as ReturnType<typeof addMangaSchema.parse>;
  const source = getSource(data.sourceId);

  // Check for duplicates
  updateProgress("Checking for duplicates...");
  const existing = db
    .select({ id: manga.id })
    .from(manga)
    .where(
      and(
        eq(manga.sourceId, data.sourceId),
        eq(manga.sourceMangaUrl, data.sourceMangaUrl),
      ),
    )
    .get();

  if (existing) {
    throw new Error("Manga already exists in your library.");
  }

  // Fetch details and chapters from source
  updateProgress(`Fetching details from ${source.name}...`);
  const details = await source.getMangaDetails(data.sourceMangaUrl);

  updateProgress("Fetching chapter list...");
  const chapters = await source.getChapterList(data.sourceMangaUrl);
  updateProgress(`Found ${chapters.length} chapters`);

  // Insert manga + volumes + chapters in a transaction
  const result = db.transaction(() => {
    // Insert manga
    const mangaRow = db
      .insert(manga)
      .values({
        title: data.title,
        sortTitle: data.sortTitle,
        overview: details.description ?? data.overview,
        sourceId: data.sourceId,
        sourceMangaUrl: data.sourceMangaUrl,
        sourceMangaThumbnail: details.thumbnailUrl ?? data.sourceMangaThumbnail,
        type: details.type ?? data.type,
        year: data.year,
        status: details.status ?? data.status,
        latestChapter:
          chapters.length > 0
            ? Math.max(
                ...chapters
                  .filter((c) => c.chapterNumber != null)
                  .map((c) => c.chapterNumber!),
              )
            : null,
        posterUrl: details.thumbnailUrl ?? data.posterUrl,
        genres: details.genres ?? data.genres,
        monitorNewChapters: data.monitorOption,
      })
      .returning({ id: manga.id })
      .get();

    const mangaId = mangaRow.id;

    // Group chapters by volume
    const volumeGroups = new Map<number | null, SourceChapter[]>();
    for (const ch of chapters) {
      const vol = ch.volumeNumber ?? null;
      if (!volumeGroups.has(vol)) volumeGroups.set(vol, []);
      volumeGroups.get(vol)!.push(ch);
    }

    // Insert volumes and chapters
    let chaptersAdded = 0;
    for (const [volumeNumber, volumeChapters] of volumeGroups) {
      const volumeRow = db
        .insert(mangaVolumes)
        .values({ mangaId, volumeNumber, monitored: true })
        .returning({ id: mangaVolumes.id })
        .get();

      for (const ch of volumeChapters) {
        const shouldMonitor =
          data.monitorOption === "all" || data.monitorOption === "missing";

        db.insert(mangaChapters)
          .values({
            mangaVolumeId: volumeRow.id,
            mangaId,
            chapterNumber: ch.chapterNumber?.toString() ?? ch.name,
            title: ch.name,
            sourceChapterUrl: ch.url,
            releaseDate: ch.dateUpload?.toISOString().split("T")[0] ?? null,
            scanlationGroup: ch.scanlator ?? null,
            monitored: shouldMonitor,
          })
          .run();
        chaptersAdded++;
      }
    }

    // Log history
    db.insert(history)
      .values({
        entityType: "manga",
        entityId: mangaId,
        eventType: "mangaAdded",
        data: JSON.stringify({
          title: data.title,
          chaptersAdded,
          source: source.name,
        }),
      })
      .run();

    return { mangaId, chaptersAdded, volumesAdded: volumeGroups.size };
  });

  updateProgress(`Added ${data.title} with ${result.chaptersAdded} chapters`);

  return { success: true, ...result };
};

export const importMangaFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => addMangaSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return submitCommand({
      commandType: "importManga",
      name: `Import: ${data.title}`,
      body: data as unknown as Record<string, unknown>,
      dedupeKey: "sourceMangaUrl",
      handler: importMangaHandler,
    });
  });

// ─── Refresh Handler ───────────────────────────────────────────────

export async function refreshMangaInternal(
  mangaId: number,
  updateProgress?: (message: string) => void,
): Promise<{ success: boolean; newChaptersAdded: number }> {
  const mangaRow = db.select().from(manga).where(eq(manga.id, mangaId)).get();

  if (!mangaRow) {
    throw new Error(`Manga #${mangaId} not found`);
  }

  const source = getSource(mangaRow.sourceId);
  updateProgress?.(`Fetching latest data from ${source.name}...`);

  // Refresh metadata
  const details = await source.getMangaDetails(mangaRow.sourceMangaUrl);
  db.update(manga)
    .set({
      overview: details.description ?? mangaRow.overview,
      status: details.status ?? mangaRow.status,
      posterUrl: details.thumbnailUrl ?? mangaRow.posterUrl,
      sourceMangaThumbnail:
        details.thumbnailUrl ?? mangaRow.sourceMangaThumbnail,
      genres: details.genres ?? mangaRow.genres,
      metadataUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(manga.id, mangaId))
    .run();

  // Fetch latest chapters
  updateProgress?.("Fetching chapter list...");
  const sourceChapters = await source.getChapterList(mangaRow.sourceMangaUrl);

  // Get existing chapters
  const existingChapters = db
    .select({ chapterNumber: mangaChapters.chapterNumber })
    .from(mangaChapters)
    .where(eq(mangaChapters.mangaId, mangaId))
    .all();
  const existingNumbers = new Set(existingChapters.map((c) => c.chapterNumber));

  // Find new chapters
  const newChapters = sourceChapters.filter(
    (ch) => !existingNumbers.has(ch.chapterNumber?.toString() ?? ch.name),
  );

  if (newChapters.length === 0) {
    return { success: true, newChaptersAdded: 0 };
  }

  updateProgress?.(`Inserting ${newChapters.length} new chapters...`);

  // Get or create volumes for new chapters
  let newChaptersAdded = 0;
  for (const ch of newChapters) {
    const volNum = ch.volumeNumber ?? null;

    // Find or create volume
    let volumeRow = db
      .select({ id: mangaVolumes.id })
      .from(mangaVolumes)
      .where(
        and(
          eq(mangaVolumes.mangaId, mangaId),
          volNum === null
            ? eq(mangaVolumes.volumeNumber, volNum as unknown as number)
            : eq(mangaVolumes.volumeNumber, volNum),
        ),
      )
      .get();

    if (!volumeRow) {
      volumeRow = db
        .insert(mangaVolumes)
        .values({ mangaId, volumeNumber: volNum, monitored: true })
        .returning({ id: mangaVolumes.id })
        .get();
    }

    const shouldMonitor =
      mangaRow.monitorNewChapters === "all" ||
      mangaRow.monitorNewChapters === "future" ||
      mangaRow.monitorNewChapters === "missing";

    db.insert(mangaChapters)
      .values({
        mangaVolumeId: volumeRow.id,
        mangaId,
        chapterNumber: ch.chapterNumber?.toString() ?? ch.name,
        title: ch.name,
        sourceChapterUrl: ch.url,
        releaseDate: ch.dateUpload?.toISOString().split("T")[0] ?? null,
        scanlationGroup: ch.scanlator ?? null,
        monitored: shouldMonitor,
      })
      .run();
    newChaptersAdded++;
  }

  // Update latest chapter
  const maxChapter = Math.max(
    ...sourceChapters
      .filter((c) => c.chapterNumber != null)
      .map((c) => c.chapterNumber!),
  );
  if (maxChapter > (mangaRow.latestChapter ?? 0)) {
    db.update(manga)
      .set({ latestChapter: maxChapter, updatedAt: new Date() })
      .where(eq(manga.id, mangaId))
      .run();
  }

  // Log history
  db.insert(history)
    .values({
      entityType: "manga",
      entityId: mangaId,
      eventType: "mangaUpdated",
      data: JSON.stringify({
        title: mangaRow.title,
        newChaptersAdded,
        source: source.name,
      }),
    })
    .run();

  return { success: true, newChaptersAdded };
}

const refreshMangaHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as { mangaId: number };
  const mangaRow = db
    .select({ title: manga.title })
    .from(manga)
    .where(eq(manga.id, data.mangaId))
    .get();

  updateProgress(`Fetching latest data for ${mangaRow?.title ?? "manga"}...`);
  const result = await refreshMangaInternal(data.mangaId, updateProgress);
  return { success: true, newChaptersAdded: result.newChaptersAdded };
};

export const refreshMangaMetadataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => refreshMangaSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const mangaRow = db
      .select({ title: manga.title })
      .from(manga)
      .where(eq(manga.id, data.mangaId))
      .get();

    return submitCommand({
      commandType: "refreshManga",
      name: `Refresh: ${mangaRow?.title ?? `Manga #${data.mangaId}`}`,
      body: data as unknown as Record<string, unknown>,
      dedupeKey: "mangaId",
      batchTaskId: "refresh-manga-sources",
      handler: refreshMangaHandler,
    });
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/server/manga-import.ts src/lib/validators.ts
git commit -m "feat(manga-sources): rewrite manga import/refresh to use source system

Import now fetches from assigned source instead of MangaUpdates/MangaDex/Wikipedia.
Refresh fetches latest chapters and metadata from the manga's source."
```

---

### Task 16: Rewrite Manga Search (Server Functions)

**Files:**

- Modify: `src/server/manga-search.ts`
- Modify: `src/lib/query-keys.ts`
- Modify: `src/lib/queries/manga.ts`

- [ ] **Step 1: Rewrite manga-search.ts to search across enabled sources**

```typescript
// src/server/manga-search.ts
import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { manga } from "src/db/schema";
import { requireAuth } from "./middleware";
import {
  searchMangaSourcesSchema,
  checkMangaExistsSchema,
} from "src/lib/validators";
import { getEnabledSources } from "./manga-sources";
import { and, eq } from "drizzle-orm";

export interface MangaSearchResult {
  sourceId: string;
  sourceName: string;
  url: string;
  title: string;
  thumbnailUrl?: string;
}

export const searchMangaSourcesFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => searchMangaSourcesSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const sources = getEnabledSources();

    if (sources.length === 0) {
      return {
        results: [],
        error:
          "No manga sources enabled. Enable sources in Settings > Manga Sources.",
      };
    }

    // Search all enabled sources concurrently
    const searchResults = await Promise.allSettled(
      sources.map(async (source) => {
        const page = await source.searchManga(1, data.query);
        return page.manga.map((m) => ({
          sourceId: source.id,
          sourceName: source.name,
          url: m.url,
          title: m.title,
          thumbnailUrl: m.thumbnailUrl,
        }));
      }),
    );

    const results: MangaSearchResult[] = [];
    for (const result of searchResults) {
      if (result.status === "fulfilled") {
        results.push(...result.value);
      }
    }

    return { results, error: null };
  });

export const checkMangaExistsFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => checkMangaExistsSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const existing = db
      .select({ id: manga.id })
      .from(manga)
      .where(
        and(
          eq(manga.sourceId, data.sourceId),
          eq(manga.sourceMangaUrl, data.sourceMangaUrl),
        ),
      )
      .get();
    return { exists: !!existing, mangaId: existing?.id ?? null };
  });
```

- [ ] **Step 2: Update query keys**

In `src/lib/query-keys.ts`, replace the `mangaUpdates` section:

```typescript
// Replace mangaUpdates with:
mangaSources: {
  all: ["mangaSources"] as const,
  search: (query: string) => ["mangaSources", "search", query] as const,
},
```

Update the `manga.existence` key:

```typescript
existence: (sourceId: string, sourceMangaUrl: string) =>
  ["manga", "existence", sourceId, sourceMangaUrl] as const,
```

- [ ] **Step 3: Update manga queries**

In `src/lib/queries/manga.ts`, update:

```typescript
export const mangaSourcesSearchQuery = (query: string) =>
  queryOptions({
    queryKey: queryKeys.mangaSources.search(query),
    queryFn: () => searchMangaSourcesFn({ data: { query } }),
    enabled: query.length >= 2,
  });

export const mangaExistenceQuery = (sourceId: string, sourceMangaUrl: string) =>
  queryOptions({
    queryKey: queryKeys.manga.existence(sourceId, sourceMangaUrl),
    queryFn: () => checkMangaExistsFn({ data: { sourceId, sourceMangaUrl } }),
    enabled: sourceId.length > 0 && sourceMangaUrl.length > 0,
  });
```

- [ ] **Step 4: Commit**

```bash
git add src/server/manga-search.ts src/lib/query-keys.ts src/lib/queries/manga.ts
git commit -m "feat(manga-sources): rewrite manga search to query all enabled sources"
```

---

### Task 17: Refresh Manga Sources Scheduled Task

**Files:**

- Create: `src/server/scheduler/tasks/refresh-manga-sources.ts`

- [ ] **Step 1: Implement the scheduled task**

Follow the same pattern as `refresh-mangaupdates-metadata.ts` but use the source system:

```typescript
// src/server/scheduler/tasks/refresh-manga-sources.ts
import { db } from "src/db";
import { manga } from "src/db/schema";
import { eq } from "drizzle-orm";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";
import { refreshMangaInternal } from "src/server/manga-import";

registerTask({
  id: "refresh-manga-sources",
  name: "Refresh Manga Sources",
  description:
    "Refresh metadata and check for new chapters for all monitored manga from their assigned sources.",
  defaultInterval: 12 * 60 * 60, // 12 hours
  group: "metadata",
  handler: async (updateProgress): Promise<TaskResult> => {
    const monitoredManga = db
      .select({ id: manga.id, title: manga.title, sourceId: manga.sourceId })
      .from(manga)
      .where(eq(manga.monitored, true))
      .all();

    if (monitoredManga.length === 0) {
      return { success: true, message: "No monitored manga to refresh" };
    }

    let refreshed = 0;
    let errors = 0;
    let totalNewChapters = 0;

    for (const m of monitoredManga) {
      try {
        updateProgress(
          `Refreshing ${m.title} (${refreshed + 1}/${monitoredManga.length})`,
        );
        const result = await refreshMangaInternal(m.id);
        totalNewChapters += result.newChaptersAdded;
        refreshed++;
      } catch {
        errors++;
      }

      // Throttle: 1 second between manga to avoid hammering sources
      if (refreshed + errors < monitoredManga.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return {
      success: errors === 0,
      message: `Refreshed ${refreshed}/${monitoredManga.length} manga, ${totalNewChapters} new chapters${errors > 0 ? `, ${errors} errors` : ""}`,
    };
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/server/scheduler/tasks/refresh-manga-sources.ts
git commit -m "feat(manga-sources): add scheduled task for refreshing manga from sources"
```

---

### Task 18: Manga Sources Settings Page

**Files:**

- Create: `src/routes/_authed/settings/manga-sources.tsx`
- Modify: `src/lib/nav-config.ts`

- [ ] **Step 1: Add settings nav item**

In `src/lib/nav-config.ts`, add after the Indexers entry (before Import Lists):

```typescript
import { BookOpen } from "lucide-react";

// Add to settingsNavItems array:
{
  title: "Manga Sources",
  to: "/settings/manga-sources",
  icon: BookOpen,
  description: "Configure manga sources for chapter discovery and downloading.",
},
```

- [ ] **Step 2: Create server functions for source management**

Add to `src/server/manga-search.ts` (or a new `src/server/manga-source-settings.ts`):

```typescript
export const getMangaSourceListFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const { getAllSourceDefinitions } = await import("./manga-sources");
    const defs = getAllSourceDefinitions();
    // Get enabled state from DB
    const dbRows = db.select().from(mangaSources).all();
    const dbMap = new Map(dbRows.map((r) => [r.sourceId, r]));

    return defs.map((d) => ({
      id: d.id,
      name: d.name,
      lang: d.lang,
      group: d.group,
      enabled: dbMap.get(d.id)?.enabled ?? false,
      config: dbMap.get(d.id)?.config
        ? JSON.parse(dbMap.get(d.id)!.config!)
        : null,
    }));
  },
);

export const updateMangaSourceFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => mangaSourceConfigSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { setSourceEnabled, setSourceConfig } =
      await import("./manga-sources");
    if (data.enabled !== undefined) {
      setSourceEnabled(data.sourceId, data.enabled);
    }
    if (data.config) {
      setSourceConfig(data.sourceId, data.config);
    }
    return { success: true };
  });
```

- [ ] **Step 3: Create the settings route component**

Create `src/routes/_authed/settings/manga-sources.tsx` with:

- Page header: "Manga Sources"
- Groups: API Sources, Madara Sites, MangaThemesia Sites, MadTheme Sites, MangaBox Sites, Standalone Scrapers
- Each source shows: name, language badge, enabled/disabled Switch toggle
- Switch toggle calls `updateMangaSourceFn` to persist

Follow the same layout pattern as `src/routes/_authed/settings/metadata.tsx` — Card wrapper, grouped sections, Save/toggle pattern.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authed/settings/manga-sources.tsx src/lib/nav-config.ts src/server/manga-search.ts
git commit -m "feat(manga-sources): add Manga Sources settings page with enable/disable toggles"
```

---

### Task 19: Source Search UI Component

**Files:**

- Create: `src/components/manga/manga-source-search.tsx`
- Modify: `src/routes/_authed/manga/add.tsx`
- Modify: `src/hooks/mutations/manga.ts`

- [ ] **Step 1: Create the new search component**

Replace the MangaUpdates search with a multi-source search. Follow the same UI pattern as `src/components/manga/manga-updates-search.tsx`:

- Debounced search input (300ms)
- Results displayed as cards with cover images
- Each result shows a source badge (e.g., "MangaDex", "Mangakakalot")
- Click opens preview modal with: poster, title, source badge, description
- Add form: monitor option select, "Add" button
- No download profile selection (removed for manga)

The component uses `mangaSourcesSearchQuery` to search and `useAddManga` to import.

- [ ] **Step 2: Update the add manga route**

In `src/routes/_authed/manga/add.tsx`, replace the `MangaUpdatesSearch` component import with `MangaSourceSearch`.

- [ ] **Step 3: Update the add manga mutation**

In `src/hooks/mutations/manga.ts`, update `useAddManga` to pass source fields:

```typescript
export function useAddManga() {
  return useMutation({
    mutationFn: (data: z.infer<typeof addMangaSchema>) =>
      importMangaFn({ data }),
    onMutate: () => {
      const toastId = toast.loading("Starting manga import...", {
        id: "submit-manga",
      });
      return { toastId };
    },
    onSuccess: (_result, _vars, context) => {
      toast.dismiss(context?.toastId);
    },
    onError: (_error, _vars, context) =>
      toast.error("Failed to add manga", { id: context?.toastId }),
  });
}
```

Remove mutation hooks no longer needed: `useMonitorMangaProfile`, `useUnmonitorMangaProfile`, `useBulkMonitorMangaChapterProfile`, `useBulkUnmonitorMangaChapterProfile`.

- [ ] **Step 4: Commit**

```bash
git add src/components/manga/manga-source-search.tsx src/routes/_authed/manga/add.tsx src/hooks/mutations/manga.ts
git commit -m "feat(manga-sources): replace MangaUpdates search with multi-source search UI"
```

---

### Task 20: Update Manga Detail Page

**Files:**

- Modify: `src/components/manga/manga-detail-header.tsx`
- Modify: `src/routes/_authed/manga/series/$mangaId.tsx`

- [ ] **Step 1: Update manga detail header**

In `src/components/manga/manga-detail-header.tsx`:

- Replace `externalUrl={mangaUpdatesUrl}` and `externalLabel="Open in MangaUpdates"` with the source's base URL
- Add source badge showing which source this manga is from (e.g., `<Badge variant="outline">MangaDex</Badge>`)
- Remove download profile toggle icons and profile-related edit form fields
- Add "Migrate Source" action to the dropdown menu (opens a search dialog to find the same manga on a different source)

- [ ] **Step 2: Update manga detail route**

In `src/routes/_authed/manga/series/$mangaId.tsx`:

- Remove references to download profiles (profile toggles, profile checkboxes)
- The page still shows volumes/chapters but without per-profile monitoring
- Ensure the refresh button triggers the source-based refresh

- [ ] **Step 3: Commit**

```bash
git add src/components/manga/manga-detail-header.tsx src/routes/_authed/manga/series/\$mangaId.tsx
git commit -m "feat(manga-sources): update manga detail page with source badge and migrate action"
```

---

### Task 21: Update Remaining Manga UI Components

**Files:**

- Modify: `src/components/manga/manga-card.tsx`
- Modify: `src/components/manga/manga-table.tsx`
- Modify: `src/components/manga/manga-bulk-bar.tsx`
- Modify: `src/components/manga/volume-accordion.tsx`
- Modify: `src/components/manga/chapter-row.tsx`
- Modify: `src/routes/_authed/manga/index.tsx`

- [ ] **Step 1: Remove profile-related UI from manga components**

Across all manga components, remove references to download profiles:

- `manga-card.tsx`: Remove profile toggle icons if present
- `manga-table.tsx`: Remove profile columns/toggles
- `manga-bulk-bar.tsx`: Remove profile selector dropdown; keep monitor chapters selector
- `volume-accordion.tsx`: Remove profile toggle icons per volume
- `chapter-row.tsx`: Remove profile toggle icons per chapter
- `manga/index.tsx` (list page): Remove profile-related filters

- [ ] **Step 2: Verify build passes**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/manga/ src/routes/_authed/manga/
git commit -m "refactor(manga-sources): remove download profile references from manga UI components"
```

---

### Task 22: Delete Old Search Component and Clean Up

**Files:**

- Delete: `src/components/manga/manga-updates-search.tsx`
- Modify: any remaining references

- [ ] **Step 1: Delete the old search component**

```bash
rm src/components/manga/manga-updates-search.tsx
```

- [ ] **Step 2: Search for and fix any remaining MangaUpdates references**

```bash
grep -r "mangaUpdates\|manga-updates\|MangaUpdates\|manga_updates" src/ --include="*.ts" --include="*.tsx" -l
```

Fix any remaining references found. Key areas:

- Query key exports
- Import statements
- Type references

- [ ] **Step 3: Search for and fix any remaining old schema references**

```bash
grep -r "mangaDexId\|mangaDexFetchedAt\|wikipediaPageTitle\|wikipediaFetchedAt\|mangaUpdatesId\|mangaUpdatesSlug\|mappingSource\|downloadProfileIds" src/ --include="*.ts" --include="*.tsx" -l
```

Fix any remaining references.

- [ ] **Step 4: Verify full build**

```bash
bun run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(manga-sources): remove all MangaUpdates references and clean up stale imports"
```

---

### Task 23: Seed Sources on Startup

**Files:**

- Modify: `src/server/scheduler/index.ts` (or appropriate startup file)

- [ ] **Step 1: Call seedSourcesIfNeeded on startup**

Import the manga sources module and call `seedSourcesIfNeeded()` during app initialization. In the scheduler's `ensureSchedulerStarted()`:

```typescript
// At the top of src/server/scheduler/index.ts, add:
import { seedSourcesIfNeeded as seedMangaSources } from "src/server/manga-sources";

// In ensureSchedulerStarted(), before seedTasksIfNeeded():
seedMangaSources();
```

This ensures all 59 source entries exist in the `mangaSources` table on first run (all disabled by default).

- [ ] **Step 2: Commit**

```bash
git add src/server/scheduler/index.ts
git commit -m "feat(manga-sources): seed source DB entries on startup"
```

---

### Task 24: Final Verification

- [ ] **Step 1: Run the full build**

```bash
bun run build
```

- [ ] **Step 2: Run database migration if needed**

```bash
bun run db:migrate
```

- [ ] **Step 3: Start dev server and verify**

```bash
bun run dev
```

Verify:

- Settings > Manga Sources page loads and shows all 59 sources grouped by type
- Enabling MangaDex and searching for a manga returns results
- Adding a manga from a source creates the manga with correct sourceId/sourceMangaUrl
- Manga detail page shows source badge
- Refresh triggers source-based chapter fetch
- System > Tasks shows "Refresh Manga Sources" scheduled task

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(manga-sources): address issues found during manual testing"
```
