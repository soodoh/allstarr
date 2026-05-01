import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startHttpTestServer } from "../../../src/server/__tests__/helpers/http-test-server";
import {
	captureFixtureSet,
	parseCaptureCliArgs,
	scrubSecrets,
} from "./capture";
import { promoteComposeLiveFixtures } from "./promote";

const tempDirs: string[] = [];
const servers: Array<{ stop: () => Promise<void> }> = [];

afterEach(async () => {
	while (servers.length > 0) {
		await servers.pop()?.stop();
	}
	while (tempDirs.length > 0) {
		rmSync(tempDirs.pop() ?? "", { force: true, recursive: true });
	}
});

describe("golden capture helpers", () => {
	it("scrubs nested secrets while preserving non-secret payload content", () => {
		expect(
			scrubSecrets({
				apiKey: "abc",
				headers: {
					Authorization: "Bearer secret-token",
					"X-Api-Key": "xyz",
				},
				items: [
					{
						name: "Dune",
						password: "secret",
						settings: {
							cookie: "SID=123",
							token: "hardcover-token",
						},
					},
					{
						name: "apiKey",
						privacy: "apiKey",
						value: "servarr-key",
					},
					{
						"session-id": "transmission-session",
					},
				],
			}),
		).toEqual({
			apiKey: "<redacted>",
			headers: {
				Authorization: "<redacted>",
				"X-Api-Key": "<redacted>",
			},
			items: [
				{
					name: "Dune",
					password: "<redacted>",
					settings: {
						cookie: "<redacted>",
						token: "<redacted>",
					},
				},
				{
					name: "apiKey",
					privacy: "apiKey",
					value: "<redacted>",
				},
				{
					"session-id": "<redacted>",
				},
			],
		});
	});

	it("redacts secrets embedded in query strings, cookies, and basic-auth urls", () => {
		expect(
			scrubSecrets({
				body: "http://127.0.0.1:9696/1/download?apikey=abc123&amp;token=xyz&SId=ignored",
				path: "/api?t=search&apikey=abc123&password=hunter2",
				url: "http://nzbget:tegbzn6789@127.0.0.1:26789",
			}),
		).toEqual({
			body: "http://127.0.0.1:9696/1/download?apikey=<redacted>&amp;token=<redacted>&SId=<redacted>",
			path: "/api?t=search&apikey=<redacted>&password=<redacted>",
			url: "http://<redacted>:<redacted>@127.0.0.1:26789",
		});
	});

	it("captures configured endpoints into a service state directory", async () => {
		const server = await startHttpTestServer((request, response) => {
			if (request.pathname === "/api/v3/system/status") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ apiKey: "abc", version: "1.2.3" }));
				return;
			}

			if (request.pathname === "/api/v3/queue") {
				response.statusCode = 200;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ records: [{ title: "Queued Book" }] }));
				return;
			}

			response.statusCode = 404;
			response.end("missing");
		});
		servers.push(server);

		const outputDir = mkdtempSync(join(tmpdir(), "golden-capture-"));
		tempDirs.push(outputDir);

		await captureFixtureSet({
			endpoints: [
				{
					headers: { "X-Api-Key": "abc" },
					method: "GET",
					path: "/api/v3/system/status",
				},
				{
					method: "GET",
					path: "/api/v3/queue",
				},
			],
			outputRoot: outputDir,
			service: "sonarr",
			stateName: "captured",
			baseUrl: server.baseUrl,
		});

		const firstFile = join(
			outputDir,
			"sonarr",
			"captured",
			"get__api_v3_system_status.json",
		);
		const secondFile = join(
			outputDir,
			"sonarr",
			"captured",
			"get__api_v3_queue.json",
		);

		expect(JSON.parse(readFileSync(firstFile, "utf8"))).toEqual({
			body: { apiKey: "<redacted>", version: "1.2.3" },
			contentType: "application/json",
			headers: { "X-Api-Key": "<redacted>" },
			method: "GET",
			path: "/api/v3/system/status",
			status: 200,
		});
		expect(JSON.parse(readFileSync(secondFile, "utf8"))).toEqual({
			body: { records: [{ title: "Queued Book" }] },
			contentType: "application/json",
			headers: {},
			method: "GET",
			path: "/api/v3/queue",
			status: 200,
		});
	});

	it("uses the endpoint name to disambiguate RPC-style captures on the same path", async () => {
		const server = await startHttpTestServer((request, response) => {
			if (request.pathname !== "/json") {
				response.statusCode = 404;
				response.end("missing");
				return;
			}

			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(
				JSON.stringify({
					echo: request.body,
				}),
			);
		});
		servers.push(server);

		const outputDir = mkdtempSync(join(tmpdir(), "golden-capture-rpc-"));
		tempDirs.push(outputDir);

		await captureFixtureSet({
			baseUrl: server.baseUrl,
			endpoints: [
				{
					body: JSON.stringify({ method: "auth.login", params: ["deluge"] }),
					method: "POST",
					name: "auth-login",
					path: "/json",
				},
				{
					body: JSON.stringify({
						method: "core.get_torrents_status",
						params: [{}, ["name"]],
					}),
					method: "POST",
					name: "core-get-torrents-status",
					path: "/json",
				},
			],
			outputRoot: outputDir,
			service: "deluge",
			stateName: "captured",
		});

		const authFile = join(
			outputDir,
			"deluge",
			"captured",
			"post__json__auth_login.json",
		);
		const statusFile = join(
			outputDir,
			"deluge",
			"captured",
			"post__json__core_get_torrents_status.json",
		);

		expect(JSON.parse(readFileSync(authFile, "utf8"))).toEqual({
			body: {
				echo: '{"method":"auth.login","params":["deluge"]}',
			},
			contentType: "application/json",
			headers: {},
			method: "POST",
			path: "/json",
			status: 200,
		});
		expect(JSON.parse(readFileSync(statusFile, "utf8"))).toEqual({
			body: {
				echo: '{"method":"core.get_torrents_status","params":[{},["name"]]}',
			},
			contentType: "application/json",
			headers: {},
			method: "POST",
			path: "/json",
			status: 200,
		});
	});

	it("redacts query-string secrets in captured paths and filenames", async () => {
		const server = await startHttpTestServer((request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Type", "application/json");
			response.end(
				JSON.stringify({
					link: `http://127.0.0.1:9696/1/download?apikey=abc123&token=secret`,
				}),
			);
		});
		servers.push(server);

		const outputDir = mkdtempSync(
			join(tmpdir(), "golden-capture-secret-paths-"),
		);
		tempDirs.push(outputDir);

		await captureFixtureSet({
			baseUrl: server.baseUrl,
			endpoints: [
				{
					method: "GET",
					path: "/api?t=search&apikey=abc123&token=secret",
				},
			],
			outputRoot: outputDir,
			service: "prowlarr",
			stateName: "captured",
		});

		const redactedFile = join(
			outputDir,
			"prowlarr",
			"captured",
			"get__api_t_search_apikey_redacted_token_redacted.json",
		);

		expect(JSON.parse(readFileSync(redactedFile, "utf8"))).toEqual({
			body: {
				link: "http://127.0.0.1:9696/1/download?apikey=<redacted>&token=<redacted>",
			},
			contentType: "application/json",
			headers: {},
			method: "GET",
			path: "/api?t=search&apikey=<redacted>&token=<redacted>",
			status: 200,
		});
	});

	it("parses the capture CLI config path", () => {
		expect(parseCaptureCliArgs(["--config", "fixtures.local.json"])).toEqual({
			configPath: "fixtures.local.json",
		});
		expect(() => parseCaptureCliArgs([])).toThrow(
			"Usage: bun scripts/capture-golden-fixtures.ts --config <path>",
		);
	});

	it("promotes compose-live captures into canonical service state files", () => {
		const captureRoot = mkdtempSync(join(tmpdir(), "golden-promote-captures-"));
		const serviceRoot = mkdtempSync(join(tmpdir(), "golden-promote-services-"));
		tempDirs.push(captureRoot, serviceRoot);

		const sonarrCaptureDir = join(captureRoot, "sonarr", "compose-live");
		mkdirSync(sonarrCaptureDir, { recursive: true });
		writeFileSync(
			join(sonarrCaptureDir, "get__api_v3_series__series.json"),
			JSON.stringify({
				body: [{ id: 1, title: "The Office (US)" }],
				contentType: "application/json",
				headers: { "X-Api-Key": "<redacted>" },
				method: "GET",
				path: "/api/v3/series",
				status: 200,
			}),
		);

		const torznabCaptureDir = join(
			captureRoot,
			"torznab-proxy",
			"compose-live-nyaa",
		);
		mkdirSync(torznabCaptureDir, { recursive: true });
		writeFileSync(
			join(torznabCaptureDir, "get__1_api_t_caps__caps.json"),
			JSON.stringify({
				body: "<caps></caps>",
				contentType: "application/xml",
				headers: {},
				method: "GET",
				path: "/1/api?t=caps&apikey=<redacted>",
				status: 200,
			}),
		);

		promoteComposeLiveFixtures({ captureRoot, serviceRoot });

		expect(
			JSON.parse(
				readFileSync(
					join(serviceRoot, "sonarr", "compose-live", "state.json"),
					"utf8",
				),
			),
		).toEqual({
			name: "compose-live",
			seed: {
				apiKey: "sonarr-key",
				capturedResponses: {
					"GET /api/v3/series": {
						body: [{ id: 1, title: "The Office (US)" }],
						contentType: "application/json",
						status: 200,
					},
				},
			},
			service: "sonarr",
		});

		expect(
			JSON.parse(
				readFileSync(
					join(serviceRoot, "prowlarr", "compose-live", "state.json"),
					"utf8",
				),
			),
		).toEqual({
			name: "compose-live",
			seed: {
				apiKey: "test-prowlarr-api-key",
				capturedResponses: {
					"t:caps": {
						body: "<caps></caps>",
						contentType: "application/xml",
						status: 200,
					},
				},
			},
			service: "prowlarr",
		});
	});
});
