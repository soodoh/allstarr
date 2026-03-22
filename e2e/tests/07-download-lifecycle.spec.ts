import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/app";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import captureSSEEvents from "../helpers/sse";
import {
  seedAuthor,
  seedBook,
  seedEdition,
  seedDownloadClient,
  seedDownloadProfile,
  seedTrackedDownload,
  seedSetting,
} from "../fixtures/seed-data";
import PORTS from "../ports";

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

test.describe("Download Lifecycle", () => {
  let bookId: number;
  let authorId: number;
  let profileId: number;
  let clientId: number;

  test.beforeEach(async ({ page, appUrl, testDb, tempDir, fakeServers }) => {
    await ensureAuthenticated(page, appUrl);

    // Clean up data from previous tests to prevent interference
    await testDb.cleanAll();

    // Use tempDir as root folder for real filesystem operations
    const profile = await seedDownloadProfile(testDb, {
      name: "Lifecycle Profile",
      rootFolderPath: tempDir,
      cutoff: 1,
      items: [1, 2, 3, 4, 5],
      upgradeAllowed: false,
      categories: [7020],
    });
    profileId = profile.id as number;

    const author = await seedAuthor(testDb, { name: "Lifecycle Author" });
    authorId = author.id as number;

    const book = await seedBook(testDb, authorId, {
      title: "Lifecycle Book",
      releaseYear: 2024,
    });
    bookId = book.id as number;

    const edition = await seedEdition(testDb, bookId, {
      title: "Lifecycle Book - EPUB",
    });

    // Assign profile to author and edition
    await testDb.insert("authorDownloadProfiles", {
      authorId,
      downloadProfileId: profileId,
    });
    await testDb.insert("editionDownloadProfiles", {
      editionId: edition.id,
      downloadProfileId: profileId,
    });

    // Seed download client
    const client = await seedDownloadClient(testDb, {
      name: "Lifecycle qBittorrent",
      implementation: "qBittorrent",
      protocol: "torrent",
      port: PORTS.QBITTORRENT,
      removeCompletedDownloads: true,
    });
    clientId = client.id as number;

    // Configure fake qBittorrent
    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({ version: "v4.6.3" }),
    });
  });

  test("download progresses from queued to downloading", async ({
    page,
    appUrl,
    testDb,
    fakeServers,
  }) => {
    // Seed a tracked download in "queued" state
    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "lifecycle-hash-1",
      releaseTitle: "Lifecycle Author - Lifecycle Book [EPUB]",
      protocol: "torrent",
      state: "queued",
      bookId,
      authorId,
      downloadProfileId: profileId,
    });

    // Configure fake qBittorrent to show the torrent as downloading
    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "lifecycle-hash-1",
            name: "Lifecycle Author - Lifecycle Book [EPUB]",
            state: "downloading",
            size: 5_242_880,
            downloaded: 2_621_440,
            dlspeed: 1_048_576,
            upspeed: 0,
            category: "allstarr",
            save_path: "/downloads",
          },
        ],
      }),
    });

    // Trigger the refresh-downloads task
    await triggerTask(page, appUrl, "Refresh Downloads");

    // Verify the tracked download state was updated to "downloading"
    const tracked = await testDb.select("trackedDownloads");
    const download = tracked.find((t) => t.downloadId === "lifecycle-hash-1");
    expect(download).toBeTruthy();
    expect(download!.state).toBe("downloading");
  });

  test("download completes and triggers import", async ({
    page,
    appUrl,
    testDb,
    tempDir,
    fakeServers,
  }) => {
    // Create a fake completed download directory with a book file
    const downloadDir = join(
      tempDir,
      "downloads",
      "Lifecycle Author - Lifecycle Book [EPUB]",
    );
    mkdirSync(downloadDir, { recursive: true });
    writeFileSync(join(downloadDir, "book.epub"), "dummy epub content");

    // Seed a tracked download in "queued" state
    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "lifecycle-hash-2",
      releaseTitle: "Lifecycle Author - Lifecycle Book [EPUB]",
      protocol: "torrent",
      state: "queued",
      bookId,
      authorId,
      downloadProfileId: profileId,
    });

    // Configure fake qBittorrent to show the torrent as completed
    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "lifecycle-hash-2",
            name: "Lifecycle Author - Lifecycle Book [EPUB]",
            state: "uploading",
            size: 5_242_880,
            downloaded: 5_242_880,
            dlspeed: 0,
            upspeed: 524_288,
            category: "allstarr",
            save_path: downloadDir,
          },
        ],
      }),
    });

    // Trigger refresh-downloads
    await triggerTask(page, appUrl, "Refresh Downloads");

    // Verify tracked download reached "imported" state
    await expect(async () => {
      const tracked = await testDb.select("trackedDownloads");
      const dl = tracked.find((t) => t.downloadId === "lifecycle-hash-2");
      expect(dl).toBeTruthy();
      // State should be completed, importPending, or imported
      expect(["completed", "importPending", "imported"]).toContain(dl!.state);
    }).toPass({ timeout: 10_000 });
  });

  test("file imported to library creates bookFiles entry", async ({
    page,
    appUrl,
    testDb,
    tempDir,
    fakeServers,
  }) => {
    const downloadDir = join(
      tempDir,
      "downloads",
      "Lifecycle Author - Lifecycle Book [EPUB]",
    );
    mkdirSync(downloadDir, { recursive: true });
    writeFileSync(
      join(downloadDir, "book.epub"),
      "dummy epub content for import",
    );

    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "lifecycle-hash-3",
      releaseTitle: "Lifecycle Author - Lifecycle Book [EPUB]",
      protocol: "torrent",
      state: "queued",
      bookId,
      authorId,
      downloadProfileId: profileId,
    });

    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "lifecycle-hash-3",
            name: "Lifecycle Author - Lifecycle Book [EPUB]",
            state: "uploading",
            size: 5_242_880,
            downloaded: 5_242_880,
            dlspeed: 0,
            upspeed: 0,
            category: "allstarr",
            save_path: downloadDir,
          },
        ],
      }),
    });

    await triggerTask(page, appUrl, "Refresh Downloads");

    // Verify bookFiles entry was created
    await expect(async () => {
      const files = await testDb.select("bookFiles");
      expect(files.length).toBeGreaterThanOrEqual(1);
      expect(files[0].bookId).toBe(bookId);
      // Verify the file was placed in the root folder (tempDir)
      expect(files[0].path).toContain(tempDir);
    }).toPass({ timeout: 10_000 });

    // Verify the file actually exists on disk
    const files = await testDb.select("bookFiles");
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(existsSync(files[0].path as string)).toBe(true);
  });

  test("history records lifecycle events", async ({
    page,
    appUrl,
    testDb,
    tempDir,
    fakeServers,
  }) => {
    const downloadDir = join(
      tempDir,
      "downloads",
      "Lifecycle Author - Lifecycle Book [EPUB]",
    );
    mkdirSync(downloadDir, { recursive: true });
    writeFileSync(join(downloadDir, "book.epub"), "dummy content for history");

    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "lifecycle-hash-4",
      releaseTitle: "Lifecycle Author - Lifecycle Book [EPUB]",
      protocol: "torrent",
      state: "queued",
      bookId,
      authorId,
      downloadProfileId: profileId,
    });

    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "lifecycle-hash-4",
            name: "Lifecycle Author - Lifecycle Book [EPUB]",
            state: "uploading",
            size: 5_242_880,
            downloaded: 5_242_880,
            dlspeed: 0,
            upspeed: 0,
            category: "allstarr",
            save_path: downloadDir,
          },
        ],
      }),
    });

    await triggerTask(page, appUrl, "Refresh Downloads");

    // Verify history entries were created
    await expect(async () => {
      const historyEntries = await testDb.select("history");
      const importEntry = historyEntries.find(
        (h) => h.eventType === "bookImported",
      );
      expect(importEntry).toBeTruthy();
      expect(importEntry!.bookId).toBe(bookId);
    }).toPass({ timeout: 10_000 });
  });

  test("SSE events fire during lifecycle", async ({
    page,
    appUrl,
    testDb,
    tempDir,
    fakeServers,
  }) => {
    const downloadDir = join(
      tempDir,
      "downloads",
      "Lifecycle Author - Lifecycle Book [EPUB]",
    );
    mkdirSync(downloadDir, { recursive: true });
    writeFileSync(join(downloadDir, "book.epub"), "dummy content for sse");

    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "lifecycle-hash-5",
      releaseTitle: "Lifecycle Author - Lifecycle Book [EPUB]",
      protocol: "torrent",
      state: "queued",
      bookId,
      authorId,
      downloadProfileId: profileId,
    });

    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "lifecycle-hash-5",
            name: "Lifecycle Author - Lifecycle Book [EPUB]",
            state: "uploading",
            size: 5_242_880,
            downloaded: 5_242_880,
            dlspeed: 0,
            upspeed: 0,
            category: "allstarr",
            save_path: downloadDir,
          },
        ],
      }),
    });

    // Navigate to the tasks page first, then capture SSE events while clicking
    // Run — this avoids navigating away (which destroys the EventSource context).
    await navigateTo(page, appUrl, "/system/tasks");
    const taskRow = page
      .getByRole("row")
      .filter({ hasText: "Refresh Downloads" });
    await expect(taskRow).toBeVisible({ timeout: 10_000 });

    const events = await captureSSEEvents(
      page,
      appUrl,
      ["queueUpdated", "queueProgress", "downloadCompleted", "importCompleted"],
      async () => {
        await taskRow.getByRole("button").last().click();
        // Wait for task to complete without navigating
        await expect(async () => {
          const isRunning = await taskRow.getByText("Running").isVisible();
          expect(isRunning).toBe(false);
        }).toPass({ timeout: 30_000 });
      },
      10_000,
    );

    // Should have received at least one event (queueUpdated or queueProgress)
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  test("completed download removed from client when setting enabled", async ({
    page,
    appUrl,
    testDb,
    tempDir,
    fakeServers,
  }) => {
    const downloadDir = join(
      tempDir,
      "downloads",
      "Lifecycle Author - Lifecycle Book [EPUB]",
    );
    mkdirSync(downloadDir, { recursive: true });
    writeFileSync(join(downloadDir, "book.epub"), "dummy content for removal");

    // The client has removeCompletedDownloads: true (set in beforeEach)
    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "lifecycle-hash-6",
      releaseTitle: "Lifecycle Author - Lifecycle Book [EPUB]",
      protocol: "torrent",
      state: "queued",
      bookId,
      authorId,
      downloadProfileId: profileId,
    });

    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "lifecycle-hash-6",
            name: "Lifecycle Author - Lifecycle Book [EPUB]",
            state: "uploading",
            size: 5_242_880,
            downloaded: 5_242_880,
            dlspeed: 0,
            upspeed: 0,
            category: "allstarr",
            save_path: downloadDir,
          },
        ],
      }),
    });

    await triggerTask(page, appUrl, "Refresh Downloads");

    // Wait for the import + removal to complete
    await expect(async () => {
      const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
        (r) => r.json(),
      );
      // The client should have received a delete command for the completed download
      expect(qbState.removedIds.length).toBeGreaterThanOrEqual(1);
      expect(qbState.removedIds).toContain("lifecycle-hash-6");
    }).toPass({ timeout: 15_000 });
  });

  test("naming template applied to imported files", async ({
    page,
    appUrl,
    testDb,
    tempDir,
    fakeServers,
  }) => {
    // Enable rename books and set custom naming template
    await seedSetting(testDb, "mediaManagement.renameBooks", true);
    await seedSetting(
      testDb,
      "naming.bookFile",
      "{Author Name} - {Book Title} ({Release Year})",
    );

    const downloadDir = join(
      tempDir,
      "downloads",
      "Lifecycle Author - Lifecycle Book [EPUB]",
    );
    mkdirSync(downloadDir, { recursive: true });
    writeFileSync(join(downloadDir, "book.epub"), "dummy content for naming");

    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "lifecycle-hash-7",
      releaseTitle: "Lifecycle Author - Lifecycle Book [EPUB]",
      protocol: "torrent",
      state: "queued",
      bookId,
      authorId,
      downloadProfileId: profileId,
    });

    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "lifecycle-hash-7",
            name: "Lifecycle Author - Lifecycle Book [EPUB]",
            state: "uploading",
            size: 5_242_880,
            downloaded: 5_242_880,
            dlspeed: 0,
            upspeed: 0,
            category: "allstarr",
            save_path: downloadDir,
          },
        ],
      }),
    });

    await triggerTask(page, appUrl, "Refresh Downloads");

    // Verify the file was renamed according to the template
    await expect(async () => {
      const files = await testDb.select("bookFiles");
      expect(files.length).toBeGreaterThanOrEqual(1);
      // The file path should contain the naming template pattern
      const filePath = files[0].path as string;
      expect(filePath).toContain("Lifecycle Author");
      expect(filePath).toContain("Lifecycle Book");
      expect(filePath).toContain("2024");
    }).toPass({ timeout: 10_000 });
  });

  test("hard links vs copy behavior", async ({
    page,
    appUrl,
    testDb,
    tempDir,
    fakeServers,
  }) => {
    // Enable hard links
    await seedSetting(testDb, "mediaManagement.useHardLinks", true);

    const downloadDir = join(
      tempDir,
      "downloads",
      "Lifecycle Author - Lifecycle Book [EPUB]",
    );
    mkdirSync(downloadDir, { recursive: true });
    const sourceFile = join(downloadDir, "book.epub");
    writeFileSync(sourceFile, "dummy content for hardlink test");

    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "lifecycle-hash-8",
      releaseTitle: "Lifecycle Author - Lifecycle Book [EPUB]",
      protocol: "torrent",
      state: "queued",
      bookId,
      authorId,
      downloadProfileId: profileId,
    });

    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "lifecycle-hash-8",
            name: "Lifecycle Author - Lifecycle Book [EPUB]",
            state: "uploading",
            size: 5_242_880,
            downloaded: 5_242_880,
            dlspeed: 0,
            upspeed: 0,
            category: "allstarr",
            save_path: downloadDir,
          },
        ],
      }),
    });

    await triggerTask(page, appUrl, "Refresh Downloads");

    // Verify the file was imported
    await expect(async () => {
      const files = await testDb.select("bookFiles");
      expect(files.length).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 10_000 });

    // Check if hard link was used (same inode) on the same filesystem
    const files = await testDb.select("bookFiles");
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(existsSync(files[0].path as string)).toBe(true);
    expect(existsSync(sourceFile)).toBe(true);
    const sourceIno = statSync(sourceFile).ino;
    const destIno = statSync(files[0].path as string).ino;
    // On the same filesystem, hard links share the same inode
    expect(destIno).toBe(sourceIno);
  });
});
