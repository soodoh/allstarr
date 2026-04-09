import { startHttpTestServer } from "src/server/__tests__/helpers/http-test-server";
import { afterEach, describe, expect, it, vi } from "vitest";
import qbittorrentProvider from "./qbittorrent";
import type { ConnectionConfig, DownloadRequest } from "./types";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("qbittorrent provider", () => {
	it("logs in, reads the version, and trims the response", async () => {
		const server = await startHttpTestServer(async (request, response) => {
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

	it("reports invalid credentials when login fails", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/api/v2/auth/login");
			expect(request.method).toBe("POST");
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/plain");
			response.end("Fails.");
		});

		try {
			const result = await qbittorrentProvider.testConnection({
				implementation: "qBittorrent",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: null,
				username: "admin",
				password: "wrong-password",
				apiKey: null,
				category: null,
				tag: null,
				settings: null,
			});

			expect(result).toEqual({
				success: false,
				message: "Invalid username or password",
				version: null,
			});
			expect(server.requests).toHaveLength(1);
		} finally {
			await server.stop();
		}
	});

	it("reports login HTTP failures", async () => {
		const server = await startHttpTestServer((request, response) => {
			expect(request.pathname).toBe("/api/v2/auth/login");
			response.statusCode = 500;
			response.end("boom");
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
				success: false,
				message: "Login failed: HTTP 500",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports missing qBittorrent session cookies", async () => {
		const server = await startHttpTestServer((request, response) => {
			expect(request.pathname).toBe("/api/v2/auth/login");
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/plain");
			response.end("Ok.");
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
				success: false,
				message: "No session cookie returned from qBittorrent",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports malformed qBittorrent session cookies", async () => {
		const server = await startHttpTestServer((request, response) => {
			expect(request.pathname).toBe("/api/v2/auth/login");
			response.statusCode = 200;
			response.setHeader("Set-Cookie", "not-sid=abc123; Path=/");
			response.end("Ok.");
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
				success: false,
				message: "Could not parse session ID from qBittorrent response",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports version fetch failures after login succeeds", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname === "/api/v2/auth/login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "SID=test-session-id; Path=/");
				response.end("Ok.");
				return;
			}

			expect(request.pathname).toBe("/api/v2/app/version");
			expect(request.headers.cookie).toContain("SID=test-session-id");
			response.statusCode = 503;
			response.end("unavailable");
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
				success: false,
				message: "Failed to get version: HTTP 503",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports non-Error qBittorrent failures as unknown errors", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue("boom");

		try {
			const result = await qbittorrentProvider.testConnection({
				implementation: "qBittorrent",
				host: "127.0.0.1",
				port: 8080,
				useSsl: false,
				urlBase: null,
				username: null,
				password: null,
				apiKey: null,
				category: null,
				tag: null,
				settings: null,
			});

			expect(result).toEqual({
				success: false,
				message: "Unknown error occurred",
				version: null,
			});
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		} finally {
			fetchSpy.mockRestore();
		}
	});

	it("sends download metadata and reads torrent listings", async () => {
		const server = await startHttpTestServer(async (request, response) => {
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
						{
							hash: "def234",
							name: "Downloading release",
							state: "downloading",
							size: 1_024,
							downloaded: 256,
							upspeed: 1,
							dlspeed: 2,
							category: "books",
						},
						{
							hash: "ghi345",
							name: "Completed release",
							state: "forcedUP",
							size: 2_048,
							downloaded: 2_048,
							upspeed: 3,
							dlspeed: 4,
							category: "books",
							save_path: "/downloads/completed",
						},
						{
							hash: "ghi346",
							name: "Uploading release",
							state: "uploading",
							size: 2_304,
							downloaded: 2_304,
							upspeed: 13,
							dlspeed: 14,
							category: "books",
						},
						{
							hash: "ghi347",
							name: "Stalled upload release",
							state: "stalledUP",
							size: 2_560,
							downloaded: 2_560,
							upspeed: 15,
							dlspeed: 16,
							category: "books",
						},
						{
							hash: "jkl456",
							name: "Paused release",
							state: "pausedUP",
							size: 4_096,
							downloaded: 512,
							upspeed: 5,
							dlspeed: 6,
							category: "books",
						},
						{
							hash: "mno567",
							name: "Queued check release",
							state: "queuedForChecking",
							size: 8_192,
							downloaded: 1_024,
							upspeed: 7,
							dlspeed: 8,
							category: "books",
						},
						{
							hash: "mno568",
							name: "Paused download release",
							state: "pausedDL",
							size: 8_448,
							downloaded: 1_280,
							upspeed: 7,
							dlspeed: 8,
							category: "books",
						},
						{
							hash: "pqr678",
							name: "Failed release",
							state: "error",
							size: 16_384,
							downloaded: 2_048,
							upspeed: 9,
							dlspeed: 10,
							category: "books",
						},
						{
							hash: "stu789",
							name: "Default release",
							state: "something-else",
							size: 32_768,
							downloaded: 4_096,
							upspeed: 11,
							dlspeed: 12,
							category: "books",
						},
						{
							hash: undefined,
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
				{
					id: "def234",
					name: "Downloading release",
					status: "downloading",
					size: 1_024,
					downloaded: 256,
					uploadSpeed: 1,
					downloadSpeed: 2,
					category: "books",
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "ghi345",
					name: "Completed release",
					status: "completed",
					size: 2_048,
					downloaded: 2_048,
					uploadSpeed: 3,
					downloadSpeed: 4,
					category: "books",
					outputPath: "/downloads/completed",
					isCompleted: true,
				},
				{
					id: "ghi346",
					name: "Uploading release",
					status: "completed",
					size: 2_304,
					downloaded: 2_304,
					uploadSpeed: 13,
					downloadSpeed: 14,
					category: "books",
					outputPath: null,
					isCompleted: true,
				},
				{
					id: "ghi347",
					name: "Stalled upload release",
					status: "completed",
					size: 2_560,
					downloaded: 2_560,
					uploadSpeed: 15,
					downloadSpeed: 16,
					category: "books",
					outputPath: null,
					isCompleted: true,
				},
				{
					id: "jkl456",
					name: "Paused release",
					status: "paused",
					size: 4_096,
					downloaded: 512,
					uploadSpeed: 5,
					downloadSpeed: 6,
					category: "books",
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "mno567",
					name: "Queued check release",
					status: "queued",
					size: 8_192,
					downloaded: 1_024,
					uploadSpeed: 7,
					downloadSpeed: 8,
					category: "books",
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "mno568",
					name: "Paused download release",
					status: "paused",
					size: 8_448,
					downloaded: 1_280,
					uploadSpeed: 7,
					downloadSpeed: 8,
					category: "books",
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "pqr678",
					name: "Failed release",
					status: "failed",
					size: 16_384,
					downloaded: 2_048,
					uploadSpeed: 9,
					downloadSpeed: 10,
					category: "books",
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "stu789",
					name: "Default release",
					status: "downloading",
					size: 32_768,
					downloaded: 4_096,
					uploadSpeed: 11,
					downloadSpeed: 12,
					category: "books",
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "",
					name: "",
					status: "downloading",
					size: 0,
					downloaded: 0,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: "",
					outputPath: null,
					isCompleted: false,
				},
			]);
		} finally {
			await server.stop();
		}
	});

	it("uploads torrent data without a URL and falls back to the download category", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname === "/api/v2/auth/login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "SID=test-session-id; Path=/");
				response.end("Ok.");
				return;
			}

			if (request.pathname === "/api/v2/torrents/add") {
				expect(request.headers.cookie).toContain("SID=test-session-id");
				expect(request.body).toContain('name="torrents"');
				expect(request.body).toContain("download.torrent");
				expect(request.body).not.toContain('name="urls"');
				expect(request.body).toContain('name="category"');
				expect(request.body).toContain("fallback-category");
				expect(request.body).not.toContain('name="tags"');
				expect(request.body).not.toContain('name="savepath"');
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
				username: null,
				password: null,
				apiKey: null,
				category: null,
				tag: null,
				settings: null,
			};
			const download: DownloadRequest = {
				url: null,
				torrentData: Buffer.from("torrent-bytes"),
				nzbData: null,
				category: "fallback-category",
				tag: null,
				savePath: null,
			};

			await expect(
				qbittorrentProvider.addDownload(config, download),
			).resolves.toBe("Ok.");
		} finally {
			await server.stop();
		}
	});

	it("omits the qBittorrent category field when neither source provides one", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname === "/api/v2/auth/login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "SID=test-session-id; Path=/");
				response.end("Ok.");
				return;
			}

			if (request.pathname === "/api/v2/torrents/add") {
				expect(request.body).toContain('name="torrents"');
				expect(request.body).not.toContain('name="category"');
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
				username: null,
				password: null,
				apiKey: null,
				category: null,
				tag: null,
				settings: null,
			};
			const download: DownloadRequest = {
				url: null,
				torrentData: Buffer.from("torrent-bytes"),
				nzbData: null,
				category: null,
				tag: null,
				savePath: null,
			};

			await expect(
				qbittorrentProvider.addDownload(config, download),
			).resolves.toBe("Ok.");
		} finally {
			await server.stop();
		}
	});

	it("surfaces qBittorrent endpoint failures", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname === "/api/v2/auth/login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "SID=test-session-id; Path=/");
				response.end("Ok.");
				return;
			}

			if (
				[
					"/api/v2/torrents/add",
					"/api/v2/torrents/delete",
					"/api/v2/torrents/pause",
					"/api/v2/torrents/resume",
					"/api/v2/torrents/increasePrio",
					"/api/v2/torrents/decreasePrio",
					"/api/v2/torrents/info",
				].includes(request.pathname)
			) {
				response.statusCode = 500;
				response.end("boom");
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
				username: null,
				password: null,
				apiKey: null,
				category: null,
				tag: null,
				settings: null,
			};
			const download: DownloadRequest = {
				url: "http://example.com/release.torrent",
				torrentData: null,
				nzbData: null,
				category: null,
				tag: null,
				savePath: null,
			};

			await expect(
				qbittorrentProvider.addDownload(config, download),
			).rejects.toThrow("Failed to add torrent: HTTP 500");
			await expect(
				qbittorrentProvider.removeDownload(config, "abc123", true),
			).rejects.toThrow("Failed to remove torrent: HTTP 500");
			if (
				!qbittorrentProvider.pauseDownload ||
				!qbittorrentProvider.resumeDownload ||
				!qbittorrentProvider.setPriority
			) {
				throw new Error("qBittorrent provider missing optional methods");
			}
			await expect(
				qbittorrentProvider.pauseDownload(config, "abc123"),
			).rejects.toThrow("Failed to pause torrent: HTTP 500");
			await expect(
				qbittorrentProvider.resumeDownload(config, "abc123"),
			).rejects.toThrow("Failed to resume torrent: HTTP 500");
			await expect(
				qbittorrentProvider.setPriority(config, "abc123", 1),
			).rejects.toThrow("Failed to set torrent priority: HTTP 500");
			await expect(
				qbittorrentProvider.setPriority(config, "abc123", 0),
			).rejects.toThrow("Failed to set torrent priority: HTTP 500");
			await expect(qbittorrentProvider.getDownloads(config)).rejects.toThrow(
				"Failed to get torrents: HTTP 500",
			);
		} finally {
			await server.stop();
		}
	});

	it("targets the expected action endpoints", async () => {
		const server = await startHttpTestServer(async (request, response) => {
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
