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
} from "../fixtures/seed-data";
import PORTS from "../ports";

test.use({
	fakeServerScenario: "search-grab-torrent",
	requiredServices: ["QBITTORRENT", "SABNZBD", "NEWZNAB"],
});

test.describe("Search and Grab", () => {
	let bookId: number;

	test.beforeEach(async ({ page, appUrl, db, checkpoint }) => {
		await ensureAuthenticated(page, appUrl);

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

		const profile = seedDownloadProfile(db, {
			name: "Search Profile",
			rootFolderPath: "/books",
			categories: [7020],
		});
		const author = seedAuthor(db, { name: "Test Author" });
		const book = seedBook(db, author.id, { title: "Test Book" });
		seedEdition(db, book.id, { title: "Test Book - EPUB Edition" });
		bookId = book.id;

		db.insert(schema.authorDownloadProfiles)
			.values({ authorId: author.id, downloadProfileId: profile.id })
			.run();

		const edition = db.select().from(schema.editions).all()[0];
		db.insert(schema.editionDownloadProfiles)
			.values({ editionId: edition.id, downloadProfileId: profile.id })
			.run();

		seedDownloadClient(db, {
			name: "Test qBittorrent",
			implementation: "qBittorrent",
			protocol: "torrent",
			port: PORTS.QBITTORRENT,
		});

		seedIndexer(db, {
			name: "Test Torznab",
			implementation: "Torznab",
			protocol: "torrent",
			baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
			apiKey: "test-newznab-api-key",
		});

		checkpoint();
	});

	test("interactive search displays releases on book detail page", async ({
		page,
		appUrl,
	}) => {
		await navigateTo(page, appUrl, `/books/${bookId}`);
		await page.getByRole("tab", { name: "Search Releases" }).click();
		await expect(
			page.getByText("Test Author - Test Book [EPUB]").first(),
		).toBeVisible({ timeout: 15_000 });
		await expect(
			page.getByText("Test Author - Test Book [MOBI]").first(),
		).toBeVisible();
	});

	test("release quality information is displayed", async ({
		page,
		appUrl,
	}) => {
		await navigateTo(page, appUrl, `/books/${bookId}`);
		await page.getByRole("tab", { name: "Search Releases" }).click();
		await expect(
			page.getByText("Test Author - Test Book [EPUB]").first(),
		).toBeVisible({ timeout: 15_000 });

		await expect(page.getByText("Quality").first()).toBeVisible();
		await expect(page.getByText("Protocol").first()).toBeVisible();
		await expect(page.getByText("Peers").first()).toBeVisible();
		await expect(page.getByText("Size").first()).toBeVisible();
		await expect(page.getByText("torrent").first()).toBeVisible();
	});

	test("grab torrent release sends to download client", async ({
		page,
		appUrl,
		db,
		fakeServers,
	}) => {
		await navigateTo(page, appUrl, `/books/${bookId}`);
		await page.getByRole("tab", { name: "Search Releases" }).click();
		await expect(
			page.getByText("Test Author - Test Book [EPUB]").first(),
		).toBeVisible({ timeout: 15_000 });
		await page.getByTitle("Grab release").first().click();
		await expect(page.getByText(/sent to/i).first()).toBeVisible({
			timeout: 10_000,
		});

		const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then((r) =>
			r.json(),
		);
		expect(qbState.addedDownloads.length).toBeGreaterThanOrEqual(1);

		const tracked = db.select().from(schema.trackedDownloads).all();
		expect(tracked.length).toBeGreaterThanOrEqual(1);
		expect(tracked[0].protocol).toBe("torrent");

		const historyEntries = db.select().from(schema.history).all();
		const grabEntry = historyEntries.find((h) => h.eventType === "bookGrabbed");
		expect(grabEntry).toBeTruthy();
	});

	test("grab usenet release sends to SABnzbd client", async ({
		page,
		appUrl,
		db,
		fakeServers,
		setFakeServerScenario,
	}) => {
		seedDownloadClient(db, {
			name: "Test SABnzbd",
			implementation: "SABnzbd",
			protocol: "usenet",
			port: PORTS.SABNZBD,
			apiKey: "test-sabnzbd-api-key",
		});

		seedIndexer(db, {
			name: "Test Newznab Usenet",
			implementation: "Newznab",
			protocol: "usenet",
			baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
			apiKey: "test-newznab-api-key",
		});

		await setFakeServerScenario("search-grab-usenet");

		await navigateTo(page, appUrl, `/books/${bookId}`);
		await page.getByRole("tab", { name: "Search Releases" }).click();
		await expect(
			page.getByText("Test Author - Test Book [EPUB]").first(),
		).toBeVisible({ timeout: 15_000 });
		await page.getByTitle("Grab release").first().click();
		await expect(page.getByText(/sent to/i).first()).toBeVisible({
			timeout: 10_000,
		});

		const sabState = await fetch(`${fakeServers.SABNZBD}/__state`).then((r) =>
			r.json(),
		);
		expect(sabState.addedDownloads.length).toBeGreaterThanOrEqual(1);
	});
});
