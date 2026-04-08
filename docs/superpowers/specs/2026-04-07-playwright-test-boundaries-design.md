# Playwright Test Boundaries Design

## Overview

Refocus the test strategy so Playwright covers user-visible happy paths and Vitest covers server-heavy logic. The current Playwright suite mixes UI verification with backend orchestration, scheduler behavior, provider protocol handling, and rule matrices. That makes the browser suite slower and more expensive than the confidence it adds.

This design keeps end-to-end confidence for critical flows while moving most server-dominant assertions into cheaper, narrower server tests.

## Goals

- keep one Playwright happy path for each critical user flow
- keep one Playwright happy path per provider implementation where the user flow meaningfully depends on that implementation
- migrate backend-heavy branches, edge cases, and rule matrices into Vitest
- keep real app-server-to-external-service integration seams where that realism is valuable
- reduce Playwright startup and per-test overhead by avoiding unnecessary fake services

## Non-Goals

- replacing backend-facing fake services with Playwright browser network mocks
- removing all fake HTTP peers from the test suite
- rewriting the full test suite in one pass without preserving critical end-to-end coverage
- broad refactors of unrelated test helpers or product behavior

## Current Problem

The current Playwright harness boots a broad fake-service environment up front and many tests assert server outcomes through a browser entry point. In this repo, important external calls are often made by the app server, not by the browser:

- Hardcover requests originate from server code in `src/server/hardcover/client.ts`
- indexer requests originate from server code in `src/server/indexers/http.ts`
- download-client requests originate from server adapters in `src/server/download-clients/*`

Because of that boundary, Playwright browser routing is not a replacement for the existing fake services. A pure `page.route()` approach would not intercept most of the traffic these tests are currently exercising.

The main issue is not that the fake services exist. The issue is that the suite uses browser tests for many cases whose real assertion is about server decisions, and the fixture pays setup/reset costs for services that an individual test does not need.

## Testing Boundary

### Rule

Use this decision rule for every existing or new test:

- keep a test in Playwright when the main assertion is that a user can successfully complete a visible flow in the UI
- move a test to Vitest when the main assertion is that the server made the correct decision

Examples that belong in Playwright:

- setup and authentication flows
- adding each download-client implementation through the settings UI
- adding each indexer implementation through the settings UI
- Hardcover search and import happy paths
- interactive search and grab happy paths
- queue interaction happy paths
- one complete download lifecycle happy path
- a representative disk scan happy path
- primary blocklist and unmapped-files user flows

Examples that belong in Vitest:

- provider adapter behavior and protocol handling
- cutoff and upgrade policy rules
- blocklist skip and retry policy
- indexer ordering and override resolution
- failure-handling orchestration
- import filtering rules
- health-check rule matrices
- filesystem classification and scan edge cases
- scheduler decision branches triggered by RSS sync or refresh jobs

### Playwright Coverage Shape

Playwright should retain a thin happy-path layer:

- one happy path per critical user flow
- one happy path per provider implementation when implementation differences matter to the user flow
- only a small number of representative non-happy-path UI cases where the purpose is to verify rendering, messaging, or interaction behavior

Playwright should stop being the default place for backend permutations within the same flow.

### Vitest Coverage Shape

Vitest becomes the primary home for:

- server orchestration logic
- provider adapter behavior
- scheduler and task logic
- import and scan rules
- decision matrices and regression cases

These tests should call server modules directly and assert DB effects, emitted events, filesystem effects, and external-client interactions without going through the browser unless the browser itself is the behavior under test.

## Fake Services And Mocking Strategy

### Playwright

Keep fake HTTP peers where the app server needs to talk to a realistic external service boundary during a UI happy path. This preserves confidence that the app server can perform the real request/response exchange for:

- Hardcover
- Newznab and Torznab style indexers
- qBittorrent
- Transmission
- Deluge
- rTorrent
- SABnzbd
- NZBGet
- Prowlarr-backed sync paths when needed by a retained Playwright flow

Do not replace these with Playwright browser network mocks unless the request actually originates from the browser.

### Vitest

Prefer the narrowest mocking boundary that still tests the intended code:

- orchestration tests should usually mock adapter boundaries
- adapter tests may use lightweight in-process HTTP fakes when protocol realism matters
- pure rule tests should avoid booting HTTP servers entirely

The goal is not “always fake a server” or “always mock modules.” The goal is to pick the smallest boundary that still exercises the logic under test.

## Playwright Harness Changes

### Demand-Driven Fake Services

The current harness starts all fake services during global setup and resets all of them before each test. Replace that with demand-driven setup:

- start only the fake services required by a spec or test file
- expose explicit fixtures or helpers for declaring which services are needed
- reset only the services that were started for that test context

This cuts runtime overhead without changing the test boundary.

### Shared Fixture Responsibilities

Keep the app-server fixture and test DB flow, but narrow fixture responsibilities:

- app fixture still owns the dev server process and test database wiring
- service fixture owns only the fake services actually requested
- test helpers should configure service state through a typed helper layer rather than raw ad hoc `fetch(.../__control)` calls everywhere

The helper layer does not need to be complex. Its purpose is to make service use explicit and reduce repetition.

## Migration Buckets

### Keep In Playwright

#### `e2e/tests/01-auth.spec.ts`

Keep almost entirely. These are direct user flows.

#### `e2e/tests/02-settings-config.spec.ts`

Keep:

- one happy path per download-client implementation
- one happy path per indexer implementation
- core create, edit, and delete flows where the UI interaction is the main behavior

Move:

- connection-failure permutations
- backend override-resolution branches
- provider-specific validation branches whose core assertion is server behavior

#### `e2e/tests/03-author-book-import.spec.ts`

Keep:

- Hardcover search happy path
- author preview and import happy path
- single-book import happy path
- representative profile-edit UI flow if it is user-critical

Move:

- metadata filtering logic
- import-rule matrices
- other cases whose main assertion is server-side import behavior

#### `e2e/tests/04-search-grab.spec.ts`

Keep:

- interactive search results rendering
- torrent grab happy path
- usenet grab happy path
- synced-indexer happy path if that flow is user-visible and important

Move:

- indexer priority ordering
- blocklist indication logic
- client-override resolution branches
- other selection-policy cases

#### `e2e/tests/05-queue-management.spec.ts`

Keep:

- queue display happy path
- SSE-connected happy path
- pause, resume, and remove happy paths
- mixed-client happy path if it meaningfully changes the UI

Move:

- warning/banner permutations
- command edge cases
- backend-only queue refresh logic

#### `e2e/tests/06-auto-search.spec.ts`

Keep:

- at most one end-to-end scheduled-task happy path, such as RSS sync successfully finding and grabbing a release

Move:

- cutoff behavior
- upgrade behavior
- blocklist skip behavior
- multiple-indexer behavior
- no-match and rejection-rule branches
- grouping and policy variants

#### `e2e/tests/07-download-lifecycle.spec.ts`

Keep:

- one complete happy path from tracked download to imported file
- SSE visibility if it is an important user-facing behavior

Move:

- naming-template variants
- hard-link versus copy behavior
- multi-file import edge cases
- lifecycle state permutations whose core assertion is server processing

#### `e2e/tests/08-disk-scan.spec.ts`

Keep:

- one scan happy path
- one representative rescan/update flow if it is user-visible and important

Move:

- format matching rules
- classification edge cases
- file-change permutations

#### `e2e/tests/09-system-health.spec.ts`

Keep:

- one healthy-state UI case
- at most one representative warning-rendering case

Move:

- the health-check rule matrix and environment permutations

#### `e2e/tests/10-blocklist-failure.spec.ts`

Keep:

- one user-visible failure-recovery happy path
- blocklist page CRUD flows

Move:

- repeated failure-policy branches
- auto-blocklist policy variants
- re-search orchestration branches
- removal-policy permutations

#### `e2e/tests/11-unmapped-files.spec.ts`

Keep:

- main ignore and unignore flow
- map-to-existing-item flow
- delete flow
- bulk action happy paths
- representative rescan-discovery flow if it is central to the feature

Move:

- rescan edge cases
- persistence edge cases
- filtering logic that is primarily data/rule behavior

## Migration Order

Implement the migration in stages so coverage does not drop abruptly:

1. define and document the Playwright boundary
2. identify retained Playwright happy paths for each spec file
3. add missing Vitest coverage before removing overlapping Playwright cases
4. slim the fake-service harness after the retained Playwright set is known
5. remove redundant Playwright cases and keep the suite green throughout

## Success Criteria

The migration is successful when all of the following are true:

- Playwright still covers the happy path of each critical user flow
- Playwright still covers one happy path per provider implementation where required
- server-heavy edge cases and rule matrices live primarily in Vitest
- Playwright no longer uses browser tests as the default harness for backend orchestration coverage
- fake-service startup and reset work are scoped to the services actually needed by retained Playwright tests
- runtime and CI overhead for the Playwright suite are measurably lower after the migration

## Risks And Mitigations

### Risk: accidental coverage loss during migration

Mitigation:

- migrate by bucket
- add Vitest coverage before removing overlapping Playwright tests
- keep one explicit retained happy path per flow and per required implementation

### Risk: over-mocking in Vitest reduces integration confidence

Mitigation:

- keep adapter-level tests close to the real protocol boundary
- use small in-process HTTP fakes for adapter tests when request/response realism matters
- reserve module mocks for higher-level orchestration tests

### Risk: Playwright fixture simplification becomes its own large refactor

Mitigation:

- keep the initial harness change focused on demand-driven startup and targeted reset
- avoid redesigning all helper APIs at once

## Out Of Scope

- changing product behavior
- replacing the app-server-based Playwright fixture with a different runtime model
- introducing browser-side network mocks as the main testing strategy for server-originated traffic
- broad test naming or directory reorganization unrelated to this boundary shift
