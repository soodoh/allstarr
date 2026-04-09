# Coverage Tooling And Server/Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add truthful full-repo coverage reporting, enforce a `>=95%` server/core allowlist gate, and raise the selected server/core modules to that threshold with shared test infrastructure.

**Architecture:** Keep one base Vitest config for normal test discovery and full-repo informational coverage, then layer a second Vitest config on top for the enforced server/core allowlist. Reuse shared Node HTTP test helpers and focused module mocks so orchestration-heavy server tests stay deterministic instead of coupling to the browser, real network, or a live database.

**Tech Stack:** Bun, Vitest 4.1.2, `@vitest/coverage-v8`, TanStack Start server functions, Node HTTP test servers, Biome, GitHub Actions

---

### Task 1: Add The Coverage Provider, Scripts, And Staged Config

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Create: `vitest.server-core.allowlist.ts`
- Create: `vitest.server-core.config.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

- [ ] **Step 1: Reproduce the missing-provider failure before changing config**

Run: `bun run test -- --coverage`

Expected: FAIL with a missing dependency error for `@vitest/coverage-v8`.

- [ ] **Step 2: Add the pinned coverage provider and the two new coverage scripts**

Update `package.json` with an exact version match for Vitest and explicit coverage commands:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage:all": "vitest run --coverage",
    "test:coverage:server-core": "vitest run --config vitest.server-core.config.ts --coverage"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "4.1.2",
    "vitest": "^4.1.2"
  }
}
```

- [ ] **Step 3: Broaden test discovery and enable truthful full-repo informational coverage**

Replace `vitest.config.ts` with a base config that discovers `*.test.*` and `*.spec.*`, while reporting against the full executable source tree:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export const testInclude = [
	"src/**/*.test.ts",
	"src/**/*.spec.ts",
	"src/**/*.test.tsx",
	"src/**/*.spec.tsx",
	"e2e/fixtures/**/*.test.ts",
	"e2e/fixtures/**/*.spec.ts",
];

export const fullRepoCoverageInclude = [
	"src/**/*.{ts,tsx}",
	"e2e/fixtures/**/*.ts",
];

export const coverageExclude = [
	"**/*.test.*",
	"**/*.spec.*",
	"src/routeTree.gen.ts",
];

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		include: testInclude,
		coverage: {
			provider: "v8",
			all: true,
			include: fullRepoCoverageInclude,
			exclude: coverageExclude,
			reporter: ["text", "json-summary", "html"],
			reportsDirectory: "coverage",
		},
	},
});
```

- [ ] **Step 4: Create the explicit server/core allowlist and the enforced gate config**

Create `vitest.server-core.allowlist.ts`:

```ts
export const serverCoreCoverageAllowlist = [
	"src/server/api-cache.ts",
	"src/server/download-manager.ts",
	"src/server/download-clients/http.ts",
	"src/server/download-clients/qbittorrent.ts",
	"src/server/download-clients/registry.ts",
	"src/server/download-clients/sabnzbd.ts",
	"src/server/hint-extractor.ts",
	"src/server/image-cache.ts",
	"src/server/import-mapping.ts",
	"src/server/indexers/http.ts",
	"src/server/indexers/release-type-parser.ts",
	"src/server/settings-store.ts",
	"src/server/settings-value.ts",
	"src/server/users.ts",
	"src/lib/runtime.ts",
	"src/lib/table-column-defaults.ts",
] as const;
```

Create `vitest.server-core.config.ts`:

```ts
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig, { coverageExclude } from "./vitest.config";
import { serverCoreCoverageAllowlist } from "./vitest.server-core.allowlist";

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			coverage: {
				provider: "v8",
				all: true,
				include: [...serverCoreCoverageAllowlist],
				exclude: [...coverageExclude, "src/db/schema/**"],
				reporter: ["text", "json-summary"],
				reportsDirectory: "coverage/server-core",
				thresholds: {
					statements: 95,
					branches: 95,
					functions: 95,
					lines: 95,
				},
			},
		},
	}),
);
```

- [ ] **Step 5: Wire the enforced gate into CI and document the two commands**

Add a dedicated CI job to `.github/workflows/ci.yml`:

```yaml
  coverage-server-core:
    name: Coverage (Server/Core)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
        with:
          ref: ${{ env.CHECKOUT_REF }}
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Server/Core Coverage Gate
        run: bun run test:coverage:server-core
```

Add the new commands to `README.md`:

```md
- `bun run test:coverage:all`
- `bun run test:coverage:server-core`
```

- [ ] **Step 6: Install dependencies and prove the new commands behave as intended**

Run: `bun install`

Expected: PASS with `@vitest/coverage-v8@4.1.2` installed.

Run: `bun run test:coverage:all`

Expected: PASS and produce a low but truthful whole-repo baseline in `coverage/`.

Run: `bun run test:coverage:server-core`

Expected: FAIL because several allowlisted modules are still below 95%.

- [ ] **Step 7: Commit the coverage tooling foundation**

```bash
git add package.json bun.lock vitest.config.ts vitest.server-core.allowlist.ts vitest.server-core.config.ts .github/workflows/ci.yml README.md
git commit -m "test(coverage): add staged server core coverage gate"
```

### Task 2: Extract A Shared HTTP Test Server Helper

**Files:**
- Create: `src/server/__tests__/helpers/http-test-server.ts`
- Modify: `src/server/download-clients/qbittorrent.test.ts`
- Modify: `src/server/download-clients/sabnzbd.test.ts`
- Modify: `src/server/indexers/http.test.ts`

- [ ] **Step 1: Create the reusable Node HTTP test server helper**

Add `src/server/__tests__/helpers/http-test-server.ts`:

```ts
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";

export type CapturedHttpRequest = {
	method: string;
	pathname: string;
	search: string;
	searchParams: URLSearchParams;
	headers: Record<string, string | string[] | undefined>;
	body: string;
};

async function readBody(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf8");
}

export async function startHttpTestServer(
	handler: (
		request: CapturedHttpRequest,
		response: ServerResponse,
		requests: CapturedHttpRequest[],
	) => Promise<void> | void,
) {
	const requests: CapturedHttpRequest[] = [];
	const server = createServer((req, res) => {
		void (async () => {
			const url = new URL(req.url ?? "/", "http://127.0.0.1");
			const request: CapturedHttpRequest = {
				method: req.method ?? "GET",
				pathname: url.pathname,
				search: url.search,
				searchParams: url.searchParams,
				headers: req.headers,
				body: await readBody(req),
			};
			requests.push(request);
			await handler(request, res, requests);
		})().catch((error) => {
			res.statusCode = 500;
			res.end(error instanceof Error ? error.message : String(error));
		});
	});

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Expected the test server to listen on a port");
	}

	return {
		baseUrl: `http://127.0.0.1:${address.port}`,
		requests,
		async stop() {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			});
		},
	};
}
```

- [ ] **Step 2: Update the qBittorrent, SABnzbd, and Newznab tests to import the helper**

Replace each local `startServer` implementation with:

```ts
import { startHttpTestServer } from "src/server/__tests__/helpers/http-test-server";
```

And update construction sites:

```ts
const server = await startHttpTestServer(async (request, response) => {
	// existing assertions stay here
});
```

- [ ] **Step 3: Run the refactored protocol tests**

Run: `bun run test -- src/server/download-clients/qbittorrent.test.ts src/server/download-clients/sabnzbd.test.ts src/server/indexers/http.test.ts`

Expected: PASS with no behavior change.

- [ ] **Step 4: Commit the test helper extraction**

```bash
git add src/server/__tests__/helpers/http-test-server.ts src/server/download-clients/qbittorrent.test.ts src/server/download-clients/sabnzbd.test.ts src/server/indexers/http.test.ts
git commit -m "test(server): share HTTP test server helper"
```

### Task 3: Close The Easy Helper Gaps In The Allowlist

**Files:**
- Create: `src/server/settings-value.test.ts`
- Create: `src/lib/table-column-defaults.test.ts`
- Modify: `src/server/download-clients/registry.test.ts`

- [ ] **Step 1: Add exhaustive tests for stored-setting parsing**

Create `src/server/settings-value.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStoredSettingValue } from "./settings-value";

describe("parseStoredSettingValue", () => {
	it("returns the fallback for nullish values", () => {
		expect(parseStoredSettingValue(undefined, true)).toBe(true);
		expect(parseStoredSettingValue(null, "fallback")).toBe("fallback");
	});

	it("parses JSON strings when possible", () => {
		expect(parseStoredSettingValue("{\"enabled\":true}", { enabled: false })).toEqual({
			enabled: true,
		});
	});

	it("returns non-string values unchanged", () => {
		expect(parseStoredSettingValue(42, 0)).toBe(42);
	});

	it("returns malformed strings as-is", () => {
		expect(parseStoredSettingValue("not-json", "fallback")).toBe("not-json");
	});
});
```

- [ ] **Step 2: Add table-default tests for every table id and both helper functions**

Create `src/lib/table-column-defaults.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	getDefaultColumnOrder,
	getDefaultHiddenColumns,
	TABLE_DEFAULTS,
	TABLE_IDS,
} from "./table-column-defaults";

describe("table column defaults", () => {
	it("returns a stable key order for every table id", () => {
		for (const tableId of TABLE_IDS) {
			expect(getDefaultColumnOrder(tableId)).toEqual(
				TABLE_DEFAULTS[tableId].map((column) => column.key),
			);
		}
	});

	it("returns only non-locked hidden columns", () => {
		for (const tableId of TABLE_IDS) {
			const hidden = getDefaultHiddenColumns(tableId);
			expect(hidden).toEqual(
				TABLE_DEFAULTS[tableId]
					.filter((column) => !column.locked && !column.defaultVisible)
					.map((column) => column.key),
			);
		}
	});
});
```

- [ ] **Step 3: Expand registry coverage to all switch branches and the unknown-provider error**

Extend `src/server/download-clients/registry.test.ts` with a table-driven test:

```ts
it.each([
	["qBittorrent", "./qbittorrent"],
	["Transmission", "./transmission"],
	["Deluge", "./deluge"],
	["rTorrent", "./rtorrent"],
	["SABnzbd", "./sabnzbd"],
	["NZBGet", "./nzbget"],
	["Blackhole", "./blackhole"],
] as const)("loads %s on the server", async (implementation, modulePath) => {
	const provider = {
		addDownload: vi.fn(),
		getDownloads: vi.fn(),
		removeDownload: vi.fn(),
		testConnection: vi.fn(),
	};

	vi.doMock("src/lib/runtime", () => ({ isServerRuntime: true }));
	vi.doMock(modulePath, () => ({ default: provider }));

	const { default: getProvider } = await import("./registry");

	await expect(getProvider(implementation)).resolves.toBe(provider);
});

it("throws for an unknown implementation", async () => {
	vi.doMock("src/lib/runtime", () => ({ isServerRuntime: true }));
	const { default: getProvider } = await import("./registry");
	await expect(getProvider("NopeClient")).rejects.toThrow(
		"Unknown download client implementation: NopeClient",
	);
});
```

- [ ] **Step 4: Run the helper-focused tests**

Run: `bun run test -- src/server/settings-value.test.ts src/lib/table-column-defaults.test.ts src/server/download-clients/registry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the helper coverage work**

```bash
git add src/server/settings-value.test.ts src/lib/table-column-defaults.test.ts src/server/download-clients/registry.test.ts
git commit -m "test(server): cover helper modules and registry branches"
```

### Task 4: Raise HTTP Utility And Newznab Coverage

**Files:**
- Create: `src/server/download-clients/http.test.ts`
- Modify: `src/server/indexers/http.test.ts`

- [ ] **Step 1: Add direct tests for `buildBaseUrl` and `fetchWithTimeout`**

Create `src/server/download-clients/http.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBaseUrl, fetchWithTimeout } from "./http";

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("buildBaseUrl", () => {
	it("normalizes empty, relative, and slash-prefixed urlBase values", () => {
		expect(buildBaseUrl("localhost", 8080, false, null)).toBe("http://localhost:8080");
		expect(buildBaseUrl("localhost", 8080, true, "api/")).toBe("https://localhost:8080/api");
		expect(buildBaseUrl("localhost", 8080, true, "/nested/api")).toBe("https://localhost:8080/nested/api");
	});
});

describe("fetchWithTimeout", () => {
	it("translates AbortError into a timeout error", async () => {
		vi.useFakeTimers();
		vi.spyOn(globalThis, "fetch").mockImplementation((_url, options) => {
			const signal = options?.signal as AbortSignal;
			return new Promise<Response>((_resolve, reject) => {
				signal.addEventListener("abort", () => {
					const error = new Error("aborted");
					error.name = "AbortError";
					reject(error);
				});
			});
		});

		const request = fetchWithTimeout("http://example.test", {}, 25);
		await vi.advanceTimersByTimeAsync(25);
		await expect(request).rejects.toThrow("Connection timed out.");
	});

	it("rethrows non-timeout errors unchanged", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("socket hang up"));
		await expect(fetchWithTimeout("http://example.test", {}, 25)).rejects.toThrow("socket hang up");
	});
});
```

- [ ] **Step 2: Extend Newznab tests for retry, failure, and item-shape branches**

Add these cases to `src/server/indexers/http.test.ts`:

```ts
it("retries a 429 response and succeeds after Retry-After", async () => {
	vi.useFakeTimers();
	const server = await startHttpTestServer(async (_request, response, requests) => {
		if (requests.length === 1) {
			response.statusCode = 429;
			response.setHeader("Retry-After", "1");
			response.end("rate limited");
			return;
		}

		response.statusCode = 200;
		response.setHeader("Content-Type", "application/xml");
		response.end(`<?xml version="1.0"?><rss><channel><item><title>Retry Hit</title><guid>retry-1</guid><enclosure url="http://example.com/retry.torrent" length="100" type="application/x-bittorrent" /></item></channel></rss>`);
	});

	try {
		const promise = searchNewznab(
			{ baseUrl: server.baseUrl, apiPath: "/api", apiKey: "key" },
			"ignored",
			[7020],
		);
		await vi.advanceTimersByTimeAsync(1_000);
		await expect(promise).resolves.toHaveLength(1);
	} finally {
		await server.stop();
	}
});

it("returns a failure payload when caps returns a non-ok response", async () => {
	const server = await startHttpTestServer(async (_request, response) => {
		response.statusCode = 500;
		response.statusMessage = "Boom";
		response.end("boom");
	});

	try {
		await expect(
			testNewznab({ baseUrl: server.baseUrl, apiPath: "/api", apiKey: "key" }),
		).resolves.toEqual({
			success: false,
			message: "Indexer returned HTTP 500: Boom",
			version: null,
		});
	} finally {
		await server.stop();
	}
});
```

- [ ] **Step 3: Run the HTTP utility and indexer coverage tests**

Run: `bun run test -- src/server/download-clients/http.test.ts src/server/indexers/http.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit the HTTP coverage improvements**

```bash
git add src/server/download-clients/http.test.ts src/server/indexers/http.test.ts
git commit -m "test(indexers): cover retry and HTTP utility branches"
```

### Task 5: Expand Server Function Coverage For Users

**Files:**
- Modify: `src/server/users.test.ts`

- [ ] **Step 1: Add a reusable fake-select builder inside the users test file**

Insert a helper near the top of `src/server/users.test.ts`:

```ts
function createSelectBuilder(userRows: unknown[], sessionRows: unknown[], accountRows: unknown[]) {
	return vi.fn((shape?: Record<string, { name: string }>) => ({
		from(table: { createdAt?: { name: string }; userId?: { name: string }; providerId?: { name: string } }) {
			if (table.createdAt?.name === "createdAt" && !table.userId) {
				return {
					orderBy() {
						return { all: () => userRows };
					},
				};
			}

			if (table.userId?.name === "userId" && table.createdAt?.name === "createdAt") {
				return {
					groupBy() {
						return { all: () => sessionRows };
					},
				};
			}

			return {
				all: () => accountRows,
			};
		},
	}));
}
```

- [ ] **Step 2: Cover `listUsersFn` hydration and the remaining mutating server functions**

Add these tests:

```ts
it("hydrates auth method and last login for listed users", async () => {
	const select = createSelectBuilder(
		[{ id: "user-1", name: "Viewer", email: "viewer@example.com", role: "viewer", image: null, createdAt: new Date("2026-01-01") }],
		[{ userId: "user-1", lastLogin: new Date("2026-02-01") }],
		[{ userId: "user-1", providerId: "google" }],
	);

	vi.doMock("src/db", () => ({ db: { select } }));
	vi.doMock("./middleware", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }) }));
	vi.doMock("./settings-store", () => ({ getSettingValue: vi.fn(), upsertSettingValue: vi.fn() }));

	const { listUsersFn } = await import("./users");

	await expect(listUsersFn()).resolves.toEqual([
		expect.objectContaining({
			id: "user-1",
			authMethod: "google",
			lastLogin: new Date("2026-02-01"),
		}),
	]);
});

it("rejects changing your own role", async () => {
	vi.doMock("./middleware", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin-1", role: "admin" } }) }));
	const { setUserRoleFn } = await import("./users");
	await expect(setUserRoleFn({ data: { userId: "admin-1", role: "viewer" } })).rejects.toThrow("Cannot change your own role");
});

it("persists the configured default role", async () => {
	const upsertSettingValue = vi.fn();
	vi.doMock("./middleware", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin-1", role: "admin" } }) }));
	vi.doMock("./settings-store", () => ({
		getSettingValue: vi.fn().mockReturnValue("invalid-role"),
		upsertSettingValue,
	}));

	const { getDefaultRoleFn, updateDefaultRoleFn } = await import("./users");

	await expect(getDefaultRoleFn()).resolves.toEqual({ defaultRole: "requester" });
	await expect(updateDefaultRoleFn({ data: { role: "viewer" } })).resolves.toEqual({ success: true });
	expect(upsertSettingValue).toHaveBeenCalledWith("auth.defaultRole", "viewer");
});
```

- [ ] **Step 3: Add the missing delete-user success and self-delete guard tests**

Append:

```ts
it("rejects deleting your own account", async () => {
	vi.doMock("./middleware", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin-1", role: "admin" } }) }));
	vi.doMock("src/lib/auth", () => ({ getAuth: vi.fn().mockResolvedValue({ api: { removeUser: vi.fn() } }) }));

	const { deleteUserFn } = await import("./users");

	await expect(deleteUserFn({ data: { userId: "admin-1" } })).rejects.toThrow("Cannot delete your own account");
});

it("calls Better Auth to delete a different user", async () => {
	const removeUser = vi.fn().mockResolvedValue(undefined);
	vi.doMock("./middleware", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin-1", role: "admin" } }) }));
	vi.doMock("src/lib/auth", () => ({ getAuth: vi.fn().mockResolvedValue({ api: { removeUser } }) }));

	const { deleteUserFn } = await import("./users");

	await expect(deleteUserFn({ data: { userId: "user-2" } })).resolves.toEqual({ success: true });
	expect(removeUser).toHaveBeenCalledWith({ body: { userId: "user-2" } });
});
```

- [ ] **Step 4: Run the users tests**

Run: `bun run test -- src/server/users.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the users coverage work**

```bash
git add src/server/users.test.ts
git commit -m "test(users): cover list role delete and default-role flows"
```

### Task 6: Expand Download Manager Coverage Across State Transitions

**Files:**
- Modify: `src/server/download-manager.test.ts`

- [ ] **Step 1: Add the no-active-downloads and missing-client branches**

Append these tests to `src/server/download-manager.test.ts`:

```ts
it("returns early when there are no active tracked downloads", async () => {
	const db = createFakeDb({ trackedRows: [], clientRows: [] });

	vi.doMock("drizzle-orm", () => ({
		eq: (column: { name: string }, value: unknown) => ({ type: "eq", column, value }),
		inArray: (column: { name: string }, values: unknown[]) => ({ type: "inArray", column, values }),
	}));
	vi.doMock("src/db", () => ({ db }));
	vi.doMock("src/db/schema", () => ({ downloadClients, trackedDownloads }));

	const { refreshDownloads } = await import("./download-manager");

	await expect(refreshDownloads()).resolves.toEqual({
		success: true,
		message: "No active tracked downloads",
	});
});

it("marks downloads removed when the client row no longer exists", async () => {
	const trackedRows = [{
		id: 1,
		downloadClientId: 99,
		downloadId: "gone",
		bookId: null,
		authorId: null,
		downloadProfileId: null,
		showId: null,
		episodeId: null,
		movieId: null,
		releaseTitle: "Missing Client",
		protocol: "torrent",
		state: "queued",
		outputPath: null,
		message: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	}];

	const db = createFakeDb({ trackedRows, clientRows: [] });
	vi.doMock("drizzle-orm", () => ({
		eq: (column: { name: string }, value: unknown) => ({ type: "eq", column, value }),
		inArray: (column: { name: string }, values: unknown[]) => ({ type: "inArray", column, values }),
	}));
	vi.doMock("src/db", () => ({ db }));
	vi.doMock("src/db/schema", () => ({ downloadClients, trackedDownloads }));
	vi.doMock("./event-bus", () => ({ eventBus: { emit: vi.fn(), getClientCount: () => 0 } }));
	vi.doMock("./settings-reader", () => ({ default: vi.fn().mockReturnValue(true) }));
	vi.doMock("./queue", () => ({ fetchQueueItems: vi.fn().mockResolvedValue([]) }));
	vi.doMock("./logger", () => ({ logError: vi.fn(), logWarn: vi.fn() }));

	const { refreshDownloads } = await import("./download-manager");

	await refreshDownloads();
	expect(trackedRows[0].state).toBe("removed");
	expect(trackedRows[0].message).toBe("Download client deleted");
});
```

- [ ] **Step 2: Add the downloading, completed-import, and queue-event branches**

Append:

```ts
it("moves queued downloads into downloading when the client still reports progress", async () => {
	const trackedRows: FakeTrackedDownloadRow[] = [{
		id: 1,
		downloadClientId: 7,
		downloadId: "download-1",
		bookId: 42,
		authorId: null,
		downloadProfileId: null,
		showId: null,
		episodeId: null,
		movieId: null,
		releaseTitle: "Queued Release",
		protocol: "torrent",
		state: "queued",
		outputPath: null,
		message: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	}];
	const clientRows = [{
		id: 7,
		name: "Test qBittorrent",
		implementation: "qBittorrent",
		host: "localhost",
		port: 8080,
		useSsl: false,
		urlBase: null,
		username: null,
		password: null,
		apiKey: null,
		category: null,
		tag: null,
		settings: null,
		removeCompletedDownloads: true,
	}];
	const db = createFakeDb({ trackedRows, clientRows });
	const provider = {
		getDownloads: vi.fn().mockResolvedValue([
			{
				id: "download-1",
				name: "Queued Release",
				status: "downloading",
				size: 10,
				downloaded: 5,
				uploadSpeed: 0,
				downloadSpeed: 0,
				category: null,
				outputPath: null,
				isCompleted: false,
			},
		]),
		removeDownload: vi.fn(),
	};

	vi.doMock("drizzle-orm", () => ({
		eq: (column: { name: string }, value: unknown) => ({ type: "eq", column, value }),
		inArray: (column: { name: string }, values: unknown[]) => ({ type: "inArray", column, values }),
	}));
	vi.doMock("src/db", () => ({ db }));
	vi.doMock("src/db/schema", () => ({ downloadClients, trackedDownloads }));
	vi.doMock("./download-clients/registry", () => ({ default: vi.fn().mockResolvedValue(provider) }));
	vi.doMock("./file-import", () => ({ importCompletedDownload: vi.fn() }));
	vi.doMock("./failed-download-handler", () => ({ default: vi.fn() }));
	vi.doMock("./event-bus", () => ({ eventBus: { emit: vi.fn(), getClientCount: () => 0 } }));
	vi.doMock("./settings-reader", () => ({ default: vi.fn().mockReturnValue(true) }));
	vi.doMock("./queue", () => ({ fetchQueueItems: vi.fn().mockResolvedValue([]) }));
	vi.doMock("./logger", () => ({ logError: vi.fn(), logWarn: vi.fn() }));

	const { refreshDownloads } = await import("./download-manager");

	await expect(refreshDownloads()).resolves.toEqual({
		success: true,
		message: "Processed 1 downloads: 1 downloading",
	});
	expect(trackedRows[0].state).toBe("downloading");
});

it("removes a completed download from the client after a successful import", async () => {
	const trackedRows: FakeTrackedDownloadRow[] = [{
		id: 1,
		downloadClientId: 7,
		downloadId: "download-1",
		bookId: 42,
		authorId: null,
		downloadProfileId: null,
		showId: null,
		episodeId: null,
		movieId: null,
		releaseTitle: "Completed Release",
		protocol: "torrent",
		state: "queued",
		outputPath: null,
		message: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	}];
	const clientRows = [{
		id: 7,
		name: "Test qBittorrent",
		implementation: "qBittorrent",
		host: "localhost",
		port: 8080,
		useSsl: false,
		urlBase: null,
		username: null,
		password: null,
		apiKey: null,
		category: null,
		tag: null,
		settings: null,
		removeCompletedDownloads: true,
	}];
	const db = createFakeDb({ trackedRows, clientRows });
	const provider = {
		getDownloads: vi.fn().mockResolvedValue([
			{
				id: "download-1",
				name: "Completed Release",
				status: "completed",
				size: 10,
				downloaded: 10,
				uploadSpeed: 0,
				downloadSpeed: 0,
				category: null,
				outputPath: "/downloads/completed",
				isCompleted: true,
			},
		]),
		removeDownload: vi.fn().mockResolvedValue(undefined),
	};
	const importCompletedDownload = vi.fn().mockImplementation(async () => {
		trackedRows[0].state = "imported";
	});

	vi.doMock("drizzle-orm", () => ({
		eq: (column: { name: string }, value: unknown) => ({ type: "eq", column, value }),
		inArray: (column: { name: string }, values: unknown[]) => ({ type: "inArray", column, values }),
	}));
	vi.doMock("src/db", () => ({ db }));
	vi.doMock("src/db/schema", () => ({ downloadClients, trackedDownloads }));
	vi.doMock("./download-clients/registry", () => ({ default: vi.fn().mockResolvedValue(provider) }));
	vi.doMock("./file-import", () => ({ importCompletedDownload }));
	vi.doMock("./failed-download-handler", () => ({ default: vi.fn() }));
	vi.doMock("./event-bus", () => ({ eventBus: { emit: vi.fn(), getClientCount: () => 0 } }));
	vi.doMock("./settings-reader", () => ({ default: vi.fn().mockReturnValue(true) }));
	vi.doMock("./queue", () => ({ fetchQueueItems: vi.fn().mockResolvedValue([]) }));
	vi.doMock("./logger", () => ({ logError: vi.fn(), logWarn: vi.fn() }));

	const { refreshDownloads } = await import("./download-manager");

	await expect(refreshDownloads()).resolves.toEqual({
		success: true,
		message: "Processed 1 downloads: 1 completed",
	});
	expect(importCompletedDownload).toHaveBeenCalledWith(1);
	expect(provider.removeDownload).toHaveBeenCalledWith(
		expect.objectContaining({ implementation: "qBittorrent" }),
		"download-1",
		false,
	);
});

it("emits queueProgress when clients are connected and queueUpdated otherwise", async () => {
	const trackedRows: FakeTrackedDownloadRow[] = [{
		id: 1,
		downloadClientId: 7,
		downloadId: "download-1",
		bookId: null,
		authorId: null,
		downloadProfileId: null,
		showId: null,
		episodeId: null,
		movieId: null,
		releaseTitle: "Queue Event Release",
		protocol: "torrent",
		state: "queued",
		outputPath: null,
		message: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	}];
	const clientRows = [{
		id: 7,
		name: "Test qBittorrent",
		implementation: "qBittorrent",
		host: "localhost",
		port: 8080,
		useSsl: false,
		urlBase: null,
		username: null,
		password: null,
		apiKey: null,
		category: null,
		tag: null,
		settings: null,
		removeCompletedDownloads: false,
	}];

	for (const clientCount of [1, 0]) {
		vi.resetModules();
		const db = createFakeDb({
			trackedRows: trackedRows.map((row) => ({ ...row })),
			clientRows,
		});
		const emit = vi.fn();
		const fetchQueueItems = vi.fn().mockResolvedValue([{ id: "queue-1" }]);
		vi.doMock("drizzle-orm", () => ({
			eq: (column: { name: string }, value: unknown) => ({ type: "eq", column, value }),
			inArray: (column: { name: string }, values: unknown[]) => ({ type: "inArray", column, values }),
		}));
		vi.doMock("src/db", () => ({ db }));
		vi.doMock("src/db/schema", () => ({ downloadClients, trackedDownloads }));
		vi.doMock("./download-clients/registry", () => ({
			default: vi.fn().mockResolvedValue({
				getDownloads: vi.fn().mockResolvedValue([]),
				removeDownload: vi.fn(),
			}),
		}));
		vi.doMock("./file-import", () => ({ importCompletedDownload: vi.fn() }));
		vi.doMock("./failed-download-handler", () => ({ default: vi.fn() }));
		vi.doMock("./event-bus", () => ({ eventBus: { emit, getClientCount: () => clientCount } }));
		vi.doMock("./settings-reader", () => ({ default: vi.fn().mockReturnValue(true) }));
		vi.doMock("./queue", () => ({ fetchQueueItems }));
		vi.doMock("./logger", () => ({ logError: vi.fn(), logWarn: vi.fn() }));

		const { refreshDownloads } = await import("./download-manager");
		await refreshDownloads();

		if (clientCount > 0) {
			expect(fetchQueueItems).toHaveBeenCalled();
			expect(emit).toHaveBeenCalledWith({
				type: "queueProgress",
				data: [{ id: "queue-1" }],
			});
		} else {
			expect(emit).toHaveBeenCalledWith({ type: "queueUpdated" });
		}
	}
});
```

- [ ] **Step 3: Run the download manager test file and the server-core gate**

Run: `bun run test -- src/server/download-manager.test.ts`

Expected: PASS.

Run: `bun run test:coverage:server-core`

Expected: still FAIL, but with `download-manager.ts` now at or above the threshold and fewer remaining offenders.

- [ ] **Step 4: Commit the download manager coverage work**

```bash
git add src/server/download-manager.test.ts
git commit -m "test(downloads): cover download manager state branches"
```

### Task 7: Finish Protocol-Client Branch Coverage And Turn The Gate Green

**Files:**
- Modify: `src/server/download-clients/qbittorrent.test.ts`
- Modify: `src/server/download-clients/sabnzbd.test.ts`
- Modify: `vitest.server-core.allowlist.ts`

- [ ] **Step 1: Add qBittorrent error and branch tests**

Extend `src/server/download-clients/qbittorrent.test.ts` with:

```ts
it("surfaces a failed login as a connection error", async () => {
	const server = await startHttpTestServer(async (request, response) => {
		if (request.pathname === "/api/v2/auth/login") {
			response.statusCode = 403;
			response.end("Fails.");
			return;
		}
		response.statusCode = 404;
		response.end("not found");
	});

	try {
		await expect(
			qbittorrentProvider.testConnection({
				implementation: "qBittorrent",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: "/qb",
				username: "admin",
				password: "wrong",
				apiKey: null,
				category: null,
				tag: null,
				settings: null,
			}),
		).resolves.toEqual({
			success: false,
			message: expect.stringContaining("HTTP 403"),
			version: null,
		});
	} finally {
		await server.stop();
	}
});
```

- [ ] **Step 2: Add SABnzbd upload and failure-path coverage**

Extend `src/server/download-clients/sabnzbd.test.ts` with:

```ts
it("uploads raw NZB data when a URL is not provided", async () => {
	const server = await startHttpTestServer(async (request, response) => {
		expect(request.pathname).toBe("/api");
		expect(request.search).toContain("mode=addurl");
		expect(request.search).toContain("cat=usenet%20books");
		expect(request.search).not.toContain("name=");
		response.statusCode = 400;
		response.end("missing url");
	});

	try {
		await expect(
			sabnzbdProvider.addDownload(
				{
					implementation: "SABnzbd",
					host: "127.0.0.1",
					port: Number(server.baseUrl.split(":").pop()),
					useSsl: false,
					urlBase: null,
					username: null,
					password: null,
					apiKey: "test-sabnzbd-api-key",
					category: "usenet books",
					tag: null,
					settings: null,
				},
				{
					url: null,
					torrentData: null,
					nzbData: new Uint8Array([1, 2, 3]),
					category: "books",
					tag: null,
					savePath: null,
				},
			),
		).rejects.toThrow("SABnzbd provider requires a URL");
	} finally {
		await server.stop();
	}
});

it("returns a failure payload when version lookup fails", async () => {
	const server = await startHttpTestServer(async (_request, response) => {
		response.statusCode = 500;
		response.end("boom");
	});

	try {
		await expect(
			sabnzbdProvider.testConnection({
				implementation: "SABnzbd",
				host: "127.0.0.1",
				port: Number(server.baseUrl.split(":").pop()),
				useSsl: false,
				urlBase: null,
				username: null,
				password: null,
				apiKey: "test-sabnzbd-api-key",
				category: null,
				tag: null,
				settings: null,
			}),
		).resolves.toEqual({
			success: false,
			message: "SABnzbd API error: HTTP 500",
			version: null,
		});
	} finally {
		await server.stop();
	}
});
```

- [ ] **Step 3: Keep the final allowlist explicit and unchanged**

Ensure `vitest.server-core.allowlist.ts` still contains exactly this final phase-one set:

```ts
export const serverCoreCoverageAllowlist = [
	"src/server/api-cache.ts",
	"src/server/download-manager.ts",
	"src/server/download-clients/http.ts",
	"src/server/download-clients/qbittorrent.ts",
	"src/server/download-clients/registry.ts",
	"src/server/download-clients/sabnzbd.ts",
	"src/server/hint-extractor.ts",
	"src/server/image-cache.ts",
	"src/server/import-mapping.ts",
	"src/server/indexers/http.ts",
	"src/server/indexers/release-type-parser.ts",
	"src/server/settings-store.ts",
	"src/server/settings-value.ts",
	"src/server/users.ts",
	"src/lib/runtime.ts",
	"src/lib/table-column-defaults.ts",
] as const;
```

- [ ] **Step 4: Run the final verification suite**

Run: `bun run test`

Expected: PASS.

Run: `bun run typecheck`

Expected: PASS.

Run: `bun run lint`

Expected: PASS.

Run: `bun run test:coverage:all`

Expected: PASS and produce the informational whole-repo report.

Run: `bun run test:coverage:server-core`

Expected: PASS with statements, branches, functions, and lines all `>=95%` for the allowlist.

- [ ] **Step 5: Commit the green gate**

```bash
git add src/server/download-clients/qbittorrent.test.ts src/server/download-clients/sabnzbd.test.ts vitest.server-core.allowlist.ts
git commit -m "test(coverage): make server core coverage gate pass"
```
