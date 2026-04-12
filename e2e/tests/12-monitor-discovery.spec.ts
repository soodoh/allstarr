import type { Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { test, expect } from "../fixtures/app";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import * as schema from "../../src/db/schema";
import {
	seedAuthor,
	seedBook,
	seedDownloadClient,
	seedDownloadProfile,
	seedEdition,
	seedIndexer,
} from "../fixtures/seed-data";
import PORTS from "../ports";

type FakeServerUrls = Partial<Record<Exclude<keyof typeof PORTS, "APP_BASE">, string>>;

test.use({
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

function makeHardcoverAuthor(id: number, name: string, slug: string) {
	return {
		id,
		name,
		slug,
		bio: `${name} bio`,
		born_year: 1970,
		death_year: null,
		image: { url: `https://example.com/${slug}.jpg` },
	};
}

function makeHardcoverBook(input: {
	authorId: number;
	authorName: string;
	authorSlug: string;
	authorImageUrl?: string;
	series?: {
			id: number;
			name: string;
			slug: string;
			isCompleted: boolean;
			position: string;
	  };
		bookId: number;
		title: string;
		slug: string;
		editionId: number;
}) {
	return {
		id: input.bookId,
		title: input.title,
		slug: input.slug,
		description: `${input.title} description`,
		release_date: "2026-04-01",
		release_year: 2026,
		rating: 4.2,
		ratings_count: 1_200,
		users_count: 3_400,
		compilation: false,
		default_cover_edition_id: input.editionId,
		image: { url: `https://example.com/${input.slug}.jpg` },
		authorId: input.authorId,
		contributions: [
			{
				contribution: null,
				author: {
					id: input.authorId,
					name: input.authorName,
					slug: input.authorSlug,
					image: {
						url:
							input.authorImageUrl ??
							`https://example.com/${input.authorSlug}.jpg`,
					},
				},
			},
		],
		book_series: input.series
			? [
					{
						position: input.series.position,
						series: {
							id: input.series.id,
							name: input.series.name,
							slug: input.series.slug,
							is_completed: input.series.isCompleted,
						},
					},
				]
			: [],
	};
}

function makeHardcoverEdition(input: {
	bookId: number;
	editionId: number;
	title: string;
}) {
	return {
		id: input.editionId,
		bookId: input.bookId,
		title: input.title,
		isbn_10: null,
		isbn_13: `${input.editionId}`.padStart(13, "9"),
		asin: null,
		pages: 320,
		audio_seconds: null,
		release_date: "2026-04-01",
		users_count: 600,
		score: 88,
		image: { url: `https://example.com/${input.editionId}.jpg` },
		language: { code2: "en", language: "English" },
		reading_format: { format: "Ebook" },
		publisher: { name: "Example Press" },
	};
}

function makeTmdbMovieDetail(input: {
	id: number;
	title: string;
	collection?: { id: number; name: string };
}) {
	return {
		id: input.id,
		title: input.title,
		original_title: input.title,
		overview: `${input.title} overview`,
		poster_path: `/movie-${input.id}.jpg`,
		backdrop_path: `/movie-${input.id}-backdrop.jpg`,
		release_date: "2025-07-01",
		status: "Released",
		runtime: 130,
		genres: [{ id: 1, name: "Science Fiction" }],
		production_companies: [{ id: 1, name: "Example Studio" }],
		imdb_id: `tt${input.id}`,
		budget: 100_000_000,
		revenue: 200_000_000,
		vote_average: 7.8,
		belongs_to_collection: input.collection
			? {
					id: input.collection.id,
					name: input.collection.name,
					poster_path: "/collection.jpg",
					backdrop_path: "/collection-backdrop.jpg",
				}
			: null,
	};
}

function makeTmdbShowDetail() {
	return {
		id: 7700,
		name: "Discovery Show",
		overview: "Discovery Show overview",
		poster_path: "/show.jpg",
		backdrop_path: "/show-backdrop.jpg",
		first_air_date: "2024-01-01",
		last_air_date: "2026-04-01",
		status: "Returning Series",
		type: "Scripted",
		networks: [{ id: 1, name: "Example Network" }],
		genres: [{ id: 1, name: "Drama" }],
		number_of_seasons: 2,
		number_of_episodes: 3,
		episode_run_time: [55],
		seasons: [
			{
				id: 7701,
				season_number: 1,
				name: "Season 1",
				overview: "First season",
				poster_path: "/season-1.jpg",
				episode_count: 1,
				air_date: "2024-01-01",
			},
			{
				id: 7702,
				season_number: 2,
				name: "Season 2",
				overview: "Second season",
				poster_path: "/season-2.jpg",
				episode_count: 2,
				air_date: "2026-04-01",
			},
		],
		external_ids: { imdb_id: "tt7700" },
	};
}

async function configureTmdbState(
	fakeServers: FakeServerUrls,
): Promise<void> {
	await fetch(`${fakeServers.TMDB}/__control`, {
		method: "POST",
		body: JSON.stringify({
			collectionDetails: {
				5500: {
					id: 5500,
					name: "Discovery Collection",
					overview: "Collection overview",
					poster_path: "/collection.jpg",
					backdrop_path: "/collection-backdrop.jpg",
					parts: [
						{
							id: 5501,
							title: "Existing Collection Movie",
							overview: "Existing movie overview",
							poster_path: "/existing.jpg",
							backdrop_path: "/existing-backdrop.jpg",
							release_date: "2022-01-01",
							adult: false,
						},
						{
							id: 5502,
							title: "Fresh Collection Movie",
							overview: "Fresh movie overview",
							poster_path: "/fresh.jpg",
							backdrop_path: "/fresh-backdrop.jpg",
							release_date: "2025-07-01",
							adult: false,
						},
					],
				},
			},
			movieDetails: {
				5502: makeTmdbMovieDetail({
					id: 5502,
					title: "Fresh Collection Movie",
					collection: { id: 5500, name: "Discovery Collection" },
				}),
				5501: makeTmdbMovieDetail({
					id: 5501,
					title: "Existing Collection Movie",
					collection: { id: 5500, name: "Discovery Collection" },
				}),
			},
			showDetails: {
				7700: makeTmdbShowDetail(),
			},
			seasonDetails: {
				"7700:1": {
					id: 7701,
					season_number: 1,
					name: "Season 1",
					overview: "First season",
					poster_path: "/season-1.jpg",
					episodes: [
						{
							id: 8801,
							episode_number: 1,
							name: "Pilot",
							overview: "Pilot overview",
							air_date: "2024-01-01",
							runtime: 55,
							still_path: "/pilot.jpg",
							vote_average: 7.5,
						},
					],
				},
				"7700:2": {
					id: 7702,
					season_number: 2,
					name: "Season 2",
					overview: "Second season",
					poster_path: "/season-2.jpg",
					episodes: [
						{
							id: 8802,
							episode_number: 1,
							name: "A New Start",
							overview: "Season two premiere",
							air_date: "2026-04-01",
							runtime: 56,
							still_path: "/s2e1.jpg",
							vote_average: 7.8,
						},
						{
							id: 8803,
							episode_number: 2,
							name: "Another Step",
							overview: "Season two episode two",
							air_date: "2026-04-08",
							runtime: 57,
							still_path: "/s2e2.jpg",
							vote_average: 7.9,
						},
					],
				},
			},
		}),
	});
}

test.describe("Monitor discovery", () => {
	test.beforeEach(async ({ page, appUrl, db, fakeServers }) => {
		await ensureAuthenticated(page, appUrl);

		await fetch(`${fakeServers.QBITTORRENT}/__control`, {
			method: "POST",
			body: JSON.stringify({ version: "v4.6.3" }),
		});

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
		fakeServers,
		checkpoint,
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

		await fetch(`${fakeServers.HARDCOVER}/__control`, {
			method: "POST",
			body: JSON.stringify({
				authors: [makeHardcoverAuthor(100, "Monitor Author", "monitor-author")],
				books: [
					makeHardcoverBook({
						authorId: 100,
						authorName: "Monitor Author",
						authorSlug: "monitor-author",
						bookId: 200,
						title: "Settled Book",
						slug: "settled-book",
						editionId: 300,
					}),
					makeHardcoverBook({
						authorId: 100,
						authorName: "Monitor Author",
						authorSlug: "monitor-author",
						bookId: 201,
						title: "Fresh Arrival",
						slug: "fresh-arrival",
						editionId: 301,
					}),
				],
				editions: [
					makeHardcoverEdition({
						bookId: 200,
						editionId: 300,
						title: "Settled Book - EPUB",
					}),
					makeHardcoverEdition({
						bookId: 201,
						editionId: 301,
						title: "Fresh Arrival - EPUB",
					}),
				],
			}),
		});

		await fetch(`${fakeServers.NEWZNAB}/__control`, {
			method: "POST",
			body: JSON.stringify({
				releases: [
					{
						guid: "fresh-arrival-release",
						title: "Monitor Author - Fresh Arrival [EPUB]",
						size: 5_242_880,
						downloadUrl: "http://example.com/fresh-arrival.torrent",
						magnetUrl: "magnet:?xt=urn:btih:fresh-arrival",
						publishDate: "Fri, 10 Apr 2026 12:00:00 GMT",
						seeders: 42,
						peers: 55,
						category: "7020",
						protocol: "torrent",
					},
				],
			}),
		});

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

		const qbState = await fetch(`${fakeServers.QBITTORRENT}/__state`).then((r) =>
			r.json(),
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
		fakeServers,
		checkpoint,
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

		await fetch(`${fakeServers.HARDCOVER}/__control`, {
			method: "POST",
			body: JSON.stringify({
				authors: [
					makeHardcoverAuthor(110, "Series Keeper", "series-keeper"),
					makeHardcoverAuthor(111, "Series Newcomer", "series-newcomer"),
				],
				books: [
					makeHardcoverBook({
						authorId: 110,
						authorName: "Series Keeper",
						authorSlug: "series-keeper",
						bookId: 210,
						title: "Series Origin",
						slug: "series-origin",
						editionId: 310,
						series: {
							id: 910,
							name: "Discovery Saga",
							slug: "discovery-saga",
							isCompleted: false,
							position: "1",
						},
					}),
					makeHardcoverBook({
						authorId: 111,
						authorName: "Series Newcomer",
						authorSlug: "series-newcomer",
						bookId: 211,
						title: "Series Continuation",
						slug: "series-continuation",
						editionId: 311,
						series: {
							id: 910,
							name: "Discovery Saga",
							slug: "discovery-saga",
							isCompleted: false,
							position: "2",
						},
					}),
				],
				editions: [
					makeHardcoverEdition({
						bookId: 210,
						editionId: 310,
						title: "Series Origin - EPUB",
					}),
					makeHardcoverEdition({
						bookId: 211,
						editionId: 311,
						title: "Series Continuation - EPUB",
					}),
				],
			}),
		});

		await navigateTo(page, appUrl, "/series");
		await page.getByRole("button", { name: "Refresh All" }).click();

	await expect
			.poll(() =>
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
		fakeServers,
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

		await configureTmdbState(fakeServers);

		await navigateTo(page, appUrl, "/movies/collections");
		await page.getByRole("button", { name: "Refresh All" }).click();

	await expect
			.poll(() =>
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
		fakeServers,
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

		await configureTmdbState(fakeServers);

		await triggerTask(page, appUrl, "Refresh TMDB Metadata");

	await expect
			.poll(() =>
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
				and(eq(schema.seasons.showId, show.id), eq(schema.seasons.seasonNumber, 2)),
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
