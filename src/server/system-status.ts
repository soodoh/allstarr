import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import {
  rootFolders,
  indexers,
  syncedIndexers,
  downloadClients,
  settings,
} from "src/db/schema";
import { requireAuth } from "./middleware";
import * as fs from "node:fs";
import * as os from "node:os";

export type HealthCheck = {
  source: string;
  type: "warning" | "error";
  message: string;
  wikiUrl: string | null;
};

export type DiskSpaceEntry = {
  path: string;
  label: string;
  freeSpace: number;
  totalSpace: number;
};

export type SystemAbout = {
  version: string;
  nodeVersion: string;
  sqliteVersion: string;
  databasePath: string;
  databaseSize: number;
  osInfo: string;
  isDocker: boolean;
  uptimeSeconds: number;
  startTime: string;
};

export type SystemStatus = {
  health: HealthCheck[];
  diskSpace: DiskSpaceEntry[];
  about: SystemAbout;
};

const startTime = new Date().toISOString();

function runHealthChecks(): HealthCheck[] {
  const checks: HealthCheck[] = [];

  // Check root folders
  const folders = db.select().from(rootFolders).all();
  if (folders.length === 0) {
    checks.push({
      source: "RootFolderCheck",
      type: "warning",
      message:
        "No root folders have been configured. Add at least one root folder in Settings.",
      wikiUrl: "/settings/root-folders",
    });
  } else {
    for (const folder of folders) {
      try {
        // oxlint-disable-next-line no-bitwise -- fs.constants require bitwise OR
        fs.accessSync(folder.path, fs.constants.R_OK | fs.constants.W_OK);
      } catch {
        checks.push({
          source: "RootFolderCheck",
          type: "error",
          message: `Root folder "${folder.path}" is not accessible or does not exist.`,
          wikiUrl: "/settings/root-folders",
        });
      }
    }
  }

  // Check indexers (Prowlarr connection or synced indexers)
  const allIndexers = db.select().from(indexers).all();
  const allSyncedIndexers = db.select().from(syncedIndexers).all();
  if (allIndexers.length === 0 && allSyncedIndexers.length === 0) {
    checks.push({
      source: "IndexerCheck",
      type: "warning",
      message:
        "No indexers have been configured. Add at least one indexer in Settings.",
      wikiUrl: "/settings/indexers",
    });
  }

  // Check download clients
  const allClients = db.select().from(downloadClients).all();
  if (allClients.length === 0) {
    checks.push({
      source: "DownloadClientCheck",
      type: "warning",
      message:
        "No download clients have been configured. Add at least one download client in Settings.",
      wikiUrl: "/settings/download-clients",
    });
  }

  // Check Hardcover token
  const tokenSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "hardcoverToken"))
    .get();
  const hasToken =
    (tokenSetting && tokenSetting.value) || process.env.HARDCOVER_TOKEN;
  if (!hasToken) {
    checks.push({
      source: "HardcoverTokenCheck",
      type: "warning",
      message:
        "No Hardcover API token configured. Search functionality requires a valid token.",
      wikiUrl: "/settings/general",
    });
  }

  return checks;
}

function getDiskSpace(): DiskSpaceEntry[] {
  const folders = db.select().from(rootFolders).all();
  return folders.map((folder) => {
    let freeSpace = folder.freeSpace || 0;
    let totalSpace = folder.totalSpace || 0;
    try {
      const stats = fs.statfsSync(folder.path);
      freeSpace = Number(stats.bfree * stats.bsize);
      totalSpace = Number(stats.blocks * stats.bsize);
    } catch {
      // folder may not exist
    }
    return {
      path: folder.path,
      label: folder.path,
      freeSpace,
      totalSpace,
    };
  });
}

function getAbout(): SystemAbout {
  const dbPath = process.env.DATABASE_URL || "data/sqlite.db";
  let databaseSize = 0;
  try {
    const stat = fs.statSync(dbPath);
    databaseSize = stat.size;
  } catch {
    // file may not exist
  }

  const sqliteVer = (
    db.$client.prepare("SELECT sqlite_version() as v").get() as { v: string }
  ).v;

  const isDocker =
    fs.existsSync("/.dockerenv") ||
    ((): boolean => {
      try {
        return fs.readFileSync("/proc/1/cgroup", "utf8").includes("docker");
      } catch {
        return false;
      }
    })();

  return {
    version: "0.1.0",
    nodeVersion: process.version,
    sqliteVersion: sqliteVer,
    databasePath: dbPath,
    databaseSize,
    osInfo: `${os.type()} ${os.release()} (${os.arch()})`,
    isDocker,
    uptimeSeconds: process.uptime(),
    startTime,
  };
}

export const getSystemStatusFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();

    return {
      health: runHealthChecks(),
      diskSpace: getDiskSpace(),
      about: getAbout(),
    } satisfies SystemStatus;
  },
);
