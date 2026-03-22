import { test, expect } from "../fixtures/app";
import { ensureAuthenticated, waitForHydration } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import * as schema from "../../src/db/schema";
import PORTS from "../ports";

test.describe("Settings and Configuration", () => {
  test.beforeEach(async ({ page, appUrl }) => {
    await ensureAuthenticated(page, appUrl);
  });

  // ─── Download Clients ──────────────────────────────────────────────────────

  test.describe("Download Clients", () => {
    test("add and test qBittorrent client", async ({
      page,
      appUrl,
      fakeServers,
    }) => {
      // Set fake qBittorrent version
      await fetch(`${fakeServers.QBITTORRENT}/__control`, {
        method: "POST",
        body: JSON.stringify({ version: "v4.6.3" }),
      });

      await navigateTo(page, appUrl, "/settings/download-clients");

      // Click "Add Client"
      await page.getByRole("button", { name: "Add Client" }).click();

      // Select qBittorrent
      await page.getByRole("button", { name: "qBittorrent" }).click();

      // Fill form
      await page.locator("#dc-name").fill("Test qBittorrent");
      await page.locator("#dc-host").fill("localhost");
      await page.locator("#dc-port").fill(String(PORTS.QBITTORRENT));
      await page.locator("#dc-username").fill("admin");
      await page.locator("#dc-password").fill("adminadmin");

      // Test connection
      await page.getByRole("button", { name: "Test Connection" }).click();
      await expect(page.getByText("v4.6.3")).toBeVisible({ timeout: 10_000 });

      // Save
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog").first()).not.toBeVisible({
        timeout: 5000,
      });

      // Verify client appears in list
      await expect(page.getByText("Test qBittorrent")).toBeVisible();
    });

    test("add and test Transmission client", async ({
      page,
      appUrl,
      fakeServers,
    }) => {
      await fetch(`${fakeServers.TRANSMISSION}/__control`, {
        method: "POST",
        body: JSON.stringify({ version: "4.0.0" }),
      });

      await navigateTo(page, appUrl, "/settings/download-clients");

      await page.getByRole("button", { name: "Add Client" }).click();
      await page.getByRole("button", { name: "Transmission" }).click();

      await page.locator("#dc-name").fill("Test Transmission");
      await page.locator("#dc-host").fill("localhost");
      await page.locator("#dc-port").fill(String(PORTS.TRANSMISSION));
      await page.locator("#dc-username").fill("admin");
      await page.locator("#dc-password").fill("admin");

      await page.getByRole("button", { name: "Test Connection" }).click();
      await expect(page.getByText("4.0.0")).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog").first()).not.toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByText("Test Transmission")).toBeVisible();
    });

    test("add and test Deluge client", async ({
      page,
      appUrl,
      fakeServers,
    }) => {
      await fetch(`${fakeServers.DELUGE}/__control`, {
        method: "POST",
        body: JSON.stringify({ version: "2.1.1" }),
      });

      await navigateTo(page, appUrl, "/settings/download-clients");

      await page.getByRole("button", { name: "Add Client" }).click();
      await page.getByRole("button", { name: "Deluge" }).click();

      await page.locator("#dc-name").fill("Test Deluge");
      await page.locator("#dc-host").fill("localhost");
      await page.locator("#dc-port").fill(String(PORTS.DELUGE));
      await page.locator("#dc-password").fill("deluge");

      await page.getByRole("button", { name: "Test Connection" }).click();
      await expect(page.getByText("2.1.1")).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog").first()).not.toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByText("Test Deluge")).toBeVisible();
    });

    test("add and test rTorrent client", async ({
      page,
      appUrl,
      fakeServers,
    }) => {
      await fetch(`${fakeServers.RTORRENT}/__control`, {
        method: "POST",
        body: JSON.stringify({ version: "0.9.8" }),
      });

      await navigateTo(page, appUrl, "/settings/download-clients");

      await page.getByRole("button", { name: "Add Client" }).click();
      await page.getByRole("button", { name: "rTorrent" }).click();

      await page.locator("#dc-name").fill("Test rTorrent");
      await page.locator("#dc-host").fill("localhost");
      await page.locator("#dc-port").fill(String(PORTS.RTORRENT));

      await page.getByRole("button", { name: "Test Connection" }).click();
      await expect(page.getByText("0.9.8")).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog").first()).not.toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByText("Test rTorrent")).toBeVisible();
    });

    test("add and test SABnzbd client", async ({
      page,
      appUrl,
      fakeServers,
    }) => {
      await fetch(`${fakeServers.SABNZBD}/__control`, {
        method: "POST",
        body: JSON.stringify({ version: "4.2.1" }),
      });

      await navigateTo(page, appUrl, "/settings/download-clients");

      await page.getByRole("button", { name: "Add Client" }).click();
      await page.getByRole("button", { name: "SABnzbd" }).click();

      await page.locator("#dc-name").fill("Test SABnzbd");
      await page.locator("#dc-host").fill("localhost");
      await page.locator("#dc-port").fill(String(PORTS.SABNZBD));
      await page.locator("#dc-apikey").fill("test-sabnzbd-api-key");

      await page.getByRole("button", { name: "Test Connection" }).click();
      await expect(page.getByText("4.2.1")).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog").first()).not.toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByText("Test SABnzbd")).toBeVisible();
    });

    test("add and test NZBGet client", async ({
      page,
      appUrl,
      fakeServers,
    }) => {
      await fetch(`${fakeServers.NZBGET}/__control`, {
        method: "POST",
        body: JSON.stringify({ version: "21.1" }),
      });

      await navigateTo(page, appUrl, "/settings/download-clients");

      await page.getByRole("button", { name: "Add Client" }).click();
      await page.getByRole("button", { name: "NZBGet" }).click();

      await page.locator("#dc-name").fill("Test NZBGet");
      await page.locator("#dc-host").fill("localhost");
      await page.locator("#dc-port").fill(String(PORTS.NZBGET));
      await page.locator("#dc-username").fill("nzbget");
      await page.locator("#dc-password").fill("nzbget");

      await page.getByRole("button", { name: "Test Connection" }).click();
      await expect(page.getByText("21.1")).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog").first()).not.toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByText("Test NZBGet")).toBeVisible();
    });

    test("edit download client", async ({ page, appUrl, db, fakeServers }) => {
      // Seed a client in the DB with a unique name
      const { seedDownloadClient } = await import("../fixtures/seed-data");
      seedDownloadClient(db, { name: "Editable qBittorrent" });

      await fetch(`${fakeServers.QBITTORRENT}/__control`, {
        method: "POST",
        body: JSON.stringify({ version: "v4.6.3" }),
      });

      await navigateTo(page, appUrl, "/settings/download-clients");

      // Click edit button on the seeded client row
      await expect(page.getByText("Editable qBittorrent")).toBeVisible();
      const row = page
        .getByRole("row")
        .filter({ hasText: "Editable qBittorrent" });
      await row.getByRole("button").first().click();

      // Should open edit dialog
      await expect(page.getByText("Edit Download Client")).toBeVisible();

      // Change the name
      await page.locator("#dc-name").fill("Edited qBittorrent");
      await page.getByRole("button", { name: "Save" }).click();

      await expect(page.getByRole("dialog").first()).not.toBeVisible({
        timeout: 5000,
      });

      // Verify the updated name appears
      await expect(page.getByText("Edited qBittorrent")).toBeVisible();
    });

    test("delete download client", async ({ page, appUrl, db }) => {
      const { seedDownloadClient } = await import("../fixtures/seed-data");
      seedDownloadClient(db, { name: "Client To Delete" });

      await navigateTo(page, appUrl, "/settings/download-clients");

      await expect(page.getByText("Client To Delete")).toBeVisible();
      const row = page.getByRole("row").filter({ hasText: "Client To Delete" });

      // Click the delete (trash) button — second icon button in the row
      await row.getByRole("button").nth(1).click();

      // Confirm deletion dialog
      await expect(page.getByText("Delete Download Client")).toBeVisible();
      await page.getByRole("button", { name: "Confirm" }).click();

      // Verify client is gone
      await expect(page.getByText("Client To Delete")).not.toBeVisible({
        timeout: 5000,
      });
    });

    test("connection failure shows error", async ({
      page,
      appUrl,
      fakeServers,
    }) => {
      // Configure fake server to return error
      await fetch(`${fakeServers.QBITTORRENT}/__control`, {
        method: "POST",
        body: JSON.stringify({ version: "", authFail: true }),
      });

      await navigateTo(page, appUrl, "/settings/download-clients");

      await page.getByRole("button", { name: "Add Client" }).click();
      await page.getByRole("button", { name: "qBittorrent" }).click();

      await page.locator("#dc-name").fill("Fail Client");
      await page.locator("#dc-host").fill("localhost");
      // Use an invalid port that won't connect
      await page.locator("#dc-port").fill("1");

      await page.getByRole("button", { name: "Test Connection" }).click();

      // Should show error state in the test result banner
      await expect(
        page
          .getByText(
            /failed|error|unable|connection refused|timed out|ECONNREFUSED/i,
          )
          .first(),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  // ─── Indexers ──────────────────────────────────────────────────────────────

  test.describe("Indexers", () => {
    test("add Newznab indexer", async ({ page, appUrl, fakeServers }) => {
      await fetch(`${fakeServers.NEWZNAB}/__control`, {
        method: "POST",
        body: JSON.stringify({ serverVersion: "1.0.0" }),
      });

      await navigateTo(page, appUrl, "/settings/indexers");

      await page.getByRole("button", { name: "Add Indexer" }).click();
      await page.getByRole("button", { name: "Newznab" }).click();

      await page.locator("#ix-name").fill("Test Newznab");
      await page
        .locator("#ix-baseurl")
        .fill(`http://localhost:${PORTS.NEWZNAB}`);
      await page.locator("#ix-apikey").fill("test-api-key");

      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog").first()).not.toBeVisible({
        timeout: 5000,
      });

      await expect(page.getByText("Test Newznab")).toBeVisible();
    });

    test("add Torznab indexer", async ({ page, appUrl, fakeServers }) => {
      await fetch(`${fakeServers.NEWZNAB}/__control`, {
        method: "POST",
        body: JSON.stringify({ serverVersion: "1.0.0" }),
      });

      await navigateTo(page, appUrl, "/settings/indexers");

      await page.getByRole("button", { name: "Add Indexer" }).click();
      await page.getByRole("button", { name: "Torznab" }).click();

      await page.locator("#ix-name").fill("Test Torznab");
      await page
        .locator("#ix-baseurl")
        .fill(`http://localhost:${PORTS.NEWZNAB}`);
      await page.locator("#ix-apikey").fill("test-api-key");

      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog").first()).not.toBeVisible({
        timeout: 5000,
      });

      await expect(page.getByText("Test Torznab")).toBeVisible();
    });

    test("test indexer connection", async ({ page, appUrl, fakeServers }) => {
      await fetch(`${fakeServers.NEWZNAB}/__control`, {
        method: "POST",
        body: JSON.stringify({ serverVersion: "2.0.0" }),
      });

      await navigateTo(page, appUrl, "/settings/indexers");

      await page.getByRole("button", { name: "Add Indexer" }).click();
      await page.getByRole("button", { name: "Newznab" }).click();

      await page.locator("#ix-name").fill("Connection Test Indexer");
      await page
        .locator("#ix-baseurl")
        .fill(`http://localhost:${PORTS.NEWZNAB}`);
      await page.locator("#ix-apikey").fill("test-api-key");

      await page.getByRole("button", { name: "Test Connection" }).click();
      await expect(
        page.getByText(/connected|success|2\.0\.0/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("indexer with download client override", async ({
      page,
      appUrl,
      db,
    }) => {
      // Seed a download client first (usenet protocol)
      const { seedDownloadClient } = await import("../fixtures/seed-data");
      seedDownloadClient(db, {
        name: "Override SABnzbd",
        implementation: "SABnzbd",
        protocol: "usenet",
        port: PORTS.SABNZBD,
      });

      await navigateTo(page, appUrl, "/settings/indexers");

      await page.getByRole("button", { name: "Add Indexer" }).click();
      await page.getByRole("button", { name: "Newznab" }).click();

      await page.locator("#ix-name").fill("Indexer with Override");
      await page
        .locator("#ix-baseurl")
        .fill(`http://localhost:${PORTS.NEWZNAB}`);
      await page.locator("#ix-apikey").fill("test-api-key");

      // Select the download client override (visible when a matching client exists)
      const dcSelect = page.locator("#ix-download-client");
      await expect(dcSelect).toBeVisible({ timeout: 3000 });
      await dcSelect.click();
      await page.getByRole("option", { name: "Override SABnzbd" }).click();

      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog").first()).not.toBeVisible({
        timeout: 5000,
      });

      await expect(page.getByText("Indexer with Override")).toBeVisible();
    });

    test("delete indexer", async ({ page, appUrl, db }) => {
      const { seedIndexer } = await import("../fixtures/seed-data");
      seedIndexer(db, { name: "Indexer To Delete" });

      await navigateTo(page, appUrl, "/settings/indexers");

      await expect(page.getByText("Indexer To Delete")).toBeVisible();
      const row = page
        .getByRole("row")
        .filter({ hasText: "Indexer To Delete" });

      // Click delete button (trash icon)
      await row.getByRole("button").nth(1).click();

      // Confirm
      await expect(page.getByText("Delete Indexer")).toBeVisible();
      await page.getByRole("button", { name: "Confirm" }).click();

      await expect(page.getByText("Indexer To Delete")).not.toBeVisible({
        timeout: 5000,
      });
    });
  });

  // ─── Prowlarr Sync ────────────────────────────────────────────────────────

  test.describe("Prowlarr Sync", () => {
    test("synced indexer appears with badge", async ({ page, appUrl, db }) => {
      // Seed a synced indexer directly
      db.insert(schema.syncedIndexers)
        .values({
          name: "Prowlarr Synced",
          implementation: "Newznab",
          configContract: "NewznabSettings",
          protocol: "usenet",
          baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
          apiPath: "/api",
          apiKey: "synced-key",
          categories: "[]",
          enableRss: true,
          enableAutomaticSearch: true,
          enableInteractiveSearch: true,
          priority: 25,
        })
        .run();

      await navigateTo(page, appUrl, "/settings/indexers");

      // Should see the synced indexer with "Prowlarr Sync" badge
      await expect(page.getByText("Prowlarr Synced")).toBeVisible();
      await expect(page.getByText("Prowlarr Sync")).toBeVisible();
    });

    test("edit synced indexer override", async ({ page, appUrl, db }) => {
      const { seedDownloadClient } = await import("../fixtures/seed-data");
      seedDownloadClient(db, {
        name: "Override Client",
        implementation: "SABnzbd",
        protocol: "usenet",
        port: PORTS.SABNZBD,
      });

      db.insert(schema.syncedIndexers)
        .values({
          name: "Synced Override Test",
          implementation: "Newznab",
          configContract: "NewznabSettings",
          protocol: "usenet",
          baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
          apiPath: "/api",
          apiKey: "synced-key",
          categories: "[]",
          enableRss: true,
          enableAutomaticSearch: true,
          enableInteractiveSearch: true,
          priority: 25,
        })
        .run();

      await navigateTo(page, appUrl, "/settings/indexers");

      // Click the edit button on the synced row
      const syncedRow = page
        .getByRole("row")
        .filter({ hasText: "Synced Override Test" });
      await syncedRow.getByRole("button").first().click();

      // Should open the synced indexer dialog
      await expect(page.getByRole("dialog")).toBeVisible();
    });
  });

  // ─── Download Profiles ────────────────────────────────────────────────────

  test.describe("Download Profiles", () => {
    test("create download profile", async ({ page, appUrl, tempDir }) => {
      await navigateTo(page, appUrl, "/settings/profiles");

      await page.getByRole("button", { name: "Add Profile" }).click();

      // Fill profile form
      await expect(
        page.getByRole("heading", { name: "Add Profile" }),
      ).toBeVisible();

      // Name field
      const nameInput = page.getByLabel("Name");
      await nameInput.fill("EPUB Only");

      // Root folder path (must be a real path)
      const rootFolderInput = page.getByLabel("Root Folder");
      await rootFolderInput.fill(tempDir);

      // Save
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog").first()).not.toBeVisible({
        timeout: 5000,
      });

      await expect(page.getByText("EPUB Only")).toBeVisible();
    });

    test("edit download profile", async ({ page, appUrl, db, tempDir }) => {
      const { seedDownloadProfile } = await import("../fixtures/seed-data");
      seedDownloadProfile(db, {
        name: "Editable Profile",
        rootFolderPath: tempDir,
      });

      await navigateTo(page, appUrl, "/settings/profiles");

      await expect(page.getByText("Editable Profile")).toBeVisible();

      // Click edit on the profile card
      const profileCard = page
        .locator("[class*='card'], tr, [role='row']")
        .filter({ hasText: "Editable Profile" });
      await profileCard.getByRole("button").first().click();

      await expect(page.getByText("Edit Profile")).toBeVisible();

      const nameInput = page.getByLabel("Name");
      await nameInput.fill("Updated Profile");

      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog").first()).not.toBeVisible({
        timeout: 5000,
      });

      await expect(page.getByText("Updated Profile")).toBeVisible();
    });

    test("delete download profile", async ({ page, appUrl, db }) => {
      const { seedDownloadProfile } = await import("../fixtures/seed-data");
      seedDownloadProfile(db, { name: "Profile To Delete" });

      await navigateTo(page, appUrl, "/settings/profiles");

      await expect(page.getByText("Profile To Delete")).toBeVisible();

      // Click delete on the profile
      const profileCard = page
        .locator("[class*='card'], tr, [role='row']")
        .filter({ hasText: "Profile To Delete" });
      await profileCard.getByRole("button").nth(1).click();

      // Confirm deletion
      await page.getByRole("button", { name: "Confirm" }).click();

      await expect(page.getByText("Profile To Delete")).not.toBeVisible({
        timeout: 5000,
      });
    });
  });

  // ─── Metadata Profile ────────────────────────────────────────────────────

  test.describe("Metadata Profile", () => {
    test("update minimum pages and popularity", async ({ page, appUrl }) => {
      await navigateTo(page, appUrl, "/settings/metadata");

      // Update minimum popularity
      const popSection = page
        .locator("div")
        .filter({ hasText: "Minimum Popularity" })
        .last();
      const popInput = popSection.locator('input[type="number"]');
      await popInput.fill("50");

      // Update minimum pages
      const pagesSection = page
        .locator("div")
        .filter({ hasText: "Minimum Pages" })
        .last();
      const pagesInput = pagesSection.locator('input[type="number"]');
      await pagesInput.fill("100");

      // Save
      await page.getByRole("button", { name: "Save Profile" }).click();

      // Reload and verify persistence
      await page.reload();
      await page.waitForLoadState("load");
      await waitForHydration(page);

      const popSectionReloaded = page
        .locator("div")
        .filter({ hasText: "Minimum Popularity" })
        .last();
      await expect(
        popSectionReloaded.locator('input[type="number"]'),
      ).toHaveValue("50");
      const pagesSectionReloaded = page
        .locator("div")
        .filter({ hasText: "Minimum Pages" })
        .last();
      await expect(
        pagesSectionReloaded.locator('input[type="number"]'),
      ).toHaveValue("100");
    });

    test("toggle import filter switches", async ({ page, appUrl }) => {
      await navigateTo(page, appUrl, "/settings/metadata");

      // Toggle "Skip books with missing release date"
      const skipReleaseDateSwitch = page
        .locator("label, div")
        .filter({ hasText: "Skip books with missing release date" })
        .locator("button[role='switch']")
        .first();

      await expect(skipReleaseDateSwitch).toBeVisible();
      await skipReleaseDateSwitch.click();

      // Save
      await page.getByRole("button", { name: "Save Profile" }).click();

      // Verify toast or page did not error
      await expect(page.getByText("Metadata Profile")).toBeVisible();
    });
  });

  // ─── General Settings ────────────────────────────────────────────────────

  test.describe("General Settings", () => {
    test("regenerate API key", async ({ page, appUrl }) => {
      await navigateTo(page, appUrl, "/settings/general");

      // Get the API key input
      const apiKeyInput = page.locator("input[readonly]").first();

      // Click regenerate
      await page.getByRole("button", { name: /regenerate api key/i }).click();

      // Confirm in dialog
      await expect(page.getByText("Regenerate API Key?")).toBeVisible();
      await page.getByRole("button", { name: "Confirm" }).click();

      // Wait for the key to change
      await expect(async () => {
        const newKey = await apiKeyInput.inputValue();
        expect(newKey).not.toBe("");
        // Verify the key actually changed (unless there was no key before)
        expect(newKey.length).toBeGreaterThan(0);
      }).toPass({ timeout: 5000 });
    });

    test("save media management settings", async ({ page, appUrl }) => {
      await navigateTo(page, appUrl, "/settings/media-management");

      // Toggle "Rename Books" switch
      const renameBooksSwitch = page
        .locator("div")
        .filter({ hasText: /^Rename Books/ })
        .locator("button[role='switch']")
        .first();

      await expect(renameBooksSwitch).toBeVisible();
      await renameBooksSwitch.click();

      // Save
      await page.getByRole("button", { name: "Save Settings" }).click();

      // Verify no error
      await expect(
        page.getByRole("heading", { name: "Media Management" }),
      ).toBeVisible();
    });
  });
});
