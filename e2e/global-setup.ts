import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import PORTS from "./ports";

const PROJECT_ROOT = join(import.meta.dirname, "..");
const TEMPLATE_DB_PATH = join(PROJECT_ROOT, "data", "test-template.db");
const STATE_FILE = join(import.meta.dirname, ".test-state.json");

async function killPortListeners(): Promise<void> {
  // Include app server ports (19100+) in cleanup to kill leftover dev servers
  const ports: number[] = [...Object.values(PORTS)];
  // Also clean up potential worker ports (19100-19106)
  for (let i = 0; i < 7; i += 1) {
    ports.push(PORTS.APP_BASE + i);
  }
  for (const port of ports) {
    try {
      const { execFileSync: efs } = await import("node:child_process");
      const pids = efs("lsof", ["-ti", `:${String(port)}`], {
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {
          // Process may already be gone
        }
      }
    } catch {
      // No listeners on this port
    }
  }
}

async function globalSetup(): Promise<void> {
  // 0. Kill any orphan listeners from previous runs
  await killPortListeners();

  // 1. Create template DB via drizzle-kit push
  mkdirSync(dirname(TEMPLATE_DB_PATH), { recursive: true });
  if (existsSync(TEMPLATE_DB_PATH)) {
    unlinkSync(TEMPLATE_DB_PATH);
  }

  execFileSync("bun", ["run", "db:push"], {
    cwd: PROJECT_ROOT,
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: TEMPLATE_DB_PATH },
  });

  // 1b. Seed download format definitions and checkpoint to main DB file.
  // db:push may create the DB in WAL mode; checkpointing ensures the copy
  // (which only copies the main file) includes the seeded data.
  const templateDb = new Database(TEMPLATE_DB_PATH);
  templateDb.pragma("journal_mode = DELETE");
  templateDb.exec(
    [
      "INSERT INTO download_formats (id, title, weight, color) VALUES",
      "(1, 'Unknown', 1, 'gray'),",
      "(2, 'PDF', 2, 'red'),",
      "(3, 'MOBI', 3, 'orange'),",
      "(4, 'EPUB', 4, 'green'),",
      "(5, 'AZW3', 5, 'blue'),",
      "(6, 'MP3', 6, 'purple'),",
      "(7, 'M4B', 7, 'pink'),",
      "(8, 'FLAC', 8, 'indigo')",
    ].join("\n"),
  );
  templateDb.pragma("wal_checkpoint(TRUNCATE)");
  templateDb.close();

  // 2. Write state file for test fixtures to read
  writeFileSync(
    STATE_FILE,
    JSON.stringify({
      templateDbPath: TEMPLATE_DB_PATH,
    }),
  );
}

export default globalSetup;
