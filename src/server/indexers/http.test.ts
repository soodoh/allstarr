import { startHttpTestServer } from "src/server/__tests__/helpers/http-test-server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../download-clients/http", async () => {
	const actual = await vi.importActual<
		typeof import("../download-clients/http")
	>("../download-clients/http");

	return {
		...actual,
		fetchWithTimeout: vi.fn(
			(...args: Parameters<typeof actual.fetchWithTimeout>) =>
				actual.fetchWithTimeout(...args),
		),
	};
});

vi.mock("../indexer-rate-limiter", () => ({
	recordQuery: vi.fn(),
	reportRateLimited: vi.fn(),
	reportSuccess: vi.fn(),
}));

vi.mock("../logger", () => ({
	logInfo: vi.fn(),
}));

import { fetchWithTimeout } from "../download-clients/http";
import {
	recordQuery,
	reportRateLimited,
	reportSuccess,
} from "../indexer-rate-limiter";
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

	it("maps fallback URLs and categories while skipping items without any download URL", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/api");
			expect(request.searchParams.get("t")).toBe("search");
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/xml");
			response.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/">
<channel>
  <item>
    <title>Link Release</title>
    <link>http://example.com/link.nzb</link>
    <category>TV</category>
  </item>
  <item>
    <title>DownloadUrl Release</title>
    <guid>downloadurl-guid</guid>
    <newznab:attr name="downloadurl" value="http://example.com/down.torrent" />
    <category>Movies</category>
  </item>
  <item>
    <title>No Url Release</title>
    <guid>skip-guid</guid>
  </item>
</channel>
</rss>`);
		});

		try {
			const results = await searchNewznab(
				{
					baseUrl: server.baseUrl,
					apiPath: "/api",
					apiKey: "test-newznab-api-key",
				},
				"fallback release",
				[7020],
			);

			expect(results).toEqual([
				expect.objectContaining({
					guid: "http://example.com/link.nzb",
					title: "Link Release",
					downloadUrl: "http://example.com/link.nzb",
					categories: [{ id: 0, name: "TV" }],
					protocol: "usenet",
				}),
				expect.objectContaining({
					guid: "downloadurl-guid",
					title: "DownloadUrl Release",
					downloadUrl: "http://example.com/down.torrent",
					categories: [{ id: 0, name: "Movies" }],
					protocol: "usenet",
				}),
			]);
		} finally {
			await server.stop();
		}
	});

	it("parses a single RSS item with NZB metadata and category arrays", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/api");
			expect(request.searchParams.get("t")).toBe("search");
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/xml");
			response.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/">
<channel>
  <item>
    <title>Single Item Release</title>
    <guid>single-guid</guid>
    <link>http://example.com/single.nzb</link>
    <enclosure length="2048" type="application/x-nzb" />
    <newznab:attr name="grabs" value="5" />
    <category>Books</category>
    <category>Fiction</category>
  </item>
</channel>
</rss>`);
		});

		try {
			const results = await searchNewznab(
				{
					baseUrl: server.baseUrl,
					apiPath: "/api",
					apiKey: "test-newznab-api-key",
				},
				"single release",
				[7020],
			);

			expect(results).toEqual([
				expect.objectContaining({
					guid: "single-guid",
					title: "Single Item Release",
					size: 2048,
					downloadUrl: "http://example.com/single.nzb",
					protocol: "usenet",
					grabs: 5,
					categories: [
						{ id: 0, name: "Books" },
						{ id: 0, name: "Fiction" },
					],
				}),
			]);
			expect(server.requests).toHaveLength(1);
		} finally {
			await server.stop();
		}
	});

	it("treats magnet-only items as torrents", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/api");
			expect(request.searchParams.get("t")).toBe("search");
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/xml");
			response.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/">
<channel>
  <item>
    <title>Magnet Release</title>
    <newznab:attr name="magneturl" value="magnet:?xt=urn:btih:abcdef" />
    <enclosure length="4096" type="application/x-bittorrent" />
  </item>
</channel>
</rss>`);
		});

		try {
			const results = await searchNewznab(
				{
					baseUrl: server.baseUrl,
					apiPath: "/api",
					apiKey: "test-newznab-api-key",
				},
				"magnet release",
				[7020],
			);

			expect(results).toEqual([
				expect.objectContaining({
					title: "Magnet Release",
					downloadUrl: "magnet:?xt=urn:btih:abcdef",
					protocol: "torrent",
				}),
			]);
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

	it("walks all book-search tiers when each tier returns no results", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/api");
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
				[7020],
				{
					author: "The Álpha & Beta",
					title: "Fancy.Book",
				},
			);

			expect(results).toEqual([]);
			expect(
				server.requests.map((request) => request.searchParams.get("t")),
			).toEqual(["book", "search", "search", "search"]);
		} finally {
			await server.stop();
		}
	});

	it("throws the last tier error when every tier fails", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 503;
			response.statusMessage = "Service Unavailable";
			response.end("unavailable");
		});

		try {
			await expect(
				searchNewznab(
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
				),
			).rejects.toThrow(
				"Newznab search returned HTTP 503: Service Unavailable",
			);
			expect(server.requests).toHaveLength(4);
		} finally {
			await server.stop();
		}
	});

	it("retries on 429 with Retry-After before succeeding", async () => {
		vi.useFakeTimers();

		let requestCount = 0;
		const reportRateLimitedSeen = new Promise<void>((resolve) => {
			vi.mocked(reportRateLimited).mockImplementation(() => {
				resolve();
			});
		});
		const server = await startHttpTestServer(async (request, response) => {
			requestCount += 1;
			expect(request.pathname).toBe("/api");
			expect(request.searchParams.get("t")).toBe("search");

			if (requestCount === 1) {
				response.statusCode = 429;
				response.statusMessage = "Too Many Requests";
				response.setHeader("Retry-After", "1");
				response.end("retry later");
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/xml");
			response.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <item>
    <title>Retry release</title>
    <guid isPermaLink="true">guid-retry</guid>
    <enclosure url="http://example.com/retry.torrent" length="1024" type="application/x-bittorrent" />
  </item>
</channel>
</rss>`);
		});

		try {
			const resultPromise = searchNewznab(
				{
					baseUrl: server.baseUrl,
					apiPath: "/api",
					apiKey: "test-newznab-api-key",
				},
				"retry release",
				[7020],
				undefined,
				{ indexerType: "manual", indexerId: 42 },
			);

			await reportRateLimitedSeen;
			expect(server.requests).toHaveLength(1);

			await vi.advanceTimersByTimeAsync(999);
			expect(server.requests).toHaveLength(1);
			expect(vi.mocked(reportRateLimited)).toHaveBeenCalledTimes(1);
			expect(vi.mocked(reportSuccess)).not.toHaveBeenCalled();
			expect(vi.mocked(recordQuery)).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(1);

			await expect(resultPromise).resolves.toEqual([
				expect.objectContaining({
					guid: "guid-retry",
					title: "Retry release",
					downloadUrl: "http://example.com/retry.torrent",
				}),
			]);
			expect(server.requests).toHaveLength(2);
			expect(vi.mocked(reportRateLimited)).toHaveBeenCalledWith(
				"manual",
				42,
				1000,
			);
			expect(vi.mocked(reportSuccess)).toHaveBeenCalledWith("manual", 42);
			expect(vi.mocked(recordQuery)).toHaveBeenCalledTimes(1);
		} finally {
			await server.stop();
		}
	});

	it("retries on 429 without Retry-After before succeeding", async () => {
		vi.useFakeTimers();

		let requestCount = 0;
		const reportRateLimitedSeen = new Promise<void>((resolve) => {
			vi.mocked(reportRateLimited).mockImplementation(() => {
				resolve();
			});
		});
		const server = await startHttpTestServer(async (_request, response) => {
			requestCount += 1;
			if (requestCount === 1) {
				response.statusCode = 429;
				response.statusMessage = "Too Many Requests";
				response.end("retry later");
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/xml");
			response.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <item>
    <title>Retry release</title>
    <guid isPermaLink="true">guid-retry</guid>
    <enclosure url="http://example.com/retry.torrent" length="1024" type="application/x-bittorrent" />
  </item>
</channel>
</rss>`);
		});

		try {
			const resultPromise = searchNewznab(
				{
					baseUrl: server.baseUrl,
					apiPath: "/api",
					apiKey: "test-newznab-api-key",
				},
				"retry release",
				[7020],
				undefined,
				{ indexerType: "manual", indexerId: 42 },
			);

			await reportRateLimitedSeen;
			await vi.advanceTimersByTimeAsync(2000);

			await expect(resultPromise).resolves.toEqual([
				expect.objectContaining({
					guid: "guid-retry",
					title: "Retry release",
					downloadUrl: "http://example.com/retry.torrent",
				}),
			]);
			expect(vi.mocked(reportRateLimited)).toHaveBeenCalledWith(
				"manual",
				42,
				undefined,
			);
			expect(vi.mocked(reportSuccess)).toHaveBeenCalledWith("manual", 42);
		} finally {
			await server.stop();
		}
	});

	it("retries on 429 with an HTTP-date Retry-After before succeeding", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"));

		let requestCount = 0;
		const reportRateLimitedSeen = new Promise<void>((resolve) => {
			vi.mocked(reportRateLimited).mockImplementation(() => {
				resolve();
			});
		});
		const server = await startHttpTestServer(async (_request, response) => {
			requestCount += 1;
			if (requestCount === 1) {
				response.statusCode = 429;
				response.statusMessage = "Too Many Requests";
				response.setHeader(
					"Retry-After",
					new Date("2026-04-08T12:00:01.000Z").toUTCString(),
				);
				response.end("retry later");
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/xml");
			response.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <item>
    <title>Date Retry release</title>
    <guid isPermaLink="true">guid-date-retry</guid>
    <enclosure url="http://example.com/date-retry.torrent" length="1024" type="application/x-bittorrent" />
  </item>
</channel>
</rss>`);
		});

		try {
			const resultPromise = searchNewznab(
				{
					baseUrl: server.baseUrl,
					apiPath: "/api",
					apiKey: "test-newznab-api-key",
				},
				"date retry release",
				[7020],
				undefined,
				{ indexerType: "synced", indexerId: 99 },
			);

			await reportRateLimitedSeen;
			await vi.advanceTimersByTimeAsync(1000);

			await expect(resultPromise).resolves.toEqual([
				expect.objectContaining({
					guid: "guid-date-retry",
					title: "Date Retry release",
					downloadUrl: "http://example.com/date-retry.torrent",
				}),
			]);
			expect(vi.mocked(reportRateLimited)).toHaveBeenCalledWith(
				"synced",
				99,
				1000,
			);
			expect(vi.mocked(reportSuccess)).toHaveBeenCalledWith("synced", 99);
		} finally {
			await server.stop();
		}
	});

	it("retries on 429 with an invalid Retry-After by falling back to exponential backoff", async () => {
		vi.useFakeTimers();

		let requestCount = 0;
		const reportRateLimitedSeen = new Promise<void>((resolve) => {
			vi.mocked(reportRateLimited).mockImplementation(() => {
				resolve();
			});
		});
		const server = await startHttpTestServer(async (_request, response) => {
			requestCount += 1;
			if (requestCount === 1) {
				response.statusCode = 429;
				response.statusMessage = "Too Many Requests";
				response.setHeader("Retry-After", "not-a-date");
				response.end("retry later");
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/xml");
			response.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <item>
    <title>Invalid Retry release</title>
    <guid isPermaLink="true">guid-invalid-retry</guid>
    <enclosure url="http://example.com/invalid-retry.torrent" length="1024" type="application/x-bittorrent" />
  </item>
</channel>
</rss>`);
		});

		try {
			const resultPromise = searchNewznab(
				{
					baseUrl: server.baseUrl,
					apiPath: "/api",
					apiKey: "test-newznab-api-key",
				},
				"invalid retry release",
				[7020],
				undefined,
				{ indexerType: "manual", indexerId: 7 },
			);

			await reportRateLimitedSeen;
			await vi.advanceTimersByTimeAsync(2000);

			await expect(resultPromise).resolves.toEqual([
				expect.objectContaining({
					guid: "guid-invalid-retry",
					title: "Invalid Retry release",
					downloadUrl: "http://example.com/invalid-retry.torrent",
				}),
			]);
			expect(vi.mocked(reportRateLimited)).toHaveBeenCalledWith(
				"manual",
				7,
				undefined,
			);
			expect(vi.mocked(reportSuccess)).toHaveBeenCalledWith("manual", 7);
		} finally {
			await server.stop();
		}
	});

	it("returns a failure payload when caps responds with a non-ok status", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 503;
			response.statusMessage = "Service Unavailable";
			response.end("unavailable");
		});

		try {
			const result = await testNewznab({
				baseUrl: server.baseUrl,
				apiPath: "/api",
				apiKey: "test-newznab-api-key",
			});

			expect(result).toEqual({
				success: false,
				message: "Indexer returned HTTP 503: Service Unavailable",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("accepts an apiPath without a leading slash and reports a missing caps version", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/api");
			expect(request.searchParams.get("t")).toBe("caps");
			expect(request.searchParams.get("apikey")).toBeNull();
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/xml");
			response.end(`<?xml version="1.0"?><caps><server /></caps>`);
		});

		try {
			await expect(
				testNewznab({
					baseUrl: server.baseUrl,
					apiPath: "api",
					apiKey: "",
				}),
			).resolves.toEqual({
				success: true,
				message: "Connected to indexer successfully",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("returns a failure payload when fetching caps fails", async () => {
		vi.mocked(fetchWithTimeout).mockRejectedValueOnce("socket closed");

		await expect(
			testNewznab({
				baseUrl: "http://example.invalid",
				apiPath: "/api",
				apiKey: "test-newznab-api-key",
			}),
		).resolves.toEqual({
			success: false,
			message: "Unknown connection error",
			version: null,
		});
	});

	it("returns the fetch error message when fetching caps throws an Error", async () => {
		vi.mocked(fetchWithTimeout).mockRejectedValueOnce(
			new Error("socket closed"),
		);

		await expect(
			testNewznab({
				baseUrl: "http://example.invalid",
				apiPath: "/api",
				apiKey: "test-newznab-api-key",
			}),
		).resolves.toEqual({
			success: false,
			message: "socket closed",
			version: null,
		});
	});
});
