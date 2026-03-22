import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { writeFileSync, existsSync, unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import PORTS from "./ports";

import createQBittorrentServer from "./fixtures/fake-servers/qbittorrent";
import createTransmissionServer from "./fixtures/fake-servers/transmission";
import createDelugeServer from "./fixtures/fake-servers/deluge";
import createRTorrentServer from "./fixtures/fake-servers/rtorrent";
import createSABnzbdServer from "./fixtures/fake-servers/sabnzbd";
import createNZBGetServer from "./fixtures/fake-servers/nzbget";
import createNewznabServer from "./fixtures/fake-servers/newznab";
import createProwlarrServer from "./fixtures/fake-servers/prowlarr";
import createHardcoverServer from "./fixtures/fake-servers/hardcover";

const PROJECT_ROOT = join(import.meta.dirname, "..");
const TEMPLATE_DB_PATH = join(PROJECT_ROOT, "data", "test-template.db");
const STATE_FILE = join(import.meta.dirname, ".test-state.json");

async function killPortListeners(): Promise<void> {
  const ports = Object.values(PORTS).filter(
    (v) => typeof v === "number" && v !== PORTS.APP_BASE,
  );
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
      "INSERT INTO download_formats (id, title, weight, color, specifications) VALUES",
      "(1, 'Unknown', 1, 'gray', '[]'),",
      `(2, 'PDF', 2, 'red', '[{"type":"releaseTitle","value":"\\\\bpdf\\\\b","negate":false,"required":true}]'),`,
      `(3, 'MOBI', 3, 'orange', '[{"type":"releaseTitle","value":"\\\\bmobi\\\\b","negate":false,"required":true}]'),`,
      `(4, 'EPUB', 4, 'green', '[{"type":"releaseTitle","value":"\\\\bepub\\\\b","negate":false,"required":true}]'),`,
      `(5, 'AZW3', 5, 'blue', '[{"type":"releaseTitle","value":"\\\\bazw3\\\\b","negate":false,"required":true}]'),`,
      `(6, 'MP3', 6, 'purple', '[{"type":"releaseTitle","value":"\\\\bmp3\\\\b","negate":false,"required":true}]'),`,
      `(7, 'M4B', 7, 'pink', '[{"type":"releaseTitle","value":"\\\\bm4b\\\\b","negate":false,"required":true}]'),`,
      `(8, 'FLAC', 8, 'indigo', '[{"type":"releaseTitle","value":"\\\\bflac\\\\b","negate":false,"required":true}]')`,
    ].join("\n"),
  );
  templateDb.pragma("wal_checkpoint(TRUNCATE)");
  templateDb.close();

  // Remove WAL/SHM files so copies start fresh
  for (const suffix of ["-wal", "-shm"]) {
    const walPath = TEMPLATE_DB_PATH + suffix;
    if (existsSync(walPath)) {
      unlinkSync(walPath);
    }
  }

  // 2. Start all fake servers
  const servers = {
    qbittorrent: createQBittorrentServer(PORTS.QBITTORRENT),
    transmission: createTransmissionServer(PORTS.TRANSMISSION),
    deluge: createDelugeServer(PORTS.DELUGE),
    rtorrent: createRTorrentServer(PORTS.RTORRENT),
    sabnzbd: createSABnzbdServer(PORTS.SABNZBD),
    nzbget: createNZBGetServer(PORTS.NZBGET),
    newznab: createNewznabServer(PORTS.NEWZNAB),
    prowlarr: createProwlarrServer(PORTS.PROWLARR),
    hardcover: createHardcoverServer(PORTS.HARDCOVER),
  };

  // 3. Write state file for test fixtures to read
  writeFileSync(
    STATE_FILE,
    JSON.stringify({
      templateDbPath: TEMPLATE_DB_PATH,
      servers: Object.fromEntries(
        Object.entries(PORTS)
          .filter(([k]) => k !== "APP_BASE")
          .map(([k, v]) => [k, `http://localhost:${v}`]),
      ),
    }),
  );

  // Store server refs on globalThis for teardown
  (globalThis as Record<string, unknown>).__fakeServers = servers;
}

export default globalSetup;
