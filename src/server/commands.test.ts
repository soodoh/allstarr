import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const commandsMocks = vi.hoisted(() => ({
	acquireJobRun: vi.fn(),
	completeJobRun: vi.fn(),
	emit: vi.fn(),
	failJobRun: vi.fn(),
	heartbeatJobRun: vi.fn(),
	listActiveJobRuns: vi.fn(),
	logError: vi.fn(),
	requireAuth: vi.fn(),
	rejectDbUse: vi.fn(() => {
		throw new Error("commands.ts should route command state through job-runs");
	}),
	updateJobRunProgress: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
	}),
}));

vi.mock("src/db", () => ({
	db: new Proxy({}, { get: () => commandsMocks.rejectDbUse }),
}));

vi.mock("src/db/schema", () => ({
	activeAdhocCommands: {
		body: "activeAdhocCommands.body",
		commandType: "activeAdhocCommands.commandType",
		id: "activeAdhocCommands.id",
	},
}));

vi.mock("./event-bus", () => ({
	eventBus: {
		emit: commandsMocks.emit,
	},
}));

vi.mock("./logger", () => ({
	logError: commandsMocks.logError,
}));

vi.mock("./middleware", () => ({
	requireAuth: commandsMocks.requireAuth,
}));

vi.mock("./job-runs", () => ({
	acquireJobRun: commandsMocks.acquireJobRun,
	completeJobRun: commandsMocks.completeJobRun,
	failJobRun: commandsMocks.failJobRun,
	heartbeatJobRun: commandsMocks.heartbeatJobRun,
	JOB_HEARTBEAT_INTERVAL_MS: 10_000,
	listActiveJobRuns: commandsMocks.listActiveJobRuns,
	updateJobRunProgress: commandsMocks.updateJobRunProgress,
}));

import { getActiveCommandsFn, submitCommand } from "./commands";

describe("commands server helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		commandsMocks.acquireJobRun.mockReturnValue({ id: 42 });
		commandsMocks.listActiveJobRuns.mockReturnValue([]);
	});

	it("rejects duplicate commands that share the dedupe key value", () => {
		const handler = vi.fn(async () => ({}));
		commandsMocks.acquireJobRun.mockImplementation(() => {
			throw new Error("This task is already running.");
		});

		expect(() =>
			submitCommand({
				body: { mediaId: 7 },
				commandType: "refreshBook",
				dedupeKey: "mediaId",
				handler,
				name: "Refresh book",
			}),
		).toThrowError("This task is already running.");

		expect(commandsMocks.acquireJobRun).toHaveBeenCalledWith({
			sourceType: "command",
			jobType: "refreshBook",
			displayName: "Refresh book",
			dedupeKey: "mediaId",
			dedupeValue: "7",
			metadata: { body: { mediaId: 7 }, batchTaskId: undefined },
		});
		expect(handler).not.toHaveBeenCalled();
	});

	it("rejects commands when a conflicting batch task is already running", () => {
		commandsMocks.listActiveJobRuns.mockReturnValue([
			{ sourceType: "scheduled", jobType: "metadata-refresh" },
		]);

		expect(() =>
			submitCommand({
				batchTaskId: "metadata-refresh",
				body: { mediaId: 7 },
				commandType: "refreshBook",
				dedupeKey: "mediaId",
				handler: vi.fn(async () => ({})),
				name: "Refresh book",
			}),
		).toThrowError("A batch metadata refresh is already running.");

		expect(commandsMocks.acquireJobRun).not.toHaveBeenCalled();
	});

	it("acquires a command job run with an undefined dedupe value when the body omits the dedupe key", () => {
		const handler = vi.fn(async () => ({}));

		expect(
			submitCommand({
				body: {},
				commandType: "refreshBook",
				dedupeKey: "mediaId",
				handler,
				name: "Refresh book",
			}),
		).toEqual({ commandId: 42 });

		expect(commandsMocks.acquireJobRun).toHaveBeenCalledWith({
			sourceType: "command",
			jobType: "refreshBook",
			displayName: "Refresh book",
			dedupeKey: "mediaId",
			dedupeValue: expect.any(String),
			metadata: { body: {}, batchTaskId: undefined },
		});
	});

	it("stores batch task overlap metadata on command job runs", () => {
		const handler = vi.fn(async () => ({}));

		submitCommand({
			batchTaskId: "metadata-refresh",
			body: { mediaId: 21 },
			commandType: "refreshBook",
			dedupeKey: "mediaId",
			handler,
			name: "Refresh book",
		});

		expect(commandsMocks.acquireJobRun).toHaveBeenCalledWith({
			sourceType: "command",
			jobType: "refreshBook",
			displayName: "Refresh book",
			dedupeKey: "mediaId",
			dedupeValue: "21",
			metadata: { body: { mediaId: 21 }, batchTaskId: "metadata-refresh" },
		});
	});

	it("updates job-run progress and emits completion for finished commands", async () => {
		const handler = vi.fn(
			async (
				body: Record<string, unknown>,
				updateProgress: (message: string) => void,
				setTitle: (title: string) => void,
			) => {
				setTitle("Refreshing");
				updateProgress(`for ${body.mediaId}`);
				return { ok: true };
			},
		);

		expect(
			submitCommand({
				body: { mediaId: 99 },
				commandType: "refreshBook",
				dedupeKey: "mediaId",
				handler,
				name: "Refresh book",
			}),
		).toEqual({ commandId: 42 });

		expect(commandsMocks.acquireJobRun).toHaveBeenCalledWith({
			sourceType: "command",
			jobType: "refreshBook",
			displayName: "Refresh book",
			dedupeKey: "mediaId",
			dedupeValue: "99",
			metadata: { body: { mediaId: 99 }, batchTaskId: undefined },
		});

		await vi.waitFor(() => {
			expect(commandsMocks.emit).toHaveBeenCalledWith({
				commandId: 42,
				progress: "Refreshing — for 99",
				type: "commandProgress",
			});
			expect(commandsMocks.emit).toHaveBeenCalledWith({
				commandId: 42,
				commandType: "refreshBook",
				result: { ok: true },
				title: "Refreshing",
				type: "commandCompleted",
			});
		});

		expect(commandsMocks.updateJobRunProgress).toHaveBeenCalledWith(
			42,
			"Refreshing — for 99",
		);
		expect(commandsMocks.completeJobRun).toHaveBeenCalledWith(42, { ok: true });
		expect(commandsMocks.rejectDbUse).not.toHaveBeenCalled();
		expect(commandsMocks.logError).not.toHaveBeenCalled();
	});

	it("heartbeats active no-progress commands and clears the interval", async () => {
		vi.useFakeTimers();
		let resolveHandler: () => void = () => {
			throw new Error("handler promise was not initialized");
		};
		const handler = vi.fn(
			() =>
				new Promise<Record<string, unknown>>((resolve) => {
					resolveHandler = () => resolve({ ok: true });
				}),
		);

		submitCommand({
			body: { mediaId: 99 },
			commandType: "refreshBook",
			dedupeKey: "mediaId",
			handler,
			name: "Refresh book",
		});

		expect(handler).toHaveBeenCalledOnce();
		vi.advanceTimersByTime(9_999);
		expect(commandsMocks.heartbeatJobRun).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(commandsMocks.heartbeatJobRun).toHaveBeenCalledWith(42);

		resolveHandler();
		await vi.waitFor(() => {
			expect(commandsMocks.completeJobRun).toHaveBeenCalledWith(42, {
				ok: true,
			});
		});

		expect(vi.getTimerCount()).toBe(0);
		vi.useRealTimers();
	});

	it("logs, fails the job run, and emits failures for failed commands", async () => {
		const boom = new Error("boom");
		const handler = vi.fn(
			async (
				_body: Record<string, unknown>,
				_updateProgress: (message: string) => void,
				setTitle: (title: string) => void,
			) => {
				setTitle("Failing task");
				throw boom;
			},
		);

		submitCommand({
			body: { mediaId: 11 },
			commandType: "refreshBook",
			dedupeKey: "mediaId",
			handler,
			name: "Refresh book",
		});

		await vi.waitFor(() => {
			expect(commandsMocks.logError).toHaveBeenCalledWith(
				"command",
				"refreshBook #42 failed",
				boom,
			);
			expect(commandsMocks.emit).toHaveBeenCalledWith({
				commandId: 42,
				commandType: "refreshBook",
				error: "boom",
				title: "Failing task",
				type: "commandFailed",
			});
		});

		expect(commandsMocks.failJobRun).toHaveBeenCalledWith(42, "boom");
		expect(commandsMocks.rejectDbUse).not.toHaveBeenCalled();
	});

	it("returns active commands for authenticated requests", async () => {
		commandsMocks.listActiveJobRuns.mockReturnValue([
			{
				displayName: "Refresh book",
				id: 5,
				jobType: "refreshBook",
				metadata: { body: { mediaId: 5 } },
				progress: "working",
				sourceType: "command",
			},
			{
				displayName: "Scheduled refresh",
				id: 6,
				jobType: "metadata-refresh",
				metadata: { body: { mediaId: 9 } },
				progress: "queued",
				sourceType: "scheduled",
			},
		]);

		await expect(getActiveCommandsFn()).resolves.toEqual([
			{
				body: { mediaId: 5 },
				commandType: "refreshBook",
				id: 5,
				name: "Refresh book",
				progress: "working",
			},
		]);

		expect(commandsMocks.requireAuth).toHaveBeenCalledTimes(1);
	});
});

describe("commands server helpers with real job-run acquisition", () => {
	afterEach(() => {
		vi.doMock("./job-runs", () => ({
			acquireJobRun: commandsMocks.acquireJobRun,
			completeJobRun: commandsMocks.completeJobRun,
			failJobRun: commandsMocks.failJobRun,
			heartbeatJobRun: commandsMocks.heartbeatJobRun,
			JOB_HEARTBEAT_INTERVAL_MS: 10_000,
			listActiveJobRuns: commandsMocks.listActiveJobRuns,
			updateJobRunProgress: commandsMocks.updateJobRunProgress,
		}));
		vi.doMock("src/db", () => ({
			db: new Proxy({}, { get: () => commandsMocks.rejectDbUse }),
		}));
		vi.doUnmock("drizzle-orm");
		vi.doUnmock("src/db/schema");
		vi.resetModules();
	});

	it("allows same-type commands with missing dedupe values to run concurrently", async () => {
		vi.resetModules();
		vi.doUnmock("./job-runs");
		vi.doUnmock("drizzle-orm");
		vi.doUnmock("src/db/schema");

		const [{ default: Database }, { drizzle }, schema] = await Promise.all([
			import("better-sqlite3"),
			import("drizzle-orm/better-sqlite3"),
			import("src/db/schema"),
		]);
		const sqlite = new Database(":memory:");
		sqlite.exec(`
			CREATE TABLE job_runs (
				id integer PRIMARY KEY AUTOINCREMENT,
				source_type text NOT NULL,
				job_type text NOT NULL,
				display_name text NOT NULL,
				dedupe_key text,
				dedupe_value text,
				status text DEFAULT 'queued' NOT NULL,
				progress text,
				attempt integer DEFAULT 1 NOT NULL,
				result text,
				error text,
				metadata text,
				started_at integer,
				last_heartbeat_at integer,
				finished_at integer,
				created_at integer NOT NULL,
				updated_at integer NOT NULL
			)
		`);
		sqlite.exec(`
			CREATE UNIQUE INDEX job_runs_active_dedupe_unique_idx
			ON job_runs (source_type, job_type, dedupe_key, dedupe_value)
			WHERE status IN ('queued', 'running')
		`);
		const db = drizzle({ client: sqlite, schema });

		vi.doMock("src/db", () => ({ db, sqlite }));
		const { submitCommand } = await import("./commands");
		const handler = vi.fn(() => new Promise<Record<string, unknown>>(() => {}));

		const first = submitCommand({
			body: {},
			commandType: "refreshBook",
			dedupeKey: "mediaId",
			handler,
			name: "Refresh book",
		});
		const second = submitCommand({
			body: {},
			commandType: "refreshBook",
			dedupeKey: "mediaId",
			handler,
			name: "Refresh book",
		});

		expect(first.commandId).not.toBe(second.commandId);
		expect(handler).toHaveBeenCalledTimes(2);

		sqlite.close();
	});
});
