import type {
  ConnectionConfig,
  DownloadClientProvider,
  DownloadItem,
  DownloadRequest,
  TestResult,
} from "./types";
import { buildBaseUrl, fetchWithTimeout } from "./http";

type NzbgetRpcResponse = {
  result?: unknown;
  error?: { message?: string };
};

let nzbgetRpcId = 0;

async function nzbgetCall(
  baseUrl: string,
  method: string,
  params: unknown[],
  username?: string,
  password?: string,
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

  async getDownloads(config: ConnectionConfig): Promise<DownloadItem[]> {
    const baseUrl = buildBaseUrl(
      config.host,
      config.port,
      config.useSsl,
      config.urlBase,
    );

    const result = await nzbgetCall(
      baseUrl,
      "listgroups",
      [0],
      config.username,
      config.password,
    );

    const groups = result as Array<Record<string, unknown>> | undefined;
    if (!groups) {
      return [];
    }

    return groups.map((g) => {
      const fileSizeMb = Number(g.FileSizeMB ?? 0);
      const downloadedMb = Number(g.DownloadedSizeMB ?? 0);
      return {
        id: String(g.NZBID ?? ""),
        name: String(g.NZBName ?? ""),
        status: String(g.Status ?? ""),
        size: Math.round(fileSizeMb * 1024 * 1024),
        downloaded: Math.round(downloadedMb * 1024 * 1024),
        uploadSpeed: 0,
        downloadSpeed: Number(g.DownloadRateKB ?? 0) * 1024,
      };
    });
  },
};

export default nzbgetProvider;
