import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { copyFileSync, unlinkSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as schema from "../../src/db/schema";

const STATE_FILE = join(import.meta.dirname, "..", ".test-state.json");

export type TestDbHandle = {
  db: BetterSQLite3Database<typeof schema>;
  dbPath: string;
  close: () => void;
  cleanup: () => void;
};

export function getTestState(): {
  templateDbPath: string;
  servers: Record<string, string>;
} {
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

export function createTestDb(suiteId: string): TestDbHandle {
  const { templateDbPath } = getTestState();
  const dbPath = join(
    import.meta.dirname,
    "..",
    "..",
    "data",
    `test-${suiteId}-${Date.now()}.db`,
  );
  copyFileSync(templateDbPath, dbPath);

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  return {
    db,
    dbPath,
    close: () => sqlite.close(),
    cleanup: () => {
      sqlite.close();
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    },
  };
}
