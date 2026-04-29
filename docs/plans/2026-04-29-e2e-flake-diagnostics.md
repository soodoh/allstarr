# E2E Flake Diagnostics Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Add lightweight, structured Playwright e2e diagnostics that make startup, fake-service readiness, reset, scenario seeding, and teardown failures actionable without increasing retries.

**Architecture:** Add a small e2e-only diagnostics helper that records timed events, prints concise structured lines, and can attach a per-test diagnostic summary on failure. Wire it into global setup/teardown, the app server fixture, and the fake-server manager without changing test behavior or retry policy.

**Tech Stack:** TypeScript, Playwright fixtures, Vitest node tests, Bun test commands, existing fake-server manager and e2e setup files.

---

## Chosen backlog item

This plan addresses `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md` item **P1-7: Add e2e flake diagnostics without increasing retries**.

## Design choice

Three viable approaches were considered:

1. **Inline `console.info` calls only** — fastest, but likely drifts and is hard to test.
2. **A minimal shared diagnostics helper** — small reusable surface, testable, and keeps logs consistent. **Recommended.**
3. **Custom Playwright reporter** — powerful, but too heavy for the current need and harder to connect to fixture internals.

Use option 2. Keep retries unchanged at `1`, preserve `trace: "on-first-retry"`, and avoid broad reporter changes.

## Success criteria

- Normal e2e output includes concise timing lines for global setup, app startup, fake-service readiness, reset, scenario seeding, and teardown.
- Failures identify the service name, endpoint, URL, attempt count, elapsed time, and operation where applicable.
- Failed tests receive a diagnostic attachment with recent per-test events.
- Retry count is not increased.
- Diagnostics do not leak secrets or dump large fake-service state payloads.

---

### Task 1: Add a small diagnostics helper

**Files:**
- Create: `e2e/helpers/diagnostics.ts`
- Test: `e2e/helpers/diagnostics.test.ts`

**Step 1: Write the failing tests**

Create `e2e/helpers/diagnostics.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createDiagnosticBuffer,
  formatDiagnosticLine,
  redactDiagnosticValue,
  timeDiagnosticOperation,
} from "./diagnostics";

describe("e2e diagnostics", () => {
  it("formats structured diagnostic lines with elapsed time", () => {
    expect(
      formatDiagnosticLine({
        scope: "fake-service",
        event: "ready",
        status: "ok",
        elapsedMs: 123,
        fields: { service: "QBITTORRENT", endpoint: "/__state" },
      }),
    ).toBe(
      '[e2e] scope=fake-service event=ready status=ok elapsedMs=123 service=QBITTORRENT endpoint=/__state',
    );
  });

  it("redacts secret-like field values", () => {
    expect(redactDiagnosticValue("apiKey", "super-secret")).toBe("[redacted]");
    expect(redactDiagnosticValue("url", "http://127.0.0.1:3000/login")).toBe(
      "http://127.0.0.1:3000/login",
    );
  });

  it("keeps a bounded in-memory event buffer", () => {
    const buffer = createDiagnosticBuffer(2);
    buffer.record({ scope: "test", event: "one", status: "ok" });
    buffer.record({ scope: "test", event: "two", status: "ok" });
    buffer.record({ scope: "test", event: "three", status: "ok" });

    expect(buffer.toJSON()).toHaveLength(2);
    expect(buffer.toJSON().map((entry) => entry.event)).toEqual(["two", "three"]);
  });

  it("times successful and failed operations", async () => {
    vi.useFakeTimers();
    const logs: string[] = [];

    const success = timeDiagnosticOperation(
      { scope: "setup", event: "db-push", fields: { command: "bun run db:push" } },
      async () => {
        vi.advanceTimersByTime(25);
        return "done";
      },
      { log: (line) => logs.push(line), now: () => Date.now() },
    );

    await expect(success).resolves.toBe("done");
    expect(logs.at(-1)).toContain("status=ok");
    expect(logs.at(-1)).toContain("event=db-push");

    const failure = timeDiagnosticOperation(
      { scope: "setup", event: "db-push" },
      async () => {
        vi.advanceTimersByTime(10);
        throw new Error("boom");
      },
      { log: (line) => logs.push(line), now: () => Date.now() },
    );

    await expect(failure).rejects.toThrow("boom");
    expect(logs.at(-1)).toContain("status=error");
    expect(logs.at(-1)).toContain("error=boom");
    vi.useRealTimers();
  });
});
```

**Step 2: Run the test and verify it fails**

Run:

```bash
bun run test -- e2e/helpers/diagnostics.test.ts
```

Expected: FAIL because `e2e/helpers/diagnostics.ts` does not exist.

**Step 3: Implement the minimal helper**

Create `e2e/helpers/diagnostics.ts`:

```ts
export type DiagnosticStatus = "ok" | "error" | "info";

export type DiagnosticEvent = {
  scope: string;
  event: string;
  status: DiagnosticStatus;
  elapsedMs?: number;
  fields?: Record<string, boolean | number | string | null | undefined>;
};

type DiagnosticTimerOptions = {
  log?: (line: string) => void;
  now?: () => number;
};

const SECRET_FIELD_PATTERN = /api[-_]?key|secret|token|password|cookie|authorization/i;

export function redactDiagnosticValue(key: string, value: unknown): string {
  if (value == null) {
    return "";
  }
  if (SECRET_FIELD_PATTERN.test(key)) {
    return "[redacted]";
  }
  return String(value).replaceAll(/\s+/g, " ");
}

export function formatDiagnosticLine(event: DiagnosticEvent): string {
  const parts = [
    "[e2e]",
    `scope=${event.scope}`,
    `event=${event.event}`,
    `status=${event.status}`,
  ];

  if (typeof event.elapsedMs === "number") {
    parts.push(`elapsedMs=${Math.round(event.elapsedMs)}`);
  }

  for (const [key, value] of Object.entries(event.fields ?? {})) {
    if (value === undefined) {
      continue;
    }
    parts.push(`${key}=${redactDiagnosticValue(key, value)}`);
  }

  return parts.join(" ");
}

export function createDiagnosticBuffer(limit = 100) {
  const events: DiagnosticEvent[] = [];

  return {
    record(event: DiagnosticEvent): void {
      events.push(event);
      while (events.length > limit) {
        events.shift();
      }
    },
    toJSON(): DiagnosticEvent[] {
      return [...events];
    },
    toText(): string {
      return events.map(formatDiagnosticLine).join("\n");
    },
    clear(): void {
      events.length = 0;
    },
  };
}

export async function timeDiagnosticOperation<T>(
  event: Omit<DiagnosticEvent, "status" | "elapsedMs">,
  operation: () => Promise<T>,
  options: DiagnosticTimerOptions = {},
): Promise<T> {
  const now = options.now ?? Date.now;
  const log = options.log ?? console.info;
  const start = now();

  try {
    const result = await operation();
    log(formatDiagnosticLine({ ...event, status: "ok", elapsedMs: now() - start }));
    return result;
  } catch (error) {
    log(
      formatDiagnosticLine({
        ...event,
        status: "error",
        elapsedMs: now() - start,
        fields: {
          ...event.fields,
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    );
    throw error;
  }
}
```

**Step 4: Run the test and verify it passes**

Run:

```bash
bun run test -- e2e/helpers/diagnostics.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add e2e/helpers/diagnostics.ts e2e/helpers/diagnostics.test.ts
git commit -m "test(e2e): add diagnostics helper"
```

---

### Task 2: Add diagnostics to fake-server startup, reset, and seeding

**Files:**
- Modify: `e2e/fixtures/fake-servers/manager.ts`
- Test: `e2e/fixtures/fake-servers/manager.test.ts`

**Step 1: Write failing tests for error context and unchanged reset semantics**

Add tests to `e2e/fixtures/fake-servers/manager.test.ts`:

```ts
it("reports fake-service readiness failures with service, endpoint, and attempts", async () => {
  const manager = createFakeServerManager(["QBITTORRENT"], {
    ports: { QBITTORRENT: 9 },
    readinessTimeoutMs: 20,
    readinessIntervalMs: 1,
  });

  await expect(manager.start()).rejects.toThrow(
    /Fake service QBITTORRENT at http:\/\/localhost:9\/__state did not become ready/,
  );
});

it("keeps reset scoped to running services after diagnostics are added", async () => {
  const manager = createFakeServerManager(["QBITTORRENT"]);
  try {
    await manager.start();
    await expect(manager.reset()).resolves.toBeUndefined();
  } finally {
    await manager.stop();
  }
});
```

**Step 2: Run the targeted test and verify it fails**

Run:

```bash
bun run test -- e2e/fixtures/fake-servers/manager.test.ts
```

Expected: FAIL because `readinessTimeoutMs` / `readinessIntervalMs` options and richer error messages do not exist.

**Step 3: Implement diagnostics in manager**

In `e2e/fixtures/fake-servers/manager.ts`:

- Import `formatDiagnosticLine` and `timeDiagnosticOperation` from `../../helpers/diagnostics`.
- Extend `createFakeServerManager` options:

```ts
options?: {
  ports?: ServicePorts;
  scenarioName?: string;
  readinessTimeoutMs?: number;
  readinessIntervalMs?: number;
}
```

- Replace `waitForServer(url: string)` with:

```ts
async function waitForServer(
  serviceName: ServiceName,
  url: string,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 5_000;
  const intervalMs = options?.intervalMs ?? 100;
  const endpoint = "/__state";
  const startedAt = Date.now();
  let attempts = 0;
  let lastError = "not ready";

  while (Date.now() - startedAt < timeoutMs) {
    attempts += 1;
    try {
      const response = await fetch(`${url}${endpoint}`);
      if (response.ok) {
        console.info(
          formatDiagnosticLine({
            scope: "fake-service",
            event: "ready",
            status: "ok",
            elapsedMs: Date.now() - startedAt,
            fields: { service: serviceName, url, endpoint, attempts },
          }),
        );
        return;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  console.info(
    formatDiagnosticLine({
      scope: "fake-service",
      event: "ready",
      status: "error",
      elapsedMs: Date.now() - startedAt,
      fields: { service: serviceName, url, endpoint, attempts, error: lastError },
    }),
  );

  throw new Error(
    `Fake service ${serviceName} at ${url}${endpoint} did not become ready after ${attempts} attempts in ${Date.now() - startedAt}ms: ${lastError}`,
  );
}
```

- In `start()`, call `waitForServer(name, server.url, { timeoutMs: options?.readinessTimeoutMs, intervalMs: options?.readinessIntervalMs })`.
- Wrap default seed reads, scenario application, `reset`, `setScenario`, `setServiceState`, and `stop` in `timeDiagnosticOperation` with fields for `service`, `scenarioName`, `stateName`, and `runningServiceCount` as appropriate.
- In `reset()`, check every response and throw with service/path/status if any reset fails; currently failed reset responses can be ignored.

**Step 4: Run tests and verify they pass**

Run:

```bash
bun run test -- e2e/fixtures/fake-servers/manager.test.ts e2e/helpers/diagnostics.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add e2e/fixtures/fake-servers/manager.ts e2e/fixtures/fake-servers/manager.test.ts
git commit -m "test(e2e): report fake service diagnostics"
```

---

### Task 3: Add diagnostics to app server startup and per-test reset

**Files:**
- Modify: `e2e/fixtures/app.ts`
- Optionally test via existing e2e smoke after implementation.

**Step 1: Add diagnostic expectations before changing code**

This fixture is Playwright-runner specific, so use an implementation smoke rather than a unit test. Before changing code, run one quick e2e and save the baseline output:

```bash
bun run test:e2e -- e2e/tests/07-download-lifecycle.spec.ts
```

Expected: PASS or existing known baseline. Output should not yet include app startup timing lines.

**Step 2: Implement app startup diagnostics**

In `e2e/fixtures/app.ts`:

- Import `createDiagnosticBuffer`, `formatDiagnosticLine`, and `timeDiagnosticOperation` from `../helpers/diagnostics`.
- Enhance `waitForServer(url, timeoutMs)` to record attempts, endpoint `/login`, elapsed time, and last error/status in both success and failure logs.
- When spawning the app server, log command, args length, worker index, app URL, and database path basename only. Do not print env values.
- Capture `proc.stdout` and `proc.stderr` lines into a bounded worker diagnostic buffer. Prefix them with `[e2e-app]` when printing only if needed; otherwise keep them in the buffer for failure attachment to avoid noisy success output.
- Around `await waitForServer(...)`, use `timeDiagnosticOperation({ scope: "app", event: "startup", fields: { workerIndex, url: spawnConfig.url } }, ...)`.
- When startup fails, kill the process, clean up the database handle, and include recent stdout/stderr snippets in the thrown error message.

**Step 3: Implement per-test reset diagnostics and attachments**

In `test.beforeEach(async ({ appServer, serviceManager }, testInfo) => { ... })`:

- Time `POST /api/__test-reset` with scope `app`, event `test-reset`, fields `{ testTitle: testInfo.title, workerIndex: testInfo.workerIndex }`.
- If the response is non-2xx, throw `App test reset failed: POST /api/__test-reset returned <status> <statusText>`.
- Time `serviceManager.reset()` with scope `fake-service`, event `reset-all` and fields `{ testTitle: testInfo.title }`.

In `test.afterEach`, when `testInfo.status !== testInfo.expectedStatus`, attach recent diagnostic text:

```ts
await testInfo.attach("e2e-diagnostics", {
  body: diagnosticBuffer.toText() || "No e2e diagnostics captured.",
  contentType: "text/plain",
});
```

Clear the per-test buffer after attachment / successful completion.

**Step 4: Run the e2e smoke and inspect output**

Run:

```bash
bun run test:e2e -- e2e/tests/07-download-lifecycle.spec.ts
```

Expected: PASS. Normal output includes concise `[e2e] scope=app event=startup ...`, `[e2e] scope=app event=test-reset ...`, and `[e2e] scope=fake-service event=reset-all ...` lines without app env secrets.

**Step 5: Commit**

```bash
git add e2e/fixtures/app.ts
git commit -m "test(e2e): add app startup diagnostics"
```

---

### Task 4: Add diagnostics to global setup and teardown

**Files:**
- Modify: `e2e/global-setup.ts`
- Modify: `e2e/global-teardown.ts`

**Step 1: Capture baseline setup behavior**

Run:

```bash
bun run test:e2e -- e2e/tests/01-auth.spec.ts
```

Expected: PASS. Existing setup output is sparse.

**Step 2: Instrument global setup**

In `e2e/global-setup.ts`:

- Import `formatDiagnosticLine` and `timeDiagnosticOperation` from `./helpers/diagnostics`.
- Wrap these phases:
  - `killPortListeners`: log ports scanned, listeners killed count, and elapsed time.
  - template DB directory creation and stale file unlink.
  - `bun run db:push`: log command and database path, but not env contents.
  - seed insert / checkpoint.
  - `.test-state.json` write.
- Modify `killPortListeners` to return `{ scannedPorts: number; killedProcesses: number }` so the diagnostic line can include useful counts.
- On `db:push` failure, include stderr/stdout snippets from `execFileSync` if available, but do not dump the whole output.

**Step 3: Instrument global teardown**

In `e2e/global-teardown.ts`:

- Import `timeDiagnosticOperation`.
- Wrap state-file deletion and template-db deletion separately.
- Log `existed=true|false` for each file.

**Step 4: Run e2e smoke and inspect output**

Run:

```bash
bun run test:e2e -- e2e/tests/01-auth.spec.ts
```

Expected: PASS. Output identifies setup phases and teardown cleanup with elapsed times.

**Step 5: Commit**

```bash
git add e2e/global-setup.ts e2e/global-teardown.ts
git commit -m "test(e2e): log setup and teardown diagnostics"
```

---

### Task 5: Add a short flake triage note

**Files:**
- Modify: `docs/testing.md`

**Step 1: Add documentation text**

Append or add a subsection near existing e2e guidance in `docs/testing.md`:

```md
### E2E flake diagnostics

Playwright e2e runs emit `[e2e]` diagnostic lines for global setup, app startup, fake-service readiness, per-test reset, scenario seeding, and teardown. When a test fails, inspect diagnostics in this order:

1. Check Playwright trace and failure screenshot.
2. Check the `e2e-diagnostics` attachment for the failed test.
3. Look for `[e2e] status=error` lines and note `scope`, `event`, `elapsedMs`, `service`, `endpoint`, and `attempts`.
4. If startup failed, inspect app stdout/stderr snippets in the thrown error.
5. If fake-service readiness failed, verify the service name, port, and `/__state` endpoint from the diagnostic line.
6. If reset failed, treat it as fixture contamination until proven otherwise; do not increase retries before identifying why reset failed.

Retries stay at one retry. Add targeted diagnostics or fix the underlying wait/reset condition instead of raising retry count.
```

**Step 2: Run docs-adjacent checks**

Run:

```bash
bun run lint
```

Expected: PASS or auto-fixable formatting messages only. If `lint` reports fixable formatting, run `bun run lint:fix`, then rerun `bun run lint`.

**Step 3: Commit**

```bash
git add docs/testing.md
git commit -m "docs(testing): document e2e flake diagnostics"
```

---

### Task 6: Full verification

**Files:**
- No new files unless fixing verification failures.

**Step 1: Run targeted unit tests**

```bash
bun run test -- e2e/helpers/diagnostics.test.ts e2e/fixtures/fake-servers/manager.test.ts e2e/helpers/tasks.test.ts
```

Expected: PASS.

**Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS.

**Step 3: Run lint**

```bash
bun run lint
```

Expected: PASS.

**Step 4: Run the full e2e suite**

```bash
bun run test:e2e
```

Expected: PASS. Normal output includes concise setup/readiness/reset/teardown diagnostics and does not become noisy with full app logs.

**Step 5: Manually verify failure diagnostics without committing the induced failure**

Temporarily point one fake-service readiness check at an unavailable port in a local edit or use the new test-only options to force a readiness timeout. Run:

```bash
bun run test -- e2e/fixtures/fake-servers/manager.test.ts
```

Expected: The failure identifies service name, endpoint `/__state`, URL, attempts, elapsed time, and last error.

Revert the temporary edit before continuing.

**Step 6: Final commit if verification fixes were needed**

```bash
git status --short
git add <changed-files>
git commit -m "test(e2e): finalize flake diagnostics"
```

Skip this commit if no files changed after Task 5.

---

## Notes for implementation

- Do not increase Playwright retries.
- Keep successful-run output concise; avoid printing full fake-service state, app env, API keys, tokens, cookies, or authorization headers.
- Prefer typed helper functions over ad hoc log strings.
- Keep diagnostics e2e-only under `e2e/` so production logging remains unchanged.
- If a diagnostic event needs a new field, add it to the helper as generic `fields` metadata instead of expanding many bespoke types.
