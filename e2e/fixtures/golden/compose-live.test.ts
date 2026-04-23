import { describe, expect, it } from "vitest";
import { buildComposeLiveCaptureConfigs } from "./compose-live";

describe("compose live capture config", () => {
	it("builds service configs with runtime auth material and redaction-sensitive paths", () => {
		const configs = buildComposeLiveCaptureConfigs({
			delugeHostId: "host-1",
			delugeSessionCookie: "session-cookie",
			outputRoot: "/tmp/golden",
			prowlarrApiKey: "prowlarr-key",
			qbittorrentSid: "qb-sid",
			radarrApiKey: "radarr-key",
			readarrApiKey: "readarr-key",
			rtorrentHash: "ABC123",
			sabnzbdApiKey: "sab-key",
			sonarrApiKey: "sonarr-key",
			transmissionSessionId: "transmission-session",
		});

		expect(configs).toHaveLength(11);

		expect(
			configs.find((config) => config.service === "qbittorrent")?.endpoints,
		).toEqual([
			{
				headers: {
					Cookie: "SID=qb-sid",
					Host: "localhost:8081",
				},
				method: "GET",
				name: "torrents-info",
				path: "/api/v2/torrents/info?hashes=all",
			},
		]);

		expect(
			configs.find((config) => config.service === "torznab-proxy")?.endpoints[1]
				.path,
		).toBe("/1/api?t=search&q=matrix&cat=2000&extended=1&apikey=prowlarr-key");

		expect(
			configs.find((config) => config.service === "rtorrent")?.endpoints,
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "download-list" }),
				expect.objectContaining({ name: "torrent-name" }),
				expect.objectContaining({ name: "torrent-directory" }),
				expect.objectContaining({ name: "torrent-complete" }),
			]),
		);
	});
});
