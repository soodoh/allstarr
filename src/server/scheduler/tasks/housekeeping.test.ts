import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	registerTask: vi.fn(),
	deleteAll: vi.fn(),
	sqliteRun: vi.fn(),
	lt: vi.fn(),
}));

vi.mock("../registry", () => ({
	registerTask: mocks.registerTask,
}));

vi.mock("drizzle-orm", () => ({
	lt: mocks.lt,
}));

vi.mock("src/db", () => ({
	db: {
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: vi.fn(() => ({
					all: mocks.deleteAll,
				})),
			})),
		})),
	},
	sqlite: {
		run: mocks.sqliteRun,
	},
}));

vi.mock("src/db/schema", () => ({
	history: { id: "history.id", date: "history.date" },
}));

// Import triggers registerTask side effect
import "./housekeeping";

const taskDef = mocks.registerTask.mock.calls[0][0];
const handler = taskDef.handler;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("housekeeping task", () => {
	it("registers with correct metadata", () => {
		expect(taskDef).toBeDefined();
		expect(taskDef.id).toBe("housekeeping");
		expect(taskDef.name).toBe("Housekeeping");
		expect(taskDef.group).toBe("maintenance");
		expect(taskDef.defaultInterval).toBe(24 * 60 * 60);
	});

	it("deletes old history and optimizes database", async () => {
		mocks.deleteAll.mockReturnValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

		const result = await handler(vi.fn());

		expect(result.success).toBe(true);
		expect(result.message).toBe(
			"Cleaned 3 old history record(s), optimized database",
		);
		expect(mocks.lt).toHaveBeenCalledOnce();
		expect(mocks.sqliteRun).toHaveBeenCalledWith("PRAGMA optimize");
	});

	it("reports zero records when nothing to clean", async () => {
		mocks.deleteAll.mockReturnValue([]);

		const result = await handler(vi.fn());

		expect(result.success).toBe(true);
		expect(result.message).toBe(
			"Cleaned 0 old history record(s), optimized database",
		);
	});

	it("uses a 90-day cutoff for history deletion", async () => {
		const now = Date.now();
		vi.setSystemTime(new Date(now));
		mocks.deleteAll.mockReturnValue([]);

		await handler(vi.fn());

		const cutoffArg = mocks.lt.mock.calls[0][1] as Date;
		const expectedCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000);
		expect(cutoffArg.getTime()).toBe(expectedCutoff.getTime());

		vi.useRealTimers();
	});

	it("always runs PRAGMA optimize after deletion", async () => {
		mocks.deleteAll.mockReturnValue([{ id: 1 }]);

		await handler(vi.fn());

		expect(mocks.sqliteRun).toHaveBeenCalledTimes(1);
		expect(mocks.sqliteRun).toHaveBeenCalledWith("PRAGMA optimize");
	});
});
