import type { IncomingMessage } from "node:http";
import type { FakeServer, HandlerResult } from "./base";
import { createFakeServer } from "./base";
import {
	buildCapturedPathKey,
	type CapturedReplayState,
	getCapturedResponse,
} from "./captured";

type State = CapturedReplayState & {
	version: string;
	torrents: Array<{
		hash: string;
		name: string;
		state: string;
		size: number;
		downloaded: number;
		dlspeed: number;
		upspeed: number;
		category: string;
		save_path: string;
	}>;
	addedDownloads: Array<{ url?: string; category?: string; tags?: string }>;
	removedIds: string[];
	pausedIds: string[];
	resumedIds: string[];
};

function defaultState(seed?: Partial<State>): State {
	const clonedSeed = seed ? structuredClone(seed) : undefined;
	return {
		version: "v4.6.0",
		torrents: [],
		addedDownloads: [],
		removedIds: [],
		pausedIds: [],
		resumedIds: [],
		...clonedSeed,
	};
}

function hasAuth(req: IncomingMessage): boolean {
	const cookie = req.headers.cookie || "";
	return cookie.includes("SID=");
}

function json(data: unknown): HandlerResult {
	return {
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	};
}

function ok(): HandlerResult {
	return { body: "Ok." };
}

function forbidden(): HandlerResult {
	return { status: 403, body: "Forbidden" };
}

function parseHashes(body: string): string[] {
	const params = new URLSearchParams(body);
	const hashes = params.get("hashes") || "";
	return hashes.split("|").filter(Boolean);
}

function handleTorrentsEndpoint(
	path: string,
	body: string,
	url: URL,
	state: State,
): HandlerResult {
	switch (path) {
		case "/api/v2/torrents/info": {
			const category = url.searchParams.get("category");
			const filtered = category
				? state.torrents.filter((t) => t.category === category)
				: state.torrents;
			return json(filtered);
		}

		case "/api/v2/torrents/add": {
			const params = new URLSearchParams(body);
			state.addedDownloads.push({
				url: params.get("urls") || undefined,
				category: params.get("category") || undefined,
				tags: params.get("tags") || undefined,
			});
			return ok();
		}

		case "/api/v2/torrents/delete": {
			state.removedIds.push(...parseHashes(body));
			return ok();
		}

		case "/api/v2/torrents/pause": {
			state.pausedIds.push(...parseHashes(body));
			return ok();
		}

		case "/api/v2/torrents/resume": {
			state.resumedIds.push(...parseHashes(body));
			return ok();
		}

		case "/api/v2/torrents/increasePrio":
		case "/api/v2/torrents/decreasePrio": {
			return ok();
		}

		default: {
			return null;
		}
	}
}

function handler(
	req: IncomingMessage,
	body: string,
	state: State,
): HandlerResult {
	const url = new URL(req.url || "/", "http://localhost");
	const path = url.pathname;

	// Login does not require auth
	if (path === "/api/v2/auth/login" && req.method === "POST") {
		return {
			headers: {
				"Set-Cookie": "SID=test-session-id; Path=/",
				"Content-Type": "text/plain",
			},
			body: "Ok.",
		};
	}

	// All other endpoints require auth
	if (!hasAuth(req)) {
		return forbidden();
	}

	if (path === "/api/v2/app/version" && req.method === "GET") {
		const captured = getCapturedResponse(
			state,
			buildCapturedPathKey(req.method, path),
		);
		if (captured) {
			return captured;
		}
		return { body: state.version };
	}

	if (path === "/api/v2/torrents/info" && req.method === "GET") {
		const captured = getCapturedResponse(
			state,
			buildCapturedPathKey(req.method, `${path}${url.search}`),
		);
		if (captured) {
			return captured;
		}
	}

	return handleTorrentsEndpoint(path, body, url, state);
}

export default function createQBittorrentServer(
	port: number,
	seed?: Partial<State>,
): FakeServer<State> {
	return createFakeServer<State>({
		port,
		defaultState: () => defaultState(seed),
		handler,
	});
}
