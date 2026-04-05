# Comic Ebook Formats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurpose existing manga download formats and profile into comic ebook formats with a "Comics/Manga" profile.

**Architecture:** Data-only changes — update the seed migration (`0000`) for new databases, create a new data migration (`0024`) for existing databases. No schema changes, no UI changes.

**Tech Stack:** SQLite, Drizzle ORM migrations

---

### Task 1: Update Seed Migration

**Files:**
- Modify: `drizzle/0000_deep_morlun.sql:537-543` (manga formats)
- Modify: `drizzle/0000_deep_morlun.sql:573-575` (manga profile)
- Modify: `drizzle/0000_deep_morlun.sql:628-638` (manga profile items UPDATE)

- [ ] **Step 1: Update manga format INSERT to comic ebook formats**

Change lines 537-543 from:

```sql
-- Download Formats: Manga
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, content_types, no_max_limit, no_preferred_limit) VALUES
  ('Unknown Manga', 1, 0,   500, 500, 'gray',   '["manga"]', 1, 1),
  ('CBR',           2, 0,   200, 50,  'orange', '["manga"]', 0, 0),
  ('CBZ',           3, 0,   200, 50,  'green',  '["manga"]', 0, 0),
  ('PDF',           4, 0,   200, 50,  'yellow', '["manga"]', 0, 0),
  ('EPUB',          5, 0,   200, 50,  'blue',   '["manga"]', 0, 0);
```

To:

```sql
-- Download Formats: Comic
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, content_types, no_max_limit, no_preferred_limit) VALUES
  ('Unknown Comic', 1, 0,   300, 100, 'gray',   '["ebook"]', 1, 1),
  ('CBR',           2, 0,   300, 100, 'orange', '["ebook"]', 0, 0),
  ('CBZ',           3, 0,   300, 100, 'green',  '["ebook"]', 0, 0),
  ('PDF',           4, 0,   300, 100, 'yellow', '["ebook"]', 0, 0),
  ('EPUB',          5, 0,   300, 100, 'blue',   '["ebook"]', 0, 0);
```

- [ ] **Step 2: Update manga profile INSERT to Comics/Manga**

Change lines 573-575 from:

```sql
-- Download Profiles: Manga
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, icon, categories, content_type, language, min_custom_format_score, upgrade_until_custom_format_score) VALUES
  ('Manga', './data/manga', 0, '[]', 0, 'book-open-text', '[]', 'manga', 'en', 0, 0);
```

To:

```sql
-- Download Profiles: Comics/Manga
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, icon, categories, content_type, language, min_custom_format_score, upgrade_until_custom_format_score) VALUES
  ('Comics/Manga', './data/comics', 0, '[]', 0, 'book-open-text', '[]', 'ebook', 'en', 0, 0);
```

- [ ] **Step 3: Update profile items UPDATE query**

Change lines 628-638 from:

```sql
-- Manga profile items (grouped format arrays)
UPDATE download_profiles SET
  items = (
    SELECT json_array(
      json_array((SELECT id FROM download_formats WHERE title = 'CBZ'  AND content_types LIKE '%"manga"%' LIMIT 1)),
      json_array((SELECT id FROM download_formats WHERE title = 'CBR'  AND content_types LIKE '%"manga"%' LIMIT 1)),
      json_array((SELECT id FROM download_formats WHERE title = 'EPUB' AND content_types LIKE '%"manga"%' LIMIT 1)),
      json_array((SELECT id FROM download_formats WHERE title = 'PDF'  AND content_types LIKE '%"manga"%' LIMIT 1))
    )
  )
WHERE name = 'Manga' AND content_type = 'manga';
```

To:

```sql
-- Comics/Manga profile items (grouped format arrays)
UPDATE download_profiles SET
  items = (
    SELECT json_array(
      json_array((SELECT id FROM download_formats WHERE title = 'CBZ'  AND content_types LIKE '%"ebook"%' AND weight = 3 LIMIT 1)),
      json_array((SELECT id FROM download_formats WHERE title = 'CBR'  AND content_types LIKE '%"ebook"%' AND weight = 2 LIMIT 1)),
      json_array((SELECT id FROM download_formats WHERE title = 'EPUB' AND content_types LIKE '%"ebook"%' AND weight = 5 LIMIT 1)),
      json_array((SELECT id FROM download_formats WHERE title = 'PDF'  AND content_types LIKE '%"ebook"%' AND weight = 4 LIMIT 1))
    )
  )
WHERE name = 'Comics/Manga' AND content_type = 'ebook';
```

Note: The `AND weight = N` disambiguates from the existing ebook PDF/EPUB formats (IDs 2,4) which have different weights.

- [ ] **Step 4: Commit**

```bash
git add drizzle/0000_deep_morlun.sql
git commit -m "seed: repurpose manga formats/profile as comic ebook formats"
```

---

### Task 2: Create Data Migration for Existing Databases

**Files:**
- Create: `drizzle/0024_comic_ebook_formats.sql`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Create the migration SQL file**

Create `drizzle/0024_comic_ebook_formats.sql`:

```sql
-- Repurpose manga download formats as comic ebook formats
UPDATE download_formats
SET title = 'Unknown Comic',
    content_types = '["ebook"]',
    max_size = 300,
    preferred_size = 100
WHERE title = 'Unknown Manga' AND content_types LIKE '%"manga"%';--> statement-breakpoint

UPDATE download_formats
SET content_types = '["ebook"]',
    max_size = 300,
    preferred_size = 100
WHERE title = 'CBR' AND content_types LIKE '%"manga"%';--> statement-breakpoint

UPDATE download_formats
SET content_types = '["ebook"]',
    max_size = 300,
    preferred_size = 100
WHERE title = 'CBZ' AND content_types LIKE '%"manga"%';--> statement-breakpoint

UPDATE download_formats
SET content_types = '["ebook"]',
    max_size = 300,
    preferred_size = 100
WHERE title = 'PDF' AND content_types LIKE '%"manga"%';--> statement-breakpoint

UPDATE download_formats
SET content_types = '["ebook"]',
    max_size = 300,
    preferred_size = 100
WHERE title = 'EPUB' AND content_types LIKE '%"manga"%';--> statement-breakpoint

-- Repurpose Manga profile as Comics/Manga ebook profile
UPDATE download_profiles
SET name = 'Comics/Manga',
    root_folder_path = './data/comics',
    content_type = 'ebook'
WHERE name = 'Manga' AND content_type = 'manga';
```

Note: The profile `items` column stores format IDs which don't change, so no items update is needed.

- [ ] **Step 2: Add journal entry**

Add a new entry to the `entries` array in `drizzle/meta/_journal.json`:

```json
{
  "idx": 24,
  "version": "6",
  "when": 1775505600000,
  "tag": "0024_comic_ebook_formats",
  "breakpoints": true
}
```

- [ ] **Step 3: Commit**

```bash
git add drizzle/0024_comic_ebook_formats.sql drizzle/meta/_journal.json
git commit -m "migration: repurpose manga formats/profile as comic ebook formats"
```

---

### Task 3: Run Migration and Verify

- [ ] **Step 1: Run the migration**

```bash
bun run db:migrate
```

Expected: Migration applies cleanly with no errors.

- [ ] **Step 2: Verify formats were updated**

```bash
bun run -e "
import { db } from './src/db';
import { downloadFormats } from './src/db/schema';
import { like } from 'drizzle-orm';
const rows = db.select().from(downloadFormats).where(like(downloadFormats.contentTypes, '%ebook%')).all();
for (const r of rows) console.log(r.id, r.title, r.contentTypes, r.maxSize, r.preferredSize);
"
```

Expected output should include the 5 original ebook formats (IDs 1-5) plus the 5 repurposed comic formats (IDs 30-34 range) — all with `["ebook"]` content type. The comic formats should show `maxSize: 300` and `preferredSize: 100`. No formats should have `manga` content type.

- [ ] **Step 3: Verify profile was updated**

```bash
bun run -e "
import { db } from './src/db';
import { downloadProfiles } from './src/db/schema';
const rows = db.select().from(downloadProfiles).all();
for (const r of rows) console.log(r.id, r.name, r.contentType, r.rootFolderPath);
"
```

Expected: A profile named "Comics/Manga" with `contentType: 'ebook'` and `rootFolderPath: './data/comics'`. No profile should have `manga` content type.

- [ ] **Step 4: Commit any adjustments if needed**
