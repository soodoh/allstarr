// oxlint-disable react-hooks/rules-of-hooks -- Playwright fixture callbacks are not React hooks
// oxlint-disable no-empty-pattern -- Playwright requires empty destructuring for fixtures without dependencies
import { test as base } from "@playwright/test";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import PORTS from "../ports";
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
      const port = PORTS.APP_BASE + workerInfo.workerIndex;
      const dbHandle = createTestDb(`worker-${workerInfo.workerIndex}`);
      const state = getTestState();

      const proc = spawn(
        "bun",
        ["--bun", "vite", "dev", "--port", String(port)],
        {
          env: {
            ...process.env,
            DATABASE_URL: dbHandle.dbPath,
            HARDCOVER_GRAPHQL_URL: `${state.servers.HARDCOVER}/v1/graphql`,
            BETTER_AUTH_SECRET: "test-secret-for-e2e",
            BETTER_AUTH_URL: `http://localhost:${port}`,
            HARDCOVER_TOKEN: "Bearer test-hardcover-token",
            SQLITE_JOURNAL_MODE: "DELETE",
            PORT: String(port),
          },
          cwd: join(import.meta.dirname, "..", ".."),
          stdio: "pipe",
        },
      );

      await waitForServer(`http://localhost:${port}`, 30_000);
      await use({ url: `http://localhost:${port}`, dbHandle, proc });
      proc.kill();
      dbHandle.cleanup();
    },
    { scope: "worker", timeout: 60_000 },
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
