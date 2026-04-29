# Testing Ownership Guide

Use the smallest test layer that can prove the behavior. Prefer fast, deterministic tests for rules and data shaping; reserve Playwright e2e for workflows that require a running app, fake services, database setup, and real browser navigation.

## Layer ownership

| Layer | File pattern | Owns | Avoid using it for |
| --- | --- | --- | --- |
| Node unit tests | `src/**/*.test.ts`, `src/**/*.test.tsx` | Pure server rules, database-adjacent helpers with test DB setup, scheduler/task helpers, API/client parsers, fake-server loader contracts | DOM rendering, browser-only APIs, full cross-service workflows |
| Fixture/helper tests | `e2e/fixtures/**/*.test.ts`, `e2e/helpers/**/*.test.ts` | Fake-service manager behavior, golden fixture loading, app runtime helpers, e2e synchronization helpers | Product UI behavior that should be visible to users |
| Browser component tests | `src/**/*.browser.test.tsx` | DOM rendering, React state, hooks, TanStack Query behavior, form interactions, console-error expectations | Service orchestration, app startup, fake-server readiness, multi-page workflows |
| Playwright e2e tests | `e2e/tests/**/*.spec.ts` | Cross-service workflows that require the built app, authentication, routing, SQLite state, fake download/indexer/metadata services, and SSE/task synchronization | Pure business rules or component states that can be tested faster elsewhere |

## Decision checklist

1. Can the behavior be proven with a pure function or focused server helper? Use a Node unit test.
2. Is the behavior about a fake server, golden fixture, app runtime helper, or e2e wait helper? Use a fixture/helper test.
3. Does the behavior require React rendering, user events, browser APIs, or client cache state but not a full app server? Use a browser component test.
4. Does the behavior require app startup, auth, routing, SQLite persistence, fake external services, task/SSE synchronization, or multiple pages? Use Playwright e2e.
5. For high-risk workflows, combine layers: unit-test the rules, browser-test the interaction, and add one e2e smoke/regression for the full path.

## Existing examples

- Server rules and persistence helpers: `src/server/books.test.ts`, `src/server/shows.test.ts`, `src/server/unmapped-files.test.ts`.
- Fake-service and helper contracts: `e2e/fixtures/fake-servers/manager.test.ts`, `e2e/helpers/tasks.test.ts`.
- Browser UI behavior: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`, `src/hooks/sse-context.browser.test.tsx`.
- Workflow coverage: `e2e/tests/07-download-lifecycle.spec.ts`, `e2e/tests/11-unmapped-files.spec.ts`.

## Coverage expectations for reliability changes

- Name the owning layer in the PR description for every high-risk reliability change.
- Prefer adding one narrow regression test at the layer where the bug originates before adding broad e2e coverage.
- Do not increase Playwright retries to hide flakes; add diagnostics or smaller-layer coverage instead.
- Do not lower coverage thresholds. If a threshold failure is noisy, improve the signal or add targeted coverage.

## Coverage threshold signals

Coverage has two complementary gates:

- `bun run test:coverage` runs the Vitest Node and browser projects with Monocart instrumentation. Treat failures here as missing unit/browser/helper coverage for source files included by `vitest.config.ts`.
- `bun run test:coverage:merged` merges `coverage/unit/raw` and `coverage/e2e/raw`, then checks the merged e2e-aware thresholds. Treat failures here as a workflow coverage signal: first confirm both raw input directories are present and non-empty, then add the smallest useful regression test at the owning layer.

The merged threshold numbers are intentionally lower than the unit/browser guidance because they combine different raw inputs and include e2e instrumentation limits. Do not lower either gate to fix noise. If the signal is confusing, improve diagnostics or revisit exclusions.

When a coverage failure occurs in CI:

1. Check whether the failed command was `test:coverage` or `test:coverage:merged`.
2. For merged failures, read the `Coverage inputs` lines to confirm unit/browser and e2e raw reports were both merged.
3. Use the uncovered file and `Layer ownership` table above to choose the smallest test layer that proves the missing behavior.
4. Audit exclusions in `vitest.config.ts` only when a source file is permanently untestable at that layer; do not exclude high-risk code just to restore percentages.

## E2E flake diagnostics

Playwright e2e runs emit `[e2e]` diagnostic lines for global setup, app startup, fake-service readiness, per-test reset, scenario seeding, and teardown. When a test fails, inspect diagnostics in this order:

1. Check the Playwright trace and failure screenshot.
2. Check the `e2e-diagnostics` attachment for the failed test.
3. Look for `[e2e] status=error` lines and note `scope`, `event`, `elapsedMs`, `service`, `endpoint`, and `attempts`.
4. If startup failed, inspect app stdout/stderr snippets in the thrown error.
5. If fake-service readiness failed, verify the service name, port, and `/__state` endpoint from the diagnostic line.
6. If reset failed, treat it as fixture contamination until proven otherwise; do not increase retries before identifying why reset failed.

Retries stay at one retry. Add targeted diagnostics or fix the underlying wait/reset condition instead of raising retry count.

## Commands

```bash
bun run test -- e2e/fixtures/fake-servers/manager.test.ts e2e/helpers/tasks.test.ts src/components/unmapped-files/mapping-dialog.browser.test.tsx
bun run build && bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts
bun run typecheck
```
