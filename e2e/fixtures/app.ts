// oxlint-disable react-hooks/rules-of-hooks -- Playwright fixture callbacks are not React hooks
// oxlint-disable no-empty-pattern -- Playwright requires empty destructuring for fixtures without dependencies
import { test as base } from "@playwright/test";
import { addCoverageReport } from "monocart-reporter";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createAppServerSpawnConfig } from "./app-runtime";
import {
	ALL_REQUIRED_SERVICES,
	createFakeServerManager,
	type FakeServerManager,
	type ServiceName,
} from "./fake-servers/manager";
import { createTestDb } from "./test-db";
import type * as schema from "../../src/db/schema";

type AppServer = {
  url: string;
  dbHandle: ReturnType<typeof createTestDb>;
  proc: ChildProcess;
};

type WorkerFixtures = {
  appServer: AppServer;
  fakeServerScenario: string | null;
  serviceManager: FakeServerManager;
  requiredServices: ServiceName[];
};

type AppFixtures = {
  appUrl: string;
  db: BetterSQLite3Database<typeof schema>;
  fakeServers: Partial<Record<ServiceName, string>>;
  setFakeServerScenario: (scenarioName: string) => Promise<void>;
  setFakeServiceState: (
    serviceName: ServiceName,
    stateName: string | null,
    replacements?: Record<string, boolean | number | string>,
  ) => Promise<void>;
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
	requiredServices: [ALL_REQUIRED_SERVICES, { option: true, scope: "worker" }],
	fakeServerScenario: [null, { option: true, scope: "worker" }],

	serviceManager: [
		async ({ requiredServices, fakeServerScenario }, use) => {
			const manager = createFakeServerManager(requiredServices, {
				...(fakeServerScenario ? { scenarioName: fakeServerScenario } : {}),
			});
			await manager.start();
			await use(manager);
			await manager.stop();
		},
		{ scope: "worker" },
	],

	appServer: [
		async ({ serviceManager }, use, workerInfo) => {
			const dbHandle = createTestDb(`worker-${workerInfo.workerIndex}`);
			const hardcoverBase =
				serviceManager.getUrls().HARDCOVER ?? "http://127.0.0.1:9";
			const tmdbBase = serviceManager.getUrls().TMDB ?? "http://127.0.0.1:9";

			const spawnConfig = createAppServerSpawnConfig({
				workerIndex: workerInfo.workerIndex,
				dbPath: dbHandle.dbPath,
				servers: {
					HARDCOVER: hardcoverBase,
					TMDB: tmdbBase,
				},
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

	fakeServers: async ({ serviceManager }, use) => {
		await use(serviceManager.getUrls());
	},

	setFakeServerScenario: async ({ serviceManager }, use) => {
		await use(async (scenarioName: string) => {
			await serviceManager.setScenario(scenarioName);
		});
	},

	setFakeServiceState: async ({ serviceManager }, use) => {
		await use(
			async (
				serviceName: ServiceName,
				stateName: string | null,
				replacements?: Record<string, boolean | number | string>,
			) => {
				await serviceManager.setServiceState(
					serviceName,
					stateName,
					replacements,
				);
			},
		);
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
test.beforeEach(async ({ appServer, serviceManager }) => {
	await fetch(`${appServer.url}/api/__test-reset`, {
		method: "POST",
	}).catch(noop);

	await serviceManager.reset();
});

// Client-side JS coverage collection via CDP
test.beforeEach(async ({ page }) => {
	if (process.env.COLLECT_COVERAGE === "true") {
		await page.coverage.startJSCoverage({ resetOnNavigation: false });
	}
});

test.afterEach(async ({ page }, testInfo) => {
	if (process.env.COLLECT_COVERAGE === "true") {
		const coverage = await page.coverage.stopJSCoverage();
		await addCoverageReport(coverage, testInfo);
	}
});

export { expect } from "@playwright/test";
