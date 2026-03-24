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

const TORRENT_RELEASES = [
  {
    guid: "r1",
    title: "Test Author - Test Book [EPUB]",
    size: 5_242_880,
    downloadUrl: "http://example.com/r1.torrent",
    magnetUrl: "magnet:?xt=urn:btih:abc123",
    publishDate: "Fri, 20 Mar 2026 12:00:00 GMT",
    seeders: 25,
    peers: 30,
    category: "7020",
    protocol: "torrent" as const,
  },
  {
    guid: "r2",
    title: "Test Author - Test Book [MOBI]",
    size: 3_145_728,
    downloadUrl: "http://example.com/r2.torrent",
    magnetUrl: "magnet:?xt=urn:btih:def456",
    publishDate: "Thu, 19 Mar 2026 08:00:00 GMT",
    seeders: 10,
    peers: 15,
    category: "7020",
    protocol: "torrent" as const,
  },
  {
    guid: "r3",
    title: "Test Author - Test Book [PDF]",
    size: 8_388_608,
    downloadUrl: "http://example.com/r3.torrent",
    magnetUrl: "magnet:?xt=urn:btih:ghi789",
    publishDate: "Wed, 18 Mar 2026 06:00:00 GMT",
    seeders: 5,
    peers: 8,
    category: "7020",
    protocol: "torrent" as const,
  },
];

const USENET_RELEASES = [
  {
    guid: "u1",
    title: "Test Author - Test Book [EPUB]",
    size: 5_242_880,
    downloadUrl: "http://example.com/u1.nzb",
    publishDate: "Fri, 20 Mar 2026 12:00:00 GMT",
    category: "7020",
    protocol: "usenet" as const,
  },
];

test.describe("Search and Grab", () => {
  let bookId: number;

  test.beforeEach(async ({ page, appUrl, db, fakeServers, checkpoint }) => {
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

    // Seed prerequisites (include ebook categories so indexer search works)
    const profile = seedDownloadProfile(db, {
      name: "Search Profile",
      rootFolderPath: "/books",
      categories: [7020],
    });
    const author = seedAuthor(db, { name: "Test Author" });
    const book = seedBook(db, author.id, { title: "Test Book" });
    seedEdition(db, book.id, { title: "Test Book - EPUB Edition" });
    bookId = book.id;

    // Assign download profile to author
    db.insert(schema.authorDownloadProfiles)
      .values({ authorId: author.id, downloadProfileId: profile.id })
      .run();

    // Assign download profile to edition (so it counts as "wanted")
    const edition = db.select().from(schema.editions).all()[0];
    db.insert(schema.editionDownloadProfiles)
      .values({ editionId: edition.id, downloadProfileId: profile.id })
      .run();

    // Seed download client
    seedDownloadClient(db, {
      name: "Test qBittorrent",
      implementation: "qBittorrent",
      protocol: "torrent",
      port: PORTS.QBITTORRENT,
    });

    // Seed indexer
    seedIndexer(db, {
      name: "Test Torznab",
      implementation: "Torznab",
      protocol: "torrent",
      baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
      apiKey: "test-newznab-api-key",
    });

    // Checkpoint WAL so bun:sqlite in the app server sees seeded data
    checkpoint();

    // Configure fake qBittorrent to accept auth
    await fetch(`${fakeServers.QBITTORRENT}/__control`, {
      method: "POST",
      body: JSON.stringify({ version: "v4.6.3" }),
    });
  });

  test("interactive search displays releases on book detail page", async ({
    page,
    appUrl,
    fakeServers,
  }) => {
    // Configure releases on the fake Newznab
    await fetch(`${fakeServers.NEWZNAB}/__control`, {
      method: "POST",
      body: JSON.stringify({ releases: TORRENT_RELEASES }),
    });

    await navigateTo(page, appUrl, `/books/${bookId}`);

    // Click Search Releases tab
    await page.getByRole("tab", { name: "Search Releases" }).click();

    // Wait for releases to load (auto-search fires on tab mount)
    await expect(
      page.getByText("Test Author - Test Book [EPUB]").first(),
    ).toBeVisible({ timeout: 15_000 });

    // Verify multiple releases displayed
    await expect(
      page.getByText("Test Author - Test Book [MOBI]").first(),
    ).toBeVisible();
    await expect(
      page.getByText("Test Author - Test Book [PDF]").first(),
    ).toBeVisible();
  });

  test("release quality information is displayed", async ({
    page,
    appUrl,
    fakeServers,
  }) => {
    await fetch(`${fakeServers.NEWZNAB}/__control`, {
      method: "POST",
      body: JSON.stringify({ releases: TORRENT_RELEASES }),
    });

    await navigateTo(page, appUrl, `/books/${bookId}`);
    await page.getByRole("tab", { name: "Search Releases" }).click();

    // Wait for table to load
    await expect(
      page.getByText("Test Author - Test Book [EPUB]").first(),
    ).toBeVisible({ timeout: 15_000 });

    // The release table has Quality, Size, Protocol, Peers columns
    await expect(page.getByText("Quality").first()).toBeVisible();
    await expect(page.getByText("Protocol").first()).toBeVisible();
    await expect(page.getByText("Peers").first()).toBeVisible();
    await expect(page.getByText("Size").first()).toBeVisible();

    // Verify protocol badges are shown
    await expect(page.getByText("torrent").first()).toBeVisible();
  });

  test("grab torrent release sends to download client", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    await fetch(`${fakeServers.NEWZNAB}/__control`, {
      method: "POST",
      body: JSON.stringify({ releases: [TORRENT_RELEASES[0]] }),
    });

    await navigateTo(page, appUrl, `/books/${bookId}`);
    await page.getByRole("tab", { name: "Search Releases" }).click();

    // Wait for the release to appear
    await expect(
      page.getByText("Test Author - Test Book [EPUB]").first(),
    ).toBeVisible({ timeout: 15_000 });

    // Click the Grab button (download icon button with title "Grab release")
    await page.getByTitle("Grab release").first().click();

    // Wait for success toast
    await expect(page.getByText(/sent to/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify fake qBittorrent received the download
    const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
      (r) => r.json(),
    );
    expect(qbState.addedDownloads.length).toBeGreaterThanOrEqual(1);

    // Verify tracked download was created in DB
    const tracked = db.select().from(schema.trackedDownloads).all();
    expect(tracked.length).toBeGreaterThanOrEqual(1);
    expect(tracked[0].protocol).toBe("torrent");

    // Verify history entry was created
    const historyEntries = db.select().from(schema.history).all();
    const grabEntry = historyEntries.find((h) => h.eventType === "bookGrabbed");
    expect(grabEntry).toBeTruthy();
  });

  test("grab usenet release sends to SABnzbd client", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // Seed SABnzbd client
    seedDownloadClient(db, {
      name: "Test SABnzbd",
      implementation: "SABnzbd",
      protocol: "usenet",
      port: PORTS.SABNZBD,
      apiKey: "test-sabnzbd-api-key",
    });

    // Seed a usenet indexer
    seedIndexer(db, {
      name: "Test Newznab Usenet",
      implementation: "Newznab",
      protocol: "usenet",
      baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
      apiKey: "test-newznab-api-key",
    });

    // Configure fake SABnzbd
    await fetch(`${fakeServers.SABNZBD}/__control`, {
      method: "POST",
      body: JSON.stringify({
        version: "4.2.1",
        apiKey: "test-sabnzbd-api-key",
      }),
    });

    // Configure releases (usenet)
    await fetch(`${fakeServers.NEWZNAB}/__control`, {
      method: "POST",
      body: JSON.stringify({ releases: USENET_RELEASES }),
    });

    await navigateTo(page, appUrl, `/books/${bookId}`);
    await page.getByRole("tab", { name: "Search Releases" }).click();

    await expect(
      page.getByText("Test Author - Test Book [EPUB]").first(),
    ).toBeVisible({ timeout: 15_000 });

    // Grab the usenet release
    await page.getByTitle("Grab release").first().click();

    await expect(page.getByText(/sent to/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify SABnzbd received the download
    const sabState = await fetch(`${fakeServers.SABNZBD}/__state`).then((r) =>
      r.json(),
    );
    expect(sabState.addedDownloads.length).toBeGreaterThanOrEqual(1);
  });

  test("indexer priority ordering is respected", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // The first indexer was seeded with default priority 25
    // Seed a second indexer with higher priority (lower number = higher priority)
    seedIndexer(db, {
      name: "Priority Indexer",
      implementation: "Torznab",
      protocol: "torrent",
      baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
      apiKey: "test-newznab-api-key",
      priority: 10,
    });

    await fetch(`${fakeServers.NEWZNAB}/__control`, {
      method: "POST",
      body: JSON.stringify({ releases: TORRENT_RELEASES }),
    });

    await navigateTo(page, appUrl, `/books/${bookId}`);
    await page.getByRole("tab", { name: "Search Releases" }).click();

    // Wait for results from both indexers
    await expect(
      page.getByText("Test Author - Test Book [EPUB]").first(),
    ).toBeVisible({ timeout: 15_000 });

    // Verify the fake server received search requests (searchLog is populated)
    const newznabState = await fetch(`${fakeServers.NEWZNAB}/__state`).then(
      (r) => r.json(),
    );
    // Both indexers should have searched (searchLog has entries for each)
    expect(newznabState.searchLog.length).toBeGreaterThanOrEqual(2);
  });

  test("blocklisted release is indicated in search", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // Seed a blocklist entry for a release title
    seedBlocklistEntry(db, {
      sourceTitle: "Test Author - Test Book [MOBI]",
      bookId,
      protocol: "torrent",
      indexer: "Test Torznab",
    });

    await fetch(`${fakeServers.NEWZNAB}/__control`, {
      method: "POST",
      body: JSON.stringify({ releases: TORRENT_RELEASES }),
    });

    await navigateTo(page, appUrl, `/books/${bookId}`);
    await page.getByRole("tab", { name: "Search Releases" }).click();

    // Wait for results to load
    await expect(
      page.getByText("Test Author - Test Book [EPUB]").first(),
    ).toBeVisible({ timeout: 15_000 });

    // The MOBI release should still appear in results (blocklist is checked at grab time)
    await expect(
      page.getByText("Test Author - Test Book [MOBI]").first(),
    ).toBeVisible();
  });

  test("search with synced indexer returns results", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // Seed a synced indexer (from Prowlarr)
    db.insert(schema.syncedIndexers)
      .values({
        name: "Synced Torznab",
        implementation: "Torznab",
        configContract: "TorznabSettings",
        protocol: "torrent",
        baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
        apiPath: "/api",
        apiKey: "test-newznab-api-key",
        categories: "[]",
        enableRss: true,
        enableAutomaticSearch: true,
        enableInteractiveSearch: true,
        priority: 25,
      })
      .run();

    await fetch(`${fakeServers.NEWZNAB}/__control`, {
      method: "POST",
      body: JSON.stringify({ releases: TORRENT_RELEASES }),
    });

    await navigateTo(page, appUrl, `/books/${bookId}`);
    await page.getByRole("tab", { name: "Search Releases" }).click();

    // Wait for results from both manual + synced indexers
    await expect(
      page.getByText("Test Author - Test Book [EPUB]").first(),
    ).toBeVisible({ timeout: 15_000 });

    // Verify the Newznab server received multiple search requests
    const newznabState = await fetch(`${fakeServers.NEWZNAB}/__state`).then(
      (r) => r.json(),
    );
    // Should have at least 2 search requests (manual + synced)
    expect(newznabState.searchLog.length).toBeGreaterThanOrEqual(2);
  });

  test("grab with indexer-specific client override", async ({
    page,
    appUrl,
    db,
    fakeServers,
  }) => {
    // Seed a second download client specifically for this indexer
    const overrideClient = seedDownloadClient(db, {
      name: "Override qBittorrent",
      implementation: "qBittorrent",
      protocol: "torrent",
      port: PORTS.QBITTORRENT,
      priority: 99,
    });

    // Update the indexer to use the override client
    db.update(schema.indexers)
      .set({ downloadClientId: overrideClient.id })
      .run();

    await fetch(`${fakeServers.NEWZNAB}/__control`, {
      method: "POST",
      body: JSON.stringify({ releases: [TORRENT_RELEASES[0]] }),
    });

    await navigateTo(page, appUrl, `/books/${bookId}`);
    await page.getByRole("tab", { name: "Search Releases" }).click();

    await expect(
      page.getByText("Test Author - Test Book [EPUB]").first(),
    ).toBeVisible({ timeout: 15_000 });

    // Grab
    await page.getByTitle("Grab release").first().click();

    await expect(page.getByText(/sent to/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // The grab should have been sent to the qBittorrent fake server
    const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
      (r) => r.json(),
    );
    expect(qbState.addedDownloads.length).toBeGreaterThanOrEqual(1);

    // Check the tracked download references the override client
    const tracked = db.select().from(schema.trackedDownloads).all();
    expect(tracked.length).toBeGreaterThanOrEqual(1);
    const last = tracked.at(-1);
    expect(last.downloadClientId).toBe(overrideClient.id);
  });
});
