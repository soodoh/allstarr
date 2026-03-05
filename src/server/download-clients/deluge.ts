import type {
  ConnectionConfig,
  DownloadClientProvider,
  DownloadItem,
  DownloadRequest,
  TestResult,
} from "./types";
import { buildBaseUrl, fetchWithTimeout } from "./http";

type DelugeRpcResponse = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
};

let delugeRpcId = 0;

async function delugeCall(
  baseUrl: string,
  method: string,
  params: unknown[],
  cookie?: string,
): Promise<{ result: unknown; cookie: string }> {
  delugeRpcId += 1;
  const id = delugeRpcId;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookie) {
    headers["Cookie"] = cookie;
  }

  const response = await fetchWithTimeout(`${baseUrl}/json`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id, method, params }),
  });

  const responseCookie = response.headers.get("set-cookie") ?? cookie ?? "";

  if (!response.ok) {
    throw new Error(`Deluge API error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as DelugeRpcResponse;
  if (data.error) {
    throw new Error(data.error.message ?? "Deluge RPC error");
  }

  return { result: data.result, cookie: responseCookie };
}

const delugeProvider: DownloadClientProvider = {
  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    try {
      const baseUrl = buildBaseUrl(
        config.host,
        config.port,
        config.useSsl,
        config.urlBase,
      );

      // Step 1: auth.login (password only)
      const authResult = await delugeCall(baseUrl, "auth.login", [
        config.password ?? "",
      ]);

      if (!authResult.result) {
        throw new Error("Invalid password");
      }

      const sessionCookie = authResult.cookie;

      // Step 2: web.connected
      const connectedResult = await delugeCall(
        baseUrl,
        "web.connected",
        [],
        sessionCookie,
      );

      if (!connectedResult.result) {
        // Try to connect to first available host
        const hostsResult = await delugeCall(
          baseUrl,
          "web.get_hosts",
          [],
          sessionCookie,
        );
        const hosts = hostsResult.result as unknown[][];
        if (!hosts || hosts.length === 0) {
          throw new Error("No Deluge daemon hosts found");
        }
        const hostId = hosts[0]?.[0] as string;
        await delugeCall(baseUrl, "web.connect", [hostId], sessionCookie);
      }

      // Step 3: daemon.get_version
      const versionResult = await delugeCall(
        baseUrl,
        "daemon.get_version",
        [],
        sessionCookie,
      );

      const version = String(versionResult.result ?? "");
      return {
        success: true,
        message: "Connected to Deluge successfully",
        version: version || null,
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

    const authResult = await delugeCall(baseUrl, "auth.login", [
      config.password ?? "",
    ]);
    const sessionCookie = authResult.cookie;

    const options: Record<string, unknown> = {};
    if (download.savePath) {
      options.download_location = download.savePath;
    }

    let result: { result: unknown; cookie: string };
    if (download.url) {
      result = await delugeCall(
        baseUrl,
        "core.add_torrent_url",
        [download.url, options],
        sessionCookie,
      );
    } else if (download.torrentData) {
      const base64 = download.torrentData.toString("base64");
      result = await delugeCall(
        baseUrl,
        "core.add_torrent_file",
        ["download.torrent", base64, options],
        sessionCookie,
      );
    } else {
      throw new Error("No URL or torrent data provided");
    }

    return String(result.result ?? "");
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

    const authResult = await delugeCall(baseUrl, "auth.login", [
      config.password ?? "",
    ]);
    const sessionCookie = authResult.cookie;

    await delugeCall(
      baseUrl,
      "core.remove_torrent",
      [id, deleteFiles],
      sessionCookie,
    );
  },

  async getDownloads(config: ConnectionConfig): Promise<DownloadItem[]> {
    const baseUrl = buildBaseUrl(
      config.host,
      config.port,
      config.useSsl,
      config.urlBase,
    );

    const authResult = await delugeCall(baseUrl, "auth.login", [
      config.password ?? "",
    ]);
    const sessionCookie = authResult.cookie;

    const filterDict: Record<string, unknown> = {};
    if (config.category) {
      filterDict.label = config.category;
    }

    const result = await delugeCall(
      baseUrl,
      "core.get_torrents_status",
      [
        filterDict,
        [
          "name",
          "state",
          "total_size",
          "all_time_download",
          "upload_rate",
          "download_rate",
          "save_path",
          "progress",
        ],
      ],
      sessionCookie,
    );

    const torrents = result.result as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!torrents) {
      return [];
    }

    return Object.entries(torrents).map(([hash, t]) => ({
      id: hash,
      name: String(t.name ?? ""),
      status: String(t.state ?? ""),
      size: Number(t.total_size ?? 0),
      downloaded: Number(t.all_time_download ?? 0),
      uploadSpeed: Number(t.upload_rate ?? 0),
      downloadSpeed: Number(t.download_rate ?? 0),
      category: null,
      outputPath: t.save_path ? String(t.save_path) : null,
      isCompleted: String(t.state) === "Seeding" || Number(t.progress) === 100,
    }));
  },
};

export default delugeProvider;
