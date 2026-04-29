# Scheduler Job-Run Lifecycle Invariants Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Harden scheduler and command job-run lifecycle invariants so active runs, stale recovery, progress, heartbeat, duplicate suppression, and batch overlap behavior stay consistent.

**Architecture:** Keep production behavior unchanged unless tests expose a real gap. Add a small lifecycle invariant contract, encode it with focused tests around the existing `job-runs`, scheduler, timer, and command boundaries, then apply minimal fixes only where an invariant fails.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, Bun SQLite/better-sqlite3 test databases, TanStack server functions, existing scheduler and command helpers.

---

## Selected Backlog Item

Backlog item: `P0-1: Harden scheduler and job-run lifecycle invariants` from `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`.

Why this one now: it is the highest-ranked backlog item not covered by the current external HTTP timeout/retry/rate-limit work. The existing files already contain most behavior (`src/server/job-runs.ts`, `src/server/scheduler/index.ts`, `src/server/commands.ts`, `src/server/scheduler/timers.ts`), but the invariants are implicit and spread across separate test files. This plan makes those expectations explicit before changing behavior.

## Approaches Considered

1. **Recommended: contract-first test hardening with minimal production changes.** Add explicit invariant tests to current suites and a short contract document in test names/comments. This is low-risk and matches the backlog guidance to keep behavior unchanged unless tests expose a gap.
2. **Refactor lifecycle into a new runtime coordinator first.** This could reduce duplication between scheduler and command paths, but it is more invasive and risks changing behavior before the safety net exists.
3. **Documentation-only checklist.** This is cheapest, but it will not stop regressions in startup recovery, stale runs, or duplicate suppression.

Proceed with option 1.

---

### Task 1: Add a lifecycle invariant checklist to the job-run tests

**Files:**
- Modify: `src/server/job-runs.test.ts`

**Step 1: Write the failing/guarding tests**

Add a new `describe("job-run lifecycle invariants", ...)` block near the existing mocked service tests. Cover these invariants explicitly:

```ts
it("treats only queued and running as active dedupe blockers", () => {
  expect(NON_TERMINAL_JOB_STATUSES).toEqual(["queued", "running"]);
});

it("terminal updates only apply while the run is still running", () => {
  completeJobRun(10, { ok: true });
  failJobRun(11, "boom");

  expect(and).toHaveBeenCalledWith(
    { type: "eq", left: jobRuns.id, right: 10 },
    { type: "eq", left: jobRuns.status, right: "running" },
  );
  expect(and).toHaveBeenCalledWith(
    { type: "eq", left: jobRuns.id, right: 11 },
    { type: "eq", left: jobRuns.status, right: "running" },
  );
});
```

Also add tests that assert:
- `heartbeatJobRun` and `updateJobRunProgress` refresh `lastHeartbeatAt` and `updatedAt`.
- `markStaleJobRuns` only marks `running` jobs stale when `lastHeartbeatAt < now - JOB_STALE_AFTER_MS`.
- `listActiveJobRuns` uses the same `NON_TERMINAL_JOB_STATUSES` constant as acquisition duplicate checks.

**Step 2: Run the focused test**

Run:

```bash
bun run test -- src/server/job-runs.test.ts
```

Expected: PASS if current behavior already matches the invariants. If a new assertion fails because the mock call order is different, adjust the assertion to inspect calls without weakening the invariant.

**Step 3: Commit**

```bash
git add src/server/job-runs.test.ts
git commit -m "test(reliability): document job run lifecycle invariants"
```

---

### Task 2: Add scheduler lifecycle matrix coverage

**Files:**
- Modify: `src/server/scheduler/index.test.ts`

**Step 1: Add tests around scheduler-specific invariants**

Extend `describe("executeTask (via runTaskNow)", ...)` with tests that make these rules explicit:

```ts
it("does not acquire a scheduled run when an overlapping command is active", async () => {
  // Existing test covers this; rename or add assertions that acquireJobRun is not called
  // and the scheduled task row is not mutated.
});

it("recovers stale scheduled runs before checking overlap or acquiring a new run", async () => {
  // Existing test covers ordering; assert markStaleJobRuns happens before acquireJobRun.
});

it("clears scheduled progress for stale scheduled runs but not stale command runs", async () => {
  // Seed markStaleJobRuns return values with both source types and verify only the
  // scheduled task row receives progress: null.
});
```

Use the existing mocks in `src/server/scheduler/index.test.ts`; do not add a new test harness unless the current one cannot express call order.

**Step 2: Run the focused scheduler test**

```bash
bun run test -- src/server/scheduler/index.test.ts
```

Expected: PASS after assertions are aligned with existing behavior.

**Step 3: Commit**

```bash
git add src/server/scheduler/index.test.ts
git commit -m "test(scheduler): encode scheduled run lifecycle invariants"
```

---

### Task 3: Add command lifecycle matrix coverage

**Files:**
- Modify: `src/server/commands.test.ts`

**Step 1: Add tests around command-specific invariants**

Extend `describe("commands server helpers", ...)` to assert:

- `submitCommand` checks scheduled batch overlap before acquiring a command run.
- Commands with explicit dedupe values reject duplicates through `acquireJobRun`.
- Commands with missing dedupe keys use `randomUUID()` so unrelated ad-hoc commands can run concurrently.
- Progress updates include the optional title prefix and emit `commandProgress`.
- Completion/failure events are emitted after the job run is terminally updated.
- Heartbeat intervals are cleared on both success and failure.

Where possible, convert existing tests into clearer invariant names rather than duplicating coverage.

**Step 2: Run the focused command test**

```bash
bun run test -- src/server/commands.test.ts
```

Expected: PASS.

**Step 3: Commit**

```bash
git add src/server/commands.test.ts
git commit -m "test(commands): encode command run lifecycle invariants"
```

---

### Task 4: Add timer lifecycle guard coverage

**Files:**
- Modify: `src/server/scheduler/timers.test.ts`

**Step 1: Add/strengthen timer invariants**

Ensure tests explicitly assert:

```ts
it("replaces a pending timer with one active interval per task", () => {
  // Arrange: create an existing timer for a task.
  // Act: rescheduleTask(taskId, intervalMs).
  // Assert: old timer was cleared and the map contains only the new timer.
});

it("clearTaskTimer removes the task timer and prevents future executor calls", () => {
  // Existing tests cover removal; add fake-timer advancement to prove no call happens.
});
```

Keep this file scoped to timer behavior only. Do not reach into scheduler task execution here.

**Step 2: Run the focused timer test**

```bash
bun run test -- src/server/scheduler/timers.test.ts
```

Expected: PASS.

**Step 3: Commit**

```bash
git add src/server/scheduler/timers.test.ts
git commit -m "test(scheduler): guard task timer lifecycle"
```

---

### Task 5: Fix only invariants that fail

**Files:**
- Modify only if needed: `src/server/job-runs.ts`
- Modify only if needed: `src/server/scheduler/index.ts`
- Modify only if needed: `src/server/commands.ts`
- Modify only if needed: `src/server/scheduler/timers.ts`

**Step 1: If a test fails, identify the smallest behavioral gap**

Examples of acceptable minimal fixes:

```ts
// If a terminal update can overwrite stale/failed/succeeded state, keep the existing guard:
.where(and(eq(jobRuns.id, jobRunId), eq(jobRuns.status, "running")))
```

```ts
// If command/scheduler overlap checks diverge, keep overlap checks based on listActiveJobRuns()
// and metadata.batchTaskId rather than duplicating status filters.
```

Do not introduce a new coordinator/refactor in this task. If the tests reveal a large design issue, stop and write a follow-up plan.

**Step 2: Run the failing focused test until it passes**

Use the exact failing file from Tasks 1-4, for example:

```bash
bun run test -- src/server/scheduler/index.test.ts
```

Expected: PASS.

**Step 3: Commit the minimal fix**

Use the correct scope for the touched file, for example:

```bash
git add src/server/scheduler/index.ts src/server/scheduler/index.test.ts
git commit -m "fix(scheduler): preserve job run lifecycle invariant"
```

---

### Task 6: Run combined verification

**Files:**
- No source edits unless verification reveals a failure.

**Step 1: Run lifecycle-related tests together**

```bash
bun run test -- src/server/job-runs.test.ts src/server/scheduler/index.test.ts src/server/scheduler/timers.test.ts src/server/commands.test.ts
```

Expected: all selected suites pass.

**Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: typecheck passes with no suppressions added.

**Step 3: Commit any test-only cleanup**

Only if needed:

```bash
git add src/server/job-runs.test.ts src/server/scheduler/index.test.ts src/server/scheduler/timers.test.ts src/server/commands.test.ts
git commit -m "test(reliability): tighten lifecycle verification"
```

---

### Task 7: Request review before integration

**Files:**
- No code edits.

**Step 1: Summarize the invariant coverage**

Include:
- Which invariants are now explicit.
- Whether production behavior changed.
- Verification command outputs.
- Any follow-up backlog items discovered.

**Step 2: Use the requesting-code-review skill**

Ask for review focused on:
- Test assertions that are too implementation-coupled.
- Missing lifecycle states or overlap cases.
- Whether any discovered behavior gap should be fixed now or split out.

**Step 3: Choose integration path**

After review and passing verification, use the finishing-a-development-branch skill to either create a PR or cherry-pick onto local `main` per repository workflow.
