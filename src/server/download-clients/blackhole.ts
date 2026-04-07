import { createServerOnlyFn } from "@tanstack/react-start";
import type {
	ConnectionConfig,
	DownloadClientProvider,
	DownloadItem,
	DownloadRequest,
	TestResult,
} from "./types";

function getWatchFolder(config: ConnectionConfig): string {
	const watchFolder = config.settings?.watchFolder;
	if (typeof watchFolder !== "string" || watchFolder.trim() === "") {
		throw new Error(
			"Blackhole watch folder is not configured. Set watchFolder in settings.",
		);
	}
	return watchFolder.trim();
}

const loadBlackholeNode = createServerOnlyFn(
	async () => import("./blackhole-node"),
);

const blackholeProvider: DownloadClientProvider = {
	async testConnection(config: ConnectionConfig): Promise<TestResult> {
		try {
			const { assertWritableFolder } = await loadBlackholeNode();
			const folder = getWatchFolder(config);

			assertWritableFolder(folder);

			return {
				success: true,
				message: `Blackhole folder is accessible: ${folder}`,
				version: "N/A",
			};
		} catch (error) {
			if (error instanceof Error && error.message.includes("watch folder")) {
				return {
					success: false,
					message: error.message,
					version: null,
				};
			}
			return {
				success: false,
				message: `Cannot access folder: ${error instanceof Error ? error.message : "Unknown error"}`,
				version: null,
			};
		}
	},

	async addDownload(
		config: ConnectionConfig,
		download: DownloadRequest,
	): Promise<string> {
		const { writeDownloadFile } = await loadBlackholeNode();
		const folder = getWatchFolder(config);

		const timestamp = Date.now();
		if (download.torrentData) {
			const filename = `allstarr-${timestamp}.torrent`;
			return writeDownloadFile(folder, filename, download.torrentData);
		}

		if (download.nzbData) {
			const filename = `allstarr-${timestamp}.nzb`;
			return writeDownloadFile(folder, filename, download.nzbData);
		}

		if (download.url) {
			// Write a URL file for torrent/nzb URLs
			const ext = download.url.endsWith(".nzb") ? ".nzb.url" : ".torrent.url";
			const filename = `allstarr-${timestamp}${ext}`;
			return writeDownloadFile(folder, filename, download.url, "utf8");
		}

		throw new Error("No URL or file data provided for Blackhole download");
	},

	async removeDownload(
		config: ConnectionConfig,
		id: string,
		_deleteFiles: boolean,
	): Promise<void> {
		const { removeDownloadFile } = await loadBlackholeNode();
		const folder = getWatchFolder(config);
		removeDownloadFile(folder, id);
	},

	async getDownloads(config: ConnectionConfig): Promise<DownloadItem[]> {
		const { listDownloadFiles } = await loadBlackholeNode();
		const folder = getWatchFolder(config);

		return listDownloadFiles(folder).map((file) => ({
			id: file.id,
			name: file.name,
			status: "queued" as const,
			size: file.size,
			downloaded: file.size,
			uploadSpeed: 0,
			downloadSpeed: 0,
			category: null,
			outputPath: null,
			isCompleted: false,
		}));
	},
};

export default blackholeProvider;
