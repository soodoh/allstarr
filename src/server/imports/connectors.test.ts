import { startHttpTestServer } from "src/server/__tests__/helpers/http-test-server";
import { afterEach, describe, expect, it } from "vitest";

import { fetchBookshelfSnapshot } from "./connectors/bookshelf";
import { fetchRadarrSnapshot } from "./connectors/radarr";
import { fetchReadarrSnapshot } from "./connectors/readarr";
import { fetchSonarrSnapshot } from "./connectors/sonarr";
import { fetchPagedRecords, fetchSourceJson } from "./http";

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
	it("fetches Sonarr through a reverse-proxy subpath and uses the corrected naming endpoint", async () => {
		const server = await createFixtureServer({
			"/sonarr/api/v3/config/naming": { renameEpisodes: true },
			"/sonarr/api/v3/config/mediamanagement": {
				createEmptySeriesFolders: false,
			},
			"/sonarr/api/v3/downloadclient": [{ id: 5, name: "qBittorrent" }],
			"/sonarr/api/v3/indexer": [{ id: 7, name: "Nyaa" }],
			"/sonarr/api/v3/rootfolder": [{ id: 1, path: "/tv" }],
			"/sonarr/api/v3/qualityprofile": [{ id: 2, name: "HD-1080p" }],
			"/sonarr/api/v3/series": [{ id: 101, title: "Andor", tvdbId: 389090 }],
			"/sonarr/api/v3/episode": [{ id: 201, seriesId: 101, seasonNumber: 1 }],
			"/sonarr/api/v3/history?page=1&pageSize=250": {
				records: [],
				totalRecords: 0,
			},
			"/sonarr/api/v3/queue?page=1&pageSize=250": {
				records: [],
				totalRecords: 0,
			},
			"/sonarr/api/v3/blocklist?page=1&pageSize=250": {
				records: [],
				totalRecords: 0,
			},
		});
		serversToStop.push(server);

		const snapshot = await fetchSonarrSnapshot({
			baseUrl: `${server.baseUrl}/sonarr`,
			apiKey: "sonarr-key",
		});

		expect(snapshot.kind).toBe("sonarr");
		expect(snapshot.library.series[0]).toMatchObject({
			id: 101,
			title: "Andor",
			tvdbId: 389090,
		});
		expect(snapshot.rootFolders).toEqual([{ id: 1, path: "/tv" }]);
		expect(server.requests[0]?.pathname).toBe("/sonarr/api/v3/config/naming");
		expect(server.requests[0]?.headers["x-api-key"]).toBe("sonarr-key");
	});

	it("throws when paginated fetches stop making progress before reaching total records", async () => {
		const server = await createFixtureServer({
			"/radarr/api/v3/history?page=1&pageSize=250": {
				records: [],
				totalRecords: 3,
			},
		});
		serversToStop.push(server);

		await expect(
			fetchPagedRecords(
				{
					baseUrl: `${server.baseUrl}/radarr`,
					apiKey: "radarr-key",
				},
				"/api/v3/history",
			),
		).rejects.toThrow(
			"Source API pagination stalled for /api/v3/history on page 1",
		);
	});

	it("fetches Radarr, Readarr, and Bookshelf snapshots with corrected naming paths and preserved metadata profile buckets", async () => {
		const radarr = await createFixtureServer({
			"/api/v3/config/naming": { renameMovies: true },
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
			"/api/v1/config/naming": { renameBooks: true },
			"/api/v1/config/mediamanagement": { renameExistingFiles: false },
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
			"/bookshelf/api/v1/config/naming": { renameBooks: true },
			"/bookshelf/api/v1/config/mediamanagement": {
				renameExistingFiles: true,
			},
			"/bookshelf/api/v1/downloadclient": [{ id: 20, name: "Transmission" }],
			"/bookshelf/api/v1/indexer": [{ id: 21, name: "Bookshelf Indexer" }],
			"/bookshelf/api/v1/rootfolder": [{ id: 22, path: "/bookshelf" }],
			"/bookshelf/api/v1/qualityprofile": [{ id: 23, name: "EPUB" }],
			"/bookshelf/api/v1/metadataprofile": [{ id: 24, name: "OpenLibrary" }],
			"/bookshelf/api/v1/author": [{ id: 410, authorName: "Ursula Le Guin" }],
			"/bookshelf/api/v1/book": [{ id: 411, title: "A Wizard of Earthsea" }],
			"/bookshelf/api/v1/history?page=1&pageSize=250": {
				records: [{ id: 5, eventType: "downloadFolderImported" }],
				totalRecords: 1,
			},
			"/bookshelf/api/v1/queue?page=1&pageSize=250": {
				records: [{ id: 6, title: "The Tombs of Atuan" }],
				totalRecords: 1,
			},
			"/bookshelf/api/v1/blocklist?page=1&pageSize=250": {
				records: [{ id: 7, title: "Tehanu" }],
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
					baseUrl: `${bookshelf.baseUrl}/bookshelf`,
					apiKey: "bookshelf-key",
				}),
			]);

		expect(radarrSnapshot.kind).toBe("radarr");
		expect(radarrSnapshot.settings.naming).toEqual({ renameMovies: true });
		expect(radarrSnapshot.library.movies).toEqual([
			{ id: 210, title: "Dune", tmdbId: 11 },
		]);
		expect(radarrSnapshot.activity.history).toHaveLength(251);
		expect(radarr.requests[0]?.pathname).toBe("/api/v3/config/naming");

		expect(readarrSnapshot.kind).toBe("readarr");
		expect(readarrSnapshot.profiles).toEqual([{ id: 13, name: "Lossless" }]);
		expect(readarrSnapshot.settings.metadataProfiles).toEqual([
			{ id: 14, name: "Hardcover" },
		]);
		expect(readarrSnapshot.library.authors).toEqual([
			{ id: 310, authorName: "Frank Herbert" },
		]);
		expect(readarr.requests[0]?.pathname).toBe("/api/v1/config/naming");
		expect(readarr.requests[0]?.headers["x-api-key"]).toBe("readarr-key");

		expect(bookshelfSnapshot.kind).toBe("bookshelf");
		expect(bookshelfSnapshot.rootFolders).toEqual([
			{ id: 22, path: "/bookshelf" },
		]);
		expect(bookshelfSnapshot.profiles).toEqual([{ id: 23, name: "EPUB" }]);
		expect(bookshelfSnapshot.settings.metadataProfiles).toEqual([
			{ id: 24, name: "OpenLibrary" },
		]);
		expect(bookshelfSnapshot.library.books).toEqual([
			{ id: 411, title: "A Wizard of Earthsea" },
		]);
		expect(bookshelf.requests[0]?.pathname).toBe(
			"/bookshelf/api/v1/config/naming",
		);
		expect(bookshelf.requests[0]?.headers["x-api-key"]).toBe("bookshelf-key");
	});

	it("preserves reverse-proxy base subpaths when fetching a single source payload", async () => {
		const server = await createFixtureServer({
			"/proxy/radarr/api/v3/rootfolder": [{ id: 1, path: "/movies" }],
		});
		serversToStop.push(server);

		const payload = await fetchSourceJson<Array<Record<string, unknown>>>({
			baseUrl: `${server.baseUrl}/proxy/radarr`,
			apiKey: "radarr-key",
			path: "/api/v3/rootfolder",
		});

		expect(payload).toEqual([{ id: 1, path: "/movies" }]);
		expect(server.requests[0]?.pathname).toBe(
			"/proxy/radarr/api/v3/rootfolder",
		);
	});
});
