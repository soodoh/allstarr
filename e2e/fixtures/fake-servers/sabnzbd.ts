import type { IncomingMessage } from "node:http";
import { createFakeServer } from "./base";
import type { FakeServer, HandlerResult } from "./base";
import {
	buildCapturedNamedKey,
	getCapturedResponse,
	type CapturedReplayState,
} from "./captured";

type State = CapturedReplayState & {
  version: string;
  apiKey: string;
  queueSlots: Array<{
    nzo_id: string;
    filename: string;
    status: string;
    mb: string;
    mbleft: string;
  }>;
  historySlots: Array<{
    nzo_id: string;
    name: string;
    status: string;
    bytes: number;
    storage: string;
  }>;
  addedDownloads: Array<{ name: string; cat: string }>;
  removedIds: string[];
  pausedIds: string[];
  resumedIds: string[];
};

function defaultState(seed?: Partial<State>): State {
  const clonedSeed = seed ? structuredClone(seed) : undefined;
  return {
    version: "4.2.0",
    apiKey: "test-sabnzbd-api-key",
    queueSlots: [],
    historySlots: [],
    addedDownloads: [],
    removedIds: [],
    pausedIds: [],
    resumedIds: [],
    ...clonedSeed,
  };
}

function json(data: unknown): HandlerResult {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

function handleQueueMode(
  url: URL,
  name: string | null,
  state: State,
): HandlerResult {
  if (!name) {
    return json({ queue: { slots: state.queueSlots } });
  }
  const value = url.searchParams.get("value") || "";
  switch (name) {
    case "pause": {
      if (value) {
        state.pausedIds.push(value);
      }
      return json({ status: true });
    }
    case "resume": {
      if (value) {
        state.resumedIds.push(value);
      }
      return json({ status: true });
    }
    case "delete": {
      if (value) {
        state.removedIds.push(value);
      }
      return json({ status: true });
    }
    case "priority": {
      return json({ status: true });
    }
    default: {
      return json({ status: false });
    }
  }
}

function handleHistoryMode(
  url: URL,
  name: string | null,
  state: State,
): HandlerResult {
  if (!name) {
    return json({ history: { slots: state.historySlots } });
  }
  if (name === "delete") {
    const value = url.searchParams.get("value") || "";
    if (value) {
      state.removedIds.push(value);
    }
    return json({ status: true });
  }
  return json({ status: false });
}

function handler(
  req: IncomingMessage,
  _body: string,
  state: State,
): HandlerResult {
  const url = new URL(req.url || "/", "http://localhost");

  if (url.pathname !== "/api" || req.method !== "GET") {
    return null;
  }

  // Validate API key
  const apiKey = url.searchParams.get("apikey");
  if (apiKey !== state.apiKey) {
    return { status: 403, body: "API Key Required" };
  }

  const mode = url.searchParams.get("mode");
  const name = url.searchParams.get("name");

  switch (mode) {
    case "version": {
      const captured = getCapturedResponse(
        state,
        buildCapturedNamedKey("mode", "version"),
      );
      if (captured) {
        return captured;
      }
      return json({ version: state.version });
    }

    case "queue": {
      if (!name) {
        const captured = getCapturedResponse(
          state,
          buildCapturedNamedKey("mode", "queue"),
        );
        if (captured) {
          return captured;
        }
      }
      return handleQueueMode(url, name, state);
    }

    case "addurl": {
      const downloadName = url.searchParams.get("name") || "";
      const cat = url.searchParams.get("cat") || "";
      state.addedDownloads.push({ name: downloadName, cat });
      return json({ nzo_ids: ["SABnzbd_nzo_xxx"] });
    }

    case "history": {
      if (!name) {
        const captured = getCapturedResponse(
          state,
          buildCapturedNamedKey("mode", "history"),
        );
        if (captured) {
          return captured;
        }
      }
      return handleHistoryMode(url, name, state);
    }

    default: {
      return json({ error: "Unknown mode" });
    }
  }
}

export default function createSABnzbdServer(
  port: number,
  seed?: Partial<State>,
): FakeServer<State> {
  return createFakeServer<State>({
    port,
    defaultState: () => defaultState(seed),
    handler,
  });
}
