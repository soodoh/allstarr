import { buildBaseUrl, fetchWithTimeout } from "../download-clients/http";
import type {
  IndexerConnectionConfig,
  TestResult,
  ProwlarrSearchResult,
  ProwlarrIndexerInfo,
} from "./types";

function makeHeaders(apiKey: string): HeadersInit {
  return {
    "X-Api-Key": apiKey,
    Accept: "application/json",
  };
}

export async function testConnection(
  config: IndexerConnectionConfig,
): Promise<TestResult> {
  const base = buildBaseUrl(
    config.host,
    config.port,
    config.useSsl,
    config.urlBase,
  );
  const headers = makeHeaders(config.apiKey);

  // First check health endpoint
  const healthRes = await fetchWithTimeout(
    `${base}/api/v1/health`,
    { headers },
    10_000,
  );

  if (!healthRes.ok) {
    return {
      success: false,
      message: `Prowlarr returned HTTP ${healthRes.status}: ${healthRes.statusText}`,
    };
  }

  // Fetch system status for version info
  const statusRes = await fetchWithTimeout(
    `${base}/api/v1/system/status`,
    { headers },
    10_000,
  );

  if (!statusRes.ok) {
    return {
      success: true,
      message: "Connected to Prowlarr (version unavailable)",
    };
  }

  const status = (await statusRes.json()) as { version?: string };
  return {
    success: true,
    message: "Connected to Prowlarr successfully",
    version: status.version,
  };
}

export async function listProwlarrIndexers(
  config: IndexerConnectionConfig,
): Promise<ProwlarrIndexerInfo[]> {
  const base = buildBaseUrl(
    config.host,
    config.port,
    config.useSsl,
    config.urlBase,
  );
  const res = await fetchWithTimeout(
    `${base}/api/v1/indexer`,
    { headers: makeHeaders(config.apiKey) },
    10_000,
  );

  if (!res.ok) {
    throw new Error(
      `Prowlarr /api/v1/indexer returned HTTP ${res.status}: ${res.statusText}`,
    );
  }

  return (await res.json()) as ProwlarrIndexerInfo[];
}

export async function searchProwlarr(
  config: IndexerConnectionConfig,
  query: string,
  categories: number[] = [7020],
): Promise<
  Array<Omit<ProwlarrSearchResult, "downloadUrl"> & { downloadUrl: string }>
> {
  const base = buildBaseUrl(
    config.host,
    config.port,
    config.useSsl,
    config.urlBase,
  );

  const params = new URLSearchParams({
    query,
    type: "book",
  });
  for (const cat of categories) {
    params.append("categories", String(cat));
  }

  const res = await fetchWithTimeout(
    `${base}/api/v1/search?${params.toString()}`,
    { headers: makeHeaders(config.apiKey) },
    60_000,
  );

  if (!res.ok) {
    throw new Error(
      `Prowlarr search returned HTTP ${res.status}: ${res.statusText}`,
    );
  }

  const raw = (await res.json()) as ProwlarrSearchResult[];

  // Coalesce downloadUrl ?? magnetUrl — Prowlarr returns magnetUrl for many
  // public torrent trackers and omits downloadUrl entirely.
  return raw.flatMap((r) => {
    const url = r.downloadUrl ?? r.magnetUrl;
    if (!url) {
      // Skip results with no usable download URL
      return [];
    }
    const { magnetUrl: _mag, ...rest } = r;
    return [{ ...rest, downloadUrl: url }];
  });
}
