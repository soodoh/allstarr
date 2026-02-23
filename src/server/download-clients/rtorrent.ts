import type {
  ConnectionConfig,
  DownloadClientProvider,
  DownloadItem,
  DownloadRequest,
  TestResult,
} from "./types";
import { buildBaseUrl, fetchWithTimeout } from "./http";

function buildXmlRpcCall(method: string, params: unknown[]): string {
  const paramsXml = params
    .map((p) => `<param><value>${encodeXmlRpcValue(p)}</value></param>`)
    .join("");
  return `<?xml version="1.0"?>
<methodCall>
  <methodName>${method}</methodName>
  <params>${paramsXml}</params>
</methodCall>`;
}

function encodeXmlRpcValue(value: unknown): string {
  if (typeof value === "string") {
    return `<string>${value.replaceAll('&', "&amp;").replaceAll('<', "&lt;").replaceAll('>', "&gt;")}</string>`;
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? `<int>${value}</int>`
      : `<double>${value}</double>`;
  }
  if (typeof value === "boolean") {
    return `<boolean>${value ? 1 : 0}</boolean>`;
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => `<value>${encodeXmlRpcValue(v)}</value>`);
    return `<array><data>${items.join("")}</data></array>`;
  }
  if (value instanceof Uint8Array) {
    return `<base64>${Buffer.from(value).toString("base64")}</base64>`;
  }
  return `<string>${String(value)}</string>`;
}

function parseXmlRpcString(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  return match?.[1];
}

async function xmlRpcCall(
  baseUrl: string,
  method: string,
  params: unknown[],
  username?: string,
  password?: string,
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "text/xml",
  };

  if (username || password) {
    const encoded = Buffer.from(`${username ?? ""}:${password ?? ""}`).toString(
      "base64",
    );
    headers["Authorization"] = `Basic ${encoded}`;
  }

  const response = await fetchWithTimeout(`${baseUrl}/RPC2`, {
    method: "POST",
    headers,
    body: buildXmlRpcCall(method, params),
  });

  if (!response.ok) {
    throw new Error(`rTorrent XML-RPC error: HTTP ${response.status}`);
  }

  return await response.text();
}

const rtorrentProvider: DownloadClientProvider = {
  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    try {
      const baseUrl = buildBaseUrl(
        config.host,
        config.port,
        config.useSsl,
        config.urlBase,
      );

      const responseXml = await xmlRpcCall(
        baseUrl,
        "system.client_version",
        [],
        config.username,
        config.password,
      );

      if (responseXml.includes("<fault>")) {
        throw new Error("rTorrent RPC returned a fault response");
      }

      const version = parseXmlRpcString(responseXml, "string");
      return {
        success: true,
        message: "Connected to rTorrent successfully",
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

    if (download.url) {
      await xmlRpcCall(
        baseUrl,
        "load.start",
        ["", download.url],
        config.username,
        config.password,
      );
      return download.url;
    }if (download.torrentData) {
      await xmlRpcCall(
        baseUrl,
        "load.raw_start",
        ["", download.torrentData],
        config.username,
        config.password,
      );
      return "raw_start";
    }

    throw new Error("No URL or torrent data provided");
  },

  async getDownloads(config: ConnectionConfig): Promise<DownloadItem[]> {
    const baseUrl = buildBaseUrl(
      config.host,
      config.port,
      config.useSsl,
      config.urlBase,
    );

    const responseXml = await xmlRpcCall(
      baseUrl,
      "d.multicall2",
      [
        "",
        "main",
        "d.hash=",
        "d.name=",
        "d.state=",
        "d.size_bytes=",
        "d.completed_bytes=",
        "d.up.rate=",
        "d.down.rate=",
      ],
      config.username,
      config.password,
    );

    // Parse simple XML-RPC array of arrays response
    const rows: DownloadItem[] = [];
    const arrayMatches = responseXml.match(
      /<data>([\s\S]*?)<\/data>/g,
    );
    if (arrayMatches) {
      for (const arrayXml of arrayMatches) {
        const values = arrayXml.match(/<string>([^<]*)<\/string>/g) ?? [];
        const strings = values.map((v) =>
          v.replaceAll(/<\/?string>/g, ""),
        );
        const intValues = arrayXml.match(/<i8>([^<]*)<\/i8>/g) ?? [];
        const ints = intValues.map((v) => Number(v.replaceAll(/<\/?i8>/g, "")));

        if (strings.length >= 2) {
          rows.push({
            id: strings[0] ?? "",
            name: strings[1] ?? "",
            status: strings[2] ?? "",
            size: ints[0] ?? 0,
            downloaded: ints[1] ?? 0,
            uploadSpeed: ints[2] ?? 0,
            downloadSpeed: ints[3] ?? 0,
          });
        }
      }
    }

    return rows;
  },
};

export default rtorrentProvider;
