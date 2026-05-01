import type { IncomingMessage } from "node:http";
import { createFakeServer, type FakeServer, type HandlerResult } from "./base";
import {
	buildCapturedPathKey,
	type CapturedReplayState,
	getCapturedResponse,
} from "./captured";

type State = CapturedReplayState & {
	apiKey: string;
	blocklist: Array<Record<string, unknown>>;
	downloadClients: Array<Record<string, unknown>>;
	history: Array<Record<string, unknown>>;
	indexers: Array<Record<string, unknown>>;
	mediaManagement: Record<string, unknown>;
	movieFiles: Array<Record<string, unknown>>;
	movies: Array<Record<string, unknown>>;
	naming: Record<string, unknown>;
	queue: Array<Record<string, unknown>>;
	qualityProfiles: Array<Record<string, unknown>>;
	rootFolders: Array<Record<string, unknown>>;
};

function defaultState(seed?: Partial<State>): State {
	const clonedSeed = seed ? structuredClone(seed) : undefined;
	return {
		apiKey: "radarr-key",
		blocklist: [{ id: 302, title: "Rejected release" }],
		downloadClients: [{ id: 2, name: "SABnzbd", implementation: "SABnzbd" }],
		history: [{ id: 402, title: "Dune imported" }],
		indexers: [{ id: 12, name: "Indexer A" }],
		mediaManagement: { autoUnmonitorPreviouslyDownloadedMovies: true },
		movieFiles: [{ id: 211, movieId: 111, relativePath: "Dune.2021.mkv" }],
		movies: [{ id: 111, title: "Dune", tmdbId: 11, year: 2021 }],
		naming: { renameMovies: true },
		queue: [{ id: 502, title: "Dune queued" }],
		qualityProfiles: [{ id: 22, name: "4K" }],
		rootFolders: [{ id: 32, path: "/movies" }],
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
		case "/api/v3/movie":
			return json(state.movies);
		case "/api/v3/moviefile":
			return json(state.movieFiles);
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

export default function createRadarrServer(
	port: number,
	seed?: Partial<State>,
): FakeServer<State> {
	return createFakeServer<State>({
		port,
		defaultState: () => defaultState(seed),
		handler,
	});
}
