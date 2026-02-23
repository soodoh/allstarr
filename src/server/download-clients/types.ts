export type DownloadProtocol = "torrent" | "usenet";
export type ImplementationType =
  | "qBittorrent"
  | "Transmission"
  | "Deluge"
  | "rTorrent"
  | "SABnzbd"
  | "NZBGet"
  | "Blackhole";

export type ConnectionConfig = {
  implementation: ImplementationType;
  host: string;
  port: number;
  useSsl: boolean;
  urlBase?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  category?: string;
  settings?: Record<string, unknown>;
};

export type TestResult = {
  success: boolean;
  message: string;
  version?: string;
};

export type DownloadRequest = {
  url?: string;
  torrentData?: Buffer;
  nzbData?: Buffer;
  category?: string;
  savePath?: string;
};

export type DownloadItem = {
  id: string;
  name: string;
  status: string;
  size: number;
  downloaded: number;
  uploadSpeed: number;
  downloadSpeed: number;
  category?: string;
};

export type DownloadClientProvider = {
  testConnection(config: ConnectionConfig): Promise<TestResult>;
  addDownload(
    config: ConnectionConfig,
    download: DownloadRequest,
  ): Promise<string>;
  getDownloads(config: ConnectionConfig): Promise<DownloadItem[]>;
};
