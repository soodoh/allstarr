# Reliability and Code Quality Backlog Design

## Purpose

Create a large, ranked backlog of improvements that raise runtime reliability and code quality in the Allstarr codebase. This design covers backlog creation only. It does not implement any code changes.

## Context

Allstarr is a TypeScript/Bun application using TanStack Start, SQLite through Drizzle, Better Auth, Vitest browser tests, Playwright e2e tests, and Docker release workflows. The current repository already has broad unit, browser, and e2e coverage. Recent commits show active reliability work around task runs, persisted run state, imports, tracked downloads, and download state transitions.

The codebase has several high-leverage areas for improvement:

- Stateful server workflows: scheduler tasks, command execution, job heartbeats, download tracking, file imports, unmapped file mapping, and auto-search.
- External integrations: Hardcover, TMDB, indexers, Servarr imports, and download clients.
- Large modules: `src/server/auto-search.ts`, `src/server/import.ts`, `src/server/unmapped-files.ts`, `src/server/search.ts`, `src/server/books.ts`, `src/server/shows.ts`, and large route/component files.
- CI and test infrastructure: separate unit/browser/e2e layers, merged coverage, golden fixtures, fake external services, Docker verification, and release automation.

## Backlog Structure

Each backlog item will include:

- Problem: the reliability or maintainability issue being addressed.
- Evidence: concrete files, patterns, or workflows from this repository.
- Impact: expected benefit for users, operators, or developers.
- Suggested implementation: a concise direction that can become an implementation plan later.
- Size: S, M, or L.
- Risk: low, medium, or high.
- Verification plan: tests, checks, or manual validation needed.
- Priority: P0, P1, P2, or P3.

## Priority Rubric

P0 items address production-risk failure modes where data can become incorrect, jobs can become stuck, imports/downloads can transition incorrectly, or external failures can leave persistent bad state.

P1 items address recurring maintainability or test-confidence problems in active code paths. They may not be urgent production defects, but they reduce the cost and risk of future changes.

P2 items improve clarity, observability, local development, or CI quality where the current behavior is serviceable but fragile or expensive.

P3 items are longer-term cleanup or architectural follow-ups that are useful after higher-risk work is complete.

## Themes

### Runtime Reliability

Focus on background job state, scheduler timers, task heartbeats, command deduplication, download/import lifecycle, idempotency, transaction boundaries, external request retry behavior, timeouts, cancellation, and recovery after restart.

The first recommended tranche should come mostly from this theme because the repository's most consequential failures are likely to involve persistent state transitions or long-running workflows.

### Code Maintainability

Focus on reducing module size and coupling where it directly supports safer reliability work. Candidate areas include auto-search, imports, unmapped files, search, media detail routes, and repeated flows across books, movies, series, and shows.

Refactors should be scoped around clear boundaries, such as external-client adapters, state-transition helpers, planning/apply phases, shared media-domain primitives, or route-level view-model helpers.

### Test and CI Confidence

Focus on faster feedback, clearer test ownership, fixture stability, flake reduction, browser/e2e boundaries, and coverage usefulness. Existing thresholds should not be lowered.

Backlog items should identify which layer should own a regression: unit tests for pure state logic, browser tests for DOM behavior, e2e tests for full workflows, and golden/fake-service tests for external integration behavior.

### Operational Quality

Focus on Docker/runtime verification, environment validation, migrations, health/status diagnostics, backup/housekeeping safety, logging, and actionable errors.

Operational items should favor checks that catch deployment or runtime misconfiguration before it causes data loss or silent workflow failure.

## Recommended First Tranche

The first implementation tranche should contain a small set of P0/P1 items with direct reliability impact and bounded blast radius. Likely candidates:

- Harden job-run and scheduler lifecycle invariants around startup, heartbeat expiry, completion, and concurrent execution.
- Centralize external HTTP timeout, retry, and rate-limit handling where duplicate behavior exists.
- Extract explicit state-transition helpers for tracked downloads and imports, with focused unit tests for invalid transitions.
- Add restart/recovery regression tests for long-running task and download/import workflows.
- Improve logging and status surfacing for failed background work so operators can distinguish transient external failures from persistent bad state.

## Out of Scope

This design does not include implementation, broad product feature changes, lowering coverage thresholds, replacing the current stack, or unrelated UI redesign. Refactoring is included only when it directly reduces reliability risk or makes future reliability work easier to verify.

## Verification for Backlog Creation

The backlog itself will be verified by checking that:

- Every item has concrete repository evidence.
- P0/P1 items map to a plausible failure mode or active maintenance risk.
- Suggested implementations are small enough to become separate implementation plans.
- Verification plans reference existing commands where possible: `bun run lint`, `bun run typecheck`, `bun run test`, `bun run test:e2e`, and targeted single-file test runs.
- No item requires editing generated files such as `src/routeTree.gen.ts` or anything under `.worktrees/`.

## Handoff

After this spec is approved, the next step is to use the writing-plans workflow to turn the ranked backlog effort into an implementation plan for generating the backlog document. The implementation plan should start with deeper code inspection, then produce the ranked backlog artifact, and only then select a first tranche for actual code changes.
