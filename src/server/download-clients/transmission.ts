import type {
  ConnectionConfig,
  DownloadClientProvider,
  DownloadItem,
  DownloadRequest,
  TestResult,
} from "./types";
import { buildBaseUrl, fetchWithTimeout } from "./http";

type TransmissionRpcResponse = {
  result?: string;
  arguments?: Record<string, unknown>;
};

async function rpcCall(
  baseUrl: string,
  method: string,
  args: Record<string, unknown>,
  sessionId: string,
  username?: string,
  password?: string,
): Promise<TransmissionRpcResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Transmission-Session-Id": sessionId,
  };

  if (username || password) {
    const encoded = Buffer.from(`${username ?? ""}:${password ?? ""}`).toString(
      "base64",
    );
    headers["Authorization"] = `Basic ${encoded}`;
  }

  const response = await fetchWithTimeout(`${baseUrl}/transmission/rpc`, {
    method: "POST",
    headers,
    body: JSON.stringify({ method, arguments: args }),
  });

  if (response.status === 409) {
    const newSessionId =
      response.headers.get("X-Transmission-Session-Id") ?? "";
    return rpcCall(baseUrl, method, args, newSessionId, username, password);
  }

  if (!response.ok) {
    throw new Error(`Transmission RPC error: HTTP ${response.status}`);
  }

  return (await response.json()) as TransmissionRpcResponse;
}

const transmissionProvider: DownloadClientProvider = {
  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    try {
      const baseUrl = buildBaseUrl(
        config.host,
        config.port,
        config.useSsl,
        config.urlBase,
      );

      // Start with empty session id — will get 409 and retry with real one
      const result = await rpcCall(
        baseUrl,
        "session-get",
        {},
        "",
        config.username,
        config.password,
      );

      if (result.result !== "success") {
        throw new Error(
          `Unexpected result from Transmission: ${result.result}`,
        );
      }

      const version = String(result.arguments?.version ?? "");
      return {
        success: true,
        message: "Connected to Transmission successfully",
        version: version || undefined,
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

    const args: Record<string, unknown> = {};
    if (download.url) {
      args.filename = download.url;
    }
    if (download.torrentData) {
      args.metainfo = download.torrentData.toString("base64");
    }
    if (download.savePath) {
      args["download-dir"] = download.savePath;
    }

    const result = await rpcCall(
      baseUrl,
      "torrent-add",
      args,
      "",
      config.username,
      config.password,
    );

    if (result.result !== "success") {
      throw new Error(`Failed to add torrent: ${result.result}`);
    }

    const torrent = (result.arguments?.["torrent-added"] ??
      result.arguments?.["torrent-duplicate"]) as
      | Record<string, unknown>
      | undefined;
    return String(torrent?.id ?? "");
  },

  async getDownloads(config: ConnectionConfig): Promise<DownloadItem[]> {
    const baseUrl = buildBaseUrl(
      config.host,
      config.port,
      config.useSsl,
      config.urlBase,
    );

    const result = await rpcCall(
      baseUrl,
      "torrent-get",
      {
        fields: [
          "id",
          "name",
          "status",
          "totalSize",
          "downloadedEver",
          "uploadSpeed",
          "rateDownload",
        ],
      },
      "",
      config.username,
      config.password,
    );

    const torrents =
      (result.arguments?.torrents as Array<Record<string, unknown>>) ?? [];
    return torrents.map((t) => ({
      id: String(t.id ?? ""),
      name: String(t.name ?? ""),
      status: String(t.status ?? ""),
      size: Number(t.totalSize ?? 0),
      downloaded: Number(t.downloadedEver ?? 0),
      uploadSpeed: Number(t.uploadSpeed ?? 0),
      downloadSpeed: Number(t.rateDownload ?? 0),
    }));
  },
};

export default transmissionProvider;
