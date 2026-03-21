import type {
  CanonicalStatus,
  ConnectionConfig,
  DownloadClientProvider,
  DownloadItem,
  DownloadRequest,
  TestResult,
} from "./types";
import { buildBaseUrl, fetchWithTimeout } from "./http";

function normalizeActiveStatus(status: string): CanonicalStatus {
  switch (status) {
    case "DOWNLOADING":
    case "POSTPROCESSING":
    case "UNPACKING":
    case "MOVING":
    case "RENAMING": {
      return "downloading";
    }
    case "PAUSED":
    case "PAUSING": {
      return "paused";
    }
    case "QUEUED": {
      return "queued";
    }
    default: {
      return "downloading";
    }
  }
}

function normalizeHistoryStatus(status: string): CanonicalStatus {
  return status === "SUCCESS" ? "completed" : "failed";
}

type NzbgetRpcResponse = {
  result?: unknown;
  error?: { message?: string };
};

let nzbgetRpcId = 0;

async function nzbgetCall(
  baseUrl: string,
  method: string,
  params: unknown[],
  username?: string | null,
  password?: string | null,
): Promise<unknown> {
  nzbgetRpcId += 1;
  const id = nzbgetRpcId;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (username || password) {
    const encoded = Buffer.from(`${username ?? ""}:${password ?? ""}`).toString(
      "base64",
    );
    headers["Authorization"] = `Basic ${encoded}`;
  }

  const response = await fetchWithTimeout(`${baseUrl}/jsonrpc`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id, method, params }),
  });

  if (!response.ok) {
    throw new Error(`NZBGet RPC error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as NzbgetRpcResponse;
  if (data.error) {
    throw new Error(data.error.message ?? "NZBGet RPC error");
  }

  return data.result;
}

const nzbgetProvider: DownloadClientProvider = {
  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    try {
      const baseUrl = buildBaseUrl(
        config.host,
        config.port,
        config.useSsl,
        config.urlBase,
      );

      const version = await nzbgetCall(
        baseUrl,
        "version",
        [],
        config.username,
        config.password,
      );

      return {
        success: true,
        message: "Connected to NZBGet successfully",
        version: String(version ?? ""),
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

    if (!download.url && !download.nzbData) {
      throw new Error("NZBGet provider requires a URL or NZB data");
    }

    // NZBGet append: (NZBFilename, Content, Category, Priority, AddToTop, AddPaused, DupeKey, DupeScore, DupeMode, PPParameters)
    const content = download.nzbData
      ? download.nzbData.toString("base64")
      : (download.url ?? "");

    const result = await nzbgetCall(
      baseUrl,
      "append",
      [
        "download.nzb", // filename
        content, // content (base64 or URL — NZBGet handles both)
        config.category ?? download.category ?? "",
        0, // priority
        false, // addToTop
        false, // addPaused
        "", // dupeKey
        0, // dupeScore
        "ALL", // dupeMode
        [], // ppParameters
      ],
      config.username,
      config.password,
    );

    return String(result ?? "");
  },

  async removeDownload(
    config: ConnectionConfig,
    id: string,
    _deleteFiles: boolean,
  ): Promise<void> {
    const baseUrl = buildBaseUrl(
      config.host,
      config.port,
      config.useSsl,
      config.urlBase,
    );

    await nzbgetCall(
      baseUrl,
      "editqueue",
      ["GroupDelete", "", [Number(id)]],
      config.username,
      config.password,
    );
  },

  async getDownloads(config: ConnectionConfig): Promise<DownloadItem[]> {
    const baseUrl = buildBaseUrl(
      config.host,
      config.port,
      config.useSsl,
      config.urlBase,
    );

    // Fetch both active queue and history
    const [activeResult, historyResult] = await Promise.all([
      nzbgetCall(baseUrl, "listgroups", [0], config.username, config.password),
      nzbgetCall(baseUrl, "history", [false], config.username, config.password),
    ]);

    const items: DownloadItem[] = [];

    // Active queue items
    const groups = activeResult as Array<Record<string, unknown>> | undefined;
    if (groups) {
      for (const g of groups) {
        const fileSizeMb = Number(g.FileSizeMB ?? 0);
        const downloadedMb = Number(g.DownloadedSizeMB ?? 0);
        items.push({
          id: String(g.NZBID ?? ""),
          name: String(g.NZBName ?? ""),
          status: normalizeActiveStatus(String(g.Status ?? "")),
          size: Math.round(fileSizeMb * 1024 * 1024),
          downloaded: Math.round(downloadedMb * 1024 * 1024),
          uploadSpeed: 0,
          downloadSpeed: Number(g.DownloadRateKB ?? 0) * 1024,
          category: null,
          outputPath: g.DestDir ? String(g.DestDir) : null,
          isCompleted: false,
        });
      }
    }

    // Completed history items
    const historyGroups = historyResult as
      | Array<Record<string, unknown>>
      | undefined;
    if (historyGroups) {
      for (const g of historyGroups) {
        const rawStatus = String(g.Status ?? "");
        const status = normalizeHistoryStatus(rawStatus);
        const fileSizeMb = Number(g.FileSizeMB ?? 0);
        items.push({
          id: String(g.NZBID ?? ""),
          name: String(g.NZBName ?? ""),
          status,
          size: Math.round(fileSizeMb * 1024 * 1024),
          downloaded: Math.round(fileSizeMb * 1024 * 1024),
          uploadSpeed: 0,
          downloadSpeed: 0,
          category: null,
          outputPath: g.DestDir ? String(g.DestDir) : null,
          isCompleted: status === "completed",
        });
      }
    }

    return items;
  },
};

export default nzbgetProvider;
