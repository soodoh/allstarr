import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import qbittorrentProvider from "./qbittorrent";
import type { ConnectionConfig, DownloadRequest } from "./types";

type CapturedRequest = {
	method: string;
	pathname: string;
	search: string;
	headers: Record<string, string | string[] | undefined>;
	body: string;
};

async function readBody(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf8");
}

async function startServer(
	handler: (
		request: CapturedRequest,
		response: ServerResponse,
		requests: CapturedRequest[],
	) => Promise<void> | void,
) {
	const requests: CapturedRequest[] = [];
	const server = createServer((req, res) => {
		void (async () => {
			const url = new URL(req.url ?? "/", "http://127.0.0.1");
			const request: CapturedRequest = {
				method: req.method ?? "GET",
				pathname: url.pathname,
				search: url.search,
				headers: req.headers,
				body: await readBody(req),
			};
			requests.push(request);
			await handler(request, res, requests);
		})().catch((error) => {
			res.statusCode = 500;
			res.setHeader("Content-Type", "text/plain");
			res.end(error instanceof Error ? error.message : String(error));
		});
	});

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Expected the test server to listen on a port");
	}

	return {
		baseUrl: `http://127.0.0.1:${address.port}`,
		requests,
		async stop() {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			});
		},
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("qbittorrent provider", () => {
	it("logs in, reads the version, and trims the response", async () => {
		const server = await startServer(async (request, response) => {
			if (request.pathname === "/api/v2/auth/login") {
				expect(request.method).toBe("POST");
				expect(request.body).toContain("username=admin");
				expect(request.body).toContain("password=secret");
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "SID=test-session-id; Path=/");
				response.setHeader("Content-Type", "text/plain");
				response.end("Ok.");
				return;
			}

			if (request.pathname === "/api/v2/app/version") {
				expect(request.headers.cookie).toContain("SID=test-session-id");
				response.statusCode = 200;
				response.end(" v4.6.3 \n");
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const result = await qbittorrentProvider.testConnection({
				implementation: "qBittorrent",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: null,
				username: "admin",
				password: "secret",
				apiKey: null,
				category: null,
				tag: null,
				settings: null,
			});

			expect(result).toEqual({
				success: true,
				message: "Connected to qBittorrent successfully",
				version: "v4.6.3",
			});
			expect(server.requests).toHaveLength(2);
		} finally {
			await server.stop();
		}
	});

	it("sends download metadata and reads torrent listings", async () => {
		const server = await startServer(async (request, response) => {
			if (request.pathname === "/api/v2/auth/login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "SID=test-session-id; Path=/");
				response.end("Ok.");
				return;
			}

			if (request.pathname === "/api/v2/torrents/add") {
				response.statusCode = 200;
				response.end("Ok.");
				return;
			}

			if (request.pathname === "/api/v2/torrents/info") {
				expect(request.search).toBe("?category=books");
				expect(request.headers.cookie).toContain("SID=test-session-id");
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(
					JSON.stringify([
						{
							hash: "abc123",
							name: "Queued release",
							state: "queuedDL",
							size: 5_242_880,
							downloaded: 1_048_576,
							upspeed: 128,
							dlspeed: 256,
							category: "books",
							save_path: "/downloads/books",
						},
					]),
				);
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const config: ConnectionConfig = {
				implementation: "qBittorrent",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: null,
				username: "admin",
				password: "secret",
				apiKey: null,
				category: "books",
				tag: "client-tag",
				settings: null,
			};
			const download: DownloadRequest = {
				url: "http://example.com/release.torrent",
				torrentData: null,
				nzbData: null,
				category: "fallback-category",
				tag: "release-tag",
				savePath: "/downloads/books",
			};

			await expect(
				qbittorrentProvider.addDownload(config, download),
			).resolves.toBe("Ok.");

			const addRequest = server.requests.find(
				(request) => request.pathname === "/api/v2/torrents/add",
			);
			expect(addRequest).toBeDefined();
			expect(addRequest?.body).toContain('name="urls"');
			expect(addRequest?.body).toContain("http://example.com/release.torrent");
			expect(addRequest?.body).toContain('name="category"');
			expect(addRequest?.body).toContain("books");
			expect(addRequest?.body).toContain('name="tags"');
			expect(addRequest?.body).toContain("client-tag,release-tag");
			expect(addRequest?.body).toContain('name="savepath"');
			expect(addRequest?.body).toContain("/downloads/books");

			const downloads = await qbittorrentProvider.getDownloads(config);
			expect(downloads).toEqual([
				{
					id: "abc123",
					name: "Queued release",
					status: "queued",
					size: 5_242_880,
					downloaded: 1_048_576,
					uploadSpeed: 128,
					downloadSpeed: 256,
					category: "books",
					outputPath: "/downloads/books",
					isCompleted: false,
				},
			]);
		} finally {
			await server.stop();
		}
	});

	it("targets the expected action endpoints", async () => {
		const server = await startServer(async (request, response) => {
			if (request.pathname === "/api/v2/auth/login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "SID=test-session-id; Path=/");
				response.end("Ok.");
				return;
			}

			if (
				[
					"/api/v2/torrents/delete",
					"/api/v2/torrents/pause",
					"/api/v2/torrents/resume",
					"/api/v2/torrents/increasePrio",
					"/api/v2/torrents/decreasePrio",
				].includes(request.pathname)
			) {
				response.statusCode = 200;
				response.end("Ok.");
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const config: ConnectionConfig = {
				implementation: "qBittorrent",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: null,
				username: "admin",
				password: "secret",
				apiKey: null,
				category: null,
				tag: null,
				settings: null,
			};

			await qbittorrentProvider.removeDownload(config, "abc123", true);
			await qbittorrentProvider.pauseDownload?.(config, "abc123");
			await qbittorrentProvider.resumeDownload?.(config, "abc123");
			await qbittorrentProvider.setPriority?.(config, "abc123", 1);
			await qbittorrentProvider.setPriority?.(config, "abc123", 0);

			expect(
				server.requests.filter(
					(request) => request.pathname === "/api/v2/torrents/delete",
				),
			).toHaveLength(1);
			expect(
				server.requests.find(
					(request) => request.pathname === "/api/v2/torrents/delete",
				)?.body,
			).toContain("hashes=abc123");
			expect(
				server.requests.find(
					(request) => request.pathname === "/api/v2/torrents/delete",
				)?.body,
			).toContain("deleteFiles=true");
			expect(
				server.requests.filter(
					(request) => request.pathname === "/api/v2/torrents/pause",
				),
			).toHaveLength(1);
			expect(
				server.requests.filter(
					(request) => request.pathname === "/api/v2/torrents/resume",
				),
			).toHaveLength(1);
			expect(
				server.requests.filter(
					(request) => request.pathname === "/api/v2/torrents/increasePrio",
				),
			).toHaveLength(1);
			expect(
				server.requests.filter(
					(request) => request.pathname === "/api/v2/torrents/decreasePrio",
				),
			).toHaveLength(1);
		} finally {
			await server.stop();
		}
	});
});
