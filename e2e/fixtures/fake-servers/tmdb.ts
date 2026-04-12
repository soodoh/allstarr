import type { IncomingMessage } from "node:http";
import { createFakeServer } from "./base";
import type { FakeServer, HandlerResult } from "./base";

type State = {
	movieDetails: Record<string, unknown>;
	collectionDetails: Record<string, unknown>;
	showDetails: Record<string, unknown>;
	seasonDetails: Record<string, unknown>;
	requestLog: string[];
};

function defaultState(): State {
	return {
		movieDetails: {},
		collectionDetails: {},
		showDetails: {},
		seasonDetails: {},
		requestLog: [],
	};
}

function json(body: unknown, status = 200): HandlerResult {
	return {
		status,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	};
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
	state.requestLog.push(url.pathname + url.search);

	const match = url.pathname.match(
		/^\/3\/(?:(movie|collection|tv)\/([^/]+)(?:\/season\/([^/]+))?)$/,
	);
	if (!match) {
		return null;
	}

	const [, kind, id, seasonNumber] = match;

	switch (kind) {
		case "movie": {
			const payload = state.movieDetails[id];
			return payload ? json(payload) : json({ status_message: "Not Found" }, 404);
		}
		case "collection": {
			const payload = state.collectionDetails[id];
			return payload ? json(payload) : json({ status_message: "Not Found" }, 404);
		}
		case "tv": {
			if (seasonNumber) {
				const payload = state.seasonDetails[`${id}:${seasonNumber}`];
				return payload
					? json(payload)
					: json({ status_message: "Not Found" }, 404);
			}

			const payload = state.showDetails[id];
			return payload ? json(payload) : json({ status_message: "Not Found" }, 404);
		}
		default: {
			return json({ status_message: "Not Found" }, 404);
		}
	}
}

export default function createTmdbServer(port: number): FakeServer<State> {
	return createFakeServer<State>({ port, defaultState, handler });
}
