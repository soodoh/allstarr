// oxlint-disable react-hooks/rules-of-hooks -- Playwright fixture callbacks are not React hooks
// oxlint-disable no-empty-pattern -- Playwright requires empty destructuring for fixtures without dependencies
import { test as base } from "@playwright/test";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createAppServerSpawnConfig } from "./app-runtime";
import { createTestDb, getTestState } from "./test-db";
import type * as schema from "../../src/db/schema";

type AppServer = {
  url: string;
  dbHandle: ReturnType<typeof createTestDb>;
  proc: ChildProcess;
};

type WorkerFixtures = {
  appServer: AppServer;
};

type AppFixtures = {
  appUrl: string;
  db: BetterSQLite3Database<typeof schema>;
  fakeServers: Record<string, string>;
  tempDir: string;
  /** Force a WAL checkpoint so DB writes are visible to the app server (bun:sqlite). */
  checkpoint: () => void;
};

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/login`);
      if (res.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

function noop(): void {
  // Intentional no-op for catch handlers
}

export const test = base.extend<AppFixtures, WorkerFixtures>({
  appServer: [
    async ({}, use, workerInfo) => {
      const dbHandle = createTestDb(`worker-${workerInfo.workerIndex}`);
      const state = getTestState();

      const spawnConfig = createAppServerSpawnConfig({
        workerIndex: workerInfo.workerIndex,
        dbPath: dbHandle.dbPath,
        servers: state.servers,
      });

      const proc = spawn(spawnConfig.command, spawnConfig.args, {
        env: spawnConfig.env,
        cwd: spawnConfig.cwd,
        stdio: "pipe",
      });

      await waitForServer(spawnConfig.url, 60_000);
      await use({ url: spawnConfig.url, dbHandle, proc });
      proc.kill();
      dbHandle.cleanup();
    },
    { scope: "worker", timeout: 120_000 },
  ],

  appUrl: async ({ appServer }, use) => {
    await use(appServer.url);
  },

  db: async ({ appServer }, use) => {
    await use(appServer.dbHandle.db);
  },

  fakeServers: async ({}, use) => {
    await use(getTestState().servers);
  },

  checkpoint: async ({ appServer }, use) => {
    await use(() => appServer.dbHandle.checkpoint());
  },

  tempDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "allstarr-e2e-"));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
});

// Reset fake servers and app caches before each test
test.beforeEach(async ({ appServer }) => {
  // Reset server-side caches (format definitions, etc.)
  await fetch(`${appServer.url}/api/__test-reset`, {
    method: "POST",
  }).catch(noop);

  const state = getTestState();
  await Promise.all(
    Object.values(state.servers).map((url) =>
      fetch(`${url}/__reset`, { method: "POST" }).catch(noop),
    ),
  );
});

export { expect } from "@playwright/test";
