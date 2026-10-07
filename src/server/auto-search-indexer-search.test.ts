import { createIndexerSearch } from "src/server/auto-search-indexer-search";
import { buildRelease } from "src/server/auto-search-test-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";

const manual = {
	id: 2,
	name: "Manual",
	baseUrl: "https://manual.example",
	apiPath: null,
	apiKey: "manual-key",
};
const synced = {
	id: 1,
	name: "Synced",
	baseUrl: "https://synced.example",
	apiPath: "/custom",
	apiKey: "synced-key",
};
const release = buildRelease({
	title: "Release",
	guid: "guid",
	indexer: "",
	size: 200,
	downloadUrl: "https://example.com/release.nzb",
});
const adapters = {
	canQueryIndexer:
		vi.fn<Parameters<typeof createIndexerSearch>[0]["canQueryIndexer"]>(),
	searchNewznab: vi.fn(async () => [release]),
	enrichRelease: vi.fn(
		(
			value: typeof release & {
				indexer: string;
				allstarrIndexerId: number;
				indexerSource: "manual" | "synced";
			},
		) => value,
	),
	logError: vi.fn(),
	logInfo: vi.fn(),
	sleep: vi.fn(),
};
const search = createIndexerSearch(adapters);
const onOutcome = vi.fn();
const options = {
	enabledIndexers: { manual: [manual], synced: [] },
	query: "Author Book",
	categories: [7020],
	onOutcome,
};

beforeEach(() => {
	vi.clearAllMocks();
	adapters.canQueryIndexer.mockReset().mockReturnValue({ allowed: true });
	adapters.searchNewznab.mockReset().mockResolvedValue([release]);
});

describe("indexer execution interface", () => {
	it("queries keyed synced indexers before manual indexers and enriches their origins", async () => {
		const results = await search({
			...options,
			enabledIndexers: {
				manual: [manual],
				synced: [synced, { ...synced, id: 3, apiKey: null }],
			},
			bookParams: { author: "Author", title: "Book" },
			contentType: "book",
		});
		expect(results).toEqual([
			{
				...release,
				indexer: "Synced",
				allstarrIndexerId: 1,
				indexerSource: "synced",
			},
			{
				...release,
				indexer: "Manual",
				allstarrIndexerId: 2,
				indexerSource: "manual",
			},
		]);
		expect(adapters.searchNewznab.mock.calls).toEqual([
			[
				{ baseUrl: synced.baseUrl, apiPath: "/custom", apiKey: synced.apiKey },
				options.query,
				options.categories,
				{ author: "Author", title: "Book" },
				{ indexerType: "synced", indexerId: 1 },
			],
			[
				{ baseUrl: manual.baseUrl, apiPath: "/api", apiKey: manual.apiKey },
				options.query,
				options.categories,
				{ author: "Author", title: "Book" },
				{ indexerType: "manual", indexerId: 2 },
			],
		]);
		expect(adapters.enrichRelease).toHaveBeenCalledWith(results[0], "book");
	});

	it("preserves a reported indexer name", async () => {
		adapters.searchNewznab.mockResolvedValue([
			{ ...release, indexer: "Reported" },
		]);
		expect(await search(options)).toEqual([
			expect.objectContaining({ indexer: "Reported" }),
		]);
	});

	it("isolates one indexer failure and still queries the next", async () => {
		const error = new Error("synced failed");
		adapters.searchNewznab.mockRejectedValueOnce(error);
		const results = await search({
			...options,
			enabledIndexers: { manual: [manual], synced: [synced] },
		});
		expect(results).toHaveLength(1);
		expect(onOutcome).toHaveBeenCalledExactlyOnceWith("indexer_failed");
		expect(adapters.logError).toHaveBeenCalledWith(
			"rss-sync",
			'Indexer "Synced" failed',
			error,
		);
	});

	it("waits once and obtains fresh admission before querying", async () => {
		adapters.canQueryIndexer.mockReturnValueOnce({
			allowed: false,
			reason: "pacing",
			waitMs: 250,
		});
		await search(options);
		expect(adapters.sleep).toHaveBeenCalledExactlyOnceWith(250);
		expect(adapters.canQueryIndexer).toHaveBeenCalledTimes(2);
		expect(adapters.searchNewznab).toHaveBeenCalledOnce();
		expect(onOutcome).not.toHaveBeenCalled();
	});

	it.each(["backoff", "daily_query_limit", "pacing"] as const)(
		"skips once if %s blocks fresh admission",
		async (reason) => {
			adapters.canQueryIndexer
				.mockReturnValueOnce({ allowed: false, reason: "pacing", waitMs: 250 })
				.mockReturnValueOnce({ allowed: false, reason, waitMs: 500 });
			expect(await search(options)).toEqual([]);
			expect(adapters.sleep).toHaveBeenCalledOnce();
			expect(adapters.canQueryIndexer).toHaveBeenCalledTimes(2);
			expect(adapters.searchNewznab).not.toHaveBeenCalled();
			expect(onOutcome).toHaveBeenCalledExactlyOnceWith("indexer_skipped");
		},
	);

	it.each([undefined, 0, -1])(
		"skips pacing without a positive wait (%s)",
		async (waitMs) => {
			adapters.canQueryIndexer.mockReturnValue({
				allowed: false,
				reason: "pacing",
				waitMs,
			});
			await search(options);
			expect(adapters.sleep).not.toHaveBeenCalled();
			expect(adapters.searchNewznab).not.toHaveBeenCalled();
			expect(onOutcome).toHaveBeenCalledExactlyOnceWith("indexer_skipped");
		},
	);

	it("skips quota-blocked indexers without sleeping", async () => {
		adapters.canQueryIndexer.mockReturnValue({
			allowed: false,
			reason: "daily_query_limit",
		});
		await search(options);
		expect(adapters.sleep).not.toHaveBeenCalled();
		expect(adapters.logInfo).toHaveBeenCalledWith(
			"rss-sync",
			'Indexer "Manual" skipped: daily_query_limit',
		);
	});

	it.each(["movie", "episode"] as const)(
		"preserves %s context for manual errors and skips",
		async (searchContext) => {
			const error = new Error("failed");
			adapters.searchNewznab.mockRejectedValueOnce(error);
			await search({ ...options, searchContext, logPrefix: "auto-search" });
			expect(adapters.logError).toHaveBeenCalledWith(
				"auto-search",
				`Manual indexer failed for ${searchContext}`,
				error,
			);
			adapters.canQueryIndexer.mockReturnValue({
				allowed: false,
				reason: "backoff",
			});
			await search({ ...options, searchContext, logPrefix: "auto-search" });
			expect(adapters.logInfo).toHaveBeenCalledWith(
				"auto-search",
				`Indexer "Manual" skipped for ${searchContext}: backoff`,
			);
		},
	);
});
