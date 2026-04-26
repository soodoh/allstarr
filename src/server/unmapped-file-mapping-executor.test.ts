import { executeMappingWithRollback } from "src/server/unmapped-file-mapping-executor";
import { describe, expect, it, vi } from "vitest";

function createFsMock() {
	return {
		copyFileSync: vi.fn(),
		existsSync: vi.fn((_target: string) => true),
		mkdirSync: vi.fn(),
		renameSync: vi.fn(),
		rmSync: vi.fn(),
		unlinkSync: vi.fn(),
	};
}

describe("executeMappingWithRollback", () => {
	it("runs moves before the transaction and returns the transaction result", () => {
		const fs = createFsMock();
		const events: string[] = [];

		const result = executeMappingWithRollback({
			fs,
			logLabel: "test move",
			move: ({ recordMove }) => {
				events.push("move");
				recordMove({
					from: "/source/book.epub",
					to: "/dest/book.epub",
					kind: "file",
				});
				fs.renameSync("/source/book.epub", "/dest/book.epub");
			},
			runTransaction: () => {
				events.push("transaction");
				return "mapped";
			},
		});

		expect(result).toBe("mapped");
		expect(fs.renameSync).toHaveBeenCalledWith(
			"/source/book.epub",
			"/dest/book.epub",
		);
		expect(fs.renameSync).toHaveBeenCalledTimes(1);
		expect(events).toEqual(["move", "transaction"]);
	});

	it("rolls back recorded moves in reverse order when the transaction fails", () => {
		const fs = createFsMock();

		expect(() =>
			executeMappingWithRollback({
				fs,
				logLabel: "test move",
				move: ({ recordMove }) => {
					recordMove({
						from: "/source/book.epub",
						to: "/dest/book.epub",
						kind: "file",
					});
					recordMove({
						from: "/source/book.srt",
						to: "/dest/book.srt",
						kind: "file",
					});
				},
				runTransaction: () => {
					throw new Error("insert failed");
				},
			}),
		).toThrow("insert failed");

		expect(fs.renameSync).toHaveBeenNthCalledWith(
			1,
			"/dest/book.srt",
			"/source/book.srt",
		);
		expect(fs.renameSync).toHaveBeenNthCalledWith(
			2,
			"/dest/book.epub",
			"/source/book.epub",
		);
	});

	it("falls back to copy and unlink when rolling back a file across devices", () => {
		const fs = createFsMock();
		const exdevError = new Error("cross-device link");
		Object.assign(exdevError, { code: "EXDEV" });
		fs.renameSync.mockImplementation(() => {
			throw exdevError;
		});

		expect(() =>
			executeMappingWithRollback({
				fs,
				logLabel: "test move",
				move: ({ recordMove }) => {
					recordMove({
						from: "/source/book.epub",
						to: "/dest/book.epub",
						kind: "file",
					});
				},
				runTransaction: () => {
					throw new Error("insert failed");
				},
			}),
		).toThrow("insert failed");

		expect(fs.copyFileSync).toHaveBeenCalledWith(
			"/dest/book.epub",
			"/source/book.epub",
		);
		expect(fs.unlinkSync).toHaveBeenCalledWith("/dest/book.epub");
	});

	it("logs rollback failures when the rollback source is missing", () => {
		const fs = createFsMock();
		fs.existsSync.mockImplementation((target) => target !== "/dest/book.epub");
		const logWarn = vi.fn();

		expect(() =>
			executeMappingWithRollback({
				fs,
				logLabel: "test move",
				logWarn,
				move: ({ recordMove }) => {
					recordMove({
						from: "/source/book.epub",
						to: "/dest/book.epub",
						kind: "file",
					});
				},
				runTransaction: () => {
					throw new Error("insert failed");
				},
			}),
		).toThrow("insert failed");

		expect(fs.renameSync).not.toHaveBeenCalled();
		expect(logWarn).toHaveBeenCalledWith(
			"unmapped-files",
			expect.stringContaining("Failed to roll back test move"),
		);
	});

	it("does not use file fallback when rolling back a directory across devices", () => {
		const fs = createFsMock();
		const exdevError = new Error("cross-device link");
		Object.assign(exdevError, { code: "EXDEV" });
		fs.renameSync.mockImplementation(() => {
			throw exdevError;
		});
		const logWarn = vi.fn();

		expect(() =>
			executeMappingWithRollback({
				fs,
				logLabel: "test move",
				logWarn,
				move: ({ recordMove }) => {
					recordMove({
						from: "/source/extras",
						to: "/dest/extras",
						kind: "directory",
					});
				},
				runTransaction: () => {
					throw new Error("insert failed");
				},
			}),
		).toThrow("insert failed");

		expect(fs.renameSync).toHaveBeenCalledWith(
			"/dest/extras",
			"/source/extras",
		);
		expect(fs.copyFileSync).not.toHaveBeenCalled();
		expect(fs.unlinkSync).not.toHaveBeenCalled();
		expect(logWarn).toHaveBeenCalledWith(
			"unmapped-files",
			expect.stringContaining("Failed to roll back test move"),
		);
	});

	it("logs rollback failures without masking the original error", () => {
		const fs = createFsMock();
		fs.renameSync.mockImplementation(() => {
			throw new Error("rollback failed");
		});
		const logWarn = vi.fn();

		expect(() =>
			executeMappingWithRollback({
				fs,
				logLabel: "test move",
				logWarn,
				move: ({ recordMove }) => {
					recordMove({
						from: "/source/book.epub",
						to: "/dest/book.epub",
						kind: "file",
					});
				},
				runTransaction: () => {
					throw new Error("insert failed");
				},
			}),
		).toThrow("insert failed");

		expect(logWarn).toHaveBeenCalledWith(
			"unmapped-files",
			expect.stringContaining("Failed to roll back test move"),
		);
	});
});
