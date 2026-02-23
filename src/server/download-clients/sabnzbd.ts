import type {
  ConnectionConfig,
  DownloadClientProvider,
  DownloadItem,
  DownloadRequest,
  TestResult,
} from "./types";
import { buildBaseUrl, fetchWithTimeout } from "./http";

type SabnzbdResponse = {
  version?: string;
  status?: boolean;
  nzo_ids?: string[];
  queue?: {
    slots?: Array<{
      nzo_id?: string;
      filename?: string;
      status?: string;
      mb?: string;
      mbleft?: string;
    }>;
  };
};

const sabnzbdProvider: DownloadClientProvider = {
  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    try {
      const baseUrl = buildBaseUrl(
        config.host,
        config.port,
        config.useSsl,
        config.urlBase,
      );

      const url = `${baseUrl}/api?mode=version&apikey=${encodeURIComponent(config.apiKey ?? "")}&output=json`;
      const response = await fetchWithTimeout(url, { method: "GET" });

      if (!response.ok) {
        throw new Error(`SABnzbd API error: HTTP ${response.status}`);
      }

      const data = (await response.json()) as SabnzbdResponse;
      const version = data.version;

      if (!version) {
        throw new Error(
          "Invalid API response — check API key and connection settings",
        );
      }

      return {
        success: true,
        message: "Connected to SABnzbd successfully",
        version,
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
    const apiKey = encodeURIComponent(config.apiKey ?? "");
    const category = encodeURIComponent(config.category ?? download.category ?? "");

    if (!download.url) {
      throw new Error("SABnzbd provider requires a URL");
    }

    const url = `${baseUrl}/api?mode=addurl&name=${encodeURIComponent(download.url)}&cat=${category}&apikey=${apiKey}&output=json`;
    const response = await fetchWithTimeout(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`SABnzbd add error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as SabnzbdResponse;
    const ids = data.nzo_ids;
    return (ids && ids[0]) ? ids[0] : "";
  },

  async getDownloads(config: ConnectionConfig): Promise<DownloadItem[]> {
    const baseUrl = buildBaseUrl(
      config.host,
      config.port,
      config.useSsl,
      config.urlBase,
    );
    const apiKey = encodeURIComponent(config.apiKey ?? "");

    const url = `${baseUrl}/api?mode=queue&apikey=${apiKey}&output=json`;
    const response = await fetchWithTimeout(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`SABnzbd queue error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as SabnzbdResponse;
    const slots = data.queue?.slots ?? [];

    return slots.map((slot) => {
      const sizeMb = Number.parseFloat(slot.mb ?? "0");
      const sizeLeftMb = Number.parseFloat(slot.mbleft ?? "0");
      const totalBytes = sizeMb * 1024 * 1024;
      const leftBytes = sizeLeftMb * 1024 * 1024;
      return {
        id: slot.nzo_id ?? "",
        name: slot.filename ?? "",
        status: slot.status ?? "",
        size: Math.round(totalBytes),
        downloaded: Math.round(totalBytes - leftBytes),
        uploadSpeed: 0,
        downloadSpeed: 0,
      };
    });
  },
};

export default sabnzbdProvider;
