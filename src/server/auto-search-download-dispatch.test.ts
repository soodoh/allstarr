import { dispatchAutoSearchDownload } from "src/server/auto-search-download-dispatch";
import { describe, expect, it, vi } from "vitest";

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
			release: {
				allstarrIndexerId: 5,
				downloadUrl: "https://example.com/release.nzb",
				guid: "guid-1",
				protocol: "usenet",
				quality: { id: 1, name: "EPUB", weight: 1 },
				size: 100,
				title: "Release",
			},
			resolveDownloadClient: () => ({
				client: {
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
				},
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
});
