# Operational Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable background job tracking and transactional download/import state boundaries so jobs cannot silently stick or duplicate and completed downloads finalize consistently.

**Architecture:** Add a persisted `job_runs` ledger and route scheduled tasks plus ad-hoc commands through a shared `job-runs` service. Add a focused `tracked-download-state` service so completed download handling uses explicit state transitions and only removes client downloads after the imported state is committed.

**Tech Stack:** Bun, TypeScript, TanStack Start server functions, Drizzle ORM with Bun SQLite, Vitest, Playwright e2e, Biome.

---

## File Structure

- Create `src/db/schema/job-runs.ts`: Drizzle table definition for durable run state.
- Modify `src/db/schema/index.ts`: export the new schema.
- Generate `drizzle/0007_*.sql` and `drizzle/meta/0007_snapshot.json`: generated migration artifacts for `job_runs`.
- Create `src/server/job-runs.ts`: acquisition, progress, heartbeat, terminal-state, stale recovery, and active-run listing service.
- Create `src/server/job-runs.test.ts`: service-level unit tests using mocked Drizzle chains.
- Modify `src/server/scheduler/index.ts`: replace in-memory run guard with persisted run acquisition and startup stale recovery.
- Modify `src/server/scheduler/index.test.ts`: update scheduler expectations for `job-runs`.
- Modify `src/server/scheduler/state.ts`: remove production dependency on in-memory running state or leave only test-isolation helpers if still referenced by tests.
- Modify `src/server/commands.ts`: route ad-hoc commands through `job-runs` while preserving current public API shape.
- Modify `src/server/commands.test.ts`: update duplicate, progress, completion, failure, and active command tests.
- Create `src/server/tracked-download-state.ts`: transactional state-transition helpers for `tracked_downloads`.
- Create `src/server/tracked-download-state.test.ts`: transition validation and transaction behavior tests.
- Modify `src/server/download-manager.ts`: use tracked download state helpers for reconciliation and import phases.
- Modify `src/server/download-manager.test.ts`: cover `importPending` retry, imported-before-remove ordering, and failed finalization.
- Modify `src/server/file-import.ts`: use tracked download state helpers for import finalization commit points.
- Modify `src/server/file-import.test.ts`: verify success/failure updates happen through helpers.
- Modify `src/server/event-bus.ts`: add job-run event payloads if scheduler/command UI needs persisted active run refreshes.
- Modify `src/routes/_authed/system/tasks.tsx` and `src/routes/_authed/system/tasks.browser.test.tsx` only if the current UI cannot display active/stale persisted runs with existing task data.
- Modify `e2e/tests/09-system-health.spec.ts` or `e2e/tests/12-monitor-discovery.spec.ts`: add a narrow refresh/SSE reconnect assertion for task visibility.

## Task 1: Add The `job_runs` Schema

**Files:**
- Create: `src/db/schema/job-runs.ts`
- Modify: `src/db/schema/index.ts`
- Generate: `drizzle/0007_*.sql`
- Generate: `drizzle/meta/0007_snapshot.json`
- Test: `src/server/job-runs.test.ts`

- [ ] **Step 1: Create a failing schema export test**

Create `src/server/job-runs.test.ts` with the first test:

```ts
import { describe, expect, it } from "vitest";
import { jobRuns } from "src/db/schema";

describe("jobRuns schema", () => {
	it("exports the durable job run table", () => {
		expect(jobRuns).toBeDefined();
		expect(jobRuns.id).toBeDefined();
		expect(jobRuns.status).toBeDefined();
		expect(jobRuns.lastHeartbeatAt).toBeDefined();
	});
});
```

- [ ] **Step 2: Run the failing test**

Run: `bun run test -- src/server/job-runs.test.ts`

Expected: FAIL because `jobRuns` is not exported from `src/db/schema`.

- [ ] **Step 3: Add the schema file**

Create `src/db/schema/job-runs.ts`:

```ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobRuns = sqliteTable("job_runs", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	sourceType: text("source_type").notNull(),
	jobType: text("job_type").notNull(),
	displayName: text("display_name").notNull(),
	dedupeKey: text("dedupe_key"),
	dedupeValue: text("dedupe_value"),
	status: text("status").notNull().default("queued"),
	progress: text("progress"),
	attempt: integer("attempt").notNull().default(1),
	result: text("result", { mode: "json" }).$type<Record<string, unknown> | null>(),
	error: text("error"),
	metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown> | null>(),
	startedAt: integer("started_at", { mode: "timestamp" }),
	lastHeartbeatAt: integer("last_heartbeat_at", { mode: "timestamp" }),
	finishedAt: integer("finished_at", { mode: "timestamp" }),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
```

Modify `src/db/schema/index.ts`:

```ts
export * from "./job-runs";
```

Place that export with the other schema exports.

- [ ] **Step 4: Verify the schema test passes**

Run: `bun run test -- src/server/job-runs.test.ts`

Expected: PASS.

- [ ] **Step 5: Generate the migration**

Run: `bun run db:generate`

Expected: a new migration such as `drizzle/0007_<name>.sql` plus updated Drizzle metadata.

- [ ] **Step 6: Inspect the generated migration**

Run: `git diff -- drizzle src/db/schema/job-runs.ts src/db/schema/index.ts`

Expected: the SQL creates `job_runs` with the columns above. Do not hand-edit generated Drizzle snapshots.

- [ ] **Step 7: Run lint and typecheck**

Run:

```bash
bun run lint
bun run typecheck
```

Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema/job-runs.ts src/db/schema/index.ts drizzle
git commit -m "feat(reliability): add job run schema"
```

## Task 2: Build The `job-runs` Service

**Files:**
- Create: `src/server/job-runs.ts`
- Modify: `src/server/job-runs.test.ts`

- [ ] **Step 1: Replace the schema-only test with service tests**

Extend `src/server/job-runs.test.ts` to mock `src/db` and verify acquisition rejects duplicates:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	allRuns: vi.fn(),
	insertGet: vi.fn(),
	updateRun: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
	eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
	inArray: vi.fn((left: unknown, values: unknown[]) => ({
		type: "inArray",
		left,
		values,
	})),
	lt: vi.fn((left: unknown, right: unknown) => ({ type: "lt", left, right })),
}));

vi.mock("src/db", () => ({
	db: {
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn(() => ({ get: mocks.insertGet })),
			})),
		})),
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({ all: mocks.allRuns })),
				all: mocks.allRuns,
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({ run: mocks.updateRun })),
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	jobRuns: {
		id: "jobRuns.id",
		sourceType: "jobRuns.sourceType",
		jobType: "jobRuns.jobType",
		dedupeKey: "jobRuns.dedupeKey",
		dedupeValue: "jobRuns.dedupeValue",
		status: "jobRuns.status",
		lastHeartbeatAt: "jobRuns.lastHeartbeatAt",
	},
}));

import {
	acquireJobRun,
	completeJobRun,
	failJobRun,
	heartbeatJobRun,
	listActiveJobRuns,
	markStaleJobRuns,
	updateJobRunProgress,
} from "./job-runs";

describe("job-runs service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.allRuns.mockReturnValue([]);
		mocks.insertGet.mockReturnValue({ id: 10, status: "running" });
	});

	it("rejects duplicate non-terminal runs for the same dedupe identity", () => {
		mocks.allRuns.mockReturnValue([{ id: 3, status: "running" }]);

		expect(() =>
			acquireJobRun({
				sourceType: "command",
				jobType: "refreshBook",
				displayName: "Refresh book",
				dedupeKey: "mediaId",
				dedupeValue: "7",
			}),
		).toThrow("This task is already running.");
	});

	it("creates a running job when no duplicate exists", () => {
		expect(
			acquireJobRun({
				sourceType: "scheduled",
				jobType: "refresh-downloads",
				displayName: "Refresh Downloads",
			}),
		).toEqual({ id: 10, status: "running" });
	});

	it("persists heartbeat, progress, success, failure, and stale updates", () => {
		heartbeatJobRun(10);
		updateJobRunProgress(10, "Half done");
		completeJobRun(10, { ok: true });
		failJobRun(10, "boom");
		markStaleJobRuns(new Date("2026-04-26T10:00:00.000Z"));

		expect(mocks.updateRun).toHaveBeenCalledTimes(5);
	});

	it("lists active job runs", () => {
		mocks.allRuns.mockReturnValue([{ id: 1, status: "running" }]);

		expect(listActiveJobRuns()).toEqual([{ id: 1, status: "running" }]);
	});
});
```

- [ ] **Step 2: Run the failing service tests**

Run: `bun run test -- src/server/job-runs.test.ts`

Expected: FAIL because `src/server/job-runs.ts` does not exist.

- [ ] **Step 3: Implement `src/server/job-runs.ts`**

```ts
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "src/db";
import { jobRuns } from "src/db/schema";

export const NON_TERMINAL_JOB_STATUSES = ["queued", "running"] as const;
export const JOB_HEARTBEAT_INTERVAL_MS = 10_000;
export const JOB_STALE_AFTER_MS = 5 * 60_000;

export type JobRunSourceType = "scheduled" | "command";
export type JobRunStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "cancelled"
	| "stale";

export type AcquireJobRunInput = {
	sourceType: JobRunSourceType;
	jobType: string;
	displayName: string;
	dedupeKey?: string;
	dedupeValue?: string;
	metadata?: Record<string, unknown>;
};

export function acquireJobRun(input: AcquireJobRunInput): typeof jobRuns.$inferSelect {
	const dedupeKey = input.dedupeKey ?? input.jobType;
	const dedupeValue = input.dedupeValue ?? input.jobType;
	const duplicate = db
		.select()
		.from(jobRuns)
		.where(
			and(
				eq(jobRuns.sourceType, input.sourceType),
				eq(jobRuns.jobType, input.jobType),
				eq(jobRuns.dedupeKey, dedupeKey),
				eq(jobRuns.dedupeValue, dedupeValue),
				inArray(jobRuns.status, [...NON_TERMINAL_JOB_STATUSES]),
			),
		)
		.all();

	if (duplicate.length > 0) {
		throw new Error("This task is already running.");
	}

	const now = new Date();
	return db
		.insert(jobRuns)
		.values({
			sourceType: input.sourceType,
			jobType: input.jobType,
			displayName: input.displayName,
			dedupeKey,
			dedupeValue,
			status: "running",
			metadata: input.metadata ?? null,
			startedAt: now,
			lastHeartbeatAt: now,
			updatedAt: now,
		})
		.returning()
		.get();
}

export function heartbeatJobRun(jobRunId: number): void {
	const now = new Date();
	db.update(jobRuns)
		.set({ lastHeartbeatAt: now, updatedAt: now })
		.where(eq(jobRuns.id, jobRunId))
		.run();
}

export function updateJobRunProgress(jobRunId: number, progress: string): void {
	const now = new Date();
	db.update(jobRuns)
		.set({ progress, lastHeartbeatAt: now, updatedAt: now })
		.where(eq(jobRuns.id, jobRunId))
		.run();
}

export function completeJobRun(
	jobRunId: number,
	result: Record<string, unknown>,
): void {
	const now = new Date();
	db.update(jobRuns)
		.set({
			status: "succeeded",
			result,
			error: null,
			finishedAt: now,
			lastHeartbeatAt: now,
			updatedAt: now,
		})
		.where(eq(jobRuns.id, jobRunId))
		.run();
}

export function failJobRun(jobRunId: number, error: string): void {
	const now = new Date();
	db.update(jobRuns)
		.set({
			status: "failed",
			error,
			finishedAt: now,
			lastHeartbeatAt: now,
			updatedAt: now,
		})
		.where(eq(jobRuns.id, jobRunId))
		.run();
}

export function markStaleJobRuns(now = new Date()): void {
	const staleBefore = new Date(now.getTime() - JOB_STALE_AFTER_MS);
	db.update(jobRuns)
		.set({
			status: "stale",
			error: "Job heartbeat expired before completion.",
			finishedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(jobRuns.status, "running"),
				lt(jobRuns.lastHeartbeatAt, staleBefore),
			),
		)
		.run();
}

export function listActiveJobRuns(): Array<typeof jobRuns.$inferSelect> {
	return db
		.select()
		.from(jobRuns)
		.where(inArray(jobRuns.status, [...NON_TERMINAL_JOB_STATUSES]))
		.all();
}
```

- [ ] **Step 4: Run the service tests**

Run: `bun run test -- src/server/job-runs.test.ts`

Expected: PASS.

- [ ] **Step 5: Run lint and typecheck**

Run:

```bash
bun run lint
bun run typecheck
```

Expected: both pass. Fix type errors by tightening mocks or exported types, not with suppression comments.

- [ ] **Step 6: Commit**

```bash
git add src/server/job-runs.ts src/server/job-runs.test.ts
git commit -m "feat(reliability): add job run service"
```

## Task 3: Route Scheduler Execution Through Job Runs

**Files:**
- Modify: `src/server/scheduler/index.ts`
- Modify: `src/server/scheduler/index.test.ts`
- Modify: `src/server/scheduler/state.ts`

- [ ] **Step 1: Update scheduler tests to mock job-runs**

In `src/server/scheduler/index.test.ts`, replace the `./state` mock expectations with a `./job-runs` mock:

```ts
const mocks = vi.hoisted(() => ({
	emit: vi.fn(),
	logInfo: vi.fn(),
	logError: vi.fn(),
	getAllTasks: vi.fn(),
	getTask: vi.fn(),
	acquireJobRun: vi.fn(),
	completeJobRun: vi.fn(),
	failJobRun: vi.fn(),
	markStaleJobRuns: vi.fn(),
	updateJobRunProgress: vi.fn(),
	getTimers: vi.fn(),
	setTaskExecutor: vi.fn(),
	selectAll: vi.fn(),
	insertRun: vi.fn(),
	updateRun: vi.fn(),
}));
```

Add:

```ts
vi.mock("../job-runs", () => ({
	acquireJobRun: mocks.acquireJobRun,
	completeJobRun: mocks.completeJobRun,
	failJobRun: mocks.failJobRun,
	markStaleJobRuns: mocks.markStaleJobRuns,
	updateJobRunProgress: mocks.updateJobRunProgress,
}));
```

Set the default in `beforeEach`:

```ts
mocks.acquireJobRun.mockReturnValue({ id: 55 });
```

Update existing assertions:

```ts
expect(mocks.acquireJobRun).toHaveBeenCalledWith({
	sourceType: "scheduled",
	jobType: "my-task",
	displayName: "My Task",
});
expect(mocks.completeJobRun).toHaveBeenCalledWith(55, {
	success: true,
	message: "ok",
});
```

Add a startup recovery assertion:

```ts
it("recovers stale job runs before starting timers", async () => {
	const mod = await freshModule();

	mod.ensureSchedulerStarted();

	expect(mocks.markStaleJobRuns).toHaveBeenCalledBefore(mocks.setTaskExecutor);
});
```

Add an overlap assertion:

```ts
it("skips execution when persisted acquisition rejects an active run", async () => {
	const mod = await freshModule();
	const handler = vi.fn();
	mocks.getTask.mockReturnValue({
		id: "busy-task",
		name: "Busy Task",
		handler,
	});
	mocks.acquireJobRun.mockImplementation(() => {
		throw new Error("This task is already running.");
	});

	await mod.runTaskNow("busy-task");

	expect(handler).not.toHaveBeenCalled();
	expect(mocks.completeJobRun).not.toHaveBeenCalled();
	expect(mocks.failJobRun).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the failing scheduler tests**

Run: `bun run test -- src/server/scheduler/index.test.ts`

Expected: FAIL because scheduler still imports `./state`.

- [ ] **Step 3: Update `src/server/scheduler/index.ts`**

Replace the `./state` import:

```ts
import {
	acquireJobRun,
	completeJobRun,
	failJobRun,
	markStaleJobRuns,
	updateJobRunProgress,
} from "../job-runs";
```

Update `executeTask`:

```ts
async function executeTask(taskId: string): Promise<void> {
	const task = getTask(taskId);
	if (!task) {
		return;
	}

	let run: { id: number };
	try {
		run = acquireJobRun({
			sourceType: "scheduled",
			jobType: task.id,
			displayName: task.name,
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "This task is already running."
		) {
			return;
		}
		throw error;
	}

	const start = Date.now();

	try {
		const updateProgress = (message: string): void => {
			updateJobRunProgress(run.id, message);
			db.update(scheduledTasks)
				.set({ progress: message })
				.where(eq(scheduledTasks.id, taskId))
				.run();
			eventBus.emit({ type: "taskUpdated", taskId });
		};

		const result = await task.handler(updateProgress);
		const duration = Date.now() - start;

		db.update(scheduledTasks)
			.set({
				progress: null,
				lastExecution: new Date(),
				lastDuration: duration,
				lastResult: result.success ? "success" : "error",
				lastMessage: result.message,
			})
			.where(eq(scheduledTasks.id, taskId))
			.run();

		completeJobRun(run.id, result as unknown as Record<string, unknown>);
		logInfo("scheduler", `${task.name}: ${result.message} (${duration}ms)`);
		eventBus.emit({ type: "taskUpdated", taskId });
	} catch (error) {
		const duration = Date.now() - start;
		const message = error instanceof Error ? error.message : "Unknown error";

		db.update(scheduledTasks)
			.set({
				progress: null,
				lastExecution: new Date(),
				lastDuration: duration,
				lastResult: "error",
				lastMessage: message,
			})
			.where(eq(scheduledTasks.id, taskId))
			.run();

		failJobRun(run.id, message);
		logError("scheduler", `${task.name} failed: ${message}`, error);
		eventBus.emit({ type: "taskUpdated", taskId });
	}
}
```

Update `ensureSchedulerStarted` so stale recovery happens before timers:

```ts
markStaleJobRuns();
setTaskExecutor((taskId) => void executeTask(taskId));
seedTasksIfNeeded();
startTimers();
```

- [ ] **Step 4: Remove production scheduler state usage**

If `src/server/scheduler/state.ts` is no longer imported outside tests, either delete it or reduce it to test-only helpers used by e2e isolation. Run:

```bash
rg -n "scheduler/state|isTaskRunning|markTaskRunning|markTaskComplete|clearRunningTasks" src e2e
```

Expected: no production command/scheduler duplicate prevention depends on `isTaskRunning`.

- [ ] **Step 5: Run scheduler tests**

Run: `bun run test -- src/server/scheduler/index.test.ts`

Expected: PASS.

- [ ] **Step 6: Run broader affected tests**

Run:

```bash
bun run test -- src/server/scheduler/index.test.ts src/server/tasks.test.ts src/routes/_authed/system/tasks.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/scheduler/index.ts src/server/scheduler/index.test.ts src/server/scheduler/state.ts
git commit -m "feat(reliability): persist scheduler run lifecycle"
```

## Task 4: Route Ad-Hoc Commands Through Job Runs

**Files:**
- Modify: `src/server/commands.ts`
- Modify: `src/server/commands.test.ts`

- [ ] **Step 1: Update command tests for persisted acquisition**

In `src/server/commands.test.ts`, remove duplicate scanning and active table mocks from the expected path. Add a `./job-runs` mock:

```ts
vi.mock("./job-runs", () => ({
	acquireJobRun: commandsMocks.acquireJobRun,
	completeJobRun: commandsMocks.completeJobRun,
	failJobRun: commandsMocks.failJobRun,
	listActiveJobRuns: commandsMocks.listActiveJobRuns,
	updateJobRunProgress: commandsMocks.updateJobRunProgress,
}));
```

Add defaults:

```ts
commandsMocks.acquireJobRun.mockReturnValue({ id: 42 });
commandsMocks.listActiveJobRuns.mockReturnValue([]);
```

Change the duplicate test to:

```ts
commandsMocks.acquireJobRun.mockImplementation(() => {
	throw new Error("This task is already running.");
});
```

Update completion assertions:

```ts
expect(commandsMocks.updateJobRunProgress).toHaveBeenCalledWith(
	42,
	"Refreshing — for 99",
);
expect(commandsMocks.completeJobRun).toHaveBeenCalledWith(42, { ok: true });
```

Update failure assertions:

```ts
expect(commandsMocks.failJobRun).toHaveBeenCalledWith(42, "boom");
```

Update active command test:

```ts
commandsMocks.listActiveJobRuns.mockReturnValue([
	{
		id: 5,
		jobType: "refreshBook",
		displayName: "Refresh book",
		progress: "working",
		metadata: { body: { mediaId: 5 } },
	},
]);
```

Expected output from `getActiveCommandsFn()`:

```ts
[
	{
		body: { mediaId: 5 },
		commandType: "refreshBook",
		id: 5,
		name: "Refresh book",
		progress: "working",
	},
]
```

- [ ] **Step 2: Run the failing command tests**

Run: `bun run test -- src/server/commands.test.ts`

Expected: FAIL because commands still use `active_adhoc_commands`.

- [ ] **Step 3: Update `src/server/commands.ts`**

Replace active command DB usage with job-run helpers:

```ts
import {
	acquireJobRun,
	completeJobRun,
	failJobRun,
	listActiveJobRuns,
	updateJobRunProgress,
} from "./job-runs";
```

Update `submitCommand`:

```ts
export function submitCommand(opts: SubmitCommandOptions): {
	commandId: number;
} {
	const { commandType, name, body, dedupeKey, batchTaskId, handler } = opts;

	if (batchTaskId) {
		checkBatchOverlap(batchTaskId);
	}

	const dedupeValue = body[dedupeKey];
	const row = acquireJobRun({
		sourceType: "command",
		jobType: commandType,
		displayName: name,
		dedupeKey,
		dedupeValue: dedupeValue === undefined ? undefined : String(dedupeValue),
		metadata: { body },
	});

	void doWork(row.id, commandType, handler, body).catch((error) =>
		logError("command", `Uncaught error in ${commandType} #${row.id}`, error),
	);

	return { commandId: row.id };
}
```

Update `doWork`:

```ts
const updateProgress = (message: string): void => {
	const progress = title ? `${title} — ${message}` : message;
	updateJobRunProgress(commandId, progress);
	eventBus.emit({ type: "commandProgress", commandId, progress });
};
```

In success:

```ts
completeJobRun(commandId, result);
```

In failure:

```ts
failJobRun(commandId, message);
```

Remove the final delete from `active_adhoc_commands`.

Update `getActiveCommandsFn`:

```ts
const rows = listActiveJobRuns().filter((row) => row.sourceType === "command");
return rows.map((row) => ({
	id: row.id,
	commandType: row.jobType,
	name: row.displayName,
	progress: row.progress,
	body: (row.metadata as { body?: Record<string, never> } | null)?.body ?? {},
}));
```

- [ ] **Step 4: Remove obsolete command duplicate helpers**

Delete `checkDuplicate` and unused imports from `src/server/commands.ts`.

- [ ] **Step 5: Run command tests**

Run: `bun run test -- src/server/commands.test.ts`

Expected: PASS.

- [ ] **Step 6: Run affected browser/SSE tests**

Run:

```bash
bun run test -- src/hooks/use-server-events.browser.test.tsx src/hooks/sse-context.browser.test.tsx src/server/commands.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/commands.ts src/server/commands.test.ts
git commit -m "feat(reliability): persist command run lifecycle"
```

## Task 5: Add Tracked Download State Transitions

**Files:**
- Create: `src/server/tracked-download-state.ts`
- Create: `src/server/tracked-download-state.test.ts`

- [ ] **Step 1: Write failing transition tests**

Create `src/server/tracked-download-state.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getRow: vi.fn(),
	updateRun: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({ get: mocks.getRow })),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({ run: mocks.updateRun })),
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	trackedDownloads: {
		id: "trackedDownloads.id",
		state: "trackedDownloads.state",
	},
}));

import {
	markTrackedDownloadCompleted,
	markTrackedDownloadFailed,
	markTrackedDownloadImported,
	markTrackedDownloadImportPending,
	markTrackedDownloadRemoved,
	markTrackedDownloadDownloading,
} from "./tracked-download-state";

describe("tracked download state transitions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getRow.mockReturnValue({ id: 1, state: "queued" });
	});

	it("allows queued downloads to become downloading or completed", () => {
		markTrackedDownloadDownloading(1);
		markTrackedDownloadCompleted(1, "/downloads/book");

		expect(mocks.updateRun).toHaveBeenCalledTimes(2);
	});

	it("allows completed downloads to be claimed as import pending", () => {
		mocks.getRow.mockReturnValue({ id: 1, state: "completed" });

		markTrackedDownloadImportPending(1);

		expect(mocks.updateRun).toHaveBeenCalledOnce();
	});

	it("rejects impossible imported transitions", () => {
		mocks.getRow.mockReturnValue({ id: 1, state: "queued" });

		expect(() => markTrackedDownloadImported(1)).toThrow(
			"Cannot transition tracked download 1 from queued to imported.",
		);
	});

	it("allows import pending to finalize as imported or failed", () => {
		mocks.getRow.mockReturnValue({ id: 1, state: "importPending" });

		markTrackedDownloadImported(1);
		markTrackedDownloadFailed(1, "Import failed");

		expect(mocks.updateRun).toHaveBeenCalledTimes(2);
	});

	it("allows queued or downloading rows to be removed", () => {
		markTrackedDownloadRemoved(1, "Disappeared from download client");

		expect(mocks.updateRun).toHaveBeenCalledOnce();
	});
});
```

- [ ] **Step 2: Run the failing tests**

Run: `bun run test -- src/server/tracked-download-state.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `src/server/tracked-download-state.ts`**

```ts
import { eq } from "drizzle-orm";
import { db } from "src/db";
import { trackedDownloads } from "src/db/schema";

type TrackedDownloadState =
	| "queued"
	| "downloading"
	| "completed"
	| "importPending"
	| "imported"
	| "removed"
	| "failed";

type DbLike = typeof db;

const allowedTransitions: Record<TrackedDownloadState, TrackedDownloadState[]> = {
	queued: ["downloading", "completed", "removed", "failed"],
	downloading: ["completed", "removed", "failed"],
	completed: ["importPending", "failed"],
	importPending: ["imported", "failed"],
	imported: [],
	removed: [],
	failed: [],
};

function getTrackedDownloadState(
	trackedDownloadId: number,
	tx: DbLike = db,
): TrackedDownloadState {
	const row = tx
		.select({ state: trackedDownloads.state })
		.from(trackedDownloads)
		.where(eq(trackedDownloads.id, trackedDownloadId))
		.get();

	if (!row) {
		throw new Error(`Tracked download ${trackedDownloadId} not found.`);
	}

	return row.state as TrackedDownloadState;
}

function transitionTrackedDownload(
	trackedDownloadId: number,
	nextState: TrackedDownloadState,
	values: Record<string, unknown> = {},
	tx: DbLike = db,
): void {
	const currentState = getTrackedDownloadState(trackedDownloadId, tx);
	if (!allowedTransitions[currentState]?.includes(nextState)) {
		throw new Error(
			`Cannot transition tracked download ${trackedDownloadId} from ${currentState} to ${nextState}.`,
		);
	}

	tx.update(trackedDownloads)
		.set({
			...values,
			state: nextState,
			updatedAt: new Date(),
		})
		.where(eq(trackedDownloads.id, trackedDownloadId))
		.run();
}

export function markTrackedDownloadDownloading(
	trackedDownloadId: number,
	tx?: DbLike,
): void {
	transitionTrackedDownload(trackedDownloadId, "downloading", {}, tx);
}

export function markTrackedDownloadCompleted(
	trackedDownloadId: number,
	outputPath: string | null,
	tx?: DbLike,
): void {
	transitionTrackedDownload(
		trackedDownloadId,
		"completed",
		{ outputPath },
		tx,
	);
}

export function markTrackedDownloadImportPending(
	trackedDownloadId: number,
	tx?: DbLike,
): void {
	transitionTrackedDownload(trackedDownloadId, "importPending", {}, tx);
}

export function markTrackedDownloadImported(
	trackedDownloadId: number,
	tx?: DbLike,
): void {
	transitionTrackedDownload(
		trackedDownloadId,
		"imported",
		{ message: null },
		tx,
	);
}

export function markTrackedDownloadFailed(
	trackedDownloadId: number,
	message: string,
	tx?: DbLike,
): void {
	transitionTrackedDownload(
		trackedDownloadId,
		"failed",
		{ message },
		tx,
	);
}

export function markTrackedDownloadRemoved(
	trackedDownloadId: number,
	message: string,
	tx?: DbLike,
): void {
	transitionTrackedDownload(
		trackedDownloadId,
		"removed",
		{ message },
		tx,
	);
}
```

- [ ] **Step 4: Run transition tests**

Run: `bun run test -- src/server/tracked-download-state.test.ts`

Expected: PASS.

- [ ] **Step 5: Run lint and typecheck**

Run:

```bash
bun run lint
bun run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/tracked-download-state.ts src/server/tracked-download-state.test.ts
git commit -m "feat(downloads): add tracked download transitions"
```

## Task 6: Use Transitions In Download Refresh

**Files:**
- Modify: `src/server/download-manager.ts`
- Modify: `src/server/download-manager.test.ts`

- [ ] **Step 1: Add failing tests for import-pending retry and remove ordering**

In `src/server/download-manager.test.ts`, extend `setupRefreshDownloadsTest` with mocks for `./tracked-download-state`:

```ts
const markTrackedDownloadCompleted = vi.fn();
const markTrackedDownloadDownloading = vi.fn();
const markTrackedDownloadFailed = vi.fn();
const markTrackedDownloadImported = vi.fn();
const markTrackedDownloadImportPending = vi.fn();
const markTrackedDownloadRemoved = vi.fn();

vi.doMock("./tracked-download-state", () => ({
	markTrackedDownloadCompleted,
	markTrackedDownloadDownloading,
	markTrackedDownloadFailed,
	markTrackedDownloadImported,
	markTrackedDownloadImportPending,
	markTrackedDownloadRemoved,
}));
```

Return these mocks from the setup helper.

Add:

```ts
it("claims completed downloads as import pending before importing", async () => {
	const setup = setupRefreshDownloadsTest({
		trackedRows: [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Book",
				protocol: "torrent",
				state: "completed",
				outputPath: "/downloads/book",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(Date.now() - 360_000),
			},
		],
		clientRows: [{ id: 7, implementation: "qbittorrent", name: "qbit" }],
	});

	const { refreshDownloads } = await import("./download-manager");
	await refreshDownloads();

	expect(setup.markTrackedDownloadImportPending).toHaveBeenCalledWith(1);
	expect(setup.importCompletedDownload).toHaveBeenCalledWith(1);
});
```

Add:

```ts
it("removes completed client items only after the tracked row is imported", async () => {
	const provider = {
		getDownloads: vi.fn().mockResolvedValue([
			{
				id: "download-1",
				name: "Book",
				size: 100,
				downloaded: 100,
				downloadSpeed: 0,
				isCompleted: true,
				outputPath: "/downloads/book",
			},
		]),
		removeDownload: vi.fn(),
	};
	const setup = setupRefreshDownloadsTest({
		trackedRows: [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Book",
				protocol: "torrent",
				state: "downloading",
				outputPath: null,
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		],
		clientRows: [
			{
				id: 7,
				implementation: "qbittorrent",
				name: "qbit",
				removeCompletedDownloads: true,
			},
		],
		provider,
	});

	setup.importCompletedDownload.mockImplementation(async () => {
		setup.trackedRows[0].state = "imported";
	});

	const { refreshDownloads } = await import("./download-manager");
	await refreshDownloads();

	expect(setup.markTrackedDownloadCompleted).toHaveBeenCalledWith(
		1,
		"/downloads/book",
	);
	expect(setup.markTrackedDownloadImportPending).toHaveBeenCalledWith(1);
	expect(provider.removeDownload).toHaveBeenCalledWith(
		expect.any(Object),
		"download-1",
		false,
	);
});
```

- [ ] **Step 2: Run failing download-manager tests**

Run: `bun run test -- src/server/download-manager.test.ts`

Expected: FAIL until `download-manager.ts` uses tracked state helpers.

- [ ] **Step 3: Update `src/server/download-manager.ts` imports**

```ts
import {
	markTrackedDownloadCompleted,
	markTrackedDownloadDownloading,
	markTrackedDownloadFailed,
	markTrackedDownloadImportPending,
	markTrackedDownloadRemoved,
} from "./tracked-download-state";
```

- [ ] **Step 4: Replace direct updates in `reconcileTrackedDownload`**

Use helpers:

```ts
if (item.isCompleted && (td.state === "queued" || td.state === "downloading")) {
	markTrackedDownloadCompleted(td.id, item.outputPath);
	stats.completed += 1;
	eventBus.emit({
		type: "downloadCompleted",
		bookId: td.bookId,
		title: td.releaseTitle,
	});
	return "import";
}
if (!item.isCompleted && td.state === "queued") {
	markTrackedDownloadDownloading(td.id);
	stats.updated += 1;
}
```

For disappeared downloads:

```ts
markTrackedDownloadRemoved(td.id, "Disappeared from download client");
stats.removed += 1;
```

- [ ] **Step 5: Claim import before calling file import**

In the import branch:

```ts
if (action === "import" && enableCompletedHandling) {
	try {
		if (td.state !== "importPending") {
			markTrackedDownloadImportPending(td.id);
		}
		await importCompletedDownload(td.id);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		logError("download-manager", `Import failed for "${td.releaseTitle}": ${message}`, error);
		markTrackedDownloadFailed(td.id, message);
		stats.failed += 1;
		await runFailedDownloadHandler(td.id, provider, config);
		continue;
	}
}
```

- [ ] **Step 6: Preserve imported-before-remove guard**

Keep the existing refreshed state lookup before `removeFromClient`. The provider removal call must remain after:

```ts
if (refreshed?.state === "imported" && client.removeCompletedDownloads) {
	await removeFromClient(provider, config, td.downloadId);
}
```

- [ ] **Step 7: Run download-manager tests**

Run: `bun run test -- src/server/download-manager.test.ts`

Expected: PASS.

- [ ] **Step 8: Run related tests**

Run:

```bash
bun run test -- src/server/download-manager.test.ts src/server/failed-download-handler.test.ts src/server/file-import.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/server/download-manager.ts src/server/download-manager.test.ts
git commit -m "feat(downloads): harden refresh state transitions"
```

## Task 7: Finalize Imports Through Transition Helpers

**Files:**
- Modify: `src/server/file-import.ts`
- Modify: `src/server/file-import.test.ts`

- [ ] **Step 1: Add file-import tests for transition helper calls**

In `src/server/file-import.test.ts`, mock `./tracked-download-state`:

```ts
vi.mock("./tracked-download-state", () => ({
	markTrackedDownloadFailed: mocks.markTrackedDownloadFailed,
	markTrackedDownloadImported: mocks.markTrackedDownloadImported,
}));
```

Add the mocks to `vi.hoisted`:

```ts
markTrackedDownloadFailed: vi.fn(),
markTrackedDownloadImported: vi.fn(),
```

Add a success assertion to an existing successful `importCompletedDownload` test:

```ts
expect(mocks.markTrackedDownloadImported).toHaveBeenCalledWith(
	trackedDownloadId,
	expect.anything(),
);
```

Add a failure test around a filesystem or database error:

```ts
it("marks tracked downloads failed when final import work throws", async () => {
	const trackedDownloadId = 77;
	mocks.dbGet.mockReturnValueOnce({
		id: trackedDownloadId,
		bookId: 1,
		downloadProfileId: 2,
		outputPath: "/downloads/book",
		state: "importPending",
		releaseTitle: "Book",
	});
	mocks.readdirSync.mockImplementation(() => {
		throw new Error("permission denied");
	});

	await expect(importCompletedDownload(trackedDownloadId)).rejects.toThrow(
		"permission denied",
	);
	expect(mocks.markTrackedDownloadFailed).toHaveBeenCalledWith(
		trackedDownloadId,
		"permission denied",
		expect.anything(),
	);
});
```

- [ ] **Step 2: Run failing file-import tests**

Run: `bun run test -- src/server/file-import.test.ts`

Expected: FAIL until finalization uses helpers.

- [ ] **Step 3: Update `src/server/file-import.ts` imports**

```ts
import {
	markTrackedDownloadFailed,
	markTrackedDownloadImported,
} from "./tracked-download-state";
```

- [ ] **Step 4: Replace final imported update**

Where `importCompletedDownload` currently updates `trackedDownloads.state` to `imported`, replace that direct update with:

```ts
markTrackedDownloadImported(trackedDownloadId);
```

If the surrounding code already uses `db.transaction`, pass the transaction handle:

```ts
markTrackedDownloadImported(trackedDownloadId, tx);
```

- [ ] **Step 5: Replace final failed update**

In the catch/failure path, replace direct failed updates with:

```ts
const message = error instanceof Error ? error.message : "Unknown error";
markTrackedDownloadFailed(trackedDownloadId, message);
throw error;
```

If the failure path is inside a transaction, pass `tx`.

- [ ] **Step 6: Run file-import tests**

Run: `bun run test -- src/server/file-import.test.ts`

Expected: PASS.

- [ ] **Step 7: Run related download tests**

Run:

```bash
bun run test -- src/server/file-import.test.ts src/server/download-manager.test.ts src/server/tracked-download-state.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/file-import.ts src/server/file-import.test.ts
git commit -m "feat(imports): finalize tracked downloads atomically"
```

## Task 8: Surface Active And Stale Runs To Task Views

**Files:**
- Modify: `src/server/tasks.ts`
- Modify: `src/server/tasks.test.ts`
- Modify: `src/routes/_authed/system/tasks.tsx`
- Modify: `src/routes/_authed/system/tasks.browser.test.tsx`

- [ ] **Step 1: Add task server tests for active/stale state**

In `src/server/tasks.test.ts`, mock `listActiveJobRuns` and add:

```ts
it("includes active job run progress with scheduled tasks", async () => {
	mocks.listActiveJobRuns.mockReturnValue([
		{
			id: 9,
			sourceType: "scheduled",
			jobType: "refresh-downloads",
			status: "running",
			progress: "Checking clients",
		},
	]);

	const tasks = await getScheduledTasks();

	expect(tasks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: "refresh-downloads",
				isRunning: true,
				progress: "Checking clients",
			}),
		]),
	);
});
```

- [ ] **Step 2: Run failing task tests**

Run: `bun run test -- src/server/tasks.test.ts`

Expected: FAIL until task listing merges active job run state.

- [ ] **Step 3: Update `src/server/tasks.ts`**

Import:

```ts
import { listActiveJobRuns } from "./job-runs";
```

When building scheduled task DTOs, merge active runs:

```ts
const activeRuns = new Map(
	listActiveJobRuns()
		.filter((run) => run.sourceType === "scheduled")
		.map((run) => [run.jobType, run]),
);
```

For each task row:

```ts
const activeRun = activeRuns.get(row.id);
return {
	...existingTask,
	isRunning: Boolean(activeRun),
	progress: activeRun?.progress ?? row.progress,
	runStatus: activeRun?.status ?? null,
};
```

- [ ] **Step 4: Update UI only if needed**

If `src/routes/_authed/system/tasks.tsx` already renders `isRunning` and `progress`, keep the UI unchanged. If it ignores `runStatus`, add a small badge:

```tsx
{task.runStatus === "stale" ? (
	<Badge variant="destructive">Stale</Badge>
) : null}
```

- [ ] **Step 5: Run task browser tests**

Run:

```bash
bun run test -- src/server/tasks.test.ts src/routes/_authed/system/tasks.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/tasks.ts src/server/tasks.test.ts src/routes/_authed/system/tasks.tsx src/routes/_authed/system/tasks.browser.test.tsx
git commit -m "feat(tasks): show persisted run state"
```

## Task 9: Add Narrow E2E Coverage

**Files:**
- Modify: `e2e/tests/09-system-health.spec.ts`
- Modify: `e2e/helpers/tasks.ts` if helper support is needed

- [ ] **Step 1: Check dev server status**

Run:

```bash
lsof -iTCP -sTCP:LISTEN -n -P | rg ":3000|:5173|vite|bun" || true
```

Expected: identify whether a dev server is already running. Do not start a duplicate server on the same port.

- [ ] **Step 2: Add an e2e assertion for task visibility across refresh**

In `e2e/tests/09-system-health.spec.ts`, add:

```ts
test("manual task run remains visible after refresh", async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto("/system/tasks");

	const row = page.getByRole("row", { name: /refresh downloads/i });
	await expect(row).toBeVisible();
	await row.getByRole("button", { name: /run/i }).click();

	await expect(row).toContainText(/running|queued|success|error/i);
	await page.reload();
	await expect(row).toBeVisible();
	await expect(row).toContainText(/running|queued|success|error/i);
});
```

If the file uses a different auth helper or task labels, adapt only the selectors to the existing local patterns.

- [ ] **Step 3: Run the focused e2e test**

Run: `bun run test:e2e -- e2e/tests/09-system-health.spec.ts`

Expected: PASS. If Playwright installs Chromium on first run, let the command complete.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/09-system-health.spec.ts e2e/helpers/tasks.ts
git commit -m "test(reliability): cover task run visibility"
```

## Task 10: Final Verification

**Files:**
- No new implementation files unless previous tasks exposed a required fix.

- [ ] **Step 1: Run lint**

Run: `bun run lint`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 3: Run unit and browser tests**

Run: `bun run test`

Expected: PASS.

- [ ] **Step 4: Run e2e tests**

Run: `bun run test:e2e`

Expected: PASS.

- [ ] **Step 5: Review commit history**

Run: `git log --oneline --decorate -10`

Expected: commits are scoped and use Conventional Commit messages with scopes. No commit contains `Co-authored-by`.

- [ ] **Step 6: Confirm worktree state**

Run: `git status --short`

Expected: clean worktree.

- [ ] **Step 7: Prepare integration choice**

Per repo guidelines, choose one:

- create a PR and keep the local branch
- cherry-pick commits onto local `main` without a merge commit, then clean up the worktree and branch

Do not merge with a merge commit.

## Self-Review

Spec coverage:

- durable `job_runs` ledger: Tasks 1 and 2
- scheduler stale recovery and duplicate prevention: Task 3
- ad-hoc command durable lifecycle: Task 4
- tracked download transactional transitions: Task 5
- completed download phase handling and remove ordering: Tasks 6 and 7
- active/stale visibility: Task 8
- narrow e2e verification: Task 9
- full verification and integration readiness: Task 10

Placeholder scan:

- No unfinished markers are intended in this plan.
- Every task has concrete files, commands, and expected outcomes.

Type consistency:

- Job run service uses `jobRuns`, `acquireJobRun`, `updateJobRunProgress`, `completeJobRun`, `failJobRun`, `markStaleJobRuns`, and `listActiveJobRuns` consistently.
- Tracked download service uses `markTrackedDownloadDownloading`, `markTrackedDownloadCompleted`, `markTrackedDownloadImportPending`, `markTrackedDownloadImported`, `markTrackedDownloadFailed`, and `markTrackedDownloadRemoved` consistently.
