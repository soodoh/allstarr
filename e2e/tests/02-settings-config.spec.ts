import * as schema from "../../src/db/schema";
import { expect, test } from "../fixtures/app";
import { ensureAuthenticated, waitForHydration } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import PORTS from "../ports";

test.use({
	fakeServerScenario: "settings-config-default",
	requiredServices: [
		"QBITTORRENT",
		"TRANSMISSION",
		"DELUGE",
		"RTORRENT",
		"SABNZBD",
		"NZBGET",
		"NEWZNAB",
	],
});

test.describe("Settings and Configuration", () => {
	test.beforeEach(async ({ page, appUrl }) => {
		await ensureAuthenticated(page, appUrl);
	});

	test.describe("Download Clients", () => {
		test("add and test qBittorrent client", async ({ page, appUrl }) => {
			await navigateTo(page, appUrl, "/settings/download-clients");
			await page.getByRole("button", { name: "Add Client" }).click();
			await page.getByRole("button", { name: "qBittorrent" }).click();
			await page.locator("#dc-name").fill("Test qBittorrent");
			await page.locator("#dc-host").fill("localhost");
			await page.locator("#dc-port").fill(String(PORTS.QBITTORRENT));
			await page.locator("#dc-username").fill("admin");
			await page.locator("#dc-password").fill("adminadmin");
			await page.getByRole("button", { name: "Test Connection" }).click();
			await expect(page.getByText("v4.6.3")).toBeVisible({ timeout: 10_000 });
			await page.getByRole("button", { name: "Save" }).click();
			await expect(page.getByRole("dialog").first()).not.toBeVisible({
				timeout: 5000,
			});
			await expect(page.getByText("Test qBittorrent")).toBeVisible();
		});

		test("add and test Transmission client", async ({ page, appUrl }) => {
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

		test("add and test Deluge client", async ({ page, appUrl }) => {
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

		test("add and test rTorrent client", async ({ page, appUrl }) => {
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

		test("add and test SABnzbd client", async ({ page, appUrl }) => {
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

		test("add and test NZBGet client", async ({ page, appUrl }) => {
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

		test("edit download client", async ({ page, appUrl, db }) => {
			const { seedDownloadClient } = await import("../fixtures/seed-data");
			seedDownloadClient(db, { name: "Editable qBittorrent" });

			await navigateTo(page, appUrl, "/settings/download-clients");
			await expect(page.getByText("Editable qBittorrent")).toBeVisible();

			const row = page
				.getByRole("row")
				.filter({ hasText: "Editable qBittorrent" });
			await row.getByRole("button").first().click();
			await expect(page.getByText("Edit Download Client")).toBeVisible();

			await page.locator("#dc-name").fill("Edited qBittorrent");
			await page.getByRole("button", { name: "Save" }).click();
			await expect(page.getByRole("dialog").first()).not.toBeVisible({
				timeout: 5000,
			});
			await expect(page.getByText("Edited qBittorrent")).toBeVisible();
		});

		test("delete download client", async ({ page, appUrl, db }) => {
			const { seedDownloadClient } = await import("../fixtures/seed-data");
			seedDownloadClient(db, { name: "Client To Delete" });

			await navigateTo(page, appUrl, "/settings/download-clients");
			await expect(page.getByText("Client To Delete")).toBeVisible();

			const row = page.getByRole("row").filter({ hasText: "Client To Delete" });
			await row.getByRole("button").nth(1).click();
			await expect(page.getByText("Delete Download Client")).toBeVisible();
			await page.getByRole("button", { name: "Confirm" }).click();
			await expect(page.getByText("Client To Delete")).not.toBeVisible({
				timeout: 5000,
			});
		});
	});

	test.describe("Indexers", () => {
		test("add Newznab indexer", async ({ page, appUrl }) => {
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

		test("add Torznab indexer", async ({ page, appUrl }) => {
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

		test("test indexer connection", async ({
			page,
			appUrl,
			setFakeServiceState,
		}) => {
			await setFakeServiceState("NEWZNAB", "caps-v2");
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

		test("delete indexer", async ({ page, appUrl, db }) => {
			const { seedIndexer } = await import("../fixtures/seed-data");
			seedIndexer(db, { name: "Indexer To Delete" });

			await navigateTo(page, appUrl, "/settings/indexers");
			await expect(page.getByText("Indexer To Delete")).toBeVisible();

			const row = page
				.getByRole("row")
				.filter({ hasText: "Indexer To Delete" });
			await row.getByRole("button").nth(1).click();
			await expect(page.getByText("Delete Indexer")).toBeVisible();
			await page.getByRole("button", { name: "Confirm" }).click();
			await expect(page.getByText("Indexer To Delete")).not.toBeVisible({
				timeout: 5000,
			});
		});
	});

	test.describe("Prowlarr Sync", () => {
		test("synced indexer appears with badge", async ({ page, appUrl, db }) => {
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
			await expect(page.getByText("Prowlarr Synced")).toBeVisible();
			await expect(page.getByText("Prowlarr Sync")).toBeVisible();
		});
	});

	test.describe("Download Profiles", () => {
		test("create download profile", async ({ page, appUrl, tempDir }) => {
			await navigateTo(page, appUrl, "/settings/profiles");
			await page.getByRole("button", { name: "Add Profile" }).click();
			await expect(
				page.getByRole("heading", { name: "Add Profile" }),
			).toBeVisible();

			await page.getByLabel("Name").fill("EPUB Only");
			await page.getByLabel("Root Folder").fill(tempDir);
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

			const profileCard = page
				.locator("[class*='card'], tr, [role='row']")
				.filter({ hasText: "Editable Profile" });
			await profileCard.getByRole("button").first().click();
			await expect(page.getByText("Edit Profile")).toBeVisible();

			await page.getByLabel("Name").fill("Updated Profile");
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

			const profileCard = page
				.locator("[class*='card'], tr, [role='row']")
				.filter({ hasText: "Profile To Delete" });
			await profileCard.getByRole("button").nth(1).click();
			await page.getByRole("button", { name: "Confirm" }).click();
			await expect(page.getByText("Profile To Delete")).not.toBeVisible({
				timeout: 5000,
			});
		});
	});

	test.describe("Metadata Profile", () => {
		test("update minimum pages and popularity", async ({ page, appUrl }) => {
			await navigateTo(page, appUrl, "/settings/metadata");

			const popSection = page
				.locator("div")
				.filter({ hasText: "Minimum Popularity" })
				.last();
			await popSection.locator('input[type="number"]').fill("50");

			const pagesSection = page
				.locator("div")
				.filter({ hasText: "Minimum Pages" })
				.last();
			await pagesSection.locator('input[type="number"]').fill("100");

			await page
				.getByRole("button", { name: "Save Hardcover Settings" })
				.click();

			await page.reload();
			await page.waitForLoadState("load");
			await waitForHydration(page);

			await expect(popSection.locator('input[type="number"]')).toHaveValue(
				"50",
			);
			await expect(pagesSection.locator('input[type="number"]')).toHaveValue(
				"100",
			);
		});
	});

	test.describe("General Settings", () => {
		test("regenerate API key", async ({ page, appUrl }) => {
			await navigateTo(page, appUrl, "/settings/general");

			const apiKeyInput = page.locator("input[readonly]").first();
			await page.getByRole("button", { name: /regenerate api key/i }).click();
			await expect(page.getByText("Regenerate API Key?")).toBeVisible();
			await page.getByRole("button", { name: "Confirm" }).click();

			await expect(async () => {
				const newKey = await apiKeyInput.inputValue();
				expect(newKey).not.toBe("");
				expect(newKey.length).toBeGreaterThan(0);
			}).toPass({ timeout: 5000 });
		});

		test("save media management settings", async ({ page, appUrl }) => {
			await navigateTo(page, appUrl, "/settings/media-management");

			const renameBooksSwitch = page
				.locator("div")
				.filter({ hasText: /^Rename Books/ })
				.locator("button[role='switch']")
				.first();

			await expect(renameBooksSwitch).toBeVisible();
			await renameBooksSwitch.click();
			await page.getByRole("button", { name: "Save Settings" }).click();
			await expect(
				page.getByRole("heading", { name: "Media Management" }),
			).toBeVisible();
		});
	});
});
