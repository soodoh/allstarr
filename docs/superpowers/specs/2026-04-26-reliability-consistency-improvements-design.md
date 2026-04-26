# Reliability And Consistency Improvements Design

## Purpose

This project will implement the remaining high-value improvements from the code quality audit after the completed work on transactional grab persistence, full-suite wrapper imports, and typed generic settings.

The goal is to improve reliability, code quality, and Servarr-facing consistency without broad product redesign. The work will be planned as one umbrella effort with five independently reviewable phases.

## Scope

The implementation will cover these audit candidates:

1. Validate Readarr-compatible synced indexer payloads at the API route boundary.
2. Extract a reusable unmapped-file mapping executor for filesystem moves, database transaction execution, and rollback.
3. Decompose auto-search orchestration into content-neutral helpers and content-specific adapters.
4. Replace brittle indexer/search/download test fixtures with named builders or lightweight fakes where those tests are touched.
5. Replace fixed waits in high-value e2e helpers and scheduled-task flows with observable readiness predicates.

## Non-Goals

- Do not revisit the already completed candidates for transactional grab persistence, wrapper import failures, or typed settings.
- Do not change generated files, including `src/routeTree.gen.ts`.
- Do not change database schema unless implementation discovers a concrete persistence requirement that cannot be handled with existing tables.
- Do not rewrite all auto-search behavior at once.
- Do not perform a full Servarr API parity review beyond the synced indexer payload boundary covered here.
- Do not lower lint, typecheck, test, or coverage thresholds.

## Phase 1: Sync Indexer API Validation

The synced indexer routes currently authenticate requests and validate path IDs, but `POST /api/v1/indexer` and `PUT /api/v1/indexer/$id` should also validate external JSON before mapper or persistence code runs.

Add a Zod schema for the Readarr-compatible indexer resource shape accepted by `fromReadarrResource`. The schema should live with the synced-indexer mapper or API route support code so route tests and mapper tests use the same contract. Routes should parse unknown request bodies with `safeParse`, return status 400 for malformed JSON or invalid fields, and include a stable JSON error body with a short message plus field-level validation details. Zod 4's top-level error formatting helpers can be used for structured validation output.

Route tests should cover malformed JSON, missing required fields, invalid implementation/protocol values, wrong field types, and mapper-rejected values. These tests should prove invalid payloads do not reach persistence.

## Phase 2: Unmapped-File Mapping Executor

The unmapped-file server module repeats the same execution shape across TV, book, and movie mapping branches: move files first, run a database transaction, then roll back moved paths when later work fails.

Extract a small executor that accepts:

- A filesystem implementation.
- A list or callback that performs planned file moves and records `{ from, to, kind }`.
- A database transaction callback.
- A log label for rollback diagnostics.

The executor owns rollback ordering and error propagation. Content-specific branches remain responsible for target resolution, metadata lookup, destination path planning, and table writes inside the transaction callback. Existing rollback semantics should be preserved unless tests reveal an existing inconsistency that the design must make explicit.

Tests should cover transaction failure after one or more moves, rollback failure logging, and success paths for at least one TV and one non-TV mapping branch. Existing unmapped-file tests should remain behavior-focused.

## Phase 3: Auto-Search Decomposition

`src/server/auto-search.ts` should move toward content-neutral orchestration boundaries without changing scheduler semantics.

Extract helpers in this order:

1. Shared indexer search execution for configured synced/manual indexers, warning capture, rate-limit handling, and per-indexer failure isolation.
2. Shared download-client resolution and dispatch for torrent/usenet releases.
3. Shared tracked-download and history recording around successful dispatch.
4. Content-specific adapters that provide wanted-item discovery, query construction, profile checks, and history/tracked-download payload details for books, movies, and episodes.

The first implementation plan should keep behavior stable: books, movies, and episodes should still run in the same order, with the same rate-limit and sleep behavior unless a test proves a safer readiness condition. Pack and profile-selection logic should be pure helpers with focused tests when touched.

## Phase 4: Test Fixture Cleanup

Fixture cleanup should support the auto-search and indexer changes instead of becoming a standalone test rewrite.

Introduce named fixture builders or lightweight fake repositories for the workflows touched in phases 1 and 3. The target is to reduce long `selectAll` call-order switch statements and chained `mockReturnValueOnce` sequences where tests care about final behavior rather than query order.

Tests should prefer assertions on searched releases, grabbed releases, warnings, tracked-download rows, history rows, and provider calls. Positional DB-call assertions should remain only where query order is itself the behavior under test.

## Phase 5: E2E Fixed-Wait Removal

Replace fixed sleeps in high-value e2e paths with observable readiness checks.

The first targets are:

- `e2e/helpers/auth.ts`: replace hydration/session sleeps with URL, visible-form, or session-state checks.
- `e2e/helpers/sse.ts`: replace timeout-only capture with event predicate support.
- Scheduled-task specs for download lifecycle, auto-search, disk scan, and blocklist: replace post-task sleeps with task-status, database-state, or UI-state polling.

Short retry loops are acceptable when they assert a concrete condition. Raw `page.waitForTimeout` should remain only when the wait is intentionally testing debounce, animation timing, or external fake-server startup and the test explains why no observable condition is available.

## Architecture

The design favors small boundaries over broad rewrites:

- API routes own authentication, request parsing, response status, and route-level error shape.
- Mapper modules own trusted resource conversion after validation.
- The unmapped-file executor owns move/transaction/rollback mechanics, while content branches own domain-specific planning.
- Auto-search helpers own content-neutral orchestration, while adapters own content-specific decisions.
- Test fixtures should model domain state directly instead of forcing each test to replay internal DB call order.

## Error Handling

Validation errors should return 400 with stable JSON and should not log misleading create/update messages based on untrusted fields. Mapper and persistence errors should continue to produce existing server error behavior unless they are caused by invalid external input, in which case the route should return 400.

Unmapped-file rollback should preserve the original failure as the primary thrown error. Rollback failures should be logged with enough path context to debug cleanup without masking the transaction or move failure.

Auto-search helper extraction should preserve current warning behavior: a failing indexer should not fail the whole search when other indexers succeed, and all-indexer failure should still surface as the current user-visible error.

## Testing And Verification

Each phase should include focused tests before or with implementation:

- Sync indexer API route tests and schema/mapper tests.
- Unmapped-file executor tests plus representative mapping tests.
- Auto-search helper tests and existing workflow tests.
- Refactored indexer/search/download fixture tests proving behavior remains stable.
- E2E helper/spec changes proving fixed waits are replaced with predicates.

Minimum final verification:

- `bun run lint`
- `bun run typecheck`
- Targeted unit/browser tests for changed areas
- Targeted e2e specs for changed e2e helpers
- `bun run test` after fixture and helper changes settle

## Implementation Order

Implement in five commits or checkpoints:

1. `fix(indexers): validate synced indexer payloads`
2. `refactor(imports): extract unmapped mapping executor`
3. `refactor(search): split auto-search orchestration helpers`
4. `test(search): simplify search fixture setup`
5. `test(e2e): replace fixed waits with readiness checks`

Each checkpoint should keep lint, typecheck, and its targeted tests passing before moving to the next phase.

## Open Decisions

The implementation plan must decide the exact synced-indexer validation response shape before coding. It should be stable enough for tests and client debugging, but it does not need to mimic Servarr's error format exactly unless local compatibility tests require that.

The implementation plan must also decide whether the auto-search extraction creates new files under `src/server/auto-search/` or keeps helpers in the existing module first. The preferred path is to create focused helper modules once extracted code has a clear boundary.
