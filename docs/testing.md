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

## Commands

```bash
bun run test -- e2e/fixtures/fake-servers/manager.test.ts e2e/helpers/tasks.test.ts src/components/unmapped-files/mapping-dialog.browser.test.tsx
bun run build && bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts
bun run typecheck
```
