import { XMLParser } from "fast-xml-parser";
import { buildBaseUrl, fetchWithTimeout } from "../download-clients/http";
import {
  reportRateLimited,
  reportSuccess,
  recordQuery,
} from "../indexer-rate-limiter";
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
> & { downloadUrl: string; indexerFlags: number | null };

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (tagName) => tagName === "item" || tagName === "newznab:attr",
});

/** Extract `newznab:attr` elements into a Map<name, value>. */
function parseNewznabAttrs(item: any): Map<string, string> {
  const map = new Map<string, string>();
  const attrList = item?.["newznab:attr"];
  if (!Array.isArray(attrList)) {
    return map;
  }
  for (const a of attrList) {
    const name = a?.["@_name"];
    const value = a?.["@_value"];
    if (
      name !== undefined &&
      name !== null &&
      value !== undefined &&
      value !== null
    ) {
      map.set(String(name).toLowerCase(), String(value));
    }
  }
  return map;
}

function detectProtocol(
  item: any,
  attrs: Map<string, string>,
): "torrent" | "usenet" {
  if (attrs.has("seeders") || attrs.has("magneturl")) {
    return "torrent";
  }
  const encType = item?.enclosure?.["@_type"];
  if (typeof encType === "string") {
    if (encType.includes("torrent")) {
      return "torrent";
    }
    if (encType.includes("nzb")) {
      return "usenet";
    }
  }
  return "usenet";
}

function parseCategories(item: any): Array<{ id: number; name: string }> {
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
    item?.enclosure?.["@_url"] ??
    attrs.get("downloadurl") ??
    item?.link ??
    null;
  const magnetUrl = attrs.get("magneturl") ?? null;
  const resolved = downloadUrl ?? magnetUrl;
  if (!resolved) {
    return null;
  }
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
  if (!urls) {
    return null;
  }

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
    indexerFlags: attrs.has("flags") ? Number(attrs.get("flags")) : null,
  };
}

export type BookSearchParams = { author: string; title: string };

/**
 * Clean a query term for Newznab search — mirrors Readarr's GetQueryTitle().
 * Strips leading "The ", replaces `.` and `&` with spaces, removes accents,
 * and collapses whitespace.
 */
function cleanQueryTitle(title: string): string {
  let cleaned = title;
  // Strip leading "The " (case-insensitive) — Readarr's BeginningThe regex
  cleaned = cleaned.replace(/^the\s+/i, "");
  // Replace " & " with space
  cleaned = cleaned.replaceAll(" & ", " ");
  // Replace periods with spaces
  cleaned = cleaned.replaceAll(".", " ");
  // Remove diacritical marks (accents)
  cleaned = cleaned.normalize("NFD").replaceAll(/[\u0300-\u036F]/g, "");
  // Collapse whitespace and trim
  cleaned = cleaned.replaceAll(/\s+/g, " ").trim();
  return cleaned || title;
}

/** Parse Retry-After header value into milliseconds. */
function parseRetryAfter(res: Response): number {
  const header = res.headers.get("Retry-After");
  if (!header) {
    return 0;
  }
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }
  // RFC 7231 HTTP-date format
  const date = new Date(header).getTime();
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }
  return 0;
}

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Fetch with automatic retry on 429 (Too Many Requests). */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  indexerIdentity?: { indexerType: "manual" | "synced"; indexerId: number },
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const res = await fetchWithTimeout(url, options, timeoutMs);
    if (res.status !== 429 || attempt === MAX_RETRIES) {
      if (res.ok && indexerIdentity) {
        reportSuccess(indexerIdentity.indexerType, indexerIdentity.indexerId);
      }
      return res;
    }
    const retryAfter = parseRetryAfter(res);
    if (indexerIdentity) {
      reportRateLimited(
        indexerIdentity.indexerType,
        indexerIdentity.indexerId,
        retryAfter || undefined,
      );
    }
    const backoff = retryAfter || BASE_BACKOFF_MS * 2 ** attempt;
    const capped = Math.min(backoff, 30_000);
    // oxlint-disable-next-line no-console -- Rate-limit logging is intentional server-side diagnostics
    console.log(
      `[indexer] 429 rate-limited, retrying in ${Math.round(capped / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
    );
    await sleep(capped);
  }
  // Unreachable, but satisfies TypeScript
  throw new Error("Exhausted retries after 429");
}

/** Fetch a single Newznab/Torznab feed URL and parse the XML into results. */
async function fetchNewznabFeed(
  feed: NewznabFeedConfig,
  params: URLSearchParams,
  indexerIdentity?: { indexerType: "manual" | "synced"; indexerId: number },
): Promise<CoalescedResult[]> {
  const base = feed.baseUrl.replace(/\/+$/, "");
  const apiPath = feed.apiPath.startsWith("/")
    ? feed.apiPath
    : `/${feed.apiPath}`;

  if (feed.apiKey) {
    params.set("apikey", feed.apiKey);
  }
  params.set("extended", "1");
  // Match Readarr's page size — indexer defaults vary (often 25-50),
  // so explicitly request 100 results per query to avoid missing releases.
  if (!params.has("limit")) {
    params.set("limit", "100");
  }
  if (!params.has("offset")) {
    params.set("offset", "0");
  }

  const url = `${base}${apiPath}?${params.toString()}`;

  // Record each HTTP call against the daily counter (tiered search makes multiple calls)
  if (indexerIdentity) {
    recordQuery(indexerIdentity.indexerType, indexerIdentity.indexerId);
  }

  const res = await fetchWithRetry(
    url,
    { headers: { Accept: "application/xml" } },
    60_000,
    indexerIdentity,
  );

  if (!res.ok) {
    throw new Error(
      `Newznab search returned HTTP ${res.status}: ${res.statusText}`,
    );
  }

  const xml = await res.text();
  const parsed = xmlParser.parse(xml);

  const channel = parsed?.rss?.channel;
  if (!channel) {
    return [];
  }

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
    if (mapped) {
      results.push(mapped);
    }
  }
  return results;
}

/**
 * Run a tiered search — try each tier sequentially, returning the first
 * non-empty result set. Continues on errors to allow fallback tiers.
 */
async function runTieredSearch<T>(
  tiers: URLSearchParams[],
  fetcher: (params: URLSearchParams) => Promise<T[]>,
): Promise<T[]> {
  let lastErrorMessage = "";

  for (const params of tiers) {
    try {
      const results = await fetcher(params);
      if (results.length > 0) {
        return results;
      }
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  if (lastErrorMessage) {
    throw new Error(lastErrorMessage);
  }

  return [];
}

/**
 * Query a single Newznab/Torznab feed using Readarr's tiered search strategy.
 *
 * When `bookParams` is provided, tiers are tried sequentially (respecting
 * indexer rate limits), stopping at the first tier that returns results:
 *   1. t=book with separate author/title params (structured, if supported)
 *   2. t=search with "title author" (title-first)
 *   3. t=search with "author title" (author-first)
 *   4. t=search with "title" only (broadest fallback)
 *
 * Query terms are cleaned via cleanQueryTitle() to strip leading articles,
 * normalize punctuation, and remove accents — matching Readarr's GetQueryTitle.
 */
export async function searchNewznab(
  feed: NewznabFeedConfig,
  query: string,
  categories: number[] = [],
  bookParams?: BookSearchParams,
  indexerIdentity?: { indexerType: "manual" | "synced"; indexerId: number },
  _contentType: "tv" | "book" | "manga" = "book",
): Promise<CoalescedResult[]> {
  // Match Readarr: skip search entirely when no categories are configured
  if (categories.length === 0) {
    return [];
  }

  const cat = categories.join(",");

  const makeParams = (t: string, q: string, extra?: Record<string, string>) =>
    new URLSearchParams({ t, q, cat, ...extra });

  if (!bookParams) {
    return fetchNewznabFeed(feed, makeParams("search", query), indexerIdentity);
  }

  const cleanAuthor = cleanQueryTitle(bookParams.author);
  const cleanTitle = cleanQueryTitle(bookParams.title);

  const tiers = [
    makeParams("book", "", { author: cleanAuthor, title: cleanTitle }),
    makeParams("search", `${cleanTitle} ${cleanAuthor}`),
    makeParams("search", `${cleanAuthor} ${cleanTitle}`),
    makeParams("search", cleanTitle),
  ];

  return runTieredSearch(tiers, (params) =>
    fetchNewznabFeed(feed, params, indexerIdentity),
  );
}

// ─── Newznab capabilities test ────────────────────────────────────────────────

export async function testNewznab(
  feed: NewznabFeedConfig,
): Promise<{ success: boolean; message: string; version: string | null }> {
  const base = feed.baseUrl.replace(/\/+$/, "");
  const apiPath = feed.apiPath.startsWith("/")
    ? feed.apiPath
    : `/${feed.apiPath}`;
  const params = new URLSearchParams({ t: "caps" });
  if (feed.apiKey) {
    params.set("apikey", feed.apiKey);
  }

  const url = `${base}${apiPath}?${params.toString()}`;

  try {
    const res = await fetchWithTimeout(
      url,
      { headers: { Accept: "application/xml" } },
      10_000,
    );

    if (!res.ok) {
      return {
        success: false,
        message: `Indexer returned HTTP ${res.status}: ${res.statusText}`,
        version: null,
      };
    }

    const xml = await res.text();
    const parsed = xmlParser.parse(xml);
    const server = parsed?.caps?.server;
    const version = server?.["@_version"] ?? null;

    return {
      success: true,
      message: "Connected to indexer successfully",
      version,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Unknown connection error",
      version: null,
    };
  }
}

// ─── Prowlarr internal API search (legacy, kept for Prowlarr sync) ───────────

/** Fetch a single Prowlarr internal API search and coalesce results. */
async function fetchProwlarrSearch(
  base: string,
  headers: HeadersInit,
  params: URLSearchParams,
): Promise<CoalescedResult[]> {
  const res = await fetchWithRetry(
    `${base}/api/v1/search?${params.toString()}`,
    { headers },
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
      return [];
    }
    const { magnetUrl: _mag, downloadUrl: _dl, ...rest } = r;
    return [
      { ...rest, downloadUrl: url, indexerFlags: r.indexerFlags ?? null },
    ];
  });
}

export async function searchProwlarr(
  config: IndexerConnectionConfig,
  query: string,
  categories: number[] = [],
  bookParams?: BookSearchParams,
): Promise<CoalescedResult[]> {
  if (categories.length === 0) {
    return [];
  }

  const base = buildBaseUrl(
    config.host,
    config.port,
    config.useSsl,
    config.urlBase,
  );
  const headers = makeHeaders(config.apiKey);

  const makeParams = (type: string, q: string): URLSearchParams => {
    const params = new URLSearchParams({ query: q, type });
    for (const cat of categories) {
      params.append("categories", String(cat));
    }
    return params;
  };

  if (!bookParams) {
    return fetchProwlarrSearch(base, headers, makeParams("search", query));
  }

  const cleanAuthor = cleanQueryTitle(bookParams.author);
  const cleanTitle = cleanQueryTitle(bookParams.title);

  const tiers = [
    makeParams("book", `${cleanAuthor} ${cleanTitle}`),
    makeParams("search", `${cleanTitle} ${cleanAuthor}`),
    makeParams("search", `${cleanAuthor} ${cleanTitle}`),
    makeParams("search", cleanTitle),
  ];

  return runTieredSearch(tiers, (params) =>
    fetchProwlarrSearch(base, headers, params),
  );
}
