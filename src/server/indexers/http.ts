import { XMLParser } from "fast-xml-parser";
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
      version: null,
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
      version: null,
    };
  }

  const status = (await statusRes.json()) as { version?: string };
  return {
    success: true,
    message: "Connected to Prowlarr successfully",
    version: status.version ?? null,
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

// ─── Newznab feed search (per-indexer, like Readarr) ──────────────────────────

type NewznabFeedConfig = {
  /** Full feed base, e.g. "http://prowlarr:9696/1/" */
  baseUrl: string;
  /** API sub-path, e.g. "/api" */
  apiPath: string;
  apiKey: string;
};

type CoalescedResult = Omit<
  ProwlarrSearchResult,
  "downloadUrl" | "magnetUrl"
> & { downloadUrl: string };

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (tagName) => tagName === "item" || tagName === "newznab:attr",
});

/** Extract `newznab:attr` elements into a Map<name, value>. */
function parseNewznabAttrs(item: any): Map<string, string> {
  const map = new Map<string, string>();
  const attrList = item?.["newznab:attr"];
  if (!Array.isArray(attrList)) {return map;}
  for (const a of attrList) {
    const name = a?.["@_name"];
    const value = a?.["@_value"];
    if (name !== undefined && name !== null && value !== undefined && value !== null) {
      map.set(String(name).toLowerCase(), String(value));
    }
  }
  return map;
}

function detectProtocol(
  item: any,
  attrs: Map<string, string>,
): "torrent" | "usenet" {
  if (attrs.has("seeders") || attrs.has("magneturl")) {return "torrent";}
  const encType = item?.enclosure?.["@_type"];
  if (typeof encType === "string") {
    if (encType.includes("torrent")) {return "torrent";}
    if (encType.includes("nzb")) {return "usenet";}
  }
  return "usenet";
}

function parseCategories(
  item: any,
): Array<{ id: number; name: string }> {
  const cats: Array<{ id: number; name: string }> = [];
  const seen = new Set<number>();

  // From newznab:attr category entries
  const attrList = item?.["newznab:attr"];
  if (Array.isArray(attrList)) {
    for (const a of attrList) {
      if (a?.["@_name"] === "category") {
        const id = Number(a["@_value"]);
        if (!Number.isNaN(id) && !seen.has(id)) {
          seen.add(id);
          cats.push({ id, name: "" });
        }
      }
    }
  }

  // Fallback to <category> elements
  if (cats.length === 0 && item?.category) {
    const rawCats = Array.isArray(item.category)
      ? item.category
      : [item.category];
    for (const c of rawCats) {
      const name = String(c);
      cats.push({ id: 0, name });
    }
  }

  return cats;
}

function resolveDownloadUrl(
  item: any,
  attrs: Map<string, string>,
): { downloadUrl: string; magnetUrl: string | null } | null {
  const downloadUrl =
    item?.enclosure?.["@_url"] ?? attrs.get("downloadurl") ?? item?.link ?? null;
  const magnetUrl = attrs.get("magneturl") ?? null;
  const resolved = downloadUrl ?? magnetUrl;
  if (!resolved) {return null;}
  return { downloadUrl: resolved, magnetUrl };
}

function resolveGuid(item: any): string {
  return String(item?.guid?.["#text"] ?? item?.guid ?? item?.link ?? "");
}

function resolveSize(item: any, attrs: Map<string, string>): number {
  return Number(attrs.get("size") ?? item?.enclosure?.["@_length"] ?? 0);
}

function resolvePeerInfo(attrs: Map<string, string>): {
  seeders: number | null;
  leechers: number | null;
  grabs: number | null;
} {
  const seeders = attrs.has("seeders") ? Number(attrs.get("seeders")) : null;
  const peers = attrs.has("peers") ? Number(attrs.get("peers")) : null;
  const leechers =
    peers !== null && seeders !== null ? Math.max(0, peers - seeders) : null;
  const grabs = attrs.has("grabs") ? Number(attrs.get("grabs")) : null;
  return { seeders, leechers, grabs };
}

/** Map a single Newznab RSS <item> to a CoalescedResult. Returns null if unusable. */
function mapNewznabItem(item: any): CoalescedResult | null {
  const attrs = parseNewznabAttrs(item);
  const urls = resolveDownloadUrl(item, attrs);
  if (!urls) {return null;}

  const protocol =
    urls.magnetUrl && !urls.downloadUrl
      ? "torrent"
      : detectProtocol(item, attrs);

  return {
    guid: resolveGuid(item),
    title: String(item?.title ?? ""),
    size: resolveSize(item, attrs),
    downloadUrl: urls.downloadUrl,
    infoUrl: item?.comments ? String(item.comments) : null,
    publishDate: item?.pubDate ? String(item.pubDate) : null,
    indexerId: Number(attrs.get("indexerid") ?? 0),
    indexer: attrs.get("indexer") ?? null,
    protocol,
    ...resolvePeerInfo(attrs),
    categories: parseCategories(item),
    age: null,
  };
}

/**
 * Query a single Newznab/Torznab feed — this is the same path Readarr takes
 * when it searches through Prowlarr's per-indexer proxy.
 *
 *   GET {baseUrl}{apiPath}?t=search&cat=7000,7020&q=...&apikey=...&extended=1
 */
export async function searchNewznab(
  feed: NewznabFeedConfig,
  query: string,
  categories: number[] = [7000, 7020],
): Promise<CoalescedResult[]> {
  const base = feed.baseUrl.replace(/\/+$/, "");
  const apiPath = feed.apiPath.startsWith("/")
    ? feed.apiPath
    : `/${feed.apiPath}`;

  const params = new URLSearchParams({
    t: "search",
    q: query,
    cat: categories.join(","),
    extended: "1",
  });
  if (feed.apiKey) {
    params.set("apikey", feed.apiKey);
  }

  const url = `${base}${apiPath}?${params.toString()}`;
  const res = await fetchWithTimeout(
    url,
    { headers: { Accept: "application/xml" } },
    60_000,
  );

  if (!res.ok) {
    throw new Error(
      `Newznab search returned HTTP ${res.status}: ${res.statusText}`,
    );
  }

  const xml = await res.text();
  const parsed = xmlParser.parse(xml);

  const channel = parsed?.rss?.channel;
  if (!channel) {return [];}

  let rawItems: unknown[];
  if (Array.isArray(channel.item)) {
    rawItems = channel.item;
  } else if (channel.item) {
    rawItems = [channel.item];
  } else {
    rawItems = [];
  }

  const results: CoalescedResult[] = [];
  for (const item of rawItems) {
    const mapped = mapNewznabItem(item);
    if (mapped) {results.push(mapped);}
  }
  return results;
}

// ─── Prowlarr internal API search (legacy, kept for manual indexers) ──────────

export async function searchProwlarr(
  config: IndexerConnectionConfig,
  query: string,
  categories: number[] = [7000, 7020],
): Promise<CoalescedResult[]> {
  const base = buildBaseUrl(
    config.host,
    config.port,
    config.useSsl,
    config.urlBase,
  );

  const params = new URLSearchParams({
    query,
    type: "search",
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
    const { magnetUrl: _mag, downloadUrl: _dl, ...rest } = r;
    return [{ ...rest, downloadUrl: url }];
  });
}
