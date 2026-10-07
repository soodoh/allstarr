import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
	bookFiles,
	books,
	downloadClients,
	downloadProfiles,
	history,
	trackedDownloads,
} from "src/db/schema";
import { createSqliteFixture } from "src/test/sqlite-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger", () => ({
	logInfo: vi.fn(),
	logWarn: vi.fn(),
	logError: vi.fn(),
}));
vi.mock("./event-bus", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("./media-probe", () => ({
	probeAudioFile: vi.fn().mockResolvedValue(null),
	probeEbookFile: vi.fn().mockReturnValue(null),
}));
vi.mock("./settings-reader", () => ({
	default: (key: string, fallback: unknown) =>
		key === "mediaManagement.book.skipFreeSpaceCheck" ? true : fallback,
}));

let fixture: ReturnType<typeof createSqliteFixture>;
let directory: string;
let importCompletedDownload: typeof import("./file-import").importCompletedDownload;
let id: number;
let source: string;

beforeEach(async () => {
	vi.resetModules();
	fixture = createSqliteFixture();
	directory = fs.mkdtempSync(join(tmpdir(), "allstarr-import-"));
	source = join(directory, "downloads");
	fs.mkdirSync(source);
	fs.writeFileSync(join(source, "book.epub"), "original media");
	const client = fixture.db
		.insert(downloadClients)
		.values({
			name: "Test",
			implementation: "qBittorrent",
			protocol: "torrent",
			port: 8080,
		})
		.returning()
		.get();
	const book = fixture.db
		.insert(books)
		.values({ title: "A Book" })
		.returning()
		.get();
	const profile = fixture.db
		.insert(downloadProfiles)
		.values({ name: "Import test", rootFolderPath: join(directory, "library") })
		.returning()
		.get();
	id = fixture.db
		.insert(trackedDownloads)
		.values({
			downloadClientId: client.id,
			downloadId: "complete",
			bookId: book.id,
			downloadProfileId: profile.id,
			releaseTitle: "A Book EPUB",
			protocol: "torrent",
			state: "completed",
			outputPath: source,
		})
		.returning()
		.get().id;
	vi.doMock("src/db", () => ({ db: fixture.db }));
	({ importCompletedDownload } = await import("./file-import"));
});

afterEach(() => {
	vi.doUnmock("src/db");
	vi.restoreAllMocks();
	fixture.close();
	fs.rmSync(directory, { recursive: true, force: true });
});

function download() {
	return fixture.db
		.select()
		.from(trackedDownloads)
		.where(eq(trackedDownloads.id, id))
		.get();
}

describe("completed import through its interface", () => {
	it.each(["completed", "importPending"])(
		"imports actual files and rows from %s",
		async (state) => {
			fixture.db
				.update(trackedDownloads)
				.set({ state })
				.where(eq(trackedDownloads.id, id))
				.run();
			expect(await importCompletedDownload(id)).toEqual({ status: "imported" });
			expect(download()?.state).toBe("imported");
			const files = fixture.db.select().from(bookFiles).all();
			expect(files).toHaveLength(1);
			expect(fs.readFileSync(files[0].path, "utf8")).toBe("original media");
			expect(fs.readFileSync(join(source, "book.epub"), "utf8")).toBe(
				"original media",
			);
			expect(fixture.db.select().from(history).all()).toHaveLength(1);
		},
	);

	it.each(["queued", "downloading", "imported", "failed", "removed"])(
		"rejects admission from %s without touching files or rows",
		async (state) => {
			fixture.db
				.update(trackedDownloads)
				.set({ state })
				.where(eq(trackedDownloads.id, id))
				.run();
			expect(await importCompletedDownload(id)).toMatchObject({
				status: "skipped",
			});
			expect(download()?.state).toBe(state);
			expect(fixture.db.select().from(bookFiles).all()).toEqual([]);
			expect(fs.existsSync(join(directory, "library"))).toBe(false);
		},
	);

	it("reports a normal-return failure and records its reason", async () => {
		fixture.db
			.update(trackedDownloads)
			.set({ outputPath: null })
			.where(eq(trackedDownloads.id, id))
			.run();
		expect(await importCompletedDownload(id)).toEqual({
			status: "failed",
			message: "Download output path not set",
		});
		expect(download()).toMatchObject({
			state: "failed",
			message: "Download output path not set",
		});
		expect(fixture.db.select().from(bookFiles).all()).toEqual([]);
	});

	it("leaves completed work retryable when admission fails", async () => {
		fixture.sqlite.exec(
			"CREATE TRIGGER reject_claim BEFORE UPDATE OF state ON tracked_downloads WHEN NEW.state = 'importPending' BEGIN SELECT RAISE(ABORT, 'claim unavailable'); END",
		);
		expect(await importCompletedDownload(id)).toMatchObject({
			status: "skipped",
			message: expect.stringContaining("claim unavailable"),
		});
		expect(download()?.state).toBe("completed");
		fixture.sqlite.exec("DROP TRIGGER reject_claim");
		expect(await importCompletedDownload(id)).toEqual({ status: "imported" });
	});

	it("rolls back replacement files, rows, and history on finalization failure while retaining old media", async () => {
		const oldPath = join(directory, "old.epub");
		fs.writeFileSync(oldPath, "old media");
		const row = download();
		if (!row?.bookId) throw new Error("Missing fixture book");
		const oldFile = fixture.db
			.insert(bookFiles)
			.values({ bookId: row.bookId, path: oldPath })
			.returning()
			.get();
		fixture.sqlite.exec(
			"CREATE TRIGGER reject_finalization BEFORE UPDATE OF state ON tracked_downloads WHEN NEW.state = 'imported' BEGIN SELECT RAISE(ABORT, 'finalization unavailable'); END",
		);
		await expect(importCompletedDownload(id)).rejects.toThrow(
			"finalization unavailable",
		);
		expect(download()).toMatchObject({
			state: "failed",
			message: expect.stringContaining("finalization unavailable"),
		});
		expect(fixture.db.select().from(bookFiles).all()).toEqual([oldFile]);
		expect(fixture.db.select().from(history).all()).toEqual([]);
		expect(fs.readFileSync(oldPath, "utf8")).toBe("old media");
		expect(
			fs.existsSync(
				join(directory, "library", "Unknown Author", "A Book", "book.epub"),
			),
		).toBe(false);
		expect(fs.readFileSync(join(source, "book.epub"), "utf8")).toBe(
			"original media",
		);
	});
});
