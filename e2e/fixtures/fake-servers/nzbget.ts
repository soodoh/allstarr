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
	username: string;
	password: string;
	groups: Array<{
		NZBID: number;
		NZBName: string;
		Status: string;
		FileSizeMB: number;
		DownloadedSizeMB: number;
		DownloadRateKB: number;
		DestDir: string;
	}>;
	history: Array<{
		NZBID: number;
		NZBName: string;
		Status: string;
		FileSizeMB: number;
		DestDir: string;
	}>;
	addedDownloads: Array<{ filename: string; category: string }>;
	editedQueue: Array<{ command: string; param: string; ids: number[] }>;
};

function defaultState(seed?: Partial<State>): State {
	const clonedSeed = seed ? structuredClone(seed) : undefined;
	return {
		version: "24.1",
		username: "nzbget",
		password: "nzbget",
		groups: [],
		history: [],
		addedDownloads: [],
		editedQueue: [],
		...clonedSeed,
	};
}

function hasValidAuth(req: IncomingMessage, state: State): boolean {
	const authHeader = req.headers.authorization || "";
	if (!authHeader.startsWith("Basic ")) {
		return false;
	}
	const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
	const [username, password] = decoded.split(":");
	return username === state.username && password === state.password;
}

function rpcResponse(id: number, result: unknown): HandlerResult {
	return {
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id, result }),
	};
}

function handler(
	req: IncomingMessage,
	body: string,
	state: State,
): HandlerResult {
	const url = new URL(req.url || "/", "http://localhost");

	if (url.pathname !== "/jsonrpc" || req.method !== "POST") {
		return null;
	}

	if (!hasValidAuth(req, state)) {
		return { status: 401, body: "Unauthorized" };
	}

	const rpc = JSON.parse(body) as {
		id: number;
		method: string;
		params: unknown[];
	};
	const { id, method, params } = rpc;

	switch (method) {
		case "version": {
			const captured = getCapturedResponse(
				state,
				buildCapturedNamedKey("rpc", method),
			);
			if (captured) {
				return captured;
			}
			return rpcResponse(id, state.version);
		}

		case "listgroups": {
			const captured = getCapturedResponse(
				state,
				buildCapturedNamedKey("rpc", method),
			);
			if (captured) {
				return captured;
			}
			return rpcResponse(id, state.groups);
		}

		case "history": {
			const captured = getCapturedResponse(
				state,
				buildCapturedNamedKey("rpc", method),
			);
			if (captured) {
				return captured;
			}
			return rpcResponse(id, state.history);
		}

		case "append": {
			state.addedDownloads.push({
				filename: (params[0] as string) || "",
				category: (params[1] as string) || "",
			});
			return rpcResponse(id, 1);
		}

		case "editqueue": {
			state.editedQueue.push({
				command: (params[0] as string) || "",
				param: (params[1] as string) || "",
				ids: (params[2] as number[]) || [],
			});
			return rpcResponse(id, true);
		}

		default: {
			return rpcResponse(id, null);
		}
	}
}

export default function createNZBGetServer(
	port: number,
	seed?: Partial<State>,
): FakeServer<State> {
	return createFakeServer<State>({
		port,
		defaultState: () => defaultState(seed),
		handler,
	});
}
