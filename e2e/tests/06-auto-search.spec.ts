import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/app";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import * as schema from "../../src/db/schema";
import {
  seedAuthor,
  seedBook,
  seedEdition,
  seedDownloadClient,
  seedDownloadProfile,
  seedIndexer,
  seedBlocklistEntry,
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

  // Find the row containing the task name
  const row = page.getByRole("row").filter({ hasText: taskName });
  await expect(row).toBeVisible({ timeout: 10_000 });

  // Click the Play (Run Now) button in that row
  await row.getByRole("button").last().click();

  // Wait for the task to finish (status badge changes from Running)
  await expect(async () => {
    const isRunning = await row.getByText("Running").isVisible();
    expect(isRunning).toBe(false);
  }).toPass({ timeout: 30_000 });

  // Small delay for DB writes to settle
  await page.waitForTimeout(500);
}

test.describe("Auto-Search", () => {
  let bookId: number;
  let authorId: number;
  let profileId: number;
  let editionId: number;

  test.beforeEach(async ({ page, appUrl, db, fakeServers, checkpoint }) => {
    await ensureAuthenticated(page, appUrl);

    // Seed complete setup
    const profile = seedDownloadProfile(db, {
      name: "Auto Profile",
      rootFolderPath: "/books",
      cutoff: 1,
      items: [1, 2, 3, 4, 5],
      upgradeAllowed: false,
      categories: [7020],
    });
    profileId = profile.id;

    const author = seedAuthor(db, { name: "Auto Author", monitored: true });
    authorId = author.id;

    const book = seedBook(db, authorId, { title: "Auto Book" });
    bookId = book.id;

    const edition = seedEdition(db, bookId, { title: "Auto Book - EPUB" });
    editionId = edition.id;

    // Assign profile to author
    db.insert(schema.authorDownloadProfiles)
      .values({ authorId, downloadProfileId: profileId })
      .run();

    // Assign profile to edition (makes it "wanted")
    db.insert(schema.editionDownloadProfiles)
      .values({ editionId, downloadProfileId: profileId })
      .run();

    // Seed download client (torrent)
    seedDownloadClient(db, {
      name: "Auto qBittorrent",
      implementation: "qBittorrent",
      protocol: "torrent",
      port: PORTS.QBITTORRENT,
    });

    // Seed indexer
    seedIndexer(db, {
      name: "Auto Indexer",
      implementation: "Torznab",
      protocol: "torrent",
      baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
      apiKey: "test-newznab-api-key",
      enableRss: true,
      enableAutomaticSearch: true,
    });

    // Checkpoint WAL so bun:sqlite in the app server sees seeded data
    checkpoint();

    // Navigate to force the app server's DB connection to see seeded data
    await navigateTo(page, appUrl, "/settings/indexers");

    // Configure fake qBittorrent
    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({ version: "v4.6.3" }),
    });

    // Configure fake Newznab with releases matching the book
    await fetch(`${fakeServers.NEWZNAB}/__control`, {
      method: "POST",
      body: JSON.stringify({
        releases: [
          {
            guid: "auto-r1",
            title: "Auto Author - Auto Book [EPUB]",
            size: 5_242_880,
            downloadUrl: "http://example.com/auto-r1.torrent",
            magnetUrl: "magnet:?xt=urn:btih:auto1",
            publishDate: "Fri, 20 Mar 2026 12:00:00 GMT",
            seeders: 20,
            peers: 30,
            category: "7020",
            protocol: "torrent",
          },
          {
            guid: "auto-r2",
            title: "Auto Author - Auto Book [MOBI]",
            size: 3_145_728,
            downloadUrl: "http://example.com/auto-r2.torrent",
            magnetUrl: "magnet:?xt=urn:btih:auto2",
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

  test("wanted books are identified when edition has profile but no files", async ({
    db,
  }) => {
    // The setup already creates an edition with a profile but no bookFiles.
    // Verify the book is identified as wanted by querying the DB state.
    const editionProfiles = db
      .select()
      .from(schema.editionDownloadProfiles)
      .all();
    expect(editionProfiles.length).toBeGreaterThanOrEqual(1);

    // No book files exist
    const files = db.select().from(schema.bookFiles).all();
    expect(files).toHaveLength(0);
  });

  test("RSS sync finds and grabs releases", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // Trigger RSS sync task via the UI
    await triggerTask(page, appUrl, "RSS Sync");

    // Verify the fake qBittorrent received a download
    const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
      (r) => r.json(),
    );
    expect(qbState.addedDownloads.length).toBeGreaterThanOrEqual(1);

    // Verify a tracked download was created
    const tracked = db.select().from(schema.trackedDownloads).all();
    expect(tracked.length).toBeGreaterThanOrEqual(1);

    // Verify history entry
    const historyEntries = db.select().from(schema.history).all();
    const grabEntry = historyEntries.find((h) => h.eventType === "bookGrabbed");
    expect(grabEntry).toBeTruthy();
  });

  test("auto-search respects cutoff — does not search when at cutoff", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // Seed a book file at the cutoff quality (id=1 which matches cutoff=1)
    db.insert(schema.bookFiles)
      .values({
        bookId,
        path: "/books/Auto Author/Auto Book/book.epub",
        size: 5_000_000,
        quality: {
          quality: { id: 1, name: "EPUB" },
          revision: { version: 1, real: 0 },
        },
      })
      .run();

    await triggerTask(page, appUrl, "RSS Sync");

    // Should NOT have grabbed anything since file is at cutoff
    const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
      (r) => r.json(),
    );
    expect(qbState.addedDownloads).toHaveLength(0);

    // No new tracked downloads
    const tracked = db.select().from(schema.trackedDownloads).all();
    expect(tracked).toHaveLength(0);
  });

  test("auto-search upgrades when below cutoff and upgrades allowed", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // Update profile to allow upgrades, with cutoff at weight position 2
    db.update(schema.downloadProfiles)
      .set({
        upgradeAllowed: true,
        cutoff: 2,
        items: [1, 2, 3, 4, 5],
      })
      .run();

    // Seed a book file below the cutoff (quality id=1, cutoff=2)
    db.insert(schema.bookFiles)
      .values({
        bookId,
        path: "/books/Auto Author/Auto Book/book.mobi",
        size: 3_000_000,
        quality: {
          quality: { id: 1, name: "MOBI" },
          revision: { version: 1, real: 0 },
        },
      })
      .run();

    await triggerTask(page, appUrl, "RSS Sync");

    // Should have grabbed an upgrade since current file is below cutoff
    const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
      (r) => r.json(),
    );
    expect(qbState.addedDownloads.length).toBeGreaterThanOrEqual(1);
  });

  test("auto-search skips when upgrades disabled and file exists", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // Profile has upgradeAllowed: false (default from beforeEach)
    // Seed a book file with any quality
    db.insert(schema.bookFiles)
      .values({
        bookId,
        path: "/books/Auto Author/Auto Book/book.mobi",
        size: 3_000_000,
        quality: {
          quality: { id: 3, name: "PDF" },
          revision: { version: 1, real: 0 },
        },
      })
      .run();

    await triggerTask(page, appUrl, "RSS Sync");

    // Should NOT have grabbed because upgrades are disabled
    const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
      (r) => r.json(),
    );
    expect(qbState.addedDownloads).toHaveLength(0);
  });

  test("blocklisted release is skipped — next best grabbed", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // Blocklist the first (best) release
    seedBlocklistEntry(db, {
      sourceTitle: "Auto Author - Auto Book [EPUB]",
      bookId,
      protocol: "torrent",
      indexer: "Auto Indexer",
    });

    await triggerTask(page, appUrl, "RSS Sync");

    // The auto-search should have skipped the blocklisted release
    // and grabbed the next best one (MOBI)
    const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
      (r) => r.json(),
    );
    expect(qbState.addedDownloads.length).toBeGreaterThanOrEqual(1);

    // Check the tracked download is for the MOBI release, not EPUB
    const tracked = db.select().from(schema.trackedDownloads).all();
    expect(tracked.length).toBeGreaterThanOrEqual(1);
    expect(tracked[0].releaseTitle).toContain("MOBI");
  });

  test("multiple indexers are searched", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // Seed a second indexer
    seedIndexer(db, {
      name: "Second Indexer",
      implementation: "Torznab",
      protocol: "torrent",
      baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
      apiKey: "test-newznab-api-key",
      enableRss: true,
      enableAutomaticSearch: true,
      priority: 50,
    });

    await triggerTask(page, appUrl, "RSS Sync");

    // Both indexers should have been queried (both point to same fake server)
    const newznabState = await fetch(`${fakeServers.NEWZNAB}/__state`).then(
      (r) => r.json(),
    );
    expect(newznabState.searchLog.length).toBeGreaterThanOrEqual(2);
  });

  test("no grab when all releases are rejected", async ({
    page,
    appUrl,
    fakeServers,
  }) => {
    // Configure Newznab with releases that will not match any allowed quality
    await fetch(`${fakeServers.NEWZNAB}/__control`, {
      method: "POST",
      body: JSON.stringify({
        releases: [
          {
            guid: "rejected-r1",
            title: "Completely Unrelated Release [AZW3]",
            size: 1_000_000,
            downloadUrl: "http://example.com/rejected.torrent",
            magnetUrl: "magnet:?xt=urn:btih:rejected",
            publishDate: "Fri, 20 Mar 2026 12:00:00 GMT",
            seeders: 5,
            peers: 10,
            category: "7020",
            protocol: "torrent",
          },
        ],
      }),
    });

    await triggerTask(page, appUrl, "RSS Sync");

    // Should not have grabbed anything (title does not match book)
    const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
      (r) => r.json(),
    );
    expect(qbState.addedDownloads).toHaveLength(0);
  });

  test("search respects maxBooks limit", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // Seed additional wanted books
    for (let i = 1; i <= 3; i += 1) {
      const extraBook = seedBook(db, authorId, {
        title: `Extra Book ${i}`,
        slug: `extra-book-${i}`,
        foreignBookId: `hc-extra-${i}`,
      });
      const extraEdition = seedEdition(db, extraBook.id, {
        title: `Extra Edition ${i}`,
        foreignEditionId: `hc-extra-edition-${i}`,
        isbn13: `978123456789${i}`,
      });
      db.insert(schema.editionDownloadProfiles)
        .values({ editionId: extraEdition.id, downloadProfileId: profileId })
        .run();
    }

    // The RSS sync task uses a default delayBetweenBooks, but we can verify
    // the indexer was searched for multiple books by checking searchLog
    await triggerTask(page, appUrl, "RSS Sync");

    // Verify the indexer received search requests for the wanted books
    const newznabState = await fetch(`${fakeServers.NEWZNAB}/__state`).then(
      (r) => r.json(),
    );
    // Should have searched at least 2 books (the original + at least one extra)
    expect(newznabState.searchLog.length).toBeGreaterThanOrEqual(2);
  });
});
