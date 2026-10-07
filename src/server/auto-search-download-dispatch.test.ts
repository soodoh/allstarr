import {
	buildDownloadClient,
	buildRelease,
} from "src/server/auto-search-test-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getProvider: vi.fn(),
	canGrabIndexer: vi.fn(),
}));
vi.mock("./download-clients/registry", () => ({ default: mocks.getProvider }));
vi.mock("./indexer-rate-limiter", () => ({
	canGrabIndexer: mocks.canGrabIndexer,
}));

import { dispatchAutoSearchDownload } from "./auto-search-download-dispatch";

const addDownload = vi.fn();
function setup() {
	const client = buildDownloadClient();
	return {
		release: buildRelease(),
		resolveDownloadClient: vi.fn(() => ({
			client,
			combinedTag: "client-tag,indexer-tag",
		})),
		trackedDownload: vi.fn(({ downloadId }: { downloadId: string }) => ({
			downloadId,
		})),
		history: vi.fn(() => ({ eventType: "bookGrabbed" })),
		insertTrackedDownload: vi.fn(),
		insertHistory: vi.fn(),
		logWarn: vi.fn(),
		onOutcome: vi.fn(),
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getProvider.mockReset().mockResolvedValue({ addDownload });
	mocks.canGrabIndexer.mockReset().mockReturnValue({ allowed: true });
	addDownload.mockReset().mockResolvedValue("download-1");
});

describe("automatic dispatch interface", () => {
	it("dispatches, tracks, and records history after grab admission", async () => {
		const options = setup();
		expect(await dispatchAutoSearchDownload(options)).toEqual({
			status: "grabbed",
		});
		expect(mocks.canGrabIndexer).toHaveBeenCalledExactlyOnceWith("manual", 1);
		expect(addDownload).toHaveBeenCalledWith(
			expect.objectContaining({ implementation: "sabnzbd" }),
			expect.objectContaining({
				tag: "client-tag,indexer-tag",
				url: options.release.downloadUrl,
			}),
		);
		expect(options.insertTrackedDownload).toHaveBeenCalledWith({
			downloadId: "download-1",
		});
		expect(options.insertHistory).toHaveBeenCalledWith({
			eventType: "bookGrabbed",
		});
	});

	it("does not resolve a provider or charge quota without a client", async () => {
		const options = setup();
		expect(
			await dispatchAutoSearchDownload({
				...options,
				resolveDownloadClient: () => null,
				logPrefix: "rss-sync",
			}),
		).toEqual({ status: "unavailable" });
		expect(mocks.getProvider).not.toHaveBeenCalled();
		expect(mocks.canGrabIndexer).not.toHaveBeenCalled();
		expect(options.onOutcome).toHaveBeenCalledExactlyOnceWith(
			"download_client_unavailable",
		);
		expect(options.logWarn).toHaveBeenCalledWith(
			"rss-sync",
			expect.stringContaining("No enabled usenet"),
		);
	});

	it.each(["provider", "dispatch"])(
		"preserves %s exceptions and records dispatch failure",
		async (phase) => {
			const options = setup();
			const error = new Error("dispatch error");
			if (phase === "provider") mocks.getProvider.mockRejectedValue(error);
			else addDownload.mockRejectedValue(error);
			await expect(dispatchAutoSearchDownload(options)).rejects.toBe(error);
			expect(options.onOutcome).toHaveBeenCalledExactlyOnceWith(
				"download_dispatch_failed",
			);
			expect(mocks.canGrabIndexer).toHaveBeenCalledTimes(
				phase === "provider" ? 0 : 1,
			);
			expect(options.insertHistory).not.toHaveBeenCalled();
		},
	);

	it("records history without tracking when accepted without an ID", async () => {
		const options = setup();
		addDownload.mockResolvedValue(null);
		expect(await dispatchAutoSearchDownload(options)).toEqual({
			status: "grabbed",
		});
		expect(options.insertTrackedDownload).not.toHaveBeenCalled();
		expect(options.insertHistory).toHaveBeenCalledOnce();
	});

	it("denies capped grabs without dispatch or persistence, deduplicating diagnostics only", async () => {
		const options = { ...setup(), recordedOutcomeGuids: new Set<string>() };
		mocks.canGrabIndexer.mockReturnValue({
			allowed: false,
			reason: "daily_grab_limit",
		});
		for (let i = 0; i < 2; i++)
			expect(await dispatchAutoSearchDownload(options)).toEqual({
				status: "grab_limit_reached",
			});
		expect(options.onOutcome).toHaveBeenCalledExactlyOnceWith(
			"grab_limit_reached",
		);
		expect(addDownload).not.toHaveBeenCalled();
		expect(options.insertTrackedDownload).not.toHaveBeenCalled();
		expect(options.insertHistory).not.toHaveBeenCalled();
		mocks.canGrabIndexer.mockReturnValue({ allowed: true });
		expect(await dispatchAutoSearchDownload(options)).toEqual({
			status: "grabbed",
		});
		expect(addDownload).toHaveBeenCalledOnce();
	});

	it("deduplicates failed diagnostics without suppressing retry dispatches", async () => {
		const options = { ...setup(), recordedOutcomeGuids: new Set<string>() };
		addDownload.mockRejectedValue(new Error("rejected"));
		for (let i = 0; i < 2; i++)
			await expect(dispatchAutoSearchDownload(options)).rejects.toThrow(
				"rejected",
			);
		expect(options.onOutcome).toHaveBeenCalledExactlyOnceWith(
			"download_dispatch_failed",
		);
		expect(mocks.canGrabIndexer).toHaveBeenCalledTimes(2);
		expect(addDownload).toHaveBeenCalledTimes(2);
	});

	it("does not classify tracking persistence failure as a provider failure", async () => {
		const options = setup();
		const error = new Error("tracking write failed");
		options.insertTrackedDownload.mockImplementation(() => {
			throw error;
		});
		await expect(dispatchAutoSearchDownload(options)).rejects.toBe(error);
		expect(addDownload).toHaveBeenCalledOnce();
		expect(options.onOutcome).not.toHaveBeenCalled();
		expect(options.insertHistory).not.toHaveBeenCalled();
	});

	it("preserves history failure after tracking without refunding admission", async () => {
		const options = setup();
		const error = new Error("history write failed");
		options.insertHistory.mockImplementation(() => {
			throw error;
		});
		await expect(dispatchAutoSearchDownload(options)).rejects.toBe(error);
		expect(options.insertTrackedDownload).toHaveBeenCalledOnce();
		expect(mocks.canGrabIndexer).toHaveBeenCalledOnce();
		expect(options.onOutcome).not.toHaveBeenCalled();
	});
});
