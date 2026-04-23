import type { IncomingMessage } from "node:http";
import { createFakeServer, type FakeServer, type HandlerResult } from "./base";
import {
	buildCapturedPathKey,
	getCapturedResponse,
	type CapturedReplayState,
} from "./captured";

type State = CapturedReplayState & {
	apiKey: string;
	blocklist: Array<Record<string, unknown>>;
	downloadClients: Array<Record<string, unknown>>;
	episodes: Array<Record<string, unknown>>;
	history: Array<Record<string, unknown>>;
	indexers: Array<Record<string, unknown>>;
	mediaManagement: Record<string, unknown>;
	naming: Record<string, unknown>;
	queue: Array<Record<string, unknown>>;
	qualityProfiles: Array<Record<string, unknown>>;
	rootFolders: Array<Record<string, unknown>>;
	series: Array<Record<string, unknown>>;
};

function defaultState(seed?: Partial<State>): State {
	const clonedSeed = seed ? structuredClone(seed) : undefined;
	return {
		apiKey: "sonarr-key",
		blocklist: [{ id: 301, title: "Rejected release" }],
		downloadClients: [{ id: 1, name: "qBittorrent", implementation: "qBittorrent" }],
		episodes: [
			{
				id: 201,
				episodeNumber: 1,
				seasonNumber: 1,
				seriesId: 101,
				title: "Good News About Hell",
			},
		],
		history: [{ id: 401, title: "Severance imported" }],
		indexers: [{ id: 11, name: "Nyaa" }],
		mediaManagement: { autoUnmonitorPreviouslyDownloadedEpisodes: true },
		naming: { renameEpisodes: true },
		queue: [{ id: 501, title: "Severance queued" }],
		qualityProfiles: [{ id: 21, name: "HD-1080p" }],
		rootFolders: [{ id: 31, path: "/tv" }],
		series: [{ id: 101, title: "Severance", tvdbId: 999_999 }],
		...clonedSeed,
	};
}

function json(body: unknown, status = 200): HandlerResult {
	return {
		status,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	};
}

function paged(records: Array<Record<string, unknown>>): HandlerResult {
	return json({ records, totalRecords: records.length });
}

function handler(
	req: IncomingMessage,
	_body: string,
	state: State,
): HandlerResult {
	if (req.method !== "GET") {
		return null;
	}

	if (req.headers["x-api-key"] !== state.apiKey) {
		return { status: 401, body: "Unauthorized" };
	}

	const url = new URL(req.url || "/", "http://localhost");
	const captured = getCapturedResponse(
		state,
		buildCapturedPathKey(req.method, `${url.pathname}${url.search}`),
	);
	if (captured) {
		return captured;
	}

	switch (url.pathname) {
		case "/api/v3/config/naming":
			return json(state.naming);
		case "/api/v3/config/mediamanagement":
			return json(state.mediaManagement);
		case "/api/v3/downloadclient":
			return json(state.downloadClients);
		case "/api/v3/indexer":
			return json(state.indexers);
		case "/api/v3/rootfolder":
			return json(state.rootFolders);
		case "/api/v3/qualityprofile":
			return json(state.qualityProfiles);
		case "/api/v3/series":
			return json(state.series);
		case "/api/v3/episode":
			return json(state.episodes);
		case "/api/v3/history":
			return paged(state.history);
		case "/api/v3/queue":
			return paged(state.queue);
		case "/api/v3/blocklist":
			return paged(state.blocklist);
		default:
			return null;
	}
}

export default function createSonarrServer(
	port: number,
	seed?: Partial<State>,
): FakeServer<State> {
	return createFakeServer<State>({
		port,
		defaultState: () => defaultState(seed),
		handler,
	});
}
