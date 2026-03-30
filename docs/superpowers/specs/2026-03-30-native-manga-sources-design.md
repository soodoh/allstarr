# Native Manga Sources — Design Spec

## Summary

Replace Allstarr's existing manga metadata pipeline (MangaUpdates, MangaDex metadata-only, Wikipedia volume mapping) with a native TypeScript manga source system inspired by Tachiyomi/Keiyoushi. Sources serve as the unified metadata provider, chapter indexer, and download mechanism for manga content — eliminating the need for separate indexers, download clients, quality profiles, and download profiles for manga.

## Motivation

The existing manga pipeline aggregates metadata from MangaUpdates, MangaDex, and Wikipedia to build chapter/volume lists, then relies on indexers (torrent/usenet) to find actual chapter files. In practice, the latest chapters for most manga aren't available on traditional indexers. Tachiyomi/Keiyoushi solves this by scraping manga reading sites directly — fetching chapter lists and page images from the source. Since Keiyoushi extensions are just HTTP scrapers (~80% generic HTTP + parsing logic), we can replicate the most popular ones natively in TypeScript rather than depending on Suwayomi's JVM runtime.

## Architecture

### Source Abstraction Layer

Every manga source implements a common `MangaSource` interface:

```typescript
interface MangaSource {
  id: string; // unique identifier (e.g., "mangadex", "madara:mangakakalot")
  name: string; // display name
  baseUrl: string;
  lang: string; // ISO 639-1 language code
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

interface MangaPage {
  manga: SourceManga[];
  hasNextPage: boolean;
}

interface SourceManga {
  url: string; // relative URL/path on the source
  title: string;
  thumbnailUrl?: string;
}

interface MangaDetails {
  title: string;
  author?: string;
  artist?: string;
  description?: string;
  genres?: string[];
  status?: "ongoing" | "complete" | "hiatus" | "cancelled";
  type?: "manga" | "manhwa" | "manhua";
  thumbnailUrl?: string;
}

interface SourceChapter {
  url: string; // relative URL/path on the source
  name: string; // display name (e.g., "Chapter 45", "Extra: Side Story")
  chapterNumber?: number; // parsed numeric value (supports decimals like 10.5)
  volumeNumber?: number; // volume assignment if available from source
  scanlator?: string;
  dateUpload?: Date;
}

type PageUrl = string; // full image URL for a chapter page

// Source-specific search filters (e.g., genre, status, content rating)
type FilterList = Filter[];
type Filter =
  | { type: "select"; name: string; options: string[]; value: number }
  | { type: "checkbox"; name: string; value: boolean }
  | { type: "tristate"; name: string; value: "include" | "exclude" | "ignore" }
  | { type: "text"; name: string; value: string }
  | {
      type: "sort";
      name: string;
      values: string[];
      ascending: boolean;
      index: number;
    }
  | { type: "group"; name: string; filters: Filter[] };
```

### Plugin-Style Engine Hierarchy

```
src/server/manga-sources/
  types.ts                   # MangaSource interface + shared types
  registry.ts                # Source registry (enable/disable/configure, persisted in DB)
  downloader.ts              # Page fetcher + CBZ packager
  engines/
    api-engine.ts            # Base for JSON API sources
    html-engine.ts           # Base for CSS-selector HTML scrapers
    madara-engine.ts         # Madara theme engine (extends html-engine)
    manga-themesia-engine.ts # MangaThemesia theme engine (extends html-engine)
    mad-theme-engine.ts      # MadTheme engine (extends html-engine)
    manga-box-engine.ts      # MangaBox engine (extends html-engine)
  sources/
    mangadex.ts              # MangaDex (extends api-engine)
    comick.ts                # Comick (extends api-engine)
    mangaplus.ts             # MangaPlus (extends api-engine)
    asura-scans.ts           # AsuraScans (extends api-engine)
    mangafire.ts             # MangaFire (standalone HTML + AJAX)
    webtoons.ts              # Webtoons (standalone HTML)
    ninemanga.ts             # NineManga (standalone HTML)
  sites/
    madara-sites.ts          # Declarative Madara site configs
    themesia-sites.ts        # Declarative MangaThemesia site configs
    mad-theme-sites.ts       # Declarative MadTheme site configs
    manga-box-sites.ts       # Declarative MangaBox site configs
```

**Engine hierarchy:**

- `ApiEngine` — base for JSON API sources. Handles request building, JSON parsing, rate limiting. Subclassed by MangaDex, Comick, AsuraScans, MangaPlus.
- `HtmlEngine` — base for CSS-selector HTML scrapers. Provides `fetchDocument()`, CSS selector helpers (using cheerio), and element-to-model mapping. Foundation for theme engines.
- `MadaraEngine extends HtmlEngine` — handles all Madara-pattern sites: AJAX chapter loading (`wp-admin/admin-ajax.php`), lazy-loaded image attributes, multi-language date parsing.
- `MangaThemesiaEngine extends HtmlEngine` — handles MangaThemesia-pattern sites: HTML `<img>` page extraction with JavaScript JSON array fallback.
- `MadThemeEngine extends HtmlEngine` — handles MadTheme-pattern sites.
- `MangaBoxEngine extends HtmlEngine` — handles MangaBox-pattern sites (Mangakakalot, Manganato, Mangabat).

**Theme site configs** are declarative one-liner entries:

```typescript
// Example Madara site config
{ name: "Toonily", url: "https://toonily.com", lang: "en" }
{ name: "TruyenVN", url: "https://truyenvn.shop", lang: "vi", overrides: { mangaSubString: "truyen-tranh" } }
```

The engine does all the work; adding a new site to a theme is a config entry.

### Source Registry

The registry manages source instances and persisted enabled/disabled state:

- Loads all source definitions (API sources, theme sites, standalone scrapers) at startup
- Provides lookup by source ID
- Stores enabled/disabled state and per-source config in the `mangaSources` DB table
- Exposes methods for the settings UI to list, enable, disable, and configure sources

## Sources to Implement

### API-Based Sources (4 custom implementations)

| Source     | Base URL                     | Method            | Language       |
| ---------- | ---------------------------- | ----------------- | -------------- |
| MangaDex   | `api.mangadex.org`           | Public REST API   | Multi-language |
| Comick     | `comick.live`                | Internal JSON API | Multi-language |
| MangaPlus  | `jumpg-webapi.tokyo-cdn.com` | Internal API      | Multi-language |
| AsuraScans | `asurascans.com`             | JSON API + HTML   | English        |

### Madara Engine — Top 20 Sites

| Site          | Base URL                    | Language |
| ------------- | --------------------------- | -------- |
| ManhuaUS      | `https://manhuaus.com`      | en       |
| ManhwaClan    | `https://manhwaclan.com`    | en       |
| ManhuaTop     | `https://mangatop.org`      | en       |
| Toonily       | `https://toonily.com`       | en       |
| KunManga      | `https://kunmanga.com`      | en       |
| CoffeeManga   | `https://coffeemanga.ink`   | en       |
| Hiperdex      | `https://hiperdex.com`      | en       |
| ZinManga      | `https://mangazin.org`      | en       |
| HariManga     | `https://harimanga.me`      | en       |
| WebtoonXYZ    | `https://www.webtoon.xyz`   | en       |
| ManhuaPlus    | `https://manhuaplus.com`    | en       |
| Manga18fx     | `https://manga18fx.com`     | en       |
| ToonClash     | `https://toonclash.com`     | en       |
| ManhuaHot     | `https://manhuahot.com`     | en       |
| MangaRead     | `https://mangaread.co`      | en       |
| S2Manga       | `https://s2manga.com`       | en       |
| ManhwaTop     | `https://manhwatop.com`     | en       |
| MangaDistrict | `https://mangadistrict.com` | en       |
| Toonizy       | `https://toonizy.com`       | en       |
| NovelCool     | `https://www.novelcool.com` | all      |

### MangaThemesia Engine — Top 10 Sites

| Site         | Base URL                  | Language |
| ------------ | ------------------------- | -------- |
| Comic Asura  | `https://comicasura.net`  | en       |
| Rizz Fables  | `https://rizzfables.com`  | en       |
| Rage Scans   | `https://ragescans.com`   | en       |
| Violet Scans | `https://violetscans.org` | en       |
| Drake Scans  | `https://drakecomic.org`  | en       |
| MangaTX      | `https://mangatx.cc`      | en       |
| Eva Scans    | `https://evascans.org`    | en       |
| Kappa Beast  | `https://kappabeast.com`  | en       |
| Rest Scans   | `https://restscans.com`   | en       |
| Galaxy Manga | `https://galaxymanga.io`  | en       |

### MadTheme Engine — All 19 Sites

| Site        | Base URL                 | Language |
| ----------- | ------------------------ | -------- |
| MangaBuddy  | `https://mangabuddy.com` | en       |
| MangaForest | `https://mangaforest.me` | en       |
| MangaPuma   | `https://mangapuma.com`  | en       |
| MangaFab    | `https://mangafab.com`   | en       |
| MangaXYZ    | `https://mangaxyz.com`   | en       |
| MangaMonk   | `https://mangamonk.com`  | en       |
| MangaCute   | `https://mangacute.com`  | en       |
| MangaSpin   | `https://mangaspin.com`  | en       |
| MangaSaga   | `https://mangasaga.com`  | en       |
| ManhuaNow   | `https://manhuanow.com`  | en       |
| ManhuaSite  | `https://manhuasite.com` | en       |
| ToonilyMe   | `https://toonily.me`     | en       |
| TooniTube   | `https://toonitube.com`  | en       |
| BoxManhwa   | `https://boxmanhwa.com`  | en       |
| KaliScan    | `https://kaliscan.com`   | en       |
| KaliScan.io | `https://kaliscan.io`    | en       |
| KaliScan.me | `https://kaliscan.me`    | en       |
| BeeHentai   | `https://beehentai.com`  | en       |
| MGJinx      | `https://mgjinx.com`     | en       |

### MangaBox Engine — All 3 Sites

| Site         | Base URL                      | Language |
| ------------ | ----------------------------- | -------- |
| Mangakakalot | `https://www.mangakakalot.gg` | en       |
| Manganato    | `https://www.natomanga.com`   | en       |
| Mangabat     | `https://www.mangabats.com`   | en       |

### Standalone HTML Scrapers (3 custom implementations)

| Source    | Base URL                    | Method        | Language       |
| --------- | --------------------------- | ------------- | -------------- |
| MangaFire | `https://mangafire.to`      | HTML + AJAX   | Multi-language |
| Webtoons  | `https://www.webtoons.com`  | HTML scraping | Multi-language |
| NineManga | `https://www.ninemanga.com` | HTML scraping | Multi-language |

**Total: 59 sites from 11 implementations** (4 API + 4 theme engines + 3 standalone scrapers).

## Database Schema Changes

### Columns Removed from `manga` Table

- `mangaUpdatesId` — no longer used
- `mangaUpdatesSlug` — no longer used
- `mangaDexId` — MangaDex becomes a full source, not metadata-only
- `mangaDexFetchedAt` — no longer used
- `wikipediaPageTitle` — no longer used
- `wikipediaFetchedAt` — no longer used

### Columns Removed from `mangaVolumes` Table

- `mappingSource` — volume info comes from the source directly

### Tables/Associations Removed

- `mangaDownloadProfiles` join table — sources replace download profiles for manga
- Quality profile association for manga — no format selection when source provides images

### Columns Added to `manga` Table

- `sourceId` (text, not null) — which source this manga comes from (e.g., `"mangadex"`, `"madara:toonily"`)
- `sourceMangaUrl` (text, not null) — the manga's URL/path on that source (used for API calls)
- `sourceMangaThumbnail` (text) — cover image URL from the source

### New Table: `mangaSources`

Stores per-source configuration, persisted in DB:

| Column     | Type              | Description                                           |
| ---------- | ----------------- | ----------------------------------------------------- |
| `sourceId` | text (PK)         | e.g., `"mangadex"`, `"madara:toonily"`                |
| `enabled`  | integer (boolean) | Whether source is active                              |
| `config`   | text (JSON)       | Source-specific settings (language preferences, etc.) |

### What Stays

- Core manga fields: `title`, `author`, `artist`, `description`, `status`, `type`, `monitored`
- `monitorNewChapters` (all | future | missing | none)
- `mangaVolumes` table (simplified — volume info comes from source)
- `mangaChapters` table (chapter list comes from source)
- `mangaFiles` table (tracks downloaded CBZ files)

## Code Removal

### Files to Delete

- `src/server/mangadex.ts` — MangaDex metadata-only integration (replaced by MangaDex source)
- `src/server/wikipedia.ts` — Wikipedia volume mapping
- `src/server/manga-chapter-utils.ts` — Chapter parsing utils tied to MangaUpdates format
- `src/server/scheduler/tasks/refresh-mangaupdates-metadata.ts` — MangaUpdates refresh task

### Code to Remove from `src/server/manga-import.ts`

- MangaUpdates API calls (`getAllMangaUpdatesReleases`, `getMangaUpdatesSeriesDetail`)
- MangaDex volume mapping logic
- Wikipedia volume mapping fallback
- Chapter supplementation from MangaDex
- The multi-source merge orchestration in `refreshMangaInternal()`

### Indexer Changes

- Remove manga-specific release types from indexer types (`SingleChapter`, `MultiChapter`, `SingleVolume`, `MultiVolume`)
- Remove indexer search for manga content
- Remove download client usage for manga

## Download Pipeline

### Chapter Download Flow

1. Call `source.getPageList(chapterUrl)` → returns array of page image URLs
2. Fetch all page images concurrently (respecting per-source rate limiting)
3. Package images into a CBZ file (ZIP archive with images in page order, named `001.jpg`, `002.png`, etc.)
4. Store CBZ in the manga's root folder: `{rootFolder}/{manga-title}/Chapter {number}.cbz`
5. Create/update `mangaFiles` record linking the file to the chapter
6. Mark chapter's `hasFile = true`

### Rate Limiting

Each source gets its own rate limiter configured per-engine:

- MangaDex: 3 requests/second (API rate limit)
- Madara/MangaThemesia sites: 2 requests/second
- Other sources: configurable per-engine default

Page image fetches respect the same rate limiter as API calls.

### CBZ Generation

Use `adm-zip` (already a project dependency for EPUB parsing) to create ZIP archives with `.cbz` extension. Images named sequentially: `001.jpg`, `002.png`, etc., preserving original file extensions.

### MangaDex Image Proxying

MangaDex's at-home image URLs are time-limited (~15 min) and CORS-blocked. Allstarr fetches them server-side as part of the download pipeline, so no browser-side proxying is needed. The at-home server URL is fetched fresh per chapter download via `GET https://api.mangadex.org/at-home/server/{chapterId}`.

## Auto-Download Triggers

- **On manga import:** Download all chapters matching the `monitorNewChapters` setting
- **On refresh (scheduled task):** Detect new chapters from the source, download monitored ones
- **Manual:** User can trigger download for individual chapters or bulk select from the manga detail page

## Refresh Pipeline

### Scheduled Task: "Refresh Manga Sources"

Replaces the MangaUpdates refresh task. Registered alongside existing scheduled tasks using the same scheduler infrastructure (`src/server/scheduler/`):

- Visible in the existing scheduled tasks UI with configurable interval
- Iterates all monitored manga
- Spawns individual refresh tasks per title with throttling between them
- Same pattern as existing author/book refresh tasks

### Individual Manga Refresh (Long-Running Task)

Triggered from the manga detail page "Refresh" button or from the scheduled bulk refresh. Follows the same long-running task pattern used by books, authors, TV shows, and movies:

1. Call `source.getChapterList(sourceMangaUrl)` to get latest chapters
2. Call `source.getMangaDetails(sourceMangaUrl)` to update metadata (title, description, cover, status)
3. Diff chapter list against DB — identify new chapters
4. Insert new chapters into DB
5. For each new chapter matching the `monitorNewChapters` setting: enqueue download (fetch pages → build CBZ → store)
6. Log history event

**Task visibility:**

- Shows in the same task/activity UI used by other content types
- Displays manga title, source name, progress (e.g., "Downloading chapter 45 of 3 new chapters")
- Individual chapter downloads within the refresh are tracked as sub-progress

## UI Changes

### Settings > Metadata > "Manga Sources" Tab

A new tab in the metadata settings section listing all available sources grouped by type:

- **API Sources:** MangaDex, Comick, MangaPlus, AsuraScans
- **Theme Sources:** Madara (expandable list of 20 sites), MangaThemesia (10 sites), MadTheme (19 sites), MangaBox (3 sites)
- **Standalone:** MangaFire, Webtoons, NineManga

Each source shows: name, language badge, enabled/disabled toggle. Enabled sources with configurable options (e.g., MangaDex: preferred language, data saver mode) show a settings expand.

All 59 sites appear dynamically from the source registry — the UI reads the registry, not a hardcoded list.

### Add Manga Flow

1. User clicks "Add Manga" → search dialog
2. Search query hits all enabled sources concurrently
3. Results displayed with source indicator badge (e.g., "MangaDex", "Mangakakalot")
4. User picks a result → manga is added with that `sourceId` and `sourceMangaUrl`
5. Chapters fetched from source, monitoring applied per `monitorNewChapters` setting
6. Auto-download kicks in for monitored chapters

### Manga Detail Page

- Shows source badge indicating which source the manga is linked to
- "Refresh" button triggers individual long-running refresh task (same pattern as books/authors/TV/movies)
- "Migrate Source" action: search other enabled sources for the same title, pick new source, remap `sourceId`/`sourceMangaUrl`, re-fetch chapter list and reconcile with existing chapters/files

### Removal of Manga-Specific Download/Quality Profiles

Since sources are the unified metadata + indexer + download mechanism, the following UI elements are removed for manga:

- Quality profile selection on manga add/edit
- Download profile association for manga
- Indexer search results for manga content types
