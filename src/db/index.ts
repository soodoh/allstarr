import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const sqlite = new Database(process.env.DATABASE_URL || "data/sqlite.db");
sqlite.run(`PRAGMA journal_mode = ${process.env.SQLITE_JOURNAL_MODE || "WAL"}`);
sqlite.run("PRAGMA foreign_keys = ON");

// When an author is deleted, FK SET NULL nullifies books_authors.author_id.
// Delete those orphaned rows instead of keeping them with NULL author_id.
sqlite.run(`
  CREATE TRIGGER IF NOT EXISTS trg_books_authors_cleanup
  AFTER UPDATE OF author_id ON books_authors
  WHEN NEW.author_id IS NULL AND OLD.author_id IS NOT NULL
  BEGIN
    DELETE FROM books_authors WHERE id = NEW.id;
  END;
`);

// After a books_authors row is deleted, check if the book has any remaining
// local authors. If not, delete the orphaned book (cascades to editions, etc.)
sqlite.run(`
  CREATE TRIGGER IF NOT EXISTS trg_books_orphan_cleanup
  AFTER DELETE ON books_authors
  BEGIN
    DELETE FROM books WHERE id = OLD.book_id
      AND NOT EXISTS (
        SELECT 1 FROM books_authors
        WHERE book_id = OLD.book_id AND author_id IS NOT NULL
      );
  END;
`);

// After a series_book_links row is deleted, remove the series if it has no
// remaining book links.
sqlite.run(`
  CREATE TRIGGER IF NOT EXISTS trg_series_orphan_cleanup
  AFTER DELETE ON series_book_links
  BEGIN
    DELETE FROM series WHERE id = OLD.series_id
      AND NOT EXISTS (
        SELECT 1 FROM series_book_links WHERE series_id = OLD.series_id
      );
  END;
`);

// When FK SET NULL makes both book_id and author_id NULL on a history row,
// the entry has no useful context — delete it.
sqlite.run(`
  CREATE TRIGGER IF NOT EXISTS trg_history_orphan_cleanup
  AFTER UPDATE ON history
  WHEN NEW.book_id IS NULL AND NEW.author_id IS NULL
  BEGIN
    DELETE FROM history WHERE id = NEW.id;
  END;
`);

export const db = drizzle({ client: sqlite, schema });

// Promote existing users with no role to admin (pre-roles migration).
// Guard: only run if the role column exists (i.e., migration has been applied).
const hasRoleCol =
	(
		sqlite
			.query(
				"SELECT COUNT(*) as n FROM pragma_table_info('user') WHERE name = 'role'",
			)
			.get() as { n: number }
	).n > 0;
if (hasRoleCol) {
	sqlite.run(`UPDATE user SET role = 'admin' WHERE role IS NULL;`);
}

// Seed default auth settings if not present
sqlite.run(`
  INSERT OR IGNORE INTO settings (key, value) VALUES ('auth.defaultRole', '"requester"');
`);
