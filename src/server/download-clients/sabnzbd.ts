import type {
  CanonicalStatus,
  ConnectionConfig,
  DownloadClientProvider,
  DownloadItem,
  DownloadRequest,
  TestResult,
} from "./types";
import { buildBaseUrl, fetchWithTimeout } from "./http";

function normalizeQueueStatus(status: string): CanonicalStatus {
  switch (status) {
    case "Downloading":
    case "Fetching":
    case "Grabbing": {
      return "downloading";
    }
    case "Paused": {
      return "paused";
    }
    case "Queued": {
      return "queued";
    }
    default: {
      return "downloading";
    }
  }
}

function normalizeHistoryStatus(status: string): CanonicalStatus {
  switch (status) {
    case "Completed": {
      return "completed";
    }
    case "Failed": {
      return "failed";
    }
    default: {
      return "completed";
    }
  }
}

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
  history?: {
    slots?: Array<{
      nzo_id?: string;
      name?: string;
      status?: string;
      bytes?: number;
      storage?: string;
    }>;
  };
};

type QueueSlot = NonNullable<SabnzbdResponse["queue"]>["slots"] extends
  | Array<infer T>
  | undefined
  ? T
  : never;
type HistorySlot = NonNullable<SabnzbdResponse["history"]>["slots"] extends
  | Array<infer T>
  | undefined
  ? T
  : never;

function parseQueueSlots(slots: QueueSlot[]): DownloadItem[] {
  return slots.map((slot) => {
    const sizeMb = Number.parseFloat(slot.mb ?? "0");
    const sizeLeftMb = Number.parseFloat(slot.mbleft ?? "0");
    const totalBytes = sizeMb * 1024 * 1024;
    const leftBytes = sizeLeftMb * 1024 * 1024;
    return {
      id: slot.nzo_id ?? "",
      name: slot.filename ?? "",
      status: normalizeQueueStatus(slot.status ?? ""),
      size: Math.round(totalBytes),
      downloaded: Math.round(totalBytes - leftBytes),
      uploadSpeed: 0,
      downloadSpeed: 0,
      category: null,
      outputPath: null,
      isCompleted: false,
    };
  });
}

function parseHistorySlots(slots: HistorySlot[]): DownloadItem[] {
  return slots
    .filter((slot) => slot.status === "Completed")
    .map((slot) => ({
      id: slot.nzo_id ?? "",
      name: slot.name ?? "",
      status: normalizeHistoryStatus(slot.status ?? ""),
      size: Number(slot.bytes ?? 0),
      downloaded: Number(slot.bytes ?? 0),
      uploadSpeed: 0,
      downloadSpeed: 0,
      category: null,
      outputPath: slot.storage ?? null,
      isCompleted: true,
    }));
}

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
    const apiKey = encodeURIComponent(config.apiKey ?? "");
    const category = encodeURIComponent(
      config.category ?? download.category ?? "",
    );

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
    return ids && ids[0] ? ids[0] : "";
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
    const apiKey = encodeURIComponent(config.apiKey ?? "");
    const encodedId = encodeURIComponent(id);

    // Try removing from both queue and history — the item could be in either
    const delFiles = deleteFiles ? "&del_files=1" : "";
    const [queueRes, historyRes] = await Promise.all([
      fetchWithTimeout(
        `${baseUrl}/api?mode=queue&name=delete&value=${encodedId}&apikey=${apiKey}&output=json`,
        { method: "GET" },
      ),
      fetchWithTimeout(
        `${baseUrl}/api?mode=history&name=delete&value=${encodedId}${delFiles}&apikey=${apiKey}&output=json`,
        { method: "GET" },
      ),
    ]);

    if (!queueRes.ok && !historyRes.ok) {
      throw new Error(`SABnzbd delete error: HTTP ${queueRes.status}`);
    }
  },

  async getDownloads(config: ConnectionConfig): Promise<DownloadItem[]> {
    const baseUrl = buildBaseUrl(
      config.host,
      config.port,
      config.useSsl,
      config.urlBase,
    );
    const apiKey = encodeURIComponent(config.apiKey ?? "");

    // Fetch both queue and history in parallel
    const [queueResponse, historyResponse] = await Promise.all([
      fetchWithTimeout(
        `${baseUrl}/api?mode=queue&apikey=${apiKey}&output=json`,
        { method: "GET" },
      ),
      fetchWithTimeout(
        `${baseUrl}/api?mode=history&apikey=${apiKey}&output=json&limit=50`,
        { method: "GET" },
      ),
    ]);

    if (!queueResponse.ok) {
      throw new Error(`SABnzbd queue error: HTTP ${queueResponse.status}`);
    }

    const queueData = (await queueResponse.json()) as SabnzbdResponse;
    const items = parseQueueSlots(queueData.queue?.slots ?? []);

    if (historyResponse.ok) {
      const historyData = (await historyResponse.json()) as SabnzbdResponse;
      items.push(...parseHistorySlots(historyData.history?.slots ?? []));
    }

    return items;
  },
};

export default sabnzbdProvider;
