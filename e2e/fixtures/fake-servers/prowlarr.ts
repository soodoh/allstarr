import type { IncomingMessage } from "node:http";
import { createFakeServer } from "./base";
import type { FakeServer, HandlerResult } from "./base";

type State = {
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

function defaultState(): State {
  return {
    version: "1.12.0",
    apiKey: "test-prowlarr-api-key",
    indexers: [],
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

  if (req.method !== "GET") {
    return null;
  }

  // Validate API key
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== state.apiKey) {
    return { status: 401, body: "Unauthorized" };
  }

  switch (url.pathname) {
    case "/api/v1/health": {
      return json([]);
    }

    case "/api/v1/system/status": {
      return json({ version: state.version });
    }

    case "/api/v1/indexer": {
      return json(state.indexers);
    }

    default: {
      return null;
    }
  }
}

export default function createProwlarrServer(port: number): FakeServer<State> {
  return createFakeServer<State>({ port, defaultState, handler });
}
