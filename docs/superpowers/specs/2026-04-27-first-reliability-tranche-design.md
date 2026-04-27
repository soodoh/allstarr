# First Reliability Tranche Design

## Purpose

Create an implementation plan for the first ranked reliability tranche from `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`. The tranche covers all five recommended items:

1. Harden scheduler and job-run lifecycle invariants.
2. Make tracked download state transitions explicit.
3. Strengthen import and file-move atomicity.
4. Verify unmapped file mapping rollback for all media types.
5. Centralize external HTTP timeout, retry, and rate-limit behavior.

This design covers the implementation plan shape and intended technical boundaries. It does not implement code changes.

## Context

The first tranche is runtime reliability work. The common thread is making state transitions and side effects explicit enough to test and reason about:

- Scheduler and command execution use persisted `job_runs`, heartbeat intervals, stale recovery, dedupe identities, and overlap checks.
- Tracked downloads already have transition helpers, but some import paths still write state directly.
- External integrations implement timeout, retry, and rate-limit behavior in several places.
- Completed imports and unmapped-file mapping combine filesystem side effects with SQLite writes, so failures need compensating cleanup or diagnosable partial state.

The plan should preserve existing public behavior unless targeted tests expose a real reliability gap.

## Recommended Sequence

### 1. Scheduler and Job-Run Invariants

Document and test lifecycle rules for scheduled and command job runs. The implementation plan should start here because this area already has focused modules and tests, and the changes are mostly about making invariants explicit.

The plan should cover active, terminal, stale, duplicate, startup recovery, command overlap, and heartbeat behavior. Production changes should be minimal unless tests reveal inconsistent lifecycle behavior.

### 2. Tracked Download Transition Boundary

Make tracked download state changes go through explicit helpers or a documented import-claim helper. The main goal is to remove or isolate direct `trackedDownloads.state` writes from import paths so callers share the same transition semantics.

The plan should preserve existing retry behavior for `completed` and `importPending` rows while making invalid transitions fail clearly and leave persisted state unchanged.

### 3. External HTTP Request Policy

Introduce a shared request policy for timeout, retryable statuses, `Retry-After`, abort behavior, and rate-limit conversion. Migrate a small set of existing clients behind the policy without changing their public behavior.

The plan should avoid a broad rewrite. It should start with the clients already identified in the backlog: API cache, indexer HTTP, Hardcover, TMDB, and download-client HTTP.

### 4. Import and File-Move Atomicity

Add an explicit staged import/apply boundary for completed-download imports. This should record filesystem side effects and narrow database write phases. The design should not pretend SQLite transactions can roll back file moves; it should make compensating cleanup and failure reporting explicit.

The plan should add focused failure-injection tests for copy/link/chmod/database/history/tracked-download finalization failures before significant production changes.

### 5. Unmapped File Mapping Rollback

Make mapping side effects explicit for book, movie, and episode flows. The implementation plan should introduce or extend a reusable operation runner or plan/apply structure that records moved paths, database apply behavior, and compensating rollback.

The plan should add failure-injection coverage for move succeeds then transaction fails, sidecar move fails, cleanup fails, and unmapped-row deletion fails.

## Architecture

The tranche should not force one abstraction across unrelated reliability problems. Each item gets the smallest boundary that fits its failure mode:

- Job runs and tracked downloads are state-machine boundaries.
- HTTP integrations share an external request policy.
- Import and unmapped mapping are side-effect orchestration boundaries.

Each boundary should have a narrow contract that states what it owns, what callers pass in, what success means, what failure means, and what persisted or filesystem state may change.

## Error Handling

Invalid state transitions must fail explicitly and leave persisted state unchanged.

HTTP failures must follow consistent timeout, retry, abort, and rate-limit handling. Existing user-facing error messages should remain stable unless tests identify a misleading message.

Filesystem/database workflows must handle partial failure explicitly. After a filesystem side effect, later failures should either run compensating cleanup or leave enough structured state, test coverage, and logs for recovery to be diagnosable.

## Testing Strategy

Use targeted tests before production changes. Existing test files should remain the main verification surface:

- `src/server/job-runs.test.ts`
- `src/server/scheduler/index.test.ts`
- `src/server/scheduler/timers.test.ts`
- `src/server/commands.test.ts`
- `src/server/tracked-download-state.test.ts`
- `src/server/download-manager.test.ts`
- `src/server/file-import.test.ts`
- `src/server/__tests__/api-cache.test.ts`
- `src/server/indexers/http.test.ts`
- `src/server/hardcover/client.test.ts`
- `src/server/tmdb/client.test.ts`
- `src/server/download-clients/http.test.ts`
- `src/server/unmapped-files.test.ts`

The implementation plan should require `bun run lint`, `bun run typecheck`, and targeted tests for each task. A final `bun run test` should be used as a confidence check after the targeted suites pass.

## Commit and Review Strategy

The implementation plan should split the tranche into independently reviewable tasks and commits. A practical commit sequence is:

1. Job-run invariant tests and minimal fixes.
2. Tracked-download transition boundary tests and fixes.
3. Shared HTTP request policy and first client migrations.
4. Import atomicity tests and side-effect boundary improvements.
5. Unmapped mapping rollback tests and side-effect boundary improvements.
6. Final verification and documentation updates if needed.

The implementation plan should keep each task small enough for separate review. Large filesystem/database tasks may be split further if test setup becomes too broad.

## Out of Scope

This tranche does not include UI redesign, unrelated refactors, new product features, lowering coverage thresholds, replacing SQLite, or rewriting all import/search logic. Refactoring is in scope only where it directly supports the five reliability items.

## Handoff

After this spec is approved, the next step is to use the writing-plans workflow to create a detailed task-by-task implementation plan. That plan should include exact files, test-first steps, commands, expected failures, minimal implementation steps, verification commands, and commits.
