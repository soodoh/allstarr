import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	registerTask: vi.fn(),
	sqliteRun: vi.fn(),
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	readdirSync: vi.fn(),
	unlinkSync: vi.fn(),
}));

vi.mock("../registry", () => ({
	registerTask: mocks.registerTask,
}));

vi.mock("src/db", () => ({
	sqlite: {
		run: mocks.sqliteRun,
	},
}));

vi.mock("node:fs", () => ({
	existsSync: mocks.existsSync,
	mkdirSync: mocks.mkdirSync,
	readdirSync: mocks.readdirSync,
	unlinkSync: mocks.unlinkSync,
}));

vi.mock("node:path", async () => {
	const actual = await vi.importActual<typeof import("node:path")>("node:path");
	return actual;
});

// Import triggers registerTask side effect
import "./backup";

const taskDef = mocks.registerTask.mock.calls[0][0];
const handler = taskDef.handler;

beforeEach(() => {
	vi.clearAllMocks();
	delete process.env.DATABASE_URL;
});

describe("backup task", () => {
	it("registers with correct metadata", () => {
		expect(taskDef).toBeDefined();
		expect(taskDef.id).toBe("backup");
		expect(taskDef.name).toBe("Backup Database");
		expect(taskDef.group).toBe("maintenance");
		expect(taskDef.defaultInterval).toBe(7 * 24 * 60 * 60);
	});

	it("returns failure when database file does not exist", async () => {
		mocks.existsSync.mockReturnValue(false);

		const result = await handler(vi.fn());

		expect(result.success).toBe(false);
		expect(result.message).toBe("Database file not found");
		expect(mocks.sqliteRun).not.toHaveBeenCalled();
	});

	it("creates backup directory and runs VACUUM INTO", async () => {
		mocks.existsSync.mockReturnValue(true);
		mocks.readdirSync.mockReturnValue([]);

		const result = await handler(vi.fn());

		expect(result.success).toBe(true);
		expect(result.message).toMatch(/^Backup created: allstarr_.*\.db$/);
		expect(mocks.mkdirSync).toHaveBeenCalledWith(
			expect.stringContaining("backups"),
			{ recursive: true },
		);
		expect(mocks.sqliteRun).toHaveBeenCalledWith(
			expect.stringMatching(/^VACUUM INTO '.*allstarr_.*\.db'$/),
		);
	});

	it("uses DATABASE_URL env when set", async () => {
		process.env.DATABASE_URL = "/custom/path/my.db";
		mocks.existsSync.mockReturnValue(true);
		mocks.readdirSync.mockReturnValue([]);

		await handler(vi.fn());

		expect(mocks.existsSync).toHaveBeenCalledWith("/custom/path/my.db");
		expect(mocks.mkdirSync).toHaveBeenCalledWith("/custom/path/backups", {
			recursive: true,
		});
	});

	it("falls back to data/sqlite.db when DATABASE_URL is not set", async () => {
		mocks.existsSync.mockReturnValue(true);
		mocks.readdirSync.mockReturnValue([]);

		await handler(vi.fn());

		expect(mocks.existsSync).toHaveBeenCalledWith("data/sqlite.db");
		expect(mocks.mkdirSync).toHaveBeenCalledWith("data/backups", {
			recursive: true,
		});
	});

	it("does not delete backups when count is within limit", async () => {
		mocks.existsSync.mockReturnValue(true);
		mocks.readdirSync.mockReturnValue([
			"allstarr_2026-01-01.db",
			"allstarr_2026-01-02.db",
			"allstarr_2026-01-03.db",
		]);

		await handler(vi.fn());

		expect(mocks.unlinkSync).not.toHaveBeenCalled();
	});

	it("deletes oldest backups when exceeding MAX_BACKUPS (5)", async () => {
		mocks.existsSync.mockReturnValue(true);
		mocks.readdirSync.mockReturnValue([
			"allstarr_2026-01-01.db",
			"allstarr_2026-01-02.db",
			"allstarr_2026-01-03.db",
			"allstarr_2026-01-04.db",
			"allstarr_2026-01-05.db",
			"allstarr_2026-01-06.db",
			"allstarr_2026-01-07.db",
		]);

		await handler(vi.fn());

		// 7 backups, keep 5 most recent, delete 2 oldest
		expect(mocks.unlinkSync).toHaveBeenCalledTimes(2);
		expect(mocks.unlinkSync).toHaveBeenCalledWith(
			expect.stringContaining("allstarr_2026-01-01.db"),
		);
		expect(mocks.unlinkSync).toHaveBeenCalledWith(
			expect.stringContaining("allstarr_2026-01-02.db"),
		);
	});

	it("ignores non-matching files in backup directory", async () => {
		mocks.existsSync.mockReturnValue(true);
		mocks.readdirSync.mockReturnValue([
			"allstarr_2026-01-01.db",
			"allstarr_2026-01-02.db",
			"allstarr_2026-01-03.db",
			"allstarr_2026-01-04.db",
			"allstarr_2026-01-05.db",
			"allstarr_2026-01-06.db",
			"random-file.txt",
			"other.db",
		]);

		await handler(vi.fn());

		// Only 6 matching backups, keep 5, delete 1
		expect(mocks.unlinkSync).toHaveBeenCalledTimes(1);
		expect(mocks.unlinkSync).toHaveBeenCalledWith(
			expect.stringContaining("allstarr_2026-01-01.db"),
		);
	});
});
