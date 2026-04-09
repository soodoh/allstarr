import { startHttpTestServer } from "src/server/__tests__/helpers/http-test-server";
import { afterEach, describe, expect, it, vi } from "vitest";
import transmissionProvider from "./transmission";
import type { ConnectionConfig, DownloadRequest } from "./types";

afterEach(() => {
	vi.restoreAllMocks();
});

function transmissionConfig(
	port: number,
	overrides?: Partial<ConnectionConfig>,
): ConnectionConfig {
	return {
		implementation: "Transmission",
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

describe("transmission provider", () => {
	it("handles 409 session-id dance and returns version", async () => {
		let callCount = 0;

		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/transmission/rpc");
			expect(request.method).toBe("POST");

			callCount++;

			if (callCount === 1) {
				// First call has empty session id — return 409 with the real one
				expect(request.headers["x-transmission-session-id"]).toBe("");
				response.statusCode = 409;
				response.setHeader("X-Transmission-Session-Id", "real-session-id");
				response.end("Conflict");
				return;
			}

			// Second call should have the real session id
			expect(request.headers["x-transmission-session-id"]).toBe(
				"real-session-id",
			);
			const body = JSON.parse(request.body);
			expect(body.method).toBe("session-get");

			// Verify Basic auth header
			const expectedAuth = Buffer.from("admin:password").toString("base64");
			expect(request.headers.authorization).toBe(`Basic ${expectedAuth}`);

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(
				JSON.stringify({
					result: "success",
					arguments: { version: "4.0.5" },
				}),
			);
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await transmissionProvider.testConnection(
				transmissionConfig(port),
			);

			expect(result).toEqual({
				success: true,
				message: "Connected to Transmission successfully",
				version: "4.0.5",
			});
			expect(server.requests).toHaveLength(2);
		} finally {
			await server.stop();
		}
	});

	it("connects without credentials when username and password are null", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.headers.authorization).toBeUndefined();

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(
				JSON.stringify({
					result: "success",
					arguments: { version: "3.0.0" },
				}),
			);
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await transmissionProvider.testConnection(
				transmissionConfig(port, { username: null, password: null }),
			);

			expect(result).toEqual({
				success: true,
				message: "Connected to Transmission successfully",
				version: "3.0.0",
			});
		} finally {
			await server.stop();
		}
	});

	it("reports unexpected result from Transmission", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(
				JSON.stringify({
					result: "some-error",
					arguments: {},
				}),
			);
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await transmissionProvider.testConnection(
				transmissionConfig(port),
			);

			expect(result).toEqual({
				success: false,
				message: "Unexpected result from Transmission: some-error",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports HTTP failures from Transmission RPC", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 500;
			response.end("boom");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await transmissionProvider.testConnection(
				transmissionConfig(port),
			);

			expect(result).toEqual({
				success: false,
				message: "Transmission RPC error: HTTP 500",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports non-Error failures as unknown errors", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue("boom");

		try {
			const result = await transmissionProvider.testConnection(
				transmissionConfig(9091),
			);

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

	it("returns null version when arguments.version is missing", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(
				JSON.stringify({
					result: "success",
					arguments: {},
				}),
			);
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const result = await transmissionProvider.testConnection(
				transmissionConfig(port),
			);

			expect(result).toEqual({
				success: true,
				message: "Connected to Transmission successfully",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("adds a download via URL and returns the torrent id", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "torrent-add") {
				expect(body.arguments.filename).toBe(
					"http://example.com/release.torrent",
				);
				expect(body.arguments["download-dir"]).toBe("/downloads/books");
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(
					JSON.stringify({
						result: "success",
						arguments: { "torrent-added": { id: 42, name: "Test Torrent" } },
					}),
				);
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

			const id = await transmissionProvider.addDownload(
				transmissionConfig(port),
				download,
			);
			expect(id).toBe("42");
		} finally {
			await server.stop();
		}
	});

	it("adds a download via torrent data as base64 metainfo", async () => {
		const torrentBytes = Buffer.from("fake-torrent-data");
		const expectedBase64 = torrentBytes.toString("base64");

		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "torrent-add") {
				expect(body.arguments.metainfo).toBe(expectedBase64);
				expect(body.arguments.filename).toBeUndefined();
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(
					JSON.stringify({
						result: "success",
						arguments: { "torrent-added": { id: 99 } },
					}),
				);
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

			const id = await transmissionProvider.addDownload(
				transmissionConfig(port),
				download,
			);
			expect(id).toBe("99");
		} finally {
			await server.stop();
		}
	});

	it("returns id from torrent-duplicate when already added", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "torrent-add") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(
					JSON.stringify({
						result: "success",
						arguments: { "torrent-duplicate": { id: 77 } },
					}),
				);
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
				savePath: null,
			};

			const id = await transmissionProvider.addDownload(
				transmissionConfig(port),
				download,
			);
			expect(id).toBe("77");
		} finally {
			await server.stop();
		}
	});

	it("throws when torrent-add returns a non-success result", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(
				JSON.stringify({
					result: "duplicate torrent",
					arguments: {},
				}),
			);
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const download: DownloadRequest = {
				url: "http://example.com/release.torrent",
				torrentData: null,
				nzbData: null,
				category: null,
				tag: null,
				savePath: null,
			};

			await expect(
				transmissionProvider.addDownload(transmissionConfig(port), download),
			).rejects.toThrow("Failed to add torrent: duplicate torrent");
		} finally {
			await server.stop();
		}
	});

	it("removes a download with deleteFiles flag", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "torrent-remove") {
				expect(body.arguments.ids).toEqual([42]);
				expect(body.arguments["delete-local-data"]).toBe(true);
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ result: "success", arguments: {} }));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			await expect(
				transmissionProvider.removeDownload(
					transmissionConfig(port),
					"42",
					true,
				),
			).resolves.toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	it("removes a download without deleting files", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "torrent-remove") {
				expect(body.arguments.ids).toEqual([42]);
				expect(body.arguments["delete-local-data"]).toBe(false);
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ result: "success", arguments: {} }));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			await expect(
				transmissionProvider.removeDownload(
					transmissionConfig(port),
					"42",
					false,
				),
			).resolves.toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	it("throws when torrent-remove returns a non-success result", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(
				JSON.stringify({ result: "permission denied", arguments: {} }),
			);
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			await expect(
				transmissionProvider.removeDownload(
					transmissionConfig(port),
					"42",
					true,
				),
			).rejects.toThrow("Failed to remove torrent: permission denied");
		} finally {
			await server.stop();
		}
	});

	it("pauses and resumes downloads via torrent-stop and torrent-start", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "torrent-stop" || body.method === "torrent-start") {
				expect(body.arguments.ids).toEqual([42]);
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ result: "success", arguments: {} }));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const config = transmissionConfig(port);

			await expect(
				transmissionProvider.pauseDownload?.(config, "42"),
			).resolves.toBeUndefined();
			await expect(
				transmissionProvider.resumeDownload?.(config, "42"),
			).resolves.toBeUndefined();

			const stopReq = server.requests.find(
				(r) => JSON.parse(r.body).method === "torrent-stop",
			);
			const startReq = server.requests.find(
				(r) => JSON.parse(r.body).method === "torrent-start",
			);
			expect(stopReq).toBeDefined();
			expect(startReq).toBeDefined();
		} finally {
			await server.stop();
		}
	});

	it("throws when pause or resume returns a non-success result", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: "error", arguments: {} }));
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const config = transmissionConfig(port);

			await expect(
				transmissionProvider.pauseDownload?.(config, "42"),
			).rejects.toThrow("Failed to pause torrent: error");
			await expect(
				transmissionProvider.resumeDownload?.(config, "42"),
			).rejects.toThrow("Failed to resume torrent: error");
		} finally {
			await server.stop();
		}
	});

	it("sets priority via queue-move-up and queue-move-down", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (
				body.method === "queue-move-up" ||
				body.method === "queue-move-down"
			) {
				expect(body.arguments.ids).toEqual([42]);
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ result: "success", arguments: {} }));
				return;
			}

			response.statusCode = 404;
			response.end("not found");
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const config = transmissionConfig(port);

			await transmissionProvider.setPriority?.(config, "42", 1);
			await transmissionProvider.setPriority?.(config, "42", 0);

			const moveUpReq = server.requests.find(
				(r) => JSON.parse(r.body).method === "queue-move-up",
			);
			const moveDownReq = server.requests.find(
				(r) => JSON.parse(r.body).method === "queue-move-down",
			);
			expect(moveUpReq).toBeDefined();
			expect(moveDownReq).toBeDefined();
		} finally {
			await server.stop();
		}
	});

	it("throws when setPriority returns a non-success result", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: "error", arguments: {} }));
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const config = transmissionConfig(port);

			await expect(
				transmissionProvider.setPriority?.(config, "42", 1),
			).rejects.toThrow("Failed to set torrent priority: error");
		} finally {
			await server.stop();
		}
	});

	it("gets downloads and maps all status variants correctly", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "torrent-get") {
				expect(body.arguments.fields).toEqual([
					"id",
					"name",
					"status",
					"totalSize",
					"downloadedEver",
					"uploadSpeed",
					"rateDownload",
					"downloadDir",
				]);
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(
					JSON.stringify({
						result: "success",
						arguments: {
							torrents: [
								{
									id: 1,
									name: "Downloading release",
									status: 4,
									totalSize: 5_242_880,
									downloadedEver: 1_048_576,
									uploadSpeed: 128,
									rateDownload: 256,
									downloadDir: "/downloads/active",
								},
								{
									id: 2,
									name: "Seeding release",
									status: 6,
									totalSize: 4_096,
									downloadedEver: 4_096,
									uploadSpeed: 512,
									rateDownload: 0,
									downloadDir: "/downloads/seeding",
								},
								{
									id: 3,
									name: "Queued seed release",
									status: 5,
									totalSize: 2_048,
									downloadedEver: 2_048,
									uploadSpeed: 0,
									rateDownload: 0,
									downloadDir: "/downloads/done",
								},
								{
									id: 4,
									name: "Stopped release",
									status: 0,
									totalSize: 8_192,
									downloadedEver: 2_048,
									uploadSpeed: 0,
									rateDownload: 0,
									downloadDir: "/downloads/paused",
								},
								{
									id: 5,
									name: "Queued verify release",
									status: 1,
									totalSize: 16_384,
									downloadedEver: 0,
									uploadSpeed: 0,
									rateDownload: 0,
								},
								{
									id: 6,
									name: "Verifying release",
									status: 2,
									totalSize: 32_768,
									downloadedEver: 1_024,
									uploadSpeed: 0,
									rateDownload: 0,
								},
								{
									id: 7,
									name: "Queued download release",
									status: 3,
									totalSize: 65_536,
									downloadedEver: 0,
									uploadSpeed: 0,
									rateDownload: 0,
								},
								{
									id: 8,
									name: "Error release",
									status: 7,
									totalSize: 1_024,
									downloadedEver: 512,
									uploadSpeed: 0,
									rateDownload: 0,
								},
								{
									id: 9,
									name: "Unknown status release",
									status: 99,
									totalSize: 2_048,
									downloadedEver: 256,
									uploadSpeed: 0,
									rateDownload: 0,
								},
							],
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
			const downloads = await transmissionProvider.getDownloads(
				transmissionConfig(port),
			);

			expect(downloads).toEqual([
				{
					id: "1",
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
					id: "2",
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
					id: "3",
					name: "Queued seed release",
					status: "completed",
					size: 2_048,
					downloaded: 2_048,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/done",
					isCompleted: true,
				},
				{
					id: "4",
					name: "Stopped release",
					status: "paused",
					size: 8_192,
					downloaded: 2_048,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/paused",
					isCompleted: false,
				},
				{
					id: "5",
					name: "Queued verify release",
					status: "queued",
					size: 16_384,
					downloaded: 0,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "6",
					name: "Verifying release",
					status: "queued",
					size: 32_768,
					downloaded: 1_024,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "7",
					name: "Queued download release",
					status: "queued",
					size: 65_536,
					downloaded: 0,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "8",
					name: "Error release",
					status: "failed",
					size: 1_024,
					downloaded: 512,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "9",
					name: "Unknown status release",
					status: "downloading",
					size: 2_048,
					downloaded: 256,
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

	it("returns an empty list when torrents array is missing", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(
				JSON.stringify({
					result: "success",
					arguments: {},
				}),
			);
		});

		try {
			const port = Number(server.baseUrl.split(":").pop());
			const downloads = await transmissionProvider.getDownloads(
				transmissionConfig(port),
			);
			expect(downloads).toEqual([]);
		} finally {
			await server.stop();
		}
	});

	it("handles missing fields in torrent entries gracefully", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);

			if (body.method === "torrent-get") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(
					JSON.stringify({
						result: "success",
						arguments: {
							torrents: [{}],
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
			const downloads = await transmissionProvider.getDownloads(
				transmissionConfig(port),
			);

			expect(downloads).toEqual([
				{
					id: "",
					name: "",
					status: "paused",
					size: 0,
					downloaded: 0,
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
});
