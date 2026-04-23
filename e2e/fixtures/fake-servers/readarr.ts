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
	history: Array<Record<string, unknown>>;
	indexers: Array<Record<string, unknown>>;
	authors: Array<Record<string, unknown>>;
	books: Array<Record<string, unknown>>;
	mediaManagement: Record<string, unknown>;
	metadataProfiles: Array<Record<string, unknown>>;
	naming: Record<string, unknown>;
	queue: Array<Record<string, unknown>>;
	qualityProfiles: Array<Record<string, unknown>>;
	rootFolders: Array<Record<string, unknown>>;
};

function defaultState(seed?: Partial<State>): State {
	const clonedSeed = seed ? structuredClone(seed) : undefined;
	return {
		apiKey: "readarr-key",
		authors: [{ id: 401, authorName: "Frank Herbert" }],
		blocklist: [{ id: 303, title: "Blocked book" }],
		books: [
			{
				authorName: "Frank Herbert",
				foreignBookId: "hc-dune-1",
				id: 501,
				title: "Dune",
				year: 1965,
			},
		],
		downloadClients: [{ id: 3, name: "Transmission", implementation: "Transmission" }],
		history: [{ id: 403, title: "Dune imported" }],
		indexers: [{ id: 13, name: "Books Indexer" }],
		mediaManagement: { renameBooks: true },
		metadataProfiles: [{ id: 23, name: "Hardcover" }],
		naming: { renameBooks: true },
		queue: [{ id: 503, title: "Dune queued" }],
		qualityProfiles: [{ id: 24, name: "Lossless" }],
		rootFolders: [{ id: 33, path: "/books" }],
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
		case "/api/v1/config/naming":
			return json(state.naming);
		case "/api/v1/config/mediamanagement":
			return json(state.mediaManagement);
		case "/api/v1/downloadclient":
			return json(state.downloadClients);
		case "/api/v1/indexer":
			return json(state.indexers);
		case "/api/v1/rootfolder":
			return json(state.rootFolders);
		case "/api/v1/qualityprofile":
			return json(state.qualityProfiles);
		case "/api/v1/metadataprofile":
			return json(state.metadataProfiles);
		case "/api/v1/author":
			return json(state.authors);
		case "/api/v1/book":
			return json(state.books);
		case "/api/v1/history":
			return paged(state.history);
		case "/api/v1/queue":
			return paged(state.queue);
		case "/api/v1/blocklist":
			return paged(state.blocklist);
		default:
			return null;
	}
}

export default function createReadarrServer(
	port: number,
	seed?: Partial<State>,
): FakeServer<State> {
	return createFakeServer<State>({
		port,
		defaultState: () => defaultState(seed),
		handler,
	});
}
