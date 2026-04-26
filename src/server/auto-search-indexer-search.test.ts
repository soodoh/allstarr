import { searchEnabledIndexers } from "src/server/auto-search-indexer-search";
import { describe, expect, it, vi } from "vitest";

describe("searchEnabledIndexers", () => {
	it("enriches successful synced and manual results in search order", async () => {
		const searchNewznab = vi
			.fn()
			.mockResolvedValueOnce([
				{
					title: "Synced Release",
					guid: "synced-guid",
					protocol: "usenet",
					size: 100,
					downloadUrl: "https://example.com/synced.nzb",
					quality: { id: 1, name: "EPUB", weight: 1 },
				},
			])
			.mockResolvedValueOnce([
				{
					title: "Manual Release",
					guid: "manual-guid",
					protocol: "usenet",
					size: 200,
					downloadUrl: "https://example.com/manual.nzb",
					indexer: null,
					quality: { id: 1, name: "EPUB", weight: 1 },
				},
			]);

		const releases = await searchEnabledIndexers({
			bookParams: { author: "Author", title: "Book" },
			canQueryIndexer: () => ({ allowed: true }),
			categories: [7020],
			contentType: "book",
			enabledIndexers: {
				manual: [
					{
						id: 2,
						name: "Manual",
						baseUrl: "https://manual.example",
						apiPath: "/api",
						apiKey: "manual-key",
					},
				],
				synced: [
					{
						id: 1,
						name: "Synced",
						baseUrl: "https://synced.example",
						apiPath: "/api",
						apiKey: "synced-key",
					},
				],
			},
			enrichRelease: (release) => release,
			logError: vi.fn(),
			logInfo: vi.fn(),
			query: "Author Book",
			searchNewznab,
			sleep: vi.fn(),
		});

		expect(releases).toEqual([
			expect.objectContaining({
				allstarrIndexerId: 1,
				guid: "synced-guid",
				indexer: "Synced",
				indexerSource: "synced",
			}),
			expect.objectContaining({
				allstarrIndexerId: 2,
				guid: "manual-guid",
				indexer: "Manual",
				indexerSource: "manual",
			}),
		]);
	});

	it("isolates per-indexer failures and returns successful results", async () => {
		const searchNewznab = vi
			.fn()
			.mockResolvedValueOnce([
				{
					title: "Synced Release",
					guid: "synced-guid",
					protocol: "usenet",
					size: 100,
					downloadUrl: "https://example.com/synced.nzb",
					quality: { id: 1, name: "EPUB", weight: 1 },
				},
			])
			.mockRejectedValueOnce(new Error("manual failed"));
		const logError = vi.fn();

		const releases = await searchEnabledIndexers({
			bookParams: { author: "Author", title: "Book" },
			canQueryIndexer: () => ({ allowed: true }),
			categories: [7020],
			contentType: "book",
			enabledIndexers: {
				manual: [
					{
						id: 2,
						name: "Manual",
						baseUrl: "https://manual.example",
						apiPath: "/api",
						apiKey: "manual-key",
					},
				],
				synced: [
					{
						id: 1,
						name: "Synced",
						baseUrl: "https://synced.example",
						apiPath: "/api",
						apiKey: "synced-key",
					},
				],
			},
			enrichRelease: (release) => release,
			logError,
			logInfo: vi.fn(),
			query: "Author Book",
			searchNewznab,
			sleep: vi.fn(),
		});

		expect(releases).toEqual([
			expect.objectContaining({
				allstarrIndexerId: 1,
				guid: "synced-guid",
				indexer: "Synced",
				indexerSource: "synced",
			}),
		]);
		expect(logError).toHaveBeenCalledWith(
			"rss-sync",
			expect.stringContaining("Manual"),
			expect.any(Error),
		);
	});

	it("skips synced indexers without api keys", async () => {
		const searchNewznab = vi.fn();

		const releases = await searchEnabledIndexers({
			canQueryIndexer: () => ({ allowed: true }),
			categories: [7020],
			enabledIndexers: {
				manual: [],
				synced: [
					{
						id: 1,
						name: "Synced",
						baseUrl: "https://synced.example",
						apiPath: "/api",
						apiKey: null,
					},
				],
			},
			enrichRelease: (release) => release,
			logError: vi.fn(),
			logInfo: vi.fn(),
			query: "Author Book",
			searchNewznab,
			sleep: vi.fn(),
		});

		expect(releases).toEqual([]);
		expect(searchNewznab).not.toHaveBeenCalled();
	});

	it("waits for pacing gates before querying the indexer", async () => {
		const sleep = vi.fn();
		const searchNewznab = vi.fn().mockResolvedValueOnce([
			{
				title: "Manual Release",
				guid: "manual-guid",
				protocol: "usenet",
				size: 200,
				downloadUrl: "https://example.com/manual.nzb",
				quality: { id: 1, name: "EPUB", weight: 1 },
			},
		]);

		await searchEnabledIndexers({
			canQueryIndexer: () => ({
				allowed: false,
				reason: "pacing",
				waitMs: 250,
			}),
			categories: [7020],
			enabledIndexers: {
				manual: [
					{
						id: 2,
						name: "Manual",
						baseUrl: "https://manual.example",
						apiPath: "/api",
						apiKey: "manual-key",
					},
				],
				synced: [],
			},
			enrichRelease: (release) => release,
			logError: vi.fn(),
			logInfo: vi.fn(),
			query: "Author Book",
			searchNewznab,
			sleep,
		});

		expect(sleep).toHaveBeenCalledWith(250);
		expect(searchNewznab).toHaveBeenCalledOnce();
	});

	it("logs and skips non-pacing blocked indexers", async () => {
		const logInfo = vi.fn();
		const searchNewznab = vi.fn();

		const releases = await searchEnabledIndexers({
			canQueryIndexer: () => ({
				allowed: false,
				reason: "daily_query_limit",
			}),
			categories: [7020],
			enabledIndexers: {
				manual: [
					{
						id: 2,
						name: "Manual",
						baseUrl: "https://manual.example",
						apiPath: "/api",
						apiKey: "manual-key",
					},
				],
				synced: [],
			},
			enrichRelease: (release) => release,
			logError: vi.fn(),
			logInfo,
			query: "Author Book",
			searchNewznab,
			sleep: vi.fn(),
		});

		expect(releases).toEqual([]);
		expect(logInfo).toHaveBeenCalledWith(
			"rss-sync",
			'Indexer "Manual" skipped: daily_query_limit',
		);
		expect(searchNewznab).not.toHaveBeenCalled();
	});
});
