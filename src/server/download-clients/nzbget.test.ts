import { startHttpTestServer } from "src/server/__tests__/helpers/http-test-server";
import { afterEach, describe, expect, it, vi } from "vitest";
import nzbgetProvider from "./nzbget";
import type { ConnectionConfig, DownloadRequest } from "./types";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("nzbget provider", () => {
	it("connects and reads the version", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/jsonrpc");
			expect(request.method).toBe("POST");
			const body = JSON.parse(request.body);
			expect(body.method).toBe("version");
			expect(body.params).toEqual([]);
			expect(request.headers.authorization).toBe(
				`Basic ${Buffer.from("nzbget:tegbzn6789").toString("base64")}`,
			);
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: "21.1" }));
		});

		try {
			const result = await nzbgetProvider.testConnection({
				implementation: "NZBGet",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: null,
				username: "nzbget",
				password: "tegbzn6789",
				apiKey: null,
				category: null,
				tag: null,
				settings: null,
			});

			expect(result).toEqual({
				success: true,
				message: "Connected to NZBGet successfully",
				version: "21.1",
			});
		} finally {
			await server.stop();
		}
	});

	it("omits the authorization header when no credentials are set", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.headers.authorization).toBeUndefined();
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: "21.1" }));
		});

		try {
			const result = await nzbgetProvider.testConnection({
				implementation: "NZBGet",
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
			});

			expect(result.success).toBe(true);
		} finally {
			await server.stop();
		}
	});

	it("returns an empty version when the result is null", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: null }));
		});

		try {
			const result = await nzbgetProvider.testConnection({
				implementation: "NZBGet",
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
			});

			expect(result).toEqual({
				success: true,
				message: "Connected to NZBGet successfully",
				version: "",
			});
		} finally {
			await server.stop();
		}
	});

	it("reports HTTP failures from the NZBGet RPC endpoint", async () => {
		const server = await startHttpTestServer((request, response) => {
			response.statusCode = 503;
			response.end("unavailable");
		});

		try {
			const result = await nzbgetProvider.testConnection({
				implementation: "NZBGet",
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
			});

			expect(result).toEqual({
				success: false,
				message: "NZBGet RPC error: HTTP 503",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports NZBGet JSON-RPC error responses", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ error: { message: "Auth failed" } }));
		});

		try {
			const result = await nzbgetProvider.testConnection({
				implementation: "NZBGet",
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
			});

			expect(result).toEqual({
				success: false,
				message: "Auth failed",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports NZBGet JSON-RPC error responses without a message", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ error: {} }));
		});

		try {
			const result = await nzbgetProvider.testConnection({
				implementation: "NZBGet",
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
			});

			expect(result).toEqual({
				success: false,
				message: "NZBGet RPC error",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports non-Error failures as unknown errors", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue("boom");

		try {
			const result = await nzbgetProvider.testConnection({
				implementation: "NZBGet",
				host: "127.0.0.1",
				port: 6789,
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

	it("rejects addDownload when neither URL nor NZB data is provided", async () => {
		const config: ConnectionConfig = {
			implementation: "NZBGet",
			host: "127.0.0.1",
			port: 6789,
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
			torrentData: null,
			nzbData: null,
			category: null,
			tag: null,
			savePath: null,
		};

		await expect(nzbgetProvider.addDownload(config, download)).rejects.toThrow(
			"NZBGet provider requires a URL or NZB data",
		);
	});

	it("adds a download via URL and uses the config category", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/jsonrpc");
			const body = JSON.parse(request.body);
			expect(body.method).toBe("append");
			expect(body.params[0]).toBe("download.nzb");
			expect(body.params[1]).toBe("https://example.com/release.nzb");
			expect(body.params[2]).toBe("usenet-config-cat");
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: 12345 }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: null,
				username: null,
				password: null,
				apiKey: null,
				category: "usenet-config-cat",
				tag: null,
				settings: null,
			};
			const download: DownloadRequest = {
				url: "https://example.com/release.nzb",
				torrentData: null,
				nzbData: null,
				category: "fallback-cat",
				tag: null,
				savePath: null,
			};

			await expect(nzbgetProvider.addDownload(config, download)).resolves.toBe(
				"12345",
			);
		} finally {
			await server.stop();
		}
	});

	it("adds a download via base64-encoded NZB data and falls back to the download category", async () => {
		const nzbContent = Buffer.from("<nzb>test</nzb>");
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);
			expect(body.method).toBe("append");
			expect(body.params[1]).toBe(nzbContent.toString("base64"));
			expect(body.params[2]).toBe("fallback-cat");
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: 67890 }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
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
				torrentData: null,
				nzbData: nzbContent,
				category: "fallback-cat",
				tag: null,
				savePath: null,
			};

			await expect(nzbgetProvider.addDownload(config, download)).resolves.toBe(
				"67890",
			);
		} finally {
			await server.stop();
		}
	});

	it("returns an empty string when addDownload result is null", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: null }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
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
				url: "https://example.com/release.nzb",
				torrentData: null,
				nzbData: null,
				category: null,
				tag: null,
				savePath: null,
			};

			await expect(nzbgetProvider.addDownload(config, download)).resolves.toBe(
				"",
			);
		} finally {
			await server.stop();
		}
	});

	it("removes a download via editqueue GroupDelete", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);
			expect(body.method).toBe("editqueue");
			expect(body.params).toEqual(["GroupDelete", "", [42]]);
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: true }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: null,
				username: "nzbget",
				password: "tegbzn6789",
				apiKey: null,
				category: null,
				tag: null,
				settings: null,
			};

			await expect(
				nzbgetProvider.removeDownload(config, "42", true),
			).resolves.toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	it("pauses a download via editqueue GroupPause", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);
			expect(body.method).toBe("editqueue");
			expect(body.params).toEqual(["GroupPause", "", [99]]);
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: true }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
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

			if (!nzbgetProvider.pauseDownload) {
				throw new Error("NZBGet provider missing pauseDownload");
			}
			await expect(
				nzbgetProvider.pauseDownload(config, "99"),
			).resolves.toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	it("resumes a download via editqueue GroupResume", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);
			expect(body.method).toBe("editqueue");
			expect(body.params).toEqual(["GroupResume", "", [99]]);
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: true }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
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

			if (!nzbgetProvider.resumeDownload) {
				throw new Error("NZBGet provider missing resumeDownload");
			}
			await expect(
				nzbgetProvider.resumeDownload(config, "99"),
			).resolves.toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	it("sets priority to 50 for positive values and -50 for zero or negative", async () => {
		const calls: Array<{ method: string; params: unknown[] }> = [];
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);
			calls.push({ method: body.method, params: body.params });
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: true }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
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

			if (!nzbgetProvider.setPriority) {
				throw new Error("NZBGet provider missing setPriority");
			}
			await nzbgetProvider.setPriority(config, "10", 1);
			await nzbgetProvider.setPriority(config, "10", 0);
			await nzbgetProvider.setPriority(config, "10", -1);

			expect(calls).toHaveLength(3);
			expect(calls[0]).toEqual({
				method: "editqueue",
				params: ["GroupSetPriority", "50", [10]],
			});
			expect(calls[1]).toEqual({
				method: "editqueue",
				params: ["GroupSetPriority", "-50", [10]],
			});
			expect(calls[2]).toEqual({
				method: "editqueue",
				params: ["GroupSetPriority", "-50", [10]],
			});
		} finally {
			await server.stop();
		}
	});

	it("fetches active and history downloads and maps them correctly", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");

			if (body.method === "listgroups") {
				response.end(
					JSON.stringify({
						result: [
							{
								NZBID: 101,
								NZBName: "Downloading Item",
								Status: "DOWNLOADING",
								FileSizeMB: 100,
								DownloadedSizeMB: 50,
								DownloadRateKB: 1024,
								DestDir: "/downloads/active",
							},
							{
								NZBID: 102,
								NZBName: "Paused Item",
								Status: "PAUSED",
								FileSizeMB: 200,
								DownloadedSizeMB: 10,
								DownloadRateKB: 0,
								DestDir: "/downloads/paused",
							},
							{
								NZBID: 103,
								NZBName: "Queued Item",
								Status: "QUEUED",
								FileSizeMB: 50,
								DownloadedSizeMB: 0,
								DownloadRateKB: 0,
							},
						],
					}),
				);
				return;
			}

			if (body.method === "history") {
				response.end(
					JSON.stringify({
						result: [
							{
								NZBID: 201,
								NZBName: "Completed Item",
								Status: "SUCCESS",
								FileSizeMB: 300,
								DestDir: "/downloads/completed",
							},
							{
								NZBID: 202,
								NZBName: "Failed Item",
								Status: "FAILURE",
								FileSizeMB: 150,
								DestDir: "/downloads/failed",
							},
						],
					}),
				);
				return;
			}

			response.end(JSON.stringify({ result: null }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
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

			const downloads = await nzbgetProvider.getDownloads(config);
			expect(downloads).toEqual([
				{
					id: "101",
					name: "Downloading Item",
					status: "downloading",
					size: Math.round(100 * 1024 * 1024),
					downloaded: Math.round(50 * 1024 * 1024),
					uploadSpeed: 0,
					downloadSpeed: 1024 * 1024,
					category: null,
					outputPath: "/downloads/active",
					isCompleted: false,
				},
				{
					id: "102",
					name: "Paused Item",
					status: "paused",
					size: Math.round(200 * 1024 * 1024),
					downloaded: Math.round(10 * 1024 * 1024),
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/paused",
					isCompleted: false,
				},
				{
					id: "103",
					name: "Queued Item",
					status: "queued",
					size: Math.round(50 * 1024 * 1024),
					downloaded: 0,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "201",
					name: "Completed Item",
					status: "completed",
					size: Math.round(300 * 1024 * 1024),
					downloaded: Math.round(300 * 1024 * 1024),
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/completed",
					isCompleted: true,
				},
				{
					id: "202",
					name: "Failed Item",
					status: "failed",
					size: Math.round(150 * 1024 * 1024),
					downloaded: Math.round(150 * 1024 * 1024),
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/failed",
					isCompleted: false,
				},
			]);
		} finally {
			await server.stop();
		}
	});

	it("maps all active status variants correctly", async () => {
		const statuses = [
			"DOWNLOADING",
			"POSTPROCESSING",
			"UNPACKING",
			"MOVING",
			"RENAMING",
			"PAUSED",
			"PAUSING",
			"QUEUED",
			"SOME_UNKNOWN_STATUS",
		];
		const expectedMappings = [
			"downloading",
			"downloading",
			"downloading",
			"downloading",
			"downloading",
			"paused",
			"paused",
			"queued",
			"downloading",
		];

		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");

			if (body.method === "listgroups") {
				const groups = statuses.map((status, i) => ({
					NZBID: i + 1,
					NZBName: `Item ${status}`,
					Status: status,
					FileSizeMB: 1,
					DownloadedSizeMB: 0,
					DownloadRateKB: 0,
				}));
				response.end(JSON.stringify({ result: groups }));
				return;
			}

			if (body.method === "history") {
				response.end(JSON.stringify({ result: [] }));
				return;
			}

			response.end(JSON.stringify({ result: null }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
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

			const downloads = await nzbgetProvider.getDownloads(config);
			expect(downloads).toHaveLength(statuses.length);
			for (let i = 0; i < statuses.length; i++) {
				expect(downloads[i]?.status).toBe(expectedMappings[i]);
			}
		} finally {
			await server.stop();
		}
	});

	it("maps history statuses: SUCCESS to completed and anything else to failed", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");

			if (body.method === "listgroups") {
				response.end(JSON.stringify({ result: [] }));
				return;
			}

			if (body.method === "history") {
				response.end(
					JSON.stringify({
						result: [
							{
								NZBID: 1,
								NZBName: "Success",
								Status: "SUCCESS",
								FileSizeMB: 1,
							},
							{
								NZBID: 2,
								NZBName: "Failure",
								Status: "FAILURE",
								FileSizeMB: 1,
							},
							{
								NZBID: 3,
								NZBName: "Deleted",
								Status: "DELETED",
								FileSizeMB: 1,
							},
						],
					}),
				);
				return;
			}

			response.end(JSON.stringify({ result: null }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
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

			const downloads = await nzbgetProvider.getDownloads(config);
			expect(downloads).toHaveLength(3);
			expect(downloads[0]?.status).toBe("completed");
			expect(downloads[0]?.isCompleted).toBe(true);
			expect(downloads[1]?.status).toBe("failed");
			expect(downloads[1]?.isCompleted).toBe(false);
			expect(downloads[2]?.status).toBe("failed");
			expect(downloads[2]?.isCompleted).toBe(false);
		} finally {
			await server.stop();
		}
	});

	it("returns an empty list when both active and history results are undefined", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: undefined }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
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

			await expect(nzbgetProvider.getDownloads(config)).resolves.toEqual([]);
		} finally {
			await server.stop();
		}
	});

	it("handles missing fields in active and history items gracefully", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			const body = JSON.parse(request.body);
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");

			if (body.method === "listgroups") {
				response.end(JSON.stringify({ result: [{}] }));
				return;
			}

			if (body.method === "history") {
				response.end(JSON.stringify({ result: [{}] }));
				return;
			}

			response.end(JSON.stringify({ result: null }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
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

			const downloads = await nzbgetProvider.getDownloads(config);
			expect(downloads).toHaveLength(2);
			expect(downloads[0]).toEqual({
				id: "",
				name: "",
				status: "downloading",
				size: 0,
				downloaded: 0,
				uploadSpeed: 0,
				downloadSpeed: 0,
				category: null,
				outputPath: null,
				isCompleted: false,
			});
			expect(downloads[1]).toEqual({
				id: "",
				name: "",
				status: "failed",
				size: 0,
				downloaded: 0,
				uploadSpeed: 0,
				downloadSpeed: 0,
				category: null,
				outputPath: null,
				isCompleted: false,
			});
		} finally {
			await server.stop();
		}
	});

	it("respects the urlBase configuration", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/nzbget/jsonrpc");
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ result: "21.1" }));
		});

		try {
			const result = await nzbgetProvider.testConnection({
				implementation: "NZBGet",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: "/nzbget",
				username: null,
				password: null,
				apiKey: null,
				category: null,
				tag: null,
				settings: null,
			});

			expect(result.success).toBe(true);
		} finally {
			await server.stop();
		}
	});

	it("surfaces editqueue HTTP failures", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			response.statusCode = 500;
			response.end("boom");
		});

		try {
			const config: ConnectionConfig = {
				implementation: "NZBGet",
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

			await expect(
				nzbgetProvider.removeDownload(config, "1", false),
			).rejects.toThrow("NZBGet RPC error: HTTP 500");
			await expect(nzbgetProvider.pauseDownload?.(config, "1")).rejects.toThrow(
				"NZBGet RPC error: HTTP 500",
			);
			await expect(
				nzbgetProvider.resumeDownload?.(config, "1"),
			).rejects.toThrow("NZBGet RPC error: HTTP 500");
			await expect(
				nzbgetProvider.setPriority?.(config, "1", 1),
			).rejects.toThrow("NZBGet RPC error: HTTP 500");
		} finally {
			await server.stop();
		}
	});
});
