import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	selectGet: vi.fn(),
	insertRun: vi.fn(),
	emit: vi.fn(),
	getMediaSetting: vi.fn(),
	runAutoSearch: vi.fn(),
	logInfo: vi.fn(),
	logWarn: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
}));
vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					get: mocks.selectGet,
				})),
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				run: mocks.insertRun,
			})),
		})),
	},
}));
vi.mock("src/db/schema", () => ({
	blocklist: {},
	trackedDownloads: { id: "trackedDownloads.id" },
}));
vi.mock("./auto-search", () => ({ runAutoSearch: mocks.runAutoSearch }));
vi.mock("./event-bus", () => ({ eventBus: { emit: mocks.emit } }));
vi.mock("./logger", () => ({ logInfo: mocks.logInfo, logWarn: mocks.logWarn }));
vi.mock("./settings-reader", () => ({ default: mocks.getMediaSetting }));

import type {
	ConnectionConfig,
	DownloadClientProvider,
} from "./download-clients/types";
import handleFailedDownload from "./failed-download-handler";

function createProvider(
	overrides: Partial<DownloadClientProvider> = {},
): DownloadClientProvider {
	return {
		name: "test-client",
		getDownloads: vi.fn(),
		removeDownload: vi.fn(),
		...overrides,
	} as unknown as DownloadClientProvider;
}

const config: ConnectionConfig = {
	host: "http://localhost",
	port: 8080,
	apiKey: "test-key",
	useSsl: false,
} as unknown as ConnectionConfig;

const trackedDownload = {
	id: 1,
	downloadId: "dl-123",
	bookId: 10,
	authorId: 5,
	releaseTitle: "Test Release",
	protocol: "usenet",
	message: "Download failed: bad nzb",
};

afterEach(() => {
	vi.resetAllMocks();
});

describe("handleFailedDownload", () => {
	it("returns early when tracked download is not found", async () => {
		mocks.selectGet.mockReturnValue(undefined);

		const provider = createProvider();
		await handleFailedDownload(999, provider, config);

		expect(mocks.emit).not.toHaveBeenCalled();
		expect(mocks.getMediaSetting).not.toHaveBeenCalled();
	});

	it("emits a downloadFailed event", async () => {
		mocks.selectGet.mockReturnValue(trackedDownload);
		mocks.getMediaSetting.mockReturnValue(false);

		const provider = createProvider();
		await handleFailedDownload(1, provider, config);

		expect(mocks.emit).toHaveBeenCalledWith({
			type: "downloadFailed",
			bookId: trackedDownload.bookId,
			title: trackedDownload.releaseTitle,
			message: trackedDownload.message,
		});
	});

	it("uses default message when td.message is null", async () => {
		mocks.selectGet.mockReturnValue({ ...trackedDownload, message: null });
		mocks.getMediaSetting.mockReturnValue(false);

		const provider = createProvider();
		await handleFailedDownload(1, provider, config);

		expect(mocks.emit).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Download failed" }),
		);
	});

	it("blocklists and searches when redownloadFailed is true and bookId exists", async () => {
		mocks.selectGet.mockReturnValue(trackedDownload);
		mocks.getMediaSetting.mockImplementation((key: string) => {
			if (key === "downloadClient.redownloadFailed") return true;
			return false;
		});

		const provider = createProvider();
		await handleFailedDownload(1, provider, config);

		expect(mocks.insertRun).toHaveBeenCalled();
		expect(mocks.logInfo).toHaveBeenCalledWith(
			"failed-download",
			expect.stringContaining("Blocklisted"),
		);
		expect(mocks.runAutoSearch).toHaveBeenCalledWith({
			bookIds: [trackedDownload.bookId],
		});
	});

	it("does not blocklist when redownloadFailed is false", async () => {
		mocks.selectGet.mockReturnValue(trackedDownload);
		mocks.getMediaSetting.mockReturnValue(false);

		const provider = createProvider();
		await handleFailedDownload(1, provider, config);

		expect(mocks.insertRun).not.toHaveBeenCalled();
		expect(mocks.runAutoSearch).not.toHaveBeenCalled();
	});

	it("does not blocklist when bookId is null even if redownloadFailed is true", async () => {
		mocks.selectGet.mockReturnValue({ ...trackedDownload, bookId: null });
		mocks.getMediaSetting.mockImplementation((key: string) => {
			if (key === "downloadClient.redownloadFailed") return true;
			return false;
		});

		const provider = createProvider();
		await handleFailedDownload(1, provider, config);

		expect(mocks.insertRun).not.toHaveBeenCalled();
		expect(mocks.runAutoSearch).not.toHaveBeenCalled();
	});

	it("removes from client when removeFailed is true", async () => {
		mocks.selectGet.mockReturnValue(trackedDownload);
		mocks.getMediaSetting.mockImplementation((key: string) => {
			if (key === "downloadClient.removeFailed") return true;
			return false;
		});

		const removeDownload = vi.fn().mockResolvedValue(undefined);
		const provider = createProvider({ removeDownload });
		await handleFailedDownload(1, provider, config);

		expect(removeDownload).toHaveBeenCalledWith(
			config,
			trackedDownload.downloadId,
			true,
		);
		expect(mocks.logInfo).toHaveBeenCalledWith(
			"failed-download",
			expect.stringContaining("Removed failed download"),
		);
	});

	it("logs warning when removal fails", async () => {
		mocks.selectGet.mockReturnValue(trackedDownload);
		mocks.getMediaSetting.mockImplementation((key: string) => {
			if (key === "downloadClient.removeFailed") return true;
			return false;
		});

		const removeDownload = vi
			.fn()
			.mockRejectedValue(new Error("Connection refused"));
		const provider = createProvider({ removeDownload });
		await handleFailedDownload(1, provider, config);

		expect(mocks.logWarn).toHaveBeenCalledWith(
			"failed-download",
			expect.stringContaining("Connection refused"),
		);
	});

	it("logs 'Unknown error' when removal fails with non-Error", async () => {
		mocks.selectGet.mockReturnValue(trackedDownload);
		mocks.getMediaSetting.mockImplementation((key: string) => {
			if (key === "downloadClient.removeFailed") return true;
			return false;
		});

		const removeDownload = vi.fn().mockRejectedValue("string error");
		const provider = createProvider({ removeDownload });
		await handleFailedDownload(1, provider, config);

		expect(mocks.logWarn).toHaveBeenCalledWith(
			"failed-download",
			expect.stringContaining("Unknown error"),
		);
	});

	it("does not remove when removeFailed is false", async () => {
		mocks.selectGet.mockReturnValue(trackedDownload);
		mocks.getMediaSetting.mockReturnValue(false);

		const removeDownload = vi.fn();
		const provider = createProvider({ removeDownload });
		await handleFailedDownload(1, provider, config);

		expect(removeDownload).not.toHaveBeenCalled();
	});
});
