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
	sessionId: string;
	torrents: Array<{
		id: number;
		name: string;
		status: number;
		totalSize: number;
		downloadedEver: number;
		uploadSpeed: number;
		rateDownload: number;
		downloadDir: string;
	}>;
	addedDownloads: Array<{ filename?: string; metainfo?: string }>;
	removedIds: number[];
	stoppedIds: number[];
	startedIds: number[];
};

function defaultState(seed?: Partial<State>): State {
	const clonedSeed = seed ? structuredClone(seed) : undefined;
	return {
		version: "4.0.0",
		sessionId: "test-transmission-session-id",
		torrents: [],
		addedDownloads: [],
		removedIds: [],
		stoppedIds: [],
		startedIds: [],
		...clonedSeed,
	};
}

function json(data: unknown): HandlerResult {
	return {
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	};
}

function pushIds(target: number[], args: Record<string, unknown>): void {
	if (Array.isArray(args.ids)) {
		for (const id of args.ids as number[]) {
			target.push(id);
		}
	}
}

function handleTorrentMethod(
	method: string,
	args: Record<string, unknown>,
	state: State,
): HandlerResult {
	switch (method) {
		case "torrent-add": {
			state.addedDownloads.push({
				filename: (args.filename as string) || undefined,
				metainfo: (args.metainfo as string) || undefined,
			});
			return json({
				result: "success",
				arguments: { "torrent-added": { id: 1 } },
			});
		}

		case "torrent-remove": {
			pushIds(state.removedIds, args);
			return json({ result: "success" });
		}

		case "torrent-stop": {
			pushIds(state.stoppedIds, args);
			return json({ result: "success" });
		}

		case "torrent-start": {
			pushIds(state.startedIds, args);
			return json({ result: "success" });
		}

		case "queue-move-up":
		case "queue-move-down": {
			return json({ result: "success" });
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

	if (url.pathname !== "/transmission/rpc" || req.method !== "POST") {
		return null;
	}

	// Check session ID header
	const sessionHeader = req.headers["x-transmission-session-id"];
	if (sessionHeader !== state.sessionId) {
		return {
			status: 409,
			headers: { "X-Transmission-Session-Id": state.sessionId },
			body: "Conflict",
		};
	}

	const rpc = JSON.parse(body) as {
		method: string;
		arguments?: Record<string, unknown>;
	};
	const args = rpc.arguments || {};

	switch (rpc.method) {
		case "session-get": {
			const captured = getCapturedResponse(
				state,
				buildCapturedNamedKey("rpc", rpc.method),
			);
			if (captured) {
				return captured;
			}
			return json({
				result: "success",
				arguments: { version: state.version },
			});
		}

		case "torrent-get": {
			const captured = getCapturedResponse(
				state,
				buildCapturedNamedKey("rpc", rpc.method),
			);
			if (captured) {
				return captured;
			}
			return json({
				result: "success",
				arguments: { torrents: state.torrents },
			});
		}

		default: {
			const result = handleTorrentMethod(rpc.method, args, state);
			if (result) {
				return result;
			}
			return json({ result: "error", arguments: {} });
		}
	}
}

export default function createTransmissionServer(
	port: number,
	seed?: Partial<State>,
): FakeServer<State> {
	return createFakeServer<State>({
		port,
		defaultState: () => defaultState(seed),
		handler,
	});
}
