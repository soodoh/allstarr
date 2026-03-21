# Playwright E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comprehensive Playwright e2e tests covering all critical flows in Allstarr using fake HTTP servers for download clients/indexers and a fake Hardcover GraphQL server, with fresh SQLite per test suite.

**Architecture:** Each test suite starts its own app server instance on a unique port with its own fresh SQLite DB (copied from a pre-migrated template). Fake HTTP servers (one per download client type + Newznab + Prowlarr + Hardcover) start once in global setup on fixed ports and use `/__control`/`/__reset` endpoints for per-test state management. Tests use a custom Playwright fixture providing authenticated pages, direct DB access (via better-sqlite3), fake server URLs, and temp directories.

**Tech Stack:** Playwright Test, Bun.serve (fake servers), better-sqlite3 (test DB access), drizzle-orm (schema + queries)

**Spec:** `docs/superpowers/specs/2026-03-21-playwright-e2e-tests-design.md`

---

## File Structure

```
e2e/
├── playwright.config.ts
├── global-setup.ts
├── global-teardown.ts
├── ports.ts                         # Port allocation constants
├── fixtures/
│   ├── app.ts                       # Custom test fixture
│   ├── test-db.ts                   # DB copy/seed/cleanup helpers
│   ├── seed-data.ts                 # Seed factory functions
│   └── fake-servers/
│       ├── base.ts                  # Shared server creation utility
│       ├── qbittorrent.ts
│       ├── transmission.ts
│       ├── deluge.ts
│       ├── rtorrent.ts
│       ├── sabnzbd.ts
│       ├── nzbget.ts
│       ├── newznab.ts
│       ├── prowlarr.ts
│       └── hardcover.ts
├── helpers/
│   ├── auth.ts                      # Register/login helpers
│   ├── navigation.ts                # Common navigation
│   └── sse.ts                       # SSE event capture
└── tests/
    ├── 01-auth.spec.ts
    ├── 02-settings-config.spec.ts
    ├── 03-author-book-import.spec.ts
    ├── 04-search-grab.spec.ts
    ├── 05-queue-management.spec.ts
    ├── 06-auto-search.spec.ts
    ├── 07-download-lifecycle.spec.ts
    ├── 08-disk-scan.spec.ts
    ├── 09-system-health.spec.ts
    └── 10-blocklist-failure.spec.ts
```

Files modified in app source:

- `src/server/search.ts` -- make `HARDCOVER_GRAPHQL_URL` configurable via env var
- `src/server/hardcover/import-queries.ts` -- same
- `vite.config.ts` -- read PORT from env var

---

## Phase 1: Prerequisites

### Task 1: App Code Changes

Make the Hardcover GraphQL URL and dev server port configurable via environment variables.

**Files:**

- Modify: `src/server/search.ts` (line 8)
- Modify: `src/server/hardcover/import-queries.ts` (line 18)
- Modify: `vite.config.ts`

- [ ] **Step 1: Update Hardcover URL in search.ts**

Change the hardcoded constant:

```ts
// Before:
const HARDCOVER_GRAPHQL_URL = "https://api.hardcover.app/v1/graphql";
// After:
const HARDCOVER_GRAPHQL_URL =
  process.env.HARDCOVER_GRAPHQL_URL || "https://api.hardcover.app/v1/graphql";
```

- [ ] **Step 2: Update Hardcover URL in import-queries.ts**

Same change in `src/server/hardcover/import-queries.ts` line 18:

```ts
const HARDCOVER_GRAPHQL_URL =
  process.env.HARDCOVER_GRAPHQL_URL || "https://api.hardcover.app/v1/graphql";
```

- [ ] **Step 3: Make dev server port configurable**

In `vite.config.ts`, change:

```ts
server: {
  port: Number(process.env.PORT) || 3000,
  host: true,
  allowedHosts: ["allstarr", "host.docker.internal"],
}
```

- [ ] **Step 4: Verify app still starts normally**

Run: `bun run dev`
Expected: Dev server starts on port 3000 (default behavior unchanged)

- [ ] **Step 5: Commit**

```bash
git add src/server/search.ts src/server/hardcover/import-queries.ts vite.config.ts
git commit -m "feat: make Hardcover URL and dev server port configurable via env vars"
```

---

### Task 2: Install Dependencies and Create Structure

**Files:**

- Modify: `package.json`
- Create: `e2e/` directory structure
- Create: `e2e/ports.ts`

- [ ] **Step 1: Install Playwright and better-sqlite3**

```bash
bun add -d @playwright/test better-sqlite3 @types/better-sqlite3
bunx playwright install chromium
```

- [ ] **Step 2: Create e2e directory structure**

```bash
mkdir -p e2e/fixtures/fake-servers e2e/helpers e2e/tests
```

- [ ] **Step 3: Create port allocation constants**

Create `e2e/ports.ts`:

```ts
// Fixed ports for fake servers (started once in global setup)
export const PORTS = {
  QBITTORRENT: 19001,
  TRANSMISSION: 19002,
  DELUGE: 19003,
  RTORRENT: 19004,
  SABNZBD: 19005,
  NZBGET: 19006,
  NEWZNAB: 19007,
  PROWLARR: 19008,
  HARDCOVER: 19009,
  // App server ports start at 19100, incremented per worker
  APP_BASE: 19100,
} as const;
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: install Playwright and better-sqlite3, create e2e directory structure"
```

---

## Phase 2: Fake Servers

Each fake server is a Node.js HTTP server (`node:http`) that speaks the real protocol. **Important:** Playwright runs on Node.js, not Bun, so `Bun.serve` is unavailable in global setup and test code. All fake servers must use `http.createServer` from `node:http`. All share a common pattern:

- `/__control` POST endpoint to set server state from tests
- `/__reset` POST endpoint to clear state between tests
- `/__state` GET endpoint to read current state (for assertions)
- Mutable state object that protocol handlers read from

### Task 3: Fake Server Base Utility

**Files:**

- Create: `e2e/fixtures/fake-servers/base.ts`

- [ ] **Step 1: Create the base server factory**

Create `e2e/fixtures/fake-servers/base.ts` using `node:http` (NOT `Bun.serve`):

```ts
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";

export type HandlerResult = {
  status?: number;
  headers?: Record<string, string>;
  body: string;
} | null;

export type FakeServerOptions<TState> = {
  port: number;
  defaultState: () => TState;
  handler: (req: IncomingMessage, body: string, state: TState) => HandlerResult;
};

export type FakeServer<TState> = {
  server: Server;
  url: string;
  reset: () => void;
  stop: () => Promise<void>;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

export function createFakeServer<TState>(
  opts: FakeServerOptions<TState>,
): FakeServer<TState> {
  let state = opts.defaultState();

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", `http://localhost:${opts.port}`);

      const body = await readBody(req);

      if (url.pathname === "/__control" && req.method === "POST") {
        Object.assign(state, JSON.parse(body));
        res.writeHead(200).end("OK");
        return;
      }
      if (url.pathname === "/__reset" && req.method === "POST") {
        state = opts.defaultState();
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
      state = opts.defaultState();
    },
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export function sendJson(res: ServerResponse, data: unknown, status = 200) {
  res
    .writeHead(status, { "Content-Type": "application/json" })
    .end(JSON.stringify(data));
}

export function sendXml(res: ServerResponse, data: string, status = 200) {
  res.writeHead(status, { "Content-Type": "application/xml" }).end(data);
}

export function sendText(res: ServerResponse, data: string, status = 200) {
  res.writeHead(status).end(data);
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/fake-servers/base.ts
git commit -m "feat(e2e): add fake server base utility"
```

---

### Task 4: Fake qBittorrent Server

**Files:**

- Create: `e2e/fixtures/fake-servers/qbittorrent.ts`

**Protocol:** REST API with cookie-based auth. Login via `POST /api/v2/auth/login` (form-urlencoded `username=&password=`), returns `Set-Cookie: SID=xxx`. All other requests require `Cookie: SID=xxx` and `Referer` header.

- [ ] **Step 1: Implement the fake server**

**State shape:**

```ts
type State = {
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
```

**Endpoints to implement:**
| Method | Path | Request | Response |
|--------|------|---------|----------|
| POST | `/api/v2/auth/login` | Form: `username=&password=` | `Set-Cookie: SID=test-session-id`, body: `"Ok."` |
| GET | `/api/v2/app/version` | Cookie: `SID=xxx` | Plain text: `state.version` (e.g., `"v4.6.0"`) |
| GET | `/api/v2/torrents/info` | Cookie, optional `?category=` | JSON array of `state.torrents` |
| POST | `/api/v2/torrents/add` | Cookie, FormData with `urls`/`category`/`tags` | Record to `state.addedDownloads`, return `"Ok."` |
| POST | `/api/v2/torrents/delete` | Cookie, form: `hashes=xxx&deleteFiles=true` | Record to `state.removedIds`, return `"Ok."` |
| POST | `/api/v2/torrents/pause` | Cookie, form: `hashes=xxx` | Record to `state.pausedIds`, return `"Ok."` |
| POST | `/api/v2/torrents/resume` | Cookie, form: `hashes=xxx` | Record to `state.resumedIds`, return `"Ok."` |
| POST | `/api/v2/torrents/increasePrio` | Cookie, form: `hashes=xxx` | `"Ok."` |
| POST | `/api/v2/torrents/decreasePrio` | Cookie, form: `hashes=xxx` | `"Ok."` |

Auth validation: check for `SID=` in Cookie header. Return 403 if missing (except for `/auth/login`).

Export a `createQBittorrentServer(port: number)` function.

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/fake-servers/qbittorrent.ts
git commit -m "feat(e2e): add fake qBittorrent server"
```

---

### Task 5: Fake Transmission Server

**Files:**

- Create: `e2e/fixtures/fake-servers/transmission.ts`

**Protocol:** JSON-RPC at `POST /transmission/rpc`. Requires `X-Transmission-Session-Id` header. On first request (no/wrong header), returns 409 with the session ID in response header. Client retries with the correct header.

- [ ] **Step 1: Implement the fake server**

**State shape:**

```ts
type State = {
  version: string;
  sessionId: string;
  torrents: Array<{
    id: number;
    name: string;
    status: number; // 0=paused,4=downloading,6=completed
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
```

**Handler logic:**

1. Check `X-Transmission-Session-Id` header. If missing/wrong, return 409 with correct ID in response header.
2. Parse JSON body: `{ method, arguments }`
3. Dispatch on method:
   - `session-get` -> `{ result: "success", arguments: { version: state.version } }`
   - `torrent-get` -> `{ result: "success", arguments: { torrents: state.torrents } }`
   - `torrent-add` -> Record to state, return `{ result: "success", arguments: { "torrent-added": { id: 1 } } }`
   - `torrent-remove` -> Record `arguments.ids` to `state.removedIds`
   - `torrent-stop` -> Record to `state.stoppedIds`
   - `torrent-start` -> Record to `state.startedIds`
   - `queue-move-up`, `queue-move-down` -> success

Export `createTransmissionServer(port: number)`.

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/fake-servers/transmission.ts
git commit -m "feat(e2e): add fake Transmission server"
```

---

### Task 6: Fake Deluge Server

**Files:**

- Create: `e2e/fixtures/fake-servers/deluge.ts`

**Protocol:** JSON-RPC at `POST /json`. Cookie-based auth. Request body: `{ id, method, params }`. Response: `{ id, result, error }`. Login via `auth.login` method. Must handle `web.connected` check and `web.connect` flow.

- [ ] **Step 1: Implement the fake server**

**State shape:**

```ts
type State = {
  version: string;
  password: string;
  connected: boolean;
  hostId: string;
  torrents: Record<
    string,
    {
      // keyed by hash
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
```

**Method dispatch:**

- `auth.login` -> Check params[0] === state.password, set cookie, result: `true`
- `web.connected` -> result: `state.connected`
- `web.get_hosts` -> result: `[[state.hostId, "127.0.0.1", 58846, "Connected"]]`
- `web.connect` -> Set connected=true, result: `null`
- `daemon.get_version` -> result: `state.version`
- `core.get_torrents_status` -> result: `state.torrents`
- `core.add_torrent_url` / `core.add_torrent_file` -> Record, result: hash
- `core.remove_torrent`, `core.pause_torrent`, `core.resume_torrent` -> Record IDs
- `core.queue_up`, `core.queue_down` -> result: `null`

Export `createDelugeServer(port: number)`.

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/fake-servers/deluge.ts
git commit -m "feat(e2e): add fake Deluge server"
```

---

### Task 7: Fake rTorrent Server

**Files:**

- Create: `e2e/fixtures/fake-servers/rtorrent.ts`

**Protocol:** XML-RPC at `POST /RPC2`. Optional Basic auth. Request: XML `<methodCall>`. Response: XML `<methodResponse>`.

- [ ] **Step 1: Implement the fake server**

**State shape:**

```ts
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
```

**Key implementation:**

- Parse `<methodName>` from request XML body (regex: `/<methodName>(.*?)<\/methodName>/`)
- `system.client_version` -> `<string>{version}</string>`
- `d.multicall2` -> XML array of arrays with `<string>` and `<i8>` values per torrent
- `load.start` / `load.raw_start` -> Record, return `<i8>0</i8>`
- `d.erase`, `d.pause`, `d.resume`, `d.priority.set` -> Record IDs

Use string templates for XML generation. Parse incoming XML with regex.

Export `createRTorrentServer(port: number)`.

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/fake-servers/rtorrent.ts
git commit -m "feat(e2e): add fake rTorrent server"
```

---

### Task 8: Fake SABnzbd Server

**Files:**

- Create: `e2e/fixtures/fake-servers/sabnzbd.ts`

**Protocol:** REST with query params. Auth via `apikey` query param. All responses JSON.

- [ ] **Step 1: Implement the fake server**

**State shape:**

```ts
type State = {
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
```

**Dispatch on `mode` query param** (all GET):

- `version` -> `{ version: state.version }`
- `queue` (no `name`) -> `{ queue: { slots: state.queueSlots } }`
- `queue` + `name=pause` -> Record `value` param
- `queue` + `name=resume` -> Record
- `queue` + `name=delete` -> Record
- `queue` + `name=priority` -> OK
- `addurl` -> Record `{ name, cat }`, return `{ nzo_ids: ["SABnzbd_nzo_xxx"] }`
- `history` (no `name`) -> `{ history: { slots: state.historySlots } }`
- `history` + `name=delete` -> Record

Validate `apikey` query param. Return 403 if wrong.

Export `createSABnzbdServer(port: number)`.

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/fake-servers/sabnzbd.ts
git commit -m "feat(e2e): add fake SABnzbd server"
```

---

### Task 9: Fake NZBGet Server

**Files:**

- Create: `e2e/fixtures/fake-servers/nzbget.ts`

**Protocol:** JSON-RPC at `POST /jsonrpc`. Basic auth. Request: `{ id, method, params }`. Response: `{ id, result }`.

- [ ] **Step 1: Implement the fake server**

**State shape:**

```ts
type State = {
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
```

**Method dispatch:**

- `version` -> result: `state.version`
- `listgroups` -> result: `state.groups`
- `history` -> result: `state.history`
- `append` -> Record to state, result: `1`
- `editqueue` -> Record `{ command: params[0], param: params[1], ids: params[2] }`, result: `true`

Validate Basic auth header.

Export `createNZBGetServer(port: number)`.

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/fake-servers/nzbget.ts
git commit -m "feat(e2e): add fake NZBGet server"
```

---

### Task 10: Fake Newznab Server

**Files:**

- Create: `e2e/fixtures/fake-servers/newznab.ts`

**Protocol:** Newznab/Torznab XML over HTTP. Query params: `t` (caps/search/book), `q`, `cat`, `author`, `title`, `apikey`.

- [ ] **Step 1: Implement the fake server**

**State shape:**

```ts
type State = {
  serverVersion: string;
  apiKey: string;
  releases: Array<{
    guid: string;
    title: string;
    size: number;
    downloadUrl: string;
    magnetUrl?: string;
    publishDate: string; // RFC 2822 format
    seeders?: number;
    peers?: number;
    category: string;
    indexerFlags?: number;
    protocol: "torrent" | "usenet";
  }>;
  searchLog: Array<{ type: string; query: string; categories: string }>;
};
```

**Dispatch on `t` query param** (all GET at `/api`):

- `caps` -> XML: `<?xml version="1.0"?><caps><server version="{serverVersion}" /></caps>`
- `search` or `book` -> Log search params, filter releases by query (substring match on title), return Newznab RSS XML with `<item>` elements containing `<title>`, `<guid>`, `<pubDate>`, `<enclosure>`, and `<newznab:attr>` elements for size/seeders/peers/category/flags/magneturl

Also handle Prowlarr-style test connection paths:

- `GET /api/v1/health` -> 200 with `[]`
- `GET /api/v1/system/status` -> `{ "version": state.serverVersion }`

Validate `apikey` query param.

Export `createNewznabServer(port: number)`.

The Newznab XML response format per release item:

```xml
<item>
  <title>{title}</title>
  <guid isPermaLink="true">{guid}</guid>
  <pubDate>{publishDate}</pubDate>
  <enclosure url="{downloadUrl}" length="{size}" type="application/x-{nzb|bittorrent}" />
  <newznab:attr name="size" value="{size}" />
  <newznab:attr name="seeders" value="{seeders}" />
  <newznab:attr name="peers" value="{peers}" />
  <newznab:attr name="category" value="{category}" />
  <newznab:attr name="flags" value="{indexerFlags}" />
  <newznab:attr name="magneturl" value="{magnetUrl}" />
</item>
```

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/fake-servers/newznab.ts
git commit -m "feat(e2e): add fake Newznab/Torznab server"
```

---

### Task 11: Fake Prowlarr Server

**Files:**

- Create: `e2e/fixtures/fake-servers/prowlarr.ts`

**Protocol:** REST JSON. Auth via `X-Api-Key` header.

- [ ] **Step 1: Implement the fake server**

**State shape:**

```ts
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
```

**Endpoints:**

- `GET /api/v1/health` -> Validate `X-Api-Key`, return `[]`
- `GET /api/v1/system/status` -> `{ "version": state.version }`
- `GET /api/v1/indexer` -> `state.indexers`

Export `createProwlarrServer(port: number)`.

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/fake-servers/prowlarr.ts
git commit -m "feat(e2e): add fake Prowlarr server"
```

---

### Task 12: Fake Hardcover Server

**Files:**

- Create: `e2e/fixtures/fake-servers/hardcover.ts`

**Protocol:** GraphQL over HTTP at `POST /v1/graphql`. Auth via `Authorization: Bearer xxx`. Request: `{ query, variables }`. Response: `{ data }`.

- [ ] **Step 1: Implement the fake server**

**State shape:**

```ts
type State = {
  authors: Array<{
    id: number;
    name: string;
    slug: string;
    bio: string;
    born_year: number | null;
    death_year: number | null;
    image: { url: string };
  }>;
  books: Array<{
    id: number;
    title: string;
    slug: string;
    description: string;
    release_date: string | null;
    release_year: number | null;
    rating: number | null;
    ratings_count: number | null;
    users_count: number | null;
    compilation: boolean;
    default_cover_edition_id: number | null;
    image: { url: string };
    authorId: number; // for filtering by author
    contributions: Array<{
      contribution: string | null;
      author: {
        id: number;
        name: string;
        slug: string;
        image: { url: string };
      };
    }>;
    book_series: Array<{
      position: string | null;
      series: { id: number; name: string; slug: string; is_completed: boolean };
    }>;
  }>;
  editions: Array<{
    id: number;
    bookId: number;
    title: string;
    isbn_10: string | null;
    isbn_13: string | null;
    asin: string | null;
    pages: number | null;
    audio_seconds: number | null;
    release_date: string | null;
    users_count: number | null;
    score: number | null;
    image: { url: string };
    language: { code2: string; language: string } | null;
    reading_format: { format: string } | null;
    publisher: { name: string } | null;
  }>;
  searchResults: Array<{
    id: number;
    type: "book" | "author";
    slug: string;
    title: string;
    readers?: number;
    coverUrl?: string;
  }>;
};
```

**Query dispatch** (match on query string content):

- Contains `search(` or `Search` -> Return search results
- Contains `AuthorComplete` or `authors(where` -> Match `variables.authorId`, return author + filtered books + books_aggregate
- Contains `editions(where` (batched) -> Parse aliases, return editions grouped by bookId
- Contains `series(where` -> Return matching series with books + editions

Export `createHardcoverServer(port: number)`.

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/fake-servers/hardcover.ts
git commit -m "feat(e2e): add fake Hardcover GraphQL server"
```

---

## Phase 3: Test Infrastructure

### Task 13: Global Setup and Teardown

**Files:**

- Create: `e2e/global-setup.ts`
- Create: `e2e/global-teardown.ts`

- [ ] **Step 1: Create global-setup.ts**

The global setup:

1. Creates a template SQLite DB by running `drizzle-kit push` with a test DB path
2. Starts all 9 fake servers and stores references for teardown
3. Writes fake server URLs to a state file that test fixtures read

```ts
import { execFileSync } from "child_process";
import { join } from "path";
import { writeFileSync, existsSync, unlinkSync } from "fs";
import { PORTS } from "./ports";

// Import all fake server creators
import { createQBittorrentServer } from "./fixtures/fake-servers/qbittorrent";
// ... (import all 9 server creators)

const TEMPLATE_DB_PATH = join(__dirname, "..", "data", "test-template.db");
const STATE_FILE = join(__dirname, ".test-state.json");

async function globalSetup() {
  // 1. Create template DB
  if (existsSync(TEMPLATE_DB_PATH)) unlinkSync(TEMPLATE_DB_PATH);

  execFileSync("bun", ["run", "db:push"], {
    cwd: join(__dirname, ".."),
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: TEMPLATE_DB_PATH },
  });

  // 2. Start all fake servers
  const servers = {
    qbittorrent: createQBittorrentServer(PORTS.QBITTORRENT),
    transmission: createTransmissionServer(PORTS.TRANSMISSION),
    deluge: createDelugeServer(PORTS.DELUGE),
    rtorrent: createRTorrentServer(PORTS.RTORRENT),
    sabnzbd: createSABnzbdServer(PORTS.SABNZBD),
    nzbget: createNZBGetServer(PORTS.NZBGET),
    newznab: createNewznabServer(PORTS.NEWZNAB),
    prowlarr: createProwlarrServer(PORTS.PROWLARR),
    hardcover: createHardcoverServer(PORTS.HARDCOVER),
  };

  // 3. Write state file
  writeFileSync(
    STATE_FILE,
    JSON.stringify({
      templateDbPath: TEMPLATE_DB_PATH,
      servers: Object.fromEntries(
        Object.entries(PORTS)
          .filter(([k]) => k !== "APP_BASE")
          .map(([k, v]) => [k, `http://localhost:${v}`]),
      ),
    }),
  );

  (globalThis as any).__fakeServers = servers;
}

export default globalSetup;
```

- [ ] **Step 2: Create global-teardown.ts**

```ts
import { unlinkSync, existsSync } from "fs";
import { join } from "path";

const STATE_FILE = join(__dirname, ".test-state.json");
const TEMPLATE_DB_PATH = join(__dirname, "..", "data", "test-template.db");

async function globalTeardown() {
  const servers = (globalThis as any).__fakeServers;
  if (servers) {
    for (const server of Object.values(servers)) {
      (server as any).stop();
    }
  }
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  if (existsSync(TEMPLATE_DB_PATH)) unlinkSync(TEMPLATE_DB_PATH);
}

export default globalTeardown;
```

- [ ] **Step 3: Commit**

```bash
git add e2e/global-setup.ts e2e/global-teardown.ts
git commit -m "feat(e2e): add global setup and teardown"
```

---

### Task 14: Playwright Config

**Files:**

- Create: `e2e/playwright.config.ts`
- Modify: `package.json` (add test script)

- [ ] **Step 1: Create config**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
});
```

- [ ] **Step 2: Add test script**

Add to `package.json` scripts:

```json
"test:e2e": "bunx playwright test --config e2e/playwright.config.ts"
```

- [ ] **Step 3: Commit**

```bash
git add e2e/playwright.config.ts package.json
git commit -m "feat(e2e): add Playwright config and test script"
```

---

### Task 15: Test DB Helpers

**Files:**

- Create: `e2e/fixtures/test-db.ts`

- [ ] **Step 1: Create DB helpers**

Uses `better-sqlite3` (since Playwright runs on Node, not Bun) to copy the template DB and provide drizzle access for seeding/assertions.

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { copyFileSync, unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import * as schema from "../../src/db/schema";

const STATE_FILE = join(__dirname, "..", ".test-state.json");

export function getTestState() {
  return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
}

export function createTestDb(suiteId: string) {
  const { templateDbPath } = getTestState();
  const dbPath = join(
    __dirname,
    "..",
    "..",
    "data",
    `test-${suiteId}-${Date.now()}.db`,
  );
  copyFileSync(templateDbPath, dbPath);

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  return {
    db,
    dbPath,
    close: () => sqlite.close(),
    cleanup: () => {
      sqlite.close();
      if (existsSync(dbPath)) unlinkSync(dbPath);
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/test-db.ts
git commit -m "feat(e2e): add test DB helpers"
```

---

### Task 16: Custom Test Fixture

**Files:**

- Create: `e2e/fixtures/app.ts`

- [ ] **Step 1: Create fixture**

Provides per-worker app server, per-test DB access, fake server URLs, and temp dirs. Resets all fake servers before each test.

Key structure:

```ts
import { test as base } from "@playwright/test";
import { spawn } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PORTS } from "../ports";
import { createTestDb, getTestState } from "./test-db";

export const test = base.extend<AppFixtures, WorkerFixtures>({
  appServer: [
    async ({}, use, workerInfo) => {
      const port = PORTS.APP_BASE + workerInfo.workerIndex;
      const dbHandle = createTestDb(`worker-${workerInfo.workerIndex}`);
      const state = getTestState();

      const proc = spawn(
        "bun",
        ["--bun", "vite", "dev", "--port", String(port)],
        {
          env: {
            ...process.env,
            DATABASE_URL: dbHandle.dbPath,
            HARDCOVER_GRAPHQL_URL: state.servers.HARDCOVER,
            BETTER_AUTH_SECRET: "test-secret-for-e2e",
            BETTER_AUTH_URL: `http://localhost:${port}`,
            HARDCOVER_TOKEN: "Bearer test-hardcover-token",
          },
          cwd: join(__dirname, "..", ".."),
          stdio: "pipe",
        },
      );

      await waitForServer(`http://localhost:${port}`, 30_000);
      await use({ url: `http://localhost:${port}`, dbHandle, proc });
      proc.kill();
      dbHandle.cleanup();
    },
    { scope: "worker", timeout: 60_000 },
  ],

  appUrl: async ({ appServer }, use) => {
    await use(appServer.url);
  },
  db: async ({ appServer }, use) => {
    await use(appServer.dbHandle.db);
  },
  fakeServers: async ({}, use) => {
    await use(getTestState().servers);
  },
  tempDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "allstarr-e2e-"));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
});

// Reset fake servers before each test
test.beforeEach(async ({}) => {
  const state = getTestState();
  await Promise.all(
    Object.values(state.servers).map((url) =>
      fetch(`${url as string}/__reset`, { method: "POST" }).catch(() => {}),
    ),
  );
});

export { expect } from "@playwright/test";
```

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/app.ts
git commit -m "feat(e2e): add custom Playwright test fixture"
```

---

### Task 17: Helpers and Seed Data

**Files:**

- Create: `e2e/helpers/auth.ts`
- Create: `e2e/helpers/navigation.ts`
- Create: `e2e/helpers/sse.ts`
- Create: `e2e/fixtures/seed-data.ts`

- [ ] **Step 1: Create auth helpers**

Provides `registerUser(page, baseUrl)`, `loginUser(page, baseUrl)`, `ensureAuthenticated(page, baseUrl)`, and `TEST_USER` constant.

Key details:

- Register: go to `/register`, fill Name/Email/Password, click submit, wait for redirect to `/`
- Login: go to `/login`, fill Email/Password, click submit, wait for redirect
- UI labels: "Name", "Email", "Password" (via `getByLabel`)
- Button text: register/sign up (register page), login/sign in (login page)

- [ ] **Step 2: Create navigation helpers**

Provides `navigateTo(page, baseUrl, path)` with `waitForLoadState("networkidle")`.

- [ ] **Step 3: Create SSE helpers**

Provides `captureSSEEvents(page, baseUrl, eventTypes, action, timeoutMs)` that opens an EventSource, performs an action, and returns captured events.

- [ ] **Step 4: Create seed data factories**

Provides factory functions for direct DB insertion via drizzle:

- `seedDownloadProfile(db, overrides?)`
- `seedAuthor(db, overrides?)`
- `seedBook(db, authorId, overrides?)` -- also creates booksAuthors join
- `seedEdition(db, bookId, overrides?)`
- `seedDownloadClient(db, overrides?)` -- defaults to qBittorrent at port 19001
- `seedIndexer(db, overrides?)` -- defaults to Newznab at port 19007
- `seedTrackedDownload(db, overrides?)`
- `seedBlocklistEntry(db, overrides?)`
- `seedSetting(db, key, value)` -- upserts a setting

Each factory returns the inserted row. All use sensible defaults that can be overridden.

- [ ] **Step 5: Commit**

```bash
git add e2e/helpers/ e2e/fixtures/seed-data.ts
git commit -m "feat(e2e): add auth, navigation, SSE helpers and seed data factories"
```

---

## Phase 4: Test Suites

Each test suite imports `test` and `expect` from `e2e/fixtures/app.ts`, uses helpers for auth/navigation, and seeds data via the `db` fixture. Fake server state is set via `fetch("/__control", ...)`.

### Task 18: Auth Tests (01-auth.spec.ts)

**Files:**

- Create: `e2e/tests/01-auth.spec.ts`

- [ ] **Step 1: Write auth tests**

6 tests: register, login, wrong password, unauthenticated redirect, session persistence, logout.

Pattern for each:

1. Navigate to register/login page
2. Fill form fields via `getByLabel("Name")`, `getByLabel("Email")`, `getByLabel("Password")`
3. Submit via `getByRole("button", { name: /register|sign up/i })`
4. Assert URL redirect and page content

Key assertions:

- Register: redirects to `/`, session cookie set
- Login: redirects to `/`, username visible
- Wrong password: stays on `/login`, error message visible
- Unauthenticated: `/bookshelf` redirects to `/login`
- Persistence: reload keeps auth
- Logout: redirects to `/login`, subsequent protected route access redirects

- [ ] **Step 2: Run and verify**

```bash
bun run test:e2e -- --grep "Auth"
```

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/01-auth.spec.ts
git commit -m "feat(e2e): add auth test suite"
```

---

### Task 19: Settings and Config Tests (02-settings-config.spec.ts)

**Files:**

- Create: `e2e/tests/02-settings-config.spec.ts`

- [ ] **Step 1: Write settings tests**

Largest suite. Organized into `test.describe` blocks:

**Download Clients** (~11 tests):

- For each of 6 client types: add via form (pointing at fake server port), test connection (verify version in success message)
- Edit, delete, connection failure
- UI: page at `/settings/download-clients`, "Add Client" button, implementation dropdown, form fields (name, host, port, username, password, apiKey, category), "Test" button, "Save" button

**Indexers** (~6 tests):

- Add Newznab/Torznab, test connection, categories, client override, delete
- UI: page at `/settings/indexers`, "Add Indexer" button

**Prowlarr Sync** (~3 tests):

- Configure Prowlarr URL, sync, override synced indexer settings

**Download Profiles** (~3 tests):

- Create, edit, delete
- UI: page at `/settings/profiles`, "Add Profile" button

**Metadata Profile** (~2 tests):

- Language filters, minimum pages/popularity
- UI: page at `/settings/metadata`, "Save Profile" button

**General Settings** (~2 tests):

- API key regeneration, media management toggles
- UI: page at `/settings/general`, "Regenerate API Key" button

Each test uses `ensureAuthenticated()` in `beforeEach`, then navigates to the settings page.

Before connection tests, set up fake server state:

```ts
await fetch(`${fakeServers.QBITTORRENT}/__control`, {
  method: "POST",
  body: JSON.stringify({ version: "v4.6.3" }),
});
```

- [ ] **Step 2: Run and verify**

```bash
bun run test:e2e -- --grep "Settings"
```

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/02-settings-config.spec.ts
git commit -m "feat(e2e): add settings and configuration test suite"
```

---

### Task 20: Author/Book Import Tests (03-author-book-import.spec.ts)

**Files:**

- Create: `e2e/tests/03-author-book-import.spec.ts`

- [ ] **Step 1: Write import tests**

12 tests. `beforeAll`: seed download profile and download client via `db` fixture.

Before Hardcover-dependent tests, configure fake server:

```ts
await fetch(`${fakeServers.HARDCOVER}/__control`, {
  method: "POST",
  body: JSON.stringify({ searchResults: [...], authors: [...], books: [...], editions: [...] }),
});
```

Key UI interactions:

- Search: `/bookshelf/add` page, search input (placeholder varies by tab), submit button with Search icon
- Results: grid of cards with "View Author Details" / "View Book Details" buttons
- Import: AuthorPreviewModal (dialog), "Add Author" button inside it
- Bookshelf browsing: `/bookshelf/authors`, `/bookshelf/books` with search inputs, table/grid views
- Book detail: `/bookshelf/books/{id}` with tabs "Editions" and "Search Releases"
- Profile assignment: profile toggle icons/buttons on author and edition views

DB assertions for metadata filtering:

```ts
const editions = db.select().from(schema.editions).all();
expect(editions.every((e) => e.language === "en")).toBe(true);
```

- [ ] **Step 2: Run and commit**

```bash
bun run test:e2e -- --grep "Import"
git add e2e/tests/03-author-book-import.spec.ts
git commit -m "feat(e2e): add author/book import test suite"
```

---

### Task 21: Search and Grab Tests (04-search-grab.spec.ts)

**Files:**

- Create: `e2e/tests/04-search-grab.spec.ts`

- [ ] **Step 1: Write search and grab tests**

8 tests. `beforeAll`: seed author, book, edition, indexer (Newznab at port 19007), download client (qBittorrent at port 19001).

Before search tests, configure fake Newznab with releases:

```ts
await fetch(`${fakeServers.NEWZNAB}/__control`, {
  method: "POST",
  body: JSON.stringify({
    releases: [
      {
        guid: "r1",
        title: "Test Author - Test Book [EPUB]",
        size: 5242880,
        downloadUrl: "http://example.com/r1.nzb",
        publishDate: "Mon, 20 Mar 2026 12:00:00 GMT",
        category: "7020",
        protocol: "usenet",
      },
      {
        guid: "r2",
        title: "Test Author - Test Book [MOBI]",
        size: 3145728,
        downloadUrl: "http://example.com/r2.torrent",
        magnetUrl: "magnet:?xt=...",
        seeders: 10,
        peers: 15,
        category: "7020",
        protocol: "torrent",
      },
    ],
  }),
});
```

Key flows:

- Navigate to book detail, click "Search Releases" tab, trigger search
- Verify releases displayed with quality info
- Click "Grab" -> verify fake qBittorrent state has new addedDownload, DB has trackedDownload + history entry
- For usenet: seed SABnzbd client + usenet indexer, grab NZB release

After grab, assert DB state:

```ts
const tracked = db.select().from(schema.trackedDownloads).all();
expect(tracked).toHaveLength(1);
```

And fake server state:

```ts
const state = await fetch(`${fakeServers.QBITTORRENT}/__state`).then((r) =>
  r.json(),
);
expect(state.addedDownloads).toHaveLength(1);
```

- [ ] **Step 2: Run and commit**

```bash
bun run test:e2e -- --grep "Search"
git add e2e/tests/04-search-grab.spec.ts
git commit -m "feat(e2e): add search and grab test suite"
```

---

### Task 22: Queue Management Tests (05-queue-management.spec.ts)

**Files:**

- Create: `e2e/tests/05-queue-management.spec.ts`

- [ ] **Step 1: Write queue tests**

9 tests. `beforeAll`: seed download clients (qBittorrent + SABnzbd), tracked downloads.

Before each queue test, configure fake servers with active downloads:

```ts
await fetch(`${fakeServers.QBITTORRENT}/__control`, {
  method: "POST",
  body: JSON.stringify({
    torrents: [
      {
        hash: "abc123",
        name: "Test Book [EPUB]",
        state: "downloading",
        size: 5242880,
        downloaded: 2621440,
        dlspeed: 1048576,
        save_path: "/downloads",
      },
    ],
  }),
});
```

Key UI on `/activity` page:

- Queue tab with download rows showing progress, speed, ETA
- Action buttons: pause, resume, remove (with optional blocklist checkbox)
- Connection warning banner when client unreachable
- SSE indicator for real-time updates

For SSE tests, use the SSE helper to capture events while triggering state changes.

- [ ] **Step 2: Run and commit**

```bash
bun run test:e2e -- --grep "Queue"
git add e2e/tests/05-queue-management.spec.ts
git commit -m "feat(e2e): add queue management test suite"
```

---

### Task 23: Auto-Search Tests (06-auto-search.spec.ts)

**Files:**

- Create: `e2e/tests/06-auto-search.spec.ts`

- [ ] **Step 1: Write auto-search tests**

9 tests. `beforeAll`: seed complete setup (author, books, editions with download profiles, indexer, download client). Configure fake Newznab with releases matching book titles.

Most tests trigger the rss-sync task via the UI (`/system/tasks` page, click "Run Now") and then verify DB state.

Key assertions:

- `trackedDownloads` table for grabs
- `history` table for search events
- Fake server `searchLog` for indexer queries
- Fake server `addedDownloads` for client grabs

For cutoff/upgrade tests, seed `bookFiles` entries with specific quality IDs and verify whether auto-search creates new tracked downloads.

- [ ] **Step 2: Run and commit**

```bash
bun run test:e2e -- --grep "Auto"
git add e2e/tests/06-auto-search.spec.ts
git commit -m "feat(e2e): add auto-search test suite"
```

---

### Task 24: Download Lifecycle Tests (07-download-lifecycle.spec.ts)

**Files:**

- Create: `e2e/tests/07-download-lifecycle.spec.ts`

- [ ] **Step 1: Write lifecycle tests**

8 tests. `beforeAll`: seed tracked download (queued state), download client, download profile with rootFolderPath=tempDir.

Tests simulate download progression by updating fake server state and triggering the refresh-downloads task:

1. Set fake qBittorrent torrent state to "downloading" -> trigger refresh -> verify tracked download updated
2. Create dummy book file in tempDir download path, set state to "uploading" (completed) -> trigger refresh -> verify file imported, bookFiles created

File setup for import tests:

```ts
const downloadDir = join(
  tempDir,
  "downloads",
  "Test Author - Test Book [EPUB]",
);
mkdirSync(downloadDir, { recursive: true });
writeFileSync(join(downloadDir, "book.epub"), "dummy epub content");
```

For hard link test: check inode via `statSync().ino` comparison between source and destination.

- [ ] **Step 2: Run and commit**

```bash
bun run test:e2e -- --grep "Lifecycle"
git add e2e/tests/07-download-lifecycle.spec.ts
git commit -m "feat(e2e): add download lifecycle test suite"
```

---

### Task 25: Disk Scan Tests (08-disk-scan.spec.ts)

**Files:**

- Create: `e2e/tests/08-disk-scan.spec.ts`

- [ ] **Step 1: Write disk scan tests**

7 tests. `beforeAll`: seed author/book, download profile with rootFolderPath=tempDir.

Create folder structures in tempDir matching expected patterns:

```ts
const bookDir = join(tempDir, "Test Author", "Test Book (2024)");
mkdirSync(bookDir, { recursive: true });
writeFileSync(join(bookDir, "book.epub"), "dummy content");
```

Trigger scan via `/system/tasks` page (click "Run Now" on rescan-folders).

Assert via DB: `bookFiles` entries created/removed, `history` entries for fileAdded/fileRemoved.

- [ ] **Step 2: Run and commit**

```bash
bun run test:e2e -- --grep "Disk"
git add e2e/tests/08-disk-scan.spec.ts
git commit -m "feat(e2e): add disk scan test suite"
```

---

### Task 26: System Health Tests (09-system-health.spec.ts)

**Files:**

- Create: `e2e/tests/09-system-health.spec.ts`

- [ ] **Step 1: Write health tests**

9 tests at `/system/status` and `/system/tasks`.

For healthy status: seed complete config (client, indexer, Hardcover token, valid root folder in tempDir).
For warnings: delete/clear specific config and verify health warnings appear.

Key UI elements:

- "All systems healthy" with CheckCircle (green) when no issues
- AlertTriangle/AlertCircle icons with warning/error badges
- Disk space progress bars
- About section with system info in monospace
- Tasks table with Name, Interval, Status badge, "Run Now" button

- [ ] **Step 2: Run and commit**

```bash
bun run test:e2e -- --grep "Health"
git add e2e/tests/09-system-health.spec.ts
git commit -m "feat(e2e): add system health test suite"
```

---

### Task 27: Blocklist and Failure Tests (10-blocklist-failure.spec.ts)

**Files:**

- Create: `e2e/tests/10-blocklist-failure.spec.ts`

- [ ] **Step 1: Write blocklist tests**

9 tests. `beforeAll`: seed tracked download, download client, indexer. Configure settings for redownloadFailed and removeFailed.

For failure detection: set fake qBittorrent torrent state to "error", trigger refresh-downloads task.

Key UI at `/activity/blocklist`:

- Table with source title, indexer, date, reason columns
- Remove button per row
- Bulk select + remove action

For auto-re-search: verify that after failure + blocklist, a new trackedDownload is created for the book (next-best release).

- [ ] **Step 2: Run and commit**

```bash
bun run test:e2e -- --grep "Blocklist"
git add e2e/tests/10-blocklist-failure.spec.ts
git commit -m "feat(e2e): add blocklist and failure recovery test suite"
```

---

## Phase 5: Final Verification

### Task 28: Full Test Run and Cleanup

- [ ] **Step 1: Update .gitignore**

Add:

```
# E2E test artifacts
e2e/.test-state.json
data/test-*.db
test-results/
playwright-report/
```

- [ ] **Step 2: Run full test suite**

```bash
bun run test:e2e
```

Expected: All 10 test suites pass.

- [ ] **Step 3: Fix any failures**

Debug and fix any test failures. Common issues:

- Selector mismatches (check actual button text/labels in the UI)
- Timing issues (add appropriate `waitFor` calls)
- Fake server response format mismatches (compare with actual client parsing)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(e2e): complete Playwright e2e test suite"
```
