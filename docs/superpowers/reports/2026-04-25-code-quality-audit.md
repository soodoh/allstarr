# Code Quality Audit Report

## Working Tree Context

- Branch: `improvements`
- Audit date: 2026-04-25
- Baseline notes:

## Executive Summary

## Verification

| Command | Result | Notes |
| --- | --- | --- |
| `bun run test -- src/server/dashboard.test.ts src/routes/_authed/index.browser.test.tsx` | PASS | 2 files passed, 6 tests passed. |
| `bun run test -- src/server/import.test.ts src/server/imports/plan.test.ts src/server/imports/apply.test.ts src/server/unmapped-files.test.ts src/routes/_authed/unmapped-files.browser.test.tsx src/components/unmapped-files/mapping-dialog.browser.test.tsx` | PASS | 5 files passed, 91 tests passed. Note: `src/server/import.test.ts` does not exist in this worktree; the matching import server test file is `src/server/__tests__/import.test.ts`, so this command did not run that file. |

## Workflow Findings

### Dashboard And Library Browsing

#### Finding: No high-value finding in this workflow

- Category: Maintainability issue
- Evidence: `src/routes/_authed/index.tsx` prefetches dashboard content stats, quality breakdown, storage, recent activity, and system status in the route loader, then reads the same dashboard queries with `useSuspenseQuery` using only named `data` destructuring. `src/lib/queries/dashboard.ts` centralizes each dashboard query with explicit `queryKeys.dashboard.*` keys, and `src/server/dashboard.test.ts` covers auth-gated content stats, quality grouping, storage aggregation, and recent activity mapping. Context7 TanStack Query v5 guidance confirms suspense query data is defined, affected query keys should be invalidated after mutations, and object rest destructuring of query results should be avoided; no dashboard mutation or object rest query-result destructuring was observed in this workflow.
- Impact: User Impact Low, Maintenance Cost Low, Risk Low, Implementation Size Small.
- Recommendation: Keep dashboard query ownership centralized in `src/lib/queries/dashboard.ts` and add an invalidation assertion to the first dashboard-affecting mutation test introduced, verifying the affected `queryKeys.dashboard.*` key is invalidated on success.

### Imports And Unmapped Files

#### Finding: Unmapped-file mapping mixes filesystem side effects, database writes, and per-content orchestration

- Category: Maintainability issue
- Evidence: `src/server/unmapped-files.ts` contains the related-asset planner helpers, filesystem move helpers, rollback helper, request normalization, and all TV/book/movie mapping branches in one server module. Primary file moves happen before the database transaction, then each branch manually records moved paths and rolls them back if the later DB transaction fails (`moveFileToManagedPath` / `movePathToManagedDestination` at `src/server/unmapped-files.ts:383` and `src/server/unmapped-files.ts:439`, rollback at `src/server/unmapped-files.ts:911`, TV transaction and rollback at `src/server/unmapped-files.ts:1130` and `src/server/unmapped-files.ts:1167`, book transaction and rollback at `src/server/unmapped-files.ts:1387` and `src/server/unmapped-files.ts:1423`, movie transaction and rollback at `src/server/unmapped-files.ts:1583` and `src/server/unmapped-files.ts:1623`). Tests do cover rollback paths for movie and TV transaction failures in `src/server/unmapped-files.test.ts`, but the implementation repeats the same move-plan/DB-write/cleanup pattern across content types.
- Impact: User Impact Medium, Maintenance Cost High, Risk Medium, Implementation Size Medium.
- Recommendation: Extract a small mapping execution boundary that accepts a content-specific destination/file-record plan, performs moves, runs a supplied DB transaction, and owns rollback/cleanup behavior. Keep the content-specific branches focused on resolving targets, metadata, and destination paths; keep filesystem semantics in one tested executor.

#### Finding: Mapping dialog duplicates backend import-payload rules in UI state

- Category: Maintainability issue
- Evidence: `src/components/unmapped-files/mapping-dialog.tsx` owns row search state, selected targets, touched flags, asset expansion, asset selection, row-level failures, saved defaults, profile selection, and backend payload construction in the same component (`src/components/unmapped-files/mapping-dialog.tsx:757` through `src/components/unmapped-files/mapping-dialog.tsx:1363`). The TV and non-TV submit handlers both map asset state into the same `"move" | "delete" | "ignore"` action rules before calling `mapUnmappedFileFn` (`src/components/unmapped-files/mapping-dialog.tsx:1229` and `src/components/unmapped-files/mapping-dialog.tsx:1307`). Browser tests cover important behavior: saved defaults and TV suggestions, submit-disabled while related assets load, row isolation, partial-success error handling, and deselected asset submission in `src/components/unmapped-files/mapping-dialog.browser.test.tsx`.
- Impact: User Impact Low, Maintenance Cost Medium, Risk Medium, Implementation Size Small.
- Recommendation: Move payload construction and asset-action derivation into a pure helper with unit coverage. That would let the dialog remain responsible for rendering and interaction state while the server contract stays represented in one tested place shared by TV and non-TV submissions.

#### Finding: Import plan/apply boundaries are clearer than the unmapped-file mapping boundary

- Category: Positive finding
- Evidence: Import planning is isolated in `src/server/imports/plan.ts`: it flattens normalized snapshots, assigns supported/unresolved/unsupported rows, preserves provenance skips, and sorts each plan section (`src/server/imports/plan.ts:374` through `src/server/imports/plan.ts:455`). Import application is separately responsible for sorting selected rows by dependency order, handling unsupported/unresolved rows as review items, writing provenance, and wrapping selected-row application in one transaction (`src/server/imports/apply.ts:478` through `src/server/imports/apply.ts:612`). Focused tests cover profile section separation, unsupported rows, provenance-based skips, unresolved library rows, transaction rollback, and resolved library provenance in `src/server/imports/plan.test.ts` and `src/server/imports/apply.test.ts`.
- Impact: User Impact Low, Maintenance Cost Low, Risk Low, Implementation Size Small.
- Recommendation: Use the import plan/apply split as the model for future unmapped-file refactoring: one layer should produce a deterministic plan, and one layer should execute that plan with transactional and filesystem rollback semantics.

### Indexers, Search, And Download Flow

### Settings And Configuration

### Auth, Setup, And Role-Gated Navigation

## Cross-Cutting Test Quality

## Ranked Shortlist

| Rank | Finding | Category | User Impact | Maintenance Cost | Risk | Implementation Size | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Fix Now

## Track Later

## Recommended First Implementation Target

## Risks And Open Questions
