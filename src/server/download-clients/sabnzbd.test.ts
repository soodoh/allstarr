import { startHttpTestServer } from "src/server/__tests__/helpers/http-test-server";
import { afterEach, describe, expect, it, vi } from "vitest";
import sabnzbdProvider from "./sabnzbd";
import type { ConnectionConfig, DownloadRequest } from "./types";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("sabnzbd provider", () => {
	it("verifies the API key and reads the version", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/api");
			expect(request.search).toContain("mode=version");
			expect(request.search).toContain("apikey=test-sabnzbd-api-key");
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ version: "4.2.1" }));
		});

		try {
			const result = await sabnzbdProvider.testConnection({
				implementation: "SABnzbd",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: null,
				username: null,
				password: null,
				apiKey: "test-sabnzbd-api-key",
				category: null,
				tag: null,
				settings: null,
			});

			expect(result).toEqual({
				success: true,
				message: "Connected to SABnzbd successfully",
				version: "4.2.1",
			});
		} finally {
			await server.stop();
		}
	});

	it("reports SABnzbd API HTTP failures", async () => {
		const server = await startHttpTestServer((request, response) => {
			expect(request.pathname).toBe("/api");
			expect(request.search).toContain("mode=version");
			response.statusCode = 503;
			response.end("unavailable");
		});

		try {
			const result = await sabnzbdProvider.testConnection({
				implementation: "SABnzbd",
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
				message: "SABnzbd API error: HTTP 503",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports invalid SABnzbd version responses", async () => {
		const server = await startHttpTestServer((request, response) => {
			expect(request.pathname).toBe("/api");
			expect(request.search).toContain("mode=version");
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ status: true }));
		});

		try {
			const result = await sabnzbdProvider.testConnection({
				implementation: "SABnzbd",
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
				message: "Invalid API response — check API key and connection settings",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports non-Error SABnzbd failures as unknown errors", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue("boom");

		try {
			const result = await sabnzbdProvider.testConnection({
				implementation: "SABnzbd",
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

	it("rejects raw NZB uploads without a URL", async () => {
		const config: ConnectionConfig = {
			implementation: "SABnzbd",
			host: "127.0.0.1",
			port: 8080,
			useSsl: false,
			urlBase: null,
			username: null,
			password: null,
			apiKey: "test-sabnzbd-api-key",
			category: null,
			tag: null,
			settings: null,
		};
		const download: DownloadRequest = {
			url: null,
			torrentData: null,
			nzbData: Buffer.from("raw-nzb-data"),
			category: "books",
			tag: null,
			savePath: null,
		};

		await expect(sabnzbdProvider.addDownload(config, download)).rejects.toThrow(
			"SABnzbd provider requires a URL",
		);
	});

	it("uses the fallback category and returns an empty NZO id when SABnzbd omits it", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			const mode = new URLSearchParams(request.search).get("mode");
			if (mode === "addurl") {
				expect(request.search).toContain(
					"name=https%3A%2F%2Fexample.com%2Frelease.nzb",
				);
				expect(request.search).toContain("cat=fallback%20category");
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ nzo_ids: [] }));
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ status: true }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "SABnzbd",
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
				category: "fallback category",
				tag: null,
				savePath: null,
			};

			await expect(sabnzbdProvider.addDownload(config, download)).resolves.toBe(
				"",
			);
		} finally {
			await server.stop();
		}
	});

	it("omits the SABnzbd category when both sources are empty", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			const mode = new URLSearchParams(request.search).get("mode");
			if (mode === "addurl") {
				expect(request.search).toContain("cat=");
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ nzo_ids: [] }));
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ status: true }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "SABnzbd",
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

			await expect(sabnzbdProvider.addDownload(config, download)).resolves.toBe(
				"",
			);
		} finally {
			await server.stop();
		}
	});

	it("adds a download and parses queue plus history items", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			const mode = new URLSearchParams(request.search).get("mode");
			switch (mode) {
				case "addurl": {
					expect(request.search).toContain(
						"name=https%3A%2F%2Fexample.com%2Frelease.nzb",
					);
					expect(request.search).toContain("cat=usenet%20books");
					response.statusCode = 200;
					response.setHeader("Content-Type", "application/json");
					response.end(JSON.stringify({ nzo_ids: ["nzo-123"] }));
					return;
				}
				case "queue": {
					response.statusCode = 200;
					response.setHeader("Content-Type", "application/json");
					response.end(
						JSON.stringify({
							queue: {
								slots: [
									{
										nzo_id: "nzo-queue",
										filename: "Queued release",
										status: "Queued",
										mb: "6.0",
										mbleft: "3.5",
									},
								],
							},
						}),
					);
					return;
				}
				case "history": {
					response.statusCode = 200;
					response.setHeader("Content-Type", "application/json");
					response.end(
						JSON.stringify({
							history: {
								slots: [
									{
										nzo_id: "nzo-history",
										name: "Finished release",
										status: "Completed",
										bytes: 8_388_608,
										storage: "/downloads/finished",
									},
								],
							},
						}),
					);
					return;
				}
				default: {
					response.statusCode = 400;
					response.end("unexpected");
				}
			}
		});

		try {
			const config: ConnectionConfig = {
				implementation: "SABnzbd",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: null,
				username: null,
				password: null,
				apiKey: null,
				category: "usenet books",
				tag: null,
				settings: null,
			};
			const download: DownloadRequest = {
				url: "https://example.com/release.nzb",
				torrentData: null,
				nzbData: null,
				category: "books",
				tag: null,
				savePath: null,
			};

			await expect(sabnzbdProvider.addDownload(config, download)).resolves.toBe(
				"nzo-123",
			);

			const downloads = await sabnzbdProvider.getDownloads(config);
			expect(downloads).toEqual([
				{
					id: "nzo-queue",
					name: "Queued release",
					status: "queued",
					size: 6 * 1024 * 1024,
					downloaded: Math.round((6 - 3.5) * 1024 * 1024),
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "nzo-history",
					name: "Finished release",
					status: "completed",
					size: 8_388_608,
					downloaded: 8_388_608,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/finished",
					isCompleted: true,
				},
			]);
		} finally {
			await server.stop();
		}
	});

	it("parses SABnzbd queue status buckets and falls back for missing fields", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			const mode = new URLSearchParams(request.search).get("mode");
			switch (mode) {
				case "queue": {
					response.statusCode = 200;
					response.setHeader("Content-Type", "application/json");
					response.end(
						JSON.stringify({
							queue: {
								slots: [
									{
										nzo_id: "queue-downloading",
										filename: "Downloading release",
										status: "Downloading",
										mb: "5.0",
										mbleft: "4.0",
									},
									{
										nzo_id: "queue-fetching",
										filename: "Fetching release",
										status: "Fetching",
										mb: "4.0",
										mbleft: "2.5",
									},
									{
										nzo_id: "queue-grabbing",
										filename: "Grabbing release",
										status: "Grabbing",
										mb: "3.0",
										mbleft: "1.0",
									},
									{
										nzo_id: "queue-paused",
										filename: "Paused release",
										status: "Paused",
										mb: "2.0",
										mbleft: "0.5",
									},
									{
										nzo_id: "queue-queued",
										filename: "Queued release",
										status: "Queued",
										mb: "1.0",
										mbleft: "0.25",
									},
									{
										status: "Unexpected",
									},
									{
										nzo_id: "queue-missing-status",
										filename: "Missing status release",
										mb: "0",
										mbleft: "0",
									},
								],
							},
						}),
					);
					return;
				}
				case "history": {
					response.statusCode = 500;
					response.end("history unavailable");
					return;
				}
				default: {
					response.statusCode = 400;
					response.end("unexpected");
				}
			}
		});

		try {
			const config: ConnectionConfig = {
				implementation: "SABnzbd",
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

			await expect(sabnzbdProvider.getDownloads(config)).resolves.toEqual([
				{
					id: "queue-downloading",
					name: "Downloading release",
					status: "downloading",
					size: 5 * 1024 * 1024,
					downloaded: 1 * 1024 * 1024,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "queue-fetching",
					name: "Fetching release",
					status: "downloading",
					size: 4 * 1024 * 1024,
					downloaded: Math.round((4 - 2.5) * 1024 * 1024),
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "queue-grabbing",
					name: "Grabbing release",
					status: "downloading",
					size: 3 * 1024 * 1024,
					downloaded: 2 * 1024 * 1024,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "queue-paused",
					name: "Paused release",
					status: "paused",
					size: 2 * 1024 * 1024,
					downloaded: Math.round((2 - 0.5) * 1024 * 1024),
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "queue-queued",
					name: "Queued release",
					status: "queued",
					size: 1 * 1024 * 1024,
					downloaded: Math.round((1 - 0.25) * 1024 * 1024),
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
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
					category: null,
					outputPath: null,
					isCompleted: false,
				},
				{
					id: "queue-missing-status",
					name: "Missing status release",
					status: "downloading",
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

	it("parses SABnzbd history status branches when the filter is bypassed", async () => {
		const passthroughFilter = function (this: Array<unknown>) {
			return Array.from(this);
		} as typeof Array.prototype.filter;
		const filterSpy = vi
			.spyOn(Array.prototype, "filter")
			.mockImplementation(passthroughFilter);

		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			const mode = new URLSearchParams(request.search).get("mode");
			if (mode === "queue") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ queue: { slots: [] } }));
				return;
			}

			if (mode === "history") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(
					JSON.stringify({
						history: {
							slots: [
								{
									nzo_id: "hist-completed",
									name: "Completed release",
									status: "Completed",
									bytes: 123,
									storage: "/downloads/completed",
								},
								{
									nzo_id: "hist-failed",
									name: "Failed release",
									status: "Failed",
									bytes: 456,
									storage: "/downloads/failed",
								},
								{
									nzo_id: "hist-other",
									name: "Other release",
									status: "SomethingElse",
									bytes: 789,
									storage: "/downloads/other",
								},
								{
									status: "Completed",
								},
								{
									nzo_id: "hist-empty-status",
									name: "Empty status release",
								},
							],
						},
					}),
				);
				return;
			}

			response.statusCode = 400;
			response.end("unexpected");
		});

		try {
			const config: ConnectionConfig = {
				implementation: "SABnzbd",
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

			await expect(sabnzbdProvider.getDownloads(config)).resolves.toEqual([
				{
					id: "hist-completed",
					name: "Completed release",
					status: "completed",
					size: 123,
					downloaded: 123,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/completed",
					isCompleted: true,
				},
				{
					id: "hist-failed",
					name: "Failed release",
					status: "failed",
					size: 456,
					downloaded: 456,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/failed",
					isCompleted: true,
				},
				{
					id: "hist-other",
					name: "Other release",
					status: "completed",
					size: 789,
					downloaded: 789,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/other",
					isCompleted: true,
				},
				{
					id: "",
					name: "",
					status: "completed",
					size: 0,
					downloaded: 0,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: true,
				},
				{
					id: "hist-empty-status",
					name: "Empty status release",
					status: "completed",
					size: 0,
					downloaded: 0,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: null,
					isCompleted: true,
				},
			]);
		} finally {
			filterSpy.mockRestore();
			await server.stop();
		}
	});

	it("returns an empty SABnzbd download list when queue and history payloads are missing", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			const mode = new URLSearchParams(request.search).get("mode");
			if (mode === "queue" || mode === "history") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({}));
				return;
			}

			response.statusCode = 400;
			response.end("unexpected");
		});

		try {
			const config: ConnectionConfig = {
				implementation: "SABnzbd",
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

			await expect(sabnzbdProvider.getDownloads(config)).resolves.toEqual([]);
		} finally {
			await server.stop();
		}
	});

	it("surfaces add-download HTTP failures", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			const mode = new URLSearchParams(request.search).get("mode");
			if (mode === "addurl") {
				response.statusCode = 500;
				response.end("boom");
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ status: true }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "SABnzbd",
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
				category: "books",
				tag: null,
				savePath: null,
			};

			await expect(
				sabnzbdProvider.addDownload(config, download),
			).rejects.toThrow("SABnzbd add error: HTTP 500");
			expect(server.requests).toHaveLength(1);
		} finally {
			await server.stop();
		}
	});

	it("removes SABnzbd items from whichever endpoint succeeds", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			const mode = new URLSearchParams(request.search).get("mode");
			const name = new URLSearchParams(request.search).get("name");
			if (mode === "queue" && name === "delete") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ status: true }));
				return;
			}

			if (mode === "history" && name === "delete") {
				response.statusCode = 500;
				response.end("history delete failed");
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ status: true }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "SABnzbd",
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
				sabnzbdProvider.removeDownload(config, "nzo-abc", false),
			).resolves.toBeUndefined();
			expect(
				server.requests.some(
					(request) =>
						request.search.includes("mode=queue") &&
						request.search.includes("name=delete") &&
						!request.search.includes("del_files=1"),
				),
			).toBe(true);
		} finally {
			await server.stop();
		}
	});

	it("removes SABnzbd items when the queue delete fails but history delete succeeds", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			const mode = new URLSearchParams(request.search).get("mode");
			const name = new URLSearchParams(request.search).get("name");
			if (mode === "queue" && name === "delete") {
				response.statusCode = 500;
				response.end("queue delete failed");
				return;
			}

			if (mode === "history" && name === "delete") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ status: true }));
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ status: true }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "SABnzbd",
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
				sabnzbdProvider.removeDownload(config, "nzo-abc", true),
			).resolves.toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	it("surfaces SABnzbd delete failures when both endpoints fail", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			const mode = new URLSearchParams(request.search).get("mode");
			if (mode === "queue" || mode === "history") {
				response.statusCode = 500;
				response.end("boom");
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ status: true }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "SABnzbd",
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
				sabnzbdProvider.removeDownload(config, "nzo-abc", true),
			).rejects.toThrow("SABnzbd delete error: HTTP 500");
		} finally {
			await server.stop();
		}
	});

	it("surfaces SABnzbd pause, resume, priority, and queue errors", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			const mode = new URLSearchParams(request.search).get("mode");
			const name = new URLSearchParams(request.search).get("name");
			if (
				(mode === "queue" &&
					(name === "pause" || name === "resume" || name === "priority")) ||
				mode === "queue"
			) {
				response.statusCode = 500;
				response.end("boom");
				return;
			}

			if (mode === "history") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ history: { slots: [] } }));
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ status: true }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "SABnzbd",
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
				sabnzbdProvider.pauseDownload(config, "nzo-abc"),
			).rejects.toThrow("SABnzbd pause error: HTTP 500");
			await expect(
				sabnzbdProvider.resumeDownload(config, "nzo-abc"),
			).rejects.toThrow("SABnzbd resume error: HTTP 500");
			await expect(
				sabnzbdProvider.setPriority(config, "nzo-abc", 1),
			).rejects.toThrow("SABnzbd priority error: HTTP 500");
			await expect(
				sabnzbdProvider.setPriority(config, "nzo-abc", 0),
			).rejects.toThrow("SABnzbd priority error: HTTP 500");
			await expect(sabnzbdProvider.getDownloads(config)).rejects.toThrow(
				"SABnzbd queue error: HTTP 500",
			);
		} finally {
			await server.stop();
		}
	});

	it("maps queue actions to the expected endpoints", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			if (request.pathname !== "/api") {
				response.statusCode = 404;
				response.end("not found");
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ status: true }));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "SABnzbd",
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

			await sabnzbdProvider.removeDownload(config, "nzo-abc", true);
			await sabnzbdProvider.pauseDownload?.(config, "nzo-abc");
			await sabnzbdProvider.resumeDownload?.(config, "nzo-abc");
			await sabnzbdProvider.setPriority?.(config, "nzo-abc", 1);
			await sabnzbdProvider.setPriority?.(config, "nzo-abc", 0);

			expect(
				server.requests.filter((request) =>
					request.search.includes("name=delete"),
				),
			).toHaveLength(2);
			expect(
				server.requests.some(
					(request) =>
						request.search.includes("name=priority") &&
						request.search.includes("value2=1"),
				),
			).toBe(true);
			expect(
				server.requests.some(
					(request) =>
						request.search.includes("name=priority") &&
						request.search.includes("value2=-1"),
				),
			).toBe(true);
		} finally {
			await server.stop();
		}
	});
});
