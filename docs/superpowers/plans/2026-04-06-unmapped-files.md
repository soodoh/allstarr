# Unmapped Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-content-type unmapped files management system that discovers unlinked files during disk scans, persists them, and provides a UI to map, ignore, or delete them — plus add `downloadProfileId` FK to all content file tables.

**Architecture:** New `unmapped_files` DB table serves as a staging area for files found on disk but not linked to any library entity. The existing disk scan is extended with a second pass to collect these files and extract hints (title, author, year) from filenames and metadata. A new `/library/unmapped-files` route displays files grouped by root folder with actions to map (via search dialog), ignore, or delete. Mapping moves a file from `unmapped_files` into the appropriate content file table (`book_files`, `movie_files`, `episode_files`). All content file tables gain a `downloadProfileId` FK.

**Tech Stack:** TanStack Start, Drizzle ORM (SQLite), TanStack Query, shadcn/ui, Zod, Bun

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/db/schema/unmapped-files.ts` | Drizzle schema for `unmapped_files` table |
| `src/server/unmapped-files.ts` | Server functions: list, map, ignore, delete, rescan |
| `src/server/hint-extractor.ts` | Parse filenames/paths/metadata to extract hints |
| `src/server/hint-extractor.test.ts` | Unit tests for hint extraction |
| `src/lib/queries/unmapped-files.ts` | TanStack Query wrappers for unmapped files |
| `src/routes/_authed/library/unmapped-files.tsx` | Route + page component |
| `src/components/unmapped-files/unmapped-files-table.tsx` | File list grouped by root folder |
| `src/components/unmapped-files/mapping-dialog.tsx` | Dialog for mapping a file to an entity |
| `drizzle/0002_unmapped_files.sql` | Migration: create table + add FKs |

### Modified Files

| File | Change |
|------|--------|
| `src/db/schema/book-files.ts` | Add `downloadProfileId` column |
| `src/db/schema/movie-files.ts` | Add `downloadProfileId` column |
| `src/db/schema/episode-files.ts` | Add `downloadProfileId` column |
| `src/db/schema/index.ts` | Export `unmappedFiles` |
| `src/lib/queries/index.ts` | Export unmapped files queries |
| `src/lib/query-keys.ts` | Add `unmappedFiles` key factory |
| `src/server/disk-scan.ts` | Add pass 2 to collect unmapped files, set `downloadProfileId` on matched files |
| `src/components/layout/app-sidebar.tsx` | Add Library nav group with Unmapped Files link + badge |
| `src/server/event-bus.ts` | Add `unmappedFilesUpdated` event type |

---

### Task 1: Database Schema — `unmapped_files` Table + FK Columns

**Files:**
- Create: `src/db/schema/unmapped-files.ts`
- Modify: `src/db/schema/book-files.ts`
- Modify: `src/db/schema/movie-files.ts`
- Modify: `src/db/schema/episode-files.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create `src/db/schema/unmapped-files.ts`**

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type UnmappedFileHints = {
	title?: string;
	author?: string;
	year?: number;
	season?: number;
	episode?: number;
	source?: "filename" | "path" | "metadata";
};

export const unmappedFiles = sqliteTable("unmapped_files", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	path: text("path").notNull().unique(),
	size: integer("size").notNull().default(0),
	rootFolderPath: text("root_folder_path").notNull(),
	contentType: text("content_type").notNull(),
	format: text("format").notNull(),
	quality: text("quality", { mode: "json" }).$type<{
		quality: { id: number; name: string };
		revision: { version: number; real: number };
	}>(),
	hints: text("hints", { mode: "json" }).$type<UnmappedFileHints>(),
	ignored: integer("ignored", { mode: "boolean" }).notNull().default(false),
	dateDiscovered: integer("date_discovered", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Add `downloadProfileId` to `src/db/schema/book-files.ts`**

Add the import and column after the existing `language` column:

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { books } from "./books";
import { downloadProfiles } from "./download-profiles";

export const bookFiles = sqliteTable("book_files", {
	// ... existing columns unchanged ...
	language: text("language"),
	downloadProfileId: integer("download_profile_id").references(
		() => downloadProfiles.id,
		{ onDelete: "set null" },
	),
});
```

- [ ] **Step 3: Add `downloadProfileId` to `src/db/schema/movie-files.ts`**

Add the import and column after the existing `container` column:

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { movies } from "./movies";
import { downloadProfiles } from "./download-profiles";

export const movieFiles = sqliteTable("movie_files", {
	// ... existing columns unchanged ...
	container: text("container"),
	downloadProfileId: integer("download_profile_id").references(
		() => downloadProfiles.id,
		{ onDelete: "set null" },
	),
});
```

- [ ] **Step 4: Add `downloadProfileId` to `src/db/schema/episode-files.ts`**

Add the import and column after the existing `container` column:

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { episodes } from "./shows";
import { downloadProfiles } from "./download-profiles";

export const episodeFiles = sqliteTable("episode_files", {
	// ... existing columns unchanged ...
	container: text("container"),
	downloadProfileId: integer("download_profile_id").references(
		() => downloadProfiles.id,
		{ onDelete: "set null" },
	),
});
```

- [ ] **Step 5: Export from `src/db/schema/index.ts`**

Add this line in alphabetical order (after the `tracked-downloads` export):

```typescript
export * from "./unmapped-files";
```

- [ ] **Step 6: Generate and review migration**

Run: `bun run db:generate`

This generates a SQL migration in `drizzle/`. Review the generated file to confirm it contains:
- `CREATE TABLE unmapped_files` with all columns and `UNIQUE` constraint on `path`
- `ALTER TABLE book_files ADD COLUMN download_profile_id`
- `ALTER TABLE movie_files ADD COLUMN download_profile_id`
- `ALTER TABLE episode_files ADD COLUMN download_profile_id`

- [ ] **Step 7: Run migration**

Run: `bun run db:migrate`
Expected: Migration applies cleanly, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema/unmapped-files.ts src/db/schema/book-files.ts src/db/schema/movie-files.ts src/db/schema/episode-files.ts src/db/schema/index.ts drizzle/
git commit -m "feat: add unmapped_files table and downloadProfileId FK to file tables"
```

---

### Task 2: Hint Extractor — Parse Filenames and Metadata

**Files:**
- Create: `src/server/hint-extractor.ts`
- Create: `src/server/hint-extractor.test.ts`

- [ ] **Step 1: Write failing tests in `src/server/hint-extractor.test.ts`**

```typescript
import { describe, expect, test } from "bun:test";
import { extractHints } from "./hint-extractor";

describe("extractHints", () => {
	describe("book filenames", () => {
		test("parses 'Author - Title.epub' pattern", () => {
			const result = extractHints(
				"/library/books/Stephen King - The Shining.epub",
				"ebook",
			);
			expect(result).toEqual({
				title: "The Shining",
				author: "Stephen King",
				source: "filename",
			});
		});

		test("parses 'Author - Title (Year).epub' pattern", () => {
			const result = extractHints(
				"/library/books/Stephen King - The Shining (1977).epub",
				"ebook",
			);
			expect(result).toEqual({
				title: "The Shining",
				author: "Stephen King",
				year: 1977,
				source: "filename",
			});
		});

		test("parses title-only filename", () => {
			const result = extractHints(
				"/library/books/The Shining.epub",
				"ebook",
			);
			expect(result).toEqual({
				title: "The Shining",
				source: "filename",
			});
		});
	});

	describe("movie filenames", () => {
		test("parses 'Movie.Title.2024.1080p.BluRay.mkv' pattern", () => {
			const result = extractHints(
				"/media/movies/Dune.Part.Two.2024.1080p.BluRay.x264.mkv",
				"movie",
			);
			expect(result).toEqual({
				title: "Dune Part Two",
				year: 2024,
				source: "filename",
			});
		});

		test("parses 'Movie Title (2024).mkv' pattern", () => {
			const result = extractHints(
				"/media/movies/Dune Part Two (2024).mkv",
				"movie",
			);
			expect(result).toEqual({
				title: "Dune Part Two",
				year: 2024,
				source: "filename",
			});
		});
	});

	describe("TV filenames", () => {
		test("parses 'Show.S01E03.720p.mkv' pattern", () => {
			const result = extractHints(
				"/media/tv/Breaking.Bad.S01E03.720p.mkv",
				"tv",
			);
			expect(result).toEqual({
				title: "Breaking Bad",
				season: 1,
				episode: 3,
				source: "filename",
			});
		});

		test("parses 'Show - S02E10.mkv' pattern", () => {
			const result = extractHints(
				"/media/tv/Breaking Bad - S02E10.mkv",
				"tv",
			);
			expect(result).toEqual({
				title: "Breaking Bad",
				season: 2,
				episode: 10,
				source: "filename",
			});
		});
	});

	describe("path-based hints", () => {
		test("falls back to parent directory for book hints", () => {
			const result = extractHints(
				"/library/books/Stephen King/The Shining (1977)/book.epub",
				"ebook",
			);
			expect(result).toEqual({
				title: "The Shining",
				author: "Stephen King",
				year: 1977,
				source: "path",
			});
		});

		test("falls back to parent directory for movie hints", () => {
			const result = extractHints(
				"/media/movies/Dune Part Two (2024)/movie.mkv",
				"movie",
			);
			expect(result).toEqual({
				title: "Dune Part Two",
				year: 2024,
				source: "path",
			});
		});

		test("falls back to parent directories for TV hints", () => {
			const result = extractHints(
				"/media/tv/Breaking Bad/Season 01/episode.mkv",
				"tv",
			);
			expect(result).toEqual({
				title: "Breaking Bad",
				season: 1,
				source: "path",
			});
		});
	});

	describe("unparseable files", () => {
		test("returns null for completely unparseable filenames", () => {
			const result = extractHints("/library/books/abc123.epub", "ebook");
			expect(result).toBeNull();
		});
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/hint-extractor.test.ts`
Expected: FAIL — module `./hint-extractor` not found.

- [ ] **Step 3: Implement `src/server/hint-extractor.ts`**

```typescript
import path from "node:path";
import type { UnmappedFileHints } from "src/db/schema/unmapped-files";

// ─── Filename patterns ─────────────────────────────────────────────────────

// "Author - Title (Year).ext" or "Author - Title.ext"
const BOOK_AUTHOR_TITLE_YEAR =
	/^(.+?)\s*-\s*(.+?)(?:\s*\((\d{4})\))?\s*\.\w+$/;

// "Title (Year).ext"
const TITLE_YEAR = /^(.+?)\s*\((\d{4})\)\s*\.\w+$/;

// "Movie.Title.2024.1080p.BluRay.x264.mkv" — dots as separators, year followed by quality tags
const DOTTED_MOVIE =
	/^(.+?)\.(\d{4})\.(?:\d{3,4}p|WEB|BluRay|BDRip|HDRip|DVDRip|REMUX)/i;

// "Show.S01E03.720p.mkv" or "Show - S01E03.mkv"
const TV_EPISODE = /^(.+?)[\s._-]+S(\d{1,2})E(\d{1,3})/i;

// ─── Path patterns ──────────────────────────────────────────────────────────

// "Title (Year)" directory name
const DIR_TITLE_YEAR = /^(.+?)\s*\((\d{4})\)$/;

// "Season 01" or "Season 1"
const SEASON_DIR = /^Season\s*(\d{1,2})$/i;

// ─── Main function ──────────────────────────────────────────────────────────

export function extractHints(
	filePath: string,
	contentType: string,
): UnmappedFileHints | null {
	const filename = path.basename(filePath);

	// Try filename-based extraction first
	const filenameHints = extractFromFilename(filename, contentType);
	if (filenameHints) {
		return filenameHints;
	}

	// Fall back to path-based extraction
	const pathHints = extractFromPath(filePath, contentType);
	if (pathHints) {
		return pathHints;
	}

	return null;
}

function extractFromFilename(
	filename: string,
	contentType: string,
): UnmappedFileHints | null {
	if (contentType === "tv") {
		const tvMatch = filename.match(TV_EPISODE);
		if (tvMatch) {
			return {
				title: tvMatch[1].replaceAll(".", " ").trim(),
				season: Number.parseInt(tvMatch[2], 10),
				episode: Number.parseInt(tvMatch[3], 10),
				source: "filename",
			};
		}
	}

	if (contentType === "movie") {
		const dottedMatch = filename.match(DOTTED_MOVIE);
		if (dottedMatch) {
			return {
				title: dottedMatch[1].replaceAll(".", " ").trim(),
				year: Number.parseInt(dottedMatch[2], 10),
				source: "filename",
			};
		}
	}

	if (contentType === "ebook" || contentType === "audiobook") {
		const bookMatch = filename.match(BOOK_AUTHOR_TITLE_YEAR);
		if (bookMatch) {
			const hints: UnmappedFileHints = {
				title: bookMatch[2].trim(),
				author: bookMatch[1].trim(),
				source: "filename",
			};
			if (bookMatch[3]) {
				hints.year = Number.parseInt(bookMatch[3], 10);
			}
			return hints;
		}
	}

	// Generic "Title (Year).ext" — works for movies and books
	const titleYearMatch = filename.match(TITLE_YEAR);
	if (titleYearMatch) {
		return {
			title: titleYearMatch[1].trim(),
			year: Number.parseInt(titleYearMatch[2], 10),
			source: "filename",
		};
	}

	// Last resort: strip extension for title
	const nameNoExt = filename.replace(/\.\w+$/, "").trim();
	// Only return if it looks like a real title (has at least one letter, more than 3 chars)
	if (nameNoExt.length > 3 && /[a-zA-Z]/.test(nameNoExt)) {
		// Check if it has meaningful content (not just random chars)
		const words = nameNoExt.split(/[\s._-]+/).filter((w) => w.length > 1);
		if (words.length >= 2) {
			return {
				title: nameNoExt.replaceAll(/[._]/g, " ").trim(),
				source: "filename",
			};
		}
	}

	return null;
}

function extractFromPath(
	filePath: string,
	contentType: string,
): UnmappedFileHints | null {
	const parts = filePath.split(path.sep);
	// Need at least: root / ... / parent / file
	if (parts.length < 3) {
		return null;
	}

	const parentDir = parts[parts.length - 2];
	const grandparentDir = parts.length >= 4 ? parts[parts.length - 3] : null;

	if (contentType === "tv") {
		// Look for "Season XX" in parent and show name in grandparent
		const seasonMatch = parentDir.match(SEASON_DIR);
		if (seasonMatch && grandparentDir) {
			const hints: UnmappedFileHints = {
				title: grandparentDir.trim(),
				season: Number.parseInt(seasonMatch[1], 10),
				source: "path",
			};
			return hints;
		}
	}

	if (contentType === "ebook" || contentType === "audiobook") {
		// Look for "Title (Year)" in parent dir, author in grandparent
		const titleMatch = parentDir.match(DIR_TITLE_YEAR);
		if (titleMatch) {
			const hints: UnmappedFileHints = {
				title: titleMatch[1].trim(),
				year: Number.parseInt(titleMatch[2], 10),
				source: "path",
			};
			if (grandparentDir) {
				hints.author = grandparentDir.trim();
			}
			return hints;
		}
	}

	if (contentType === "movie") {
		// Look for "Title (Year)" in parent dir
		const titleMatch = parentDir.match(DIR_TITLE_YEAR);
		if (titleMatch) {
			return {
				title: titleMatch[1].trim(),
				year: Number.parseInt(titleMatch[2], 10),
				source: "path",
			};
		}
	}

	return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/hint-extractor.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/hint-extractor.ts src/server/hint-extractor.test.ts
git commit -m "feat: add hint extractor for parsing unmapped file metadata"
```

---

### Task 3: Disk Scan — Collect Unmapped Files in Pass 2

**Files:**
- Modify: `src/server/disk-scan.ts`

- [ ] **Step 1: Add unmapped file imports and types**

At the top of `src/server/disk-scan.ts`, add to the existing imports:

```typescript
import {
	authors,
	bookFiles,
	books,
	booksAuthors,
	downloadProfiles,
	history,
	unmappedFiles,
} from "src/db/schema";
import { extractHints } from "src/server/hint-extractor";
```

- [ ] **Step 2: Add supported extensions sets for all content types**

Add these constants near the existing `AUDIO_EXTENSIONS` and `SUPPORTED_EXTENSIONS` sets (around line 24):

```typescript
const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".ts"]);

const ALL_SUPPORTED_EXTENSIONS = new Set([
	...SUPPORTED_EXTENSIONS,
	...VIDEO_EXTENSIONS,
]);
```

- [ ] **Step 3: Add `collectUnmappedFiles` function**

Add this function after the existing `countUnmatchedInDir` function (after line 171):

```typescript
type UnmappedFileInfo = {
	absolutePath: string;
	size: number;
	format: string;
};

function collectAllFiles(
	dirPath: string,
	extensions: Set<string>,
): UnmappedFileInfo[] {
	const results: UnmappedFileInfo[] = [];

	function walkDir(currentPath: string): void {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(currentPath, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = path.join(currentPath, entry.name);
			if (entry.isDirectory()) {
				walkDir(fullPath);
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase();
				if (extensions.has(ext)) {
					try {
						const stat = fs.statSync(fullPath);
						results.push({
							absolutePath: fullPath,
							size: stat.size,
							format: ext.slice(1), // remove leading dot
						});
					} catch {
						// Skip unreadable files
					}
				}
			}
		}
	}

	walkDir(dirPath);
	return results;
}

function getContentTypeForRootFolder(rootFolderPath: string): string | null {
	const profiles = db
		.select({ contentType: downloadProfiles.contentType })
		.from(downloadProfiles)
		.where(eq(downloadProfiles.rootFolderPath, rootFolderPath))
		.all();

	if (profiles.length === 0) return null;
	return profiles[0].contentType;
}

function syncUnmappedFiles(
	rootFolderPath: string,
	discoveredFiles: Map<string, DiscoveredFile>,
	contentType: string,
): void {
	// Get the extensions to scan based on content type
	const extensions =
		contentType === "movie" || contentType === "tv"
			? VIDEO_EXTENSIONS
			: SUPPORTED_EXTENSIONS;

	// Collect ALL files in the root folder
	const allFiles = collectAllFiles(rootFolderPath, extensions);

	// Filter out files that were matched in pass 1
	const unmapped = allFiles.filter(
		(f) => !discoveredFiles.has(f.absolutePath),
	);

	// Also filter out files already tracked in content file tables
	const existingBookPaths = new Set(
		db
			.select({ path: bookFiles.path })
			.from(bookFiles)
			.where(like(bookFiles.path, `${rootFolderPath}%`))
			.all()
			.map((r) => r.path),
	);

	const trulyUnmapped = unmapped.filter(
		(f) => !existingBookPaths.has(f.absolutePath),
	);

	// Get existing unmapped file paths for this root folder
	const existingUnmapped = new Map(
		db
			.select({ id: unmappedFiles.id, path: unmappedFiles.path })
			.from(unmappedFiles)
			.where(eq(unmappedFiles.rootFolderPath, rootFolderPath))
			.all()
			.map((r) => [r.path, r.id] as const),
	);

	const discoveredPaths = new Set(trulyUnmapped.map((f) => f.absolutePath));

	// Upsert new/changed unmapped files
	for (const file of trulyUnmapped) {
		// Try filename/path hints first, then metadata for EPUBs
		let hints = extractHints(file.absolutePath, contentType);
		if (!hints && file.format === "epub") {
			const meta = probeEbookFile(file.absolutePath);
			if (meta?.language) {
				hints = { title: undefined, source: "metadata" };
				// EPUB OPF doesn't reliably give us title, but we get language
			}
		}
		const quality = matchFormat({
			title: path.basename(file.absolutePath),
			size: file.size,
			indexerFlags: null,
		});

		if (existingUnmapped.has(file.absolutePath)) {
			// Update existing
			db.update(unmappedFiles)
				.set({
					size: file.size,
					format: file.format,
					hints,
					quality: {
						quality: { id: quality.id, name: quality.name },
						revision: { version: 1, real: 0 },
					},
				})
				.where(eq(unmappedFiles.path, file.absolutePath))
				.run();
		} else {
			// Insert new
			db.insert(unmappedFiles)
				.values({
					path: file.absolutePath,
					size: file.size,
					rootFolderPath,
					contentType,
					format: file.format,
					hints,
					quality: {
						quality: { id: quality.id, name: quality.name },
						revision: { version: 1, real: 0 },
					},
				})
				.run();
		}
	}

	// Remove unmapped files that no longer exist on disk
	for (const [existingPath, existingId] of existingUnmapped) {
		if (!discoveredPaths.has(existingPath)) {
			db.delete(unmappedFiles)
				.where(eq(unmappedFiles.id, existingId))
				.run();
		}
	}

	// Also remove any unmapped files that were matched in pass 1
	for (const [matchedPath] of discoveredFiles) {
		if (existingUnmapped.has(matchedPath)) {
			db.delete(unmappedFiles)
				.where(eq(unmappedFiles.path, matchedPath))
				.run();
		}
	}
}
```

- [ ] **Step 4: Update `rescanRootFolder` to call pass 2 and set `downloadProfileId`**

In `rescanRootFolder()` (line 349), add the pass 2 call after the `syncBookFiles` call. Also look up the profile ID to set on matched files. Replace the function body:

```typescript
export async function rescanRootFolder(
	rootFolderPath: string,
): Promise<ScanStats> {
	const stats: ScanStats = {
		filesAdded: 0,
		filesRemoved: 0,
		filesUnchanged: 0,
		filesUpdated: 0,
		unmatchedFiles: 0,
		errors: [],
	};

	if (!fs.existsSync(rootFolderPath)) {
		stats.errors.push(`Root folder does not exist: ${rootFolderPath}`);
		return stats;
	}

	// Determine content type and profile for this root folder
	const contentType = getContentTypeForRootFolder(rootFolderPath);

	// Look up the profile ID for setting downloadProfileId on matched files
	const profile = db
		.select({ id: downloadProfiles.id })
		.from(downloadProfiles)
		.where(eq(downloadProfiles.rootFolderPath, rootFolderPath))
		.limit(1)
		.get();

	// Walk directories and discover files
	const authorLookup = buildAuthorLookup();
	const discoveredFiles = walkDirectories(rootFolderPath, authorLookup, stats);

	// Sync discovered files with DB
	syncBookFiles(rootFolderPath, discoveredFiles, stats);

	// Set downloadProfileId on newly added files that don't have one
	if (profile) {
		db.update(bookFiles)
			.set({ downloadProfileId: profile.id })
			.where(
				and(
					like(bookFiles.path, `${rootFolderPath}%`),
					sql`${bookFiles.downloadProfileId} IS NULL`,
				),
			)
			.run();
	}

	// Pass 2: Collect unmapped files
	if (contentType) {
		syncUnmappedFiles(rootFolderPath, discoveredFiles, contentType);
	}

	// Probe metadata for files that don't have it yet
	const filesNeedingMeta = db
		.select()
		.from(bookFiles)
		.where(
			and(
				like(bookFiles.path, `${rootFolderPath}%`),
				sql`(${bookFiles.duration} IS NULL AND ${bookFiles.pageCount} IS NULL)`,
			),
		)
		.all();

	for (const file of filesNeedingMeta) {
		const ext = path.extname(file.path).toLowerCase();
		if (AUDIO_EXTENSIONS.has(ext)) {
			const meta = await probeAudioFile(file.path);
			if (meta) {
				db.update(bookFiles)
					.set({
						duration: meta.duration,
						bitrate: meta.bitrate,
						sampleRate: meta.sampleRate,
						channels: meta.channels,
						codec: meta.codec,
					})
					.where(eq(bookFiles.id, file.id))
					.run();
			}
		} else {
			const meta = probeEbookFile(file.path);
			if (meta) {
				db.update(bookFiles)
					.set({
						pageCount: meta.pageCount,
						language: meta.language,
					})
					.where(eq(bookFiles.id, file.id))
					.run();
			}
		}
	}

	return stats;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/server/disk-scan.ts
git commit -m "feat: collect unmapped files during disk scan (pass 2)"
```

---

### Task 4: Server Functions — Unmapped Files CRUD + Mapping

**Files:**
- Create: `src/server/unmapped-files.ts`
- Modify: `src/server/event-bus.ts`

- [ ] **Step 1: Add event type to `src/server/event-bus.ts`**

Add `unmappedFilesUpdated` to the `ServerEvent` union type:

```typescript
export type ServerEvent =
	| { type: "queueUpdated" }
	// ... existing types ...
	| { type: "unmappedFilesUpdated" };
```

- [ ] **Step 2: Create `src/server/unmapped-files.ts`**

```typescript
import fs from "node:fs";
import path from "node:path";
import { and, count, eq, like, or, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "src/db";
import {
	bookFiles,
	downloadProfiles,
	episodeFiles,
	history,
	movieFiles,
	unmappedFiles,
} from "src/db/schema";
import { requireAuth } from "src/server/middleware";
import { matchFormat } from "src/server/indexers/format-parser";
import {
	probeAudioFile,
	probeEbookFile,
	probeVideoFile,
} from "src/server/media-probe";
import { eventBus } from "src/server/event-bus";

// ─── List unmapped files ─────────────────────────────────────────────────────

export const getUnmappedFilesFn = createServerFn({ method: "GET" })
	.inputValidator(
		(d: { showIgnored?: boolean; contentType?: string; search?: string }) => d,
	)
	.handler(async ({ data }) => {
		await requireAuth();

		const conditions = [];

		if (!data.showIgnored) {
			conditions.push(eq(unmappedFiles.ignored, false));
		}

		if (data.contentType) {
			conditions.push(eq(unmappedFiles.contentType, data.contentType));
		}

		if (data.search) {
			conditions.push(
				like(unmappedFiles.path, `%${data.search}%`),
			);
		}

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		const files = db.select().from(unmappedFiles).where(where).all();

		// Group by root folder with profile info
		const profilesByRoot = new Map<
			string,
			{ name: string; contentType: string }
		>();
		const profiles = db.select().from(downloadProfiles).all();
		for (const profile of profiles) {
			if (profile.rootFolderPath) {
				profilesByRoot.set(profile.rootFolderPath, {
					name: profile.name,
					contentType: profile.contentType,
				});
			}
		}

		const groups = new Map<
			string,
			{
				rootFolderPath: string;
				profileName: string;
				contentType: string;
				files: typeof files;
			}
		>();

		for (const file of files) {
			if (!groups.has(file.rootFolderPath)) {
				const profileInfo = profilesByRoot.get(file.rootFolderPath);
				groups.set(file.rootFolderPath, {
					rootFolderPath: file.rootFolderPath,
					profileName: profileInfo?.name ?? "Unknown Profile",
					contentType: profileInfo?.contentType ?? file.contentType,
					files: [],
				});
			}
			groups.get(file.rootFolderPath)!.files.push(file);
		}

		return Array.from(groups.values());
	});

// ─── Get unmapped file count (for sidebar badge) ────────────────────────────

export const getUnmappedFileCountFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();
		const result = db
			.select({ count: count() })
			.from(unmappedFiles)
			.where(eq(unmappedFiles.ignored, false))
			.get();
		return result?.count ?? 0;
	},
);

// ─── Ignore / un-ignore ──────────────────────────────────────────────────────

const ignoreSchema = z.object({
	ids: z.array(z.number()).min(1),
	ignored: z.boolean(),
});

export const ignoreUnmappedFilesFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => ignoreSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();
		for (const id of data.ids) {
			db.update(unmappedFiles)
				.set({ ignored: data.ignored })
				.where(eq(unmappedFiles.id, id))
				.run();
		}
		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true };
	});

// ─── Delete unmapped files ───────────────────────────────────────────────────

const deleteSchema = z.object({
	ids: z.array(z.number()).min(1),
});

export const deleteUnmappedFilesFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => deleteSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();
		for (const id of data.ids) {
			const file = db
				.select()
				.from(unmappedFiles)
				.where(eq(unmappedFiles.id, id))
				.get();
			if (!file) continue;

			// Delete from disk
			try {
				fs.unlinkSync(file.path);
			} catch (error) {
				console.warn(
					`Failed to delete file ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}

			// Delete from DB
			db.delete(unmappedFiles).where(eq(unmappedFiles.id, id)).run();
		}
		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true };
	});

// ─── Map unmapped file to entity ─────────────────────────────────────────────

const mapSchema = z.object({
	unmappedFileIds: z.array(z.number()).min(1),
	entityType: z.enum(["book", "movie", "episode"]),
	entityId: z.number(),
	downloadProfileId: z.number(),
});

export const mapUnmappedFileFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => mapSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();

		const files = data.unmappedFileIds.map((id) =>
			db.select().from(unmappedFiles).where(eq(unmappedFiles.id, id)).get(),
		).filter(Boolean);

		if (files.length === 0) {
			throw new Error("No unmapped files found");
		}

		// Validate profile exists and content type matches
		const profile = db
			.select()
			.from(downloadProfiles)
			.where(eq(downloadProfiles.id, data.downloadProfileId))
			.get();
		if (!profile) {
			throw new Error("Download profile not found");
		}

		// Sort files naturally for part numbering
		files.sort((a, b) =>
			a!.path.localeCompare(b!.path, undefined, {
				numeric: true,
				sensitivity: "base",
			}),
		);

		const isMultiPart = files.length > 1;

		for (let i = 0; i < files.length; i++) {
			const file = files[i]!;
			const ext = path.extname(file.path).toLowerCase();

			// Probe metadata
			const isAudio = [".mp3", ".m4b", ".flac"].includes(ext);
			const isVideo = [".mkv", ".mp4", ".avi", ".ts"].includes(ext);

			if (data.entityType === "book") {
				let duration: number | undefined;
				let bitrate: number | undefined;
				let sampleRate: number | undefined;
				let channels: number | undefined;
				let codec: string | undefined;
				let pageCount: number | undefined;
				let language: string | undefined;

				if (isAudio) {
					const meta = await probeAudioFile(file.path);
					if (meta) {
						duration = meta.duration;
						bitrate = meta.bitrate;
						sampleRate = meta.sampleRate;
						channels = meta.channels;
						codec = meta.codec;
					}
				} else {
					const meta = probeEbookFile(file.path);
					if (meta) {
						pageCount = meta.pageCount ?? undefined;
						language = meta.language ?? undefined;
					}
				}

				db.insert(bookFiles)
					.values({
						bookId: data.entityId,
						path: file.path,
						size: file.size,
						quality: file.quality,
						downloadProfileId: data.downloadProfileId,
						part: isMultiPart ? i + 1 : null,
						partCount: isMultiPart ? files.length : null,
						duration: duration ?? null,
						bitrate: bitrate ?? null,
						sampleRate: sampleRate ?? null,
						channels: channels ?? null,
						codec: codec ?? null,
						pageCount: pageCount ?? null,
						language: language ?? null,
					})
					.run();

				db.insert(history)
					.values({
						eventType: "bookFileAdded",
						bookId: data.entityId,
						data: {
							path: file.path,
							size: file.size,
							quality:
								(file.quality as { quality: { name: string } } | null)?.quality
									?.name ?? "Unknown",
						},
					})
					.run();
			} else if (data.entityType === "movie") {
				let duration: number | undefined;
				let codec: string | undefined;
				let container: string | undefined;

				if (isVideo) {
					const meta = await probeVideoFile(file.path);
					if (meta) {
						duration = meta.duration;
						codec = meta.codec;
						container = meta.container;
					}
				}

				db.insert(movieFiles)
					.values({
						movieId: data.entityId,
						path: file.path,
						size: file.size,
						quality: file.quality,
						downloadProfileId: data.downloadProfileId,
						duration: duration ?? null,
						codec: codec ?? null,
						container: container ?? null,
					})
					.run();

				db.insert(history)
					.values({
						eventType: "movieFileAdded",
						movieId: data.entityId,
						data: {
							path: file.path,
							size: file.size,
							quality:
								(file.quality as { quality: { name: string } } | null)?.quality
									?.name ?? "Unknown",
						},
					})
					.run();
			} else if (data.entityType === "episode") {
				let duration: number | undefined;
				let codec: string | undefined;
				let container: string | undefined;

				if (isVideo) {
					const meta = await probeVideoFile(file.path);
					if (meta) {
						duration = meta.duration;
						codec = meta.codec;
						container = meta.container;
					}
				}

				db.insert(episodeFiles)
					.values({
						episodeId: data.entityId,
						path: file.path,
						size: file.size,
						quality: file.quality,
						downloadProfileId: data.downloadProfileId,
						duration: duration ?? null,
						codec: codec ?? null,
						container: container ?? null,
					})
					.run();

				db.insert(history)
					.values({
						eventType: "episodeFileAdded",
						episodeId: data.entityId,
						data: {
							path: file.path,
							size: file.size,
							quality:
								(file.quality as { quality: { name: string } } | null)?.quality
									?.name ?? "Unknown",
						},
					})
					.run();
			}

			// Remove from unmapped files
			db.delete(unmappedFiles).where(eq(unmappedFiles.id, file.id)).run();
		}

		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true, mappedCount: files.length };
	});
```

- [ ] **Step 3: Commit**

```bash
git add src/server/unmapped-files.ts src/server/event-bus.ts
git commit -m "feat: add unmapped files server functions (list, map, ignore, delete)"
```

---

### Task 5: Query Keys + Client Queries

**Files:**
- Modify: `src/lib/query-keys.ts`
- Create: `src/lib/queries/unmapped-files.ts`
- Modify: `src/lib/queries/index.ts`

- [ ] **Step 1: Add query keys to `src/lib/query-keys.ts`**

Add this block after the `blocklist` section:

```typescript
	// ─── Unmapped Files ──────────────────────────────────────────────────────
	unmappedFiles: {
		all: ["unmappedFiles"] as const,
		list: (params: {
			showIgnored?: boolean;
			contentType?: string;
			search?: string;
		}) => ["unmappedFiles", "list", params] as const,
		count: () => ["unmappedFiles", "count"] as const,
	},
```

- [ ] **Step 2: Create `src/lib/queries/unmapped-files.ts`**

```typescript
import { queryOptions } from "@tanstack/react-query";
import {
	getUnmappedFileCountFn,
	getUnmappedFilesFn,
} from "src/server/unmapped-files";
import { queryKeys } from "../query-keys";

export const unmappedFilesListQuery = (params: {
	showIgnored?: boolean;
	contentType?: string;
	search?: string;
} = {}) =>
	queryOptions({
		queryKey: queryKeys.unmappedFiles.list(params),
		queryFn: () => getUnmappedFilesFn({ data: params }),
	});

export const unmappedFilesCountQuery = () =>
	queryOptions({
		queryKey: queryKeys.unmappedFiles.count(),
		queryFn: () => getUnmappedFileCountFn(),
	});
```

- [ ] **Step 3: Export from `src/lib/queries/index.ts`**

Add this line in alphabetical order (after `user-settings`):

```typescript
export * from "./unmapped-files";
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/query-keys.ts src/lib/queries/unmapped-files.ts src/lib/queries/index.ts
git commit -m "feat: add unmapped files query keys and client queries"
```

---

### Task 6: Sidebar — Add Library Nav Group with Badge

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Add imports and badge query**

Add `FileQuestion` to the lucide-react imports and import the count query:

```typescript
import {
	Activity,
	BookOpen,
	Calendar,
	Download,
	FileQuestion,
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

Also add the query import:

```typescript
import { unmappedFilesCountQuery } from "src/lib/queries";
```

- [ ] **Step 2: Add Library nav group before the Books group**

Insert at the beginning of the `navGroups` array (before the Books entry):

```typescript
const navGroups: NavGroup[] = [
	{
		title: "Library",
		to: "/library/unmapped-files",
		icon: FolderOpen,
		matchPrefixes: ["/library"],
		children: [
			{
				title: "Unmapped Files",
				to: "/library/unmapped-files",
				icon: FileQuestion,
			},
		],
	},
	{
		title: "Books",
		// ... existing
	},
	// ... rest unchanged
];
```

- [ ] **Step 3: Add unmapped files count query and badge rendering**

In the `AppSidebar` component, add the count query next to the existing `queueCount` query:

```typescript
const { data: unmappedCount } = useQuery({
	...unmappedFilesCountQuery(),
	select: (data) => data,
});
```

Then in the JSX where badges are rendered (inside the `SidebarMenuButton` for each group), add the Library badge next to the existing Activity badge logic. Find the section that renders the Activity badge (around line 181) and add the Library badge before it:

```typescript
{group.title === "Library" &&
	unmappedCount !== undefined &&
	unmappedCount > 0 && (
		<span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
			{unmappedCount}
		</span>
	)}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat: add Library nav group with unmapped files badge in sidebar"
```

---

### Task 7: Unmapped Files Page — Route + Table Component

**Files:**
- Create: `src/routes/_authed/library/unmapped-files.tsx`
- Create: `src/components/unmapped-files/unmapped-files-table.tsx`

- [ ] **Step 1: Create the route file `src/routes/_authed/library/unmapped-files.tsx`**

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { TableSkeleton } from "src/components/shared/loading-skeleton";
import UnmappedFilesTable from "src/components/unmapped-files/unmapped-files-table";
import PageHeader from "src/components/shared/page-header";
import { unmappedFilesListQuery } from "src/lib/queries";
import { Button } from "src/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import { rescanAllRootFoldersFn } from "src/server/unmapped-files";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/library/unmapped-files")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(unmappedFilesListQuery()),
	component: UnmappedFilesPage,
	pendingComponent: TableSkeleton,
});

function UnmappedFilesPage() {
	const queryClient = useQueryClient();

	const handleRescanAll = async () => {
		try {
			await rescanAllRootFoldersFn();
			queryClient.invalidateQueries({
				queryKey: queryKeys.unmappedFiles.all,
			});
			toast.success("Rescan complete");
		} catch {
			toast.error("Rescan failed");
		}
	};

	return (
		<div>
			<PageHeader
				title="Unmapped Files"
				description="Files found in root folders that aren't linked to any library entry"
				actions={
					<Button variant="outline" size="sm" onClick={handleRescanAll}>
						<RefreshCw className="mr-2 h-4 w-4" />
						Rescan All
					</Button>
				}
			/>
			<Suspense fallback={<TableSkeleton />}>
				<UnmappedFilesTable />
			</Suspense>
		</div>
	);
}
```

- [ ] **Step 2: Add `rescanAllRootFoldersFn` to `src/server/unmapped-files.ts`**

Add this server function at the end of the file:

```typescript
export const rescanAllRootFoldersFn = createServerFn({ method: "POST" }).handler(
	async () => {
		await requireAuth();
		const { getRootFolderPaths, rescanRootFolder } = await import(
			"src/server/disk-scan"
		);
		const rootFolders = getRootFolderPaths();
		for (const rootFolder of rootFolders) {
			await rescanRootFolder(rootFolder);
		}
		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true };
	},
);
```

- [ ] **Step 3: Create `src/components/unmapped-files/unmapped-files-table.tsx`**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import { Input } from "src/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import { queryKeys } from "src/lib/query-keys";
import { unmappedFilesListQuery } from "src/lib/queries";
import {
	deleteUnmappedFilesFn,
	ignoreUnmappedFilesFn,
} from "src/server/unmapped-files";
import type { UnmappedFileHints } from "src/db/schema/unmapped-files";
import {
	Eye,
	EyeOff,
	FileQuestion,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { rescanAllRootFoldersFn } from "src/server/unmapped-files";
import MappingDialog from "./mapping-dialog";
import { EmptyState } from "src/components/shared/empty-state";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "src/components/ui/alert-dialog";

const FORMAT_COLORS: Record<string, { bg: string; text: string }> = {
	epub: { bg: "bg-blue-900/50", text: "text-blue-400" },
	pdf: { bg: "bg-blue-900/50", text: "text-blue-400" },
	mobi: { bg: "bg-blue-900/50", text: "text-blue-400" },
	azw3: { bg: "bg-blue-900/50", text: "text-blue-400" },
	azw: { bg: "bg-blue-900/50", text: "text-blue-400" },
	mp3: { bg: "bg-purple-900/50", text: "text-purple-400" },
	m4b: { bg: "bg-purple-900/50", text: "text-purple-400" },
	flac: { bg: "bg-purple-900/50", text: "text-purple-400" },
	mkv: { bg: "bg-orange-900/50", text: "text-orange-400" },
	mp4: { bg: "bg-orange-900/50", text: "text-orange-400" },
	avi: { bg: "bg-orange-900/50", text: "text-orange-400" },
	ts: { bg: "bg-orange-900/50", text: "text-orange-400" },
};

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatHint(hints: UnmappedFileHints | null): string | null {
	if (!hints) return null;
	const parts: string[] = [];
	if (hints.title) parts.push(`"${hints.title}"`);
	if (hints.author) parts.push(`by ${hints.author}`);
	if (hints.year) parts.push(`(${hints.year})`);
	if (hints.season != null && hints.episode != null)
		parts.push(`S${String(hints.season).padStart(2, "0")}E${String(hints.episode).padStart(2, "0")}`);
	else if (hints.season != null) parts.push(`Season ${hints.season}`);
	return parts.length > 0 ? parts.join(" ") : null;
}

function getFilename(filePath: string): string {
	return filePath.split("/").pop() ?? filePath;
}

export default function UnmappedFilesTable() {
	const [search, setSearch] = useState("");
	const [contentType, setContentType] = useState<string>("all");
	const [showIgnored, setShowIgnored] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [mappingFileIds, setMappingFileIds] = useState<number[] | null>(null);
	const [mappingContentType, setMappingContentType] = useState<string>("");
	const [mappingHints, setMappingHints] = useState<UnmappedFileHints | null>(
		null,
	);
	const [deleteConfirmIds, setDeleteConfirmIds] = useState<number[] | null>(
		null,
	);
	const queryClient = useQueryClient();

	const { data: groups = [] } = useQuery(
		unmappedFilesListQuery({
			showIgnored,
			contentType: contentType === "all" ? undefined : contentType,
			search: search || undefined,
		}),
	);

	const ignoreMutation = useMutation({
		mutationFn: (params: { ids: number[]; ignored: boolean }) =>
			ignoreUnmappedFilesFn({ data: params }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.unmappedFiles.all,
			});
			setSelectedIds(new Set());
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (ids: number[]) => deleteUnmappedFilesFn({ data: { ids } }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.unmappedFiles.all,
			});
			setSelectedIds(new Set());
			setDeleteConfirmIds(null);
			toast.success("Files deleted");
		},
	});

	const allFiles = groups.flatMap((g) => g.files);
	const ignoredCount = allFiles.filter((f) => f.ignored).length;
	const totalCount = allFiles.length;

	const toggleSelect = (id: number) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleSelectAll = () => {
		if (selectedIds.size === totalCount) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(allFiles.map((f) => f.id)));
		}
	};

	const openMapping = (
		fileIds: number[],
		fileContentType: string,
		hints: UnmappedFileHints | null,
	) => {
		setMappingFileIds(fileIds);
		setMappingContentType(fileContentType);
		setMappingHints(hints);
	};

	if (totalCount === 0 && !search && contentType === "all" && !showIgnored) {
		return (
			<EmptyState
				icon={FileQuestion}
				title="No unmapped files"
				description="All files in your root folders are linked to library entries. Run a rescan to check for new files."
			/>
		);
	}

	return (
		<>
			{/* Toolbar */}
			<div className="mb-4 flex items-center gap-3">
				<Input
					placeholder="Filter files..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="w-56"
				/>
				<Select value={contentType} onValueChange={setContentType}>
					<SelectTrigger className="w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Types</SelectItem>
						<SelectItem value="ebook">Ebooks</SelectItem>
						<SelectItem value="audiobook">Audiobooks</SelectItem>
						<SelectItem value="movie">Movies</SelectItem>
						<SelectItem value="tv">TV</SelectItem>
					</SelectContent>
				</Select>
				<div className="flex-1" />
				<Button
					variant="outline"
					size="sm"
					onClick={() => setShowIgnored(!showIgnored)}
				>
					{showIgnored ? (
						<EyeOff className="mr-2 h-4 w-4" />
					) : (
						<Eye className="mr-2 h-4 w-4" />
					)}
					{showIgnored ? "Hide Ignored" : `Show Ignored (${ignoredCount})`}
				</Button>
			</div>

			{/* Root folder groups */}
			{groups.map((group) => (
				<div
					key={group.rootFolderPath}
					className="mb-6 overflow-hidden rounded-lg border border-border"
				>
					{/* Group header */}
					<div className="flex items-center justify-between bg-muted/50 px-4 py-2.5">
						<div className="flex items-center gap-2">
							<span className="font-semibold text-sm">
								{group.rootFolderPath}
							</span>
							<span className="text-muted-foreground text-xs">
								{group.profileName} &middot; {group.files.length} files
							</span>
						</div>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-xs"
							onClick={async () => {
								const { rescanRootFolderFn } = await import(
									"src/server/unmapped-files"
								);
								await rescanRootFolderFn({
									data: { rootFolderPath: group.rootFolderPath },
								});
								queryClient.invalidateQueries({
									queryKey: queryKeys.unmappedFiles.all,
								});
								toast.success("Rescan complete");
							}}
						>
							<RefreshCw className="mr-1 h-3 w-3" />
							Rescan
						</Button>
					</div>

					{/* File rows */}
					{group.files.map((file) => {
						const colors = FORMAT_COLORS[file.format] ?? {
							bg: "bg-zinc-800",
							text: "text-zinc-400",
						};
						const hint = formatHint(
							file.hints as UnmappedFileHints | null,
						);

						return (
							<div
								key={file.id}
								className="flex items-center gap-3 border-t border-border px-4 py-2.5"
							>
								<Checkbox
									checked={selectedIds.has(file.id)}
									onCheckedChange={() => toggleSelect(file.id)}
								/>
								<div
									className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${colors.bg} ${colors.text}`}
								>
									{file.format.toUpperCase()}
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm">
										{getFilename(file.path)}
									</div>
									<div className="truncate text-xs text-muted-foreground">
										{file.path}
									</div>
								</div>
								<div className="shrink-0 text-right">
									<div className="text-xs text-muted-foreground">
										{formatSize(file.size)}
									</div>
									{hint ? (
										<div className="text-xs text-green-500">{hint}</div>
									) : (
										<div className="text-xs text-muted-foreground">
											No match suggested
										</div>
									)}
								</div>
								<div className="flex shrink-0 gap-1.5">
									<Button
										size="sm"
										variant="default"
										className="h-7 px-2.5 text-xs"
										onClick={() =>
											openMapping(
												[file.id],
												file.contentType,
												file.hints as UnmappedFileHints | null,
											)
										}
									>
										Map
									</Button>
									<Button
										size="sm"
										variant="outline"
										className="h-7 px-2.5 text-xs"
										onClick={() =>
											ignoreMutation.mutate({
												ids: [file.id],
												ignored: !file.ignored,
											})
										}
									>
										{file.ignored ? "Unignore" : "Ignore"}
									</Button>
									<Button
										size="sm"
										variant="outline"
										className="h-7 px-2.5 text-xs text-destructive hover:bg-destructive/10"
										onClick={() => setDeleteConfirmIds([file.id])}
									>
										<Trash2 className="h-3 w-3" />
									</Button>
								</div>
							</div>
						);
					})}
				</div>
			))}

			{/* Bulk action bar */}
			{selectedIds.size > 0 && (
				<div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 border-t border-border bg-background px-6 py-3">
					<Checkbox
						checked={selectedIds.size === totalCount}
						onCheckedChange={toggleSelectAll}
					/>
					<span className="text-sm font-medium">
						{selectedIds.size} files selected
					</span>
					<div className="flex-1" />
					<Button
						size="sm"
						onClick={() => {
							const ids = Array.from(selectedIds);
							const firstFile = allFiles.find((f) => ids.includes(f.id));
							if (firstFile) {
								openMapping(
									ids,
									firstFile.contentType,
									firstFile.hints as UnmappedFileHints | null,
								);
							}
						}}
					>
						Map Selected
					</Button>
					<Button
						size="sm"
						variant="secondary"
						onClick={() =>
							ignoreMutation.mutate({
								ids: Array.from(selectedIds),
								ignored: true,
							})
						}
					>
						Ignore Selected
					</Button>
					<Button
						size="sm"
						variant="destructive"
						onClick={() =>
							setDeleteConfirmIds(Array.from(selectedIds))
						}
					>
						Delete Selected
					</Button>
				</div>
			)}

			{/* Mapping dialog */}
			{mappingFileIds && (
				<MappingDialog
					fileIds={mappingFileIds}
					contentType={mappingContentType}
					hints={mappingHints}
					onClose={() => {
						setMappingFileIds(null);
						setSelectedIds(new Set());
					}}
				/>
			)}

			{/* Delete confirmation */}
			<AlertDialog
				open={deleteConfirmIds !== null}
				onOpenChange={(open) => !open && setDeleteConfirmIds(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete files?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete{" "}
							{deleteConfirmIds?.length === 1
								? "this file"
								: `${deleteConfirmIds?.length} files`}{" "}
							from disk. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() =>
								deleteConfirmIds &&
								deleteMutation.mutate(deleteConfirmIds)
							}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
```

- [ ] **Step 4: Verify the route loads**

Run: `bun run dev`
Navigate to `http://localhost:3000/library/unmapped-files`
Expected: Page renders with "Unmapped Files" header and empty state.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authed/library/unmapped-files.tsx src/components/unmapped-files/unmapped-files-table.tsx src/server/unmapped-files.ts
git commit -m "feat: add unmapped files page with file list grouped by root folder"
```

---

### Task 8: Mapping Dialog Component

**Files:**
- Create: `src/components/unmapped-files/mapping-dialog.tsx`

- [ ] **Step 1: Create `src/components/unmapped-files/mapping-dialog.tsx`**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "src/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import { queryKeys } from "src/lib/query-keys";
import { downloadProfilesListQuery } from "src/lib/queries";
import { mapUnmappedFileFn } from "src/server/unmapped-files";
import type { UnmappedFileHints } from "src/db/schema/unmapped-files";
import { searchLibraryFn } from "src/server/unmapped-files";
import { Loader2 } from "lucide-react";
import { useDebounce } from "src/hooks/use-debounce";

type MappingDialogProps = {
	fileIds: number[];
	contentType: string;
	hints: UnmappedFileHints | null;
	onClose: () => void;
};

export default function MappingDialog({
	fileIds,
	contentType,
	hints,
	onClose,
}: MappingDialogProps) {
	const queryClient = useQueryClient();

	// Build initial search from hints
	const initialSearch = hints
		? [hints.title, hints.author].filter(Boolean).join(" ")
		: "";

	const [search, setSearch] = useState(initialSearch);
	const [profileId, setProfileId] = useState<string>("");
	const debouncedSearch = useDebounce(search, 300);

	// Load profiles filtered to matching content type
	const { data: profiles = [] } = useQuery({
		...downloadProfilesListQuery(),
		select: (data) =>
			data.filter(
				(p) =>
					p.contentType === contentType ||
					(contentType === "ebook" && p.contentType === "audiobook") ||
					(contentType === "audiobook" && p.contentType === "ebook"),
			),
	});

	// Set default profile on load
	if (!profileId && profiles.length > 0) {
		setProfileId(String(profiles[0].id));
	}

	// Search for matching entities
	const { data: searchResults, isLoading: isSearching } = useQuery({
		queryKey: ["unmappedFiles", "search", debouncedSearch, contentType],
		queryFn: () =>
			searchLibraryFn({
				data: { query: debouncedSearch, contentType },
			}),
		enabled: debouncedSearch.length >= 2,
	});

	const mapMutation = useMutation({
		mutationFn: (params: {
			entityType: "book" | "movie" | "episode";
			entityId: number;
		}) =>
			mapUnmappedFileFn({
				data: {
					unmappedFileIds: fileIds,
					entityType: params.entityType,
					entityId: params.entityId,
					downloadProfileId: Number(profileId),
				},
			}),
		onSuccess: (result) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.unmappedFiles.all,
			});
			toast.success(
				`Mapped ${result.mappedCount} file${result.mappedCount > 1 ? "s" : ""}`,
			);
			onClose();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to map file",
			);
		},
	});

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						Map {fileIds.length > 1 ? `${fileIds.length} files` : "file"}
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					{/* Profile selector */}
					<div>
						<Label className="text-xs uppercase text-muted-foreground">
							Download Profile
						</Label>
						<Select value={profileId} onValueChange={setProfileId}>
							<SelectTrigger className="mt-1">
								<SelectValue placeholder="Select profile" />
							</SelectTrigger>
							<SelectContent>
								{profiles.map((p) => (
									<SelectItem key={p.id} value={String(p.id)}>
										{p.name} ({p.rootFolderPath})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Search */}
					<div>
						<Label className="text-xs uppercase text-muted-foreground">
							Search for{" "}
							{contentType === "tv"
								? "episode"
								: contentType === "movie"
									? "movie"
									: "book"}
						</Label>
						<Input
							className="mt-1"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Type to search..."
							autoFocus
						/>
						<p className="mt-1 text-xs text-muted-foreground">
							Search your library or add from Hardcover/TMDB
						</p>
					</div>

					{/* Results */}
					<div className="max-h-64 overflow-y-auto rounded-md border border-border">
						{isSearching && (
							<div className="flex items-center justify-center py-8">
								<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
							</div>
						)}

						{searchResults && !isSearching && (
							<>
								{/* Library results */}
								{searchResults.library.length > 0 && (
									<>
										<div className="bg-muted/30 px-3 py-1.5 text-xs font-medium uppercase text-muted-foreground">
											In Your Library
										</div>
										{searchResults.library.map((item) => (
											<div
												key={`lib-${item.id}`}
												className="flex items-center gap-3 border-t border-border px-3 py-2.5"
											>
												<div className="min-w-0 flex-1">
													<div className="text-sm font-medium">
														{item.title}
													</div>
													<div className="text-xs text-muted-foreground">
														{item.subtitle}
													</div>
												</div>
												<Button
													size="sm"
													className="h-7 shrink-0 px-3 text-xs"
													disabled={mapMutation.isPending}
													onClick={() =>
														mapMutation.mutate({
															entityType: item.entityType,
															entityId: item.id,
														})
													}
												>
													Map Here
												</Button>
											</div>
										))}
									</>
								)}

								{/* External results */}
								{searchResults.external.length > 0 && (
									<>
										<div className="bg-muted/30 px-3 py-1.5 text-xs font-medium uppercase text-muted-foreground">
											{contentType === "ebook" ||
											contentType === "audiobook"
												? "From Hardcover"
												: "From TMDB"}
										</div>
										{searchResults.external.map((item) => (
											<div
												key={`ext-${item.foreignId}`}
												className="flex items-center gap-3 border-t border-border px-3 py-2.5"
											>
												<div className="min-w-0 flex-1">
													<div className="text-sm font-medium">
														{item.title}
													</div>
													<div className="text-xs text-muted-foreground">
														{item.subtitle}
													</div>
													<div className="text-xs text-muted-foreground">
														Not in library — will add
													</div>
												</div>
												<Button
													size="sm"
													variant="outline"
													className="h-7 shrink-0 px-3 text-xs"
													disabled={mapMutation.isPending}
												>
													Add & Map
												</Button>
											</div>
										))}
									</>
								)}

								{searchResults.library.length === 0 &&
									searchResults.external.length === 0 && (
										<div className="py-8 text-center text-sm text-muted-foreground">
											No results found
										</div>
									)}
							</>
						)}

						{!searchResults && !isSearching && debouncedSearch.length < 2 && (
							<div className="py-8 text-center text-sm text-muted-foreground">
								Type at least 2 characters to search
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 2: Add `searchLibraryFn` to `src/server/unmapped-files.ts`**

Add this server function for the combined local+external search:

```typescript
const searchLibrarySchema = z.object({
	query: z.string().min(2).max(120),
	contentType: z.string(),
});

type SearchResult = {
	library: Array<{
		id: number;
		title: string;
		subtitle: string;
		entityType: "book" | "movie" | "episode";
	}>;
	external: Array<{
		foreignId: string;
		title: string;
		subtitle: string;
		entityType: "book" | "movie" | "episode";
	}>;
};

export const searchLibraryFn = createServerFn({ method: "GET" })
	.inputValidator((d: unknown) => searchLibrarySchema.parse(d))
	.handler(async ({ data }): Promise<Omit<SearchResult, "external"> & { external: Array<{ foreignId: string; title: string; subtitle: string; entityType: "book" | "movie" | "episode" }> }> => {
		await requireAuth();
		const { books, authors, booksAuthors, movies, episodes, shows } = await import("src/db/schema");

		const library: SearchResult["library"] = [];
		const external: Array<{
			foreignId: string;
			title: string;
			subtitle: string;
			entityType: "book" | "movie" | "episode";
		}> = [];

		const searchPattern = `%${data.query}%`;

		if (data.contentType === "ebook" || data.contentType === "audiobook") {
			// Search local books
			const bookResults = db
				.select({
					id: books.id,
					title: books.title,
					releaseYear: books.releaseYear,
					authorName: booksAuthors.authorName,
				})
				.from(books)
				.leftJoin(booksAuthors, and(eq(booksAuthors.bookId, books.id), eq(booksAuthors.isPrimary, true)))
				.where(like(books.title, searchPattern))
				.limit(10)
				.all();

			for (const book of bookResults) {
				library.push({
					id: book.id,
					title: book.title,
					subtitle: [book.authorName, book.releaseYear]
						.filter(Boolean)
						.join(" · "),
					entityType: "book",
				});
			}
		} else if (data.contentType === "movie") {
			const movieResults = db
				.select({ id: movies.id, title: movies.title, year: movies.year })
				.from(movies)
				.where(like(movies.title, searchPattern))
				.limit(10)
				.all();

			for (const movie of movieResults) {
				library.push({
					id: movie.id,
					title: movie.title,
					subtitle: movie.year ? String(movie.year) : "",
					entityType: "movie",
				});
			}
		} else if (data.contentType === "tv") {
			// Search episodes via show title
			const episodeResults = db
				.select({
					id: episodes.id,
					title: episodes.title,
					seasonNumber: episodes.seasonNumber,
					episodeNumber: episodes.episodeNumber,
					showTitle: shows.title,
				})
				.from(episodes)
				.innerJoin(shows, eq(shows.id, episodes.showId))
				.where(
					or(
						like(episodes.title, searchPattern),
						like(shows.title, searchPattern),
					),
				)
				.limit(10)
				.all();

			for (const ep of episodeResults) {
				library.push({
					id: ep.id,
					title: ep.showTitle,
					subtitle: `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")} - ${ep.title}`,
					entityType: "episode",
				});
			}
		}

		// External search would go here — Hardcover for books, TMDB for movies/TV
		// For now, return empty external results.
		// The full implementation will call searchHardcoverFn / searchTmdbFn
		// and transform results into the external format.

		return { library, external };
	});
```

Note: The external search integration (Hardcover/TMDB) returns empty results for now. This can be enhanced in a follow-up by wiring the existing `searchHardcoverFn` and TMDB search server functions into `searchLibraryFn`. When added, external results return plain data (`foreignId`, `title`, `subtitle`, `entityType`, `addData`) — the client handles the add flow by calling the appropriate add handler (e.g., `createAuthorFn`, `addMovieHandler`) with the `addData` payload before mapping.

Also add `rescanRootFolderFn` for per-folder rescans:

```typescript
const rescanRootFolderSchema = z.object({
	rootFolderPath: z.string().min(1),
});

export const rescanRootFolderFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => rescanRootFolderSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();
		const { rescanRootFolder } = await import("src/server/disk-scan");
		await rescanRootFolder(data.rootFolderPath);
		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true };
	});
```

- [ ] **Step 3: Check if `useDebounce` hook exists, create if needed**

Run: `ls src/hooks/use-debounce.ts 2>/dev/null || echo "needs creation"`

If it needs creation, create `src/hooks/use-debounce.ts`:

```typescript
import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedValue(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);

	return debouncedValue;
}
```

- [ ] **Step 4: Verify the mapping dialog works**

Run: `bun run dev`
Navigate to `/library/unmapped-files`. If there are unmapped files, click "Map" on one and verify:
- Dialog opens with profile selector
- Search field is pre-filled from hints if available
- Typing in search shows local library results

- [ ] **Step 5: Commit**

```bash
git add src/components/unmapped-files/mapping-dialog.tsx src/server/unmapped-files.ts src/hooks/use-debounce.ts
git commit -m "feat: add mapping dialog with library search for unmapped files"
```

---

### Task 9: Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run unit tests**

Run: `bun test`
Expected: All tests pass, including the new hint extractor tests.

- [ ] **Step 2: Run build**

Run: `bun run build`
Expected: Build completes without errors.

- [ ] **Step 3: Manual end-to-end verification**

Start dev server: `bun run dev`

1. Create a download profile with a root folder path pointing to a test directory
2. Put some test files (`.epub`, `.mkv`) in that directory — some in proper structure, some loose
3. Navigate to `/library/unmapped-files`
4. Click "Rescan All"
5. Verify: files in proper structure are matched; loose files appear as unmapped
6. Verify: format badges show correct colors
7. Verify: hints are extracted from filenames
8. Click "Map" on a file → verify dialog opens with pre-filled search
9. Search for a library entry → click "Map Here"
10. Verify: file disappears from unmapped list
11. Click "Ignore" on a file → verify it disappears (reappears with "Show Ignored")
12. Click "Delete" on a file → verify confirmation dialog → confirm → file removed
13. Check sidebar badge shows correct count

- [ ] **Step 4: Commit any fixes from verification**

```bash
git add -A
git commit -m "fix: address issues found during integration verification"
```

Only create this commit if fixes were needed. Skip if everything worked.
