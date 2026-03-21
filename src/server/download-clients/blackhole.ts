import fs from "node:fs";
import path from "node:path";
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

const blackholeProvider: DownloadClientProvider = {
  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    try {
      const folder = getWatchFolder(config);

      fs.accessSync(folder, fs.constants.W_OK);

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
    const folder = getWatchFolder(config);

    const timestamp = Date.now();
    if (download.torrentData) {
      const filename = `allstarr-${timestamp}.torrent`;
      const filePath = path.join(folder, filename);
      fs.writeFileSync(filePath, download.torrentData);
      return filePath;
    }

    if (download.nzbData) {
      const filename = `allstarr-${timestamp}.nzb`;
      const filePath = path.join(folder, filename);
      fs.writeFileSync(filePath, download.nzbData);
      return filePath;
    }

    if (download.url) {
      // Write a URL file for torrent/nzb URLs
      const ext = download.url.endsWith(".nzb") ? ".nzb.url" : ".torrent.url";
      const filename = `allstarr-${timestamp}${ext}`;
      const filePath = path.join(folder, filename);
      fs.writeFileSync(filePath, download.url, "utf8");
      return filePath;
    }

    throw new Error("No URL or file data provided for Blackhole download");
  },

  async removeDownload(
    config: ConnectionConfig,
    id: string,
    _deleteFiles: boolean,
  ): Promise<void> {
    const folder = getWatchFolder(config);
    const filePath = path.join(folder, id);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File may have already been picked up by the download client
    }
  },

  async getDownloads(config: ConnectionConfig): Promise<DownloadItem[]> {
    const folder = getWatchFolder(config);

    try {
      const files = fs.readdirSync(folder);
      return files
        .filter((f) => f.endsWith(".torrent") || f.endsWith(".nzb"))
        .map((f) => {
          const filePath = path.join(folder, f);
          const stat = fs.statSync(filePath);
          return {
            id: f,
            name: f,
            status: "queued" as const,
            size: stat.size,
            downloaded: stat.size,
            uploadSpeed: 0,
            downloadSpeed: 0,
            category: null,
            outputPath: null,
            isCompleted: false,
          };
        });
    } catch {
      return [];
    }
  },
};

export default blackholeProvider;
