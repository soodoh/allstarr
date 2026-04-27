# First Reliability Tranche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first ranked reliability tranche by making job-run, tracked-download, HTTP, import, and unmapped-file side-effect boundaries explicit and testable.

**Architecture:** Treat job runs and tracked downloads as state-machine boundaries, HTTP integrations as shared request-policy consumers, and import/unmapped mapping as side-effect orchestration flows. Preserve existing public behavior unless a targeted test exposes a reliability gap, and keep each tranche item independently reviewable.

**Tech Stack:** TypeScript, Bun, Drizzle/SQLite, TanStack Start server functions, Vitest, Biome.

---

## Target File Structure

**Create:**
- `src/server/external-request-policy.ts` - shared timeout, retry, `Retry-After`, abort, and rate-limit helpers for external HTTP clients.
- `src/server/external-request-policy.test.ts` - focused tests for shared request policy behavior.
- `src/server/file-side-effects.ts` - small side-effect recorder for filesystem operations that need compensating cleanup.
- `src/server/file-side-effects.test.ts` - focused tests for side-effect recorder cleanup ordering and failure behavior.

**Modify:**
- `src/server/job-runs.ts` - add lifecycle predicates/invariant helpers only if tests need them.
- `src/server/job-runs.test.ts` - add explicit lifecycle invariant coverage.
- `src/server/scheduler/index.ts` - use lifecycle helpers only if needed by tests; preserve current scheduling behavior.
- `src/server/scheduler/index.test.ts` - add stale recovery and overlap regression coverage.
- `src/server/commands.ts` - use lifecycle helpers only if needed by tests; preserve command API.
- `src/server/commands.test.ts` - add command/job-run invariant coverage.
- `src/server/tracked-download-state.ts` - expose an import-claim helper and prevent direct import state writes.
- `src/server/tracked-download-state.test.ts` - add claim/idempotency/invalid transition coverage.
- `src/server/download-manager.ts` - route import claims through tracked-download transition helpers.
- `src/server/download-manager.test.ts` - preserve retry and concurrent-claim behavior.
- `src/server/file-import.ts` - remove direct `trackedDownloads.state` writes and record import side effects around file operations.
- `src/server/file-import.test.ts` - add failure-injection coverage for import side effects.
- `src/server/api-cache.ts` - use shared retry delay helpers without changing cache API.
- `src/server/__tests__/api-cache.test.ts` - preserve cache and retry behavior.
- `src/server/indexers/http.ts` - migrate 429 retry/timeout policy to shared helper while keeping indexer rate-limit reporting.
- `src/server/indexers/http.test.ts` - preserve retry, timeout, and `Retry-After` behavior.
- `src/server/hardcover/client.ts` - use shared timeout/fetch helper while preserving error messages.
- `src/server/hardcover/client.test.ts` - preserve timeout, auth, JSON, and rate-limit behavior.
- `src/server/tmdb/client.ts` - add shared timeout/fetch helper and preserve cache/error behavior.
- `src/server/tmdb/client.test.ts` - add timeout coverage and preserve existing behavior.
- `src/server/download-clients/http.ts` - delegate timeout behavior to shared helper.
- `src/server/download-clients/http.test.ts` - preserve timeout behavior.
- `src/server/unmapped-file-mapping-executor.ts` - extend operation-runner behavior only if needed for typed side-effect plans.
- `src/server/unmapped-file-mapping-executor.test.ts` - add rollback runner coverage.
- `src/server/unmapped-files.ts` - use explicit mapping operation plans for book, movie, and episode flows where practical.
- `src/server/unmapped-files.test.ts` - add media-specific rollback regression coverage.

Do not edit `src/routeTree.gen.ts` or anything under `.worktrees/`.

## Task 1: Job-Run Lifecycle Invariants

**Files:**
- Modify: `src/server/job-runs.ts`
- Modify: `src/server/job-runs.test.ts`
- Modify: `src/server/scheduler/index.ts`
- Modify: `src/server/scheduler/index.test.ts`
- Modify: `src/server/commands.ts`
- Modify: `src/server/commands.test.ts`

- [ ] **Step 1: Add job-run invariant tests**

Add tests that define the lifecycle contract before changing implementation:

```ts
it("does not let terminal job runs block a new acquisition with the same dedupe identity", () => {
	const first = acquireJobRun({
		sourceType: "scheduled",
		jobType: "refresh-downloads",
		displayName: "Refresh Downloads",
	});
	completeJobRun(first.id, { success: true });

	const second = acquireJobRun({
		sourceType: "scheduled",
		jobType: "refresh-downloads",
		displayName: "Refresh Downloads",
	});

	expect(second.id).not.toBe(first.id);
	expect(second.status).toBe("running");
});

it("does not update terminal job runs after completion", () => {
	const run = acquireJobRun({
		sourceType: "command",
		jobType: "import",
		displayName: "Import",
		dedupeKey: "path",
		dedupeValue: "/media/book.epub",
	});

	completeJobRun(run.id, { imported: 1 });
	failJobRun(run.id, "late failure");

	const [row] = listActiveJobRuns().filter((active) => active.id === run.id);
	expect(row).toBeUndefined();
	const persisted = testDb
		.select()
		.from(jobRuns)
		.where(eq(jobRuns.id, run.id))
		.get();
	expect(persisted?.status).toBe("succeeded");
	expect(persisted?.error).toBeNull();
});
```

If the test setup in `src/server/job-runs.test.ts` uses a mocked DB helper with a different accessor than `testDb`, use the existing local DB variable from that file and import `jobRuns`, `eq`, or local helpers in the same style as nearby tests.

- [ ] **Step 2: Run job-run tests and confirm baseline**

Run:

```bash
bun run test -- src/server/job-runs.test.ts
```

Expected: tests either pass with the current implementation or fail only where terminal update/lifecycle behavior is inconsistent.

- [ ] **Step 3: Add lifecycle helpers if tests expose unclear semantics**

If Step 2 exposes duplication in status checks, add these helpers to `src/server/job-runs.ts`:

```ts
export function isNonTerminalJobStatus(status: JobRunStatus): boolean {
	return (NON_TERMINAL_JOB_STATUSES as readonly string[]).includes(status);
}

export function isTerminalJobStatus(status: JobRunStatus): boolean {
	return !isNonTerminalJobStatus(status);
}
```

Then replace repeated local non-terminal checks only where it reduces ambiguity. Do not change database schema or public return shapes.

- [ ] **Step 4: Add scheduler and command overlap regression tests**

Add or tighten tests in `src/server/scheduler/index.test.ts` and `src/server/commands.test.ts` so both overlap directions are explicit:

```ts
it("skips a scheduled task when a command declares the same batch task overlap", async () => {
	// Use the existing scheduler mocks in this file.
	// Seed an active command job run with metadata: { batchTaskId: "refresh-metadata" }.
	// Run the matching scheduled task.
	// Expect the task handler not to run and no failed job run to be created.
});

it("rejects a command when a matching scheduled batch task is active", () => {
	// Use the existing commands test mocks.
	// Seed an active scheduled job run with jobType matching batchTaskId.
	// Submit the command with that batchTaskId.
	// Expect the existing overlap error message.
});
```

Use the concrete task IDs and helpers already used in each test file. Keep the assertions focused on overlap and active-run state.

- [ ] **Step 5: Run targeted scheduler and command tests**

Run:

```bash
bun run test -- src/server/job-runs.test.ts src/server/scheduler/index.test.ts src/server/commands.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit job-run invariant work**

Run:

```bash
git add src/server/job-runs.ts src/server/job-runs.test.ts src/server/scheduler/index.ts src/server/scheduler/index.test.ts src/server/commands.ts src/server/commands.test.ts
git commit -m "fix(reliability): codify job run invariants"
```

If a listed production file did not change, omit it from `git add`.

## Task 2: Tracked Download Transition Boundary

**Files:**
- Modify: `src/server/tracked-download-state.ts`
- Modify: `src/server/tracked-download-state.test.ts`
- Modify: `src/server/download-manager.ts`
- Modify: `src/server/download-manager.test.ts`
- Modify: `src/server/file-import.ts`
- Modify: `src/server/file-import.test.ts`

- [ ] **Step 1: Add import-claim helper tests**

Add tests in `src/server/tracked-download-state.test.ts`:

```ts
it("claims a completed tracked download for import", () => {
	const row = insertTrackedDownload({ state: "completed" });

	claimTrackedDownloadImport(row.id);

	expect(getTrackedDownload(row.id)?.state).toBe("importPending");
});

it("treats an already import-pending tracked download as an existing import claim", () => {
	const row = insertTrackedDownload({ state: "importPending" });

	claimTrackedDownloadImport(row.id);

	expect(getTrackedDownload(row.id)?.state).toBe("importPending");
});

it("rejects import claims from terminal states without changing persisted state", () => {
	const row = insertTrackedDownload({ state: "failed", message: "previous failure" });

	expect(() => claimTrackedDownloadImport(row.id)).toThrow(
		"Cannot claim tracked download",
	);
	expect(getTrackedDownload(row.id)?.state).toBe("failed");
});
```

Use the existing row factory names from the file. If they are named differently, keep the same assertions and call the local insert/get helpers.

- [ ] **Step 2: Run the new transition tests and confirm failure**

Run:

```bash
bun run test -- src/server/tracked-download-state.test.ts
```

Expected: FAIL with `claimTrackedDownloadImport is not defined` or equivalent missing export.

- [ ] **Step 3: Implement import-claim helper**

Add this to `src/server/tracked-download-state.ts`:

```ts
export function claimTrackedDownloadImport(
	id: number,
	tx: TrackedDownloadStateDb = db,
): void {
	const trackedDownload = tx
		.select({ state: trackedDownloads.state })
		.from(trackedDownloads)
		.where(eq(trackedDownloads.id, id))
		.get();

	if (!trackedDownload) {
		throw new Error(`Tracked download ${id} not found.`);
	}

	assertTrackedDownloadState(trackedDownload.state);

	if (trackedDownload.state === "importPending") {
		return;
	}

	if (trackedDownload.state !== "completed") {
		throw new Error(
			`Cannot claim tracked download ${id} for import from ${trackedDownload.state}.`,
		);
	}

	transitionTrackedDownload(id, "importPending", {}, tx);
}
```

Keep `transitionTrackedDownload` private unless another module already needs it.

- [ ] **Step 4: Route import claim through the helper**

In `src/server/file-import.ts`, replace the direct update in `importCompletedDownload`:

```ts
db.update(trackedDownloads)
	.set({ state: "importPending", updatedAt: new Date() })
	.where(eq(trackedDownloads.id, td.id))
	.run();
```

with:

```ts
claimTrackedDownloadImport(td.id);
```

Add the import:

```ts
import {
	claimTrackedDownloadImport,
	markTrackedDownloadFailed,
} from "./tracked-download-state";
```

Preserve existing `markTrackedDownloadFailed` behavior and error logging.

- [ ] **Step 5: Preserve download-manager retry behavior**

Run:

```bash
bun run test -- src/server/tracked-download-state.test.ts src/server/download-manager.test.ts src/server/file-import.test.ts
```

Expected: PASS. In particular, existing tests named like “retries importPending downloads without marking import pending again” and “skips import without failing the row when claiming import pending fails” must still pass.

- [ ] **Step 6: Commit tracked-download boundary work**

Run:

```bash
git add src/server/tracked-download-state.ts src/server/tracked-download-state.test.ts src/server/file-import.ts src/server/download-manager.ts src/server/download-manager.test.ts src/server/file-import.test.ts
git commit -m "fix(downloads): route import claims through transitions"
```

If `download-manager` production code does not change, omit it from `git add`.

## Task 3: Shared External HTTP Request Policy

**Files:**
- Create: `src/server/external-request-policy.ts`
- Create: `src/server/external-request-policy.test.ts`
- Modify: `src/server/api-cache.ts`
- Modify: `src/server/__tests__/api-cache.test.ts`
- Modify: `src/server/indexers/http.ts`
- Modify: `src/server/indexers/http.test.ts`
- Modify: `src/server/hardcover/client.ts`
- Modify: `src/server/hardcover/client.test.ts`
- Modify: `src/server/tmdb/client.ts`
- Modify: `src/server/tmdb/client.test.ts`
- Modify: `src/server/download-clients/http.ts`
- Modify: `src/server/download-clients/http.test.ts`

- [ ] **Step 1: Add request-policy tests**

Create `src/server/external-request-policy.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createAbortTimeoutError,
	fetchWithExternalTimeout,
	parseRetryAfterHeader,
	resolveRetryDelayMs,
	sleep,
} from "./external-request-policy";

describe("external request policy", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("parses Retry-After seconds", () => {
		const response = new Response(null, {
			headers: { "Retry-After": "3" },
		});

		expect(parseRetryAfterHeader(response)).toBe(3000);
	});

	it("parses Retry-After dates", () => {
		vi.setSystemTime(new Date("2026-04-27T00:00:00.000Z"));
		const response = new Response(null, {
			headers: { "Retry-After": "Mon, 27 Apr 2026 00:00:05 GMT" },
		});

		expect(parseRetryAfterHeader(response)).toBe(5000);
	});

	it("falls back to exponential retry delays", () => {
		expect(resolveRetryDelayMs({ attempt: 2, baseDelayMs: 1000 })).toBe(4000);
		expect(
			resolveRetryDelayMs({
				attempt: 2,
				baseDelayMs: 1000,
				retryAfterMs: 10_000,
				maxDelayMs: 30_000,
			}),
		).toBe(10_000);
	});

	it("wraps abort errors with a stable timeout message", async () => {
		const abortError = new DOMException("aborted", "AbortError");
		const error = createAbortTimeoutError("TMDB API request timed out.", abortError);

		expect(error.message).toBe("TMDB API request timed out.");
		expect(error.cause).toBe(abortError);
	});

	it("sleeps using timers", async () => {
		vi.useFakeTimers();
		const promise = sleep(250);
		await vi.advanceTimersByTimeAsync(250);
		await expect(promise).resolves.toBeUndefined();
	});
});
```

- [ ] **Step 2: Run request-policy tests and confirm failure**

Run:

```bash
bun run test -- src/server/external-request-policy.test.ts
```

Expected: FAIL because `src/server/external-request-policy.ts` does not exist.

- [ ] **Step 3: Implement shared request policy**

Create `src/server/external-request-policy.ts`:

```ts
export type RetryDelayInput = {
	attempt: number;
	baseDelayMs: number;
	retryAfterMs?: number;
	maxDelayMs?: number;
};

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export function parseRetryAfterHeader(response: Response): number | undefined {
	const header = response.headers.get("Retry-After");
	if (!header) {
		return undefined;
	}

	const seconds = Number(header);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return seconds * 1000;
	}

	const dateMs = Date.parse(header);
	if (!Number.isNaN(dateMs)) {
		return Math.max(0, dateMs - Date.now());
	}

	return undefined;
}

export function resolveRetryDelayMs(input: RetryDelayInput): number {
	const delay = input.retryAfterMs ?? input.baseDelayMs * 2 ** input.attempt;
	return Math.min(delay, input.maxDelayMs ?? delay);
}

export function createAbortTimeoutError(message: string, cause: unknown): Error {
	return new Error(message, { cause });
}

export async function fetchWithExternalTimeout(
	url: string,
	options: RequestInit,
	timeoutMs: number,
	timeoutMessage: string,
): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...options, signal: controller.signal });
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw createAbortTimeoutError(timeoutMessage, error);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}
```

- [ ] **Step 4: Migrate download-client HTTP timeout wrapper**

In `src/server/download-clients/http.ts`, replace the local abort implementation with:

```ts
import { fetchWithExternalTimeout } from "../external-request-policy";
```

and:

```ts
export async function fetchWithTimeout(
	url: string,
	options: RequestInit,
	timeoutMs = 10_000,
): Promise<Response> {
	return fetchWithExternalTimeout(url, options, timeoutMs, "Connection timed out.");
}
```

- [ ] **Step 5: Migrate Hardcover and TMDB timeout behavior**

In `src/server/hardcover/client.ts`, replace local `AbortController` timeout code with:

```ts
const response = await fetchWithExternalTimeout(
	HARDCOVER_GRAPHQL_URL,
	{
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: authorization,
		},
		body: JSON.stringify({ query, variables }),
		cache: "no-store",
	},
	REQUEST_TIMEOUT_MS,
	"Hardcover API request timed out.",
);
```

In `src/server/tmdb/client.ts`, add:

```ts
const REQUEST_TIMEOUT_MS = 30_000;
```

and call:

```ts
const response = await fetchWithExternalTimeout(
	cacheKey,
	{},
	REQUEST_TIMEOUT_MS,
	"TMDB API request timed out.",
);
```

Keep existing non-OK and rate-limit messages.

- [ ] **Step 6: Migrate indexer retry delay helpers**

In `src/server/indexers/http.ts`, replace local `sleep`, `parseRetryAfter`, and delay math with imports:

```ts
import {
	parseRetryAfterHeader,
	resolveRetryDelayMs,
	sleep,
} from "../external-request-policy";
```

Use:

```ts
const retryAfter = parseRetryAfterHeader(res);
const capped = resolveRetryDelayMs({
	attempt,
	baseDelayMs: BASE_BACKOFF_MS,
	retryAfterMs: retryAfter,
	maxDelayMs: 30_000,
});
```

Preserve `reportRateLimited`, `reportSuccess`, and log text.

- [ ] **Step 7: Run targeted HTTP policy tests**

Run:

```bash
bun run test -- src/server/external-request-policy.test.ts src/server/__tests__/api-cache.test.ts src/server/indexers/http.test.ts src/server/hardcover/client.test.ts src/server/tmdb/client.test.ts src/server/download-clients/http.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit HTTP policy work**

Run:

```bash
git add src/server/external-request-policy.ts src/server/external-request-policy.test.ts src/server/api-cache.ts src/server/__tests__/api-cache.test.ts src/server/indexers/http.ts src/server/indexers/http.test.ts src/server/hardcover/client.ts src/server/hardcover/client.test.ts src/server/tmdb/client.ts src/server/tmdb/client.test.ts src/server/download-clients/http.ts src/server/download-clients/http.test.ts
git commit -m "fix(reliability): centralize external request policy"
```

Omit `api-cache.ts` if it only keeps existing behavior and does not need a code change.

## Task 4: Import File Side-Effect Recorder

**Files:**
- Create: `src/server/file-side-effects.ts`
- Create: `src/server/file-side-effects.test.ts`
- Modify: `src/server/file-import.ts`
- Modify: `src/server/file-import.test.ts`
- Modify: `src/server/download-manager.test.ts`

- [ ] **Step 1: Add side-effect recorder tests**

Create `src/server/file-side-effects.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createFileSideEffectRecorder } from "./file-side-effects";

describe("file side effect recorder", () => {
	it("runs cleanup actions in reverse order", async () => {
		const calls: string[] = [];
		const recorder = createFileSideEffectRecorder();
		recorder.recordCleanup("first", async () => calls.push("first"));
		recorder.recordCleanup("second", async () => calls.push("second"));

		await recorder.rollback();

		expect(calls).toEqual(["second", "first"]);
	});

	it("continues cleanup after a cleanup action fails", async () => {
		const calls: string[] = [];
		const recorder = createFileSideEffectRecorder();
		recorder.recordCleanup("first", async () => calls.push("first"));
		recorder.recordCleanup("second", async () => {
			calls.push("second");
			throw new Error("cleanup failed");
		});

		await expect(recorder.rollback()).rejects.toThrow("cleanup failed");
		expect(calls).toEqual(["second", "first"]);
	});

	it("does not run cleanup after commit", async () => {
		const cleanup = vi.fn();
		const recorder = createFileSideEffectRecorder();
		recorder.recordCleanup("created destination", cleanup);
		recorder.commit();

		await recorder.rollback();

		expect(cleanup).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run side-effect tests and confirm failure**

Run:

```bash
bun run test -- src/server/file-side-effects.test.ts
```

Expected: FAIL because `src/server/file-side-effects.ts` does not exist.

- [ ] **Step 3: Implement side-effect recorder**

Create `src/server/file-side-effects.ts`:

```ts
type CleanupAction = {
	label: string;
	run: () => Promise<void> | void;
};

export type FileSideEffectRecorder = {
	recordCleanup(label: string, run: () => Promise<void> | void): void;
	commit(): void;
	rollback(): Promise<void>;
};

export function createFileSideEffectRecorder(): FileSideEffectRecorder {
	const cleanupActions: CleanupAction[] = [];
	let committed = false;

	return {
		recordCleanup(label, run) {
			if (!committed) {
				cleanupActions.push({ label, run });
			}
		},
		commit() {
			committed = true;
			cleanupActions.length = 0;
		},
		async rollback() {
			if (committed) {
				return;
			}

			const errors: Error[] = [];
			for (const action of cleanupActions.toReversed()) {
				try {
					await action.run();
				} catch (error) {
					errors.push(
						error instanceof Error
							? error
							: new Error(`${action.label} cleanup failed`),
					);
				}
			}

			if (errors.length === 1) {
				throw errors[0];
			}
			if (errors.length > 1) {
				throw new AggregateError(errors, "Multiple file cleanup actions failed");
			}
		},
	};
}
```

- [ ] **Step 4: Add import failure-injection tests**

In `src/server/file-import.test.ts`, add tests around existing import flow mocks:

```ts
it("marks the tracked download failed when database finalization fails after a file copy", async () => {
	// Arrange a completed download with one importable file using existing fixtures.
	// Mock filesystem copy/link to succeed.
	// Mock the final tracked-download imported update or history insert to throw.
	// Act: await expect(importCompletedDownload(id)).rejects.toThrow(...)
	// Assert: markTrackedDownloadFailed was called or persisted row state is failed.
	// Assert: copied destination cleanup was attempted when the recorder is wired.
});

it("does not remove the old file when replacement import finalization fails", async () => {
	// Arrange an upgrade path with an existing book file.
	// Make replacement copy succeed and final DB write fail.
	// Assert old-file cleanup is not committed before replacement finalization.
});
```

Use existing mocks and helper names from `src/server/file-import.test.ts`; keep assertions on persisted state and mocked filesystem calls.

- [ ] **Step 5: Wire recorder into file import apply paths**

In `src/server/file-import.ts`, create a recorder at the start of the concrete import apply operation and record cleanup after successful file creation:

```ts
const sideEffects = createFileSideEffectRecorder();
try {
	// after a destination file is copied or linked:
	sideEffects.recordCleanup(`remove imported file ${destinationPath}`, () => {
		if (fs.existsSync(destinationPath)) {
			fs.unlinkSync(destinationPath);
		}
	});

	// after all database writes and tracked-download finalization succeed:
	sideEffects.commit();
} catch (error) {
	try {
		await sideEffects.rollback();
	} catch (rollbackError) {
		logError("file-import", "Failed to roll back file import side effects", rollbackError);
	}
	throw error;
}
```

Apply this to the smallest shared import helper that handles actual file copy/link side effects so book, audio, and pack imports benefit without duplicating code.

- [ ] **Step 6: Run import reliability tests**

Run:

```bash
bun run test -- src/server/file-side-effects.test.ts src/server/file-import.test.ts src/server/download-manager.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit import atomicity work**

Run:

```bash
git add src/server/file-side-effects.ts src/server/file-side-effects.test.ts src/server/file-import.ts src/server/file-import.test.ts src/server/download-manager.test.ts
git commit -m "fix(imports): record file side effects"
```

## Task 5: Unmapped File Mapping Rollback

**Files:**
- Modify: `src/server/unmapped-file-mapping-executor.ts`
- Modify: `src/server/unmapped-file-mapping-executor.test.ts`
- Modify: `src/server/unmapped-files.ts`
- Modify: `src/server/unmapped-files.test.ts`

- [ ] **Step 1: Add executor rollback tests**

In `src/server/unmapped-file-mapping-executor.test.ts`, add tests for operation ordering and cleanup:

```ts
it("rolls back moved files when the transaction fails", async () => {
	const moves: Array<[string, string]> = [];
	const rollbacks: Array<[string, string]> = [];

	await expect(
		executeUnmappedFileMapping({
			move: async (from, to) => moves.push([from, to]),
			rollbackMove: async (from, to) => rollbacks.push([from, to]),
			operations: [
				{ from: "/downloads/book.epub", to: "/library/book.epub" },
				{ from: "/downloads/book.jpg", to: "/library/book.jpg" },
			],
			runTransaction: () => {
				throw new Error("insert failed");
			},
		}),
	).rejects.toThrow("insert failed");

	expect(moves).toEqual([
		["/downloads/book.epub", "/library/book.epub"],
		["/downloads/book.jpg", "/library/book.jpg"],
	]);
	expect(rollbacks).toEqual([
		["/library/book.jpg", "/downloads/book.jpg"],
		["/library/book.epub", "/downloads/book.epub"],
	]);
});
```

Adapt names to the existing executor API if it already exposes equivalent parameters.

- [ ] **Step 2: Run executor tests and confirm failure or current coverage**

Run:

```bash
bun run test -- src/server/unmapped-file-mapping-executor.test.ts
```

Expected: PASS if current executor already supports this behavior, or FAIL where the executor API lacks the typed plan/rollback behavior.

- [ ] **Step 3: Extend executor only as much as tests require**

If the executor lacks a plan shape, add or adapt this type:

```ts
export type UnmappedFileMoveOperation = {
	from: string;
	to: string;
};

export type ExecuteUnmappedFileMappingInput = {
	operations: UnmappedFileMoveOperation[];
	move: (from: string, to: string) => Promise<void> | void;
	rollbackMove: (from: string, to: string) => Promise<void> | void;
	runTransaction: () => Promise<void> | void;
};
```

The executor must move in input order, run the transaction after moves, and roll back moved paths in reverse order when either a later move or the transaction fails.

- [ ] **Step 4: Add media-specific unmapped rollback tests**

In `src/server/unmapped-files.test.ts`, add one failure-injection test per media type:

```ts
it("rolls back episode file and sidecar moves when episode mapping transaction fails", async () => {
	// Use existing unmapped episode mapping fixtures.
	// Mock move operations to succeed.
	// Mock db.transaction to throw after moves.
	// Assert rollback moves are attempted for sidecar and main file in reverse order.
	// Assert the unmapped rows remain visible.
});

it("rolls back book file moves when book mapping transaction fails", async () => {
	// Use existing unmapped book mapping fixtures.
	// Mock move operations to succeed and transaction to throw.
	// Assert rollback moves are attempted and book file rows are not inserted.
});

it("rolls back movie file moves when movie mapping transaction fails", async () => {
	// Use existing unmapped movie mapping fixtures.
	// Mock move operations to succeed and transaction to throw.
	// Assert rollback moves are attempted and movie file rows are not inserted.
});
```

Use existing helper factories from the file so the tests remain focused on rollback behavior instead of building new broad fixtures.

- [ ] **Step 5: Route mapping branches through explicit executor plans**

In `src/server/unmapped-files.ts`, keep current path calculation and validation, but build move operations before `runTransaction` for each branch:

```ts
const operations = [
	{ from: file.path, to: managedFilePath },
	...sidecarMoves.map((move) => ({ from: move.from, to: move.to })),
];

await executeUnmappedFileMapping({
	operations,
	move: movePathToManagedDestination,
	rollbackMove: moveManagedPathBack,
	runTransaction: () => {
		db.transaction((tx) => {
			// existing inserts, history writes, and unmapped row deletes
		});
	},
});
```

Use the existing move and rollback helpers where they already exist. Do not change destination path rules or mapping request/response shapes.

- [ ] **Step 6: Run unmapped rollback tests**

Run:

```bash
bun run test -- src/server/unmapped-file-mapping-executor.test.ts src/server/unmapped-files.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit unmapped rollback work**

Run:

```bash
git add src/server/unmapped-file-mapping-executor.ts src/server/unmapped-file-mapping-executor.test.ts src/server/unmapped-files.ts src/server/unmapped-files.test.ts
git commit -m "fix(imports): verify unmapped rollback paths"
```

## Task 6: Final Verification

**Files:**
- Read all changed files from Tasks 1-5.
- Modify docs only if implementation changed the intended follow-up guidance.

- [ ] **Step 1: Run targeted tranche tests**

Run:

```bash
bun run test -- src/server/job-runs.test.ts src/server/scheduler/index.test.ts src/server/scheduler/timers.test.ts src/server/commands.test.ts src/server/tracked-download-state.test.ts src/server/download-manager.test.ts src/server/file-import.test.ts src/server/file-side-effects.test.ts src/server/external-request-policy.test.ts src/server/__tests__/api-cache.test.ts src/server/indexers/http.test.ts src/server/hardcover/client.test.ts src/server/tmdb/client.test.ts src/server/download-clients/http.test.ts src/server/unmapped-file-mapping-executor.test.ts src/server/unmapped-files.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck and lint**

Run:

```bash
bun run typecheck
bun run lint
```

Expected: both PASS.

- [ ] **Step 3: Run full unit/browser suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 4: Commit verification docs if needed**

If no docs changed during implementation, skip this commit. If docs changed, run:

```bash
git add docs
git commit -m "docs(reliability): update tranche notes"
```

- [ ] **Step 5: Report final result**

Report the commits created and verification commands with pass/fail status:

```markdown
Implemented first reliability tranche:
- Job-run invariants
- Tracked-download transition boundary
- External HTTP request policy
- Import side-effect recorder
- Unmapped rollback verification

Verification:
- targeted tranche test command from Task 6 Step 1: PASS
- bun run typecheck: PASS
- bun run lint: PASS
- bun run test: PASS
```
