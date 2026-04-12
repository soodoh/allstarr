import { startHttpTestServer } from "src/server/__tests__/helpers/http-test-server";
import { afterEach, describe, expect, it, vi } from "vitest";
import delugeProvider from "./deluge";
import type { ConnectionConfig, DownloadRequest } from "./types";

afterEach(() => {
	vi.restoreAllMocks();
});

function delugeConfig(
	port: number,
	overrides?: Partial<ConnectionConfig>,
): ConnectionConfig {
	return {
		implementation: "Deluge",
		host: "127.0.0.1",
		port,
		useSsl: false,
		urlBase: null,
		username: "admin",
		password: "password",
		apiKey: null,
		category: null,
		tag: null,
		settings: null,
		...overrides,
	};
}

function jsonRpc(result: unknown, error?: { message?: string }) {
	return JSON.stringify({ id: 1, result, error });
}

describe("deluge provider", () => {
	it("authenticates, connects to daemon, and returns version", async () => {
		const server = await startHttpTestServer(
			async (request, response, _requests) => {
				expect(request.pathname).toBe("/json");
				expect(request.method).toBe("POST");
				const body = JSON.parse(request.body);

				if (body.method === "auth.login") {
					expect(body.params).toEqual(["password"]);
					response.statusCode = 200;
					response.setHeader("Set-Cookie", "session=deluge-session; Path=/");
					response.setHeader("Content-Type", "application/json");
					response.end(jsonRpc(true));
					return;
				}

				if (body.method === "web.connected") {
					expect(request.headers.cookie).toContain("session=deluge-session");
					response.statusCode = 200;
					response.setHeader("Content-Type", "application/json");
					response.end(jsonRpc(true));
					return;
				}

				if (body.method === "daemon.get_version") {
					expect(request.headers.cookie).toContain("session=deluge-session");
					response.statusCode = 200;
					response.setHeader("Content-Type", "application/json");
					response.end(jsonRpc("2.1.1"));
					return;
				}

				response.statusCode = 404;
				response.end("not found");
			},
		);

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await delugeProvider.testConnection(delugeConfig(port));

			expect(result).toEqual({
				success: true,
				message: "Connected to Deluge successfully",
				version: "2.1.1",
			});
			expect(server.requests).toHaveLength(3);
		} finally {
			await server.stop();
		}
	});

	it("auto-connects to first host when web.connected returns false", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "web.connected") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(false));
				return;
			}

			if (body.method === "web.get_hosts") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc([["host-id-1", "127.0.0.1", 58846, "Online"]]));
				return;
			}

			if (body.method === "web.connect") {
				expect(body.params).toEqual(["host-id-1"]);
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(null));
				return;
			}

			if (body.method === "daemon.get_version") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc("2.0.5"));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await delugeProvider.testConnection(delugeConfig(port));

			expect(result).toEqual({
				success: true,
				message: "Connected to Deluge successfully",
				version: "2.0.5",
			});
			// auth.login, web.connected, web.get_hosts, web.connect, daemon.get_version
			expect(server.requests).toHaveLength(5);
		} finally {
			await server.stop();
		}
	});

	it("fails when no daemon hosts are found", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "web.connected") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(false));
				return;
			}

			if (body.method === "web.get_hosts") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc([]));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await delugeProvider.testConnection(delugeConfig(port));

			expect(result).toEqual({
				success: false,
				message: "No Deluge daemon hosts found",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports invalid password when auth.login returns false", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(false));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await delugeProvider.testConnection(
				delugeConfig(port, { password: "wrong" }),
			);

			expect(result).toEqual({
				success: false,
				message: "Invalid password",
				version: null,
			});
			expect(server.requests).toHaveLength(1);
		} finally {
			await server.stop();
		}
	});

	it("reports HTTP failures from the Deluge API", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 500;
			response.end("boom");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await delugeProvider.testConnection(delugeConfig(port));

			expect(result).toEqual({
				success: false,
				message: "Deluge API error: HTTP 500",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports RPC error responses from Deluge", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(
				JSON.stringify({ id: 1, error: { message: "Permission denied" } }),
			);
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await delugeProvider.testConnection(delugeConfig(port));

			expect(result).toEqual({
				success: false,
				message: "Permission denied",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports RPC error with no message as generic error", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ id: 1, error: {} }));
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await delugeProvider.testConnection(delugeConfig(port));

			expect(result).toEqual({
				success: false,
				message: "Deluge RPC error",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports non-Error failures as unknown errors", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue("boom");

		try {
			const result = await delugeProvider.testConnection(delugeConfig(8112));

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

	it("returns empty version when daemon.get_version returns null", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "web.connected") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "daemon.get_version") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(null));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await delugeProvider.testConnection(delugeConfig(port));

			expect(result).toEqual({
				success: true,
				message: "Connected to Deluge successfully",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("adds a download via URL", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "core.add_torrent_url") {
				expect(body.params[0]).toBe("http://example.com/release.torrent");
				expect(body.params[1]).toEqual({
					download_location: "/downloads/books",
				});
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc("abc123hash"));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const download: DownloadRequest = {
				url: "http://example.com/release.torrent",
				torrentData: null,
				nzbData: null,
				category: null,
				tag: null,
				savePath: "/downloads/books",
			};

			const id = await delugeProvider.addDownload(delugeConfig(port), download);
			expect(id).toBe("abc123hash");
		} finally {
			await server.stop();
		}
	});

	it("adds a download via torrent data", async () => {
		const torrentBytes = Buffer.from("fake-torrent-data");
		const expectedBase64 = torrentBytes.toString("base64");

		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "core.add_torrent_file") {
				expect(body.params[0]).toBe("download.torrent");
				expect(body.params[1]).toBe(expectedBase64);
				expect(body.params[2]).toEqual({});
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc("def456hash"));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const download: DownloadRequest = {
				url: null,
				torrentData: torrentBytes,
				nzbData: null,
				category: null,
				tag: null,
				savePath: null,
			};

			const id = await delugeProvider.addDownload(delugeConfig(port), download);
			expect(id).toBe("def456hash");
		} finally {
			await server.stop();
		}
	});

	it("throws when no URL or torrent data is provided", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const download: DownloadRequest = {
				url: null,
				torrentData: null,
				nzbData: null,
				category: null,
				tag: null,
				savePath: null,
			};

			await expect(
				delugeProvider.addDownload(delugeConfig(port), download),
			).rejects.toThrow("No URL or torrent data provided");
		} finally {
			await server.stop();
		}
	});

	it("removes a download with deleteFiles flag", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "core.remove_torrent") {
				expect(body.params).toEqual(["abc123hash", true]);
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			await expect(
				delugeProvider.removeDownload(delugeConfig(port), "abc123hash", true),
			).resolves.toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	it("removes a download without deleting files", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "core.remove_torrent") {
				expect(body.params).toEqual(["abc123hash", false]);
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			await expect(
				delugeProvider.removeDownload(delugeConfig(port), "abc123hash", false),
			).resolves.toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	it("pauses and resumes downloads", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (
				body.method === "core.pause_torrent" ||
				body.method === "core.resume_torrent"
			) {
				expect(body.params).toEqual(["abc123hash"]);
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(null));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const config = delugeConfig(port);

			await expect(
				delugeProvider.pauseDownload?.(config, "abc123hash"),
			).resolves.toBeUndefined();
			await expect(
				delugeProvider.resumeDownload?.(config, "abc123hash"),
			).resolves.toBeUndefined();

			const pauseReq = server.requests.find((r) => {
				const body = JSON.parse(r.body);
				return body.method === "core.pause_torrent";
			});
			const resumeReq = server.requests.find((r) => {
				const body = JSON.parse(r.body);
				return body.method === "core.resume_torrent";
			});
			expect(pauseReq).toBeDefined();
			expect(resumeReq).toBeDefined();
		} finally {
			await server.stop();
		}
	});

	it("sets priority by calling queue_up or queue_down", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (
				body.method === "core.queue_up" ||
				body.method === "core.queue_down"
			) {
				expect(body.params).toEqual(["abc123hash"]);
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(null));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const config = delugeConfig(port);

			await delugeProvider.setPriority?.(config, "abc123hash", 1);
			await delugeProvider.setPriority?.(config, "abc123hash", 0);

			const queueUpReq = server.requests.find((r) => {
				const body = JSON.parse(r.body);
				return body.method === "core.queue_up";
			});
			const queueDownReq = server.requests.find((r) => {
				const body = JSON.parse(r.body);
				return body.method === "core.queue_down";
			});
			expect(queueUpReq).toBeDefined();
			expect(queueDownReq).toBeDefined();
		} finally {
			await server.stop();
		}
	});

	it("gets downloads and maps all status variants correctly", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "core.get_torrents_status") {
				expect(body.params[0]).toEqual({ label: "books" });
				expect(body.params[1]).toEqual([
					"name",
					"state",
					"total_size",
					"all_time_download",
					"upload_rate",
					"download_rate",
					"save_path",
					"progress",
				]);
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(
					jsonRpc({
						hash1: {
							name: "Downloading release",
							state: "Downloading",
							total_size: 5_242_880,
							all_time_download: 1_048_576,
							upload_rate: 128,
							download_rate: 256,
							save_path: "/downloads/active",
							progress: 20,
						},
						hash2: {
							name: "Allocating release",
							state: "Allocating",
							total_size: 1_024,
							all_time_download: 0,
							upload_rate: 0,
							download_rate: 0,
							progress: 0,
						},
						hash3: {
							name: "Checking release",
							state: "Checking",
							total_size: 2_048,
							all_time_download: 512,
							upload_rate: 0,
							download_rate: 64,
							progress: 25,
						},
						hash4: {
							name: "Seeding release",
							state: "Seeding",
							total_size: 4_096,
							all_time_download: 4_096,
							upload_rate: 512,
							download_rate: 0,
							save_path: "/downloads/seeding",
							progress: 100,
						},
						hash5: {
							name: "Paused incomplete release",
							state: "Paused",
							total_size: 8_192,
							all_time_download: 2_048,
							upload_rate: 0,
							download_rate: 0,
							progress: 50,
						},
						hash6: {
							name: "Paused complete release",
							state: "Paused",
							total_size: 16_384,
							all_time_download: 16_384,
							upload_rate: 0,
							download_rate: 0,
							progress: 100,
						},
						hash7: {
							name: "Queued release",
							state: "Queued",
							total_size: 32_768,
							all_time_download: 0,
							upload_rate: 0,
							download_rate: 0,
							progress: 0,
						},
						hash8: {
							name: "Error release",
							state: "Error",
							total_size: 65_536,
							all_time_download: 1_024,
							upload_rate: 0,
							download_rate: 0,
							progress: 1,
						},
						hash9: {
							name: "Unknown complete release",
							state: "SomethingElse",
							total_size: 1_024,
							all_time_download: 1_024,
							upload_rate: 0,
							download_rate: 0,
							progress: 100,
						},
						hash10: {
							name: "Unknown incomplete release",
							state: "SomethingElse",
							total_size: 2_048,
							all_time_download: 512,
							upload_rate: 0,
							download_rate: 0,
							progress: 50,
						},
					}),
				);
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const config = delugeConfig(port, { category: "books" });

			const downloads = await delugeProvider.getDownloads(config);
			expect(downloads).toEqual([
				{
					id: "hash1",
					name: "Downloading release",
					status: "downloading",
					size: 5_242_880,
					downloaded: 1_048_576,
					uploadSpeed: 128,
					downloadSpeed: 256,
					category: null,
					outputPath: "/downloads/active",
					isCompleted: false,
				},
				{
					id: "hash2",
					name: "Allocating release",
					status: "downloading",
					size: 1_024,
					downloaded: 0,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "hash3",
					name: "Checking release",
					status: "downloading",
					size: 2_048,
					downloaded: 512,
					uploadSpeed: 0,
					downloadSpeed: 64,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "hash4",
					name: "Seeding release",
					status: "completed",
					size: 4_096,
					downloaded: 4_096,
					uploadSpeed: 512,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/seeding",
					isCompleted: true,
				},
				{
					id: "hash5",
					name: "Paused incomplete release",
					status: "paused",
					size: 8_192,
					downloaded: 2_048,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "hash6",
					name: "Paused complete release",
					status: "completed",
					size: 16_384,
					downloaded: 16_384,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: true,
				},
				{
					id: "hash7",
					name: "Queued release",
					status: "queued",
					size: 32_768,
					downloaded: 0,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "hash8",
					name: "Error release",
					status: "failed",
					size: 65_536,
					downloaded: 1_024,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "hash9",
					name: "Unknown complete release",
					status: "completed",
					size: 1_024,
					downloaded: 1_024,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: true,
				},
				{
					id: "hash10",
					name: "Unknown incomplete release",
					status: "downloading",
					size: 2_048,
					downloaded: 512,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
			]);
		} finally {
			await server.stop();
		}
	});

	it("returns an empty list when core.get_torrents_status returns null", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "core.get_torrents_status") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(null));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const downloads = await delugeProvider.getDownloads(delugeConfig(port));
			expect(downloads).toEqual([]);
		} finally {
			await server.stop();
		}
	});

	it("omits filter label when category is not set", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "core.get_torrents_status") {
				expect(body.params[0]).toEqual({});
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc({}));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const config = delugeConfig(port, { category: null });
			const downloads = await delugeProvider.getDownloads(config);
			expect(downloads).toEqual([]);
		} finally {
			await server.stop();
		}
	});

	it("uses empty password when config.password is null", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "auth.login") {
				expect(body.params).toEqual([""]);
				response.statusCode = 200;
				response.setHeader("Set-Cookie", "session=s1; Path=/");
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "web.connected") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc(true));
				return;
			}

			if (body.method === "daemon.get_version") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(jsonRpc("2.1.1"));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await delugeProvider.testConnection(
				delugeConfig(port, { password: null }),
			);
			expect(result.success).toBe(true);
		} finally {
			await server.stop();
		}
	});
});
