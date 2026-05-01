import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	type CaptureFilePayload,
	captureFileNameForEndpoint,
} from "../golden/capture";
import { buildComposeLiveCaptureConfigs } from "../golden/compose-live";
import { createFakeServerManager, type ServiceName } from "./manager";

const CAPTURE_ROOT = join(
	import.meta.dirname,
	"..",
	"golden",
	"_captures",
	"live-compose",
);

const SERVICE_BY_CAPTURE_SERVICE: Record<string, ServiceName> = {
	deluge: "DELUGE",
	nzbget: "NZBGET",
	prowlarr: "PROWLARR",
	qbittorrent: "QBITTORRENT",
	radarr: "RADARR",
	readarr: "READARR",
	rtorrent: "RTORRENT",
	sabnzbd: "SABNZBD",
	sonarr: "SONARR",
	"torznab-proxy": "PROWLARR",
	transmission: "TRANSMISSION",
};

const STATE_BY_CAPTURE_SERVICE: Record<string, string> = {
	deluge: "compose-live",
	nzbget: "compose-live",
	prowlarr: "compose-live",
	qbittorrent: "compose-live",
	radarr: "compose-live",
	readarr: "compose-live",
	rtorrent: "compose-live",
	sabnzbd: "compose-live",
	sonarr: "compose-live",
	"torznab-proxy": "compose-live",
	transmission: "compose-live",
};

const PARITY_PORTS = {
	DELUGE: 29112,
	NZBGET: 28789,
	PROWLARR: 29697,
	QBITTORRENT: 29001,
	RADARR: 28878,
	READARR: 29787,
	RTORRENT: 29000,
	SABNZBD: 29080,
	SONARR: 29989,
	TRANSMISSION: 30091,
} as const;

function requireServiceUrl(
	urls: Partial<Record<ServiceName, string>>,
	name: ServiceName,
): string {
	const url = urls[name];
	if (!url) {
		throw new Error(`Missing fake server URL for ${name}`);
	}
	return url;
}

describe("compose-live fake server parity", () => {
	let manager: ReturnType<typeof createFakeServerManager> | undefined;

	afterEach(async () => {
		if (manager) {
			await manager.stop();
			manager = undefined;
		}
	});

	it("replays every checked-in compose-live capture payload", async () => {
		manager = createFakeServerManager(
			[
				"DELUGE",
				"NZBGET",
				"PROWLARR",
				"QBITTORRENT",
				"RADARR",
				"READARR",
				"RTORRENT",
				"SABNZBD",
				"SONARR",
				"TRANSMISSION",
			],
			{ ports: PARITY_PORTS },
		);
		await manager.start();

		for (const [captureService, serviceName] of Object.entries(
			SERVICE_BY_CAPTURE_SERVICE,
		)) {
			await manager.setServiceState(
				serviceName,
				STATE_BY_CAPTURE_SERVICE[captureService],
			);
		}

		const urls = manager.getUrls();
		const configs = buildComposeLiveCaptureConfigs({
			delugeHostId: "test-host-id",
			delugeSessionCookie: "test-deluge-session",
			nzbgetPassword: "nzbget",
			nzbgetUsername: "nzbget",
			outputRoot: CAPTURE_ROOT,
			prowlarrApiKey: "test-prowlarr-api-key",
			qbittorrentSid: "test-session-id",
			radarrApiKey: "radarr-key",
			readarrApiKey: "readarr-key",
			rtorrentHash: "ABC123",
			sabnzbdApiKey: "test-sabnzbd-api-key",
			sonarrApiKey: "sonarr-key",
			transmissionSessionId: "test-transmission-session-id",
			urls: {
				deluge: requireServiceUrl(urls, "DELUGE"),
				nzbget: requireServiceUrl(urls, "NZBGET"),
				prowlarr: requireServiceUrl(urls, "PROWLARR"),
				qbittorrent: requireServiceUrl(urls, "QBITTORRENT"),
				radarr: requireServiceUrl(urls, "RADARR"),
				readarr: requireServiceUrl(urls, "READARR"),
				rtorrent: requireServiceUrl(urls, "RTORRENT"),
				sabnzbd: requireServiceUrl(urls, "SABNZBD"),
				sonarr: requireServiceUrl(urls, "SONARR"),
				transmission: requireServiceUrl(urls, "TRANSMISSION"),
			},
		});

		for (const config of configs) {
			for (const endpoint of config.endpoints) {
				const capturePath = join(
					CAPTURE_ROOT,
					config.service,
					config.stateName,
					captureFileNameForEndpoint(
						endpoint.method,
						endpoint.path,
						endpoint.name,
					),
				);
				const expected = JSON.parse(
					readFileSync(capturePath, "utf8"),
				) as CaptureFilePayload;

				const response = await fetch(new URL(endpoint.path, config.baseUrl), {
					body: endpoint.body,
					headers: endpoint.headers,
					method: endpoint.method,
				});

				expect(response.status).toBe(expected.status);

				const contentType = response.headers.get("content-type");
				const actualText = await response.text();
				const actual =
					contentType?.includes("application/json") === true
						? (JSON.parse(actualText) as unknown)
						: actualText;

				expect(actual).toEqual(expected.body);
			}
		}
	});
});
