import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/app";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import captureSSEEvents from "../helpers/sse";
import * as schema from "../../src/db/schema";
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
  // Reset server caches + clear stale running-task state before triggering
  await fetch(`${appUrl}/api/__test-reset`, { method: "POST" }).catch(() => {
    /* best-effort */
  });

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

  test.beforeEach(
    async ({ page, appUrl, db, tempDir, fakeServers, checkpoint }) => {
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

      // Use tempDir as root folder for real filesystem operations
      const profile = seedDownloadProfile(db, {
        name: "Lifecycle Profile",
        rootFolderPath: tempDir,
        cutoff: 1,
        items: [1, 2, 3, 4, 5],
        upgradeAllowed: false,
        categories: [7020],
      });
      profileId = profile.id;

      const author = seedAuthor(db, { name: "Lifecycle Author" });
      authorId = author.id;

      const book = seedBook(db, authorId, {
        title: "Lifecycle Book",
        releaseYear: 2024,
      });
      bookId = book.id;

      const edition = seedEdition(db, bookId, {
        title: "Lifecycle Book - EPUB",
      });

      // Assign profile to author and edition
      db.insert(schema.authorDownloadProfiles)
        .values({ authorId, downloadProfileId: profileId })
        .run();
      db.insert(schema.editionDownloadProfiles)
        .values({ editionId: edition.id, downloadProfileId: profileId })
        .run();

      // Seed download client
      const client = seedDownloadClient(db, {
        name: "Lifecycle qBittorrent",
        implementation: "qBittorrent",
        protocol: "torrent",
        port: PORTS.QBITTORRENT,
        removeCompletedDownloads: true,
      });
      clientId = client.id;

      // Checkpoint WAL so bun:sqlite in the app server sees seeded data
      checkpoint();

      // Configure fake qBittorrent
      await fetch(`${fakeServers.QBITTORRENT}/__control`, {
        method: "POST",
        body: JSON.stringify({ version: "v4.6.3" }),
      });
    },
  );

  test("download progresses from queued to downloading", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // Seed a tracked download in "queued" state
    seedTrackedDownload(db, {
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
    const tracked = db.select().from(schema.trackedDownloads).all();
    const download = tracked.find((t) => t.downloadId === "lifecycle-hash-1");
    expect(download).toBeTruthy();
    expect(download!.state).toBe("downloading");
  });

  test("download completes and triggers import", async ({
    page,
    appUrl,
    db,
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
    seedTrackedDownload(db, {
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
      const tracked = db.select().from(schema.trackedDownloads).all();
      const dl = tracked.find((t) => t.downloadId === "lifecycle-hash-2");
      expect(dl).toBeTruthy();
      // State should be completed, importPending, or imported
      expect(["completed", "importPending", "imported"]).toContain(dl!.state);
    }).toPass({ timeout: 10_000 });
  });

  test("file imported to library creates bookFiles entry", async ({
    page,
    appUrl,
    db,
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

    seedTrackedDownload(db, {
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
      const files = db.select().from(schema.bookFiles).all();
      expect(files.length).toBeGreaterThanOrEqual(1);
      expect(files[0].bookId).toBe(bookId);
      // Verify the file was placed in the root folder (tempDir)
      expect(files[0].path).toContain(tempDir);
    }).toPass({ timeout: 10_000 });

    // Verify the file actually exists on disk
    const files = db.select().from(schema.bookFiles).all();
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(existsSync(files[0].path)).toBe(true);
  });

  test("history records lifecycle events", async ({
    page,
    appUrl,
    db,
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

    seedTrackedDownload(db, {
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
      const historyEntries = db.select().from(schema.history).all();
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
    db,
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

    seedTrackedDownload(db, {
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
    db,
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
    seedTrackedDownload(db, {
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
    db,
    tempDir,
    fakeServers,
  }) => {
    // Enable rename books and set custom naming template
    seedSetting(db, "mediaManagement.renameBooks", true);
    seedSetting(
      db,
      "naming.ebook.bookFile",
      "{Author Name} - {Book Title} ({Release Year})",
    );

    const downloadDir = join(
      tempDir,
      "downloads",
      "Lifecycle Author - Lifecycle Book [EPUB]",
    );
    mkdirSync(downloadDir, { recursive: true });
    writeFileSync(join(downloadDir, "book.epub"), "dummy content for naming");

    seedTrackedDownload(db, {
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
      const files = db.select().from(schema.bookFiles).all();
      expect(files.length).toBeGreaterThanOrEqual(1);
      // The file path should contain the naming template pattern
      const filePath = files[0].path;
      expect(filePath).toContain("Lifecycle Author");
      expect(filePath).toContain("Lifecycle Book");
      expect(filePath).toContain("2024");
    }).toPass({ timeout: 10_000 });
  });

  test("hard links vs copy behavior", async ({
    page,
    appUrl,
    db,
    tempDir,
    fakeServers,
  }) => {
    // Enable hard links
    seedSetting(db, "mediaManagement.useHardLinks", true);

    const downloadDir = join(
      tempDir,
      "downloads",
      "Lifecycle Author - Lifecycle Book [EPUB]",
    );
    mkdirSync(downloadDir, { recursive: true });
    const sourceFile = join(downloadDir, "book.epub");
    writeFileSync(sourceFile, "dummy content for hardlink test");

    seedTrackedDownload(db, {
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
      const files = db.select().from(schema.bookFiles).all();
      expect(files.length).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 10_000 });

    // Check if hard link was used (same inode) on the same filesystem
    const files = db.select().from(schema.bookFiles).all();
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(existsSync(files[0].path)).toBe(true);
    expect(existsSync(sourceFile)).toBe(true);
    const sourceIno = statSync(sourceFile).ino;
    const destIno = statSync(files[0].path).ino;
    // On the same filesystem, hard links share the same inode
    expect(destIno).toBe(sourceIno);
  });

  test("multi-file audiobook import assigns part numbers", async ({
    page,
    appUrl,
    db,
    tempDir,
    fakeServers,
  }) => {
    const downloadDir = join(
      tempDir,
      "downloads",
      "Lifecycle Author - Lifecycle Book [MP3]",
    );
    mkdirSync(downloadDir, { recursive: true });

    // Create 3 chapter files
    writeFileSync(join(downloadDir, "Chapter 01.mp3"), "audio chapter 1");
    writeFileSync(join(downloadDir, "Chapter 02.mp3"), "audio chapter 2");
    writeFileSync(join(downloadDir, "Chapter 03.mp3"), "audio chapter 3");

    seedTrackedDownload(db, {
      downloadClientId: clientId,
      downloadId: "lifecycle-hash-audiobook",
      releaseTitle: "Lifecycle Author - Lifecycle Book [MP3]",
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
            hash: "lifecycle-hash-audiobook",
            name: "Lifecycle Author - Lifecycle Book [MP3]",
            state: "uploading",
            size: 15_000_000,
            downloaded: 15_000_000,
            dlspeed: 0,
            upspeed: 0,
            category: "allstarr",
            save_path: downloadDir,
          },
        ],
      }),
    });

    await triggerTask(page, appUrl, "Refresh Downloads");

    // Verify all 3 files were imported with correct part numbers
    await expect(async () => {
      const files = db
        .select()
        .from(schema.bookFiles)
        .all()
        .filter((f) => f.path.endsWith(".mp3"));
      expect(files.length).toBe(3);

      // Sort by part number for predictable assertions
      const sorted = files.toSorted((a, b) => a.part! - b.part!);
      expect(sorted[0].part).toBe(1);
      expect(sorted[0].partCount).toBe(3);
      expect(sorted[1].part).toBe(2);
      expect(sorted[1].partCount).toBe(3);
      expect(sorted[2].part).toBe(3);
      expect(sorted[2].partCount).toBe(3);
    }).toPass({ timeout: 10_000 });
  });
});
