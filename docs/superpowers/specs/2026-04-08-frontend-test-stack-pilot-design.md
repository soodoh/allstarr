# Frontend Test Stack Pilot Design

## Goal

Establish a reusable frontend unit-test stack for this repo and prove it against a small hooks/shared-UI pilot slice. This phase is about infrastructure and pattern validation, not immediate repo-wide frontend coverage enforcement.

Success means:
- Vitest can run frontend tests under a browser-like environment.
- React Testing Library setup is centralized.
- The repo has one shared render helper pattern that can grow later.
- A small pilot slice demonstrates testing patterns for pure hooks, browser hooks, dependency-wired hooks, and simple shared UI.
- Existing server/core tests continue to run unchanged.

## Current Context

The repo now has a working staged server/core coverage gate and a truthful full-repo coverage report. Frontend coverage is still effectively absent.

Relevant current state:
- `vitest.config.ts` already discovers `*.test.ts`, `*.spec.ts`, `*.test.tsx`, and `*.spec.tsx`.
- Existing tests are overwhelmingly server-focused.
- `src/routes`, `src/components`, and `src/hooks` contain roughly 196 files combined and currently have no meaningful frontend unit-test pattern.

That means the next work should start with a test harness and a constrained pilot rather than trying to turn on a broad frontend gate immediately.

## Non-Goals

This pilot does not include:
- route-module tests under `src/routes/**`
- TanStack Router navigation tests
- auth-guarded route behavior
- full provider/router/app-shell scaffolding
- a hard frontend `>=95%` coverage gate
- a claim that repo-wide frontend files are ready for blanket rollout

## Recommended Approach

Use a reusable frontend harness with a hooks/shared-UI pilot.

Why this approach:
- It proves the stack on low-friction modules first.
- It avoids one-off per-file setup that would later need cleanup.
- It keeps the first phase additive and low-risk for the now-stable server/core test setup.
- It creates a clear pattern the later route/component rollout can reuse.

Alternatives considered:
- Minimal one-off harness: faster initially, but likely to create duplicated setup and rework.
- Near-final full app harness: stronger eventual coverage support, but too much upfront complexity before validating the smallest viable frontend stack.

## Test Stack Design

### Environment

Frontend tests should run in `jsdom` through Vitest. The stack should add the minimum browser simulation needed for component and hook tests while keeping server tests stable.

Planned libraries:
- `@testing-library/react`
- `@testing-library/user-event`
- `@testing-library/jest-dom`
- `jsdom`

### Shared Setup

Add one shared frontend test setup file, likely under `src/test/setup.ts`.

Responsibilities:
- import `@testing-library/jest-dom`
- install any shared cleanup hooks if needed
- initialize or shim browser APIs that are broadly useful for frontend tests
- keep setup light; avoid app-specific providers unless the pilot needs them

### Shared Render Helper

Add one shared render helper, likely under `src/test/render.tsx`.

Initial responsibility:
- export a thin wrapper around Testing Library `render`
- provide a single place where future wrappers can be added
- keep the first version minimal, with no router/auth/query scaffolding unless required by a pilot target

The render helper should be intentionally small now, but shaped so that later phases can add provider composition without rewriting all existing tests.

### Vitest Integration

Update Vitest config so frontend tests can opt into `jsdom` without destabilizing server tests.

The design requirement is:
- browser-style tests run in `jsdom`
- server tests keep working with their current assumptions
- the frontend setup file is only applied where appropriate

The preferred implementation direction is a targeted frontend config path rather than globally forcing every test into `jsdom`.

## Pilot Slice

The pilot should cover these concrete files:
- `src/hooks/use-debounce.ts`
- `src/hooks/use-mobile.ts`
- `src/hooks/use-view-mode.ts`
- `src/components/shared/empty-state.tsx`

### Why These Targets

`use-debounce.ts`
- validates timers, effect cleanup, and rerender-driven hook behavior
- low dependency complexity

`use-mobile.ts`
- validates browser API mocking (`matchMedia`, `innerWidth`)
- proves event-driven hook updates in `jsdom`

`use-view-mode.ts`
- validates a hook with lightweight dependency wiring
- proves the pattern for mocking React Query and mutation hooks without needing route tests yet

`empty-state.tsx`
- validates simple component rendering and conditional assertions
- gives the stack one component example without heavy provider overhead

## Pilot Test Expectations

### `use-debounce.ts`

Expected behavior to prove:
- initial value is returned immediately
- value updates only after the debounce delay
- previous timers are canceled when inputs change quickly
- rerenders respect delay changes

### `use-mobile.ts`

Expected behavior to prove:
- initial result reflects `window.innerWidth`
- the hook responds to media-query change events
- event listener setup/cleanup behaves correctly

### `use-view-mode.ts`

Expected behavior to prove:
- default view falls back correctly from `PAGE_VIEW_DEFAULTS`
- user settings override defaults when present
- setter calls the underlying mutation with the expected payload

The pilot should use mocks rather than a full real QueryClient/provider stack unless the hook shape forces it.

### `empty-state.tsx`

Expected behavior to prove:
- icon, title, and description render correctly
- optional action content renders only when provided

## Rollout Strategy After Pilot

If the pilot is successful, subsequent rollout should expand by test shape rather than by directory order.

Recommended order:
1. small standalone hooks
2. simple shared components
3. dependency-wired hooks and components
4. route-adjacent feature components
5. route modules and guarded screens

Rationale:
- this keeps harness growth demand-driven
- it avoids overbuilding router/auth/provider infrastructure before necessary
- it makes the later rollout mostly repetitive implementation rather than more infrastructure design

## Coverage Policy For Frontend Phase

This phase should mirror the server/core strategy in spirit:
- keep truthful full-repo coverage reporting
- do not enable a hard repo-wide frontend gate yet
- after the pilot succeeds, define an explicit frontend allowlist for staged enforcement

This avoids hiding the real baseline while also avoiding a fake promise that all frontend files are immediately ready for `>=95%` enforcement.

## Risks And Constraints

### Main Risk

Overbuilding the harness too early.

Mitigation:
- keep the first render helper minimal
- avoid router/auth/query provider scaffolding unless the pilot proves it is necessary

### Secondary Risk

Breaking stable server tests while introducing frontend config.

Mitigation:
- keep browser test configuration targeted
- verify existing `bun run test`, `bun run typecheck`, and `bun run lint` still pass after the pilot

### Constraint

The pilot should optimize for scale-out, not just local success. A test setup that only works for one hook but requires rewriting later is a failed pilot even if the first tests pass.

## Verification

Pilot verification should include:
- `bun run test`
- `bun run typecheck`
- `bun run lint`
- targeted frontend pilot test command
- `bun run test:coverage:all` to confirm the informational report still works

This phase does not require a hard frontend coverage gate yet.
