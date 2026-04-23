# Compose-Live Golden Fixture Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the compose-backed live captures into the canonical fake-server golden fixtures, wire every E2E flow to immutable named scenarios, and add capture/parity tooling so fixture refreshes can be regenerated from real services.

**Architecture:** Add a golden-fixture layer that stores exact captured endpoint payloads and scenario manifests, then teach the fake-server runtime to seed those immutable states into replay-oriented fake services. Keep write-path assertions deterministic by recording requests separately from the immutable read fixtures, and stage the migration through focused runtime tests, capture-tool tests, and Playwright scenario updates.

**Tech Stack:** TypeScript, Bun, Vitest, Playwright, Node HTTP servers, JSON golden fixtures, Docker Compose

---

## File Structure

- Create: `e2e/fixtures/golden/loaders.ts`
  Purpose: load service states and scenario manifests from checked-in golden fixture directories.
- Create: `e2e/fixtures/golden/loaders.test.ts`
  Purpose: prove scenario parsing, service-state loading, and missing-file errors.
- Create: `e2e/fixtures/golden/capture.ts`
  Purpose: fetch live service endpoints, scrub secrets only, and write captured payload files.
- Create: `e2e/fixtures/golden/capture.test.ts`
  Purpose: lock the scrubber and capture file-shape behavior.
- Create: `e2e/fixtures/golden/compose-live.ts`
  Purpose: define the Docker Compose service map, live endpoints, and capture profile for every fake service in the repo.
- Create: `e2e/fixtures/golden/compose-live.test.ts`
  Purpose: prove the compose-live capture manifest covers every fake service and emits stable output paths.
- Create: `e2e/fixtures/golden/README.md`
  Purpose: document the capture, promotion, and scenario update workflow.
- Create: `e2e/fixtures/golden/scenarios/imports-all-sources-mapped.json`
- Create: `e2e/fixtures/golden/scenarios/search-grab-torrent.json`
- Create: `e2e/fixtures/golden/scenarios/search-grab-usenet.json`
- Create: `e2e/fixtures/golden/scenarios/settings-config-default.json`
- Create: `e2e/fixtures/golden/scenarios/queue-management-default.json`
- Create: `e2e/fixtures/golden/scenarios/auto-search-default.json`
- Create: `e2e/fixtures/golden/scenarios/auto-search-rejected.json`
- Create: `e2e/fixtures/golden/scenarios/download-lifecycle-default.json`
- Create: `e2e/fixtures/golden/scenarios/blocklist-failure-default.json`
- Create: `e2e/fixtures/golden/scenarios/monitor-discovery-default.json`
- Create: `e2e/fixtures/golden/scenarios/author-book-import-default.json`
  Purpose: map each Playwright workflow to immutable per-service state names.
- Create: `e2e/fixtures/golden/services/qbittorrent/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/transmission/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/deluge/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/rtorrent/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/sabnzbd/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/nzbget/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/newznab/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/prowlarr/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/sonarr/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/radarr/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/readarr/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/bookshelf/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/tmdb/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/hardcover/compose-live/state.json`
  Purpose: promote the compose-backed live captures into canonical service states.
- Create: `e2e/fixtures/golden/_captures/live-compose/readarr/compose-live/get__api_v1_author__authors.json`
- Create: `e2e/fixtures/golden/_captures/live-compose/readarr/compose-live/get__api_v1_book__books.json`
  Purpose: store the source-derived temporary Readarr placeholders until BookInfo is reachable again.
- Create: `scripts/capture-compose-live-fixtures.ts`
  Purpose: entrypoint for recapturing live service payloads from the Docker Compose stack.
- Create: `scripts/promote-compose-live-fixtures.ts`
  Purpose: copy scrubbed capture files into canonical `services/<service>/<state>/state.json` fixtures.
- Modify: `package.json`
  Purpose: add repeatable capture and promotion scripts.
- Modify: `compose.yml`
  Purpose: expose the live-capture profile for every supported fake service.
- Modify: `e2e/fixtures/fake-servers/base.ts`
  Purpose: add whole-state seeding and immutable reset support.
- Create: `e2e/fixtures/fake-servers/replay.ts`
  Purpose: match captured routes exactly, including status, headers, and raw response bodies.
- Create: `e2e/fixtures/fake-servers/replay.test.ts`
  Purpose: prove exact route replay, auth passthrough, and write-request recording.
- Modify: `e2e/fixtures/fake-servers/manager.ts`
  Purpose: load named scenarios, seed service state on startup/reset, and allow test-time scenario swaps.
- Modify: `e2e/fixtures/fake-servers/manager.test.ts`
  Purpose: verify scenario startup, reset, and swap semantics.
- Modify: `e2e/fixtures/fake-servers/qbittorrent.ts`
- Modify: `e2e/fixtures/fake-servers/transmission.ts`
- Modify: `e2e/fixtures/fake-servers/deluge.ts`
- Modify: `e2e/fixtures/fake-servers/rtorrent.ts`
- Modify: `e2e/fixtures/fake-servers/sabnzbd.ts`
- Modify: `e2e/fixtures/fake-servers/nzbget.ts`
- Modify: `e2e/fixtures/fake-servers/newznab.ts`
- Modify: `e2e/fixtures/fake-servers/prowlarr.ts`
- Modify: `e2e/fixtures/fake-servers/sonarr.ts`
- Modify: `e2e/fixtures/fake-servers/radarr.ts`
- Modify: `e2e/fixtures/fake-servers/readarr.ts`
- Modify: `e2e/fixtures/fake-servers/bookshelf.ts`
- Modify: `e2e/fixtures/fake-servers/tmdb.ts`
- Modify: `e2e/fixtures/fake-servers/hardcover.ts`
  Purpose: switch each fake service from handwritten response shaping to exact replay from seeded captured fixtures while still recording writes.
- Modify: `e2e/fixtures/app.ts`
  Purpose: add worker-scoped `fakeServerScenario`, expose `setFakeServerScenario`, and reset services to scenario state before each test.
- Modify: `e2e/tests/02-settings-config.spec.ts`
- Modify: `e2e/tests/03-author-book-import.spec.ts`
- Modify: `e2e/tests/04-search-grab.spec.ts`
- Modify: `e2e/tests/05-queue-management.spec.ts`
- Modify: `e2e/tests/06-auto-search.spec.ts`
- Modify: `e2e/tests/07-download-lifecycle.spec.ts`
- Modify: `e2e/tests/10-blocklist-failure.spec.ts`
- Modify: `e2e/tests/12-monitor-discovery.spec.ts`
- Modify: `e2e/tests/13-servarr-import.spec.ts`
  Purpose: bind each workflow to an immutable named scenario and remove inline fake-server mutation from test setup.
- Modify: `src/server/imports/apply.test.ts`
  Purpose: tighten full-object assertions for persisted import records that the Playwright import flow should prove end to end.

## Task 1: Build the Golden Fixture Loader and Scenario Runtime

**Files:**
- Create: `e2e/fixtures/golden/loaders.ts`
- Create: `e2e/fixtures/golden/loaders.test.ts`
- Modify: `e2e/fixtures/fake-servers/base.ts`
- Modify: `e2e/fixtures/fake-servers/manager.ts`
- Modify: `e2e/fixtures/fake-servers/manager.test.ts`
- Modify: `e2e/fixtures/app.ts`
- Test: `e2e/fixtures/golden/loaders.test.ts`
- Test: `e2e/fixtures/fake-servers/manager.test.ts`

- [ ] **Step 1: Write the failing loader and manager tests**

```ts
// e2e/fixtures/golden/loaders.test.ts
import { describe, expect, it } from "vitest";
import {
	loadGoldenScenario,
	loadGoldenServiceState,
} from "./loaders";

describe("golden fixture loaders", () => {
	it("loads a scenario manifest by name", () => {
		expect(loadGoldenScenario("imports-all-sources-mapped")).toEqual({
			BOOKSHELF: "compose-live",
			HARDCOVER: "compose-live",
			RADARR: "compose-live",
			READARR: "compose-live",
			SONARR: "compose-live",
			TMDB: "compose-live",
		});
	});

	it("loads a service state by service and state name", () => {
		const state = loadGoldenServiceState("QBITTORRENT", "compose-live");
		expect(state.routes["GET /api/v2/app/version"]).toMatchObject({
			status: 200,
			body: "v4.6.0",
		});
	});
});

// e2e/fixtures/fake-servers/manager.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { createFakeServerManager } from "./manager";

afterEach(async () => {
	// Each test stops its manager explicitly; this hook is just a guard.
});

describe("createFakeServerManager", () => {
	it("starts services from a named scenario and resets back to that seeded state", async () => {
		const manager = createFakeServerManager(["QBITTORRENT"], "search-grab-torrent");

		await manager.start();
		const urls = manager.getUrls();
		const initial = await fetch(`${urls.QBITTORRENT}/__state`).then((r) => r.json());
		expect(initial.routes["GET /api/v2/app/version"].body).toBe("v4.6.0");

		await fetch(`${urls.QBITTORRENT}/__seed`, {
			method: "POST",
			body: JSON.stringify({
				...initial,
				routes: {
					...initial.routes,
					"GET /api/v2/app/version": {
						...initial.routes["GET /api/v2/app/version"],
						body: "v9.9.9",
					},
				},
			}),
		});

		await manager.reset();

		const reset = await fetch(`${urls.QBITTORRENT}/__state`).then((r) => r.json());
		expect(reset.routes["GET /api/v2/app/version"].body).toBe("v4.6.0");

		await manager.stop();
	});

	it("swaps scenarios for running services", async () => {
		const manager = createFakeServerManager(["NEWZNAB"], "search-grab-torrent");

		await manager.start();
		await manager.setScenario("search-grab-usenet");
		const urls = manager.getUrls();
		const state = await fetch(`${urls.NEWZNAB}/__state`).then((r) => r.json());
		expect(state.routes["GET /api"].body).toContain("tv.torrentleech.org");

		await manager.stop();
	});
});
```

- [ ] **Step 2: Run the focused runtime tests to verify the new loader/runtime behavior is missing**

Run: `bun run test -- e2e/fixtures/golden/loaders.test.ts e2e/fixtures/fake-servers/manager.test.ts`
Expected: FAIL because `loaders.ts` does not exist, `createFakeServerManager` does not accept a scenario name, and fake servers do not support `__seed`.

- [ ] **Step 3: Create the loader module with exact scenario and service-state parsing**

```ts
// e2e/fixtures/golden/loaders.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PORTS from "../../ports";

export type ServiceName = Exclude<keyof typeof PORTS, "APP_BASE">;
export type GoldenRouteResponse = {
	status: number;
	headers: Record<string, string>;
	body: string;
};
export type GoldenServiceState = {
	routes: Record<string, GoldenRouteResponse>;
	recordedWrites: Array<{
		method: string;
		path: string;
		body: string;
		headers: Record<string, string>;
	}>;
};
export type GoldenScenario = Partial<Record<ServiceName, string>>;

const ROOT = join(process.cwd(), "e2e/fixtures/golden");

export function loadGoldenScenario(name: string): GoldenScenario {
	return JSON.parse(
		readFileSync(join(ROOT, "scenarios", `${name}.json`), "utf8"),
	) as GoldenScenario;
}

export function loadGoldenServiceState(
	service: ServiceName,
	stateName: string,
): GoldenServiceState {
	return JSON.parse(
		readFileSync(
			join(ROOT, "services", service.toLowerCase(), stateName, "state.json"),
			"utf8",
		),
	) as GoldenServiceState;
}
```

- [ ] **Step 4: Extend the base fake-server runtime so tests can seed and reset whole immutable states**

```ts
// e2e/fixtures/fake-servers/base.ts
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

function cloneState<TState>(value: TState): TState {
	return JSON.parse(JSON.stringify(value)) as TState;
}

export function createFakeServer<TState extends object>(
	opts: FakeServerOptions<TState>,
): FakeServer<TState> {
	let seededDefault = cloneState(opts.defaultState());
	let state = cloneState(seededDefault);

	const server = createServer(async (req, res) => {
		const url = new URL(req.url || "/", `http://localhost:${opts.port}`);
		const body = await readBody(req);

		if (url.pathname === "/__seed" && req.method === "POST") {
			seededDefault = cloneState(JSON.parse(body) as TState);
			state = cloneState(seededDefault);
			res.writeHead(200).end("OK");
			return;
		}

		if (url.pathname === "/__reset" && req.method === "POST") {
			state = cloneState(seededDefault);
			res.writeHead(200).end("OK");
			return;
		}

		if (url.pathname === "/__state" && req.method === "GET") {
			sendJson(res, state);
			return;
		}

		const result = opts.handler(req, body, state);
		if (result) {
			res.writeHead(result.status || 200, result.headers || {}).end(result.body);
			return;
		}
		res.writeHead(404).end("Not Found");
	});

	return {
		server,
		url: `http://localhost:${opts.port}`,
		reset: () => {
			state = cloneState(seededDefault);
		},
		seed: (nextState) => {
			seededDefault = cloneState(nextState);
			state = cloneState(nextState);
		},
		stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}
```

- [ ] **Step 5: Update the fake-server manager and Playwright fixture layer to use named scenarios**

```ts
// e2e/fixtures/fake-servers/manager.ts
import {
	loadGoldenScenario,
	loadGoldenServiceState,
	type ServiceName,
} from "../golden/loaders";

export function createFakeServerManager(
	requiredServices: ServiceName[],
	scenarioName?: string,
) {
	const names = [...new Set(requiredServices)];
	const running = new Map<ServiceName, ManagedServer>();
	let activeScenario = scenarioName;

	async function seedScenario(name?: string) {
		if (!name) {
			return;
		}

		const scenario = loadGoldenScenario(name);
		await Promise.all(
			names.map(async (serviceName) => {
				const stateName = scenario[serviceName];
				if (!stateName) {
					return;
				}
				const server = running.get(serviceName);
				if (!server) {
					return;
				}
				await fetch(`${server.url}/__seed`, {
					method: "POST",
					body: JSON.stringify(loadGoldenServiceState(serviceName, stateName)),
				});
			}),
		);
	}

	return {
		async start() {
			for (const name of names) {
				if (!running.has(name)) {
					running.set(name, factories[name]());
				}
			}
			await Promise.all([...running.values()].map((server) => waitForServer(server.url)));
			await seedScenario(activeScenario);
		},
		async reset() {
			if (activeScenario) {
				await seedScenario(activeScenario);
				return;
			}
			await Promise.all(
				[...running.values()].map((server) =>
					fetch(`${server.url}/__reset`, { method: "POST" }),
				),
			);
		},
		async setScenario(name: string) {
			activeScenario = name;
			await seedScenario(name);
		},
	};
}

// e2e/fixtures/app.ts
type WorkerFixtures = {
	appServer: AppServer;
	serviceManager: FakeServerManager;
	requiredServices: ServiceName[];
	fakeServerScenario?: string;
};

type AppFixtures = {
	appUrl: string;
	db: BetterSQLite3Database<typeof schema>;
	fakeServers: Partial<Record<ServiceName, string>>;
	setFakeServerScenario: (name: string) => Promise<void>;
	tempDir: string;
	checkpoint: () => void;
};

export const test = base.extend<AppFixtures, WorkerFixtures>({
	requiredServices: [ALL_REQUIRED_SERVICES, { option: true, scope: "worker" }],
	fakeServerScenario: [undefined, { option: true, scope: "worker" }],
	serviceManager: [
		async ({ requiredServices, fakeServerScenario }, use) => {
			const manager = createFakeServerManager(requiredServices, fakeServerScenario);
			await manager.start();
			await use(manager);
			await manager.stop();
		},
		{ scope: "worker" },
	],
	setFakeServerScenario: async ({ serviceManager }, use) => {
		await use((name) => serviceManager.setScenario(name));
	},
});
```

- [ ] **Step 6: Re-run the runtime tests and keep them green before moving on**

Run: `bun run test -- e2e/fixtures/golden/loaders.test.ts e2e/fixtures/fake-servers/manager.test.ts`
Expected: PASS with scenario loading, seeding, reset, and swap coverage.

- [ ] **Step 7: Commit the runtime scaffolding**

```bash
git add e2e/fixtures/golden/loaders.ts e2e/fixtures/golden/loaders.test.ts e2e/fixtures/fake-servers/base.ts e2e/fixtures/fake-servers/manager.ts e2e/fixtures/fake-servers/manager.test.ts e2e/fixtures/app.ts
git commit -m "test(e2e): add golden fixture scenario runtime"
```

## Task 2: Add Exact Replay Support for Every Fake Service

**Files:**
- Create: `e2e/fixtures/fake-servers/replay.ts`
- Create: `e2e/fixtures/fake-servers/replay.test.ts`
- Modify: `e2e/fixtures/fake-servers/qbittorrent.ts`
- Modify: `e2e/fixtures/fake-servers/transmission.ts`
- Modify: `e2e/fixtures/fake-servers/deluge.ts`
- Modify: `e2e/fixtures/fake-servers/rtorrent.ts`
- Modify: `e2e/fixtures/fake-servers/sabnzbd.ts`
- Modify: `e2e/fixtures/fake-servers/nzbget.ts`
- Modify: `e2e/fixtures/fake-servers/newznab.ts`
- Modify: `e2e/fixtures/fake-servers/prowlarr.ts`
- Modify: `e2e/fixtures/fake-servers/sonarr.ts`
- Modify: `e2e/fixtures/fake-servers/radarr.ts`
- Modify: `e2e/fixtures/fake-servers/readarr.ts`
- Modify: `e2e/fixtures/fake-servers/bookshelf.ts`
- Modify: `e2e/fixtures/fake-servers/tmdb.ts`
- Modify: `e2e/fixtures/fake-servers/hardcover.ts`
- Test: `e2e/fixtures/fake-servers/replay.test.ts`

- [ ] **Step 1: Write the failing replay-helper tests for exact route parity and write recording**

```ts
// e2e/fixtures/fake-servers/replay.test.ts
import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { createReplayHandler } from "./replay";

describe("createReplayHandler", () => {
	it("matches the exact method and path key and returns the stored status, headers, and body", async () => {
		const state = {
			routes: {
				"GET /api/v2/app/version": {
					status: 200,
					headers: { "Content-Type": "text/plain" },
					body: "v4.6.0",
				},
			},
			recordedWrites: [],
		};

		const handler = createReplayHandler({
			auth: () => true,
			writes: [],
		});

		const result = handler(
			{
				method: "GET",
				url: "/api/v2/app/version",
				headers: {},
			} as IncomingMessage,
			"",
			state,
		);

		expect(result).toEqual({
			status: 200,
			headers: { "Content-Type": "text/plain" },
			body: "v4.6.0",
		});
	});

	it("records write requests without mutating the immutable route fixtures", async () => {
		const state = {
			routes: {},
			recordedWrites: [],
		};

		const handler = createReplayHandler({
			auth: () => true,
			writes: [{ method: "POST", path: "/api/v2/torrents/add", status: 200, body: "Ok." }],
		});

		handler(
			{
				method: "POST",
				url: "/api/v2/torrents/add",
				headers: { "content-type": "application/x-www-form-urlencoded" },
			} as IncomingMessage,
			"urls=magnet%3A%3Fxt%3Durn%3Abtih%3A123",
			state,
		);

		expect(state.recordedWrites).toEqual([
			expect.objectContaining({
				method: "POST",
				path: "/api/v2/torrents/add",
				body: "urls=magnet%3A%3Fxt%3Durn%3Abtih%3A123",
			}),
		]);
	});
});
```

- [ ] **Step 2: Run the replay-helper suite to verify the helper does not exist yet**

Run: `bun run test -- e2e/fixtures/fake-servers/replay.test.ts`
Expected: FAIL because `replay.ts` does not exist.

- [ ] **Step 3: Implement the replay helper with exact route-key matching and write logging**

```ts
// e2e/fixtures/fake-servers/replay.ts
import type { IncomingMessage } from "node:http";
import type { HandlerResult } from "./base";
import type { GoldenServiceState } from "../golden/loaders";

type WriteRoute = {
	method: string;
	path: string;
	status: number;
	headers?: Record<string, string>;
	body: string;
};

type ReplayOptions = {
	auth: (req: IncomingMessage, state: GoldenServiceState) => HandlerResult | true;
	writes: WriteRoute[];
};

export function routeKey(method: string, path: string): string {
	return `${method.toUpperCase()} ${path}`;
}

export function createReplayHandler(options: ReplayOptions) {
	return (
		req: IncomingMessage,
		body: string,
		state: GoldenServiceState,
	): HandlerResult => {
		const authResult = options.auth(req, state);
		if (authResult !== true) {
			return authResult;
		}

		const url = new URL(req.url || "/", "http://localhost");
		const key = routeKey(req.method || "GET", `${url.pathname}${url.search}`);
		const stored = state.routes[key] ?? state.routes[routeKey(req.method || "GET", url.pathname)];
		if (stored) {
			return stored;
		}

		const write = options.writes.find(
			(candidate) =>
				candidate.method === (req.method || "GET").toUpperCase() &&
				candidate.path === url.pathname,
		);
		if (!write) {
			return null;
		}

		state.recordedWrites.push({
			method: write.method,
			path: url.pathname,
			body,
			headers: Object.fromEntries(
				Object.entries(req.headers).flatMap(([name, value]) =>
					typeof value === "string" ? [[name, value]] : [],
				),
			),
		});

		return {
			status: write.status,
			headers: write.headers,
			body: write.body,
		};
	};
}
```

- [ ] **Step 4: Convert the service servers to exact replay plus service-specific auth rules**

```ts
// e2e/fixtures/fake-servers/sonarr.ts
import type { IncomingMessage } from "node:http";
import { createFakeServer } from "./base";
import { createReplayHandler } from "./replay";
import type { GoldenServiceState } from "../golden/loaders";

function defaultState(): GoldenServiceState {
	return {
		routes: {},
		recordedWrites: [],
	};
}

const handler = createReplayHandler({
	auth: (req: IncomingMessage) => {
		if (req.method !== "GET") {
			return { status: 405, body: "Method Not Allowed" };
		}
		if (req.headers["x-api-key"] !== "sonarr-key") {
			return { status: 401, body: "Unauthorized" };
		}
		return true;
	},
	writes: [],
});

export default function createSonarrServer(port: number) {
	return createFakeServer<GoldenServiceState>({
		port,
		defaultState,
		handler,
	});
}

// e2e/fixtures/fake-servers/qbittorrent.ts
const handler = createReplayHandler({
	auth: (req) => {
		if (req.url?.startsWith("/api/v2/auth/login") && req.method === "POST") {
			return true;
		}
		const cookie = req.headers.cookie || "";
		if (!cookie.includes("SID=")) {
			return { status: 403, body: "Forbidden" };
		}
		return true;
	},
	writes: [
		{ method: "POST", path: "/api/v2/torrents/add", status: 200, body: "Ok." },
		{ method: "POST", path: "/api/v2/torrents/delete", status: 200, body: "Ok." },
		{ method: "POST", path: "/api/v2/torrents/pause", status: 200, body: "Ok." },
		{ method: "POST", path: "/api/v2/torrents/resume", status: 200, body: "Ok." },
	],
});
```

- [ ] **Step 5: Re-run the replay suite and the manager suite to prove the replay layer works with seeded states**

Run: `bun run test -- e2e/fixtures/fake-servers/replay.test.ts e2e/fixtures/fake-servers/manager.test.ts`
Expected: PASS with exact stored responses and recorded write requests.

- [ ] **Step 6: Commit the replay conversion**

```bash
git add e2e/fixtures/fake-servers/replay.ts e2e/fixtures/fake-servers/replay.test.ts e2e/fixtures/fake-servers/qbittorrent.ts e2e/fixtures/fake-servers/transmission.ts e2e/fixtures/fake-servers/deluge.ts e2e/fixtures/fake-servers/rtorrent.ts e2e/fixtures/fake-servers/sabnzbd.ts e2e/fixtures/fake-servers/nzbget.ts e2e/fixtures/fake-servers/newznab.ts e2e/fixtures/fake-servers/prowlarr.ts e2e/fixtures/fake-servers/sonarr.ts e2e/fixtures/fake-servers/radarr.ts e2e/fixtures/fake-servers/readarr.ts e2e/fixtures/fake-servers/bookshelf.ts e2e/fixtures/fake-servers/tmdb.ts e2e/fixtures/fake-servers/hardcover.ts
git commit -m "test(e2e): replay captured fake service responses"
```

## Task 3: Add the Live Capture and Promotion Toolchain

**Files:**
- Create: `e2e/fixtures/golden/capture.ts`
- Create: `e2e/fixtures/golden/capture.test.ts`
- Create: `e2e/fixtures/golden/compose-live.ts`
- Create: `e2e/fixtures/golden/compose-live.test.ts`
- Create: `scripts/capture-compose-live-fixtures.ts`
- Create: `scripts/promote-compose-live-fixtures.ts`
- Modify: `package.json`
- Modify: `compose.yml`
- Create: `e2e/fixtures/golden/README.md`
- Test: `e2e/fixtures/golden/capture.test.ts`
- Test: `e2e/fixtures/golden/compose-live.test.ts`

- [ ] **Step 1: Write the failing tests for secret scrubbing and compose-live manifest coverage**

```ts
// e2e/fixtures/golden/capture.test.ts
import { describe, expect, it } from "vitest";
import { sanitizeCapturedPayload, toCaptureFilename } from "./capture";

describe("sanitizeCapturedPayload", () => {
	it("redacts only secret values and preserves realistic payload fields", () => {
		const sanitized = sanitizeCapturedPayload({
			headers: { "x-api-key": "live-key", cookie: "SID=secret" },
			body: JSON.stringify({
				apiKey: "live-key",
				name: "Nyaa.si",
				host: "http://localhost:9696",
				categories: ["tv", "movies"],
			}),
			contentType: "application/json",
		});

		expect(sanitized.body).toContain("\"name\":\"Nyaa.si\"");
		expect(sanitized.body).toContain("\"host\":\"http://localhost:9696\"");
		expect(sanitized.body).toContain("\"apiKey\":\"<redacted>\"");
		expect(sanitized.headers["x-api-key"]).toBe("<redacted>");
		expect(sanitized.headers.cookie).toContain("<redacted>");
	});

	it("uses stable filenames for captured method and path pairs", () => {
		expect(toCaptureFilename("GET", "/api/v3/series")).toBe(
			"get__api_v3_series.json",
		);
	});
});

// e2e/fixtures/golden/compose-live.test.ts
import { describe, expect, it } from "vitest";
import { COMPOSE_LIVE_SERVICES } from "./compose-live";

describe("COMPOSE_LIVE_SERVICES", () => {
	it("defines live captures for every fake service that talks to an external app", () => {
		expect(Object.keys(COMPOSE_LIVE_SERVICES).sort()).toEqual([
			"BOOKSHELF",
			"DELUGE",
			"NEWZNAB",
			"NZBGET",
			"PROWLARR",
			"QBITTORRENT",
			"RADARR",
			"READARR",
			"RTORRENT",
			"SABNZBD",
			"SONARR",
			"TRANSMISSION",
		]);
	});
});
```

- [ ] **Step 2: Run the capture-focused tests to verify the toolchain does not exist yet**

Run: `bun run test -- e2e/fixtures/golden/capture.test.ts e2e/fixtures/golden/compose-live.test.ts`
Expected: FAIL because the capture modules and scripts do not exist.

- [ ] **Step 3: Implement the capture primitives and compose-live manifest**

```ts
// e2e/fixtures/golden/compose-live.ts
export const COMPOSE_LIVE_SERVICES = {
	BOOKSHELF: {
		baseUrlEnv: "BOOKSHELF_BASE_URL",
		stateName: "compose-live",
		endpoints: [
			{ method: "GET", path: "/bookshelf/api/libraries" },
			{ method: "GET", path: "/bookshelf/api/items" },
		],
	},
	QBITTORRENT: {
		baseUrlEnv: "QBITTORRENT_BASE_URL",
		stateName: "compose-live",
		endpoints: [{ method: "GET", path: "/api/v2/app/version" }],
	},
	TRANSMISSION: {
		baseUrlEnv: "TRANSMISSION_BASE_URL",
		stateName: "compose-live",
		endpoints: [{ method: "POST", path: "/transmission/rpc", body: "{\"method\":\"session-get\"}" }],
	},
	DELUGE: {
		baseUrlEnv: "DELUGE_BASE_URL",
		stateName: "compose-live",
		endpoints: [{ method: "POST", path: "/json", body: "{\"method\":\"web.get_torrents_status\",\"params\":[{},[]],\"id\":1}" }],
	},
	PROWLARR: {
		baseUrlEnv: "PROWLARR_BASE_URL",
		stateName: "compose-live",
		endpoints: [
			{ method: "GET", path: "/api/v1/health" },
			{ method: "GET", path: "/api/v1/indexer" },
		],
	},
	SONARR: {
		baseUrlEnv: "SONARR_BASE_URL",
		stateName: "compose-live",
		endpoints: [
			{ method: "GET", path: "/api/v3/config/naming" },
			{ method: "GET", path: "/api/v3/series" },
		],
	},
} as const;

// e2e/fixtures/golden/capture.ts
export function toCaptureFilename(method: string, path: string): string {
	return `${method.toLowerCase()}__${path.replace(/[/?=&]/g, "_").replace(/^_+/, "")}.json`;
}

export function sanitizeCapturedPayload(input: {
	headers: Record<string, string>;
	body: string;
	contentType: string;
}) {
	const redactedHeaders = Object.fromEntries(
		Object.entries(input.headers).map(([name, value]) =>
			/api[-_]key|authorization|cookie|token|session/i.test(name)
				? [name, "<redacted>"]
				: [name, value],
		),
	);

	return {
		headers: redactedHeaders,
		body: input.body
			.replaceAll(/(\"apiKey\"\s*:\s*\")([^\"]+)(\")/g, "$1<redacted>$3")
			.replaceAll(/(apikey=)([^&]+)/gi, "$1<redacted>")
			.replaceAll(/(SID=)([^;]+)/g, "$1<redacted>"),
		contentType: input.contentType,
	};
}
```

- [ ] **Step 4: Add the CLI entrypoints, promotion script, package scripts, and README workflow**

```ts
// scripts/capture-compose-live-fixtures.ts
import { captureComposeLiveFixtures } from "../e2e/fixtures/golden/capture";

await captureComposeLiveFixtures({
	outputRoot: "e2e/fixtures/golden/_captures/live-compose",
});

// scripts/promote-compose-live-fixtures.ts
import { promoteComposeLiveFixtures } from "../e2e/fixtures/golden/capture";

await promoteComposeLiveFixtures({
	captureRoot: "e2e/fixtures/golden/_captures/live-compose",
	serviceRoot: "e2e/fixtures/golden/services",
});
```

```json
// package.json
{
	"scripts": {
		"fixtures:capture:compose-live": "bun scripts/capture-compose-live-fixtures.ts",
		"fixtures:promote:compose-live": "bun scripts/promote-compose-live-fixtures.ts"
	}
}
```

```yaml
# compose.yml
services:
  sonarr-capture:
    profiles: ["capture"]
    ports:
      - "28989:8989"
  radarr-capture:
    profiles: ["capture"]
    ports:
      - "27878:7878"
  readarr-capture:
    profiles: ["capture"]
    ports:
      - "28787:8787"
```

- [ ] **Step 5: Re-run the capture-focused tests**

Run: `bun run test -- e2e/fixtures/golden/capture.test.ts e2e/fixtures/golden/compose-live.test.ts`
Expected: PASS with scrubber, manifest, and CLI-path coverage.

- [ ] **Step 6: Commit the live capture toolchain**

```bash
git add e2e/fixtures/golden/capture.ts e2e/fixtures/golden/capture.test.ts e2e/fixtures/golden/compose-live.ts e2e/fixtures/golden/compose-live.test.ts e2e/fixtures/golden/README.md scripts/capture-compose-live-fixtures.ts scripts/promote-compose-live-fixtures.ts package.json compose.yml
git commit -m "test(fixtures): add compose live capture workflow"
```

## Task 4: Check In Canonical Service States and Scenario Manifests

**Files:**
- Create: `e2e/fixtures/golden/scenarios/imports-all-sources-mapped.json`
- Create: `e2e/fixtures/golden/scenarios/search-grab-torrent.json`
- Create: `e2e/fixtures/golden/scenarios/search-grab-usenet.json`
- Create: `e2e/fixtures/golden/scenarios/settings-config-default.json`
- Create: `e2e/fixtures/golden/scenarios/queue-management-default.json`
- Create: `e2e/fixtures/golden/scenarios/auto-search-default.json`
- Create: `e2e/fixtures/golden/scenarios/auto-search-rejected.json`
- Create: `e2e/fixtures/golden/scenarios/download-lifecycle-default.json`
- Create: `e2e/fixtures/golden/scenarios/blocklist-failure-default.json`
- Create: `e2e/fixtures/golden/scenarios/monitor-discovery-default.json`
- Create: `e2e/fixtures/golden/scenarios/author-book-import-default.json`
- Create: `e2e/fixtures/golden/services/qbittorrent/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/transmission/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/deluge/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/rtorrent/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/sabnzbd/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/nzbget/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/newznab/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/prowlarr/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/sonarr/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/radarr/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/readarr/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/bookshelf/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/tmdb/compose-live/state.json`
- Create: `e2e/fixtures/golden/services/hardcover/compose-live/state.json`
- Create: `e2e/fixtures/golden/_captures/live-compose/readarr/compose-live/get__api_v1_author__authors.json`
- Create: `e2e/fixtures/golden/_captures/live-compose/readarr/compose-live/get__api_v1_book__books.json`
- Test: `e2e/fixtures/golden/loaders.test.ts`

- [ ] **Step 1: Create the canonical scenario manifests that bind each workflow to immutable service states**

```json
// e2e/fixtures/golden/scenarios/imports-all-sources-mapped.json
{
	"BOOKSHELF": "compose-live",
	"RADARR": "compose-live",
	"READARR": "compose-live",
	"SONARR": "compose-live",
	"TMDB": "compose-live",
	"HARDCOVER": "compose-live"
}
```

```json
// e2e/fixtures/golden/scenarios/search-grab-torrent.json
{
	"NEWZNAB": "compose-live",
	"QBITTORRENT": "compose-live",
	"SABNZBD": "compose-live"
}
```

```json
// e2e/fixtures/golden/scenarios/search-grab-usenet.json
{
	"NEWZNAB": "compose-live",
	"NZBGET": "compose-live",
	"SABNZBD": "compose-live"
}
```

- [ ] **Step 2: Promote the compose-live capture files into canonical service states**

```json
// e2e/fixtures/golden/services/qbittorrent/compose-live/state.json
{
	"routes": {
		"GET /api/v2/app/version": {
			"status": 200,
			"headers": {
				"Content-Type": "text/plain"
			},
			"body": "v4.6.0"
		},
		"GET /api/v2/torrents/info?category=sonarr": {
			"status": 200,
			"headers": {
				"Content-Type": "application/json"
			},
			"body": "[{\"hash\":\"123abc\",\"name\":\"Severance.S01E01.1080p.WEBRip.x265\",\"state\":\"pausedUP\"}]"
		}
	},
	"recordedWrites": []
}
```

```json
// e2e/fixtures/golden/services/sonarr/compose-live/state.json
{
	"routes": {
		"GET /api/v3/config/naming": {
			"status": 200,
			"headers": {
				"Content-Type": "application/json"
			},
			"body": "{\"renameEpisodes\":true}"
		},
		"GET /api/v3/series": {
			"status": 200,
			"headers": {
				"Content-Type": "application/json"
			},
			"body": "[{\"id\":101,\"title\":\"Severance\",\"tvdbId\":999999}]"
		}
	},
	"recordedWrites": []
}
```

- [ ] **Step 3: Check in the temporary Readarr author/book placeholder payloads from the inspected source model**

```json
// e2e/fixtures/golden/_captures/live-compose/readarr/compose-live/get__api_v1_author__authors.json
[
	{
		"id": 1,
		"authorMetadataId": 1,
		"status": "continuing",
		"authorName": "Ursula K. Le Guin",
		"foreignAuthorId": "6044",
		"titleSlug": "6044",
		"path": "/data/capture/library/books/Ursula K. Le Guin",
		"monitored": true,
		"monitorNewItems": "all"
	}
]
```

```json
// e2e/fixtures/golden/_captures/live-compose/readarr/compose-live/get__api_v1_book__books.json
[
	{
		"id": 1,
		"title": "A Wizard of Earthsea",
		"authorId": 1,
		"foreignBookId": "13642",
		"foreignEditionId": "328497",
		"titleSlug": "13642",
		"monitored": true,
		"author": null
	}
]
```

- [ ] **Step 4: Re-run the loader suite to prove every manifest and state file parses cleanly**

Run: `bun run test -- e2e/fixtures/golden/loaders.test.ts`
Expected: PASS with all scenario manifests and canonical state files loading successfully.

- [ ] **Step 5: Commit the checked-in fixture states**

```bash
git add e2e/fixtures/golden/scenarios e2e/fixtures/golden/services e2e/fixtures/golden/_captures/live-compose/readarr/compose-live/get__api_v1_author__authors.json e2e/fixtures/golden/_captures/live-compose/readarr/compose-live/get__api_v1_book__books.json
git commit -m "test(fixtures): add canonical golden service states"
```

## Task 5: Migrate the Playwright Flows and Tighten Import Assertions

**Files:**
- Modify: `e2e/tests/02-settings-config.spec.ts`
- Modify: `e2e/tests/03-author-book-import.spec.ts`
- Modify: `e2e/tests/04-search-grab.spec.ts`
- Modify: `e2e/tests/05-queue-management.spec.ts`
- Modify: `e2e/tests/06-auto-search.spec.ts`
- Modify: `e2e/tests/07-download-lifecycle.spec.ts`
- Modify: `e2e/tests/10-blocklist-failure.spec.ts`
- Modify: `e2e/tests/12-monitor-discovery.spec.ts`
- Modify: `e2e/tests/13-servarr-import.spec.ts`
- Modify: `src/server/imports/apply.test.ts`
- Test: `e2e/tests/04-search-grab.spec.ts`
- Test: `e2e/tests/13-servarr-import.spec.ts`
- Test: `src/server/imports/apply.test.ts`

- [ ] **Step 1: Write the failing scenario-backed E2E expectations for search and Servarr import**

```ts
// e2e/tests/04-search-grab.spec.ts
test.use({
	fakeServerScenario: "search-grab-torrent",
	requiredServices: ["QBITTORRENT", "SABNZBD", "NEWZNAB"],
});

test("switches to the usenet scenario for the secondary grab path", async ({
	setFakeServerScenario,
}) => {
	await setFakeServerScenario("search-grab-usenet");
	// Existing assertions stay the same after the scenario swap.
});

// e2e/tests/13-servarr-import.spec.ts
test.use({
	fakeServerScenario: "imports-all-sources-mapped",
	requiredServices: [
		"HARDCOVER",
		"TMDB",
		"SONARR",
		"RADARR",
		"READARR",
		"BOOKSHELF",
	],
});

await expect
	.poll(() => db.select().from(schema.downloadClients).all())
	.toEqual([
		expect.objectContaining({
			name: "SABnzbd",
			protocol: "usenet",
			settings: expect.objectContaining({ host: "sabnzbd-capture" }),
		}),
	]);
```

- [ ] **Step 2: Run the focused E2E and import-apply tests to verify the current tests still depend on inline fake-server mutation**

Run: `bun run test -- src/server/imports/apply.test.ts && bunx playwright test --config e2e/playwright.config.ts e2e/tests/04-search-grab.spec.ts e2e/tests/13-servarr-import.spec.ts --reporter=line`
Expected: FAIL because the specs still rely on inline fake-server mutation and the import assertions are not yet full-object comparisons.

- [ ] **Step 3: Convert the Playwright specs to immutable named scenarios and remove inline `__control` setup**

```ts
// e2e/tests/13-servarr-import.spec.ts
test.use({
	fakeServerScenario: "imports-all-sources-mapped",
	requiredServices: ["HARDCOVER", "TMDB", "SONARR", "RADARR", "READARR", "BOOKSHELF"],
});

test("imports all Servarr sources in one pass and persists mapped records", async ({
	db,
	page,
	fakeServers,
}) => {
	await addImportSource({
		apiKey: "sonarr-key",
		baseUrl: requireServiceUrl(fakeServers, "SONARR"),
		kind: "sonarr",
		label: "Alpha Sonarr",
		page,
	});

	await page.getByRole("button", { name: "Apply plan" }).click();

	await expect
		.poll(() => db.select().from(schema.downloadProfiles).all())
		.toEqual([
			expect.objectContaining({
				name: "HD-1080p",
				contentType: "show",
			}),
			expect.objectContaining({
				name: "Any",
				contentType: "book",
			}),
		]);
});
```

- [ ] **Step 4: Tighten the import apply tests to assert full persisted objects, not sentinel fields**

```ts
// src/server/imports/apply.test.ts
expect(downloadClients).toEqual([
	{
		id: expect.any(Number),
		name: "SABnzbd",
		protocol: "usenet",
		implementation: "Sabnzbd",
		host: "sabnzbd-capture",
		port: 8080,
		useSsl: false,
		settings: {
			category: "tv",
			removeCompletedDownloads: true,
		},
	},
]);

expect(importProvenance).toEqual([
	expect.objectContaining({
		sourceItemExternalId: "tmdb:1891",
		targetTable: "movies",
	}),
]);
```

- [ ] **Step 5: Re-run the focused verification**

Run: `bun run test -- src/server/imports/apply.test.ts && bunx playwright test --config e2e/playwright.config.ts e2e/tests/04-search-grab.spec.ts e2e/tests/13-servarr-import.spec.ts --reporter=line`
Expected: PASS with immutable scenarios and full persisted-object assertions.

- [ ] **Step 6: Commit the scenario migration**

```bash
git add e2e/tests/02-settings-config.spec.ts e2e/tests/03-author-book-import.spec.ts e2e/tests/04-search-grab.spec.ts e2e/tests/05-queue-management.spec.ts e2e/tests/06-auto-search.spec.ts e2e/tests/07-download-lifecycle.spec.ts e2e/tests/10-blocklist-failure.spec.ts e2e/tests/12-monitor-discovery.spec.ts e2e/tests/13-servarr-import.spec.ts src/server/imports/apply.test.ts
git commit -m "test(e2e): move flows onto immutable golden scenarios"
```

## Task 6: Run the Full Verification Pass and Clean Up Legacy Fixture Mutation

**Files:**
- Modify: `e2e/fixtures/golden/README.md`
- Modify: `e2e/fixtures/fake-servers/manager.ts`
- Modify: `e2e/tests/04-search-grab.spec.ts`
- Modify: `e2e/tests/06-auto-search.spec.ts`
- Modify: `e2e/tests/07-download-lifecycle.spec.ts`
- Modify: `e2e/tests/10-blocklist-failure.spec.ts`
- Modify: `e2e/tests/12-monitor-discovery.spec.ts`
- Test: `e2e/fixtures/fake-servers/manager.test.ts`
- Test: `e2e/fixtures/golden/capture.test.ts`
- Test: `e2e/fixtures/golden/compose-live.test.ts`
- Test: `e2e/fixtures/fake-servers/replay.test.ts`
- Test: `src/server/imports/apply.test.ts`
- Test: `e2e/tests/02-settings-config.spec.ts`
- Test: `e2e/tests/03-author-book-import.spec.ts`
- Test: `e2e/tests/04-search-grab.spec.ts`
- Test: `e2e/tests/05-queue-management.spec.ts`
- Test: `e2e/tests/06-auto-search.spec.ts`
- Test: `e2e/tests/07-download-lifecycle.spec.ts`
- Test: `e2e/tests/10-blocklist-failure.spec.ts`
- Test: `e2e/tests/12-monitor-discovery.spec.ts`
- Test: `e2e/tests/13-servarr-import.spec.ts`

- [ ] **Step 1: Remove any remaining ad hoc fixture mutation from scenarios that can now be expressed as named states**

```ts
// e2e/fixtures/fake-servers/manager.ts
async function seedScenario(name?: string) {
	if (!name) {
		return;
	}

	const scenario = loadGoldenScenario(name);
	await Promise.all(
		Object.entries(scenario).map(async ([serviceName, stateName]) => {
			const server = running.get(serviceName as ServiceName);
			if (!server) {
				return;
			}
			await fetch(`${server.url}/__seed`, {
				method: "POST",
				body: JSON.stringify(
					loadGoldenServiceState(serviceName as ServiceName, stateName),
				),
			});
		}),
	);
}
```

- [ ] **Step 2: Run the focused unit suites for the fixture runtime**

Run: `bun run test -- e2e/fixtures/fake-servers/manager.test.ts e2e/fixtures/golden/capture.test.ts e2e/fixtures/golden/compose-live.test.ts e2e/fixtures/fake-servers/replay.test.ts src/server/imports/apply.test.ts`
Expected: PASS with full fixture-runtime and import-assertion coverage.

- [ ] **Step 3: Run the migrated Playwright workflows**

Run: `bunx playwright test --config e2e/playwright.config.ts e2e/tests/02-settings-config.spec.ts e2e/tests/03-author-book-import.spec.ts e2e/tests/04-search-grab.spec.ts e2e/tests/05-queue-management.spec.ts e2e/tests/06-auto-search.spec.ts e2e/tests/07-download-lifecycle.spec.ts e2e/tests/10-blocklist-failure.spec.ts e2e/tests/12-monitor-discovery.spec.ts e2e/tests/13-servarr-import.spec.ts --reporter=line`
Expected: PASS with all targeted workflows using immutable named scenarios.

- [ ] **Step 4: Run the repo-wide safety checks**

Run: `bun run typecheck && bun run lint`
Expected: PASS with no new type or Biome issues.

- [ ] **Step 5: Update the README with the exact refresh flow and the remaining external Readarr blocker**

```md
## Refreshing golden fixtures from live Docker services

1. Start the capture profile: `docker compose --profile capture up -d`.
2. Recapture payloads: `bun run fixtures:capture:compose-live`.
3. Promote scrubbed captures into canonical states: `bun run fixtures:promote:compose-live`.
4. Re-run the fixture and Playwright suites before committing.

Readarr note: `get__api_v1_author__authors.json` and `get__api_v1_book__books.json` are source-derived placeholders until `api.bookinfo.club` becomes reachable again from the Readarr container.
```

- [ ] **Step 6: Commit the verification and cleanup pass**

```bash
git add e2e/fixtures/golden/README.md e2e/fixtures/fake-servers/manager.ts e2e/tests/04-search-grab.spec.ts e2e/tests/06-auto-search.spec.ts e2e/tests/07-download-lifecycle.spec.ts e2e/tests/10-blocklist-failure.spec.ts e2e/tests/12-monitor-discovery.spec.ts
git commit -m "docs(fixtures): document golden fixture refresh workflow"
```
