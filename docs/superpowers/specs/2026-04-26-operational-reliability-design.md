# Operational Reliability Design

## Purpose

Improve Allstarr's internal reliability and end-to-end operational robustness by addressing two high-risk failure modes:

- background jobs getting stuck or duplicated
- imports and downloads ending in inconsistent database state

Servarr consistency is a secondary goal for this pass. We will use Servarr-like operational behavior where it improves job visibility, retry safety, and state correctness, but this design does not target broad API or UI compatibility.

## Current Context

The app already has scheduled tasks, ad-hoc commands, tracked downloads, Server-Sent Events, and import/download workflows. The current model has useful pieces but splits operational state across in-memory scheduler state, `scheduled_tasks`, `active_adhoc_commands`, `tracked_downloads`, and transient SSE events.

That split creates reliability risks:

- process restarts can leave running work ambiguous
- duplicate prevention depends partly on in-memory state or active row scans
- ad-hoc command state disappears when work finishes or fails
- completed download handling mixes external client state, filesystem import work, and database updates
- large server modules make risky workflows harder to test through small boundaries

## Recommended Approach

Add a durable job-run ledger and transactional state boundaries.

The job-run ledger gives scheduled tasks and ad-hoc commands one shared lifecycle model. Transactional state services make import/download database transitions atomic without wrapping network or filesystem work in long database transactions.

This approach is intentionally narrower than a new third-party queue system or a full rewrite of the largest server modules. It targets the known operational risks while keeping the implementation incremental and testable.

## Architecture

Add a `job_runs` table and a `job-runs` server module. `scheduled_tasks` remains the definition/configuration table for scheduled jobs. The active ad-hoc command API should be backed by `job_runs`, either by replacing `active_adhoc_commands` usage in services or by keeping a compatibility adapter during migration.

Each job run records:

- source type: scheduled task or ad-hoc command
- job type
- display name
- optional dedupe key and dedupe value
- status
- progress
- started, heartbeat, and finished timestamps
- attempt count
- result or error summary
- optional entity references or JSON metadata

The scheduler and command runner both acquire runs through the same service. They heartbeat while active, persist progress, and finish through one terminal-state path.

Use Drizzle transactions for atomic database boundaries. Current Drizzle documentation supports `db.transaction`, rollback, return values, nested transactions via savepoints, and SQLite transaction behavior options. That fits the existing Bun SQLite stack without adding a new dependency.

## Job Lifecycle

Job runs move through explicit states:

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`
- `stale`

Scheduled tasks acquire a run only if no non-terminal run exists for the same task. Ad-hoc commands acquire a run only if no non-terminal run exists for the same `commandType + dedupeKey + dedupeValue`.

On startup, the scheduler performs recovery before timers start:

- stale `running` runs are marked `stale`
- stale scheduled runs no longer block future executions
- stale ad-hoc commands are visible to the UI as stale or failed instead of disappearing
- active/progress state can be rebuilt from persisted rows after SSE reconnects

The initial stale threshold should be five minutes since the last heartbeat. The heartbeat interval should be short enough for interactive visibility, with a default of ten seconds while a job is running or whenever progress changes.

The first version does not resume arbitrary JavaScript work in the middle of a function. It makes interrupted work visible and retryable. True resumability can be added later for specific import phases.

## Import And Download Consistency

Do not hold database transactions across network calls or filesystem operations. Use transactions for state transitions and commit points.

Add a focused tracked download state service with functions to:

- mark queued, downloading, completed, removed, failed, import-pending, and imported states
- record output paths and failure messages
- attach required history or blocklist side effects in the same transaction
- enforce valid transition rules so impossible state jumps fail loudly in tests
- accept an existing transaction handle when called inside larger database work

Completed download handling should become phase-based:

1. Reconcile download client state and atomically mark `completed`.
2. Claim an import attempt by moving `completed` to `importPending`.
3. Perform filesystem import work outside the transaction.
4. Finalize as `imported` or `failed` in a transaction.
5. Remove from the download client only after `imported` is committed.

Startup recovery should treat `importPending` rows with no active job run and an `updatedAt` value older than five minutes as retryable import claims. The initial behavior should prefer safe retry over silent success.

## Code Quality Scope

In scope:

- add a `job-runs` server module with acquire, heartbeat, progress, complete, fail, stale recovery, and active-run listing APIs
- replace direct scheduled-task running-state checks with persisted run acquisition
- route ad-hoc command execution through the same run service
- extract tracked download state transitions into a focused server module
- update tests for scheduler, commands, download manager, and import finalization
- add migration/schema tests where existing repo patterns support them

Out of scope:

- full rewrite of `auto-search.ts`, `import.ts`, or `unmapped-files.ts`
- changing external download client provider implementations
- true resumable import pipelines
- introducing a third-party queue system
- broad UI redesigns beyond showing active/stale job state where needed

## Testing

Unit tests should cover:

- duplicate job acquisition rejects existing non-terminal runs
- stale recovery marks old `running` jobs stale
- heartbeat and progress updates persist and emit events
- tracked download transitions reject invalid state jumps
- import finalization commits success or failure atomically

Server tests should cover:

- scheduler startup recovers stale runs before timers
- `runTaskNow` cannot overlap an active run
- ad-hoc commands dedupe through `job_runs`
- completed download handling retries `importPending` rows correctly
- failed import handling records consistent state plus required blocklist/history side effects

E2E coverage should stay narrow:

- extend the existing Tasks/System flow to prove a manually run task appears active, progresses, and reaches a terminal state after refresh or SSE reconnect
- cover stale display only if it can be seeded without time-based flakiness

## Rollout Plan

Implement incrementally:

1. Add schema, migration, and tests for `job_runs`.
2. Build and unit-test the `job-runs` service.
3. Route scheduler execution through persisted run acquisition and recovery.
4. Route ad-hoc commands through the same service.
5. Extract tracked download state transitions.
6. Move completed download handling to phase-based finalization.
7. Add focused e2e coverage for task visibility across refresh or SSE reconnect.

Each step should keep `bun run lint`, `bun run typecheck`, and relevant tests passing before moving to the next step.

## Success Criteria

- Process restart cannot leave scheduled tasks permanently blocked by in-memory state.
- Duplicate scheduled tasks and duplicate ad-hoc commands are rejected by persisted guards.
- Operators can see stale or failed background work after reconnect or refresh.
- Completed download handling never removes a client item before the imported state is committed.
- Import success and failure states are committed through explicit transactional boundaries.
- The reliability work improves module boundaries without broad unrelated refactors.
