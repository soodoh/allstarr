import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { writeFileSync, existsSync, unlinkSync } from "node:fs";
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

async function globalSetup(): Promise<void> {
  // 1. Create template DB via drizzle-kit push
  if (existsSync(TEMPLATE_DB_PATH)) {
    unlinkSync(TEMPLATE_DB_PATH);
  }

  execFileSync("bun", ["run", "db:push"], {
    cwd: PROJECT_ROOT,
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: TEMPLATE_DB_PATH },
  });

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
