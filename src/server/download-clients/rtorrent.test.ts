import { startHttpTestServer } from "src/server/__tests__/helpers/http-test-server";
import { afterEach, describe, expect, it, vi } from "vitest";
import rtorrentProvider from "./rtorrent";
import type { ConnectionConfig, DownloadRequest } from "./types";

afterEach(() => {
	vi.restoreAllMocks();
});

function xmlRpcSuccess(value: string): string {
	return `<?xml version="1.0"?>
<methodResponse>
  <params><param><value>${value}</value></param></params>
</methodResponse>`;
}

function xmlRpcFault(code: number, message: string): string {
	return `<?xml version="1.0"?>
<methodResponse>
  <fault>
    <value><struct>
      <member><name>faultCode</name><value><int>${code}</int></value></member>
      <member><name>faultString</name><value><string>${message}</string></value></member>
    </struct></value>
  </fault>
</methodResponse>`;
}

describe("rtorrent provider", () => {
	it("connects and reads the client version", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.method).toBe("POST");
			expect(request.headers["content-type"]).toBe("text/xml");
			expect(request.body).toContain(
				"<methodName>system.client_version</methodName>",
			);
			expect(request.headers.authorization).toBe(
				`Basic ${Buffer.from("admin:secret").toString("base64")}`,
			);
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<string>0.9.8</string>"));
		});

		try {
			const result = await rtorrentProvider.testConnection({
				implementation: "rTorrent",
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
				message: "Connected to rTorrent successfully",
				version: "0.9.8",
			});
		} finally {
			await server.stop();
		}
	});

	it("omits the authorization header when no credentials are set", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.headers.authorization).toBeUndefined();
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<string>0.9.8</string>"));
		});

		try {
			const result = await rtorrentProvider.testConnection({
				implementation: "rTorrent",
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

	it("returns null version when the response has no string tag", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<int>1</int>"));
		});

		try {
			const result = await rtorrentProvider.testConnection({
				implementation: "rTorrent",
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
				message: "Connected to rTorrent successfully",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports a fault response from testConnection", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcFault(-501, "Unknown method"));
		});

		try {
			const result = await rtorrentProvider.testConnection({
				implementation: "rTorrent",
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
				message: "rTorrent RPC returned a fault response",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports HTTP failures from the XML-RPC endpoint", async () => {
		const server = await startHttpTestServer((_request, response) => {
			response.statusCode = 503;
			response.end("unavailable");
		});

		try {
			const result = await rtorrentProvider.testConnection({
				implementation: "rTorrent",
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
				message: "rTorrent XML-RPC error: HTTP 503",
				version: null,
			});
		} finally {
			await server.stop();
		}
	});

	it("reports non-Error failures as unknown errors", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue("boom");

		try {
			const result = await rtorrentProvider.testConnection({
				implementation: "rTorrent",
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

	it("adds a download via URL using load.start", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.body).toContain("<methodName>load.start</methodName>");
			expect(request.body).toContain(
				"<string>https://example.com/release.torrent</string>",
			);
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<int>0</int>"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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
				url: "https://example.com/release.torrent",
				torrentData: null,
				nzbData: null,
				category: null,
				tag: null,
				savePath: null,
			};

			await expect(
				rtorrentProvider.addDownload(config, download),
			).resolves.toBe("https://example.com/release.torrent");
		} finally {
			await server.stop();
		}
	});

	it("adds a download via raw torrent data using load.raw_start", async () => {
		const torrentData = Buffer.from("torrent-binary-data");
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.body).toContain("<methodName>load.raw_start</methodName>");
			expect(request.body).toContain(
				`<base64>${torrentData.toString("base64")}</base64>`,
			);
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<int>0</int>"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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
				torrentData,
				nzbData: null,
				category: null,
				tag: null,
				savePath: null,
			};

			await expect(
				rtorrentProvider.addDownload(config, download),
			).resolves.toBe("raw_start");
		} finally {
			await server.stop();
		}
	});

	it("rejects addDownload when neither URL nor torrent data is provided", async () => {
		const config: ConnectionConfig = {
			implementation: "rTorrent",
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
		};
		const download: DownloadRequest = {
			url: null,
			torrentData: null,
			nzbData: null,
			category: null,
			tag: null,
			savePath: null,
		};

		await expect(
			rtorrentProvider.addDownload(config, download),
		).rejects.toThrow("No URL or torrent data provided");
	});

	it("removes a download via d.erase", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.body).toContain("<methodName>d.erase</methodName>");
			expect(request.body).toContain("<string>ABC123HASH</string>");
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<int>0</int>"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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
				rtorrentProvider.removeDownload(config, "ABC123HASH", true),
			).resolves.toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	it("throws when removeDownload returns a fault", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcFault(-501, "Could not find info-hash"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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
				rtorrentProvider.removeDownload(config, "ABC123HASH", false),
			).rejects.toThrow("rTorrent failed to remove torrent");
		} finally {
			await server.stop();
		}
	});

	it("pauses a download via d.pause", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.body).toContain("<methodName>d.pause</methodName>");
			expect(request.body).toContain("<string>ABC123HASH</string>");
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<int>0</int>"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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

			if (!rtorrentProvider.pauseDownload) {
				throw new Error("rTorrent provider missing pauseDownload");
			}
			await expect(
				rtorrentProvider.pauseDownload(config, "ABC123HASH"),
			).resolves.toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	it("throws when pauseDownload returns a fault", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcFault(-501, "Could not find info-hash"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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
				rtorrentProvider.pauseDownload?.(config, "ABC123HASH"),
			).rejects.toThrow("rTorrent failed to pause torrent");
		} finally {
			await server.stop();
		}
	});

	it("resumes a download via d.resume", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.body).toContain("<methodName>d.resume</methodName>");
			expect(request.body).toContain("<string>ABC123HASH</string>");
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<int>0</int>"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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

			if (!rtorrentProvider.resumeDownload) {
				throw new Error("rTorrent provider missing resumeDownload");
			}
			await expect(
				rtorrentProvider.resumeDownload(config, "ABC123HASH"),
			).resolves.toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	it("throws when resumeDownload returns a fault", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcFault(-501, "Could not find info-hash"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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
				rtorrentProvider.resumeDownload?.(config, "ABC123HASH"),
			).rejects.toThrow("rTorrent failed to resume torrent");
		} finally {
			await server.stop();
		}
	});

	it("sets priority to 3 for positive values and 1 for zero or negative", async () => {
		const bodies: string[] = [];
		const server = await startHttpTestServer(async (request, response) => {
			bodies.push(request.body);
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<int>0</int>"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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

			if (!rtorrentProvider.setPriority) {
				throw new Error("rTorrent provider missing setPriority");
			}
			await rtorrentProvider.setPriority(config, "ABC123HASH", 1);
			await rtorrentProvider.setPriority(config, "ABC123HASH", 0);
			await rtorrentProvider.setPriority(config, "ABC123HASH", -1);

			expect(bodies).toHaveLength(3);
			expect(bodies[0]).toContain("<methodName>d.priority.set</methodName>");
			expect(bodies[0]).toContain("<int>3</int>");
			expect(bodies[1]).toContain("<int>1</int>");
			expect(bodies[2]).toContain("<int>1</int>");
		} finally {
			await server.stop();
		}
	});

	it("throws when setPriority returns a fault", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcFault(-501, "Could not find info-hash"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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
				rtorrentProvider.setPriority?.(config, "ABC123HASH", 1),
			).rejects.toThrow("rTorrent failed to set torrent priority");
		} finally {
			await server.stop();
		}
	});

	it("fetches downloads via d.multicall2 and maps them correctly", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.body).toContain("<methodName>d.multicall2</methodName>");
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			// Simulate XML-RPC array-of-arrays response
			// Each inner <data> is one torrent row:
			// strings: [hash, name, directory], i8: [state, size, downloaded, upRate, downRate, complete, hashing]
			response.end(`<?xml version="1.0"?>
<methodResponse>
  <params><param><value><array><data>
    <value><array><data>
      <value><string>AAAA1111</string></value>
      <value><string>Downloading Torrent</string></value>
      <value><i8>1</i8></value>
      <value><i8>5242880</i8></value>
      <value><i8>1048576</i8></value>
      <value><i8>128</i8></value>
      <value><i8>256</i8></value>
      <value><string>/downloads/active</string></value>
      <value><i8>0</i8></value>
      <value><i8>0</i8></value>
    </data></value></array>
    <value><array><data>
      <value><string>BBBB2222</string></value>
      <value><string>Completed Torrent</string></value>
      <value><i8>1</i8></value>
      <value><i8>2097152</i8></value>
      <value><i8>2097152</i8></value>
      <value><i8>512</i8></value>
      <value><i8>0</i8></value>
      <value><string>/downloads/completed</string></value>
      <value><i8>1</i8></value>
      <value><i8>0</i8></value>
    </data></value></array>
    <value><array><data>
      <value><string>CCCC3333</string></value>
      <value><string>Paused Torrent</string></value>
      <value><i8>0</i8></value>
      <value><i8>4194304</i8></value>
      <value><i8>524288</i8></value>
      <value><i8>0</i8></value>
      <value><i8>0</i8></value>
      <value><string>/downloads/paused</string></value>
      <value><i8>0</i8></value>
      <value><i8>0</i8></value>
    </data></value></array>
    <value><array><data>
      <value><string>DDDD4444</string></value>
      <value><string>Hashing Torrent</string></value>
      <value><i8>0</i8></value>
      <value><i8>3145728</i8></value>
      <value><i8>0</i8></value>
      <value><i8>0</i8></value>
      <value><i8>0</i8></value>
      <value><string>/downloads/hashing</string></value>
      <value><i8>0</i8></value>
      <value><i8>1</i8></value>
    </data></value></array>
  </data></array></value></param></params>
</methodResponse>`);
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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

			const downloads = await rtorrentProvider.getDownloads(config);
			expect(downloads).toEqual([
				{
					id: "AAAA1111",
					name: "Downloading Torrent",
					status: "downloading",
					size: 5242880,
					downloaded: 1048576,
					uploadSpeed: 128,
					downloadSpeed: 256,
					category: null,
					outputPath: "/downloads/active",
					isCompleted: false,
				},
				{
					id: "BBBB2222",
					name: "Completed Torrent",
					status: "completed",
					size: 2097152,
					downloaded: 2097152,
					uploadSpeed: 512,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/completed",
					isCompleted: true,
				},
				{
					id: "CCCC3333",
					name: "Paused Torrent",
					status: "paused",
					size: 4194304,
					downloaded: 524288,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/paused",
					isCompleted: false,
				},
				{
					id: "DDDD4444",
					name: "Hashing Torrent",
					status: "queued",
					size: 3145728,
					downloaded: 0,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/hashing",
					isCompleted: false,
				},
			]);
		} finally {
			await server.stop();
		}
	});

	it("returns an empty list when the response has no data elements", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<array><data></data></array>"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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

			await expect(rtorrentProvider.getDownloads(config)).resolves.toEqual([]);
		} finally {
			await server.stop();
		}
	});

	it("skips rows with fewer than 2 string values", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			// Row with only 1 string — should be skipped
			response.end(`<?xml version="1.0"?>
<methodResponse>
  <params><param><value><array><data>
    <value><array><data>
      <value><string>ONLYHASH</string></value>
      <value><i8>1</i8></value>
      <value><i8>100</i8></value>
    </data></value></array>
  </data></array></value></param></params>
</methodResponse>`);
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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

			await expect(rtorrentProvider.getDownloads(config)).resolves.toEqual([]);
		} finally {
			await server.stop();
		}
	});

	it("encodes XML-RPC values correctly: strings escape special characters", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.body).toContain(
				"<string>test &amp; &lt;value&gt;</string>",
			);
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<int>0</int>"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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

			// Use d.erase with a hash containing special characters to verify encoding
			await expect(
				rtorrentProvider.removeDownload(config, "test & <value>", false),
			).resolves.toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	it("encodes integer and boolean XML-RPC values in the request body", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			// setPriority sends [id, rtPriority] — rtPriority is an integer
			expect(request.body).toContain("<string>HASH123</string>");
			expect(request.body).toContain("<int>3</int>");
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<int>0</int>"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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

			await rtorrentProvider.setPriority?.(config, "HASH123", 1);
		} finally {
			await server.stop();
		}
	});

	it("respects the urlBase configuration", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.pathname).toBe("/rtorrent/RPC2");
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<string>0.9.8</string>"));
		});

		try {
			const result = await rtorrentProvider.testConnection({
				implementation: "rTorrent",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: "/rtorrent/RPC2",
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

	it("surfaces HTTP failures from action methods", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 500;
			response.end("boom");
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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
				rtorrentProvider.removeDownload(config, "HASH", false),
			).rejects.toThrow("rTorrent XML-RPC error: HTTP 500");
			await expect(
				rtorrentProvider.pauseDownload?.(config, "HASH"),
			).rejects.toThrow("rTorrent XML-RPC error: HTTP 500");
			await expect(
				rtorrentProvider.resumeDownload?.(config, "HASH"),
			).rejects.toThrow("rTorrent XML-RPC error: HTTP 500");
			await expect(
				rtorrentProvider.setPriority?.(config, "HASH", 1),
			).rejects.toThrow("rTorrent XML-RPC error: HTTP 500");
			await expect(rtorrentProvider.getDownloads(config)).rejects.toThrow(
				"rTorrent XML-RPC error: HTTP 500",
			);
		} finally {
			await server.stop();
		}
	});

	it("sends the correct d.multicall2 parameters", async () => {
		const server = await startHttpTestServer(async (request, response) => {
			expect(request.body).toContain("<methodName>d.multicall2</methodName>");
			expect(request.body).toContain("<string></string>");
			expect(request.body).toContain("<string>main</string>");
			expect(request.body).toContain("<string>d.hash=</string>");
			expect(request.body).toContain("<string>d.name=</string>");
			expect(request.body).toContain("<string>d.state=</string>");
			expect(request.body).toContain("<string>d.size_bytes=</string>");
			expect(request.body).toContain("<string>d.completed_bytes=</string>");
			expect(request.body).toContain("<string>d.up.rate=</string>");
			expect(request.body).toContain("<string>d.down.rate=</string>");
			expect(request.body).toContain("<string>d.directory=</string>");
			expect(request.body).toContain("<string>d.complete=</string>");
			expect(request.body).toContain("<string>d.hashing=</string>");
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			response.end(xmlRpcSuccess("<array><data></data></array>"));
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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

			await rtorrentProvider.getDownloads(config);
		} finally {
			await server.stop();
		}
	});

	it("handles missing integer fields in multicall rows gracefully", async () => {
		const server = await startHttpTestServer(async (_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/xml");
			// Row with 2 strings but no i8 values
			response.end(`<?xml version="1.0"?>
<methodResponse>
  <params><param><value><array><data>
    <value><array><data>
      <value><string>HASH1</string></value>
      <value><string>No Ints Torrent</string></value>
      <value><string>/downloads/noint</string></value>
    </data></value></array>
  </data></array></value></param></params>
</methodResponse>`);
		});

		try {
			const config: ConnectionConfig = {
				implementation: "rTorrent",
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

			const downloads = await rtorrentProvider.getDownloads(config);
			expect(downloads).toHaveLength(1);
			expect(downloads[0]).toEqual({
				id: "HASH1",
				name: "No Ints Torrent",
				status: "paused",
				size: 0,
				downloaded: 0,
				uploadSpeed: 0,
				downloadSpeed: 0,
				category: null,
				outputPath: "/downloads/noint",
				isCompleted: false,
			});
		} finally {
			await server.stop();
		}
	});
});
