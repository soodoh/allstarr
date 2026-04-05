# Flatten Database Migrations

## Goal

Consolidate all 28 Drizzle migration files into a single initial migration. The project is in development with no external users, so there's no need to maintain incremental migration history. The local database (including auth/user data) must be preserved.

## Approach

### 1. Delete all existing migration files

Remove everything in `drizzle/` — all `.sql` files, `meta/` snapshots, and `_journal.json`.

### 2. Generate a single DDL migration

Run `bun run db:generate` to produce one migration file from the current Drizzle schema. This captures the final table structure without any of the intermediate ALTER/rename steps.

### 3. Append consolidated seed data

`drizzle-kit generate` only produces DDL (CREATE TABLE). The following seed data must be manually appended to the generated migration, representing the **final intended state** (not a replay of historical changes):

**download_formats** (~34 rows):
- Ebook: Unknown Text, PDF, MOBI, EPUB, AZW3
- Audiobook: Unknown Audio, MP3, M4B, FLAC
- Comic (ebook): Unknown Comic, CBR, CBZ, PDF, EPUB
- Video (movie/tv): 20 formats from SDTV through Remux-2160p

**download_profiles** (8 profiles):
- Ebook, Audiobook, Comics/Manga (one profile, deduplicated from manga migration history)
- 1080p (TV), 4k (TV), Anime 1080p, 720-1080p (Movie), 4k (Movie)
- Anime 1080p was never created by any prior migration (bug fix) — the profile_custom_formats links from 0005 silently failed because the profile didn't exist
- Each with final cutoff/items values using subqueries against download_formats

**scheduled_tasks** (8 rows):
- Uses final names and groups from migration 0017 (e.g., `refresh-hardcover-metadata` not `refresh-metadata`, correct `group` values)

**settings** (~30 rows):
- All key/value pairs (general, metadata, format, naming, mediaManagement)

**custom_formats** (~40 rows):
- All builtin custom formats (anime BD/web tiers, streaming services, quality markers)
- Also seeded at runtime by `seedBuiltinCustomFormats()` in `src/db/index.ts` — migration inclusion ensures they exist immediately for fresh installs

**profile_custom_formats**:
- Links between Anime profiles and their custom format scores

### 4. Fix local migration tracking

Run SQL directly against the local database to:
1. Clear the `__drizzle_migrations` table
2. Insert one row marking the new single migration as already applied

This tells Drizzle "this migration has already run" so it won't try to create tables that already exist. No actual table data is modified.

## Cleanup: Manga/Comic duplication

The migration history created a duplication:
- Migration 0000 added comic download_formats + a "Comics/Manga" profile
- Migration 0013 added manga download_formats + a "Manga" profile
- Migration 0024 converted the manga formats/profile back to comic/ebook

The flattened migration will have **one clean set** of comic formats and **one** Comics/Manga profile, eliminating the duplication.

## What stays untouched

- Auth tables (`user`, `session`, `account`, `verification`) and all their data
- All application data (authors, books, editions, book_files, history, etc.)
- Runtime triggers in `src/db/index.ts` (created with `IF NOT EXISTS`)
- Runtime custom format seeder (will no-op since formats already exist)
