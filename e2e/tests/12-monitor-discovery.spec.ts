import type { Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { expect, test } from "../fixtures/app";
import {
	seedAuthor,
	seedBook,
	seedDownloadClient,
	seedDownloadProfile,
	seedEdition,
	seedIndexer,
} from "../fixtures/seed-data";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import PORTS from "../ports";

test.use({
	fakeServerScenario: "monitor-discovery-default",
	requiredServices: ["QBITTORRENT", "NEWZNAB", "HARDCOVER", "TMDB"],
});

async function triggerTask(
	page: Page,
	appUrl: string,
	taskName: string,
): Promise<void> {
	await fetch(`${appUrl}/api/__test-reset`, { method: "POST" }).catch(() => {
		// Best effort. The task page itself is the real sync point.
	});

	await navigateTo(page, appUrl, "/system/tasks");

	const row = page.getByRole("row").filter({ hasText: taskName });
	await expect(row).toBeVisible({ timeout: 10_000 });

	const runButton = row.getByRole("button").last();
	await expect(runButton).toBeEnabled({ timeout: 5_000 });
	await runButton.click();

	await expect(async () => {
		const status = await row
			.getByText(/Running|Success|Error/)
			.first()
			.textContent();
		expect(status).not.toBe("Running");
	}).toPass({ timeout: 30_000 });
}

test.describe("Monitor discovery", () => {
	test.beforeEach(async ({ page, appUrl, db }) => {
		await ensureAuthenticated(page, appUrl);

		db.delete(schema.trackedDownloads).run();
		db.delete(schema.history).run();
		db.delete(schema.bookFiles).run();
		db.delete(schema.blocklist).run();
		db.delete(schema.editionDownloadProfiles).run();
		db.delete(schema.authorDownloadProfiles).run();
		db.delete(schema.seriesDownloadProfiles).run();
		db.delete(schema.seriesBookLinks).run();
		db.delete(schema.editions).run();
		db.delete(schema.booksAuthors).run();
		db.delete(schema.books).run();
		db.delete(schema.series).run();
		db.delete(schema.authors).run();

		db.delete(schema.movieDownloadProfiles).run();
		db.delete(schema.movieCollectionDownloadProfiles).run();
		db.delete(schema.movieFiles).run();
		db.delete(schema.movieCollectionMovies).run();
		db.delete(schema.movies).run();
		db.delete(schema.movieCollections).run();

		db.delete(schema.episodeDownloadProfiles).run();
		db.delete(schema.showDownloadProfiles).run();
		db.delete(schema.episodeFiles).run();
		db.delete(schema.episodes).run();
		db.delete(schema.seasons).run();
		db.delete(schema.shows).run();

		db.delete(schema.downloadClients).run();
		db.delete(schema.indexers).run();
		db.delete(schema.syncedIndexers).run();
		db.delete(schema.downloadProfiles).run();
	});

	test("editing an author to monitor new books changes the next RSS sync", async ({
		page,
		appUrl,
		db,
		checkpoint,
		fakeServers,
		setFakeServiceState,
	}) => {
		const profile = seedDownloadProfile(db, {
			name: "Books Profile",
			rootFolderPath: "/books",
			categories: [7020],
		});
		const author = seedAuthor(db, {
			name: "Monitor Author",
			sortName: "Author, Monitor",
			slug: "monitor-author",
			foreignAuthorId: "100",
			monitorNewBooks: "none",
		});
		const existingBook = seedBook(db, author.id, {
			title: "Settled Book",
			slug: "settled-book",
			foreignBookId: "200",
		});
		seedEdition(db, existingBook.id, {
			title: "Settled Book - EPUB",
			foreignEditionId: "300",
			format: "Ebook",
		});

		db.insert(schema.authorDownloadProfiles)
			.values({ authorId: author.id, downloadProfileId: profile.id })
			.run();

		seedDownloadClient(db, {
			name: "Books qBittorrent",
			implementation: "qBittorrent",
			protocol: "torrent",
			port: PORTS.QBITTORRENT,
		});
		seedIndexer(db, {
			name: "Books Indexer",
			implementation: "Torznab",
			protocol: "torrent",
			baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
			apiKey: "test-newznab-api-key",
			enableRss: true,
			enableAutomaticSearch: true,
		});
		checkpoint();

		await setFakeServiceState("HARDCOVER", "monitor-author-refresh");
		await setFakeServiceState("NEWZNAB", "monitor-fresh-arrival");

		db.update(schema.authors)
			.set({ monitorNewBooks: "all" })
			.where(eq(schema.authors.id, author.id))
			.run();
		checkpoint();

		await expect
			.poll(
				() =>
					db
						.select({ monitorNewBooks: schema.authors.monitorNewBooks })
						.from(schema.authors)
						.where(eq(schema.authors.id, author.id))
						.get()?.monitorNewBooks ?? null,
			)
			.toBe("all");

		await triggerTask(page, appUrl, "Refresh Hardcover Metadata");

		await expect
			.poll(
				() =>
					db
						.select({ id: schema.books.id })
						.from(schema.books)
						.where(eq(schema.books.foreignBookId, "201"))
						.get()?.id ?? null,
			)
			.not.toBeNull();

		const freshBook = db
			.select({ id: schema.books.id })
			.from(schema.books)
			.where(eq(schema.books.foreignBookId, "201"))
			.get();
		expect(freshBook).toBeTruthy();

		const freshBookProfileLinks = db
			.select({
				downloadProfileId: schema.editionDownloadProfiles.downloadProfileId,
			})
			.from(schema.editionDownloadProfiles)
			.innerJoin(
				schema.editions,
				eq(schema.editions.id, schema.editionDownloadProfiles.editionId),
			)
			.where(eq(schema.editions.bookId, freshBook!.id))
			.all();
		expect(freshBookProfileLinks).toEqual([
			expect.objectContaining({ downloadProfileId: profile.id }),
		]);

		await triggerTask(page, appUrl, "RSS Sync");

		const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then(
			(r) => r.json(),
		);
		expect(qbState.addedDownloads).toHaveLength(1);

		const tracked = db.select().from(schema.trackedDownloads).all();
		expect(tracked).toHaveLength(1);
		expect(tracked[0]?.releaseTitle).toContain("Fresh Arrival");
	});

	test("refreshing a monitored series adds a newly discovered book to the wanted set", async ({
		page,
		appUrl,
		db,
		checkpoint,
		setFakeServiceState,
	}) => {
		const profile = seedDownloadProfile(db, {
			name: "Series Profile",
			rootFolderPath: "/books",
		});
		const existingAuthor = seedAuthor(db, {
			name: "Series Keeper",
			sortName: "Keeper, Series",
			slug: "series-keeper",
			foreignAuthorId: "110",
		});
		const existingBook = seedBook(db, existingAuthor.id, {
			title: "Series Origin",
			slug: "series-origin",
			foreignBookId: "210",
		});
		const existingEdition = seedEdition(db, existingBook.id, {
			title: "Series Origin - EPUB",
			foreignEditionId: "310",
			format: "Ebook",
		});

		const seriesRow = db
			.insert(schema.series)
			.values({
				title: "Discovery Saga",
				slug: "discovery-saga",
				foreignSeriesId: "910",
				monitored: true,
				isCompleted: false,
			})
			.returning()
			.get();

		db.insert(schema.seriesBookLinks)
			.values({
				seriesId: seriesRow.id,
				bookId: existingBook.id,
				position: "1",
			})
			.run();
		db.insert(schema.seriesDownloadProfiles)
			.values({
				seriesId: seriesRow.id,
				downloadProfileId: profile.id,
			})
			.run();
		db.insert(schema.editionDownloadProfiles)
			.values({
				editionId: existingEdition.id,
				downloadProfileId: profile.id,
			})
			.run();
		checkpoint();

		await setFakeServiceState("HARDCOVER", "monitor-series-refresh");

		await navigateTo(page, appUrl, "/series");
		await page.getByRole("button", { name: "Refresh All" }).click();

		await expect
			.poll(
				() =>
					db
						.select({
							id: schema.books.id,
							title: schema.books.title,
						})
						.from(schema.books)
						.where(eq(schema.books.foreignBookId, "211"))
						.get() ?? null,
			)
			.toEqual(
				expect.objectContaining({
					title: "Series Continuation",
				}),
			);

		const newBook = db
			.select({ id: schema.books.id })
			.from(schema.books)
			.where(eq(schema.books.foreignBookId, "211"))
			.get();
		expect(newBook).toBeTruthy();

		const wantedEditionLinks = db
			.select({
				editionId: schema.editionDownloadProfiles.editionId,
				downloadProfileId: schema.editionDownloadProfiles.downloadProfileId,
			})
			.from(schema.editionDownloadProfiles)
			.innerJoin(
				schema.editions,
				eq(schema.editions.id, schema.editionDownloadProfiles.editionId),
			)
			.where(eq(schema.editions.bookId, newBook!.id))
			.all();
		expect(wantedEditionLinks).toEqual([
			expect.objectContaining({ downloadProfileId: profile.id }),
		]);
	});

	test("refreshing monitored collections makes a newly discovered movie searchable", async ({
		page,
		appUrl,
		db,
		checkpoint,
	}) => {
		const movieProfile = seedDownloadProfile(db, {
			name: "Movie Profile",
			rootFolderPath: "/movies",
			contentType: "movie",
			icon: "film",
		});

		const collection = db
			.insert(schema.movieCollections)
			.values({
				title: "Discovery Collection",
				sortTitle: "Discovery Collection",
				tmdbId: 5500,
				overview: "Collection overview",
				monitored: true,
				minimumAvailability: "released",
			})
			.returning()
			.get();

		const existingMovie = db
			.insert(schema.movies)
			.values({
				title: "Existing Collection Movie",
				sortTitle: "Existing Collection Movie",
				overview: "Existing movie overview",
				tmdbId: 5501,
				status: "released",
				studio: "Example Studio",
				year: 2022,
				runtime: 120,
				genres: ["Science Fiction"],
				tags: [],
				posterUrl: "https://example.com/existing.jpg",
				fanartUrl: "https://example.com/existing-backdrop.jpg",
				minimumAvailability: "released",
				collectionId: collection.id,
			})
			.returning()
			.get();

		db.insert(schema.movieCollectionMovies)
			.values({
				collectionId: collection.id,
				tmdbId: existingMovie.tmdbId,
				title: existingMovie.title,
				overview: existingMovie.overview,
				posterUrl: existingMovie.posterUrl,
				releaseDate: "2022-01-01",
				year: 2022,
			})
			.run();
		db.insert(schema.movieCollectionDownloadProfiles)
			.values({
				collectionId: collection.id,
				downloadProfileId: movieProfile.id,
			})
			.run();
		checkpoint();

		await navigateTo(page, appUrl, "/movies/collections");
		await page.getByRole("button", { name: "Refresh All" }).click();

		await expect
			.poll(
				() =>
					db
						.select({
							id: schema.movies.id,
							title: schema.movies.title,
						})
						.from(schema.movies)
						.where(eq(schema.movies.tmdbId, 5502))
						.get() ?? null,
			)
			.toEqual(
				expect.objectContaining({
					title: "Fresh Collection Movie",
				}),
			);

		await navigateTo(page, appUrl, "/movies");
		await page.getByPlaceholder("Search by title...").fill("Fresh Collection");
		await expect(page.getByText("Fresh Collection Movie")).toBeVisible();
	});

	test("refreshing monitored shows picks up new-season episodes", async ({
		page,
		appUrl,
		db,
		checkpoint,
	}) => {
		const tvProfile = seedDownloadProfile(db, {
			name: "TV Profile",
			rootFolderPath: "/tv",
			contentType: "tv",
			icon: "monitor",
		});

		const show = db
			.insert(schema.shows)
			.values({
				title: "Discovery Show",
				sortTitle: "Discovery Show",
				overview: "Discovery Show overview",
				tmdbId: 7700,
				imdbId: "tt7700",
				status: "continuing",
				seriesType: "standard",
				network: "Example Network",
				year: 2024,
				runtime: 55,
				genres: ["Drama"],
				tags: [],
				posterUrl: "https://example.com/show.jpg",
				fanartUrl: "https://example.com/show-backdrop.jpg",
				monitorNewSeasons: "all",
			})
			.returning()
			.get();

		const seasonOne = db
			.insert(schema.seasons)
			.values({
				showId: show.id,
				seasonNumber: 1,
				overview: "First season",
				posterUrl: "https://example.com/season-1.jpg",
			})
			.returning()
			.get();

		const pilot = db
			.insert(schema.episodes)
			.values({
				showId: show.id,
				seasonId: seasonOne.id,
				episodeNumber: 1,
				title: "Pilot",
				overview: "Pilot overview",
				airDate: "2024-01-01",
				runtime: 55,
				tmdbId: 8801,
				hasFile: false,
			})
			.returning()
			.get();

		db.insert(schema.showDownloadProfiles)
			.values({
				showId: show.id,
				downloadProfileId: tvProfile.id,
			})
			.run();
		db.insert(schema.episodeDownloadProfiles)
			.values({
				episodeId: pilot.id,
				downloadProfileId: tvProfile.id,
			})
			.run();
		checkpoint();

		await triggerTask(page, appUrl, "Refresh TMDB Metadata");

		await expect
			.poll(
				() =>
					db
						.select({ id: schema.episodes.id })
						.from(schema.episodes)
						.where(eq(schema.episodes.showId, show.id))
						.all().length,
			)
			.toBe(3);

		const seasonTwo = db
			.select({ id: schema.seasons.id })
			.from(schema.seasons)
			.where(
				and(
					eq(schema.seasons.showId, show.id),
					eq(schema.seasons.seasonNumber, 2),
				),
			)
			.get();
		expect(seasonTwo).toBeTruthy();

		const seasonTwoEpisodes = db
			.select({
				id: schema.episodes.id,
				title: schema.episodes.title,
				episodeNumber: schema.episodes.episodeNumber,
			})
			.from(schema.episodes)
			.where(eq(schema.episodes.seasonId, seasonTwo!.id))
			.all();
		expect(seasonTwoEpisodes).toHaveLength(2);
		expect(seasonTwoEpisodes.map((episode) => episode.title)).toEqual([
			"A New Start",
			"Another Step",
		]);

		const monitoredSeasonTwoEpisodes = db
			.select({
				episodeId: schema.episodeDownloadProfiles.episodeId,
				downloadProfileId: schema.episodeDownloadProfiles.downloadProfileId,
			})
			.from(schema.episodeDownloadProfiles)
			.where(
				and(
					eq(schema.episodeDownloadProfiles.downloadProfileId, tvProfile.id),
					inArray(
						schema.episodeDownloadProfiles.episodeId,
						seasonTwoEpisodes.map((episode) => episode.id),
					),
				),
			)
			.all();
		expect(monitoredSeasonTwoEpisodes).toHaveLength(2);
	});
});
