# Code Quality Audit Report

## Working Tree Context

- Branch: `improvements`
- Audit date: 2026-04-25
- Baseline notes: The audit execution changed only documentation under `docs/superpowers/reports/`. Dependencies were installed with `bun install` before plan execution so local commit hooks could resolve project-local tools. The full test suite was not green at audit time because two wrapper test files failed during import with a `bun:` protocol loader error; targeted workflow tests, lint, and typecheck are recorded below.

## Executive Summary

The codebase is generally healthy: workflow boundaries are often explicit, the main route/server/test paths have substantial coverage, and lint/typecheck are clean. The strongest areas are the protected-route boundary, import plan/apply separation, focused download-refresh integration tests, and reusable browser/e2e fixtures.

The most important quality pattern is that risk rises where orchestration code crosses external side effects, persistence, and UI contracts without one clear owner. That shows up in grab side effects after provider success, unmapped-file mapping rollback, oversized auto-search coordination, generic settings persistence, and a full-suite test-environment failure that weakens release confidence.

The recommended first target is the nontransactional post-provider grab path in `grabReleaseFn`. It is the best starting point because it has user-visible workflow risk, a small implementation surface, existing tests near the behavior, and a concrete outcome: after a provider accepts a download, tracked-download and history persistence should either succeed together or fail through a documented recoverable path.

## Verification

| Command | Result | Notes |
| --- | --- | --- |
| `bun run test -- src/server/dashboard.test.ts src/routes/_authed/index.browser.test.tsx` | PASS | 2 files passed, 6 tests passed. |
| `bun run test -- src/server/import.test.ts src/server/imports/plan.test.ts src/server/imports/apply.test.ts src/server/unmapped-files.test.ts src/routes/_authed/unmapped-files.browser.test.tsx src/components/unmapped-files/mapping-dialog.browser.test.tsx` | PASS | 5 files passed, 91 tests passed. Note: `src/server/import.test.ts` does not exist in this worktree; the matching import server test file is `src/server/__tests__/import.test.ts`, so this command did not run that file. |
| `bun run test -- src/server/__tests__/import.test.ts src/server/imports/plan.test.ts src/server/imports/apply.test.ts src/server/unmapped-files.test.ts src/routes/_authed/unmapped-files.browser.test.tsx src/components/unmapped-files/mapping-dialog.browser.test.tsx` | PASS | 6 files passed, 170 tests passed. This corrected the Task 3 plan-path mismatch and includes the actual import server test file. |
| `bun run test -- src/routes/api/v1/indexer/routes.test.ts src/routes/api/v1/indexer/schema.test.ts src/server/indexers.test.ts src/server/search.test.ts src/server/auto-search.test.ts src/server/download-manager.test.ts src/server/download-clients/registry.test.ts src/routes/_authed/settings/indexers.browser.test.tsx` | PASS | 7 files passed, 140 tests passed. Note: `src/server/indexers.test.ts` does not exist in this worktree; Vitest ignored that unmatched path, so this command did not run the indexer server tests. |
| `bun run test -- src/routes/api/v1/indexer/routes.test.ts src/routes/api/v1/indexer/schema.test.ts src/server/__tests__/indexers.test.ts src/server/search.test.ts src/server/auto-search.test.ts src/server/download-manager.test.ts src/server/download-clients/registry.test.ts src/routes/_authed/settings/indexers.browser.test.tsx` | PASS | 8 files passed, 231 tests passed. This corrected the Task 4 plan-path mismatch and includes the actual indexer server test file. |
| `bun run test -- src/routes/_authed/settings/routes.browser.test.tsx src/routes/_authed/settings/general.browser.test.tsx src/routes/_authed/settings/media-management.browser.test.tsx src/routes/_authed/settings/download-clients.browser.test.tsx src/routes/_authed/settings/profiles.browser.test.tsx src/routes/_authed/settings/formats.browser.test.tsx src/routes/_authed/settings/custom-formats.browser.test.tsx src/server/__tests__/settings-store.test.ts src/server/download-clients.test.ts src/server/download-profiles.test.ts` | PASS | 10 files passed, 78 tests passed. |
| `rg -n "beforeLoad\|redirect\|notFoundComponent\|context\\.session\|role\|requester\|location\\.href\|/requests\|/setup\|/login" src/routes src/components/layout src/server/middleware.ts src/server/setup.ts` | PASS | Completed for Task 6; results highlighted `_authed` auth/setup redirects, requester redirects, admin guards, sidebar role visibility, and related tests used in the auth findings. |
| `bun run test -- src/routes/_authed.browser.test.tsx src/routes/login.browser.test.tsx src/routes/register.browser.test.tsx src/routes/setup.browser.test.tsx src/routes/__root.test.tsx src/router.test.tsx` | PASS | 6 files passed, 25 tests passed. |
| `bun run lint` | PASS | `biome check .` checked 712 files. No fixes applied. |
| `bun run typecheck` | PASS | `tsc --noEmit` completed successfully. |
| `bun run test` | FAIL | 310 files passed, 2 files failed, 2,564 tests passed. Failed suites: `src/hooks/mutations/index.test.ts` and `src/lib/queries/wrappers.test.ts`. Both failed during import before running tests with `Error: Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. Received protocol 'bun:'`. This audit range is documentation-only, so this appears to be an existing test-environment/module-resolution issue rather than a failure introduced by the audit report. |

## Workflow Findings

### Dashboard And Library Browsing

#### Finding: No high-value finding in this workflow

- Category: Maintainability issue
- Evidence: `src/routes/_authed/index.tsx` prefetches dashboard content stats, quality breakdown, storage, recent activity, and system status in the route loader, then reads the same dashboard queries with `useSuspenseQuery` using only named `data` destructuring. `src/lib/queries/dashboard.ts` centralizes each dashboard query with explicit `queryKeys.dashboard.*` keys, and `src/server/dashboard.test.ts` covers auth-gated content stats, quality grouping, storage aggregation, and recent activity mapping. Context7 TanStack Query v5 guidance confirms suspense query data is defined, affected query keys should be invalidated after mutations, and object rest destructuring of query results should be avoided; no dashboard mutation or object rest query-result destructuring was observed in this workflow.
- Impact: User Impact Low, Maintenance Cost Low, Risk Low, Implementation Size Small.
- Recommendation: Keep dashboard query ownership centralized in `src/lib/queries/dashboard.ts` and add an invalidation assertion to the first dashboard-affecting mutation test introduced, verifying the affected `queryKeys.dashboard.*` key is invalidated on success.

### Imports And Unmapped Files

#### Finding: Unmapped-file mapping mixes filesystem side effects, database writes, and per-content orchestration

- Category: Boundary issue
- Evidence: `src/server/unmapped-files.ts` contains the related-asset planner helpers, filesystem move helpers, rollback helper, request normalization, and all TV/book/movie mapping branches in one server module. Primary file moves happen before the database transaction, then each branch manually records moved paths and rolls them back if the later DB transaction fails (`moveFileToManagedPath` / `movePathToManagedDestination` at `src/server/unmapped-files.ts:383` and `src/server/unmapped-files.ts:439`, rollback at `src/server/unmapped-files.ts:911`, TV transaction and rollback at `src/server/unmapped-files.ts:1130` and `src/server/unmapped-files.ts:1167`, book transaction and rollback at `src/server/unmapped-files.ts:1387` and `src/server/unmapped-files.ts:1423`, movie transaction and rollback at `src/server/unmapped-files.ts:1583` and `src/server/unmapped-files.ts:1623`). Tests do cover rollback paths for movie and TV transaction failures in `src/server/unmapped-files.test.ts`, but the implementation repeats the same move-plan/DB-write/cleanup pattern across content types.
- Impact: User Impact Medium, Maintenance Cost High, Risk Medium, Implementation Size Medium.
- Recommendation: Extract a small mapping execution boundary that accepts a content-specific destination/file-record plan, performs moves, runs a supplied DB transaction, and owns rollback/cleanup behavior. Keep the content-specific branches focused on resolving targets, metadata, and destination paths; keep filesystem semantics in one tested executor.

#### Finding: Mapping dialog duplicates backend import-payload rules in UI state

- Category: Maintainability issue
- Evidence: `src/components/unmapped-files/mapping-dialog.tsx` owns row search state, selected targets, touched flags, asset expansion, asset selection, row-level failures, saved defaults, profile selection, and backend payload construction in the same component (`src/components/unmapped-files/mapping-dialog.tsx:757` through `src/components/unmapped-files/mapping-dialog.tsx:1363`). The TV and non-TV submit handlers both map asset state into the same `"move" | "delete" | "ignore"` action rules before calling `mapUnmappedFileFn` (`src/components/unmapped-files/mapping-dialog.tsx:1229` and `src/components/unmapped-files/mapping-dialog.tsx:1307`). Browser tests cover important behavior: saved defaults and TV suggestions, submit-disabled while related assets load, row isolation, partial-success error handling, and deselected asset submission in `src/components/unmapped-files/mapping-dialog.browser.test.tsx`.
- Impact: User Impact Low, Maintenance Cost Medium, Risk Medium, Implementation Size Small.
- Recommendation: Move payload construction and asset-action derivation into a pure helper with unit coverage. That would let the dialog remain responsible for rendering and interaction state while the server contract stays represented in one tested place shared by TV and non-TV submissions.

#### Finding: Import plan/apply boundaries are clearer than the unmapped-file mapping boundary

- Category: Maintainability issue
- Evidence: Import planning is isolated in `src/server/imports/plan.ts`: it flattens normalized snapshots, assigns supported/unresolved/unsupported rows, preserves provenance skips, and sorts each plan section (`src/server/imports/plan.ts:374` through `src/server/imports/plan.ts:455`). Import application is separately responsible for sorting selected rows by dependency order, handling unsupported/unresolved rows as review items, writing provenance, and wrapping selected-row application in one transaction (`src/server/imports/apply.ts:478` through `src/server/imports/apply.ts:612`). Focused tests cover profile section separation, unsupported rows, provenance-based skips, unresolved library rows, transaction rollback, and resolved library provenance in `src/server/imports/plan.test.ts` and `src/server/imports/apply.test.ts`.
- Impact: User Impact Low, Maintenance Cost Low, Risk Low, Implementation Size Small.
- Recommendation: Use the import plan/apply split as the model for future unmapped-file refactoring: one layer should produce a deterministic plan, and one layer should execute that plan with transactional and filesystem rollback semantics.

### Indexers, Search, And Download Flow

#### Finding: Auto-search orchestration is oversized and duplicates search/grab behavior across content types

- Category: Duplication issue
- Evidence: `src/server/auto-search.ts` contains wanted-item discovery for books, movies, and episodes, query construction, indexer iteration, rate-limit waits, pack handling, release filtering, download-client resolution, tracked-download writes, and history writes in one module. The same synced/manual indexer iteration and error logging appears in a shared `searchIndexers` helper (`src/server/auto-search.ts:782` through `src/server/auto-search.ts:877`) and again inline for book search (`src/server/auto-search.ts:896` through `src/server/auto-search.ts:1010`), with separate movie and episode variants later in the same file. Download dispatch is also repeated for books, movies, and episodes (`src/server/auto-search.ts:2640`, `src/server/auto-search.ts:2805`, and `src/server/auto-search.ts:2882`). `runAutoSearch` coordinates books, then movies, then episodes with sleeps between groups (`src/server/auto-search.ts:2459` through `src/server/auto-search.ts:2518`), so one scheduler path owns several distinct behaviors.
- Impact: User Impact Medium, Maintenance Cost High, Risk Medium, Implementation Size Medium.
- Recommendation: Extract content-neutral orchestration boundaries: one indexer-search executor, one download-client resolution/dispatch helper, and one content-specific adapter for wanted-item discovery and history/tracked-download payloads. Keep pack and profile selection logic as pure helpers with focused tests.

#### Finding: Interactive search and download boundaries are clearer, but grab side effects are not transactional

- Category: Risk issue
- Evidence: `src/server/indexers.ts` has a clean interactive-search boundary: `searchAllIndexers` applies rate-limit gating, catches per-indexer failures into warnings, enriches releases, and `searchIndexersFn` escalates only when every configured indexer fails (`src/server/indexers.ts:807` through `src/server/indexers.ts:1010`). `grabReleaseFn` resolves explicit, indexer-level, or protocol fallback clients before calling the provider (`src/server/indexers.ts:1063` through `src/server/indexers.ts:1170`), then writes `trackedDownloads` and `history` separately after the external add succeeds (`src/server/indexers.ts:1200` through `src/server/indexers.ts:1238`). If the tracked-download insert succeeds and the history insert fails, or if the first insert fails after the provider accepted the download, the external client and database can diverge. Tests cover rate limiting, client fallback, tag combination, tracked-download creation, and the no-download-id branch (`src/server/__tests__/indexers.test.ts:956` through `src/server/__tests__/indexers.test.ts:1299`), but not compensating behavior for partial DB-write failure after `addDownload`.
- Impact: User Impact Medium, Maintenance Cost Medium, Risk High, Implementation Size Small.
- Recommendation: Wrap post-provider database writes in one transaction and define the failure contract for provider-success/database-failure cases. At minimum, add a regression test that simulates tracked-download or history insert failure after `addDownload` succeeds and documents whether the system should remove the client-side download, mark a recoverable state, or surface a retryable error.

#### Finding: Sync indexer API accepts external payloads without route-level validation

- Category: Boundary issue
- Evidence: The Readarr-compatible indexer API authenticates requests and validates path IDs, but `POST /api/v1/indexer` and `PUT /api/v1/indexer/$id` cast `request.json()` directly to `ReadarrIndexerResource` before passing it into `fromReadarrResource` (`src/routes/api/v1/indexer/index.ts:25` through `src/routes/api/v1/indexer/index.ts:42`, `src/routes/api/v1/indexer/$id.ts:68` through `src/routes/api/v1/indexer/$id.ts:81`). Route tests cover listing, creation, invalid IDs, not-found branches, update, and delete (`src/routes/api/v1/indexer/routes.test.ts:86` through `src/routes/api/v1/indexer/routes.test.ts:235`), but they do not cover malformed JSON, invalid implementations/protocols, missing required fields, or mapper failures becoming structured 400 responses.
- Impact: User Impact Medium, Maintenance Cost High, Risk Medium, Implementation Size Small.
- Recommendation: Add a schema parse step at the API boundary and return explicit 400 responses for invalid sync payloads. Keep mapper tests for valid Readarr-resource conversion, but make route tests assert malformed external requests never reach persistence.

#### Finding: Download refresh has a compact integration boundary with focused error handling

- Category: Maintainability issue
- Evidence: `src/server/download-manager.ts` is scoped to active tracked-download reconciliation: it groups active rows by client, resolves one provider per client, skips only the failing client when `getDownloads` throws, imports completed items, invokes failed-download handling on import failure or failed state, optionally removes imported downloads, and emits queue updates (`src/server/download-manager.ts:112` through `src/server/download-manager.ts:258`). `src/server/download-clients/registry.ts` keeps provider loading behind a server-runtime guard and explicit implementation switch, with registry tests covering browser-runtime rejection, all known implementations, and unknown implementations. `src/server/download-manager.test.ts` uses a fake in-memory DB and provider mocks to cover missing clients, disappeared downloads, queued-to-downloading transitions, completed imports, removal failures, provider fetch failures, import failures, failed-download-handler failures, and queue events.
- Impact: User Impact Low, Maintenance Cost Low, Risk Low, Implementation Size Small.
- Recommendation: Keep this boundary narrow. If refresh behavior expands, preserve the current fake-DB integration style and add table-driven cases around each new state transition before adding another scheduler responsibility.

#### Finding: Test coverage is broad but fixture complexity is becoming a maintenance risk

- Category: Test quality issue
- Evidence: The corrected Task 4 suite passed 8 files and 231 tests, including broad coverage for indexer scoring/search/grab paths and auto-search books, movies, episodes, packs, rate limits, and errors. The cost is high fixture complexity: `src/server/auto-search.test.ts` relies on long `selectAll` call-order switch statements for DB state in rate-limit and error tests (`src/server/auto-search.test.ts:877` through `src/server/auto-search.test.ts:1080`), while `src/server/__tests__/indexers.test.ts` uses chained `mockReturnValueOnce` sequences to model server-function DB flows and provider behavior (`src/server/__tests__/indexers.test.ts:787` through `src/server/__tests__/indexers.test.ts:1553`). These tests catch important regressions, but small query-order changes can break fixtures even when behavior remains correct.
- Impact: User Impact Low, Maintenance Cost High, Risk Medium, Implementation Size Medium.
- Recommendation: Introduce named fixture builders or a lightweight fake repository for indexer/search/download tests, similar to the fake DB shape used in `src/server/download-manager.test.ts`. Prefer assertions on resulting searched/grabbed/error states and provider calls over positional DB-call sequencing where possible.

### Settings And Configuration

#### Finding: Generic settings persistence stores typed UI values through string-oriented route code

- Category: Boundary issue
- Evidence: The settings API accepts any key/value pair via `updateSettingSchema` with `value: z.unknown()` and persists it with `JSON.stringify` in `upsertSettingValue` (`src/lib/validators.ts:156` through `src/lib/validators.ts:160`, `src/server/settings.ts:27` through `src/server/settings.ts:32`, `src/server/settings-store.ts:11` through `src/server/settings-store.ts:18`). However, `useUpdateSettings` types every entry as `{ key: string; value: string }` and loops through entries one server call at a time (`src/hooks/mutations/settings.ts:11` through `src/hooks/mutations/settings.ts:28`). Media-management and download-client settings convert booleans and numbers with `String(...)` before saving (`src/routes/_authed/settings/media-management.tsx:680` through `src/routes/_authed/settings/media-management.tsx:737`, `src/routes/_authed/settings/download-clients.tsx:63` through `src/routes/_authed/settings/download-clients.tsx:77`), while `getSettingsFn` returns parsed JSON primitives as `string | number | boolean | null` (`src/server/settings.ts:12` through `src/server/settings.ts:24`). Tests cover parser behavior and route save payloads, but the current contract lets a boolean setting round-trip as the string `"true"` when the UI used `String(true)` before persistence.
- Impact: User Impact Medium, Maintenance Cost High, Risk Medium, Implementation Size Small.
- Recommendation: Define a typed settings registry for known keys, including expected primitive type and validation/coercion. Update `useUpdateSettings` to accept typed values, submit a batch payload, and keep compatibility tests that assert boolean and numeric settings round-trip as booleans/numbers, not strings.

#### Finding: Settings forms repeat local form-state and validation scaffolding across large components

- Category: Maintainability issue
- Evidence: The settings component inventory found 10,795 lines under `src/components/settings`, with the largest form components at 889 lines for `download-profile-form.tsx`, 572 lines for `download-client-form.tsx`, 453 lines for `download-format-form.tsx`, and 268 lines for `custom-format-form.tsx`. Those forms all manage individual `useState` fields, an errors map, `validateForm`, and submit payload shaping locally: profile state spans name/root folder/upgrade/items/content type/language/CF score/move-dialog fields (`src/components/settings/download-profiles/download-profile-form.tsx:551` through `src/components/settings/download-profiles/download-profile-form.tsx:620`), download-client state and validation are local to the form (`src/components/settings/download-clients/download-client-form.tsx:322` through `src/components/settings/download-clients/download-client-form.tsx:419`), download-format uses custom hooks for field groups then validates on submit (`src/components/settings/download-formats/download-format-form.tsx:192` through `src/components/settings/download-formats/download-format-form.tsx:323`), and custom-format repeats the same content-type toggle, errors, validation, and submit flow (`src/components/settings/custom-formats/custom-format-form.tsx:94` through `src/components/settings/custom-formats/custom-format-form.tsx:143`). Browser tests are broad, but each new settings form must rediscover the same wiring conventions.
- Impact: User Impact Low, Maintenance Cost High, Risk Medium, Implementation Size Medium.
- Recommendation: Introduce a small settings-form helper or hook that owns schema validation, errors, default derivation, and submit normalization while preserving the existing UI components. Start with the common content-type checkbox group and `validateForm`/error rendering pattern shared by download formats and custom formats.

#### Finding: Route-level CRUD orchestration is consistent, but dialog and mutation lifecycle code is duplicated

- Category: Maintainability issue
- Evidence: Settings routes consistently gate admin pages with `requireAdminBeforeLoad` and preload required queries in loaders: general settings preload the settings map, media management preloads settings and profiles, download clients preload clients and settings, profiles preload profiles/custom formats/server cwd, formats preload formats and settings, and custom formats preload custom formats (`src/routes/_authed/settings/general.tsx:29` through `src/routes/_authed/settings/general.tsx:34`, `src/routes/_authed/settings/media-management.tsx:27` through `src/routes/_authed/settings/media-management.tsx:35`, `src/routes/_authed/settings/download-clients.tsx:31` through `src/routes/_authed/settings/download-clients.tsx:39`, `src/routes/_authed/settings/profiles.tsx:31` through `src/routes/_authed/settings/profiles.tsx:42`, `src/routes/_authed/settings/formats.tsx:33` through `src/routes/_authed/settings/formats.tsx:41`, `src/routes/_authed/settings/custom-formats.tsx:41` through `src/routes/_authed/settings/custom-formats.tsx:46`). The repeated cost is in per-route dialog/editing state and create/update/delete handlers: download clients manage implementation selection plus edit dialog state (`src/routes/_authed/settings/download-clients.tsx:80` through `src/routes/_authed/settings/download-clients.tsx:178`), profiles manage tab filtering and create/update dialog state (`src/routes/_authed/settings/profiles.tsx:54` through `src/routes/_authed/settings/profiles.tsx:126`), formats repeat search/tab/dialog/editing handlers (`src/routes/_authed/settings/formats.tsx:165` through `src/routes/_authed/settings/formats.tsx:218`), and custom formats repeat edit state plus import/export state (`src/routes/_authed/settings/custom-formats.tsx:78` through `src/routes/_authed/settings/custom-formats.tsx:208`).
- Impact: User Impact Low, Maintenance Cost Medium, Risk Low, Implementation Size Small.
- Recommendation: Keep route loaders as-is, but extract a narrow CRUD dialog controller for create/edit/close/reset behavior. It should not hide domain payload mapping; it should only remove repeated dialog lifecycle state and reduce the chance of stale editing records after close or mutation success.

#### Finding: Query invalidation is centralized for common mutations but has route-local exceptions

- Category: Maintainability issue
- Evidence: Download-client, download-profile, download-format, custom-format, and settings mutations mostly centralize success toasts and query invalidation in hooks (`src/hooks/mutations/download-clients.ts:15` through `src/hooks/mutations/download-clients.ts:57`, `src/hooks/mutations/download-profiles.ts:20` through `src/hooks/mutations/download-profiles.ts:112`, `src/hooks/mutations/custom-formats.ts:20` through `src/hooks/mutations/custom-formats.ts:131`, `src/hooks/mutations/settings.ts:17` through `src/hooks/mutations/settings.ts:57`). Two settings routes bypass that pattern for adjacent server calls: format defaults call `updateSettingFn` directly and invalidate `queryKeys.settings.all` in the route (`src/routes/_authed/settings/formats.tsx:153` through `src/routes/_authed/settings/formats.tsx:159`), and custom-format import/export calls server functions directly, owns toasts, and manually invalidates `queryKeys.customFormats.all` after import (`src/routes/_authed/settings/custom-formats.tsx:125` through `src/routes/_authed/settings/custom-formats.tsx:208`). The route tests assert the local invalidation path for format defaults (`src/routes/_authed/settings/formats.browser.test.tsx:383` through `src/routes/_authed/settings/formats.browser.test.tsx:385`), so the behavior is covered but split across conventions.
- Impact: User Impact Low, Maintenance Cost Medium, Risk Medium, Implementation Size Small.
- Recommendation: Move format-default updates and custom-format import/export into mutation hooks alongside the existing settings and custom-format hooks. Keep route tests focused on user interaction, and move invalidation/toast assertions to hook-level browser tests so cache behavior has one owner.

#### Finding: Server-side validation exists for durable entities, but generic settings keys lack per-key validation

- Category: Boundary issue
- Evidence: Durable settings entities use zod input validators at the server-function boundary: download clients parse create/update/test payloads before persistence or provider checks (`src/server/download-clients.ts:21` through `src/server/download-clients.ts:63`), download profiles parse create/update payloads and validate root folders exist (`src/server/download-profiles.ts:28` through `src/server/download-profiles.ts:63`), and validators define required profile fields, content-type enums, format constraints, and download-client port/implementation constraints (`src/lib/validators.ts:6` through `src/lib/validators.ts:149`, `src/lib/validators.ts:220` through `src/lib/validators.ts:260`). Generic settings updates only require a non-empty key and unknown value (`src/lib/validators.ts:156` through `src/lib/validators.ts:160`), while media-management validates only two book naming templates on the client (`src/routes/_authed/settings/media-management.tsx:302` through `src/routes/_authed/settings/media-management.tsx:320`, `src/routes/_authed/settings/media-management.tsx:837` through `src/routes/_authed/settings/media-management.tsx:844`). This leaves server-side acceptance of invalid chmod strings, negative cleanup values, unknown enum values, or misspelled setting keys to later consumers.
- Impact: User Impact Medium, Maintenance Cost Medium, Risk Medium, Implementation Size Medium.
- Recommendation: Add per-key schemas for settings namespaces before broad UI refactoring. Validate media-management numeric/enumerated fields and naming templates on the server, reject unknown keys, and add tests beside `src/server/__tests__/settings-store.test.ts` or `src/server/settings.test.ts` for invalid key/type/value cases.

#### Finding: Settings test setup gives broad browser coverage, but shared route mocks are oversized

- Category: Maintainability issue
- Evidence: The requested Task 5 suite passed 10 files and 78 tests, covering navigation, general settings, media management, download clients, profiles, formats, custom formats, settings-store persistence helpers, download-client server functions, and download-profile server functions. The settings route aggregator test uses one hoisted mock object that includes indexers, download clients, formats, profiles, custom formats, settings, import exclusions, mutation factories, query mocks, and component mocks before rendering multiple routes (`src/routes/_authed/settings/routes.browser.test.tsx:6` through `src/routes/_authed/settings/routes.browser.test.tsx:220`). Focused route tests such as `download-clients.browser.test.tsx`, `formats.browser.test.tsx`, and `media-management.browser.test.tsx` cover their domains more directly, but the aggregate mock makes route-organization coverage harder to maintain as settings modules grow.
- Impact: User Impact Low, Maintenance Cost Medium, Risk Low, Implementation Size Small.
- Recommendation: Keep the focused route and component browser tests as the primary coverage. Trim `routes.browser.test.tsx` toward navigation/route registration only, or split its mock setup into route-specific builders so adding a settings area does not require understanding unrelated settings fixtures.

### Auth, Setup, And Role-Gated Navigation

#### Finding: Protected route ownership follows TanStack Router auth-guard guidance

- Category: Maintainability issue
- Evidence: `src/routes/_authed.tsx` uses a pathless layout route as the protected boundary, checks setup state before session lookup, redirects unauthenticated users to `/login` with `search: { redirect: location.href }`, redirects requester users away from non-request pages, and returns `{ session }` for child route context (`src/routes/_authed.tsx:10` through `src/routes/_authed.tsx:36`). Context7 TanStack Router guidance recommends a pathless authenticated layout route with `beforeLoad`, redirecting unauthenticated users before protected route rendering, preserving `location.href`, and returning auth data through route context. The route context is then consumed by role helpers with `useRouteContext({ from: "/_authed" })` (`src/hooks/use-role.ts:3` through `src/hooks/use-role.ts:9`), and `AppLayout` is only mounted inside the authed route component (`src/routes/_authed.tsx:39` through `src/routes/_authed.tsx:48`, `src/components/layout/app-layout.tsx:11` through `src/components/layout/app-layout.tsx:27`). Browser tests assert setup redirection, login redirection with the requested href, requester redirection, successful session return, and layout/SSE rendering (`src/routes/_authed.browser.test.tsx:56` through `src/routes/_authed.browser.test.tsx:135`).
- Impact: User Impact Low, Maintenance Cost Low, Risk Low, Implementation Size Small.
- Recommendation: Keep `_authed` as the single owner for protected layout/session context. When adding new protected route groups, place them under `_authed` by default and prefer context-derived role checks over duplicate session fetches.

#### Finding: Login and OIDC success paths ignore the preserved redirect destination

- Category: Maintainability issue
- Evidence: `_authed.beforeLoad` preserves the originally requested destination in the login search params (`src/routes/_authed.tsx:18` through `src/routes/_authed.tsx:23`), but the login page does not read a `redirect` search param. Email sign-in always navigates to `/` on success (`src/routes/login.tsx:45` through `src/routes/login.tsx:54`), OIDC sign-in always uses `callbackURL: "/"` (`src/routes/login.tsx:62` through `src/routes/login.tsx:67`), and the browser test locks in home navigation after a successful email sign-in (`src/routes/login.browser.test.tsx:106` through `src/routes/login.browser.test.tsx:128`). This weakens the redirect-safety story: the guard preserves intent, but the post-login flow drops it instead of validating and consuming it.
- Impact: User Impact Medium, Maintenance Cost Low, Risk Low, Implementation Size Small.
- Recommendation: Add typed search validation for `/login`, consume a safe internal redirect target after successful email and OIDC sign-in, and reject absolute cross-origin or malformed redirect values. Update login browser tests to cover redirected sign-in, default `/` fallback, and unsafe redirect fallback.

#### Finding: Role-gated navigation and authorization checks are mostly consistent, with tests split across files

- Category: Maintainability issue
- Evidence: Requester access is enforced in the protected layout guard (`src/routes/_authed.tsx:26` through `src/routes/_authed.tsx:31`) and repeated on the dashboard index route (`src/routes/_authed/index.tsx:17` through `src/routes/_authed/index.tsx:23`). Admin settings routes use the shared `requireAdminBeforeLoad` helper, which redirects non-admin users to `/` (`src/lib/admin-route.ts:13` through `src/lib/admin-route.ts:17`), while server functions use `requireAdmin` to reject non-admin sessions (`src/server/middleware.ts:24` through `src/server/middleware.ts:43`). Sidebar visibility mirrors those rules by showing only `/requests` for requester users and hiding Settings for non-admin roles (`src/components/layout/app-sidebar.tsx:139` through `src/components/layout/app-sidebar.tsx:157`). The requested Task 6 suite passed 6 files and 25 tests, but it exercises route guards and auth/setup forms, not the sidebar role-visibility test or the admin-route helper tests; those live in separate files (`src/components/layout/app-sidebar.browser.test.tsx`, `src/lib/admin-route.test.ts`).
- Impact: User Impact Low, Maintenance Cost Medium, Risk Low, Implementation Size Small.
- Recommendation: Keep `requireAdminBeforeLoad`, `requireAdmin`, and `useUserRole` as the explicit policy boundaries, but add a small access-control smoke suite or include the existing sidebar/admin-route tests in auth workflow verification so route redirects, server authorization, and visible navigation are verified together.

#### Finding: Setup bootstrap redirects and first-user role hook are covered separately, but the route-to-auth integration is implicit

- Category: Maintainability issue
- Evidence: Public setup checks are consistently routed through `hasUsersFn`: `/login` and `/register` redirect to `/setup` when no users exist (`src/routes/login.tsx:25` through `src/routes/login.tsx:35`, `src/routes/register.tsx:25` through `src/routes/register.tsx:35`), while `/setup` redirects to `/login` once any user exists (`src/routes/setup.tsx:19` through `src/routes/setup.tsx:27`). Browser tests cover the no-users login/register redirects, registration-disabled state, setup redirect when users exist, setup success navigation, and setup error handling (`src/routes/register.browser.test.tsx:74` through `src/routes/register.browser.test.tsx:130`, `src/routes/setup.browser.test.tsx:44` through `src/routes/setup.browser.test.tsx:104`). The first-user admin assignment itself is already covered at the auth-server hook boundary: `src/lib/auth-server.test.ts` asserts that `databaseHooks.user.create.before` assigns `role: "admin"` when the user count is `0` (`src/lib/auth-server.test.ts:83` through `src/lib/auth-server.test.ts:92`). The remaining gap is that the setup route test mocks `signUp.email` and therefore proves only that the setup form calls the auth client and navigates home, not that the setup route's sign-up flow exercises the auth-server hook and lands the first user in an admin-capable state.
- Impact: User Impact Medium, Maintenance Cost Medium, Risk Medium, Implementation Size Small.
- Recommendation: Keep the existing auth-server hook unit coverage, and add a thin integration or browser-level bootstrap test that submits the setup route through the real sign-up path far enough to verify the created first user has admin-capable state. Keep the current route tests UI-focused, but avoid relying on a mocked `signUp.email` success and button text alone to establish setup-to-admin behavior.

## Cross-Cutting Test Quality

#### Finding: Shared browser render and e2e fixtures give broad reuse, but e2e setup cost is paid serially

- Category: Maintainability issue
- Evidence: Browser-mode tests share `renderWithProviders`, `renderHookWithProviders`, and `renderHook`, which consistently wrap components in React Query and tooltip providers with retries disabled (`src/test/render.tsx:11` through `src/test/render.tsx:70`). Vitest is split into node and Chromium browser projects, so `bun run test` exercises both `src/**/*.test.{ts,tsx}` and `src/**/*.browser.test.{ts,tsx}` in one command (`vitest.config.ts:10` through `vitest.config.ts:80`). E2E also has strong fixture reuse: one Playwright fixture starts fake servers, one app server, one worker database, temp directories, app-cache reset, and optional coverage collection (`e2e/fixtures/app.ts:71` through `e2e/fixtures/app.ts:183`). The speed tradeoff is explicit: Playwright e2e runs with `fullyParallel: false` and `workers: 1`, with global setup recreating a template DB via `bun run db:push` before tests (`e2e/playwright.config.ts:3` through `e2e/playwright.config.ts:9`, `e2e/global-setup.ts:33` through `e2e/global-setup.ts:80`).
- Impact: User Impact Low, Maintenance Cost Medium, Risk Low, Implementation Size Medium.
- Recommendation: Keep the shared render helper and e2e fixture model, but track e2e wall time before adding more workflow specs. If the suite becomes slow, split scenarios by independent fake-service sets and move toward multiple workers only after the DB/template and port-allocation fixtures can prove isolation.

#### Finding: Fixed waits remain in high-value e2e flows

- Category: Test quality issue
- Evidence: The brittle-pattern search found fixed sleeps in shared auth/session helpers and workflow specs: hydration retry sleeps in `fillInput`, a one-second delay before auth-state branching in `ensureAuthenticated`, SSE capture waiting by timeout, and post-task sleeps in download lifecycle, auto-search, disk-scan, and blocklist flows (`e2e/helpers/auth.ts:34` through `e2e/helpers/auth.ts:43`, `e2e/helpers/auth.ts:67` through `e2e/helpers/auth.ts:81`, `e2e/helpers/sse.ts:65`, `e2e/tests/07-download-lifecycle.spec.ts:48` through `e2e/tests/07-download-lifecycle.spec.ts:58`). These are in user-critical paths and add unavoidable time even when the app is already ready.
- Impact: User Impact Low, Maintenance Cost Medium, Risk Medium, Implementation Size Small.
- Recommendation: Replace fixed sleeps with observable readiness signals where possible: URL/session-state checks for auth, SSE event predicates for stream capture, and task-status or API-state polling for scheduled tasks. Keep short retry loops only when they assert a concrete condition.

#### Finding: Test readability varies where setup and assertions expose too much implementation detail

- Category: Maintainability issue
- Evidence: The helper inventory shows readable shared entry points for common browser rendering and e2e runtime setup (`src/test/render.tsx:50` through `src/test/render.tsx:70`, `e2e/fixtures/app.ts:71` through `e2e/fixtures/app.ts:160`), but the brittle-pattern search also found many tests with local `vi.mock`, `beforeEach`, `data-testid`, and `querySelector` usage. Representative browser tests mix behavior assertions with DOM traversal and selector mechanics, such as `AuthorTable` manually reading `tbody tr` order and hard-coded image/link selectors (`src/components/bookshelf/authors/author-table.browser.test.tsx:145` through `src/components/bookshelf/authors/author-table.browser.test.tsx:194`) and `EditionsTab` selecting cards and buttons by `data-testid` prefixes plus `button[type="button"]` (`src/components/bookshelf/books/editions-tab.browser.test.tsx:190` through `src/components/bookshelf/books/editions-tab.browser.test.tsx:213`). These tests still cover valuable behavior, but the reader must parse markup details before the user intent is clear.
- Impact: User Impact Low, Maintenance Cost Medium, Risk Low, Implementation Size Small.
- Recommendation: Preserve the existing shared helpers and add small domain-specific test builders or screen helpers for repeated route/component setups. New tests should make the user workflow obvious first, with raw selectors and mock wiring pushed behind named helpers when they are unavoidable.

#### Finding: Browser-mode coverage is broad, but some tests couple to DOM structure and test-only attributes

- Category: Test quality issue
- Evidence: Browser tests run in Chromium via Vitest browser mode (`vitest.config.ts:67` through `vitest.config.ts:79`) and cover routes, settings, hooks, UI primitives, and components. The cost is that some assertions depend on implementation markup instead of user-facing behavior: `AuthorTable` reads `tbody tr` order and hard-coded image/link selectors before clicking a raw table row (`src/components/bookshelf/authors/author-table.browser.test.tsx:145` through `src/components/bookshelf/authors/author-table.browser.test.tsx:194`), and `EditionsTab` locates cards and buttons with `data-testid` prefixes plus `button[type="button"]` selectors (`src/components/bookshelf/books/editions-tab.browser.test.tsx:190` through `src/components/bookshelf/books/editions-tab.browser.test.tsx:213`). The search also found widespread `data-testid`, `querySelector`, and mocked child components across route/component browser tests.
- Impact: User Impact Low, Maintenance Cost High, Risk Medium, Implementation Size Medium.
- Recommendation: Keep browser-mode tests for meaningful UI behavior, but prefer role/name/label queries and user-level assertions for new tests. Reserve `data-testid` and raw selectors for non-semantic internals such as generated icons or layout primitives, and add small page-object-style helpers only for repeated user workflows.

#### Finding: Golden service fixtures improve e2e realism, but fixture ownership needs guardrails

- Category: Maintainability issue
- Evidence: The e2e inventory shows checked-in fake-service servers for download clients, Servarr apps, Hardcover, TMDB, Newznab, and Bookshelf, plus named golden states and scenarios under `e2e/fixtures/golden/**`. The README documents capture/promote workflows and notes that checked-in payload content is intentionally representative for fixture diffs (`e2e/fixtures/golden/README.md:3` through `e2e/fixtures/golden/README.md:133`). Tests also cover golden capture helpers, fake-server manager behavior, and live-compose parity helpers, which reduces the chance that fixture infrastructure silently drifts (`e2e/fixtures/golden/capture.test.ts`, `e2e/fixtures/fake-servers/manager.test.ts`, `e2e/fixtures/fake-servers/compose-live-parity.test.ts`).
- Impact: User Impact Low, Maintenance Cost Low, Risk Low, Implementation Size Small.
- Recommendation: Keep golden fixtures as the integration-test source of truth for upstream service contracts. Require scenario updates to include focused fixture-helper test changes or README notes when a captured payload shape changes, so fixture churn remains reviewable.

#### Finding: Full suite verification currently fails before two wrapper test files execute

- Category: Test quality issue
- Evidence: `bun run lint` passed and `bun run typecheck` passed, but the requested full `bun run test` did not complete successfully. Vitest reported 310 passed files and 2,564 passed tests, then failed `src/hooks/mutations/index.test.ts` and `src/lib/queries/wrappers.test.ts` during suite import with `Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. Received protocol 'bun:'`. Because both failed suites had `0 test`, this appears to be a test-environment/module-resolution issue rather than an assertion failure in the tested behavior. This audit range is documentation-only, so the failure is not attributed to the Task 7 report change.
- Impact: User Impact Low, Maintenance Cost High, Risk High, Implementation Size Small.
- Recommendation: Fix the `bun:` protocol import path for the wrapper/index test environment before relying on full-suite green as the release gate. After the import failure is resolved, rerun `bun run test` and keep the Verification table updated with the actual failing test names if any assertions fail.

## Ranked Shortlist

Scoring key: User Impact, Risk, Maintenance Cost, and inverse Implementation Size are each scored High=3, Medium=2, Low=1; Implementation Size is inverted as Small=3, Medium=2, Large=1. `Score` is the sum of those four values. Ties are ordered by the Task 8 rules: higher Risk first, then higher User Impact, then higher Maintenance Cost, then smaller Implementation Size.

| Rank | Score | Finding | Category | User Impact | Maintenance Cost | Risk | Implementation Size | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 10 | Interactive search and download boundaries are clearer, but grab side effects are not transactional | Risk issue | Medium | Medium | High | Small | Wrap post-provider tracked-download and history writes in one transaction, and add a regression test for provider-success/database-failure behavior in `grabReleaseFn`. |
| 2 | 10 | Full suite verification currently fails before two wrapper test files execute | Test quality issue | Low | High | High | Small | Resolve the `bun:` protocol import failure for `src/hooks/mutations/index.test.ts` and `src/lib/queries/wrappers.test.ts`, then rerun `bun run test` to restore full-suite release-gate confidence. |
| 3 | 10 | Generic settings persistence stores typed UI values through string-oriented route code | Boundary issue | Medium | High | Medium | Small | Add a typed settings registry and update settings mutation tests so booleans and numbers round-trip as typed primitives instead of stringified UI values. |
| 4 | 10 | Sync indexer API accepts external payloads without route-level validation | Boundary issue | Medium | High | Medium | Small | Parse sync indexer create/update payloads at the route boundary and assert malformed external requests return structured 400 responses without reaching persistence. |
| 5 | 9 | Unmapped-file mapping mixes filesystem side effects, database writes, and per-content orchestration | Boundary issue | Medium | High | Medium | Medium | Extract a tested mapping executor that owns file moves, DB transaction execution, and rollback while leaving content-specific planning in the existing branches. |
| 6 | 9 | Auto-search orchestration is oversized and duplicates search/grab behavior across content types | Duplication issue | Medium | High | Medium | Medium | Extract a content-neutral indexer-search executor and download-dispatch helper with focused tests before changing scheduler behavior. |
| 7 | 8 | Server-side validation exists for durable entities, but generic settings keys lack per-key validation | Boundary issue | Medium | Medium | Medium | Medium | Add per-key settings schemas for media-management settings, reject unknown or invalid keys server-side, and cover invalid key/type/value cases in settings server tests. |
| 8 | 8 | Test coverage is broad but fixture complexity is becoming a maintenance risk | Test quality issue | Low | High | Medium | Medium | Introduce named fixture builders or a lightweight fake repository for indexer/search/download tests so assertions target behavior instead of DB call order. |
| 9 | 8 | Fixed waits remain in high-value e2e flows | Test quality issue | Low | Medium | Medium | Small | Replace fixed waits in auth/session, SSE, and scheduled-task flows with observable readiness predicates or polling helpers. |

## Fix Now

These items meet the Task 8 Fix Now criteria: User Impact High, Risk High, or Maintenance Cost High with Small/Medium implementation size. Rank 8 is included despite ranking below rank 7 because rank 8 has Maintenance Cost High and Medium size; rank 7 is tracked later because it is Medium across user impact, maintenance, risk, and size, and it depends on the typed settings registry work ranked above it.

- Interactive search and download boundaries are clearer, but grab side effects are not transactional.
- Full suite verification currently fails before two wrapper test files execute.
- Generic settings persistence stores typed UI values through string-oriented route code.
- Sync indexer API accepts external payloads without route-level validation.
- Unmapped-file mapping mixes filesystem side effects, database writes, and per-content orchestration.
- Auto-search orchestration is oversized and duplicates search/grab behavior across content types.
- Test coverage is broad but fixture complexity is becoming a maintenance risk.

## Track Later

- Server-side validation exists for durable entities, but generic settings keys lack per-key validation.
- Fixed waits remain in high-value e2e flows.

## Recommended First Implementation Target

### Target: Interactive search and download boundaries are clearer, but grab side effects are not transactional

- Why first: This target has the best risk-to-size ratio in the audit. The external provider can accept a download before local `trackedDownloads` and `history` writes complete, so a partial database failure can leave the user-facing queue, history, and external client out of sync. The owner files and existing tests are narrow enough to plan without a broad rewrite, and the fix can preserve the current search/download boundaries while tightening the persistence contract.
- Owner files: `src/server/indexers.ts`, `src/server/__tests__/indexers.test.ts`, `src/db/index.ts`, `src/db/schema/tracked-downloads.ts`, `src/db/schema/history.ts`
- Expected behavior after fix: When `grabReleaseFn` receives a successful provider `addDownload` response with a download ID, the tracked-download row and history row are persisted atomically; if either persistence step fails, the function follows one documented failure path and tests prove the database is not left half-updated.
- Minimum tests: `bun run test -- src/server/__tests__/indexers.test.ts`, with new or updated tests covering `grabReleaseFn` provider success followed by tracked-download insert failure, history insert failure, and the existing successful tracked-download/history creation path.
- Out of scope: Do not refactor auto-search orchestration, change release scoring, alter download-client provider selection, redesign tracked-download schema beyond what the transaction requires, or implement external client compensation unless the failure contract explicitly requires it.

## Risks And Open Questions

- The full `bun run test` gate is currently red because `src/hooks/mutations/index.test.ts` and `src/lib/queries/wrappers.test.ts` fail during import with a `bun:` protocol loader error. The audit is documentation-only, so this is treated as an existing test-environment/module-resolution issue, but it should be resolved before relying on full-suite verification.
- The recommended first target needs a precise failure contract for provider-success/database-failure behavior in `grabReleaseFn`: either atomic local persistence after provider success, a recoverable error state, or an explicit compensation path. The follow-up implementation plan should choose one before writing code.
- Several high-value findings are intentionally tracked after the first target because they touch broader workflow boundaries, especially auto-search orchestration and unmapped-file mapping execution. Those should be planned as separate follow-up specs rather than folded into the first fix.
- The audit used Context7 documentation for TanStack Router, TanStack Query, and Drizzle ORM as planning context, but no external Servarr parity review was performed. Servarr consistency should be evaluated separately if product parity becomes the primary goal.
