import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { test, expect } from "../fixtures/app";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import type { ServiceName } from "../fixtures/fake-servers/manager";

test.use({
	requiredServices: [
		"QBITTORRENT",
		"TRANSMISSION",
		"DELUGE",
		"RTORRENT",
		"SABNZBD",
		"NZBGET",
		"NEWZNAB",
		"PROWLARR",
		"HARDCOVER",
		"TMDB",
		"SONARR",
		"RADARR",
		"READARR",
		"BOOKSHELF",
	],
});

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

function sourceCard(page: Page, label: string) {
	return page
		.getByRole("tabpanel", { name: "Sources" })
		.locator("[data-slot='card']")
		.filter({ has: page.getByText(label, { exact: true }) })
		.last();
}

function sourceCardState(page: Page, label: string, text: string) {
	return page
		.getByRole("tabpanel", { name: "Sources" })
		.locator("[data-slot='card']")
		.filter({ hasText: label })
		.filter({ hasText: text })
		.first();
}

function planRow(page: Page, label: string) {
	return page
		.getByRole("tabpanel", { name: "Plan" })
		.getByRole("row")
		.filter({ hasText: label })
		.first();
}

function reviewRow(page: Page, label: string) {
	return page
		.getByRole("tabpanel", { name: "Review" })
		.locator("div.rounded-lg.border.p-4")
		.filter({ hasText: label })
		.first();
}

async function refreshSource(page: Page, label: string): Promise<void> {
	await sourceCard(page, label).getByRole("button", { name: "Refresh" }).click();
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

test.describe("Servarr imports", () => {
	test.beforeEach(async ({ page, appUrl }) => {
		await ensureAuthenticated(page, appUrl);
		await navigateTo(page, appUrl, "/settings/imports");
	});

	test("refreshes ready and failing Servarr sources and reflects their plan and review status", async ({
		db,
		page,
		fakeServers,
	}) => {
		await addImportSource({
			apiKey: "sonarr-key",
			baseUrl: requireServiceUrl(fakeServers, "SONARR"),
			kind: "sonarr",
			label: "Alpha Sonarr",
			page,
		});

		await addImportSource({
			apiKey: "bad-radarr-key",
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
			.toBe("error");

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
		await expect(
			sourceCardState(page, "Alpha Sonarr", "Last sync synced"),
		).toBeVisible();
		await expect(
			sourceCardState(page, "Charlie Readarr", "Last sync synced"),
		).toBeVisible();
		await expect(
			sourceCardState(page, "Delta Bookshelf", "Last sync synced"),
		).toBeVisible();
		await expect(sourceCardState(page, "Bravo Radarr", "Sync error")).toBeVisible();
		await expect(
			sourceCardState(
				page,
				"Bravo Radarr",
				"Source API error: 401 Unauthorized",
			),
		).toBeVisible();

		await expect(
			page.getByRole("tabpanel", { name: "Sources" }).getByRole("button", {
				name: "Unavailable",
			}),
		).toHaveCount(1);
		await expect(page.getByRole("button", { name: "Selected" })).toBeVisible();

		await page.getByRole("tab", { name: "Plan" }).click();
		const planPanel = page.getByRole("tabpanel", { name: "Plan" });
		await expect(planPanel.getByText("Ready 3", { exact: true })).toBeVisible();
		await expect(
			planPanel.getByText("Needs attention 1", { exact: true }),
		).toBeVisible();
		await expect(planRow(page, "Alpha Sonarr")).toContainText("Ready");
		await expect(planRow(page, "Alpha Sonarr")).toContainText("Ready to advance");
		await expect(planRow(page, "Charlie Readarr")).toContainText("Ready");
		await expect(planRow(page, "Charlie Readarr")).toContainText(
			"Ready to advance",
		);
		await expect(planRow(page, "Delta Bookshelf")).toContainText("Ready");
		await expect(planRow(page, "Delta Bookshelf")).toContainText(
			"Ready to advance",
		);
		await expect(planRow(page, "Bravo Radarr")).toContainText("Unavailable");
		await expect(planRow(page, "Bravo Radarr")).toContainText(
			"Resolve the sync error before planning",
		);

		await page.getByRole("tab", { name: "Review" }).click();
		const reviewPanel = page.getByRole("tabpanel", { name: "Review" });
		await expect(reviewPanel.getByText("Ready 3", { exact: true })).toBeVisible();
		await expect(
			reviewPanel.getByText("Needs attention 1", { exact: true }),
		).toBeVisible();
		await expect(reviewRow(page, "Alpha Sonarr")).toContainText(
			"Ready for review",
		);
		await expect(reviewRow(page, "Charlie Readarr")).toContainText(
			"Ready for review",
		);
		await expect(reviewRow(page, "Delta Bookshelf")).toContainText(
			"Ready for review",
		);
		await expect(reviewRow(page, "Bravo Radarr")).toContainText("Unresolved");
		await expect(reviewRow(page, "Bravo Radarr")).toContainText("Review locked");
	});
});
