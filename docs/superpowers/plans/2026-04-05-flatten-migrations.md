# Flatten Database Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate 28 Drizzle migration files into a single initial migration with all seed data, preserving local auth/user data.

**Architecture:** Delete all migration files, regenerate a single DDL migration from the current Drizzle schema, append consolidated seed INSERT/UPDATE statements representing the final intended state, then fix the local `__drizzle_migrations` tracking table.

**Tech Stack:** Drizzle ORM, drizzle-kit, SQLite (bun:sqlite), Bun

---

### Task 1: Save seed SQL to a temporary file

Before deleting migration files, extract and consolidate all seed data into a single file. This represents the **final state** after all historical migrations, with duplications resolved.

**Files:**
- Read: `drizzle/0000_deep_morlun.sql` (lines 522-690)
- Read: `drizzle/0005_stiff_lila_cheney.sql` (lines 1-145)
- Read: `drizzle/0017_jazzy_enchantress.sql` (lines 4-18, for scheduled_tasks final names/groups)
- Create: `drizzle/_seed.sql` (temporary, will be appended to the generated migration)

- [ ] **Step 1: Create the consolidated seed SQL file**

Write the following to `drizzle/_seed.sql`. This is the final-state seed data with all historical changes applied inline.

**Section 1 — Download Formats:**

Copy lines 522-566 verbatim from `drizzle/0000_deep_morlun.sql`. This includes:
- Ebook formats (5 rows): Unknown Text, PDF, MOBI, EPUB, AZW3
- Audiobook formats (4 rows): Unknown Audio, MP3, M4B, FLAC
- Comic formats (5 rows): Unknown Comic, CBR, CBZ, PDF, EPUB
- Video formats (20 rows): SDTV through Remux-2160p

Do NOT include manga formats from `0013_manga_formats_profile.sql` — they were converted back to comic/ebook in migration 0024 and would duplicate the comic formats already in 0000.

**Section 2 — Download Profiles:**

Copy lines 568-582 from `drizzle/0000_deep_morlun.sql` (Ebook, Audiobook, Comics/Manga, video profiles).

Then add this INSERT for the missing Anime 1080p profile (which was never created by any prior migration):

```sql
--> statement-breakpoint

-- Download Profile: Anime 1080p (was missing from original migrations)
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, icon, categories, content_type, language, min_custom_format_score, upgrade_until_custom_format_score) VALUES
  ('Anime 1080p', './data/tv_shows/anime/', 0, '[]', 1, 'tv', '[5030,5040,5045]', 'tv', 'en', 0, 5000);
```

Do NOT include the Manga profile from `0013_manga_formats_profile.sql` — it was renamed to Comics/Manga in 0024 and would duplicate the one from 0000.

**Section 3 — Profile items (UPDATE statements):**

Copy lines 584-638 from `drizzle/0000_deep_morlun.sql` (UPDATE statements that set cutoff/items for video profiles and Comics/Manga profile using subqueries).

Then append lines 1-19 from `drizzle/0005_stiff_lila_cheney.sql` (UPDATE that sets cutoff/items for Anime 1080p profile).

Do NOT include the manga profile items UPDATE from `0013_manga_formats_profile.sql`.

**Section 4 — Scheduled Tasks:**

Replace the original INSERT from 0000 with this consolidated version that includes the `group` column and the renamed `refresh-hardcover-metadata` task (changes from migration 0017):

```sql
--> statement-breakpoint

-- Scheduled Tasks (final state with groups from migration 0017)
INSERT INTO scheduled_tasks (id, name, interval, enabled, "group") VALUES
  ('rss-sync',                   'RSS Sync',                   900,    1, 'search'),
  ('refresh-hardcover-metadata', 'Refresh Hardcover Metadata', 43200,  1, 'metadata'),
  ('check-health',               'Check Health',               1500,   1, 'maintenance'),
  ('housekeeping',               'Housekeeping',               86400,  1, 'maintenance'),
  ('backup',                     'Backup Database',            604800, 1, 'maintenance'),
  ('rescan-folders',             'Rescan Folders',             21600,  1, 'media'),
  ('refresh-downloads',          'Refresh Downloads',          60,     1, 'media'),
  ('refresh-tmdb-metadata',      'Refresh TMDB Metadata',      43200,  1, 'metadata');
```

**Section 5 — Settings:**

Copy lines 651-690 from `drizzle/0000_deep_morlun.sql` (all settings key/value pairs, unchanged).

**Section 6 — Custom Formats:**

Copy lines 20-97 from `drizzle/0005_stiff_lila_cheney.sql` (all `INSERT INTO custom_formats` statements, ~40 rows). These are all the builtin anime custom formats. Copy verbatim — no changes needed.

**Section 7 — Profile Custom Formats:**

Copy lines 98-145 from `drizzle/0005_stiff_lila_cheney.sql` (the `INSERT INTO profile_custom_formats` with the CASE/WHEN score mapping for the Anime 1080p profile). Copy verbatim.

- [ ] **Step 2: Verify the seed file**

Quickly scan `drizzle/_seed.sql` and verify:
- All `INSERT` statements use `--> statement-breakpoint` between them (required by Drizzle migration runner)
- No references to manga content_type or manga profile
- The scheduled_tasks INSERT includes the `"group"` column
- The Anime 1080p profile INSERT exists
- No duplicate Comics/Manga profile

---

### Task 2: Delete existing migrations and regenerate

**Files:**
- Delete: all files in `drizzle/` except `drizzle/_seed.sql`
- Create: `drizzle/0000_initial.sql` (generated by drizzle-kit)
- Create: `drizzle/meta/_journal.json` (generated by drizzle-kit)
- Create: `drizzle/meta/0000_snapshot.json` (generated by drizzle-kit)

- [ ] **Step 1: Delete all existing migration files and metadata**

```bash
# Remove all .sql files except _seed.sql, and the entire meta/ directory
find drizzle -name '*.sql' ! -name '_seed.sql' -delete
rm -rf drizzle/meta
```

- [ ] **Step 2: Generate a single DDL migration from the current schema**

```bash
bun run db:generate
```

This produces a single migration file (e.g., `drizzle/0000_<name>.sql`) containing all CREATE TABLE and CREATE INDEX statements from the current Drizzle schema. Note the exact filename that is generated — you'll need it in Task 3.

- [ ] **Step 3: Verify the generated migration**

Confirm the generated migration:
- Contains CREATE TABLE statements for all tables (authors, books, book_files, download_profiles, download_formats, scheduled_tasks, settings, custom_formats, profile_custom_formats, user, session, account, verification, history, etc.)
- Contains CREATE INDEX / CREATE UNIQUE INDEX statements
- Does NOT contain any INSERT statements (DDL only)
- The `drizzle/meta/_journal.json` has exactly one entry

---

### Task 3: Append seed data to the generated migration

**Files:**
- Modify: `drizzle/0000_<generated-name>.sql`
- Delete: `drizzle/_seed.sql`

- [ ] **Step 1: Append seed SQL to the generated migration**

```bash
cat drizzle/_seed.sql >> drizzle/0000_<generated-name>.sql
```

Replace `<generated-name>` with the actual filename from Task 2.

- [ ] **Step 2: Delete the temporary seed file**

```bash
rm drizzle/_seed.sql
```

- [ ] **Step 3: Verify the final migration**

Read the combined migration file and verify:
- DDL (CREATE TABLE) statements come first
- Seed INSERT/UPDATE statements follow
- All sections separated by `--> statement-breakpoint`
- File is valid SQL

---

### Task 4: Fix local migration tracking

The local database already has all tables and data — we just need to tell Drizzle that the new single migration has already been applied.

**Files:**
- None (direct DB operations)

- [ ] **Step 1: Read the new migration's hash from the journal**

```bash
bun -e "
const journal = require('./drizzle/meta/_journal.json');
console.log('Tag:', journal.entries[0].tag);
console.log('When:', journal.entries[0].when);
"
```

Note the `tag` and `when` values.

- [ ] **Step 2: Compute the migration hash**

Drizzle computes the hash as SHA-256 of the migration SQL content. Compute it:

```bash
bun -e "
const fs = require('fs');
const crypto = require('crypto');
const sql = fs.readFileSync('drizzle/0000_<generated-name>.sql', 'utf-8');
const hash = crypto.createHash('sha256').update(sql).digest('hex');
console.log('Hash:', hash);
"
```

- [ ] **Step 3: Update the local __drizzle_migrations table**

```bash
bun -e "
const { Database } = require('bun:sqlite');
const fs = require('fs');
const crypto = require('crypto');

const db = new Database(process.env.DATABASE_URL || 'data/sqlite.db');
const sql = fs.readFileSync('drizzle/0000_<generated-name>.sql', 'utf-8');
const hash = crypto.createHash('sha256').update(sql).digest('hex');
const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json', 'utf-8'));
const when = journal.entries[0].when;

// Clear all existing migration entries
db.run('DELETE FROM __drizzle_migrations');

// Insert single entry for the new migration
db.run('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', [hash, when]);

// Verify
const rows = db.prepare('SELECT * FROM __drizzle_migrations').all();
console.log('Migration entries:', JSON.stringify(rows, null, 2));
console.log('Count:', rows.length, '(should be 1)');
"
```

- [ ] **Step 4: Verify drizzle-kit sees no pending migrations**

```bash
bun run db:migrate
```

Expected output: no migrations to run (the single migration is already marked as applied).

---

### Task 5: Verify data integrity

- [ ] **Step 1: Verify auth data is intact**

```bash
bun -e "
const { Database } = require('bun:sqlite');
const db = new Database(process.env.DATABASE_URL || 'data/sqlite.db');
const users = db.prepare('SELECT id, name, email FROM user').all();
console.log('Users:', JSON.stringify(users, null, 2));
const sessions = db.prepare('SELECT count(*) as c FROM session').get();
console.log('Sessions:', sessions.c);
"
```

Verify the user accounts and sessions are intact.

- [ ] **Step 2: Verify seed data tables**

```bash
bun -e "
const { Database } = require('bun:sqlite');
const db = new Database(process.env.DATABASE_URL || 'data/sqlite.db');
console.log('download_formats:', db.prepare('SELECT count(*) as c FROM download_formats').get());
console.log('download_profiles:', db.prepare('SELECT count(*) as c FROM download_profiles').get());
console.log('scheduled_tasks:', db.prepare('SELECT count(*) as c FROM scheduled_tasks').get());
console.log('settings:', db.prepare('SELECT count(*) as c FROM settings').get());
console.log('custom_formats:', db.prepare('SELECT count(*) as c FROM custom_formats').get());
console.log('profile_custom_formats:', db.prepare('SELECT count(*) as c FROM profile_custom_formats').get());
"
```

- [ ] **Step 3: Start the dev server**

```bash
bun run dev
```

Verify the app starts without errors. The runtime seeder in `src/db/index.ts` should detect existing custom formats and skip re-inserting them.

- [ ] **Step 4: Commit**

```bash
git add drizzle/
git commit -m "chore: flatten 28 migrations into single initial migration

Consolidate all Drizzle migration files into one migration containing
DDL + seed data. Deduplicates comic/manga format overlap and adds
missing Anime 1080p download profile.

No schema changes - this is a migration history reset for a dev-only project."
```
