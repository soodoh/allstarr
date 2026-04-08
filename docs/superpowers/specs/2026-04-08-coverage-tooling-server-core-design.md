# Coverage Tooling And Server/Core Test Expansion Design

Date: 2026-04-08
Status: Approved for planning
Scope: Phase one of a staged repo-wide coverage program

## Summary

Phase one establishes truthful coverage reporting for the entire repo while enforcing `>=95%` coverage only for a server/core allowlist. This phase does not attempt to bring frontend routes, hooks, or components to the same threshold. Instead, it adds the coverage tooling, test harness, and server/core test surface needed to make that enforcement reliable and maintainable.

This design exists because the current Vitest setup reports only the files that are imported during test execution. That produces a misleading picture of code coverage and hides the size of the untested application surface. Phase one fixes the measurement problem first, then raises quality for the highest-value non-UI code.

## Goals

- Report coverage against the full executable source surface of the repo.
- Enforce `>=95%` statements, branches, functions, and lines for an explicit phase-one allowlist.
- Expand test coverage across `src/server/**` and non-UI logical helpers in `src/lib/**`.
- Exclude low-value declarative schema coverage from the enforced threshold in this phase.
- Create shared testing infrastructure so additional server/core tests are cheap to write.

## Non-Goals

- Enforcing `>=95%` coverage on the full repo in this phase.
- Adding a frontend component, route, or hook testing stack.
- Holding `src/db/schema/**` to direct coverage thresholds.
- Refactoring unrelated code that does not improve the testability or reliability of this phase-one work.

## Current Problems

### Misleading coverage reporting

Vitest is currently configured to discover a narrow set of test files and does not define full-source coverage rules or thresholds. As a result, default coverage output reflects only files already loaded by tests. Entire parts of the app disappear from the report if no test imports them.

### Incomplete test discovery

The current test include patterns do not reflect the full set of test file shapes the repo will need, especially if server/core work expands into adjacent files that use `*.spec.ts` or any future `*.test.tsx` style tests.

### Large server/core logic surface with weak branch coverage

There are already some tests around server modules, indexer protocols, download clients, and helpers. Those tests provide a foothold, but many high-value orchestration modules remain untested, and several partially covered files still have weak branch coverage.

## Phase-One Coverage Policy

Phase one introduces two distinct coverage views.

### 1. Global informational coverage

Coverage reporting must include the full executable source surface of the repo so the team can see the real baseline. This is informational in phase one. It is not the CI gate.

The purpose of this report is:

- to make hidden zero-coverage areas visible
- to prevent confusion caused by import-only reporting
- to provide a stable baseline for future phases that will extend enforcement to the UI layers

### 2. Enforced server/core coverage gate

CI must enforce `>=95%` for statements, branches, functions, and lines on an explicit phase-one allowlist. That allowlist should be declared in a clear, reviewable location so it can be expanded later without redesigning the policy.

This staged gate is the primary quality mechanism for phase one. It creates a real bar for the code we are actively improving without blocking progress on out-of-scope frontend areas.

## Scope

### In scope

- Coverage tooling and scripts
- Shared server test harness and reusable fixtures
- `src/server/**`, except generated or clearly out-of-phase areas
- Non-UI helper logic under `src/lib/**` that is worth direct testing
- Related fixture utilities under `e2e/fixtures/**` when they support server-side tests or stabilize coverage reporting

### Explicitly out of scope

- `src/routes/**`
- `src/components/**`
- `src/hooks/**`
- `src/db/schema/**`
- Generated files such as `src/routeTree.gen.ts`

### Schema policy

`src/db/schema/**` is excluded from the enforced phase-one threshold. These files are primarily declarative Drizzle schema definitions, and direct line coverage on them carries less value than tests that exercise the services and queries built on top of them.

Schema correctness should be validated indirectly through server/core tests that perform realistic reads, writes, joins, defaults, and setup flows.

## Initial Allowlist Strategy

The allowlist should start with the areas that are both high value and realistically testable in this phase:

- core server services under `src/server/**`
- existing download-client and indexer protocol modules already supported by unit tests
- non-UI helper modules under `src/lib/**` where logic is deterministic and isolated

Within that scope, the first implementation pass should prioritize the largest uncovered or weakly-covered logic surfaces rather than spreading effort evenly. Based on the current audit, the initial first-wave targets are:

- `src/server/auto-search.ts`
- `src/server/import.ts`
- `src/server/search.ts`
- `src/server/indexers.ts`
- `src/server/books.ts`
- `src/server/shows.ts`
- `src/server/file-import.ts`
- partially covered HTTP and download modules with low branch coverage

The allowlist does not need to include every eligible server/core file on day one. It should be large enough to create a meaningful enforced standard, while still being achievable within a single planned implementation effort.

## Test Architecture

Phase one should add a shared server test harness rather than continuing with isolated per-file setup patterns.

### Harness responsibilities

The harness should provide:

- deterministic setup and teardown
- shared helpers for environment shaping
- centralized mocking for external boundaries such as network, filesystem, auth/session context, and clock/time
- factories or builders for common entities and payloads
- utilities that clearly separate pure unit tests from service-level orchestration tests

### Test styles

Two test styles are needed:

1. Pure unit tests

These apply to parsers, formatters, mappers, validators, and similar deterministic helpers. The tests should be direct and fast, with broad branch coverage.

2. Service-level orchestration tests

These apply to modules that coordinate multiple boundaries, such as import, search, download, syncing, and similar flows. These tests should mock the external seams but keep the internal decision logic realistic. The objective is to cover branching behavior without standing up the browser or real external services.

### Testability seams

If a server/core module is difficult to test deterministically, the implementation may introduce a small seam or helper extraction. That is acceptable only when it directly improves testability for this phase. Avoid unrelated refactors.

## Tooling Design

### Coverage provider

Vitest coverage must be backed by a matching coverage provider version so `bun run test -- --coverage` works reliably in local development and CI.

### Test discovery

Vitest test discovery should be broadened so the repo can support the full range of expected test file shapes for this phase and the next one. The config should not artificially block `*.spec.ts` or other standard patterns the repo may adopt.

### Coverage commands

Phase one should provide two clear coverage commands:

- a full-repo informational coverage command
- an enforced phase-one coverage command for the allowlist

They may share config, but their intent must be obvious. Developers should not need to guess whether a coverage command is informational or gating.

### Threshold configuration

Thresholds must be explicit for all four categories:

- statements
- branches
- functions
- lines

The enforced phase-one gate must require `>=95%` for each category. Branch coverage is especially important because it prevents shallow smoke tests from creating false confidence.

## Failure Modes And Mitigations

### False confidence from partial reporting

Risk:
Coverage appears healthy because only imported files are counted.

Mitigation:
Turn on full-source informational coverage across the repo and keep it visible alongside the enforced allowlist report.

### False confidence from shallow tests

Risk:
Line coverage rises while branch coverage remains weak.

Mitigation:
Enforce branch coverage at the same `>=95%` threshold as the other categories.

### Brittle orchestration tests

Risk:
Tests fail intermittently because they depend on real time, filesystem state, network state, or uncontrolled environment values.

Mitigation:
Centralize those seams in the harness and prefer deterministic fixtures and mocks.

### Coverage policy drift

Risk:
Temporary exclusions or ambiguous allowlist rules become permanent and hide unfinished work.

Mitigation:
Keep the allowlist and exclusions explicit, short, and reviewable. Use staged expansion by adding new paths deliberately in future phases.

## Verification Requirements

Phase-one implementation is not complete until the following pass:

- `bun run test`
- `bun run typecheck`
- `bun run lint`
- the enforced phase-one coverage command proving `>=95%` in all four categories for the allowlist
- the informational full-repo coverage command producing a truthful whole-repo report

## Expected Outcome

After phase one:

- coverage reports are trustworthy
- the repo has a clear enforced standard for server/core code
- server/core test writing is faster because of shared harness infrastructure
- future phases can extend the allowlist into routes, hooks, and components without replacing the coverage model

## Deferred Work

The following work is intentionally deferred to later phases:

- frontend route coverage
- component rendering and interaction coverage
- hook coverage
- repo-wide hard `>=95%` enforcement

Those areas should be addressed in a separate spec and implementation plan once the phase-one server/core coverage model is in place.
