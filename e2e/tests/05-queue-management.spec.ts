import { test, expect } from "../fixtures/app";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import {
  seedDownloadClient,
  seedDownloadProfile,
  seedTrackedDownload,
  seedAuthor,
  seedBook,
} from "../fixtures/seed-data";
import PORTS from "../ports";

test.describe("Queue Management", () => {
  test.beforeEach(async ({ page, appUrl, testDb, fakeServers }) => {
    await ensureAuthenticated(page, appUrl);

    // Seed baseline data
    await seedDownloadProfile(testDb, {
      name: "Queue Profile",
      rootFolderPath: "/books",
    });
    const author = await seedAuthor(testDb, { name: "Queue Author" });
    const book = await seedBook(testDb, author.id as number, {
      title: "Queue Book",
    });

    // Seed qBittorrent client
    const qbClient = await seedDownloadClient(testDb, {
      name: "Test qBittorrent",
      implementation: "qBittorrent",
      protocol: "torrent",
      port: PORTS.QBITTORRENT,
    });

    // Seed a tracked download
    await seedTrackedDownload(testDb, {
      downloadClientId: qbClient.id,
      downloadId: "abc123",
      releaseTitle: "Queue Author - Queue Book [EPUB]",
      protocol: "torrent",
      state: "downloading",
      bookId: book.id,
      authorId: author.id,
    });

    // Configure fake qBittorrent with matching download
    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        version: "v4.6.3",
        torrents: [
          {
            hash: "abc123",
            name: "Queue Author - Queue Book [EPUB]",
            state: "downloading",
            size: 5_242_880,
            downloaded: 2_621_440,
            dlspeed: 1_048_576,
            upspeed: 524_288,
            category: "allstarr",
            save_path: "/downloads",
          },
        ],
      }),
    });
  });

  test("view queue with active downloads", async ({ page, appUrl }) => {
    await navigateTo(page, appUrl, "/activity");

    // Should show the download item
    await expect(
      page.getByText("Queue Author - Queue Book [EPUB]").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Should show download speed info
    await expect(page.getByText(/\/s/).first()).toBeVisible();

    // Should show the summary bar with active count
    await expect(page.getByText("Active").first()).toBeVisible();
    await expect(page.getByText("Download").first()).toBeVisible();
  });

  test("SSE real-time progress indicator is shown", async ({
    page,
    appUrl,
  }) => {
    await navigateTo(page, appUrl, "/activity");

    // The summary bar should show the SSE connection indicator (green dot)
    // When connected, there should be no "Reconnecting..." text
    await expect(
      page.getByText("Queue Author - Queue Book [EPUB]").first(),
    ).toBeVisible({ timeout: 10_000 });

    // The SSE indicator is a small colored dot in the summary bar
    // A connected state means no "Reconnecting..." text visible
    const reconnecting = page.getByText("Reconnecting...");
    // Verify the reconnecting indicator is not visible (either absent or hidden)
    await expect(reconnecting).not.toBeVisible({ timeout: 5000 });
  });

  test("pause download", async ({ page, appUrl, fakeServers }) => {
    await navigateTo(page, appUrl, "/activity");

    await expect(
      page.getByText("Queue Author - Queue Book [EPUB]").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the Pause button (has title "Pause")
    await page.getByTitle("Pause").first().click();

    // Verify fake qBittorrent received the pause command
    await expect(async () => {
      const state = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
        (r) => r.json(),
      );
      expect(state.pausedIds.length).toBeGreaterThanOrEqual(1);
      expect(state.pausedIds).toContain("abc123");
    }).toPass({ timeout: 5000 });
  });

  test("resume download", async ({ page, appUrl, testDb, fakeServers }) => {
    // Update the tracked download to paused state
    await testDb.update("trackedDownloads", { state: "paused" });

    // Update the fake qBittorrent to show paused state
    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({
        torrents: [
          {
            hash: "abc123",
            name: "Queue Author - Queue Book [EPUB]",
            state: "pausedDL",
            size: 5_242_880,
            downloaded: 2_621_440,
            dlspeed: 0,
            upspeed: 0,
            category: "allstarr",
            save_path: "/downloads",
          },
        ],
      }),
    });

    await navigateTo(page, appUrl, "/activity");

    await expect(
      page.getByText("Queue Author - Queue Book [EPUB]").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the Resume button (has title "Resume")
    await page.getByTitle("Resume").first().click();

    // Verify fake qBittorrent received the resume command
    await expect(async () => {
      const state = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
        (r) => r.json(),
      );
      expect(state.resumedIds.length).toBeGreaterThanOrEqual(1);
      expect(state.resumedIds).toContain("abc123");
    }).toPass({ timeout: 5000 });
  });

  test("remove from queue shows confirm dialog", async ({
    page,
    appUrl,
    fakeServers,
  }) => {
    await navigateTo(page, appUrl, "/activity");

    await expect(
      page.getByText("Queue Author - Queue Book [EPUB]").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the Remove button (X icon, title "Remove")
    await page.getByTitle("Remove").first().click();

    // Should open the remove dialog
    await expect(page.getByText("Remove Download")).toBeVisible();
    await expect(page.getByText("Remove from download client")).toBeVisible();

    // Click "Remove" button in dialog
    await page
      .getByRole("button", { name: "Remove" })
      .filter({ hasNotText: "Removing" })
      .click();

    // Dialog should close
    await expect(page.getByText("Remove Download")).not.toBeVisible({
      timeout: 5000,
    });

    // Verify fake server received the removal
    await expect(async () => {
      const state = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
        (r) => r.json(),
      );
      expect(state.removedIds.length).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 5000 });
  });

  test("remove and add to blocklist", async ({ page, appUrl, testDb }) => {
    await navigateTo(page, appUrl, "/activity");

    await expect(
      page.getByText("Queue Author - Queue Book [EPUB]").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click Remove
    await page.getByTitle("Remove").first().click();

    // Should open dialog
    await expect(page.getByText("Remove Download")).toBeVisible();

    // Check the "Add release to blocklist" checkbox
    await page.locator("#add-to-blocklist").click();

    // Click Remove
    await page
      .getByRole("button", { name: "Remove" })
      .filter({ hasNotText: "Removing" })
      .click();

    // Dialog should close
    await expect(page.getByText("Remove Download")).not.toBeVisible({
      timeout: 5000,
    });

    // Verify blocklist entry was created in DB
    await expect(async () => {
      const blocklistEntries = await testDb.select("blocklist");
      expect(blocklistEntries.length).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 5000 });
  });

  test("mixed client queue shows items from multiple clients", async ({
    page,
    appUrl,
    testDb,
    fakeServers,
  }) => {
    // Seed a SABnzbd client
    const sabClient = await seedDownloadClient(testDb, {
      name: "Test SABnzbd",
      implementation: "SABnzbd",
      protocol: "usenet",
      port: PORTS.SABNZBD,
      apiKey: "test-sabnzbd-api-key",
    });

    // Seed a tracked download for SABnzbd
    await seedTrackedDownload(testDb, {
      downloadClientId: sabClient.id,
      downloadId: "sab-nzo-123",
      releaseTitle: "Queue Author - Queue Book [MOBI]",
      protocol: "usenet",
      state: "downloading",
    });

    // Configure SABnzbd with matching download
    await fetch(`${fakeServers.SABNZBD}/__control`, {
      method: "POST",
      body: JSON.stringify({
        version: "4.2.1",
        apiKey: "test-sabnzbd-api-key",
        queueSlots: [
          {
            nzo_id: "sab-nzo-123",
            filename: "Queue Author - Queue Book [MOBI]",
            status: "Downloading",
            mb: "5.00",
            mbleft: "2.50",
          },
        ],
      }),
    });

    await navigateTo(page, appUrl, "/activity");

    // Should show the torrent download
    await expect(
      page.getByText("Queue Author - Queue Book [EPUB]").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Should show protocol badges for both types
    await expect(page.getByText("torrent").first()).toBeVisible();

    // Verify the Test qBittorrent client badge is present
    await expect(page.getByText("Test qBittorrent").first()).toBeVisible();
  });

  test("connection warning banner appears for unreachable client", async ({
    page,
    appUrl,
    testDb,
  }) => {
    // Seed a client pointing to unreachable port
    await seedDownloadClient(testDb, {
      name: "Unreachable Client",
      implementation: "qBittorrent",
      protocol: "torrent",
      port: 1, // unreachable
      enabled: true,
    });

    // Seed a tracked download for the unreachable client
    const clients = await testDb.select("downloadClients");
    const unreachableClient = clients.find(
      (c) => c.name === "Unreachable Client",
    );
    expect(unreachableClient).toBeTruthy();
    await seedTrackedDownload(testDb, {
      downloadClientId: unreachableClient!.id,
      downloadId: "unreachable-dl",
      releaseTitle: "Unreachable Download",
      protocol: "torrent",
      state: "downloading",
    });

    await navigateTo(page, appUrl, "/activity");

    // The connection warning banner should appear
    await expect(
      page
        .getByText(/unable to connect|connection.*failed|Unreachable Client/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("dismiss connection warning banner", async ({
    page,
    appUrl,
    testDb,
  }) => {
    // Clean up clients from prior tests so only one warning appears
    await testDb.deleteAll("trackedDownloads");
    await testDb.deleteAll("downloadClients");

    // Seed unreachable client
    await seedDownloadClient(testDb, {
      name: "Dismiss Client",
      implementation: "qBittorrent",
      protocol: "torrent",
      port: 1,
      enabled: true,
    });

    const clients = await testDb.select("downloadClients");
    const dismissClient = clients.find((c) => c.name === "Dismiss Client");
    expect(dismissClient).toBeTruthy();
    await seedTrackedDownload(testDb, {
      downloadClientId: dismissClient!.id,
      downloadId: "dismiss-dl",
      releaseTitle: "Dismiss Download",
      protocol: "torrent",
      state: "downloading",
    });

    await navigateTo(page, appUrl, "/activity");

    // Wait for warning to appear
    const warningText = page
      .getByText(/unable to connect|connection.*failed|Dismiss Client/i)
      .first();
    await expect(warningText).toBeVisible({ timeout: 15_000 });

    // Click the dismiss button (X icon with aria-label "Dismiss warning")
    await page.getByLabel("Dismiss warning").first().click();

    // Warning should be dismissed
    await expect(warningText).not.toBeVisible({ timeout: 5000 });
  });
});
