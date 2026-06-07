import { describe, expect, it } from "vitest";
import { normalizeImportSnapshot } from "./normalize";

describe("normalizeImportSnapshot", () => {
	it("maps legacy settings, profiles, library, activity, and unsupported buckets", () => {
		const normalized = normalizeImportSnapshot({
			sourceId: 42,
			kind: "readarr",
			snapshot: {
				kind: "readarr",
				fetchedAt: "2026-01-01T00:00:00.000Z",
				rootFolders: [
					{
						id: "10",
						path: " /books ",
						defaultMetadataProfileId: 99,
					},
				],
				settings: {
					naming: { renameBooks: true },
					mediaManagement: { recycleBin: "/trash" },
					downloadClients: [
						{
							id: "5",
							name: "Legacy qbit",
							implementationName: "qBittorrent",
							protocol: "torrent",
							enable: 1,
							removeCompletedDownloads: 0,
							fields: [
								{ name: "host", value: " qbit " },
								{ name: "port", value: "8080" },
								{ name: "apiKey", value: "abc" },
								{ name: "musicCategory", value: "books" },
								{ name: "directory", value: "/downloads/books" },
								{ name: "addPaused", value: "true" },
								{ name: "sequentialOrder", value: 0 },
								{ name: "firstAndLast", value: "false" },
								{ name: "useSsl", value: true },
							],
						},
					],
					indexers: [{ id: "7", name: "Indexer" }, null],
					metadataProfiles: [
						{ id: 99, name: "Default metadata" },
						{ id: 100, name: "Other metadata" },
					],
					customThings: [{ id: "11", name: "Unsupported setting" }],
				},
				profiles: [
					{
						id: "1",
						name: "Audio profile",
						cutoff: "12",
						language: "fr",
						upgradeAllowed: "true",
						minFormatScore: "5",
						cutoffFormatScore: "10",
						items: [
							{
								items: [
									{ quality: { id: 10 }, allowed: true },
									{ quality: { id: 1 }, allowed: false },
								],
							},
						],
					},
				],
				library: {
					authors: [{ id: 77, name: "Mapped Author" }],
					books: [
						{
							bookId: "201",
							bookTitle: "Book With Author Id",
							authorId: 77,
							releaseDate: "2020-05-06",
						},
						{
							foreignBookId: "hc-1",
							title: "Nested Author Book",
							author: { name: "Nested Author" },
							year: 2021,
						},
					],
					movies: [
						{ tmdb_id: "123", title: "Movie Without Source Id", year: "2022" },
					],
					series: [
						{
							tvdb_id: "321",
							title: "Show Without Source Id",
							firstAirYear: "2023",
						},
					],
					collections: [{ id: 9, name: "Unsupported library" }],
				},
				activity: {
					history: [{ id: "1", title: "Imported" }],
					queue: [{ title: "Queued" }],
					blocklist: [{ sourceTitle: "Blocked" }],
				},
			},
		});

		expect(normalized.settings.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ title: "Naming" }),
				expect.objectContaining({ title: "Media Management" }),
				expect.objectContaining({
					title: "Legacy qbit",
					payload: expect.objectContaining({
						mapped: expect.objectContaining({
							category: "books",
							enabled: true,
							host: "qbit",
							port: 8080,
							removeCompletedDownloads: false,
							settings: {
								addPaused: true,
								firstAndLastPiecePriority: false,
								savePath: "/downloads/books",
								sequentialOrder: false,
							},
							useSsl: true,
						}),
					}),
				}),
			]),
		);
		expect(normalized.settings.qualityProfiles[0]).toEqual(
			expect.objectContaining({
				title: "Audio profile",
				payload: expect.objectContaining({
					isDefault: true,
					mapped: expect.objectContaining({
						categories: [3000],
						contentType: "audiobook",
						items: [[10]],
						rootFolderPath: "/books",
					}),
				}),
			}),
		);
		expect(
			normalized.settings.metadataProfiles.find(
				(profile) => profile.title === "Default metadata",
			)?.payload,
		).toEqual(expect.objectContaining({ isDefault: true }));
		expect(normalized.library.books).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					title: "Book With Author Id",
					payload: expect.objectContaining({
						authorName: "Mapped Author",
						year: 2020,
					}),
				}),
				expect.objectContaining({
					title: "Nested Author Book",
					payload: expect.objectContaining({ authorName: "Nested Author" }),
				}),
			]),
		);
		expect(normalized.library.movies[0]?.payload).toEqual(
			expect.objectContaining({ tmdbId: 123, year: 2022 }),
		);
		expect(normalized.library.shows[0]?.payload).toEqual(
			expect.objectContaining({ tvdbId: 321, year: 2023 }),
		);
		expect(normalized.activity.queue[0]?.sourceKey).toContain("queued");
		expect(normalized.unsupported.map((item) => item.title)).toEqual(
			expect.arrayContaining(["Unsupported setting", "Unsupported library"]),
		);
	});

	it("normalizes existing connector fields and non-readarr profile defaults", () => {
		const sonarr = normalizeImportSnapshot({
			sourceId: 8,
			kind: "sonarr",
			snapshot: {
				kind: "sonarr",
				fetchedAt: "2026-01-03T00:00:00.000Z",
				rootFolders: [{ path: "/tv" }],
				settings: {
					downloadClients: [
						{
							id: 1,
							name: "Existing SAB",
							host: "sab.local",
							port: 8080,
							enabled: 0,
						},
					],
				},
				profiles: [
					{
						id: 2,
						name: "TV profile",
						items: [
							null,
							{ quality: { id: 1 }, allowed: "false" },
							{ quality: { id: 5 }, allowed: true },
						],
					},
				],
			},
		});

		expect(sonarr.settings.items[0]?.payload).toEqual(
			expect.objectContaining({
				mapped: expect.objectContaining({
					enabled: false,
					host: "sab.local",
					port: 8080,
				}),
			}),
		);
		expect(sonarr.settings.qualityProfiles[0]?.payload).toEqual(
			expect.objectContaining({
				mapped: expect.objectContaining({
					categories: [18],
					contentType: "tv",
					icon: "tv",
					items: [[5]],
					rootFolderPath: "/tv",
				}),
			}),
		);

		const radarr = normalizeImportSnapshot({
			sourceId: 9,
			kind: "radarr",
			snapshot: {
				kind: "radarr",
				fetchedAt: "2026-01-04T00:00:00.000Z",
				profiles: [{ id: 3, name: "Movie profile", items: "not-an-array" }],
				rootFolders: [{ path: "/movies" }],
			},
		});

		expect(radarr.settings.qualityProfiles[0]?.payload).toEqual(
			expect.objectContaining({
				mapped: expect.objectContaining({
					categories: [2000],
					contentType: "movie",
					icon: "film",
					items: [],
				}),
			}),
		);
	});

	it("sorts library and unsupported resource keys deterministically", () => {
		const normalized = normalizeImportSnapshot({
			sourceId: 12,
			kind: "bookshelf",
			snapshot: {
				kind: "bookshelf",
				fetchedAt: "2026-01-05T00:00:00.000Z",
				library: {
					books: [
						{ title: "Zulu", authorName: "Author Z" },
						{ foreignBookId: "book-a", title: "Alpha", authorName: "Author A" },
					],
					movies: [{ title: "Zulu" }, { title: "Alpha", tmdbId: 10 }],
					series: [
						{ title: "Zulu", tvdbId: 20 },
						{ title: "Alpha", tmdbId: 30 },
					],
					extras: [{ name: "Zulu" }, { id: 1, name: "Alpha" }],
				},
				extraSnapshotBucket: [{ name: "Zulu" }, { id: 1, name: "Alpha" }],
			},
		});

		expect(normalized.library.books.map((item) => item.title)).toEqual([
			"Alpha",
			"Zulu",
		]);
		expect(normalized.library.movies.map((item) => item.title)).toEqual([
			"Alpha",
			"Zulu",
		]);
		expect(normalized.library.shows.map((item) => item.title)).toEqual([
			"Zulu",
			"Alpha",
		]);
		expect(normalized.unsupported.map((item) => item.title)).toEqual([
			"Alpha",
			"Zulu",
			"Alpha",
			"Zulu",
		]);
	});

	it("falls back to safe defaults for sparse snapshots", () => {
		const normalized = normalizeImportSnapshot({
			sourceId: 7,
			kind: "readarr",
			snapshot: {
				kind: "readarr",
				fetchedAt: "2026-01-02T00:00:00.000Z",
				rootFolders: [{ label: "missing path" }],
				settings: {
					downloadClients: [
						{
							label: "Bare client",
							enabled: "false",
							port: "not-a-number",
							fields: [{ name: "port", value: "also-bad" }],
						},
					],
					metadataProfiles: [{ label: "Only metadata" }],
				},
				profiles: [
					{
						label: "Sparse profile",
						items: [{ quality: { id: 2 }, allowed: true }],
					},
				],
				library: {
					books: [{ description: "untitled" }],
					movies: [{ description: "untitled" }],
					series: [{ description: "untitled" }],
				},
				activity: {
					history: [{ description: "untitled" }],
					queue: [{ description: "untitled" }],
					blocklist: [{ description: "untitled" }],
				},
			},
		});

		expect(normalized.settings.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					title: "Bare client",
					payload: expect.objectContaining({
						mapped: expect.objectContaining({
							enabled: false,
							host: "localhost",
							implementation: "Unknown",
							port: 0,
							settings: null,
						}),
					}),
				}),
			]),
		);
		expect(normalized.settings.qualityProfiles[0]?.payload).toEqual(
			expect.objectContaining({
				isDefault: true,
				mapped: expect.objectContaining({
					categories: [7020],
					contentType: "ebook",
					rootFolderPath: "",
				}),
			}),
		);
		expect(normalized.settings.metadataProfiles[0]?.payload).toEqual(
			expect.objectContaining({ isDefault: true }),
		);
		expect(normalized.library.movies[0]?.title).toBe("Movie 1");
		expect(normalized.library.shows[0]?.title).toBe("Show 1");
		expect(normalized.library.books[0]?.title).toBe("Book 1");
		expect(normalized.activity.history[0]?.title).toBe("history 1");
		expect(normalized.activity.queue[0]?.title).toBe("queue 1");
		expect(normalized.activity.blocklist[0]?.title).toBe("blocklist 1");
	});

	it("defaults invalid primitive values and bookshelf profile metadata", () => {
		const normalized = normalizeImportSnapshot({
			sourceId: 18,
			kind: "bookshelf",
			snapshot: {
				kind: "bookshelf",
				fetchedAt: "2026-01-06T00:00:00.000Z",
				rootFolders: "not-folders",
				settings: {
					downloadClients: [
						{
							id: "not-a-number",
							name: "Defaults Client",
							enable: "not-bool",
							port: Number.NaN,
							fields: [
								{ name: "host", value: "   " },
								{ name: "useSsl", value: "not-bool" },
								{ name: "removeCompletedDownloads", value: "true" },
							],
						},
					],
				},
				profiles: [
					{
						id: "also-bad",
						name: "Bookshelf profile",
						cutoff: "bad-cutoff",
						upgradeAllowed: "not-bool",
						items: [
							{ items: [{ quality: { id: "bad" }, allowed: true }] },
							{ quality: { id: 4 }, allowed: "true" },
						],
					},
				],
				library: {
					books: [
						{
							bookId: "not-a-number",
							title: "Invalid Year Book",
							releaseDate: "not-a-date",
						},
					],
					movies: [{ tmdbId: "bad", title: "Invalid Movie", year: "20xx" }],
					series: [{ title: "Invalid Show", tvdbId: "bad", year: "20xx" }],
				},
			},
		});

		expect(normalized.settings.items[0]?.payload).toEqual(
			expect.objectContaining({
				mapped: expect.objectContaining({
					enabled: true,
					host: "localhost",
					port: 0,
					removeCompletedDownloads: true,
					useSsl: false,
				}),
			}),
		);
		expect(normalized.settings.qualityProfiles[0]?.payload).toEqual(
			expect.objectContaining({
				mapped: expect.objectContaining({
					categories: [7020],
					contentType: "ebook",
					cutoff: 0,
					icon: "book-open",
					items: [[4]],
					rootFolderPath: "",
					upgradeAllowed: false,
				}),
			}),
		);
		expect(normalized.library.books[0]?.payload).toEqual(
			expect.objectContaining({ sourceRecordId: null, year: null }),
		);
		expect(normalized.library.movies[0]?.payload).toEqual(
			expect.objectContaining({ tmdbId: null, year: null }),
		);
		expect(normalized.library.shows[0]?.payload).toEqual(
			expect.objectContaining({ tvdbId: null, year: null }),
		);
	});
});
