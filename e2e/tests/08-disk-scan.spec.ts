import { mkdirSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/app";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import {
  seedAuthor,
  seedBook,
  seedDownloadProfile,
} from "../fixtures/seed-data";

/**
 * Helper: trigger a scheduled task via the System > Tasks UI page and wait for completion.
 */
async function triggerTask(
  page: Page,
  appUrl: string,
  taskName: string,
): Promise<void> {
  await navigateTo(page, appUrl, "/system/tasks");

  const row = page.getByRole("row").filter({ hasText: taskName });
  await expect(row).toBeVisible({ timeout: 10_000 });

  // Wait for the Run button to be enabled
  const runBtn = row.getByRole("button").last();
  await expect(runBtn).toBeEnabled({ timeout: 5000 });
  await runBtn.click();

  // Wait for the task to start running, then wait for it to finish
  await expect(async () => {
    const status = await row
      .getByText(/Running|Success|Error/)
      .first()
      .textContent();
    expect(status).not.toBe("Running");
  }).toPass({ timeout: 30_000 });

  await page.waitForTimeout(500);
}

test.describe("Disk Scan", () => {
  let bookId: number;
  let authorId: number;

  test.beforeEach(async ({ page, appUrl, testDb, tempDir }) => {
    await ensureAuthenticated(page, appUrl);

    // Clean up data from previous tests to prevent interference
    await testDb.cleanAll();

    // Seed download profile with rootFolderPath pointing to tempDir
    await seedDownloadProfile(testDb, {
      name: "Scan Profile",
      rootFolderPath: tempDir,
      cutoff: 1,
      items: [1, 2, 3, 4, 5],
      upgradeAllowed: false,
      categories: [7020],
    });

    const author = await seedAuthor(testDb, { name: "Test Author" });
    authorId = author.id as number;

    const book = await seedBook(testDb, authorId, {
      title: "Test Book",
      releaseYear: 2024,
    });
    bookId = book.id as number;
  });

  test("scan discovers files in root folder", async ({
    page,
    appUrl,
    testDb,
    tempDir,
  }) => {
    // Create the expected directory structure: {rootFolder}/{Author Name}/{Book Title (Year)}/
    const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
    mkdirSync(bookDir, { recursive: true });
    writeFileSync(join(bookDir, "book.epub"), "dummy epub content");

    // Trigger the rescan-folders task
    await triggerTask(page, appUrl, "Rescan Folders");

    // Verify bookFiles entry was created in DB
    const files = await testDb.select("bookFiles");
    expect(files.length).toBeGreaterThanOrEqual(1);

    const bookFile = files.find((f) => f.bookId === bookId);
    expect(bookFile).toBeTruthy();
    expect(bookFile!.path).toContain("book.epub");
    expect(bookFile!.size).toBeGreaterThan(0);
  });

  test("quality matched — .epub maps to correct format", async ({
    page,
    appUrl,
    testDb,
    tempDir,
  }) => {
    const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
    mkdirSync(bookDir, { recursive: true });
    writeFileSync(join(bookDir, "book.epub"), "epub content for quality");

    await triggerTask(page, appUrl, "Rescan Folders");

    const files = await testDb.select("bookFiles");
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
    testDb,
    tempDir,
  }) => {
    const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
    mkdirSync(bookDir, { recursive: true });
    writeFileSync(join(bookDir, "book.epub"), "epub content");
    writeFileSync(join(bookDir, "book.mobi"), "mobi content");

    await triggerTask(page, appUrl, "Rescan Folders");

    const allFiles = await testDb.select("bookFiles");
    const files = allFiles.filter((f) => f.bookId === bookId);
    expect(files.length).toBe(2);

    const paths = files.map((f) => f.path as string);
    expect(paths.some((p) => p.endsWith(".epub"))).toBe(true);
    expect(paths.some((p) => p.endsWith(".mobi"))).toBe(true);
  });

  test("unmatched file under unknown author folder", async ({
    page,
    appUrl,
    testDb,
    tempDir,
  }) => {
    // Create a folder for an author NOT in the DB
    const unknownDir = join(tempDir, "Unknown Author", "Unknown Book (2024)");
    mkdirSync(unknownDir, { recursive: true });
    writeFileSync(join(unknownDir, "book.epub"), "unmatched content");

    await triggerTask(page, appUrl, "Rescan Folders");

    // No bookFiles should be created for unknown authors
    const files = await testDb.select("bookFiles");
    expect(files).toHaveLength(0);
  });

  test("removed file detected on re-scan", async ({
    page,
    appUrl,
    testDb,
    tempDir,
  }) => {
    const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
    mkdirSync(bookDir, { recursive: true });
    const filePath = join(bookDir, "book.epub");
    writeFileSync(filePath, "file to be removed");

    // First scan — file is added
    await triggerTask(page, appUrl, "Rescan Folders");

    const filesAfterAdd = await testDb.select("bookFiles");
    expect(filesAfterAdd.length).toBeGreaterThanOrEqual(1);

    // Delete the file from disk
    unlinkSync(filePath);

    // Re-scan — file should be removed from DB
    await triggerTask(page, appUrl, "Rescan Folders");

    const allFiles = await testDb.select("bookFiles");
    const filesAfterRemoval = allFiles.filter((f) => f.bookId === bookId);
    expect(filesAfterRemoval).toHaveLength(0);
  });

  test("changed file detected on re-scan", async ({
    page,
    appUrl,
    testDb,
    tempDir,
  }) => {
    const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
    mkdirSync(bookDir, { recursive: true });
    const filePath = join(bookDir, "book.epub");
    writeFileSync(filePath, "original content");

    // First scan
    await triggerTask(page, appUrl, "Rescan Folders");

    const filesAfterFirst = await testDb.select("bookFiles");
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
    await triggerTask(page, appUrl, "Rescan Folders");

    const filesAfterUpdate = await testDb.select("bookFiles");
    expect(filesAfterUpdate.length).toBeGreaterThanOrEqual(1);
    expect(filesAfterUpdate[0].size).toBe(newStat.size);
  });

  test("history entries for fileAdded and fileRemoved", async ({
    page,
    appUrl,
    testDb,
    tempDir,
  }) => {
    const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
    mkdirSync(bookDir, { recursive: true });
    const filePath = join(bookDir, "book.epub");
    writeFileSync(filePath, "history test content");

    // Scan to add the file
    await triggerTask(page, appUrl, "Rescan Folders");

    // Verify fileAdded history entry
    const allHistory = await testDb.select("history");
    const addedEntries = allHistory.filter(
      (h) => h.eventType === "bookFileAdded",
    );
    expect(addedEntries.length).toBeGreaterThanOrEqual(1);
    expect(addedEntries[0].bookId).toBe(bookId);

    // Delete the file and re-scan
    unlinkSync(filePath);
    await triggerTask(page, appUrl, "Rescan Folders");

    // Verify fileRemoved history entry
    const allHistoryAfter = await testDb.select("history");
    const removedEntries = allHistoryAfter.filter(
      (h) => h.eventType === "bookFileRemoved",
    );
    expect(removedEntries.length).toBeGreaterThanOrEqual(1);
    expect(removedEntries[0].bookId).toBe(bookId);
  });
});
