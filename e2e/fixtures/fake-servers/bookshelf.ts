import type { IncomingMessage } from "node:http";
import { createFakeServer, type FakeServer, type HandlerResult } from "./base";

type State = {
	apiKey: string;
	blocklist: Array<Record<string, unknown>>;
	downloadClients: Array<Record<string, unknown>>;
	authors: Array<Record<string, unknown>>;
	books: Array<Record<string, unknown>>;
	history: Array<Record<string, unknown>>;
	indexers: Array<Record<string, unknown>>;
	mediaManagement: Record<string, unknown>;
	metadataProfiles: Array<Record<string, unknown>>;
	naming: Record<string, unknown>;
	queue: Array<Record<string, unknown>>;
	qualityProfiles: Array<Record<string, unknown>>;
	rootFolders: Array<Record<string, unknown>>;
};

function defaultState(): State {
	return {
		apiKey: "bookshelf-key",
		authors: [{ id: 701, authorName: "Ursula K. Le Guin" }],
		blocklist: [{ id: 304, title: "Blocked shelf book" }],
		books: [
			{
				authorName: "Ursula K. Le Guin",
				foreignBookId: "bookshelf-earthsea",
				id: 801,
				title: "A Wizard of Earthsea",
				year: 1968,
			},
		],
		downloadClients: [{ id: 4, name: "qbittorrent", implementation: "qBittorrent" }],
		history: [{ id: 404, title: "Earthsea imported" }],
		indexers: [{ id: 14, name: "Bookshelf Indexer" }],
		mediaManagement: { renameBooks: true },
		metadataProfiles: [{ id: 25, name: "OpenLibrary" }],
		naming: { renameBooks: true },
		queue: [{ id: 504, title: "Earthsea queued" }],
		qualityProfiles: [{ id: 26, name: "EPUB" }],
		rootFolders: [{ id: 34, path: "/bookshelf" }],
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

	const url = new URL(req.url || "/", "http://localhost");
	if (!url.pathname.startsWith("/bookshelf")) {
		return null;
	}

	if (req.headers["x-api-key"] !== state.apiKey) {
		return { status: 401, body: "Unauthorized" };
	}

	const pathname = url.pathname.slice("/bookshelf".length) || "/";

	switch (pathname) {
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

export default function createBookshelfServer(port: number): FakeServer<State> {
	return createFakeServer<State>({ port, defaultState, handler });
}
