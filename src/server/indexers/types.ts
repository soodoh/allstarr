export type IndexerConnectionConfig = {
  host: string;
  port: number;
  useSsl: boolean;
  urlBase?: string;
  apiKey: string;
};

export type TestResult = {
  success: boolean;
  message: string;
  version?: string;
};

/** Raw search result shape returned by Prowlarr's /api/v1/search endpoint */
export type ProwlarrSearchResult = {
  guid: string;
  title: string;
  size: number;
  /** Direct download URL. May be absent for torrent results — use magnetUrl instead. */
  downloadUrl?: string;
  /** Magnet/torrent download URL, used when downloadUrl is absent (common for public trackers). */
  magnetUrl?: string;
  infoUrl?: string;
  publishDate?: string;
  indexerId: number;
  indexer?: string;
  protocol: "torrent" | "usenet";
  seeders?: number;
  leechers?: number;
  grabs?: number;
  categories?: Array<{ id: number; name: string }>;
  age?: number;
};

/** Prowlarr indexer info from /api/v1/indexer */
export type ProwlarrIndexerInfo = {
  id: number;
  name: string;
  enable: boolean;
  protocol: string;
  privacy: string;
};

/** Quality annotation attached to an IndexerRelease */
export type ReleaseQuality = {
  id: number;
  name: string;
  weight: number;
  color: "green" | "blue" | "amber" | "yellow" | "gray";
};

/** Normalized release for the UI, enriched with quality info */
export type IndexerRelease = Omit<
  ProwlarrSearchResult,
  "downloadUrl" | "magnetUrl"
> & {
  /** Always present: coalesced from downloadUrl ?? magnetUrl at the HTTP layer. */
  downloadUrl: string;
  allstarrIndexerId: number;
  quality: ReleaseQuality;
  sizeFormatted: string;
  ageFormatted: string;
};
