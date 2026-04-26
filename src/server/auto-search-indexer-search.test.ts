import { searchEnabledIndexers } from "src/server/auto-search-indexer-search";
import { describe, expect, it, vi } from "vitest";

describe("searchEnabledIndexers", () => {
	it("enriches successful manual and synced results while isolating per-indexer failures", async () => {
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
});
