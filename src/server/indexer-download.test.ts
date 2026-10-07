import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "src/db/schema";
import {
	buildDownloadClient,
	buildRelease,
} from "src/server/auto-search-test-fixtures";
import type {
	ConnectionConfig,
	DownloadRequest,
} from "src/server/download-clients/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getProvider: vi.fn() }));
vi.mock("./download-clients/registry", () => ({ default: mocks.getProvider }));
vi.mock("./logger", () => ({ logInfo: vi.fn() }));
const config: ConnectionConfig = {
	implementation: "SABnzbd",
	host: "localhost",
	port: 8080,
	useSsl: false,
	urlBase: null,
	username: null,
	password: null,
	apiKey: "key",
	category: null,
	tag: null,
	settings: null,
};
const download: DownloadRequest = {
	url: "https://example.com/download",
	torrentData: null,
	nzbData: null,
	category: null,
	tag: null,
	savePath: null,
};
const request = {
	indexerSource: "manual" as const,
	indexerId: 1,
	config,
	download,
};
let sqlite: Database.Database;
let dispatch: typeof import("./indexer-download").dispatchIndexerDownload;
let limiter: typeof import("./indexer-rate-limiter");
const addDownload = vi.fn();

beforeEach(async () => {
	vi.resetModules();
	vi.useFakeTimers();
	vi.setSystemTime(1_000_000);
	sqlite = new Database(":memory:");
	for (const table of ["indexers", "synced_indexers"]) {
		sqlite.exec(
			`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, request_interval INTEGER, daily_query_limit INTEGER, daily_grab_limit INTEGER, backoff_until INTEGER, escalation_level INTEGER)`,
		);
		sqlite.prepare(`INSERT INTO ${table} VALUES (1, 250, 100, 1, 0, 0)`).run();
	}
	const db = drizzle({ client: sqlite, schema });
	vi.doMock("src/db", () => ({ db, sqlite }));
	addDownload.mockReset().mockResolvedValue("download-1");
	mocks.getProvider.mockReset().mockResolvedValue({ addDownload });
	({ dispatchIndexerDownload: dispatch } = await import("./indexer-download"));
	limiter = await import("./indexer-rate-limiter");
});

afterEach(() => {
	sqlite.close();
	vi.useRealTimers();
	vi.doUnmock("src/db");
	vi.resetModules();
});

describe("dispatch with real SQLite-backed limiter configuration", () => {
	it("shares a manual dispatch’s slot with automatic dispatch", async () => {
		expect(await dispatch(request)).toEqual({
			status: "accepted",
			downloadId: "download-1",
		});
		const { dispatchAutoSearchDownload } = await import(
			"./auto-search-download-dispatch"
		);
		const insertHistory = vi.fn();
		const onOutcome = vi.fn();
		expect(
			await dispatchAutoSearchDownload({
				release: buildRelease(),
				resolveDownloadClient: () => ({
					client: buildDownloadClient(),
					combinedTag: null,
				}),
				trackedDownload: ({ downloadId }) => ({ downloadId }),
				history: () => ({}),
				insertTrackedDownload: vi.fn(),
				insertHistory,
				logWarn: vi.fn(),
				onOutcome,
			}),
		).toEqual({ status: "grab_limit_reached" });
		expect(addDownload).toHaveBeenCalledOnce();
		expect(insertHistory).not.toHaveBeenCalled();
		expect(onOutcome).toHaveBeenCalledWith("grab_limit_reached");
	});

	it("does not charge provider resolution failures", async () => {
		mocks.getProvider.mockRejectedValueOnce(new Error("registry failed"));
		await expect(dispatch(request)).rejects.toThrow("registry failed");
		expect(await dispatch(request)).toEqual({
			status: "accepted",
			downloadId: "download-1",
		});
		expect(addDownload).toHaveBeenCalledOnce();
	});

	it("retains the charge for a rejected attempt, denying its retry", async () => {
		addDownload.mockRejectedValueOnce(new Error("rejected"));
		await expect(dispatch(request)).rejects.toThrow("rejected");
		expect(await dispatch(request)).toEqual({ status: "grab_limit_reached" });
		expect(addDownload).toHaveBeenCalledOnce();
	});

	it("charges acceptance without an ID", async () => {
		addDownload.mockResolvedValue(null);
		expect(await dispatch(request)).toEqual({
			status: "accepted",
			downloadId: null,
		});
		expect(await dispatch(request)).toEqual({ status: "grab_limit_reached" });
	});

	it("admits only one of two concurrent dispatches", async () => {
		expect(await Promise.all([dispatch(request), dispatch(request)])).toEqual([
			{ status: "accepted", downloadId: "download-1" },
			{ status: "grab_limit_reached" },
		]);
		expect(addDownload).toHaveBeenCalledOnce();
	});

	it("does not refund an accepted attempt when persistence fails", async () => {
		const { dispatchAutoSearchDownload } = await import(
			"./auto-search-download-dispatch"
		);
		const options = {
			release: buildRelease(),
			resolveDownloadClient: () => ({
				client: buildDownloadClient(),
				combinedTag: null,
			}),
			trackedDownload: () => ({}),
			history: () => ({}),
			insertTrackedDownload: () => {
				throw new Error("write failed");
			},
			insertHistory: vi.fn(),
			logWarn: vi.fn(),
			onOutcome: vi.fn(),
		};
		await expect(dispatchAutoSearchDownload(options)).rejects.toThrow(
			"write failed",
		);
		expect(await dispatchAutoSearchDownload(options)).toEqual({
			status: "grab_limit_reached",
		});
		expect(addDownload).toHaveBeenCalledOnce();
		expect(options.insertHistory).not.toHaveBeenCalled();
	});

	it("preserves the strictly-greater-than-24-hours rolling reset", async () => {
		expect((await dispatch(request)).status).toBe("accepted");
		vi.advanceTimersByTime(24 * 60 * 60 * 1000);
		expect((await dispatch(request)).status).toBe("grab_limit_reached");
		vi.advanceTimersByTime(1);
		expect((await dispatch(request)).status).toBe("accepted");
	});

	it("keeps manual and synced indexer identities separate", async () => {
		expect((await dispatch(request)).status).toBe("accepted");
		expect(
			(await dispatch({ ...request, indexerSource: "synced" })).status,
		).toBe("accepted");
		expect((await dispatch(request)).status).toBe("grab_limit_reached");
	});

	it("allows unlimited grabs without changing the existing unlimited accounting", async () => {
		sqlite.exec("UPDATE indexers SET daily_grab_limit = 0");
		expect((await dispatch(request)).status).toBe("accepted");
		expect((await dispatch(request)).status).toBe("accepted");
		sqlite.exec("UPDATE indexers SET daily_grab_limit = 1");
		expect((await dispatch(request)).status).toBe("accepted");
		expect((await dispatch(request)).status).toBe("grab_limit_reached");
	});
});

describe("execution with real limiter admission and charging", () => {
	async function searchSetup(sleep: (ms: number) => Promise<void> | void) {
		const { createIndexerSearch } = await import(
			"./auto-search-indexer-search"
		);
		const transport = vi.fn(async () => {
			limiter.recordQuery("manual", 1);
			return [buildRelease()];
		});
		const onOutcome = vi.fn();
		const search = createIndexerSearch({
			canQueryIndexer: limiter.canQueryIndexer,
			searchNewznab: transport,
			enrichRelease: (value) => value,
			sleep,
			logError: vi.fn(),
			logInfo: vi.fn(),
		});
		const options = {
			query: "Book",
			categories: [7020],
			enabledIndexers: {
				manual: [
					{
						id: 1,
						name: "Indexer",
						baseUrl: "http://example.com",
						apiPath: null,
						apiKey: "key",
					},
				],
				synced: [],
			},
			onOutcome,
		};
		return { search, options, transport, onOutcome };
	}

	it("does not let pacing hide an exhausted query cap", async () => {
		sqlite.exec("UPDATE indexers SET daily_query_limit = 1");
		limiter.recordQuery("manual", 1);
		const fixture = await searchSetup(async (ms) => {
			await vi.advanceTimersByTimeAsync(ms);
		});
		expect(await fixture.search(fixture.options)).toEqual([]);
		expect(fixture.transport).not.toHaveBeenCalled();
		expect(fixture.onOutcome).toHaveBeenCalledExactlyOnceWith(
			"indexer_skipped",
		);
	});

	it("observes persisted backoff that changes during the pacing wait", async () => {
		limiter.recordQuery("manual", 1);
		const fixture = await searchSetup((ms) => {
			vi.advanceTimersByTime(ms);
			sqlite.exec(`UPDATE indexers SET backoff_until = ${Date.now() + 1000}`);
		});
		expect(await fixture.search(fixture.options)).toEqual([]);
		expect(fixture.transport).not.toHaveBeenCalled();
	});

	it("rechecks simultaneous waiters so only one starts a query", async () => {
		limiter.recordQuery("manual", 1);
		const fixture = await searchSetup(
			(ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		);
		const pending = Promise.all([
			fixture.search(fixture.options),
			fixture.search(fixture.options),
		]);
		await vi.advanceTimersByTimeAsync(250);
		const results = await pending;
		expect(results.map((value) => value.length)).toEqual([1, 0]);
		expect(fixture.transport).toHaveBeenCalledOnce();
		expect(fixture.onOutcome).toHaveBeenCalledExactlyOnceWith(
			"indexer_skipped",
		);
	});
});
