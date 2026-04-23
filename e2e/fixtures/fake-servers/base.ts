import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse, Server } from "node:http";

export type HandlerResult = {
  status?: number;
  headers?: Record<string, string>;
  body: string;
} | null;

export type FakeServerOptions<TState extends object> = {
  port: number;
  defaultState: () => TState;
  handler: (req: IncomingMessage, body: string, state: TState) => HandlerResult;
};

export type FakeServer<TState extends object> = {
  server: Server;
  url: string;
  reset: () => void;
  seed: (nextState: TState) => void;
  stop: () => Promise<void>;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString());
    });
  });
}

export function createFakeServer<TState extends object>(
  opts: FakeServerOptions<TState>,
): FakeServer<TState> {
  let seedState = opts.defaultState();
  let state = structuredClone(seedState);

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", `http://localhost:${opts.port}`);
      const body = await readBody(req);

      if (url.pathname === "/__control" && req.method === "POST") {
        Object.assign(state, JSON.parse(body));
        res.writeHead(200).end("OK");
        return;
      }
      if (url.pathname === "/__seed" && req.method === "POST") {
        seedState = JSON.parse(body) as TState;
        state = structuredClone(seedState);
        res.writeHead(200).end("OK");
        return;
      }
      if (url.pathname === "/__reset" && req.method === "POST") {
        state = structuredClone(seedState);
        res.writeHead(200).end("OK");
        return;
      }
      if (url.pathname === "/__state" && req.method === "GET") {
        sendJson(res, state);
        return;
      }

      const result = opts.handler(req, body, state);
      if (result) {
        res
          .writeHead(result.status || 200, result.headers || {})
          .end(result.body);
        return;
      }
      res.writeHead(404).end("Not Found");
    },
  );

  server.listen(opts.port);

  return {
    server,
    url: `http://localhost:${opts.port}`,
    reset: () => {
      state = structuredClone(seedState);
    },
    seed: (nextState: TState) => {
      seedState = structuredClone(nextState);
      state = structuredClone(seedState);
    },
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

export function sendJson(
  res: ServerResponse,
  data: unknown,
  status = 200,
): void {
  res
    .writeHead(status, { "Content-Type": "application/json" })
    .end(JSON.stringify(data));
}

export function sendXml(res: ServerResponse, data: string, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/xml" }).end(data);
}

export function sendText(
  res: ServerResponse,
  data: string,
  status = 200,
): void {
  res.writeHead(status).end(data);
}
