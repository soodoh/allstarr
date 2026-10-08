// oxlint-disable react-hooks/rules-of-hooks -- Playwright fixture callbacks are not React hooks
// oxlint-disable no-empty-pattern -- Playwright requires empty destructuring for fixtures without dependencies

import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base } from "@playwright/test";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../../src/db/schema";
import {
	createDiagnosticBuffer,
	type DiagnosticEvent,
	formatDiagnosticLine,
	timeDiagnosticOperation,
} from "../helpers/diagnostics";
import { startAppServer, stopAppServer } from "./app-process";
import { createAppServerSpawnConfig } from "./app-runtime";
import {
	ALL_REQUIRED_SERVICES,
	createFakeServerManager,
	type FakeServerManager,
	type ServiceName,
} from "./fake-servers/manager";
import { createTestDb } from "./test-db";

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

const diagnosticBuffer = createDiagnosticBuffer(300);

function recordDiagnostic(
	event: DiagnosticEvent,
	options?: { print?: boolean },
): void {
	diagnosticBuffer.record(event);
	if (options?.print ?? true) {
		console.info(formatDiagnosticLine(event));
	}
}

function recordProcessOutput(stream: "stderr" | "stdout", chunk: Buffer): void {
	for (const line of chunk.toString().split(/\r?\n/)) {
		const output = line.trim();
		if (!output) {
			continue;
		}
		recordDiagnostic(
			{
				scope: "app",
				event: "process-output",
				status: "info",
				fields: { stream, output: output.slice(0, 500) },
			},
			{ print: false },
		);
	}
}

export const test = base.extend<AppFixtures, WorkerFixtures>({
	requiredServices: [ALL_REQUIRED_SERVICES, { option: true, scope: "worker" }],
	fakeServerScenario: [null, { option: true, scope: "worker" }],

	serviceManager: [
		async ({ requiredServices, fakeServerScenario }, use) => {
			const manager = createFakeServerManager(requiredServices, {
				...(fakeServerScenario ? { scenarioName: fakeServerScenario } : {}),
			});
			try {
				await manager.start();
				await use(manager);
			} finally {
				await manager.stop();
			}
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

			recordDiagnostic({
				scope: "app",
				event: "spawn",
				status: "info",
				fields: {
					workerIndex: workerInfo.workerIndex,
					command: spawnConfig.command,
					argsCount: spawnConfig.args.length,
					url: spawnConfig.url,
					dbFile: dbHandle.dbPath.split("/").at(-1),
				},
			});

			let proc: ChildProcess | undefined;
			try {
				proc = await timeDiagnosticOperation(
					{
						scope: "app",
						event: "startup",
						fields: {
							workerIndex: workerInfo.workerIndex,
							url: spawnConfig.url,
						},
					},
					() =>
						startAppServer(spawnConfig, {
							onOutput: recordProcessOutput,
							onDiagnostic: recordDiagnostic,
						}),
				);
				await use({ url: spawnConfig.url, dbHandle, proc });
			} catch (error) {
				const diagnostics = diagnosticBuffer.toText();
				throw new Error(
					[
						error instanceof Error ? error.message : String(error),
						diagnostics ? "Recent e2e diagnostics:" : undefined,
						diagnostics || undefined,
					]
						.filter(Boolean)
						.join("\n"),
					{ cause: error },
				);
			} finally {
				if (proc) {
					await stopAppServer(proc);
				}
				dbHandle.cleanup();
			}
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

	tempDir: async ({ requiredServices: _requiredServices }, use) => {
		const dir = mkdtempSync(join(tmpdir(), "allstarr-e2e-"));
		await use(dir);
		rmSync(dir, { recursive: true, force: true });
	},
});

// Reset fake servers and app caches before each test
test.beforeEach(async ({ appServer, serviceManager }, testInfo) => {
	const resetStartedAt = Date.now();
	try {
		const resetResponse = await fetch(`${appServer.url}/api/__test-reset`, {
			method: "POST",
		});
		recordDiagnostic({
			scope: "app",
			event: "test-reset",
			status: resetResponse.ok ? "ok" : "error",
			elapsedMs: Date.now() - resetStartedAt,
			fields: {
				testTitle: testInfo.title,
				workerIndex: testInfo.workerIndex,
				path: "/api/__test-reset",
				statusCode: resetResponse.status,
				statusText: resetResponse.statusText,
			},
		});
		if (!resetResponse.ok) {
			throw new Error(
				`App test reset failed: ${resetResponse.status} ${resetResponse.statusText}`,
			);
		}
	} catch (error) {
		recordDiagnostic({
			scope: "app",
			event: "test-reset",
			status: "error",
			elapsedMs: Date.now() - resetStartedAt,
			fields: {
				testTitle: testInfo.title,
				workerIndex: testInfo.workerIndex,
				path: "/api/__test-reset",
				error: error instanceof Error ? error.message : String(error),
			},
		});
		throw error;
	}

	const fakeResetStartedAt = Date.now();
	try {
		await serviceManager.reset();
		recordDiagnostic(
			{
				scope: "fake-service",
				event: "reset-all",
				status: "ok",
				elapsedMs: Date.now() - fakeResetStartedAt,
				fields: {
					testTitle: testInfo.title,
					workerIndex: testInfo.workerIndex,
				},
			},
			{ print: false },
		);
	} catch (error) {
		recordDiagnostic({
			scope: "fake-service",
			event: "reset-all",
			status: "error",
			elapsedMs: Date.now() - fakeResetStartedAt,
			fields: {
				testTitle: testInfo.title,
				workerIndex: testInfo.workerIndex,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		throw error;
	}
});

test.afterEach(async ({ requiredServices: _requiredServices }, testInfo) => {
	if (testInfo.status !== testInfo.expectedStatus) {
		await testInfo.attach("e2e-diagnostics", {
			body: diagnosticBuffer.toText() || "No e2e diagnostics captured.",
			contentType: "text/plain",
		});
	}
	diagnosticBuffer.clear();
});

export { expect } from "@playwright/test";
