import {
	executeMappingWithRollback,
	type MappingMoveOperation,
} from "src/server/unmapped-file-mapping-executor";
import { describe, expect, it, vi } from "vitest";

function createFsMock() {
	return {
		renameSync: vi.fn(),
		mkdirSync: vi.fn(),
		existsSync: vi.fn(() => true),
		rmSync: vi.fn(),
	};
}

describe("executeMappingWithRollback", () => {
	it("runs moves before the transaction and returns the transaction result", () => {
		const fs = createFsMock();
		const moved: MappingMoveOperation[] = [];
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

		moved.push({
			from: "/source/book.epub",
			to: "/dest/book.epub",
			kind: "file",
		});
		expect(result).toBe("mapped");
		expect(fs.renameSync).toHaveBeenCalledWith(
			"/source/book.epub",
			"/dest/book.epub",
		);
		expect(fs.renameSync).toHaveBeenCalledTimes(1);
		expect(events).toEqual(["move", "transaction"]);
		expect(moved).toHaveLength(1);
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
