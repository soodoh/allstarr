import { dispatchAutoSearchDownload } from "src/server/auto-search-download-dispatch";
import { describe, expect, it, vi } from "vitest";

function createRelease() {
	return {
		allstarrIndexerId: 5,
		downloadUrl: "https://example.com/release.nzb",
		guid: "guid-1",
		protocol: "usenet" as const,
		quality: { id: 1, name: "EPUB", weight: 1 },
		size: 100,
		title: "Release",
	};
}

function createClient() {
	return {
		id: 9,
		name: "Client",
		implementation: "sabnzbd",
		host: "localhost",
		port: 8080,
		useSsl: false,
		urlBase: "",
		username: null,
		password: null,
		apiKey: "key",
		category: null,
		tag: "client-tag",
		settings: null,
	};
}

describe("dispatchAutoSearchDownload", () => {
	it("adds a download, tracks it, and records history through supplied repositories", async () => {
		const provider = {
			addDownload: vi.fn().mockResolvedValue("download-1"),
		};
		const insertTrackedDownload = vi.fn();
		const insertHistory = vi.fn();

		const result = await dispatchAutoSearchDownload({
			getProvider: vi.fn().mockResolvedValue(provider),
			insertHistory,
			insertTrackedDownload,
			logWarn: vi.fn(),
			release: createRelease(),
			resolveDownloadClient: () => ({
				client: createClient(),
				combinedTag: "client-tag,indexer-tag",
			}),
			trackedDownload: ({ client, downloadId, release }) => ({
				downloadClientId: client.id,
				downloadId,
				releaseTitle: release.title,
				state: "queued",
			}),
			history: ({ client, release }) => ({
				eventType: "bookGrabbed",
				data: {
					downloadClientId: client.id,
					guid: release.guid,
					title: release.title,
				},
			}),
		});

		expect(result).toBe(true);
		expect(provider.addDownload).toHaveBeenCalledWith(
			expect.objectContaining({ implementation: "sabnzbd" }),
			expect.objectContaining({
				tag: "client-tag,indexer-tag",
				url: "https://example.com/release.nzb",
			}),
		);
		expect(insertTrackedDownload).toHaveBeenCalledWith(
			expect.objectContaining({ downloadId: "download-1" }),
		);
		expect(insertHistory).toHaveBeenCalledWith(
			expect.objectContaining({ eventType: "bookGrabbed" }),
		);
	});

	it("returns false and skips provider work when no download client resolves", async () => {
		const provider = {
			addDownload: vi.fn(),
		};
		const getProvider = vi.fn().mockResolvedValue(provider);
		const insertTrackedDownload = vi.fn();
		const insertHistory = vi.fn();
		const logWarn = vi.fn();
		const recordOutcome = vi.fn();

		const result = await dispatchAutoSearchDownload({
			getProvider,
			insertHistory,
			insertTrackedDownload,
			logWarn,
			onOutcome: recordOutcome,
			release: createRelease(),
			resolveDownloadClient: () => null,
			trackedDownload: ({ downloadId }) => ({ downloadId }),
			history: ({ release }) => ({ eventType: "bookGrabbed", release }),
		});

		expect(result).toBe(false);
		expect(logWarn).toHaveBeenCalledWith(
			"auto-search",
			expect.stringContaining("No enabled usenet download client"),
		);
		expect(recordOutcome).toHaveBeenCalledWith("download_client_unavailable");
		expect(getProvider).not.toHaveBeenCalled();
		expect(provider.addDownload).not.toHaveBeenCalled();
		expect(insertTrackedDownload).not.toHaveBeenCalled();
		expect(insertHistory).not.toHaveBeenCalled();
	});

	it("records dispatch failure before preserving provider errors", async () => {
		const providerError = new Error("client rejected release");
		const provider = {
			addDownload: vi.fn().mockRejectedValue(providerError),
		};
		const recordOutcome = vi.fn();

		await expect(
			dispatchAutoSearchDownload({
				getProvider: vi.fn().mockResolvedValue(provider),
				insertHistory: vi.fn(),
				insertTrackedDownload: vi.fn(),
				logWarn: vi.fn(),
				onOutcome: recordOutcome,
				release: createRelease(),
				resolveDownloadClient: () => ({
					client: createClient(),
					combinedTag: "client-tag,indexer-tag",
				}),
				trackedDownload: ({ downloadId }) => ({ downloadId }),
				history: ({ release }) => ({ eventType: "bookGrabbed", release }),
			}),
		).rejects.toThrow("client rejected release");

		expect(recordOutcome).toHaveBeenCalledWith("download_dispatch_failed");
	});

	it("records dispatch failure before preserving provider resolution errors", async () => {
		const providerError = new Error("provider registry unavailable");
		const recordOutcome = vi.fn();

		await expect(
			dispatchAutoSearchDownload({
				getProvider: vi.fn().mockRejectedValue(providerError),
				insertHistory: vi.fn(),
				insertTrackedDownload: vi.fn(),
				logWarn: vi.fn(),
				onOutcome: recordOutcome,
				release: createRelease(),
				resolveDownloadClient: () => ({
					client: createClient(),
					combinedTag: "client-tag,indexer-tag",
				}),
				trackedDownload: ({ downloadId }) => ({ downloadId }),
				history: ({ release }) => ({ eventType: "bookGrabbed", release }),
			}),
		).rejects.toBe(providerError);

		expect(recordOutcome).toHaveBeenCalledWith("download_dispatch_failed");
	});

	it("records history without tracking when provider accepts without a download id", async () => {
		const provider = {
			addDownload: vi.fn().mockResolvedValue(null),
		};
		const insertTrackedDownload = vi.fn();
		const insertHistory = vi.fn();

		const result = await dispatchAutoSearchDownload({
			getProvider: vi.fn().mockResolvedValue(provider),
			insertHistory,
			insertTrackedDownload,
			logWarn: vi.fn(),
			release: createRelease(),
			resolveDownloadClient: () => ({
				client: createClient(),
				combinedTag: "client-tag,indexer-tag",
			}),
			trackedDownload: ({ downloadId }) => ({ downloadId }),
			history: ({ client, release }) => ({
				eventType: "bookGrabbed",
				data: {
					downloadClientId: client.id,
					guid: release.guid,
					title: release.title,
				},
			}),
		});

		expect(result).toBe(true);
		expect(provider.addDownload).toHaveBeenCalledOnce();
		expect(insertTrackedDownload).not.toHaveBeenCalled();
		expect(insertHistory).toHaveBeenCalledWith(
			expect.objectContaining({ eventType: "bookGrabbed" }),
		);
	});
});
