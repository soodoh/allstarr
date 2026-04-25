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
| `bun run test -- src/server/__tests__/import.test.ts src/server/imports/plan.test.ts src/server/imports/apply.test.ts src/server/unmapped-files.test.ts src/routes/_authed/unmapped-files.browser.test.tsx src/components/unmapped-files/mapping-dialog.browser.test.tsx` | PASS | 6 files passed, 170 tests passed. This corrected the Task 3 plan-path mismatch and includes the actual import server test file. |
| `bun run test -- src/routes/api/v1/indexer/routes.test.ts src/routes/api/v1/indexer/schema.test.ts src/server/indexers.test.ts src/server/search.test.ts src/server/auto-search.test.ts src/server/download-manager.test.ts src/server/download-clients/registry.test.ts src/routes/_authed/settings/indexers.browser.test.tsx` | PASS | 7 files passed, 140 tests passed. Note: `src/server/indexers.test.ts` does not exist in this worktree; Vitest ignored that unmatched path, so this command did not run the indexer server tests. |
| `bun run test -- src/routes/api/v1/indexer/routes.test.ts src/routes/api/v1/indexer/schema.test.ts src/server/__tests__/indexers.test.ts src/server/search.test.ts src/server/auto-search.test.ts src/server/download-manager.test.ts src/server/download-clients/registry.test.ts src/routes/_authed/settings/indexers.browser.test.tsx` | PASS | 8 files passed, 231 tests passed. This corrected the Task 4 plan-path mismatch and includes the actual indexer server test file. |
| `bun run test -- src/routes/_authed/settings/routes.browser.test.tsx src/routes/_authed/settings/general.browser.test.tsx src/routes/_authed/settings/media-management.browser.test.tsx src/routes/_authed/settings/download-clients.browser.test.tsx src/routes/_authed/settings/profiles.browser.test.tsx src/routes/_authed/settings/formats.browser.test.tsx src/routes/_authed/settings/custom-formats.browser.test.tsx src/server/__tests__/settings-store.test.ts src/server/download-clients.test.ts src/server/download-profiles.test.ts` | PASS | 10 files passed, 78 tests passed. |

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

#### Finding: Auto-search orchestration is oversized and duplicates search/grab behavior across content types

- Category: Maintainability issue
- Evidence: `src/server/auto-search.ts` contains wanted-item discovery for books, movies, and episodes, query construction, indexer iteration, rate-limit waits, pack handling, release filtering, download-client resolution, tracked-download writes, and history writes in one module. The same synced/manual indexer iteration and error logging appears in a shared `searchIndexers` helper (`src/server/auto-search.ts:782` through `src/server/auto-search.ts:877`) and again inline for book search (`src/server/auto-search.ts:896` through `src/server/auto-search.ts:1010`), with separate movie and episode variants later in the same file. Download dispatch is also repeated for books, movies, and episodes (`src/server/auto-search.ts:2640`, `src/server/auto-search.ts:2805`, and `src/server/auto-search.ts:2882`). `runAutoSearch` coordinates books, then movies, then episodes with sleeps between groups (`src/server/auto-search.ts:2459` through `src/server/auto-search.ts:2518`), so one scheduler path owns several distinct behaviors.
- Impact: User Impact Medium, Maintenance Cost High, Risk Medium, Implementation Size Medium.
- Recommendation: Extract content-neutral orchestration boundaries: one indexer-search executor, one download-client resolution/dispatch helper, and one content-specific adapter for wanted-item discovery and history/tracked-download payloads. Keep pack and profile selection logic as pure helpers with focused tests.

#### Finding: Interactive search and download boundaries are clearer, but grab side effects are not transactional

- Category: Maintainability issue
- Evidence: `src/server/indexers.ts` has a clean interactive-search boundary: `searchAllIndexers` applies rate-limit gating, catches per-indexer failures into warnings, enriches releases, and `searchIndexersFn` escalates only when every configured indexer fails (`src/server/indexers.ts:807` through `src/server/indexers.ts:1010`). `grabReleaseFn` resolves explicit, indexer-level, or protocol fallback clients before calling the provider (`src/server/indexers.ts:1063` through `src/server/indexers.ts:1170`), then writes `trackedDownloads` and `history` separately after the external add succeeds (`src/server/indexers.ts:1200` through `src/server/indexers.ts:1238`). If the tracked-download insert succeeds and the history insert fails, or if the first insert fails after the provider accepted the download, the external client and database can diverge. Tests cover rate limiting, client fallback, tag combination, tracked-download creation, and the no-download-id branch (`src/server/__tests__/indexers.test.ts:956` through `src/server/__tests__/indexers.test.ts:1299`), but not compensating behavior for partial DB-write failure after `addDownload`.
- Impact: User Impact Medium, Maintenance Cost Medium, Risk Medium, Implementation Size Small.
- Recommendation: Wrap post-provider database writes in one transaction and define the failure contract for provider-success/database-failure cases. At minimum, add a regression test that simulates tracked-download or history insert failure after `addDownload` succeeds and documents whether the system should remove the client-side download, mark a recoverable state, or surface a retryable error.

#### Finding: Sync indexer API accepts external payloads without route-level validation

- Category: Maintainability issue
- Evidence: The Readarr-compatible indexer API authenticates requests and validates path IDs, but `POST /api/v1/indexer` and `PUT /api/v1/indexer/$id` cast `request.json()` directly to `ReadarrIndexerResource` before passing it into `fromReadarrResource` (`src/routes/api/v1/indexer/index.ts:25` through `src/routes/api/v1/indexer/index.ts:42`, `src/routes/api/v1/indexer/$id.ts:68` through `src/routes/api/v1/indexer/$id.ts:81`). Route tests cover listing, creation, invalid IDs, not-found branches, update, and delete (`src/routes/api/v1/indexer/routes.test.ts:86` through `src/routes/api/v1/indexer/routes.test.ts:235`), but they do not cover malformed JSON, invalid implementations/protocols, missing required fields, or mapper failures becoming structured 400 responses.
- Impact: User Impact Medium, Maintenance Cost Medium, Risk Medium, Implementation Size Small.
- Recommendation: Add a schema parse step at the API boundary and return explicit 400 responses for invalid sync payloads. Keep mapper tests for valid Readarr-resource conversion, but make route tests assert malformed external requests never reach persistence.

#### Finding: Download refresh has a compact integration boundary with focused error handling

- Category: Positive finding
- Evidence: `src/server/download-manager.ts` is scoped to active tracked-download reconciliation: it groups active rows by client, resolves one provider per client, skips only the failing client when `getDownloads` throws, imports completed items, invokes failed-download handling on import failure or failed state, optionally removes imported downloads, and emits queue updates (`src/server/download-manager.ts:112` through `src/server/download-manager.ts:258`). `src/server/download-clients/registry.ts` keeps provider loading behind a server-runtime guard and explicit implementation switch, with registry tests covering browser-runtime rejection, all known implementations, and unknown implementations. `src/server/download-manager.test.ts` uses a fake in-memory DB and provider mocks to cover missing clients, disappeared downloads, queued-to-downloading transitions, completed imports, removal failures, provider fetch failures, import failures, failed-download-handler failures, and queue events.
- Impact: User Impact Low, Maintenance Cost Low, Risk Low, Implementation Size Small.
- Recommendation: Keep this boundary narrow. If refresh behavior expands, preserve the current fake-DB integration style and add table-driven cases around each new state transition before adding another scheduler responsibility.

#### Finding: Test coverage is broad but fixture complexity is becoming a maintenance risk

- Category: Maintainability issue
- Evidence: The corrected Task 4 suite passed 8 files and 231 tests, including broad coverage for indexer scoring/search/grab paths and auto-search books, movies, episodes, packs, rate limits, and errors. The cost is high fixture complexity: `src/server/auto-search.test.ts` relies on long `selectAll` call-order switch statements for DB state in rate-limit and error tests (`src/server/auto-search.test.ts:877` through `src/server/auto-search.test.ts:1080`), while `src/server/__tests__/indexers.test.ts` uses chained `mockReturnValueOnce` sequences to model server-function DB flows and provider behavior (`src/server/__tests__/indexers.test.ts:787` through `src/server/__tests__/indexers.test.ts:1553`). These tests catch important regressions, but small query-order changes can break fixtures even when behavior remains correct.
- Impact: User Impact Low, Maintenance Cost High, Risk Medium, Implementation Size Medium.
- Recommendation: Introduce named fixture builders or a lightweight fake repository for indexer/search/download tests, similar to the fake DB shape used in `src/server/download-manager.test.ts`. Prefer assertions on resulting searched/grabbed/error states and provider calls over positional DB-call sequencing where possible.

### Settings And Configuration

#### Finding: Generic settings persistence stores typed UI values through string-oriented route code

- Category: Maintainability issue
- Evidence: The settings API accepts any key/value pair via `updateSettingSchema` with `value: z.unknown()` and persists it with `JSON.stringify` in `upsertSettingValue` (`src/lib/validators.ts:156` through `src/lib/validators.ts:160`, `src/server/settings.ts:27` through `src/server/settings.ts:32`, `src/server/settings-store.ts:11` through `src/server/settings-store.ts:18`). However, `useUpdateSettings` types every entry as `{ key: string; value: string }` and loops through entries one server call at a time (`src/hooks/mutations/settings.ts:11` through `src/hooks/mutations/settings.ts:28`). Media-management and download-client settings convert booleans and numbers with `String(...)` before saving (`src/routes/_authed/settings/media-management.tsx:680` through `src/routes/_authed/settings/media-management.tsx:737`, `src/routes/_authed/settings/download-clients.tsx:63` through `src/routes/_authed/settings/download-clients.tsx:77`), while `getSettingsFn` returns parsed JSON primitives as `string | number | boolean | null` (`src/server/settings.ts:12` through `src/server/settings.ts:24`). Tests cover parser behavior and route save payloads, but the current contract lets a boolean setting round-trip as the string `"true"` when the UI used `String(true)` before persistence.
- Impact: User Impact Medium, Maintenance Cost Medium, Risk Medium, Implementation Size Small.
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

- Category: Maintainability issue
- Evidence: Durable settings entities use zod input validators at the server-function boundary: download clients parse create/update/test payloads before persistence or provider checks (`src/server/download-clients.ts:21` through `src/server/download-clients.ts:63`), download profiles parse create/update payloads and validate root folders exist (`src/server/download-profiles.ts:28` through `src/server/download-profiles.ts:63`), and validators define required profile fields, content-type enums, format constraints, and download-client port/implementation constraints (`src/lib/validators.ts:6` through `src/lib/validators.ts:149`, `src/lib/validators.ts:220` through `src/lib/validators.ts:260`). Generic settings updates only require a non-empty key and unknown value (`src/lib/validators.ts:156` through `src/lib/validators.ts:160`), while media-management validates only two book naming templates on the client (`src/routes/_authed/settings/media-management.tsx:302` through `src/routes/_authed/settings/media-management.tsx:320`, `src/routes/_authed/settings/media-management.tsx:837` through `src/routes/_authed/settings/media-management.tsx:844`). This leaves server-side acceptance of invalid chmod strings, negative cleanup values, unknown enum values, or misspelled setting keys to later consumers.
- Impact: User Impact Medium, Maintenance Cost Medium, Risk Medium, Implementation Size Medium.
- Recommendation: Add per-key schemas for settings namespaces before broad UI refactoring. Validate media-management numeric/enumerated fields and naming templates on the server, reject unknown keys, and add tests beside `src/server/__tests__/settings-store.test.ts` or `src/server/settings.test.ts` for invalid key/type/value cases.

#### Finding: Settings test setup gives broad browser coverage, but shared route mocks are oversized

- Category: Maintainability issue
- Evidence: The requested Task 5 suite passed 10 files and 78 tests, covering navigation, general settings, media management, download clients, profiles, formats, custom formats, settings-store persistence helpers, download-client server functions, and download-profile server functions. The settings route aggregator test uses one hoisted mock object that includes indexers, download clients, formats, profiles, custom formats, settings, import exclusions, mutation factories, query mocks, and component mocks before rendering multiple routes (`src/routes/_authed/settings/routes.browser.test.tsx:6` through `src/routes/_authed/settings/routes.browser.test.tsx:220`). Focused route tests such as `download-clients.browser.test.tsx`, `formats.browser.test.tsx`, and `media-management.browser.test.tsx` cover their domains more directly, but the aggregate mock makes route-organization coverage harder to maintain as settings modules grow.
- Impact: User Impact Low, Maintenance Cost Medium, Risk Low, Implementation Size Small.
- Recommendation: Keep the focused route and component browser tests as the primary coverage. Trim `routes.browser.test.tsx` toward navigation/route registration only, or split its mock setup into route-specific builders so adding a settings area does not require understanding unrelated settings fixtures.

### Auth, Setup, And Role-Gated Navigation

## Cross-Cutting Test Quality

## Ranked Shortlist

| Rank | Finding | Category | User Impact | Maintenance Cost | Risk | Implementation Size | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Fix Now

## Track Later

## Recommended First Implementation Target

## Risks And Open Questions
