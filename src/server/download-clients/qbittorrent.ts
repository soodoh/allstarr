import type {
  CanonicalStatus,
  ConnectionConfig,
  DownloadClientProvider,
  DownloadItem,
  DownloadRequest,
  TestResult,
} from "./types";
import { buildBaseUrl, fetchWithTimeout } from "./http";

function normalizeStatus(state: string): CanonicalStatus {
  switch (state) {
    case "downloading":
    case "stalledDL":
    case "forcedDL":
    case "metaDL":
    case "forcedMetaDL":
    case "allocating":
    case "checkingDL":
    case "checkingResumeData": {
      return "downloading";
    }
    case "uploading":
    case "stalledUP":
    case "forcedUP":
    case "checkingUP": {
      return "completed";
    }
    case "pausedDL":
    case "pausedUP": {
      return "paused";
    }
    case "queuedDL":
    case "queuedUP":
    case "queuedForChecking": {
      return "queued";
    }
    case "error":
    case "missingFiles": {
      return "failed";
    }
    default: {
      return "downloading";
    }
  }
}

async function getSessionCookie(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const body = new URLSearchParams({ username, password });
  const response = await fetchWithTimeout(`${baseUrl}/api/v2/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: baseUrl,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Login failed: HTTP ${response.status}`);
  }

  const text = await response.text();
  if (text === "Fails.") {
    throw new Error("Invalid username or password");
  }

  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("No session cookie returned from qBittorrent");
  }

  const sidMatch = setCookie.match(/SID=([^;]+)/);
  if (!sidMatch) {
    throw new Error("Could not parse session ID from qBittorrent response");
  }

  return `SID=${sidMatch[1]}`;
}

const qbittorrentProvider: DownloadClientProvider = {
  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    try {
      const baseUrl = buildBaseUrl(
        config.host,
        config.port,
        config.useSsl,
        config.urlBase,
      );

      const cookie = await getSessionCookie(
        baseUrl,
        config.username ?? "",
        config.password ?? "",
      );

      const versionResponse = await fetchWithTimeout(
        `${baseUrl}/api/v2/app/version`,
        {
          headers: { Cookie: cookie, Referer: baseUrl },
        },
      );

      if (!versionResponse.ok) {
        throw new Error(
          `Failed to get version: HTTP ${versionResponse.status}`,
        );
      }

      const version = await versionResponse.text();
      return {
        success: true,
        message: "Connected to qBittorrent successfully",
        version: version.trim(),
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
        version: null,
      };
    }
  },

  async addDownload(
    config: ConnectionConfig,
    download: DownloadRequest,
  ): Promise<string> {
    const baseUrl = buildBaseUrl(
      config.host,
      config.port,
      config.useSsl,
      config.urlBase,
    );
    const cookie = await getSessionCookie(
      baseUrl,
      config.username ?? "",
      config.password ?? "",
    );

    const form = new FormData();
    if (download.url) {
      form.append("urls", download.url);
    }
    if (download.torrentData) {
      const blob = new Blob([download.torrentData as unknown as BlobPart], {
        type: "application/x-bittorrent",
      });
      form.append("torrents", blob, "download.torrent");
    }
    if (config.category ?? download.category) {
      form.append("category", config.category ?? download.category ?? "");
    }
    const combinedTags = [config.tag, download.tag].filter(Boolean).join(",");
    if (combinedTags) {
      form.append("tags", combinedTags);
    }
    if (download.savePath) {
      form.append("savepath", download.savePath);
    }

    const response = await fetchWithTimeout(`${baseUrl}/api/v2/torrents/add`, {
      method: "POST",
      headers: { Cookie: cookie, Referer: baseUrl },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Failed to add torrent: HTTP ${response.status}`);
    }

    return await response.text();
  },

  async removeDownload(
    config: ConnectionConfig,
    id: string,
    deleteFiles: boolean,
  ): Promise<void> {
    const baseUrl = buildBaseUrl(
      config.host,
      config.port,
      config.useSsl,
      config.urlBase,
    );
    const cookie = await getSessionCookie(
      baseUrl,
      config.username ?? "",
      config.password ?? "",
    );

    const body = new URLSearchParams({
      hashes: id,
      deleteFiles: String(deleteFiles),
    });

    const response = await fetchWithTimeout(
      `${baseUrl}/api/v2/torrents/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookie,
          Referer: baseUrl,
        },
        body: body.toString(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to remove torrent: HTTP ${response.status}`);
    }
  },

  async getDownloads(config: ConnectionConfig): Promise<DownloadItem[]> {
    const baseUrl = buildBaseUrl(
      config.host,
      config.port,
      config.useSsl,
      config.urlBase,
    );
    const cookie = await getSessionCookie(
      baseUrl,
      config.username ?? "",
      config.password ?? "",
    );

    const params = config.category
      ? `?category=${encodeURIComponent(config.category)}`
      : "";
    const response = await fetchWithTimeout(
      `${baseUrl}/api/v2/torrents/info${params}`,
      {
        headers: { Cookie: cookie, Referer: baseUrl },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get torrents: HTTP ${response.status}`);
    }

    const data = (await response.json()) as Array<Record<string, unknown>>;
    return data.map((item) => {
      const state = String(item.state ?? "");
      const status = normalizeStatus(state);
      return {
        id: String(item.hash ?? ""),
        name: String(item.name ?? ""),
        status,
        size: Number(item.size ?? 0),
        downloaded: Number(item.downloaded ?? 0),
        uploadSpeed: Number(item.upspeed ?? 0),
        downloadSpeed: Number(item.dlspeed ?? 0),
        category: String(item.category ?? ""),
        outputPath: item.save_path ? String(item.save_path) : null,
        isCompleted: status === "completed",
      };
    });
  },
};

export default qbittorrentProvider;
