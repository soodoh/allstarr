import { startHttpTestServer } from "src/server/__tests__/helpers/http-test-server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../indexer-rate-limiter", () => ({
	recordQuery: vi.fn(),
	reportRateLimited: vi.fn(),
	reportSuccess: vi.fn(),
}));

vi.mock("../logger", () => ({
	logInfo: vi.fn(),
}));

import { searchNewznab, testNewznab } from "./http";

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("newznab HTTP client", () => {
	it("walks the tiered search order and normalizes release data", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			const t = request.searchParams.get("t");
			if (t === "book") {
				expect(request.searchParams.get("author")).toBe("Alpha Beta");
				expect(request.searchParams.get("title")).toBe("Fancy Book");
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/xml");
				response.end(`<?xml version="1.0"?><rss><channel></channel></rss>`);
				return;
			}

			if (t === "search") {
				expect(request.searchParams.get("q")).toBe("Fancy Book Alpha Beta");
				expect(request.searchParams.get("limit")).toBe("100");
				expect(request.searchParams.get("offset")).toBe("0");
				expect(request.searchParams.get("apikey")).toBe("test-newznab-api-key");
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/xml");
				response.end(
					`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/">
<channel>
  <item>
    <title>Fancy Book - Release</title>
    <guid isPermaLink="true">guid-1</guid>
    <pubDate>Fri, 20 Mar 2026 12:00:00 GMT</pubDate>
    <enclosure url="http://example.com/release.torrent" length="5242880" type="application/x-bittorrent" />
    <newznab:attr name="size" value="5242880" />
    <newznab:attr name="seeders" value="22" />
    <newznab:attr name="peers" value="31" />
    <newznab:attr name="category" value="7020" />
    <newznab:attr name="flags" value="8" />
  </item>
</channel>
</rss>`,
				);
				return;
			}

			if (t === "caps") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/xml");
				response.end(
					`<?xml version="1.0"?><caps><server version="2.0.0" /></caps>`,
				);
				return;
			}

			response.statusCode = 400;
			response.end("unexpected");
		});

		try {
			const results = await searchNewznab(
				{
					baseUrl: server.baseUrl,
					apiPath: "/api",
					apiKey: "test-newznab-api-key",
				},
				"ignored",
				[7020],
				{
					author: "The Álpha & Beta",
					title: "Fancy.Book",
				},
			);

			expect(results).toEqual([
				expect.objectContaining({
					guid: "guid-1",
					title: "Fancy Book - Release",
					size: 5_242_880,
					downloadUrl: "http://example.com/release.torrent",
					publishDate: "Fri, 20 Mar 2026 12:00:00 GMT",
					protocol: "torrent",
					seeders: 22,
					leechers: 9,
					grabs: null,
					categories: [{ id: 7020, name: "" }],
					age: null,
					indexerFlags: 8,
				}),
			]);
			expect(
				server.requests.map((request) => request.searchParams.get("t")),
			).toEqual(["book", "search"]);
		} finally {
			await server.stop();
		}
	});

	it("skips searching when no categories are configured", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/xml");
			response.end(`<?xml version="1.0"?><rss><channel></channel></rss>`);
		});

		try {
			const results = await searchNewznab(
				{
					baseUrl: server.baseUrl,
					apiPath: "/api",
					apiKey: "test-newznab-api-key",
				},
				"ignored",
				[],
			);

			expect(results).toEqual([]);
			expect(server.requests).toHaveLength(0);
		} finally {
			await server.stop();
		}
	});

	it("reads the indexer version from caps", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/api");
			expect(request.searchParams.get("t")).toBe("caps");
			expect(request.searchParams.get("apikey")).toBe("test-newznab-api-key");
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/xml");
			response.end(
				`<?xml version="1.0"?><caps><server version="1.4.7" /></caps>`,
			);
		});

		try {
			const result = await testNewznab({
				baseUrl: server.baseUrl,
				apiPath: "/api",
				apiKey: "test-newznab-api-key",
			});

			expect(result).toEqual({
				success: true,
				message: "Connected to indexer successfully",
				version: "1.4.7",
			});
		} finally {
			await server.stop();
		}
	});
});
