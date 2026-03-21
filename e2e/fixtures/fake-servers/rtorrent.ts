import type { IncomingMessage } from "node:http";
import { createFakeServer } from "./base";
import type { FakeServer, HandlerResult } from "./base";

type State = {
  version: string;
  torrents: Array<{
    hash: string;
    name: string;
    state: number;
    size_bytes: number;
    completed_bytes: number;
    up_rate: number;
    down_rate: number;
    directory: string;
    complete: number;
    hashing: number;
  }>;
  addedDownloads: string[];
  removedIds: string[];
  pausedIds: string[];
  resumedIds: string[];
};

function defaultState(): State {
  return {
    version: "0.9.8",
    torrents: [],
    addedDownloads: [],
    removedIds: [],
    pausedIds: [],
    resumedIds: [],
  };
}

function xmlValue(type: string, value: string | number): string {
  if (type === "string") {
    return `<value><string>${value}</string></value>`;
  }
  return `<value><i8>${value}</i8></value>`;
}

function xmlSuccess(innerXml: string): HandlerResult {
  return {
    headers: { "Content-Type": "application/xml" },
    body: `<?xml version="1.0"?><methodResponse><params><param>${innerXml}</param></params></methodResponse>`,
  };
}

function xmlFault(message: string): HandlerResult {
  return {
    headers: { "Content-Type": "application/xml" },
    body: `<?xml version="1.0"?><methodResponse><fault><value><struct><member><name>faultCode</name><value><int>-1</int></value></member><member><name>faultString</name><value><string>${message}</string></value></member></struct></value></fault></methodResponse>`,
  };
}

function extractMethodName(xml: string): string | null {
  const re = /<methodName>(.*?)<\/methodName>/;
  const found = re.exec(xml);
  return found ? found[1] : null;
}

function extractFirstStringParam(xml: string): string | null {
  const re = /<params>.*?<param>.*?<value><string>(.*?)<\/string>/;
  const found = re.exec(xml);
  return found ? found[1] : null;
}

function handler(
  req: IncomingMessage,
  body: string,
  state: State,
): HandlerResult {
  const url = new URL(req.url || "/", "http://localhost");

  if (url.pathname !== "/RPC2" || req.method !== "POST") {
    return null;
  }

  const methodName = extractMethodName(body);
  if (!methodName) {
    return xmlFault("No method name found");
  }

  switch (methodName) {
    case "system.client_version": {
      return xmlSuccess(xmlValue("string", state.version));
    }

    case "d.multicall2": {
      const rows = state.torrents
        .map(
          (t) =>
            `<value><array><data>${xmlValue("string", t.hash)}${xmlValue("string", t.name)}${xmlValue("i8", t.state)}${xmlValue("i8", t.size_bytes)}${xmlValue("i8", t.completed_bytes)}${xmlValue("i8", t.up_rate)}${xmlValue("i8", t.down_rate)}${xmlValue("string", t.directory)}${xmlValue("i8", t.complete)}${xmlValue("i8", t.hashing)}</data></array></value>`,
        )
        .join("");
      return xmlSuccess(`<value><array><data>${rows}</data></array></value>`);
    }

    case "load.start":
    case "load.raw_start": {
      const param = extractFirstStringParam(body);
      if (param) {
        state.addedDownloads.push(param);
      }
      return xmlSuccess(xmlValue("i8", 0));
    }

    case "d.erase": {
      const hash = extractFirstStringParam(body);
      if (hash) {
        state.removedIds.push(hash);
      }
      return xmlSuccess(xmlValue("i8", 0));
    }

    case "d.pause": {
      const hash = extractFirstStringParam(body);
      if (hash) {
        state.pausedIds.push(hash);
      }
      return xmlSuccess(xmlValue("i8", 0));
    }

    case "d.resume": {
      const hash = extractFirstStringParam(body);
      if (hash) {
        state.resumedIds.push(hash);
      }
      return xmlSuccess(xmlValue("i8", 0));
    }

    case "d.priority.set": {
      return xmlSuccess(xmlValue("i8", 0));
    }

    default: {
      return xmlFault(`Unknown method: ${methodName}`);
    }
  }
}

export default function createRTorrentServer(port: number): FakeServer<State> {
  return createFakeServer<State>({ port, defaultState, handler });
}
