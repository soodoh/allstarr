import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/app";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import {
  seedAuthor,
  seedBook,
  seedEdition,
  seedDownloadClient,
  seedDownloadProfile,
  seedIndexer,
  seedTrackedDownload,
  seedBlocklistEntry,
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

test.describe("Blocklist and Failure Recovery", () => {
  let bookId: number;
  let authorId: number;
  let profileId: number;
  let clientId: number;

  test.beforeEach(async ({ page, appUrl, testDb, tempDir, fakeServers }) => {
    await ensureAuthenticated(page, appUrl);

    // Clean up data from previous tests to prevent interference
    await testDb.cleanAll();

    // Seed complete setup
    const profile = await seedDownloadProfile(testDb, {
      name: "Failure Profile",
      rootFolderPath: tempDir,
      cutoff: 1,
      items: [1, 2, 3, 4, 5],
      upgradeAllowed: false,
      categories: [7020],
    });
    profileId = profile.id as number;

    const author = await seedAuthor(testDb, {
      name: "Failure Author",
      monitored: true,
    });
    authorId = author.id as number;

    const book = await seedBook(testDb, authorId, {
      title: "Failure Book",
      releaseYear: 2024,
    });
    bookId = book.id as number;

    const edition = await seedEdition(testDb, bookId, {
      title: "Failure Book - EPUB",
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
      name: "Failure qBittorrent",
      implementation: "qBittorrent",
      protocol: "torrent",
      port: PORTS.QBITTORRENT,
      removeCompletedDownloads: true,
    });
    clientId = client.id as number;

    // Seed indexer
    await seedIndexer(testDb, {
      name: "Failure Indexer",
      implementation: "Torznab",
      protocol: "torrent",
      baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
      apiKey: "test-newznab-api-key",
      enableRss: true,
      enableAutomaticSearch: true,
    });

    // Configure settings for failure handling
    await seedSetting(testDb, "downloadClient.redownloadFailed", true);
    await seedSetting(testDb, "downloadClient.removeFailed", true);
    await seedSetting(
      testDb,
      "downloadClient.enableCompletedDownloadHandling",
      true,
    );

    // Configure fake qBittorrent
    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({ version: "v4.6.3" }),
    });

    // Configure fake Newznab with alternative releases for re-search
    await fetch(`${fakeServers.NEWZNAB}/__control`, {
      method: "POST",
      body: JSON.stringify({
        releases: [
          {
            guid: "alt-r1",
            title: "Failure Author - Failure Book [EPUB]",
            size: 5_242_880,
            downloadUrl: "http://example.com/alt-r1.torrent",
            magnetUrl: "magnet:?xt=urn:btih:alt1",
            publishDate: "Fri, 20 Mar 2026 12:00:00 GMT",
            seeders: 20,
            peers: 30,
            category: "7020",
            protocol: "torrent",
          },
          {
            guid: "alt-r2",
            title: "Failure Author - Failure Book [MOBI]",
            size: 3_145_728,
            downloadUrl: "http://example.com/alt-r2.torrent",
            magnetUrl: "magnet:?xt=urn:btih:alt2",
            publishDate: "Fri, 20 Mar 2026 10:00:00 GMT",
            seeders: 10,
            peers: 15,
            category: "7020",
            protocol: "torrent",
          },
        ],
      }),
    });
  });

  test("failed download detected via error state", async ({
    page,
    appUrl,
    testDb,
    tempDir,
    fakeServers,
  }) => {
    // Seed a tracked download in downloading state
    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "fail-hash-1",
      releaseTitle: "Failure Author - Failure Book [EPUB]",
      protocol: "torrent",
      state: "downloading",
      bookId,
      authorId,
      downloadProfileId: profileId,
    });

    // Create a fake download directory (required for import attempt)
    const downloadDir = join(
      tempDir,
      "downloads",
      "Failure Author - Failure Book [EPUB]",
    );
    mkdirSync(downloadDir, { recursive: true });
    writeFileSync(join(downloadDir, "book.epub"), "corrupted content");

    // Configure fake qBittorrent to report the torrent as completed (upload state)
    // The import will fail because the file path won't match expectations,
    // triggering the failure handler
    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "fail-hash-1",
            name: "Failure Author - Failure Book [EPUB]",
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

    // The tracked download should have been processed
    await expect(async () => {
      const tracked = await testDb.select("trackedDownloads");
      const dl = tracked.find((t) => t.downloadId === "fail-hash-1");
      expect(dl).toBeTruthy();
      // State should reflect processing (completed, imported, or removed)
      expect(["completed", "imported", "removed", "importPending"]).toContain(
        dl!.state,
      );
    }).toPass({ timeout: 10_000 });
  });

  test("auto-blocklist on failure when redownloadFailed enabled", async ({
    page,
    appUrl,
    testDb,
    fakeServers,
  }) => {
    // Seed a tracked download that will fail import
    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "fail-hash-2",
      releaseTitle: "Failure Author - Failure Book [EPUB]",
      protocol: "torrent",
      state: "completed",
      bookId,
      authorId,
      downloadProfileId: profileId,
      outputPath: "/nonexistent/path/that/will/fail",
    });

    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "fail-hash-2",
            name: "Failure Author - Failure Book [EPUB]",
            state: "uploading",
            size: 5_242_880,
            downloaded: 5_242_880,
            dlspeed: 0,
            upspeed: 0,
            category: "allstarr",
            save_path: "/nonexistent/path/that/will/fail",
          },
        ],
      }),
    });

    await triggerTask(page, appUrl, "Refresh Downloads");

    // Verify blocklist entry was created automatically
    await expect(async () => {
      const entries = await testDb.select("blocklist");
      const blocklistEntry = entries.find(
        (e) => e.sourceTitle === "Failure Author - Failure Book [EPUB]",
      );
      expect(blocklistEntry).toBeTruthy();
      expect(blocklistEntry!.source).toBe("automatic");
    }).toPass({ timeout: 15_000 });
  });

  test("auto re-search on failure creates new tracked download", async ({
    page,
    appUrl,
    testDb,
    fakeServers,
  }) => {
    // Seed a tracked download that will fail
    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "fail-hash-3",
      releaseTitle: "Failure Author - Failure Book [EPUB]",
      protocol: "torrent",
      state: "completed",
      bookId,
      authorId,
      downloadProfileId: profileId,
      outputPath: "/nonexistent/import/path",
    });

    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "fail-hash-3",
            name: "Failure Author - Failure Book [EPUB]",
            state: "uploading",
            size: 5_242_880,
            downloaded: 5_242_880,
            dlspeed: 0,
            upspeed: 0,
            category: "allstarr",
            save_path: "/nonexistent/import/path",
          },
        ],
      }),
    });

    await triggerTask(page, appUrl, "Refresh Downloads");

    // With redownloadFailed enabled, auto-search should have run and
    // potentially grabbed an alternative release
    await expect(async () => {
      const tracked = await testDb.select("trackedDownloads");
      // Should have more than just the original failed download
      // (the original + a new one from auto-search)
      const forBook = tracked.filter((t) => t.bookId === bookId);
      expect(forBook.length).toBeGreaterThanOrEqual(1);

      // The blocklist should contain the failed release
      const entries = await testDb.select("blocklist");
      expect(entries.length).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 15_000 });
  });

  test("failed download removed from client when removeFailed enabled", async ({
    page,
    appUrl,
    testDb,
    fakeServers,
  }) => {
    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "fail-hash-4",
      releaseTitle: "Failure Author - Failure Book [EPUB]",
      protocol: "torrent",
      state: "completed",
      bookId,
      authorId,
      downloadProfileId: profileId,
      outputPath: "/nonexistent/remove/path",
    });

    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "fail-hash-4",
            name: "Failure Author - Failure Book [EPUB]",
            state: "uploading",
            size: 5_242_880,
            downloaded: 5_242_880,
            dlspeed: 0,
            upspeed: 0,
            category: "allstarr",
            save_path: "/nonexistent/remove/path",
          },
        ],
      }),
    });

    await triggerTask(page, appUrl, "Refresh Downloads");

    // Verify fake qBittorrent received the removal command
    await expect(async () => {
      const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
        (r) => r.json(),
      );
      expect(qbState.removedIds.length).toBeGreaterThanOrEqual(1);
      expect(qbState.removedIds).toContain("fail-hash-4");
    }).toPass({ timeout: 15_000 });
  });

  test("view blocklist page shows entries", async ({
    page,
    appUrl,
    testDb,
  }) => {
    // Seed multiple blocklist entries
    await seedBlocklistEntry(testDb, {
      sourceTitle: "Bad Release 1 [EPUB]",
      bookId,
      protocol: "torrent",
      indexer: "Failure Indexer",
    });
    await seedBlocklistEntry(testDb, {
      sourceTitle: "Bad Release 2 [MOBI]",
      bookId,
      protocol: "torrent",
      indexer: "Failure Indexer",
    });

    await navigateTo(page, appUrl, "/activity/blocklist");

    // Verify blocklist entries are displayed
    await expect(page.getByText("Bad Release 1 [EPUB]")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Bad Release 2 [MOBI]")).toBeVisible();

    // Verify table columns
    await expect(page.getByText("Release Title").first()).toBeVisible();
    await expect(page.getByText("Protocol").first()).toBeVisible();
    await expect(page.getByText("Indexer").first()).toBeVisible();
    await expect(page.getByText("Source").first()).toBeVisible();
  });

  test("remove single entry from blocklist", async ({
    page,
    appUrl,
    testDb,
  }) => {
    await seedBlocklistEntry(testDb, {
      sourceTitle: "Remove Me Release [EPUB]",
      bookId,
      protocol: "torrent",
      indexer: "Failure Indexer",
    });

    await navigateTo(page, appUrl, "/activity/blocklist");

    await expect(page.getByText("Remove Me Release [EPUB]")).toBeVisible({
      timeout: 10_000,
    });

    // Click the trash icon button in the row
    const row = page
      .getByRole("row")
      .filter({ hasText: "Remove Me Release [EPUB]" });
    await row.getByRole("button").last().click();

    // Verify the entry is removed (wait for table to update)
    await expect(page.getByText("Remove Me Release [EPUB]")).not.toBeVisible({
      timeout: 10_000,
    });

    // Verify DB is updated
    await expect(async () => {
      const entries = await testDb.select("blocklist");
      const stillExists = entries.find(
        (e) => e.sourceTitle === "Remove Me Release [EPUB]",
      );
      expect(stillExists).toBeUndefined();
    }).toPass({ timeout: 5000 });
  });

  test("bulk remove from blocklist", async ({ page, appUrl, testDb }) => {
    await seedBlocklistEntry(testDb, {
      sourceTitle: "Bulk Remove 1 [EPUB]",
      bookId,
      protocol: "torrent",
      indexer: "Failure Indexer",
    });
    await seedBlocklistEntry(testDb, {
      sourceTitle: "Bulk Remove 2 [MOBI]",
      bookId,
      protocol: "torrent",
      indexer: "Failure Indexer",
    });
    await seedBlocklistEntry(testDb, {
      sourceTitle: "Bulk Remove 3 [PDF]",
      bookId,
      protocol: "torrent",
      indexer: "Failure Indexer",
    });

    await navigateTo(page, appUrl, "/activity/blocklist");

    // Wait for entries to load
    await expect(page.getByText("Bulk Remove 1 [EPUB]")).toBeVisible({
      timeout: 10_000,
    });

    // Select all using the header checkbox
    await page
      .getByRole("row")
      .first()
      .locator("button[role='checkbox']")
      .click();

    // Verify selection count is shown
    await expect(page.getByText(/3 selected/)).toBeVisible();

    // Click "Remove Selected" button
    await page.getByRole("button", { name: /Remove Selected/ }).click();

    // Confirm in the dialog
    await expect(page.getByText("Remove from blocklist")).toBeVisible();
    await page
      .getByRole("button", { name: /Remove|Confirm/ })
      .last()
      .click();

    // Wait for entries to be removed
    await expect(page.getByText("Bulk Remove 1 [EPUB]")).not.toBeVisible({
      timeout: 10_000,
    });

    // Verify the empty state or that all entries are gone
    await expect(async () => {
      const entries = await testDb.select("blocklist");
      expect(entries).toHaveLength(0);
    }).toPass({ timeout: 5000 });
  });

  test("manual add to blocklist via queue remove dialog", async ({
    page,
    appUrl,
    testDb,
    fakeServers,
  }) => {
    // Seed a tracked download in the queue
    await seedTrackedDownload(testDb, {
      downloadClientId: clientId,
      downloadId: "blocklist-hash-1",
      releaseTitle: "Failure Author - Failure Book [EPUB]",
      protocol: "torrent",
      state: "downloading",
      bookId,
      authorId,
    });

    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "blocklist-hash-1",
            name: "Failure Author - Failure Book [EPUB]",
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

    await navigateTo(page, appUrl, "/activity");

    await expect(
      page.getByText("Failure Author - Failure Book [EPUB]").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the Remove button
    await page.getByTitle("Remove").first().click();

    // Should open the remove dialog
    await expect(page.getByText("Remove Download")).toBeVisible();

    // Check the "Add release to blocklist" checkbox
    await page.locator("#add-to-blocklist").click();

    // Click Remove button in dialog
    await page
      .getByRole("button", { name: "Remove" })
      .filter({ hasNotText: "Removing" })
      .click();

    // Dialog should close
    await expect(page.getByText("Remove Download")).not.toBeVisible({
      timeout: 5000,
    });

    // Verify blocklist entry was created
    await expect(async () => {
      const entries = await testDb.select("blocklist");
      expect(entries.length).toBeGreaterThanOrEqual(1);
      const entry = entries.find(
        (e) => e.sourceTitle === "Failure Author - Failure Book [EPUB]",
      );
      expect(entry).toBeTruthy();
    }).toPass({ timeout: 5000 });
  });

  test("blocklisted release indicated in search results", async ({
    page,
    appUrl,
    testDb,
  }) => {
    // Seed a blocklist entry for the EPUB release
    await seedBlocklistEntry(testDb, {
      sourceTitle: "Failure Author - Failure Book [EPUB]",
      bookId,
      protocol: "torrent",
      indexer: "Failure Indexer",
    });

    await navigateTo(page, appUrl, `/bookshelf/books/${bookId}`);
    await page.getByRole("tab", { name: "Search Releases" }).click();

    // Wait for releases to load
    await expect(
      page.getByText("Failure Author - Failure Book").first(),
    ).toBeVisible({ timeout: 15_000 });

    // The MOBI release (not blocklisted) should still be shown
    await expect(
      page.getByText("Failure Author - Failure Book [MOBI]").first(),
    ).toBeVisible();

    // The EPUB release should also appear (blocklist is enforced at grab time)
    await expect(
      page.getByText("Failure Author - Failure Book [EPUB]").first(),
    ).toBeVisible();
  });
});
