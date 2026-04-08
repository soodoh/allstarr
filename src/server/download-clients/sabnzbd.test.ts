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
				apiKey: "test-sabnzbd-api-key",
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
				apiKey: "test-sabnzbd-api-key",
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
				apiKey: "test-sabnzbd-api-key",
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
