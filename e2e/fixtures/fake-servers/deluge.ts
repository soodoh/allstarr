import type { IncomingMessage } from "node:http";
import type { FakeServer, HandlerResult } from "./base";
import { createFakeServer } from "./base";
import {
	buildCapturedNamedKey,
	type CapturedReplayState,
	getCapturedResponse,
} from "./captured";

type State = CapturedReplayState & {
	version: string;
	password: string;
	connected: boolean;
	hostId: string;
	torrents: Record<
		string,
		{
			name: string;
			state: string;
			total_size: number;
			all_time_download: number;
			upload_rate: number;
			download_rate: number;
			save_path: string;
			progress: number;
		}
	>;
	addedDownloads: Array<{ url?: string; filename?: string }>;
	removedIds: string[];
	pausedIds: string[];
	resumedIds: string[];
};

function defaultState(seed?: Partial<State>): State {
	const clonedSeed = seed ? structuredClone(seed) : undefined;
	return {
		version: "2.1.1",
		password: "deluge",
		connected: false,
		hostId: "test-host-id",
		torrents: {},
		addedDownloads: [],
		removedIds: [],
		pausedIds: [],
		resumedIds: [],
		...clonedSeed,
	};
}

function rpcResponse(id: number, result: unknown): HandlerResult {
	return {
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id, result, error: null }),
	};
}

function rpcError(id: number, message: string): HandlerResult {
	return {
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id, result: null, error: { message, code: 1 } }),
	};
}

function handleCoreMethod(
	method: string,
	id: number,
	params: unknown[],
	state: State,
): HandlerResult {
	switch (method) {
		case "core.get_torrents_status": {
			return rpcResponse(id, state.torrents);
		}

		case "core.add_torrent_url": {
			state.addedDownloads.push({ url: params[0] as string });
			return rpcResponse(id, "fake-torrent-hash");
		}

		case "core.add_torrent_file": {
			state.addedDownloads.push({ filename: params[0] as string });
			return rpcResponse(id, "fake-torrent-hash");
		}

		case "core.remove_torrent": {
			state.removedIds.push(params[0] as string);
			return rpcResponse(id, true);
		}

		case "core.pause_torrent": {
			if (Array.isArray(params[0])) {
				for (const torrentId of params[0] as string[]) {
					state.pausedIds.push(torrentId);
				}
			}
			return rpcResponse(id, null);
		}

		case "core.resume_torrent": {
			if (Array.isArray(params[0])) {
				for (const torrentId of params[0] as string[]) {
					state.resumedIds.push(torrentId);
				}
			}
			return rpcResponse(id, null);
		}

		case "core.queue_up":
		case "core.queue_down": {
			return rpcResponse(id, null);
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

	if (url.pathname !== "/json" || req.method !== "POST") {
		return null;
	}

	const rpc = JSON.parse(body) as {
		id: number;
		method: string;
		params: unknown[];
	};
	const { id, method, params } = rpc;

	switch (method) {
		case "auth.login": {
			const passwordMatch = params[0] === state.password;
			if (passwordMatch) {
				const captured = getCapturedResponse(
					state,
					buildCapturedNamedKey("rpc", method),
				);
				if (captured) {
					return {
						...captured,
						headers: {
							...(captured.headers ?? {}),
							"Set-Cookie": "_session_id=test-deluge-session; Path=/",
						},
					};
				}
				return {
					headers: {
						"Content-Type": "application/json",
						"Set-Cookie": "_session_id=test-deluge-session; Path=/",
					},
					body: JSON.stringify({ id, result: true, error: null }),
				};
			}
			return rpcResponse(id, false);
		}

		case "web.connected": {
			const captured = getCapturedResponse(
				state,
				buildCapturedNamedKey("rpc", method),
			);
			if (captured) {
				return captured;
			}
			return rpcResponse(id, state.connected);
		}

		case "web.get_hosts": {
			const captured = getCapturedResponse(
				state,
				buildCapturedNamedKey("rpc", method),
			);
			if (captured) {
				return captured;
			}
			return rpcResponse(id, [
				[state.hostId, "127.0.0.1", 58_846, "Connected"],
			]);
		}

		case "web.connect": {
			state.connected = true;
			const captured = getCapturedResponse(
				state,
				buildCapturedNamedKey("rpc", method),
			);
			if (captured) {
				return captured;
			}
			return rpcResponse(id, null);
		}

		case "daemon.get_version": {
			const captured = getCapturedResponse(
				state,
				buildCapturedNamedKey("rpc", method),
			);
			if (captured) {
				return captured;
			}
			return rpcResponse(id, state.version);
		}

		default: {
			const captured = getCapturedResponse(
				state,
				buildCapturedNamedKey("rpc", method),
			);
			if (captured) {
				return captured;
			}
			const coreResult = handleCoreMethod(method, id, params, state);
			if (coreResult) {
				return coreResult;
			}
			return rpcError(id, `Unknown method: ${method}`);
		}
	}
}

export default function createDelugeServer(
	port: number,
	seed?: Partial<State>,
): FakeServer<State> {
	return createFakeServer<State>({
		port,
		defaultState: () => defaultState(seed),
		handler,
	});
}
