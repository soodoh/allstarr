import { startHttpTestServer } from "src/server/__tests__/helpers/http-test-server";
import { afterEach, describe, expect, it } from "vitest";

import { fetchBookshelfSnapshot } from "./connectors/bookshelf";
import { fetchRadarrSnapshot } from "./connectors/radarr";
import { fetchReadarrSnapshot } from "./connectors/readarr";
import { fetchSonarrSnapshot } from "./connectors/sonarr";

type FixtureValue = Record<string, unknown> | Array<Record<string, unknown>>;

async function createFixtureServer(fixtures: Record<string, FixtureValue>) {
	return startHttpTestServer((request, response) => {
		const key = `${request.pathname}${request.search}`;
		const payload = fixtures[key];

		if (!payload) {
			response.statusCode = 404;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ error: `Missing fixture for ${key}` }));
			return;
		}

		response.statusCode = 200;
		response.setHeader("Content-Type", "application/json");
		response.end(JSON.stringify(payload));
	});
}

const serversToStop: Array<{ stop: () => Promise<void> }> = [];

afterEach(async () => {
	while (serversToStop.length > 0) {
		await serversToStop.pop()?.stop();
	}
});

describe("connector snapshots", () => {
	it("fetches Sonarr library, settings, and activity pages with the API key header", async () => {
		const server = await createFixtureServer({
			"/api/v3/namingConfig": { renameEpisodes: true },
			"/api/v3/config/mediamanagement": { createEmptySeriesFolders: false },
			"/api/v3/downloadclient": [{ id: 5, name: "qBittorrent" }],
			"/api/v3/indexer": [{ id: 7, name: "Nyaa" }],
			"/api/v3/rootfolder": [{ id: 1, path: "/tv" }],
			"/api/v3/qualityprofile": [{ id: 2, name: "HD-1080p" }],
			"/api/v3/series": [{ id: 101, title: "Andor", tvdbId: 389090 }],
			"/api/v3/episode": [{ id: 201, seriesId: 101, seasonNumber: 1 }],
			"/api/v3/history?page=1&pageSize=250": {
				records: [],
				totalRecords: 0,
			},
			"/api/v3/queue?page=1&pageSize=250": {
				records: [],
				totalRecords: 0,
			},
			"/api/v3/blocklist?page=1&pageSize=250": {
				records: [],
				totalRecords: 0,
			},
		});
		serversToStop.push(server);

		const snapshot = await fetchSonarrSnapshot({
			baseUrl: server.baseUrl,
			apiKey: "sonarr-key",
		});

		expect(snapshot.kind).toBe("sonarr");
		expect(snapshot.library.series[0]).toMatchObject({
			id: 101,
			title: "Andor",
			tvdbId: 389090,
		});
		expect(snapshot.rootFolders).toEqual([{ id: 1, path: "/tv" }]);
		expect(server.requests[0]?.headers["x-api-key"]).toBe("sonarr-key");
	});

	it("fetches Radarr, Readarr, and Bookshelf snapshots with source-specific library roots and paginated activity", async () => {
		const radarr = await createFixtureServer({
			"/api/v3/namingConfig": { renameMovies: true },
			"/api/v3/config/mediamanagement": { autoRenameFolders: true },
			"/api/v3/downloadclient": [{ id: 1, name: "SABnzbd" }],
			"/api/v3/indexer": [{ id: 2, name: "Indexer A" }],
			"/api/v3/rootfolder": [{ id: 3, path: "/movies" }],
			"/api/v3/qualityprofile": [{ id: 4, name: "4K" }],
			"/api/v3/movie": [{ id: 210, title: "Dune", tmdbId: 11 }],
			"/api/v3/moviefile": [
				{ id: 211, movieId: 210, relativePath: "Dune.mkv" },
			],
			"/api/v3/history?page=1&pageSize=250": {
				records: Array.from({ length: 250 }, (_, index) => ({ id: index + 1 })),
				totalRecords: 251,
			},
			"/api/v3/history?page=2&pageSize=250": {
				records: [{ id: 251 }],
				totalRecords: 251,
			},
			"/api/v3/queue?page=1&pageSize=250": {
				records: [{ id: 901 }],
				totalRecords: 1,
			},
			"/api/v3/blocklist?page=1&pageSize=250": {
				records: [{ id: 902 }],
				totalRecords: 1,
			},
		});
		const readarr = await createFixtureServer({
			"/api/v1/namingConfig": { renameBooks: true },
			"/api/v1/config/mediamanagement": { renameEpisodes: false },
			"/api/v1/downloadclient": [{ id: 10, name: "NZBGet" }],
			"/api/v1/indexer": [{ id: 11, name: "Books Indexer" }],
			"/api/v1/rootfolder": [{ id: 12, path: "/books" }],
			"/api/v1/qualityprofile": [{ id: 13, name: "Lossless" }],
			"/api/v1/metadataprofile": [{ id: 14, name: "Hardcover" }],
			"/api/v1/author": [{ id: 310, authorName: "Frank Herbert" }],
			"/api/v1/book": [{ id: 311, title: "Dune", authorId: 310 }],
			"/api/v1/history?page=1&pageSize=250": {
				records: [{ id: 1, eventType: "grabbed" }],
				totalRecords: 1,
			},
			"/api/v1/queue?page=1&pageSize=250": {
				records: [{ id: 2, title: "Children of Dune" }],
				totalRecords: 1,
			},
			"/api/v1/blocklist?page=1&pageSize=250": {
				records: [{ id: 3, title: "God Emperor of Dune" }],
				totalRecords: 1,
			},
		});
		const bookshelf = await createFixtureServer({
			"/api/settings": { scanner: { enabled: true } },
			"/api/libraries": [{ id: "lib-1", name: "Books" }],
			"/api/collections": [{ id: "col-1", name: "Sci-Fi" }],
			"/api/authors": [{ id: "author-1", name: "Frank Herbert" }],
			"/api/books": [{ id: "book-1", title: "Dune", hardcoverId: 42 }],
			"/api/history?page=1&pageSize=250": {
				records: [{ id: "h-1", event: "added" }],
				totalRecords: 1,
			},
			"/api/queue?page=1&pageSize=250": {
				records: [{ id: "q-1", status: "processing" }],
				totalRecords: 1,
			},
			"/api/blocklist?page=1&pageSize=250": {
				records: [{ id: "b-1", reason: "duplicate" }],
				totalRecords: 1,
			},
		});
		serversToStop.push(radarr, readarr, bookshelf);

		const [radarrSnapshot, readarrSnapshot, bookshelfSnapshot] =
			await Promise.all([
				fetchRadarrSnapshot({
					baseUrl: radarr.baseUrl,
					apiKey: "radarr-key",
				}),
				fetchReadarrSnapshot({
					baseUrl: readarr.baseUrl,
					apiKey: "readarr-key",
				}),
				fetchBookshelfSnapshot({
					baseUrl: bookshelf.baseUrl,
					apiKey: "bookshelf-key",
				}),
			]);

		expect(radarrSnapshot.kind).toBe("radarr");
		expect(radarrSnapshot.library.movies).toEqual([
			{ id: 210, title: "Dune", tmdbId: 11 },
		]);
		expect(radarrSnapshot.activity.history).toHaveLength(251);

		expect(readarrSnapshot.kind).toBe("readarr");
		expect(readarrSnapshot.profiles).toEqual([
			{ id: 13, name: "Lossless" },
			{ id: 14, name: "Hardcover" },
		]);
		expect(readarrSnapshot.library.authors).toEqual([
			{ id: 310, authorName: "Frank Herbert" },
		]);
		expect(readarr.requests[0]?.headers["x-api-key"]).toBe("readarr-key");

		expect(bookshelfSnapshot.kind).toBe("bookshelf");
		expect(bookshelfSnapshot.rootFolders).toEqual([
			{ id: "lib-1", name: "Books" },
		]);
		expect(bookshelfSnapshot.library.books).toEqual([
			{ id: "book-1", title: "Dune", hardcoverId: 42 },
		]);
		expect(bookshelfSnapshot.activity.blocklist).toEqual([
			{ id: "b-1", reason: "duplicate" },
		]);
	});
});
