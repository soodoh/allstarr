import type { Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { test, expect } from "../fixtures/app";
import { seedAuthor, seedBook } from "../fixtures/seed-data";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import type { ServiceName } from "../fixtures/fake-servers/manager";

test.use({
	fakeServerScenario: "imports-all-sources-mapped",
	requiredServices: ["HARDCOVER", "TMDB", "SONARR", "RADARR", "READARR", "BOOKSHELF"],
});

type SupportedPlanAssertion = {
	action: "Create" | "Update";
	summary: string;
	target?: string;
	title: string;
};

type SourceFlow = {
	expectedClient: Record<string, unknown>;
	expectedProfile: Record<string, unknown>;
	expectedProvenance: Array<{
		sourceKey: string;
		targetId?: string;
		targetType: string;
	}>;
	kind: "sonarr" | "radarr" | "readarr" | "bookshelf";
	label: string;
	metadataSetting?: Record<string, unknown>;
	visibleRows: SupportedPlanAssertion[];
};

type ClientSnapshot = Omit<
	typeof schema.downloadClients.$inferSelect,
	"id" | "createdAt" | "updatedAt"
>;

type ProfileSnapshot = Omit<typeof schema.downloadProfiles.$inferSelect, "id">;

async function addImportSource(args: {
	apiKey: string;
	baseUrl: string;
	kind: "sonarr" | "radarr" | "readarr" | "bookshelf";
	label: string;
	page: Page;
}): Promise<void> {
	const { page, apiKey, baseUrl, kind, label } = args;

	await page.getByRole("button", { name: "Add source" }).click();
	await expect(page.getByRole("heading", { name: "Add Import Source" })).toBeVisible();

	const sourceType = page.getByRole("combobox", { name: "Source Type" });
	await sourceType.click();
	await page.getByRole("option", { name: new RegExp(kind, "i") }).click();

	await page.getByLabel("Label").fill(label);
	await page.getByLabel("Base URL").fill(baseUrl);
	await page.getByLabel("API Key").fill(apiKey);
	await page.getByRole("button", { name: "Create Source" }).click();

	await expect(page.getByRole("heading", { name: "Add Import Source" })).not.toBeVisible({ timeout: 10_000 });
	await expect(page.getByText(label)).toBeVisible({ timeout: 10_000 });
}

function sourceActionButton(
	page: Page,
	label: string,
	action: "Refresh" | "Select" | "Selected",
) {
	return page.locator(
		`xpath=(//div[contains(normalize-space(.), "${label}")]/following::button[normalize-space()="${action}"])[1]`,
	);
}

function planRow(page: Page, label: string) {
	return page
		.getByRole("tabpanel", { name: "Plan" })
		.getByRole("row")
		.filter({ hasText: label })
		.first();
}

async function refreshSource(page: Page, label: string): Promise<void> {
	await sourceActionButton(page, label, "Refresh").click();
}

function requireServiceUrl(
	fakeServers: Partial<Record<ServiceName, string>>,
	name: ServiceName,
): string {
	const url = fakeServers[name];
	if (!url) {
		throw new Error(`Missing fake server URL for ${name}`);
	}

	return url;
}

async function selectSource(page: Page, label: string): Promise<void> {
	await page.getByRole("tab", { name: "Sources" }).click();

	const selectedButton = sourceActionButton(page, label, "Selected");
	if ((await selectedButton.count()) > 0) {
		return;
	}

	await sourceActionButton(page, label, "Select").click();
	await expect(selectedButton).toBeVisible();
}

async function assertPlanRows(
	page: Page,
	assertions: SupportedPlanAssertion[],
): Promise<void> {
	for (const assertion of assertions) {
		const row = planRow(page, assertion.title);
		await expect(row).toContainText(assertion.title);
		await expect(row).toContainText(assertion.action);
		await expect(row).toContainText(assertion.summary);
		if (assertion.target) {
			await expect(row).toContainText(assertion.target);
		}
	}
}

test.describe("Servarr imports", () => {
	test.beforeEach(async ({ page, appUrl }) => {
		await ensureAuthenticated(page, appUrl);
		await navigateTo(page, appUrl, "/settings/imports");
	});

	test("applies mapped Sonarr, Radarr, Readarr, and Bookshelf rows and persists imported records", async ({
		db,
		checkpoint,
		page,
		fakeServers,
	}) => {
		const show = db
			.insert(schema.shows)
			.values({
				sortTitle: "The Office (US)",
				title: "The Office (US)",
				tmdbId: 2316,
				year: 2005,
			})
			.returning()
			.get();
		const movie = db
			.insert(schema.movies)
			.values({
				sortTitle: "The Matrix",
				title: "The Matrix",
				tmdbId: 603,
				year: 1999,
			})
			.returning()
			.get();
		const earthseaAuthor = seedAuthor(db, {
			foreignAuthorId: "hc-author-earthsea",
			name: "Ursula K. Le Guin",
			slug: "ursula-k-le-guin",
			sortName: "Le Guin, Ursula K.",
		});
		const earthseaBook = seedBook(db, earthseaAuthor.id, {
			foreignBookId: "hc-earthsea-1",
			releaseYear: 1968,
			slug: "a-wizard-of-earthsea",
			title: "A Wizard of Earthsea",
		});

		checkpoint();

		await addImportSource({
			apiKey: "sonarr-key",
			baseUrl: requireServiceUrl(fakeServers, "SONARR"),
			kind: "sonarr",
			label: "Alpha Sonarr",
			page,
		});

		await addImportSource({
			apiKey: "radarr-key",
			baseUrl: requireServiceUrl(fakeServers, "RADARR"),
			kind: "radarr",
			label: "Bravo Radarr",
			page,
		});

		await addImportSource({
			apiKey: "readarr-key",
			baseUrl: requireServiceUrl(fakeServers, "READARR"),
			kind: "readarr",
			label: "Charlie Readarr",
			page,
		});

		await addImportSource({
			apiKey: "bookshelf-key",
			baseUrl: `${requireServiceUrl(fakeServers, "BOOKSHELF")}/bookshelf`,
			kind: "bookshelf",
			label: "Delta Bookshelf",
			page,
		});

		await refreshSource(page, "Alpha Sonarr");
		await expect
			.poll(
				() =>
					db
						.select()
						.from(schema.importSources)
						.where(eq(schema.importSources.label, "Alpha Sonarr"))
						.get()?.lastSyncStatus,
			)
			.toBe("synced");

		await refreshSource(page, "Bravo Radarr");
		await expect
			.poll(
				() =>
					db
						.select()
						.from(schema.importSources)
						.where(eq(schema.importSources.label, "Bravo Radarr"))
						.get()?.lastSyncStatus,
			)
			.toBe("synced");

		await refreshSource(page, "Charlie Readarr");
		await expect
			.poll(
				() =>
					db
						.select()
						.from(schema.importSources)
						.where(eq(schema.importSources.label, "Charlie Readarr"))
						.get()?.lastSyncStatus,
			)
			.toBe("synced");

		await refreshSource(page, "Delta Bookshelf");
		await expect
			.poll(
				() =>
					db
						.select()
						.from(schema.importSources)
						.where(eq(schema.importSources.label, "Delta Bookshelf"))
						.get()?.lastSyncStatus,
			)
			.toBe("synced");

		const sources = db.select().from(schema.importSources).all();
		const sourceIds = Object.fromEntries(sources.map((source) => [source.label, source.id]));

		const flows: SourceFlow[] = [
			{
				expectedClient: {
					apiKey: null,
					category: "tv-sonarr",
					enabled: true,
					host: "qbittorrent-capture",
					implementation: "qBittorrent",
					name: "qBittorrent Capture",
					password: "<redacted>",
					port: 8081,
					priority: 0,
					protocol: "torrent",
					removeCompletedDownloads: false,
					settings: {
						firstAndLastPiecePriority: false,
						sequentialOrder: false,
					},
					tag: null,
					urlBase: null,
					useSsl: false,
					username: "admin",
				},
				expectedProfile: {
					categories: [18],
					contentType: "tv",
					cutoff: 9,
					icon: "tv",
					items: [[9], [15], [3], [7]],
					language: "en",
					minCustomFormatScore: 0,
					name: "HD-1080p",
					rootFolderPath: "/data/capture/library/tv",
					upgradeAllowed: false,
					upgradeUntilCustomFormatScore: 1,
				},
				expectedProvenance: [
					{
						sourceKey: `sonarr:${sourceIds["Alpha Sonarr"]}:setting:download-client:1`,
						targetType: "download-client",
					},
					{
						sourceKey: `sonarr:${sourceIds["Alpha Sonarr"]}:profile:quality:4`,
						targetType: "download-profile",
					},
					{
						sourceKey: `sonarr:${sourceIds["Alpha Sonarr"]}:show:1`,
						targetId: String(show.id),
						targetType: "show",
					},
				],
				kind: "sonarr",
				label: "Alpha Sonarr",
				visibleRows: [
					{
						action: "Create",
						summary: "download-client",
						title: "qBittorrent Capture",
					},
					{
						action: "Create",
						summary: "quality profile",
						title: "HD-1080p",
					},
					{
						action: "Update",
						summary: "TMDB 2316 | TVDB 73244",
						target: "The Office (US)",
						title: "The Office (US)",
					},
				],
			},
			{
				expectedClient: {
					apiKey: "<redacted>",
					category: "movies",
					enabled: true,
					host: "sabnzbd-capture",
					implementation: "SABnzbd",
					name: "SABnzbd Capture",
					password: "<redacted>",
					port: 8080,
					priority: 1,
					protocol: "usenet",
					removeCompletedDownloads: true,
					settings: null,
					tag: null,
					urlBase: null,
					useSsl: false,
					username: null,
				},
				expectedProfile: {
					categories: [2000],
					contentType: "movie",
					cutoff: 7,
					icon: "film",
					items: [[9], [3], [15], [7], [30]],
					language: "en",
					minCustomFormatScore: 0,
					name: "HD-1080p",
					rootFolderPath: "/data/capture/library/movies",
					upgradeAllowed: false,
					upgradeUntilCustomFormatScore: 1,
				},
				expectedProvenance: [
					{
						sourceKey: `radarr:${sourceIds["Bravo Radarr"]}:setting:download-client:1`,
						targetType: "download-client",
					},
					{
						sourceKey: `radarr:${sourceIds["Bravo Radarr"]}:profile:quality:4`,
						targetType: "download-profile",
					},
					{
						sourceKey: `radarr:${sourceIds["Bravo Radarr"]}:movie:1`,
						targetId: String(movie.id),
						targetType: "movie",
					},
				],
				kind: "radarr",
				label: "Bravo Radarr",
				visibleRows: [
					{
						action: "Create",
						summary: "download-client",
						title: "SABnzbd Capture",
					},
					{
						action: "Create",
						summary: "quality profile",
						title: "HD-1080p",
					},
					{
						action: "Update",
						summary: "TMDB 603",
						target: "The Matrix",
						title: "The Matrix",
					},
				],
			},
			{
				expectedClient: {
					apiKey: null,
					category: "allstarr",
					enabled: true,
					host: "transmission-capture",
					implementation: "Transmission",
					name: "Transmission Capture",
					password: null,
					port: 9091,
					priority: 1,
					protocol: "torrent",
					removeCompletedDownloads: false,
					settings: {
						addPaused: false,
						savePath: "/data/capture/downloads/torrents",
					},
					tag: null,
					urlBase: "/transmission/",
					useSsl: false,
					username: null,
				},
				expectedProfile: {
					categories: [7020],
					contentType: "ebook",
					cutoff: 2,
					icon: "book-open",
					items: [[2], [3], [4]],
					language: "en",
					minCustomFormatScore: 0,
					name: "eBook",
					rootFolderPath: "/data/capture/library/books",
					upgradeAllowed: false,
					upgradeUntilCustomFormatScore: 0,
				},
				expectedProvenance: [
					{
						sourceKey: `readarr:${sourceIds["Charlie Readarr"]}:setting:download-client:1`,
						targetType: "download-client",
					},
					{
						sourceKey: `readarr:${sourceIds["Charlie Readarr"]}:profile:quality:1`,
						targetType: "download-profile",
					},
					{
						sourceKey: `readarr:${sourceIds["Charlie Readarr"]}:profile:metadata:1`,
						targetId: "metadata.hardcover.profile",
						targetType: "metadata-profile",
					},
					{
						sourceKey: `readarr:${sourceIds["Charlie Readarr"]}:book:1`,
						targetId: String(earthseaBook.id),
						targetType: "book",
					},
				],
				kind: "readarr",
				label: "Charlie Readarr",
				metadataSetting: {
					allowedLanguages: "eng, null",
					id: 1,
					ignored: [],
					minPages: 0,
					minPopularity: 350,
					name: "Standard",
					skipMissingDate: true,
					skipMissingIsbn: false,
					skipPartsAndSets: true,
					skipSeriesSecondary: false,
				},
				visibleRows: [
					{
						action: "Create",
						summary: "download-client",
						title: "Transmission Capture",
					},
					{
						action: "Create",
						summary: "quality profile",
						title: "eBook",
					},
					{
						action: "Create",
						summary: "metadata profile",
						title: "Standard",
					},
					{
						action: "Update",
						summary: "Hardcover 13642",
						target: "A Wizard of Earthsea",
						title: "A Wizard of Earthsea",
					},
				],
			},
			{
				expectedClient: {
					apiKey: null,
					category: "bookshelf",
					enabled: true,
					host: "localhost",
					implementation: "qBittorrent",
					name: "Bookshelf qBittorrent",
					password: null,
					port: 8083,
					priority: 4,
					protocol: "torrent",
					removeCompletedDownloads: true,
					settings: { watchFolder: "/downloads/bookshelf" },
					tag: null,
					urlBase: null,
					useSsl: false,
					username: null,
				},
				expectedProfile: {
					categories: [7010],
					contentType: "ebook",
					cutoff: 6,
					icon: "book-open",
					items: [[6], [8]],
					language: "en",
					minCustomFormatScore: 0,
					name: "Bookshelf EPUB",
					rootFolderPath: "/bookshelf",
					upgradeAllowed: false,
					upgradeUntilCustomFormatScore: 0,
				},
				expectedProvenance: [
					{
						sourceKey: `bookshelf:${sourceIds["Delta Bookshelf"]}:setting:download-client:9401`,
						targetType: "download-client",
					},
					{
						sourceKey: `bookshelf:${sourceIds["Delta Bookshelf"]}:profile:quality:9403`,
						targetType: "download-profile",
					},
					{
						sourceKey: `bookshelf:${sourceIds["Delta Bookshelf"]}:profile:metadata:9404`,
						targetId: "metadata.hardcover.profile",
						targetType: "metadata-profile",
					},
					{
						sourceKey: `bookshelf:${sourceIds["Delta Bookshelf"]}:book:801`,
						targetId: String(earthseaBook.id),
						targetType: "book",
					},
				],
				kind: "bookshelf",
				label: "Delta Bookshelf",
				metadataSetting: {
					id: 9404,
					minimumPages: 100,
					minimumPopularity: 15,
					name: "Bookshelf OpenLibrary Profile",
					skipCompilations: true,
					skipMissingIsbnAsin: false,
					skipMissingReleaseDate: true,
				},
				visibleRows: [
					{
						action: "Create",
						summary: "download-client",
						title: "Bookshelf qBittorrent",
					},
					{
						action: "Create",
						summary: "quality profile",
						title: "Bookshelf EPUB",
					},
					{
						action: "Create",
						summary: "metadata profile",
						title: "Bookshelf OpenLibrary Profile",
					},
					{
						action: "Update",
						summary: "Author Ursula K. Le Guin | Hardcover hc-earthsea-1",
						target: "A Wizard of Earthsea",
						title: "A Wizard of Earthsea",
					},
				],
			},
		];

		for (const flow of flows) {
			await selectSource(page, flow.label);
			await page.getByRole("tab", { name: "Plan" }).click();
			await expect(planRow(page, flow.visibleRows[0].title)).toBeVisible();
			await assertPlanRows(page, flow.visibleRows);

			await page.getByRole("tabpanel", { name: "Plan" }).getByRole("button", {
				name: "Apply Selected",
			}).click();

			const resolvedProvenance = new Map<string, typeof schema.importProvenance.$inferSelect>();
			for (const provenance of flow.expectedProvenance) {
				const expected = {
					sourceId: sourceIds[flow.label],
					sourceKey: provenance.sourceKey,
					targetType: provenance.targetType,
					...(provenance.targetId ? { targetId: provenance.targetId } : {}),
				};

				await expect
					.poll(() =>
						db
							.select()
							.from(schema.importProvenance)
							.where(
								and(
									eq(schema.importProvenance.sourceId, sourceIds[flow.label]),
									eq(schema.importProvenance.sourceKey, provenance.sourceKey),
								),
							)
							.get(),
					)
					.toMatchObject(expected);

				const row = db
					.select()
					.from(schema.importProvenance)
					.where(
						and(
							eq(schema.importProvenance.sourceId, sourceIds[flow.label]),
							eq(schema.importProvenance.sourceKey, provenance.sourceKey),
						),
					)
					.get();
				if (row) {
					resolvedProvenance.set(provenance.targetType, row);
				}
			}

			const clientProvenance = resolvedProvenance.get("download-client");
			await expect
				.poll(() =>
					(() => {
						if (!clientProvenance) {
							return null;
						}
						const row = db
							.select()
							.from(schema.downloadClients)
							.where(
								eq(
									schema.downloadClients.id,
									Number(clientProvenance.targetId),
								),
							)
							.get();
						if (!row) {
							return null;
						}

						const {
							id: _id,
							createdAt: _createdAt,
							updatedAt: _updatedAt,
							...rest
						} = row;
						return rest satisfies ClientSnapshot;
					})(),
				)
				.toEqual(flow.expectedClient);

			const profileProvenance = resolvedProvenance.get("download-profile");
			await expect
				.poll(() =>
					(() => {
						if (!profileProvenance) {
							return null;
						}
						const row = db
							.select()
							.from(schema.downloadProfiles)
							.where(
								eq(
									schema.downloadProfiles.id,
									Number(profileProvenance.targetId),
								),
							)
							.get();
						if (!row) {
							return null;
						}

						const { id: _id, ...rest } = row;
						return rest satisfies ProfileSnapshot;
					})(),
				)
				.toEqual(flow.expectedProfile);

			if (flow.metadataSetting) {
				await expect
					.poll(() =>
						(() => {
							const value = db
								.select()
								.from(schema.settings)
								.where(eq(schema.settings.key, "metadata.hardcover.profile"))
								.get()?.value;
							if (typeof value === "string") {
								return JSON.parse(value) as Record<string, unknown>;
							}
							return value as Record<string, unknown> | null | undefined;
						})(),
					)
					.toEqual(flow.metadataSetting);
			}
		}
	});
});
