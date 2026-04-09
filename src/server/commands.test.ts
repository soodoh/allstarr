import { beforeEach, describe, expect, it, vi } from "vitest";

const commandsMocks = vi.hoisted(() => ({
	activeRows: vi.fn(),
	deleteRun: vi.fn(),
	emit: vi.fn(),
	insertGet: vi.fn(),
	isTaskRunning: vi.fn(),
	logError: vi.fn(),
	requireAuth: vi.fn(),
	selectDuplicates: vi.fn(),
	updateRun: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
	}),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("src/db", () => ({
	db: {
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				run: commandsMocks.deleteRun,
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn(() => ({
					get: commandsMocks.insertGet,
				})),
			})),
		})),
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				all: commandsMocks.activeRows,
				where: vi.fn(() => ({
					all: commandsMocks.selectDuplicates,
				})),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					run: commandsMocks.updateRun,
				})),
			})),
		})),
	},
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

vi.mock("./scheduler/state", () => ({
	isTaskRunning: commandsMocks.isTaskRunning,
}));

import { getActiveCommandsFn, submitCommand } from "./commands";

describe("commands server helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		commandsMocks.activeRows.mockReturnValue([]);
		commandsMocks.insertGet.mockReturnValue({ id: 42 });
		commandsMocks.isTaskRunning.mockReturnValue(false);
		commandsMocks.selectDuplicates.mockReturnValue([]);
	});

	it("rejects duplicate commands that share the dedupe key value", () => {
		commandsMocks.selectDuplicates.mockReturnValue([
			{ body: { mediaId: 7 }, id: 1 },
		]);

		expect(() =>
			submitCommand({
				body: { mediaId: 7 },
				commandType: "refreshBook",
				dedupeKey: "mediaId",
				handler: vi.fn(async () => ({})),
				name: "Refresh book",
			}),
		).toThrowError("This task is already running.");

		expect(commandsMocks.insertGet).not.toHaveBeenCalled();
	});

	it("rejects commands when a conflicting batch task is already running", () => {
		commandsMocks.isTaskRunning.mockReturnValue(true);

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
	});

	it("updates progress, emits completion, and clears finished commands", async () => {
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

		expect(commandsMocks.updateRun).toHaveBeenCalledTimes(1);
		expect(commandsMocks.deleteRun).toHaveBeenCalledTimes(1);
		expect(commandsMocks.logError).not.toHaveBeenCalled();
	});

	it("logs and emits failures before cleaning up failed commands", async () => {
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

		expect(commandsMocks.deleteRun).toHaveBeenCalledTimes(1);
	});

	it("returns active commands for authenticated requests", async () => {
		commandsMocks.activeRows.mockReturnValue([
			{
				body: { mediaId: 5 },
				commandType: "refreshBook",
				id: 5,
				name: "Refresh book",
				progress: "working",
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
