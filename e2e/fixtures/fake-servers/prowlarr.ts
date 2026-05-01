import type { IncomingMessage } from "node:http";
import type { FakeServer, HandlerResult } from "./base";
import { createFakeServer } from "./base";
import {
	buildCapturedNamedKey,
	buildCapturedPathKey,
	type CapturedReplayState,
	getCapturedResponse,
} from "./captured";

type State = CapturedReplayState & {
	version: string;
	apiKey: string;
	indexers: Array<{
		id: number;
		name: string;
		enable: boolean;
		protocol: string;
		privacy: string;
	}>;
};

function defaultState(seed?: Partial<State>): State {
	const clonedSeed = seed ? structuredClone(seed) : undefined;
	return {
		version: "1.12.0",
		apiKey: "test-prowlarr-api-key",
		indexers: [],
		...clonedSeed,
	};
}

function json(data: unknown): HandlerResult {
	return {
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	};
}

function handler(
	req: IncomingMessage,
	_body: string,
	state: State,
): HandlerResult {
	const url = new URL(req.url || "/", "http://localhost");
	const isTorznabProxyPath = /^\/\d+\/api$/.test(url.pathname);

	if (req.method !== "GET") {
		return null;
	}

	if (isTorznabProxyPath) {
		const proxyType = url.searchParams.get("t");
		const apiKey = url.searchParams.get("apikey");
		if (apiKey !== state.apiKey) {
			return { status: 401, body: "Unauthorized" };
		}
		if (proxyType === "caps" || proxyType === "search") {
			return getCapturedResponse(state, buildCapturedNamedKey("t", proxyType));
		}
		return null;
	}

	// Validate API key
	const apiKey = req.headers["x-api-key"];
	if (apiKey !== state.apiKey) {
		return { status: 401, body: "Unauthorized" };
	}

	switch (url.pathname) {
		case "/api/v1/health": {
			const captured = getCapturedResponse(
				state,
				buildCapturedPathKey(req.method, url.pathname),
			);
			if (captured) {
				return captured;
			}
			return json([]);
		}

		case "/api/v1/system/status": {
			const captured = getCapturedResponse(
				state,
				buildCapturedPathKey(req.method, url.pathname),
			);
			if (captured) {
				return captured;
			}
			return json({ version: state.version });
		}

		case "/api/v1/indexer": {
			const captured = getCapturedResponse(
				state,
				buildCapturedPathKey(req.method, url.pathname),
			);
			if (captured) {
				return captured;
			}
			return json(state.indexers);
		}

		case "/api/v1/applications": {
			return getCapturedResponse(
				state,
				buildCapturedPathKey(req.method, url.pathname),
			);
		}

		case "/api/v1/applications/schema": {
			return getCapturedResponse(
				state,
				buildCapturedPathKey(req.method, url.pathname),
			);
		}

		default: {
			return null;
		}
	}
}

export default function createProwlarrServer(
	port: number,
	seed?: Partial<State>,
): FakeServer<State> {
	return createFakeServer<State>({
		port,
		defaultState: () => defaultState(seed),
		handler,
	});
}
