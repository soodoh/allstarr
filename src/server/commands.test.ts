import { jobRuns } from "src/db/schema";
import { createSqliteFixture } from "src/test/sqlite-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	emit: vi.fn(),
	logError: vi.fn(),
	requireAuth: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({ handler: (handler: unknown) => handler }),
}));
vi.mock("./event-bus", () => ({ eventBus: { emit: mocks.emit } }));
vi.mock("./logger", () => ({ logError: mocks.logError }));
vi.mock("./middleware", () => ({ requireAuth: mocks.requireAuth }));
let fixture: ReturnType<typeof createSqliteFixture>;
let commands: typeof import("./commands");
let jobs: typeof import("./job-runs");
beforeEach(async () => {
	vi.resetAllMocks();
	vi.resetModules();
	vi.useFakeTimers();
	fixture = createSqliteFixture();
	vi.doMock("src/db", () => ({ db: fixture.db }));
	commands = await import("./commands");
	jobs = await import("./job-runs");
});
afterEach(() => {
	fixture.close();
	vi.doUnmock("src/db");
	vi.useRealTimers();
	vi.restoreAllMocks();
});
function submit(
	handler: import("./commands").CommandHandler,
	body: Record<string, unknown> = { mediaId: 7 },
) {
	return commands.submitCommand({
		commandType: "refreshBook",
		name: "Refresh book",
		dedupeKey: "mediaId",
		body,
		handler,
	});
}

describe("command presentation and admission", () => {
	it("rejects duplicate commands without starting duplicate work", async () => {
		const work = Promise.withResolvers<Record<string, unknown>>();
		const handler = vi.fn(() => work.promise);
		submit(handler);
		expect(() => submit(handler)).toThrow("This task is already running.");
		expect(handler).toHaveBeenCalledTimes(1);
		work.resolve({});
		await vi.advanceTimersByTimeAsync(0);
	});

	it("allows same-type commands with missing dedupe values to run concurrently", async () => {
		const work = Promise.withResolvers<Record<string, unknown>>();
		const handler = vi.fn(() => work.promise);
		const first = submit(handler, {});
		const second = submit(handler, {});
		expect(first.commandId).not.toBe(second.commandId);
		expect(handler).toHaveBeenCalledTimes(2);
		expect(jobs.listActiveJobRuns()).toHaveLength(2);
		work.resolve({});
		await vi.advanceTimersByTimeAsync(0);
	});

	it("rejects a command when its scheduled batch is already active", () => {
		jobs.acquireJobRun({
			sourceType: "scheduled",
			jobType: "refresh-metadata",
			displayName: "Batch",
		});
		const handler = vi.fn();
		expect(() =>
			commands.submitCommand({
				commandType: "refreshBook",
				name: "Refresh book",
				body: { mediaId: 7 },
				dedupeKey: "mediaId",
				batchTaskId: "refresh-metadata",
				handler,
			}),
		).toThrow("A batch metadata refresh is already running.");
		expect(handler).not.toHaveBeenCalled();
		expect(jobs.listActiveJobRuns()).toHaveLength(1);
	});

	it("stores command body and batch overlap metadata", async () => {
		commands.submitCommand({
			commandType: "refreshBook",
			name: "Refresh book",
			body: { mediaId: 7 },
			dedupeKey: "mediaId",
			batchTaskId: "refresh-metadata",
			handler: async () => ({}),
		});
		expect(jobs.listActiveJobRuns()[0]).toMatchObject({
			metadata: { body: { mediaId: 7 }, batchTaskId: "refresh-metadata" },
			dedupeKey: "mediaId",
			dedupeValue: "7",
		});
		await vi.advanceTimersByTimeAsync(0);
	});

	it("formats progress and emits completion only after persisted completion", async () => {
		mocks.emit.mockImplementation((event) => {
			if (event.type === "commandCompleted") {
				expect(fixture.db.select().from(jobRuns).all()[0]).toMatchObject({
					status: "succeeded",
					result: { ok: true },
				});
			}
		});
		const submitted = submit(async (body, progress, title) => {
			title("Refreshing");
			progress(`for ${body.mediaId}`);
			return { ok: true };
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.emit).toHaveBeenCalledWith({
			type: "commandProgress",
			commandId: submitted.commandId,
			progress: "Refreshing — for 7",
		});
		expect(mocks.emit).toHaveBeenCalledWith({
			type: "commandCompleted",
			commandId: submitted.commandId,
			commandType: "refreshBook",
			result: { ok: true },
			title: "Refreshing",
		});
		expect(fixture.db.select().from(jobRuns).all()[0]?.progress).toBe(
			"Refreshing — for 7",
		);
		expect(mocks.logError).not.toHaveBeenCalled();
	});

	it.each([new Error("boom"), "bad"])(
		"formats failures after persisted failure (%s)",
		async (error) => {
			mocks.emit.mockImplementation((event) => {
				if (event.type === "commandFailed")
					expect(fixture.db.select().from(jobRuns).all()[0]?.status).toBe(
						"failed",
					);
			});
			const submitted = submit(async (_body, _progress, title) => {
				title("Failing task");
				throw error;
			});
			await vi.advanceTimersByTimeAsync(0);
			expect(mocks.logError).toHaveBeenCalledWith(
				"command",
				`refreshBook #${submitted.commandId} failed`,
				error,
			);
			expect(mocks.emit).toHaveBeenCalledWith({
				type: "commandFailed",
				commandId: submitted.commandId,
				commandType: "refreshBook",
				error: error instanceof Error ? "boom" : "Unknown error",
				title: "Failing task",
			});
		},
	);

	it("returns active commands for authenticated reconnection and excludes scheduled runs", async () => {
		const work = Promise.withResolvers<Record<string, unknown>>();
		const submitted = submit(() => work.promise);
		jobs.acquireJobRun({
			sourceType: "scheduled",
			jobType: "batch",
			displayName: "Batch",
		});
		expect(await commands.getActiveCommandsFn()).toEqual([
			{
				id: submitted.commandId,
				commandType: "refreshBook",
				name: "Refresh book",
				progress: null,
				body: { mediaId: 7 },
			},
		]);
		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
		work.resolve({});
		await vi.advanceTimersByTimeAsync(0);
	});

	it.each([null, { body: null }, { body: [] }, { body: "bad" }])(
		"normalizes legacy reconnect metadata (%s)",
		async (metadata) => {
			const run = jobs.acquireJobRun({
				sourceType: "command",
				jobType: "legacy",
				displayName: "Legacy",
			});
			fixture.db.update(jobRuns).set({ metadata }).run();
			expect(await commands.getActiveCommandsFn()).toEqual([
				{
					id: run.id,
					commandType: "legacy",
					name: "Legacy",
					progress: null,
					body: {},
				},
			]);
		},
	);

	it("logs detached execution errors when failure persistence is unavailable", async () => {
		fixture.sqlite.exec(
			"CREATE TRIGGER reject_failure BEFORE UPDATE OF status ON job_runs WHEN NEW.status = 'failed' BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END",
		);
		const submitted = submit(async () => {
			throw new Error("work failed");
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.logError).toHaveBeenCalledWith(
			"command",
			`Uncaught error in refreshBook #${submitted.commandId}`,
			expect.objectContaining({
				message: expect.stringContaining("storage unavailable"),
			}),
		);
		expect(mocks.emit).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rejects unauthenticated reconnection", async () => {
		mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
		await expect(commands.getActiveCommandsFn()).rejects.toThrow(
			"Unauthorized",
		);
	});
});
