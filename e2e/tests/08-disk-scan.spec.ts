import { mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as schema from "../../src/db/schema";
import { expect, test } from "../fixtures/app";
import {
	seedAuthor,
	seedBook,
	seedDownloadProfile,
} from "../fixtures/seed-data";
import { ensureAuthenticated } from "../helpers/auth";
import { triggerScheduledTask } from "../helpers/tasks";

test.describe("Disk Scan", () => {
	let bookId: number;
	let authorId: number;

	test.beforeEach(async ({ page, appUrl, db, tempDir, checkpoint }) => {
		await ensureAuthenticated(page, appUrl);

		// Clean up data from previous tests to prevent interference
		db.delete(schema.trackedDownloads).run();
		db.delete(schema.history).run();
		db.delete(schema.bookFiles).run();
		db.delete(schema.blocklist).run();
		db.delete(schema.editionDownloadProfiles).run();
		db.delete(schema.authorDownloadProfiles).run();
		db.delete(schema.booksAuthors).run();
		db.delete(schema.editions).run();
		db.delete(schema.books).run();
		db.delete(schema.authors).run();
		db.delete(schema.downloadClients).run();
		db.delete(schema.indexers).run();
		db.delete(schema.syncedIndexers).run();
		db.delete(schema.downloadProfiles).run();

		// Seed download profile with rootFolderPath pointing to tempDir
		seedDownloadProfile(db, {
			name: "Scan Profile",
			rootFolderPath: tempDir,
			cutoff: 1,
			items: [[1], [2], [3], [4], [5]],
			upgradeAllowed: false,
			categories: [7020],
		});

		const author = seedAuthor(db, { name: "Test Author" });
		authorId = author.id;

		const book = seedBook(db, authorId, {
			title: "Test Book",
			releaseYear: 2024,
		});
		bookId = book.id;

		// Checkpoint WAL so bun:sqlite in the app server sees seeded data
		checkpoint();
	});

	test("scan discovers files in root folder", async ({
		page,
		appUrl,
		db,
		tempDir,
	}) => {
		// Create the expected directory structure: {rootFolder}/{Author Name}/{Book Title (Year)}/
		const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
		mkdirSync(bookDir, { recursive: true });
		writeFileSync(join(bookDir, "book.epub"), "dummy epub content");

		// Trigger the rescan-folders task
		await triggerScheduledTask(page, appUrl, "Rescan Folders");

		// Verify bookFiles entry was created in DB
		const files = db.select().from(schema.bookFiles).all();
		expect(files.length).toBeGreaterThanOrEqual(1);

		const bookFile = files.find((f) => f.bookId === bookId);
		expect(bookFile).toBeTruthy();
		expect(bookFile!.path).toContain("book.epub");
		expect(bookFile!.size).toBeGreaterThan(0);
	});

	test("quality matched — .epub maps to correct format", async ({
		page,
		appUrl,
		db,
		tempDir,
	}) => {
		const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
		mkdirSync(bookDir, { recursive: true });
		writeFileSync(join(bookDir, "book.epub"), "epub content for quality");

		await triggerScheduledTask(page, appUrl, "Rescan Folders");

		const files = db.select().from(schema.bookFiles).all();
		const bookFile = files.find((f) => f.bookId === bookId);
		expect(bookFile).toBeTruthy();

		// Verify quality was detected and contains EPUB
		const quality = bookFile!.quality as {
			quality: { id: number; name: string };
			revision: { version: number; real: number };
		} | null;
		expect(quality).toBeTruthy();
		expect(quality!.quality.name).toMatch(/epub/i);
	});

	test("multiple formats discovered for same book", async ({
		page,
		appUrl,
		db,
		tempDir,
	}) => {
		const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
		mkdirSync(bookDir, { recursive: true });
		writeFileSync(join(bookDir, "book.epub"), "epub content");
		writeFileSync(join(bookDir, "book.mobi"), "mobi content");

		await triggerScheduledTask(page, appUrl, "Rescan Folders");

		const files = db
			.select()
			.from(schema.bookFiles)
			.all()
			.filter((f) => f.bookId === bookId);
		expect(files.length).toBe(2);

		const paths = files.map((f) => f.path);
		expect(paths.some((p) => p.endsWith(".epub"))).toBe(true);
		expect(paths.some((p) => p.endsWith(".mobi"))).toBe(true);
	});

	test("unmatched file under unknown author folder", async ({
		page,
		appUrl,
		db,
		tempDir,
	}) => {
		// Create a folder for an author NOT in the DB
		const unknownDir = join(tempDir, "Unknown Author", "Unknown Book (2024)");
		mkdirSync(unknownDir, { recursive: true });
		writeFileSync(join(unknownDir, "book.epub"), "unmatched content");

		await triggerScheduledTask(page, appUrl, "Rescan Folders");

		// No bookFiles should be created for unknown authors
		const files = db.select().from(schema.bookFiles).all();
		expect(files).toHaveLength(0);
	});

	test("removed file detected on re-scan", async ({
		page,
		appUrl,
		db,
		tempDir,
	}) => {
		const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
		mkdirSync(bookDir, { recursive: true });
		const filePath = join(bookDir, "book.epub");
		writeFileSync(filePath, "file to be removed");

		// First scan — file is added
		await triggerScheduledTask(page, appUrl, "Rescan Folders");

		const filesAfterAdd = db.select().from(schema.bookFiles).all();
		expect(filesAfterAdd.length).toBeGreaterThanOrEqual(1);

		// Delete the file from disk
		unlinkSync(filePath);

		// Re-scan — file should be removed from DB
		await triggerScheduledTask(page, appUrl, "Rescan Folders");

		const filesAfterRemoval = db
			.select()
			.from(schema.bookFiles)
			.all()
			.filter((f) => f.bookId === bookId);
		expect(filesAfterRemoval).toHaveLength(0);
	});

	test("changed file detected on re-scan", async ({
		page,
		appUrl,
		db,
		tempDir,
	}) => {
		const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
		mkdirSync(bookDir, { recursive: true });
		const filePath = join(bookDir, "book.epub");
		writeFileSync(filePath, "original content");

		// First scan
		await triggerScheduledTask(page, appUrl, "Rescan Folders");

		const filesAfterFirst = db.select().from(schema.bookFiles).all();
		expect(filesAfterFirst.length).toBeGreaterThanOrEqual(1);
		const originalSize = filesAfterFirst[0].size;

		// Overwrite with larger content
		writeFileSync(
			filePath,
			"this is significantly larger content than before for the updated file",
		);

		// Verify file size actually changed on disk
		const newStat = statSync(filePath);
		expect(newStat.size).not.toBe(originalSize);

		// Re-scan — size should be updated
		await triggerScheduledTask(page, appUrl, "Rescan Folders");

		const filesAfterUpdate = db.select().from(schema.bookFiles).all();
		expect(filesAfterUpdate.length).toBeGreaterThanOrEqual(1);
		expect(filesAfterUpdate[0].size).toBe(newStat.size);
	});

	test("history entries for fileAdded and fileRemoved", async ({
		page,
		appUrl,
		db,
		tempDir,
	}) => {
		const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
		mkdirSync(bookDir, { recursive: true });
		const filePath = join(bookDir, "book.epub");
		writeFileSync(filePath, "history test content");

		// Scan to add the file
		await triggerScheduledTask(page, appUrl, "Rescan Folders");

		// Verify fileAdded history entry
		const addedEntries = db
			.select()
			.from(schema.history)
			.all()
			.filter((h) => h.eventType === "bookFileAdded");
		expect(addedEntries.length).toBeGreaterThanOrEqual(1);
		expect(addedEntries[0].bookId).toBe(bookId);

		// Delete the file and re-scan
		unlinkSync(filePath);
		await triggerScheduledTask(page, appUrl, "Rescan Folders");

		// Verify fileRemoved history entry
		const removedEntries = db
			.select()
			.from(schema.history)
			.all()
			.filter((h) => h.eventType === "bookFileRemoved");
		expect(removedEntries.length).toBeGreaterThanOrEqual(1);
		expect(removedEntries[0].bookId).toBe(bookId);
	});
});
