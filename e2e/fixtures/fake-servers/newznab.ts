import type { IncomingMessage } from "node:http";
import { createFakeServer } from "./base";
import type { FakeServer, HandlerResult } from "./base";

type State = {
  serverVersion: string;
  apiKey: string;
  releases: Array<{
    guid: string;
    title: string;
    size: number;
    downloadUrl: string;
    magnetUrl?: string;
    publishDate: string;
    seeders?: number;
    peers?: number;
    category: string;
    indexerFlags?: number;
    protocol: "torrent" | "usenet";
  }>;
  searchLog: Array<{ type: string; query: string; categories: string }>;
};

function defaultState(): State {
  return {
    serverVersion: "1.0",
    apiKey: "test-newznab-api-key",
    releases: [],
    searchLog: [],
  };
}

function xml(data: string): HandlerResult {
  return {
    headers: { "Content-Type": "application/xml" },
    body: data,
  };
}

function json(data: unknown): HandlerResult {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

function escapeXml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildReleaseItem(release: State["releases"][0]): string {
  const enclosureType =
    release.protocol === "torrent"
      ? "application/x-bittorrent"
      : "application/x-nzb";

  const attrs = [
    `<newznab:attr name="size" value="${release.size}" />`,
    release.seeders === undefined
      ? ""
      : `<newznab:attr name="seeders" value="${release.seeders}" />`,
    release.peers === undefined
      ? ""
      : `<newznab:attr name="peers" value="${release.peers}" />`,
    `<newznab:attr name="category" value="${escapeXml(release.category)}" />`,
    release.indexerFlags === undefined
      ? ""
      : `<newznab:attr name="flags" value="${release.indexerFlags}" />`,
    release.magnetUrl
      ? `<newznab:attr name="magneturl" value="${escapeXml(release.magnetUrl)}" />`
      : "",
  ]
    .filter(Boolean)
    .join("\n    ");

  return `<item>
  <title>${escapeXml(release.title)}</title>
  <guid isPermaLink="true">${escapeXml(release.guid)}</guid>
  <pubDate>${release.publishDate}</pubDate>
  <enclosure url="${escapeXml(release.downloadUrl)}" length="${release.size}" type="${enclosureType}" />
  ${attrs}
</item>`;
}

function buildSearchResponse(releases: State["releases"]): string {
  const items = releases.map(buildReleaseItem).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/">
<channel>
  <title>Fake Newznab</title>
  ${items}
</channel>
</rss>`;
}

function handler(
  req: IncomingMessage,
  _body: string,
  state: State,
): HandlerResult {
  const url = new URL(req.url || "/", "http://localhost");

  // Prowlarr-style test connection paths
  if (url.pathname === "/api/v1/health" && req.method === "GET") {
    return json([]);
  }
  if (url.pathname === "/api/v1/system/status" && req.method === "GET") {
    return json({ version: state.serverVersion });
  }

  if (url.pathname !== "/api" || req.method !== "GET") {
    return null;
  }

  const t = url.searchParams.get("t");

  // Validate API key for search/book (caps is usually public)
  if (t !== "caps") {
    const apiKey = url.searchParams.get("apikey");
    if (apiKey !== state.apiKey) {
      return { status: 403, body: "Invalid API Key" };
    }
  }

  switch (t) {
    case "caps": {
      return xml(
        `<?xml version="1.0"?><caps><server version="${escapeXml(state.serverVersion)}" /></caps>`,
      );
    }

    case "search":
    case "book": {
      const query = url.searchParams.get("q") || "";
      const categories = url.searchParams.get("cat") || "";
      state.searchLog.push({ type: t, query, categories });

      const filtered = query
        ? state.releases.filter((r) =>
            r.title.toLowerCase().includes(query.toLowerCase()),
          )
        : state.releases;

      return xml(buildSearchResponse(filtered));
    }

    default: {
      return xml(
        `<?xml version="1.0"?><error code="202" description="No such function" />`,
      );
    }
  }
}

export default function createNewznabServer(port: number): FakeServer<State> {
  return createFakeServer<State>({ port, defaultState, handler });
}
