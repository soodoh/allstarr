import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	defaultDb: {
		select: vi.fn(),
		update: vi.fn(),
	},
}));

vi.mock("src/db", () => ({
	db: mocks.defaultDb,
}));

import type { TrackedDownloadStateDb } from "./tracked-download-state";
import {
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
};

type DbMethod = () => unknown;

function createFakeDb(rows: TrackedDownloadRow[]): FakeDb {
	return {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					get: vi.fn(() => rows[0]),
				})),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn((values: Partial<TrackedDownloadRow>) => ({
				where: vi.fn(() => ({
					run: vi.fn(() => {
						Object.assign(rows[0] ?? {}, values);
					}),
				})),
			})),
		})),
	};
}

function useDefaultDb(fakeDb: FakeDb): void {
	mocks.defaultDb.select.mockImplementation(fakeDb.select as DbMethod);
	mocks.defaultDb.update.mockImplementation(fakeDb.update as DbMethod);
}

afterEach(() => {
	vi.useRealTimers();
	vi.resetAllMocks();
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

	it("transitions a completed tracked download to import pending", () => {
		const rows: TrackedDownloadRow[] = [{ id: 3, state: "completed" }];
		const fakeDb = createFakeDb(rows);
		useDefaultDb(fakeDb);

		markTrackedDownloadImportPending(3);

		expect(rows[0]?.state).toBe("importPending");
		expect(rows[0]?.updatedAt).toBeInstanceOf(Date);
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
});
