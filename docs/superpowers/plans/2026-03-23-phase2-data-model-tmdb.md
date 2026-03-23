# Phase 2: Data Model & TMDB Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the database schema for TV shows, seasons, episodes, movies, and their file tables, implement TMDB API integration for metadata, build a release name parser for video files, and extend video file probing.

**Architecture:** A single migration (0010) creates all new tables and extends existing ones (history, tracked_downloads, blocklist). TMDB integration lives in `src/server/tmdb/` as a modular client with typed responses. The release parser and video prober are standalone utilities used by the import pipeline (Phase 3+). Server functions for shows/movies follow the existing pattern from authors/books.

**Tech Stack:** SQLite (Drizzle ORM), TanStack Start server functions, Zod validators, TMDB API v3 (REST/JSON), ffprobe for video metadata

**Spec:** `docs/superpowers/specs/2026-03-23-multi-media-support-design.md` (Sections 6, 7, 11, 12)

---

## File Map

### Files to Create

| File                                                  | Responsibility                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `drizzle/0010_tv_movies_schema.sql`                   | Migration: all new tables + extensions to existing tables                          |
| `src/db/schema/shows.ts`                              | Shows, seasons, episodes tables                                                    |
| `src/db/schema/episodes-files.ts`                     | Episode files table                                                                |
| `src/db/schema/movies.ts`                             | Movies table                                                                       |
| `src/db/schema/movie-files.ts`                        | Movie files table                                                                  |
| `src/db/schema/show-download-profiles.ts`             | Join: shows <-> download profiles                                                  |
| `src/db/schema/movie-download-profiles.ts`            | Join: movies <-> download profiles                                                 |
| `src/server/tmdb/client.ts`                           | TMDB HTTP client with rate limiting and auth                                       |
| `src/server/tmdb/types.ts`                            | TypeScript types for TMDB API responses                                            |
| `src/server/tmdb/search.ts`                           | TMDB search server functions (searchTmdbFn, searchTmdbShowsFn, searchTmdbMoviesFn) |
| `src/server/tmdb/shows.ts`                            | TMDB show detail server functions (getTmdbShowDetailFn, getTmdbSeasonDetailFn)     |
| `src/server/tmdb/movies.ts`                           | TMDB movie detail server functions (getTmdbMovieDetailFn)                          |
| `src/server/shows.ts`                                 | Show CRUD server functions (addShow, deleteShow, updateShow)                       |
| `src/server/movies.ts`                                | Movie CRUD server functions (addMovie, deleteMovie, updateMovie)                   |
| `src/server/release-parser.ts`                        | Scene release name parser (title, season, episode, source, resolution, codec)      |
| `src/lib/tmdb-validators.ts`                          | Zod schemas for TMDB-related inputs (addShow, addMovie, etc.)                      |
| `src/server/scheduler/tasks/refresh-tmdb-metadata.ts` | Stub task handler for TMDB metadata refresh (registered with scheduler)            |

### Files to Modify

| File                                 | What Changes                                                      |
| ------------------------------------ | ----------------------------------------------------------------- |
| `src/db/schema/index.ts`             | Export new schema tables                                          |
| `src/db/schema/history.ts`           | Add nullable showId, episodeId, movieId columns                   |
| `src/db/schema/tracked-downloads.ts` | Add nullable showId, episodeId, movieId columns                   |
| `src/db/schema/blocklist.ts`         | Add nullable showId, movieId columns                              |
| `src/db/schema/scheduled-tasks.ts`   | No schema changes, but migration seeds refresh-tmdb-metadata task |
| `src/server/media-probe.ts`          | Add `probeVideoFile()` function using ffprobe                     |
| `src/server/scheduler/index.ts`      | Import and register refresh-tmdb-metadata task handler            |
| `drizzle/meta/_journal.json`         | Add migration 0010 entry                                          |

---

## Tasks

### Task 1: Database Migration 0010

**Files:**

- Create: `drizzle/0010_tv_movies_schema.sql`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Create migration file**

Create `drizzle/0010_tv_movies_schema.sql` with all new tables. Follow the patterns from existing tables (integer timestamps, JSON columns, FK with cascade).

Use backtick-quoted identifiers and `--> statement-breakpoint` markers after every statement, matching the convention of all existing migrations. Match join table pattern from `author-download-profiles.ts` (autoincrement ID + UNIQUE constraint, not composite PK). Omit `DEFAULT (unixepoch())` on timestamps (Drizzle handles defaults via `$defaultFn`). Add UNIQUE constraints on `(show_id, season_number)` for seasons and `tmdb_id` for episodes.

```sql
-- ============================================================
-- 0010: TV Shows, Movies, and supporting tables
-- ============================================================

CREATE TABLE `shows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`overview` text NOT NULL DEFAULT '',
	`tmdb_id` integer NOT NULL,
	`imdb_id` text,
	`status` text NOT NULL DEFAULT 'continuing',
	`series_type` text NOT NULL DEFAULT 'standard',
	`network` text NOT NULL DEFAULT '',
	`year` integer NOT NULL DEFAULT 0,
	`runtime` integer NOT NULL DEFAULT 0,
	`genres` text NOT NULL DEFAULT '[]',
	`tags` text NOT NULL DEFAULT '[]',
	`poster_url` text NOT NULL DEFAULT '',
	`fanart_url` text NOT NULL DEFAULT '',
	`monitored` integer NOT NULL DEFAULT 1,
	`path` text NOT NULL DEFAULT '',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `shows_tmdb_id_unique` ON `shows` (`tmdb_id`);--> statement-breakpoint

CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL REFERENCES `shows`(`id`) ON DELETE CASCADE,
	`season_number` integer NOT NULL,
	`monitored` integer NOT NULL DEFAULT 1,
	`overview` text,
	`poster_url` text
);--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_show_season_unique` ON `seasons` (`show_id`, `season_number`);--> statement-breakpoint

CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL REFERENCES `shows`(`id`) ON DELETE CASCADE,
	`season_id` integer NOT NULL REFERENCES `seasons`(`id`) ON DELETE CASCADE,
	`episode_number` integer NOT NULL,
	`absolute_number` integer,
	`title` text NOT NULL DEFAULT '',
	`overview` text,
	`air_date` text,
	`runtime` integer,
	`tmdb_id` integer NOT NULL,
	`has_file` integer NOT NULL DEFAULT 0,
	`monitored` integer NOT NULL DEFAULT 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_tmdb_id_unique` ON `episodes` (`tmdb_id`);--> statement-breakpoint

CREATE TABLE `episode_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`episode_id` integer NOT NULL REFERENCES `episodes`(`id`) ON DELETE CASCADE,
	`path` text NOT NULL,
	`size` integer NOT NULL DEFAULT 0,
	`quality` text,
	`date_added` integer NOT NULL,
	`scene_name` text,
	`duration` integer,
	`codec` text,
	`container` text
);--> statement-breakpoint

CREATE TABLE `movies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`overview` text NOT NULL DEFAULT '',
	`tmdb_id` integer NOT NULL,
	`imdb_id` text,
	`status` text NOT NULL DEFAULT 'announced',
	`studio` text NOT NULL DEFAULT '',
	`year` integer NOT NULL DEFAULT 0,
	`runtime` integer NOT NULL DEFAULT 0,
	`genres` text NOT NULL DEFAULT '[]',
	`tags` text NOT NULL DEFAULT '[]',
	`poster_url` text NOT NULL DEFAULT '',
	`fanart_url` text NOT NULL DEFAULT '',
	`monitored` integer NOT NULL DEFAULT 1,
	`minimum_availability` text NOT NULL DEFAULT 'released',
	`path` text NOT NULL DEFAULT '',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `movies_tmdb_id_unique` ON `movies` (`tmdb_id`);--> statement-breakpoint

CREATE TABLE `movie_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL REFERENCES `movies`(`id`) ON DELETE CASCADE,
	`path` text NOT NULL,
	`size` integer NOT NULL DEFAULT 0,
	`quality` text,
	`date_added` integer NOT NULL,
	`scene_name` text,
	`duration` integer,
	`codec` text,
	`container` text
);--> statement-breakpoint

CREATE TABLE `show_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL REFERENCES `shows`(`id`) ON DELETE CASCADE,
	`download_profile_id` integer NOT NULL REFERENCES `download_profiles`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE UNIQUE INDEX `show_download_profiles_unique` ON `show_download_profiles` (`show_id`, `download_profile_id`);--> statement-breakpoint

CREATE TABLE `movie_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL REFERENCES `movies`(`id`) ON DELETE CASCADE,
	`download_profile_id` integer NOT NULL REFERENCES `download_profiles`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE UNIQUE INDEX `movie_download_profiles_unique` ON `movie_download_profiles` (`movie_id`, `download_profile_id`);--> statement-breakpoint

ALTER TABLE `history` ADD COLUMN `show_id` integer REFERENCES `shows`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `history` ADD COLUMN `episode_id` integer REFERENCES `episodes`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `history` ADD COLUMN `movie_id` integer REFERENCES `movies`(`id`) ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE `tracked_downloads` ADD COLUMN `show_id` integer REFERENCES `shows`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `tracked_downloads` ADD COLUMN `episode_id` integer REFERENCES `episodes`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `tracked_downloads` ADD COLUMN `movie_id` integer REFERENCES `movies`(`id`) ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE `blocklist` ADD COLUMN `show_id` integer REFERENCES `shows`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `blocklist` ADD COLUMN `movie_id` integer REFERENCES `movies`(`id`) ON DELETE SET NULL;--> statement-breakpoint

-- Seed TMDB metadata refresh scheduled task
INSERT INTO `scheduled_tasks` (`id`, `name`, `interval`, `enabled`) VALUES ('refresh-tmdb-metadata', 'Refresh TMDB Metadata', 43200, 1);
```

Note: `episodeId` is intentionally omitted from `blocklist` — blocklisting operates at the show level, not per-episode.

- [ ] **Step 2: Update migration journal**

Add entry to `drizzle/meta/_journal.json` with idx 10, tag `"0010_tv_movies_schema"`.

- [ ] **Step 3: Run migration and verify**

Run: `bun run db:migrate`
Expected: Clean migration. Verify tables exist with `bun run db:studio`.

- [ ] **Step 4: Commit**

```bash
git add drizzle/
git commit -m "feat: migration 0010 creates TV shows and movies schema"
```

---

### Task 2: Drizzle Schema Files for Shows

**Files:**

- Create: `src/db/schema/shows.ts`
- Create: `src/db/schema/episode-files.ts`
- Create: `src/db/schema/show-download-profiles.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create shows.ts**

Define `shows`, `seasons`, `episodes` tables following the patterns in `authors.ts` and `books.ts`:

- Use `integer("created_at", { mode: "timestamp" })` for timestamps
- Use `text("genres", { mode: "json" }).$type<string[]>()` for JSON arrays
- Use `text("tags", { mode: "json" }).$type<number[]>()` for tag IDs
- Use `text("quality", { mode: "json" }).$type<QualityJson>()` for quality objects where `QualityJson = { quality: { id: number; name: string }; revision: { version: number; real: number } }`
- Foreign keys: `seasons.showId` -> `shows.id`, `episodes.showId` -> `shows.id`, `episodes.seasonId` -> `seasons.id`

- [ ] **Step 2: Create episode-files.ts**

Define `episodeFiles` table matching the `bookFiles` pattern:

- `episodeId` FK -> episodes.id (cascade delete)
- `path`, `size`, `quality` (JSON), `dateAdded` (integer timestamp), `sceneName`, `duration`, `codec`, `container`

- [ ] **Step 3: Create show-download-profiles.ts**

Join table matching `author-download-profiles.ts` pattern:

- Autoincrement `id` PK + UNIQUE constraint on (showId, downloadProfileId)
- NOT composite PK — match existing pattern

- [ ] **Step 4: Export from index.ts**

Add all new exports to `src/db/schema/index.ts`.

- [ ] **Step 5: Verify build**

Run: `bun run build`
Expected: May have errors if imports are used elsewhere — schema-only changes should be clean.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/
git commit -m "feat: add Drizzle schemas for shows, seasons, episodes"
```

---

### Task 3: Drizzle Schema Files for Movies

**Files:**

- Create: `src/db/schema/movies.ts`
- Create: `src/db/schema/movie-files.ts`
- Create: `src/db/schema/movie-download-profiles.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create movies.ts**

Define `movies` table:

- Fields: id, title, sortTitle, overview, tmdbId (unique), imdbId, status, studio, year, runtime, genres (JSON string[]), tags (JSON number[]), posterUrl, fanartUrl, monitored, minimumAvailability, path, createdAt, updatedAt
- Status enum values: "tba", "announced", "inCinemas", "released"

- [ ] **Step 2: Create movie-files.ts**

Define `movieFiles` table matching the episode-files pattern:

- `movieId` FK -> movies.id (cascade delete)
- Same fields: path, size, quality (JSON), dateAdded (timestamp), sceneName, duration, codec, container

- [ ] **Step 3: Create movie-download-profiles.ts**

Join table matching existing pattern: autoincrement `id` PK + UNIQUE on (movieId, downloadProfileId).

- [ ] **Step 4: Export from index.ts**

Add new exports.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/
git commit -m "feat: add Drizzle schemas for movies and movie files"
```

---

### Task 4: Extend Existing Schema Tables

**Files:**

- Modify: `src/db/schema/history.ts`
- Modify: `src/db/schema/tracked-downloads.ts`
- Modify: `src/db/schema/blocklist.ts`

- [ ] **Step 1: Add show/movie columns to history.ts**

Add nullable columns:

```typescript
showId: integer("show_id").references(() => shows.id, { onDelete: "set null" }),
episodeId: integer("episode_id").references(() => episodes.id, { onDelete: "set null" }),
movieId: integer("movie_id").references(() => movies.id, { onDelete: "set null" }),
```

Import `shows`, `episodes`, `movies` from their schema files.

- [ ] **Step 2: Add show/movie columns to tracked-downloads.ts**

Same pattern: nullable showId, episodeId, movieId columns with FK references.

- [ ] **Step 3: Add show/movie columns to blocklist.ts**

Add nullable showId, movieId columns.

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/history.ts src/db/schema/tracked-downloads.ts src/db/schema/blocklist.ts
git commit -m "feat: extend history, tracked_downloads, blocklist for TV/movies"
```

---

### Task 5: TMDB Client and Types

**Files:**

- Create: `src/server/tmdb/client.ts`
- Create: `src/server/tmdb/types.ts`

- [ ] **Step 1: Create TMDB types**

Define TypeScript types for TMDB API responses in `src/server/tmdb/types.ts`:

```typescript
// Search result types
export type TmdbSearchResult = TmdbMovieResult | TmdbTvResult;

export type TmdbMovieResult = {
  media_type: "movie";
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids: number[];
  popularity: number;
  vote_average: number;
  adult: boolean;
};

export type TmdbTvResult = {
  media_type: "tv";
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  genre_ids: number[];
  popularity: number;
  vote_average: number;
  origin_country: string[];
};

// Detail types
export type TmdbShowDetail = {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date: string;
  status: string; // "Returning Series", "Ended", "Canceled", "In Production"
  type: string; // "Scripted", "Reality", "Documentary", etc.
  networks: { id: number; name: string }[];
  genres: { id: number; name: string }[];
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  seasons: TmdbSeasonSummary[];
  external_ids?: { imdb_id: string | null };
};

export type TmdbSeasonSummary = {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  episode_count: number;
  air_date: string | null;
};

export type TmdbSeasonDetail = {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  episodes: TmdbEpisode[];
};

export type TmdbEpisode = {
  id: number;
  episode_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  vote_average: number;
};

export type TmdbMovieDetail = {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  status: string; // "Rumored", "Planned", "In Production", "Post Production", "Released", "Canceled"
  runtime: number | null;
  genres: { id: number; name: string }[];
  production_companies: { id: number; name: string }[];
  imdb_id: string | null;
  budget: number;
  revenue: number;
  vote_average: number;
};

// Paginated response wrapper
export type TmdbPaginatedResponse<T> = {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
};

// Image base URL constant
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
```

- [ ] **Step 2: Create TMDB HTTP client**

Create `src/server/tmdb/client.ts` with rate-limited fetch:

```typescript
import getMediaSetting from "../settings-reader";

const TMDB_API_BASE = "https://api.themoviedb.org/3";

function getTmdbApiKey(): string {
  return getMediaSetting<string>("metadata.tmdb.apiKey", "");
}

// Simple rate limiter: max 40 requests per 10 seconds
let requestTimestamps: number[] = [];
const RATE_LIMIT = 40;
const RATE_WINDOW = 10_000; // 10 seconds

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((t) => now - t < RATE_WINDOW);
  if (requestTimestamps.length >= RATE_LIMIT) {
    const oldestInWindow = requestTimestamps[0];
    const waitTime = RATE_WINDOW - (now - oldestInWindow) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  requestTimestamps.push(Date.now());
}

export async function tmdbFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const apiKey = getTmdbApiKey();
  if (!apiKey) throw new Error("TMDB API key not configured");

  await waitForRateLimit();

  const language = getMediaSetting<string>("metadata.tmdb.language", "en");
  const url = new URL(`${TMDB_API_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", language);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(
      `TMDB API error: ${response.status} ${response.statusText}`,
    );
  }
  return response.json() as Promise<T>;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/tmdb/
git commit -m "feat: add TMDB client with types and rate limiting"
```

---

### Task 6: TMDB Search Server Functions

**Files:**

- Create: `src/server/tmdb/search.ts`

- [ ] **Step 1: Implement search functions**

Create server functions for TMDB search using `createServerFn()`:

- `searchTmdbFn` — searches `/search/multi`, returns combined TV + movie results
- `searchTmdbShowsFn` — searches `/search/tv`, returns TV results only
- `searchTmdbMoviesFn` — searches `/search/movie`, returns movie results only

Each function should:

- Call `requireAuth()` first
- Use input validation with Zod (query string, optional page number)
- Call `tmdbFetch()` from the client
- Transform TMDB image paths to full URLs using `TMDB_IMAGE_BASE`
- Return typed results

Include adult content filtering using `metadata.tmdb.includeAdult` setting. Include region filtering using `metadata.tmdb.region` setting.

- [ ] **Step 2: Commit**

```bash
git add src/server/tmdb/search.ts
git commit -m "feat: add TMDB search server functions"
```

---

### Task 7: TMDB Show and Movie Detail Functions

**Files:**

- Create: `src/server/tmdb/shows.ts`
- Create: `src/server/tmdb/movies.ts`

- [ ] **Step 1: Implement show detail functions**

`src/server/tmdb/shows.ts`:

- `getTmdbShowDetailFn` — fetches `/tv/{id}` with `append_to_response=external_ids`
- `getTmdbSeasonDetailFn` — fetches `/tv/{id}/season/{season_number}`
- Map TMDB status strings to our status enum: "Returning Series" -> "continuing", "Ended" -> "ended", "Canceled" -> "canceled", "In Production"/"Planned" -> "upcoming"

**Deferred to Phase 3-4:** `getTmdbEpisodeDetailFn` (single episode detail — not needed since season detail includes episodes), `getTmdbShowImagesFn`, and `getTmdbMovieImagesFn` (image browsing for poster/backdrop selection). These will be added when the UI pages are built.

- [ ] **Step 2: Implement movie detail functions**

`src/server/tmdb/movies.ts`:

- `getTmdbMovieDetailFn` — fetches `/movie/{id}`
- Map TMDB status strings to our status enum: "Rumored"/"Planned" -> "tba", "In Production"/"Post Production" -> "announced", "Released" -> "released"
- Extract studio from first production company

- [ ] **Step 3: Commit**

```bash
git add src/server/tmdb/
git commit -m "feat: add TMDB show and movie detail server functions"
```

---

### Task 8: Show CRUD Server Functions

**Files:**

- Create: `src/server/shows.ts`
- Create: `src/lib/tmdb-validators.ts`

- [ ] **Step 1: Create TMDB validators**

`src/lib/tmdb-validators.ts`:

- `addShowSchema` — tmdbId (number), downloadProfileId (number), monitorOption (enum: "all"|"future"|"missing"|"existing"|"pilot"|"firstSeason"|"lastSeason"|"none")
- `addMovieSchema` — tmdbId (number), downloadProfileId (number), minimumAvailability (enum: "announced"|"inCinemas"|"released")
- `updateShowSchema` — id (number), monitored (boolean), seriesType (optional enum: "standard"|"daily"|"anime")
- `updateMovieSchema` — id (number), monitored (boolean), minimumAvailability (optional)
- `deleteShowSchema` — id (number), deleteFiles (boolean)
- `deleteMovieSchema` — id (number), deleteFiles (boolean)

- [ ] **Step 2: Implement show server functions**

`src/server/shows.ts`:

- `addShowFn` — Fetches show detail from TMDB, inserts into `shows` table, fetches all seasons and inserts `seasons` + `episodes`, creates `show_download_profiles` join, applies monitoring option to mark episodes as monitored/unmonitored, emits `showAdded` history event
- `getShowsFn` — Lists all shows with season/episode counts
- `getShowDetailFn` — Gets single show with seasons and episodes
- `updateShowFn` — Updates show fields (monitored, seriesType)
- `deleteShowFn` — Deletes show (cascade deletes seasons, episodes, files), optionally removes files from disk, emits `showDeleted` history event

For monitoring option logic:

- `all`: monitor all episodes
- `future`: monitor episodes where airDate > today
- `missing`: monitor episodes where airDate <= today AND hasFile = false
- `existing`: monitor episodes where hasFile = true
- `pilot`: monitor only S01E01
- `firstSeason`: monitor only season 1 episodes
- `lastSeason`: monitor only the highest season number episodes
- `none`: unmonitor all

- [ ] **Step 3: Commit**

```bash
git add src/server/shows.ts src/lib/tmdb-validators.ts
git commit -m "feat: add show CRUD server functions with TMDB integration"
```

---

### Task 9: Movie CRUD Server Functions

**Files:**

- Create: `src/server/movies.ts`

- [ ] **Step 1: Implement movie server functions**

`src/server/movies.ts`:

- `addMovieFn` — Fetches movie detail from TMDB, inserts into `movies` table, creates `movie_download_profiles` join, emits `movieAdded` history event
- `getMoviesFn` — Lists all movies with file status
- `getMovieDetailFn` — Gets single movie with file info
- `updateMovieFn` — Updates movie fields (monitored, minimumAvailability)
- `deleteMovieFn` — Deletes movie (cascade deletes files), optionally removes from disk, emits `movieDeleted` history event

- [ ] **Step 2: Commit**

```bash
git add src/server/movies.ts
git commit -m "feat: add movie CRUD server functions with TMDB integration"
```

---

### Task 9b: Register TMDB Metadata Refresh Task

**Files:**

- Create: `src/server/scheduler/tasks/refresh-tmdb-metadata.ts`
- Modify: `src/server/scheduler/index.ts`

- [ ] **Step 1: Create stub task handler**

Create `src/server/scheduler/tasks/refresh-tmdb-metadata.ts` following the pattern of existing task handlers in the same directory. The handler should:

- Call `registerTask("refresh-tmdb-metadata", handler)`
- The handler function is a stub for now — it logs "TMDB metadata refresh: not yet implemented" and returns. The actual refresh logic (fetching new episodes, updating statuses) will be implemented in Phase 4.

- [ ] **Step 2: Register in scheduler index**

Add `import "./tasks/refresh-tmdb-metadata"` to `src/server/scheduler/index.ts` alongside the existing task imports.

- [ ] **Step 3: Commit**

```bash
git add src/server/scheduler/
git commit -m "feat: register refresh-tmdb-metadata scheduled task stub"
```

---

### Task 10: Release Name Parser

**Files:**

- Create: `src/server/release-parser.ts`

- [ ] **Step 1: Implement release name parser**

Create a regex-based parser for scene naming conventions:

```typescript
export type ParsedRelease = {
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  episodes?: number[]; // for multi-episode
  absoluteNumber?: number;
  source?: "HDTV" | "WEBDL" | "WEBRip" | "Bluray" | "BlurayRemux" | "DVD";
  resolution?: 480 | 720 | 1080 | 2160;
  codec?: "x264" | "x265" | "AV1" | "MPEG2" | "VC1";
  releaseGroup?: string;
  isProper?: boolean;
  isRepack?: boolean;
};

export function parseReleaseName(name: string): ParsedRelease { ... }
```

The parser should handle these patterns:

- Standard TV: `Show.Name.S02E05.1080p.WEB-DL.x265-GROUP`
- Daily TV: `Show.Name.2024.03.15.720p.HDTV.x264-GROUP`
- Anime: `[Group] Show Name - 42 [1080p]`
- Multi-episode: `Show.Name.S01E01E02.720p.BluRay.x264-GROUP`
- Movies: `Movie.Name.2024.1080p.BluRay.x264-GROUP`
- Remux: `Movie.Name.2024.1080p.BluRay.Remux.AVC-GROUP`

Key regex patterns:

- Season/Episode: `S(\d{1,2})E(\d{1,3})` (case insensitive)
- Date: `(\d{4})[.\-](\d{2})[.\-](\d{2})`
- Resolution: `(480|720|1080|2160)[pi]`
- Source: `\b(HDTV|WEB[-.]?DL|WEBRip|Blu[-.]?Ray|DVD(?:Rip)?)\b` (case insensitive)
- Codec: `\b(x264|x\.?265|h\.?264|h\.?265|HEVC|AV1|MPEG2|VC-?1)\b`
- Remux: `\bRemux\b`
- Group: `-(\w+)$` (last segment after dash)
- Proper/Repack: `\b(PROPER|REPACK)\b`

Title extraction: everything before the first matched pattern (season, year, resolution, source), with dots/underscores replaced by spaces, trimmed.

- [ ] **Step 2: Commit**

```bash
git add src/server/release-parser.ts
git commit -m "feat: add scene release name parser"
```

---

### Task 11: Video File Probing

**Files:**

- Modify: `src/server/media-probe.ts`

- [ ] **Step 1: Add probeVideoFile function**

Add to `src/server/media-probe.ts`:

```typescript
export type VideoMeta = {
  duration: number;    // seconds
  codec: string;       // "h264", "hevc", "av1", etc.
  container: string;   // "mkv", "mp4", etc.
  width: number;       // pixels
  height: number;      // pixels
  bitrate: number;     // kbps
};

export async function probeVideoFile(filePath: string): Promise<VideoMeta | null> { ... }
```

Use the same `ffprobe` invocation pattern as `probeAudioFile`:

- Spawn `ffprobe` with `-v quiet -print_format json -show_format -show_streams`
- Parse JSON output
- Extract video stream: codec_name, width, height
- Extract format: duration, bit_rate
- Extract container from file extension
- Return null on error (ffprobe not found, corrupt file, etc.)

- [ ] **Step 2: Commit**

```bash
git add src/server/media-probe.ts
git commit -m "feat: add video file probing via ffprobe"
```

---

### Task 12: Build Verification and Integration Check

- [ ] **Step 1: Run build**

Run: `bun run build`
Expected: Clean build with no errors.

- [ ] **Step 2: Verify schema imports work**

Run: `bun -e "import { shows, seasons, episodes, movies, movieFiles, episodeFiles } from './src/db/schema'; console.log('Schema loaded:', Object.keys({shows, seasons, episodes, movies, movieFiles, episodeFiles}).join(', '))"`
Expected: Lists all table names.

- [ ] **Step 3: Verify migration on existing DB**

Run: `bun run db:migrate`
Expected: Migration 0010 applies cleanly.

Verify new tables exist:

```bash
sqlite3 data/sqlite.db ".tables" | tr ' ' '\n' | sort
```

Expected output includes: `shows`, `seasons`, `episodes`, `episode_files`, `movies`, `movie_files`, `show_download_profiles`, `movie_download_profiles`

- [ ] **Step 4: Verify TMDB client works (if API key is configured)**

This is optional — only if a TMDB API key has been configured in settings. If not, skip.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: Phase 2 integration fixes"
```
