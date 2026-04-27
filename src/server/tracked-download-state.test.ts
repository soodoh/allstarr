import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	and: vi.fn((...conditions: unknown[]) => ({ conditions, op: "and" })),
	defaultDb: {
		select: vi.fn(),
		update: vi.fn(),
	},
	eq: vi.fn((left: unknown, right: unknown) => ({ left, op: "eq", right })),
}));

vi.mock("drizzle-orm", () => ({
	and: mocks.and,
	eq: mocks.eq,
}));

vi.mock("src/db", () => ({
	db: mocks.defaultDb,
}));

import type { TrackedDownloadStateDb } from "./tracked-download-state";
import {
	claimTrackedDownloadImport,
	markTrackedDownloadCompleted,
	markTrackedDownloadDownloading,
	markTrackedDownloadFailed,
	markTrackedDownloadImported,
	markTrackedDownloadImportPending,
	markTrackedDownloadRemoved,
} from "./tracked-download-state";

type TrackedDownloadRow = {
	id: number;
	state: string;
	updatedAt?: Date;
	outputPath?: string | null;
	message?: string | null;
};

type FakeDb = {
	select: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	whereArgs: unknown[];
};

type DbMethod = () => unknown;

function createFakeDb(rows: TrackedDownloadRow[], runResult?: unknown): FakeDb {
	const whereArgs: unknown[] = [];

	return {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn((_whereArg: unknown) => ({
					get: vi.fn(() => rows[0]),
				})),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn((values: Partial<TrackedDownloadRow>) => ({
				where: vi.fn((whereArg: unknown) => ({
					run: vi.fn(() => {
						whereArgs.push(whereArg);
						if (
							!(
								typeof runResult === "object" &&
								runResult !== null &&
								"changes" in runResult &&
								runResult.changes === 0
							)
						) {
							Object.assign(rows[0] ?? {}, values);
						}
						return runResult;
					}),
				})),
			})),
		})),
		whereArgs,
	};
}

function useDefaultDb(fakeDb: FakeDb): void {
	mocks.defaultDb.select.mockImplementation(fakeDb.select as DbMethod);
	mocks.defaultDb.update.mockImplementation(fakeDb.update as DbMethod);
}

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe("tracked download state transitions", () => {
	it("transitions a queued tracked download to downloading", () => {
		const now = new Date("2026-01-02T03:04:05.000Z");
		vi.setSystemTime(now);
		const rows: TrackedDownloadRow[] = [{ id: 1, state: "queued" }];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		markTrackedDownloadDownloading(1);

		expect(rows[0]).toMatchObject({
			id: 1,
			state: "downloading",
			updatedAt: now,
		});
		expect(mocks.defaultDb.select).toHaveBeenCalled();
		expect(mocks.defaultDb.update).toHaveBeenCalled();
	});

	it("transitions a queued tracked download to completed with output path", () => {
		const now = new Date("2026-01-02T03:04:05.000Z");
		vi.setSystemTime(now);
		const rows: TrackedDownloadRow[] = [
			{ id: 2, state: "queued", outputPath: null },
		];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		markTrackedDownloadCompleted(2, "/downloads/book.epub");

		expect(rows[0]).toMatchObject({
			id: 2,
			state: "completed",
			outputPath: "/downloads/book.epub",
			updatedAt: now,
		});
	});

	it("transitions a queued tracked download to completed with null output path", () => {
		const now = new Date("2026-01-02T03:04:05.000Z");
		vi.setSystemTime(now);
		const rows: TrackedDownloadRow[] = [
			{ id: 11, state: "queued", outputPath: "/downloads/old.epub" },
		];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		markTrackedDownloadCompleted(11, null);

		expect(rows[0]).toMatchObject({
			id: 11,
			state: "completed",
			outputPath: null,
			updatedAt: now,
		});
	});

	it("transitions a queued tracked download to failed with message", () => {
		const now = new Date("2026-01-02T03:04:05.000Z");
		vi.setSystemTime(now);
		const rows: TrackedDownloadRow[] = [
			{ id: 10, state: "queued", message: null },
		];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		markTrackedDownloadFailed(10, "Download rejected");

		expect(rows[0]).toMatchObject({
			id: 10,
			state: "failed",
			message: "Download rejected",
			updatedAt: now,
		});
		expect(mocks.defaultDb.update).toHaveBeenCalled();
	});

	it("transitions a completed tracked download to import pending", () => {
		const rows: TrackedDownloadRow[] = [{ id: 3, state: "completed" }];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		markTrackedDownloadImportPending(3);

		expect(rows[0]?.state).toBe("importPending");
		expect(rows[0]?.updatedAt).toBeInstanceOf(Date);
	});

	it("claims a completed tracked download for import", () => {
		const rows: TrackedDownloadRow[] = [{ id: 14, state: "completed" }];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		claimTrackedDownloadImport(14);

		expect(rows[0]?.state).toBe("importPending");
		expect(rows[0]?.updatedAt).toBeInstanceOf(Date);
	});

	it("treats an already import-pending tracked download as an existing import claim", () => {
		const rows: TrackedDownloadRow[] = [{ id: 15, state: "importPending" }];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		claimTrackedDownloadImport(15);

		expect(rows[0]?.state).toBe("importPending");
		expect(mocks.defaultDb.update).not.toHaveBeenCalled();
	});

	it("rejects import claims from terminal states without changing persisted state", () => {
		const rows: TrackedDownloadRow[] = [
			{ id: 16, message: "previous failure", state: "failed" },
		];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		expect(() => claimTrackedDownloadImport(16)).toThrow(
			"Cannot claim tracked download",
		);
		expect(rows[0]).toMatchObject({
			message: "previous failure",
			state: "failed",
		});
		expect(mocks.defaultDb.update).not.toHaveBeenCalled();
	});

	it("rejects queued to imported", () => {
		const rows: TrackedDownloadRow[] = [{ id: 4, state: "queued" }];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		expect(() => markTrackedDownloadImported(4)).toThrow(
			"Cannot transition tracked download 4 from queued to imported.",
		);
		expect(rows[0]?.state).toBe("queued");
	});

	it("transitions an import pending tracked download to imported", () => {
		const rows: TrackedDownloadRow[] = [{ id: 5, state: "importPending" }];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		markTrackedDownloadImported(5);

		expect(rows[0]?.state).toBe("imported");
	});

	it("transitions an import pending tracked download to failed with message", () => {
		const rows: TrackedDownloadRow[] = [
			{ id: 6, state: "importPending", message: null },
		];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		markTrackedDownloadFailed(6, "Import failed");

		expect(rows[0]).toMatchObject({
			state: "failed",
			message: "Import failed",
		});
	});

	it("transitions queued and downloading tracked downloads to removed", () => {
		const queuedRows: TrackedDownloadRow[] = [
			{ id: 7, state: "queued", message: null },
		];
		const queuedDb = createFakeDb(queuedRows);
		useDefaultDb(queuedDb);

		markTrackedDownloadRemoved(7, "Deleted by client");

		const downloadingRows: TrackedDownloadRow[] = [
			{ id: 8, state: "downloading", message: null },
		];
		const downloadingDb = createFakeDb(downloadingRows);
		useDefaultDb(downloadingDb);

		markTrackedDownloadRemoved(8, "Deleted by client");

		expect(queuedRows[0]).toMatchObject({
			state: "removed",
			message: "Deleted by client",
		});
		expect(downloadingRows[0]).toMatchObject({
			state: "removed",
			message: "Deleted by client",
		});
	});

	it("throws when the tracked download is missing", () => {
		const fakeDb = createFakeDb([]);
		useDefaultDb(fakeDb);

		expect(() => markTrackedDownloadDownloading(999)).toThrow(
			"Tracked download 999 not found.",
		);
	});

	it("uses the optional transaction handle when passed", () => {
		const rows: TrackedDownloadRow[] = [{ id: 9, state: "queued" }];
		const tx = createFakeDb(rows);

		markTrackedDownloadDownloading(9, tx as unknown as TrackedDownloadStateDb);

		expect(tx.select).toHaveBeenCalled();
		expect(tx.update).toHaveBeenCalled();
		expect(mocks.defaultDb.select).not.toHaveBeenCalled();
		expect(mocks.defaultDb.update).not.toHaveBeenCalled();
	});

	it("guards updates with the observed current state", () => {
		const rows: TrackedDownloadRow[] = [{ id: 12, state: "queued" }];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		markTrackedDownloadDownloading(12);

		expect(mocks.and).toHaveBeenCalledWith(
			{ left: expect.anything(), op: "eq", right: 12 },
			{ left: expect.anything(), op: "eq", right: "queued" },
		);
		expect(fakeDb.whereArgs.at(-1)).toEqual({
			conditions: [
				{ left: expect.anything(), op: "eq", right: 12 },
				{ left: expect.anything(), op: "eq", right: "queued" },
			],
			op: "and",
		});
	});

	it("throws when the guarded update does not change a row", () => {
		const rows: TrackedDownloadRow[] = [{ id: 13, state: "queued" }];
		const fakeDb = createFakeDb(rows, { changes: 0 });
		useDefaultDb(fakeDb);

		expect(() => markTrackedDownloadDownloading(13)).toThrow(
			"Tracked download 13 changed state before transition.",
		);
		expect(rows[0]?.state).toBe("queued");
	});
});
