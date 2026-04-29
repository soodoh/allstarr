# Reliability and Code Quality Backlog

## Summary

This backlog ranks reliability and code-quality improvements for Allstarr. Items are based on repository evidence from server workflows, tests/CI, and operational runtime paths.

This audit pass removes items that have since been implemented (scheduler/job-run lifecycle invariants, tracked download import claims, unmapped mapping rollback verification, shared external request policy, and auto-search outcome accounting) and refreshes the remaining items against the current codebase.

## Ranking Rubric

- P0: Production-risk failure modes where data can become incorrect, jobs can become stuck, imports/downloads can transition incorrectly, or external failures can leave persistent bad state.
- P1: Recurring maintainability or test-confidence problems in active code paths.
- P2: Improvements to clarity, observability, local development, or CI quality where the current behavior is serviceable but fragile or expensive.
- P3: Longer-term cleanup or architectural follow-ups after higher-risk work is complete.

## Recommended First Tranche

1. Strengthen import and file-move atomicity.
2. Clarify SQLite transaction boundaries for mixed async and side-effecting workflows.
3. Split auto-search into planning, indexer search, and download dispatch boundaries.
4. Define import module phase boundaries.
5. Separate unmapped file mapping service boundaries.

## Backlog

### P0-1: Strengthen import and file-move atomicity

**Theme:** Runtime reliability
**Size:** L
**Risk:** high

**Problem:** Completed download import now records created-file side effects and cleans them up on several failure paths, but import still performs filesystem copies, hard links, chmods, old-file cleanup, history writes, file table inserts, and tracked download finalization across multiple steps. Filesystem side effects cannot be rolled back by SQLite, and the current code still interleaves file writes with database writes, so remaining partial-failure cases need an explicit apply/finalize model.

**Evidence:** `src/server/file-import.ts` copies or hard-links files in `importFile`, records created files through `createFileSideEffectRecorder`, imports episode and book pack files, removes old book files during upgrades, writes `history`, and marks tracked downloads imported or failed. `importCompletedDownload` now claims imports through `claimTrackedDownloadImport` and runs side-effect cleanup on thrown errors, but it still does not define a single database transaction/apply boundary for the import operation and filesystem work remains outside SQLite rollback. Tests in `src/server/file-import.test.ts` cover cleanup on chmod failures, finalization failures, old-file cleanup failures, and pack imports, but the workflow still spans non-atomic disk and SQLite side effects.

**Impact:** A crash, permission error, disk-full condition, or database failure during import can create orphaned files, missing history, deleted old files without a replacement row, or tracked downloads that need manual repair.

**Suggested implementation:** Introduce an import apply/finalize phase that stages file operations, performs related database writes in a clear transaction where possible, and makes compensating cleanup semantics explicit for every file operation that has already happened. Preserve the existing side-effect recorder, but make its boundaries part of a typed import plan so finalization failures, row cleanup failures, and old-file replacement cleanup have documented behavior. Add focused failure-injection tests for DB insert failure after copy, history write failure after file creation, row cleanup failure, old-file cleanup/recycle failure, and tracked-download finalization failure.

**Verification plan:** Run `bun run test -- src/server/file-import.test.ts src/server/download-manager.test.ts` plus `bun run typecheck`.

### P1-1: Clarify SQLite transaction boundaries for mixed async and side-effecting workflows

**Theme:** Runtime reliability
**Size:** M
**Risk:** medium

**Problem:** SQLite transaction usage is localized but not consistently documented for workflows that include async functions, external side effects, filesystem moves, or follow-up cleanup. Some code uses `db.transaction(async (tx) => ...)` for import plan application, while unmapped mapping now uses an explicit rollback executor around filesystem moves plus transaction callbacks. Download import still uses compensating side-effect cleanup without a transaction facade. Without clear boundaries, future changes can accidentally put long-running external work inside a transaction or move database writes outside the intended atomic section.

**Evidence:** `src/server/imports/apply.ts` runs `db.transaction(async (tx) => ...)` while looping through selected rows and calling async helper functions that currently perform database writes. `src/server/unmapped-files.ts` uses `executeMappingWithRollback` and `db.transaction((tx) => ...)` after moving files to managed destinations. `src/server/file-import.ts` performs multiple database writes and filesystem operations with side-effect cleanup but without a single transaction boundary. `src/server/indexers.ts`, `src/server/import.ts`, and other server modules also use `db.transaction(` in different styles, as shown by the runtime hotspot search. Tests exist for `src/server/imports/apply.test.ts`, `src/server/unmapped-files.test.ts`, and `src/server/file-import.test.ts`.

**Impact:** Transaction scope drift can cause lock contention, partial persistence, unclear rollback expectations, and future regressions when reliability fixes add new side effects to existing workflows.

**Suggested implementation:** Document and enforce a small set of transaction patterns: pure database apply transactions, filesystem-first transactions with compensating rollback, and external-call-before-transaction flows. Add a lightweight helper or naming convention for these boundaries and focused tests that fail if a workflow writes outside its intended transaction facade.

**Verification plan:** Run `bun run test -- src/server/imports/apply.test.ts src/server/unmapped-files.test.ts src/server/file-import.test.ts` plus `bun run typecheck`.

### P1-2: Split auto-search into planning, indexer search, and download dispatch boundaries

**Theme:** Code maintainability
**Size:** L
**Risk:** high

**Problem:** Auto-search coordinates wanted-item selection, profile evaluation, search query construction, indexer orchestration, custom-format scoring, pack fallback behavior, download-client resolution, tracked-download inserts, and history writes from one large service module. Some boundaries already exist, but `src/server/auto-search.ts` still owns planning, indexer calls, candidate selection, and side-effect dispatch for books, movies, episodes, seasons, authors, and shows.

**Evidence:** `src/server/auto-search.ts` is 3,069 lines and contains target loaders such as `getWantedBooks`, `getWantedMovies`, and `getWantedEpisodes`; orchestration functions such as `searchAndGrabForBook`, `searchAndGrabForMovie`, `searchAndGrabForEpisode`, `searchAndGrabForSeason`, and `runAutoSearch`; candidate scoring functions such as `findBestReleaseForProfile`; and grab helpers such as `grabRelease`, `grabReleaseForMovie`, and `grabReleaseForEpisode`. Smaller boundary modules already exist in `src/server/auto-search-indexer-search.ts`, `src/server/auto-search-download-dispatch.ts`, and `src/server/auto-search-outcomes.ts`, which shows the intended split is useful but still partial.

**Impact:** Search reliability fixes can cross unrelated concerns and become hard to review. A change to candidate planning can accidentally affect download dispatch, history writes, pack fallback, or per-media behavior, increasing regression risk in scheduled and manual search workflows.

**Suggested implementation:** Extract explicit auto-search phases: a planning/indexer input layer that produces typed search targets, an indexer-search orchestration boundary that returns releases plus failure metadata, a pure candidate-selection layer for profile and custom-format decisions, and a download-dispatch boundary for tracked-download and history side effects. Move tests toward these smaller units first, then keep `runAutoSearch` as a coordinator.

**Verification plan:** Run `bun run test -- src/server/auto-search.test.ts src/server/auto-search-indexer-search.test.ts src/server/auto-search-download-dispatch.test.ts` plus `bun run typecheck`.

### P1-3: Define import module phase boundaries

**Theme:** Code maintainability
**Size:** L
**Risk:** high

**Problem:** The Hardcover import and refresh module mixes external fetches, metadata filtering, author/book/edition normalization, monitor/profile decisions, database upserts, history events, and refresh deletion behavior. The current shape makes it hard to change one import phase without re-reading the whole module and proving that author import, author refresh, and book refresh still apply the same rules.

**Evidence:** `src/server/import.ts` is 2,285 lines. It contains shared helpers such as `filterEditionsByProfile`, `shouldSkipBook`, `deriveAuthorContributions`, `insertBookAuthors`, `syncBookAuthors`, and `ensureEditionProfileLinks`, plus large workflows including `importAuthorInternal`, `refreshAuthorInternal`, `refreshBookInternal`, and `autoSwitchEditionsForBook`. These workflows all touch books, editions, authors, metadata profiles, download profiles, and history in different combinations.

**Impact:** Import bugs are expensive because they can create or update many rows at once. Without clear phase boundaries, future changes to metadata-profile filtering, edition selection, monitor defaults, or refresh cleanup can diverge between import and refresh paths.

**Suggested implementation:** Split the module around import phases: fetch adapters, normalization/filtering, author/book/edition planning, profile-link planning, and database apply. Keep side-effecting database writes behind apply functions that accept a typed plan, and share the same planning helpers between `importAuthorInternal`, `refreshAuthorInternal`, and `refreshBookInternal`.

**Verification plan:** Run `bun run test -- src/server/__tests__/import.test.ts src/server/books.test.ts src/server/search.test.ts` plus `bun run typecheck`.

### P1-4: Separate unmapped file mapping service boundaries

**Theme:** Code maintainability
**Size:** L
**Risk:** high

**Problem:** Unmapped file mapping currently combines path inference, media probing, related-asset planning, filesystem moves, rollback execution, database inserts/deletes, library search, TV suggestions, and rescan entry points in one large server module. The rollback executor is already extracted and covered by tests, but the service boundary around mapping plans, asset planning, and per-media apply logic remains broad.

**Evidence:** `src/server/unmapped-files.ts` is 2,081 lines and includes path helpers such as `buildManagedTvEpisodePath`, `buildManagedMovieSidecarPath`, `resolveManagedRootFolder`, `buildImportAssetPlan`, and `normalizeImportRows`; server functions such as `mapUnmappedFileFn`, `previewUnmappedImportAssetsFn`, `suggestUnmappedTvMappingsFn`, `rescanAllRootFoldersFn`, `rescanRootFolderFn`, and `searchLibraryFn`; and separate book, movie, and episode branches inside `mapUnmappedFileFn`. `src/server/unmapped-file-mapping-executor.ts` already isolates rollback mechanics, but not mapping plan construction or per-media persistence.

**Impact:** Related-file and mapping changes can accidentally alter library search, rescan behavior, or another media type's persistence path. The larger the mapping function stays, the harder it is to test row-level partial failure, asset warnings, and rollback behavior without broad fixture setup.

**Suggested implementation:** Introduce a mapping service split into plan builders, asset planners, media-specific apply functions, and thin server-function adapters. Keep `executeMappingWithRollback` as the side-effect runner, but pass it typed book/movie/episode mapping plans with explicit destination paths, asset operations, probe metadata, and transaction callbacks.

**Verification plan:** Run `bun run test -- src/server/unmapped-files.test.ts src/server/unmapped-file-mapping-executor.test.ts src/server/import-assets.test.ts` plus `bun run typecheck`.

### P1-5: Extract route view-models from large route files

**Theme:** Code maintainability
**Size:** M
**Risk:** medium

**Problem:** Large route files combine loader configuration, query wiring, table state, filtering, sorting, infinite scroll, view-model construction, mutations, dialogs, and page rendering. The author detail route is the largest example and requires understanding both books and series workflows before making a small UI or data-shaping change.

**Evidence:** `src/routes/_authed/authors/$authorId.tsx` is 1,893 lines. It defines data types, `BooksTab`, series merge helpers such as `dedupeByPosition` and `filterPartialEditions`, `SeriesTab`, and `AuthorDetailPage` in the same file. `BooksTab` builds table rows from paginated query data and monitoring state, while `SeriesTab` merges local books with Hardcover series data, manages preview and edit dialogs, and handles monitor/unmonitor mutations.

**Impact:** Route-level changes are harder to review and test because rendering and data-shaping concerns are interleaved. Duplication between books and series tab state, search debouncing, unmonitor dialogs, and profile toggles can create inconsistent behavior when one path is fixed and the other is missed.

**Suggested implementation:** Extract route-local view-model helpers and hooks first, without changing rendered behavior. Move table row construction, author profile monitoring state, available-language derivation, and series merge logic into tested pure helpers or focused hooks. Then split `BooksTab` and `SeriesTab` into route-adjacent component files that consume those view-models.

**Verification plan:** Run `bun run test -- 'src/routes/_authed/authors/$authorId.browser.test.tsx' src/server/books.test.ts src/server/search.test.ts` plus `bun run typecheck`.

### P1-6: Create shared media/profile primitives where duplication creates risk

**Theme:** Code maintainability
**Size:** M
**Risk:** medium

**Problem:** Media and profile concepts are repeated across books, shows, search, unmapped mapping, route components, and shared UI. Some reusable pieces exist, but monitor/profile selection, content-type branching, quality/format display, and media-specific row shaping still appear in multiple places with local rules.

**Evidence:** The keyword audit shows repeated `book`, `movie`, `show`, `series`, `episode`, `author`, `profile`, `monitor`, `quality`, and `format` flows across `src/server/books.ts`, `src/server/shows.ts`, `src/server/search.ts`, `src/server/unmapped-files.ts`, `src/components/unmapped-files/mapping-dialog.tsx`, and author route code. Server examples include book profile mutations in `monitorBookProfileFn`, `unmonitorBookProfileFn`, `bulkMonitorBookProfileFn`, and show/episode profile mutations in `monitorShowProfileFn`, `monitorEpisodeProfileFn`, and their bulk variants. UI examples include `ProfileToggleIcons`, book table profile toggles, edition cards, release tables, and unmapped mapping rows.

**Impact:** A profile, quality, format, or media-type rule can drift between books, shows, movies, and unmapped imports. That creates subtle reliability risk: the UI may allow a state the server handles differently, or one media type may get a monitoring/format fix while another keeps the old behavior.

**Suggested implementation:** Identify shared primitives before refactoring behavior: media entity identifiers, content-type/profile compatibility, monitored-profile state, quality/format presentation data, and reusable mapping-row selection state. Centralize only rules that are already duplicated and keep media-specific policy explicit where behavior truly differs.

**Verification plan:** Run focused tests for touched primitives and call sites, including `bun run test -- src/server/books.test.ts src/server/shows.test.ts src/server/unmapped-files.test.ts` plus any affected browser tests, then `bun run typecheck`.

### P1-7: Add e2e flake diagnostics without increasing retries

**Theme:** Test and CI confidence
**Size:** M
**Risk:** low

**Problem:** E2E reliability depends on app startup, fake-service readiness, reset endpoints, SSE waits, fixture state, and single-worker Playwright execution. The current configuration retries once and captures trace only on retry, but setup, teardown, and fake-server wait loops do not emit enough structured timing or service-state context to explain intermittent failures quickly.

**Evidence:** `e2e/playwright.config.ts` sets `workers: 1`, `retries: 1`, `timeout: 60_000`, `trace: "on-first-retry"`, and failure screenshots. `e2e/fixtures/app.ts` waits for the spawned app server with a polling loop and resets app/fake-service state before each test. `e2e/fixtures/fake-servers/manager.ts` waits up to 50 attempts for each fake server's `/__state` endpoint, then seeds scenario state. `e2e/global-setup.ts` kills known port listeners, pushes the template database, and writes `.test-state.json`; `e2e/global-teardown.ts` removes that state and template database.

**Impact:** A failing GitHub Actions run can indicate that Playwright timed out, but still leave the next engineer guessing whether the root cause was app startup, a fake service, stale port cleanup, database setup, reset failure, or a real UI regression. That slows reliability work and can normalize rerunning CI instead of fixing flakes.

**Suggested implementation:** Add lightweight structured diagnostics around global setup, app startup, fake-service readiness, per-test reset, scenario seeding, and teardown. Include elapsed time, port, service name, scenario name, and failed endpoint in logs or test attachments. Keep retry count unchanged, and add a short e2e flake triage note that points engineers to traces, screenshots, fake-service readiness logs, and reset diagnostics.

**Verification plan:** Run `bun run test:e2e` and confirm normal output includes setup/readiness timing without excessive noise. Intentionally point one fake-service port to an unavailable listener in a local branch and confirm the failure identifies the service and endpoint before reverting the experiment.

### P1-8: Define targeted test ownership by layer

**Theme:** Test and CI confidence
**Size:** M
**Risk:** low
**Plan:** `docs/plans/2026-04-28-targeted-test-ownership.md`

**Problem:** The test suite has unit tests, Vitest browser tests, Playwright e2e tests, fake-server fixture tests, golden parity tests, and helper tests, but ownership by layer is implicit. Without a written boundary, new coverage can land in a slower or broader layer than needed, while integration-heavy behavior can be under-tested because it looks covered by lower-level unit tests.

**Evidence:** `vitest.config.ts` has a Node project for `src/**/*.test.{ts,tsx}`, `e2e/fixtures/**/*.test.ts`, and `e2e/helpers/**/*.test.ts`, plus a separate browser project for `src/**/*.browser.test.{ts,tsx}`. `.github/workflows/ci.yml` runs lint, typecheck, unit/component tests with coverage, e2e tests with coverage, merged coverage thresholds, and Docker verify in separate jobs. E2E helper files include `e2e/helpers/auth.ts`, `e2e/helpers/navigation.ts`, `e2e/helpers/sse.ts`, and `e2e/helpers/tasks.ts`.

**Impact:** Developers can spend CI time on e2e tests for behavior that belongs in fast unit or browser tests, or miss end-to-end coverage for workflows that depend on app startup, fake services, database setup, and browser interactions. That weakens confidence while making feedback slower.

**Suggested implementation:** Add a short testing ownership guide that maps behavior to the smallest useful layer: pure server rules and helpers in Node tests, DOM interaction and client state in browser tests, fake-server contracts and fixture loaders in fixture tests, and cross-service workflows in Playwright e2e. Include examples from existing helpers and require new high-risk workflow changes to name the layer that owns regression coverage.

**Verification plan:** Run `bun run test -- e2e/fixtures/fake-servers/manager.test.ts e2e/helpers/tasks.test.ts src/components/unmapped-files/mapping-dialog.browser.test.tsx`, then run `bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts` for a workflow-level smoke check after the ownership guide is added.

### P1-9: Improve coverage threshold signal quality

**Theme:** Test and CI confidence
**Size:** S
**Risk:** low
**Plan:** `docs/plans/2026-04-29-coverage-threshold-signal-quality.md`

**Problem:** Coverage is enforced in two places with different meanings, and the merged e2e threshold numbers are lower than the repository-wide testing guidance. This can make it unclear whether a coverage failure points to missing unit/browser coverage, missing e2e workflow coverage, or expected exclusions from generated and infrastructure code.

**Evidence:** `vitest.config.ts` uses `vitest-monocart-coverage/browser` and includes `src/**/*.{ts,tsx}` plus `e2e/fixtures/**/*.ts`, while excluding generated files, database schema, several library entry points, fixture files, and `src/test/**`. `scripts/merge-coverage.ts` merges `coverage/unit/raw` and `coverage/e2e/raw`, writes `coverage/merged`, and checks thresholds of 80 lines, 75 statements, 75 functions, and 45 branches. `.github/workflows/ci.yml` uploads unit raw coverage, downloads it in the e2e job, runs `bun run test:e2e:coverage`, then runs `bun run test:coverage:merged`.

**Impact:** Thresholds still prevent large coverage drops, but they may not clearly signal which layer lost confidence or whether exclusions are masking untested high-risk code. Engineers can spend time chasing aggregate percentages instead of adding the specific regression test that would have caught a real bug.

**Suggested implementation:** Document the intended role of unit/browser thresholds versus merged e2e thresholds, add coverage summary output that separates unit/browser and e2e contributions, and periodically audit exclusions for files that should now be testable. Do not lower thresholds; make failures more actionable by linking uncovered high-risk modules to the layer that should own them.

**Verification plan:** Run `bun run test:coverage:full` and confirm the output still checks merged thresholds while making it clear which raw inputs were merged and which threshold failed if coverage regresses.

### P1-10: Reduce CI dependency and browser install cost

**Theme:** Test and CI confidence
**Size:** M
**Risk:** low

**Problem:** CI installs dependencies separately in lint, typecheck, unit, and e2e jobs, and installs Playwright Chromium in both unit/component and e2e jobs. The job split is clear, but repeated dependency and browser setup increases cost and creates more network-dependent failure points.

**Evidence:** `.github/workflows/ci.yml` runs `bun install --frozen-lockfile` in the lint, typecheck, unit, and e2e jobs. The unit job installs Playwright Chromium before `bun run test:coverage` because Vitest browser tests use Chromium. The e2e job installs `ffmpeg`, installs Playwright Chromium again, downloads the unit coverage artifact, then runs e2e coverage and merged thresholds. The Docker verify job builds the image separately with Docker Buildx.

**Impact:** GitHub Actions runtime and failure surface grow with every job. Network slowness in package or browser downloads can block unrelated validation, and developers get slower feedback even when source changes only need lint/typecheck or fast tests.

**Suggested implementation:** Add Bun dependency caching and Playwright browser caching where supported, measure before/after job durations, and consider a shared setup pattern that keeps the current job isolation while avoiding repeated cold installs. Preserve the existing lint/typecheck/unit/e2e/Docker gates and artifact handoff.

**Verification plan:** Run the CI workflow on a branch and compare GitHub Actions job durations before and after caching. Confirm `bun install --frozen-lockfile`, unit/browser coverage, e2e coverage, merged coverage, and Docker verify still run as separate required checks.

### P1-11: Add golden fixture drift checks

**Theme:** Test and CI confidence
**Size:** M
**Risk:** low

**Problem:** Golden fixtures are central to fake-service realism, but the capture workflow intentionally mixes seeded state snapshots and captured response payloads. Without a drift check, checked-in scenario manifests, service state files, compose-live captures, and fake-server replay behavior can diverge quietly.

**Evidence:** `e2e/fixtures/golden/README.md` documents service state files under `services/<service>/<state>/state.json`, scenario manifests under `scenarios/<scenario>.json`, capture scripts, compose-live capture, secret scrubbing, and a known live-service limitation. `e2e/fixtures/fake-servers/manager.ts` loads `loadGoldenScenario` and `loadGoldenServiceState` to seed fake servers and apply scenario-specific replacements. `e2e/fixtures/fake-servers/compose-live-parity.test.ts`, `e2e/fixtures/golden/capture.test.ts`, and `e2e/fixtures/golden/compose-live.test.ts` already test parts of the fixture path.

**Impact:** E2E tests can pass against stale fake payloads even when service schemas or scenario expectations changed. A later fixture refresh may produce a large noisy diff, making it harder to identify meaningful upstream contract changes.

**Suggested implementation:** Add a fixture drift check that validates every scenario references existing service states, every checked-in service state conforms to the golden schema, compose-live parity covers expected services, and capture output is deterministic after secret scrubbing. Keep live capture opt-in; make the CI check operate only on checked-in deterministic fixtures.

**Verification plan:** Run `bun run test -- e2e/fixtures/golden/capture.test.ts e2e/fixtures/golden/compose-live.test.ts e2e/fixtures/fake-servers/compose-live-parity.test.ts e2e/fixtures/fake-servers/manager.test.ts` and confirm a deliberately broken scenario reference fails before reverting it.

### P1-12: Standardize browser and e2e helper consistency

**Theme:** Test and CI confidence
**Size:** S
**Risk:** low

**Problem:** Browser-mode component tests and Playwright e2e tests use separate helper ecosystems. That separation is appropriate, but shared concerns such as hydration waits, console-error trapping, query retry disabling, navigation waits, and task/SSE synchronization should follow consistent defaults so tests fail for application behavior rather than helper drift.

**Evidence:** `src/test/render.tsx` creates a QueryClient with query and mutation `retry: false` for component/browser tests. `src/test/browser-console.ts` provides browser console error trapping. `e2e/helpers/auth.ts` defines `waitForHydration`, authentication helpers, and form helpers; `e2e/helpers/navigation.ts` wraps navigation plus hydration; `e2e/helpers/sse.ts` captures server-sent events with `page.waitForFunction`; and `e2e/helpers/tasks.ts` resets task state and waits for task responses/events.

**Impact:** A workflow can behave differently across browser tests and e2e tests because one layer retries, waits, or ignores console failures differently than the other. That creates false confidence when a component test passes but the real browser workflow flakes, or when an e2e helper hides an issue a browser test would catch.

**Suggested implementation:** Document and test helper contracts for hydration, navigation, console errors, query retries, SSE waits, and task reset behavior. Add small helper-level tests where possible, and align default expectations across browser and e2e helpers without forcing them into one abstraction.

**Verification plan:** Run `bun run test -- e2e/helpers/tasks.test.ts e2e/fixtures/fake-servers/manager.test.ts src/hooks/sse-context.browser.test.tsx src/hooks/mutations/tasks.browser.test.ts`, then run `bun run test:e2e -- e2e/tests/07-download-lifecycle.spec.ts` to confirm helper changes preserve browser and e2e task/download behavior.

### P2-1: Add startup environment validation and status diagnostics

**Theme:** Operational quality
**Size:** M
**Risk:** medium

**Problem:** Container startup and system status expose only part of the runtime configuration picture. Startup runs migrations and launches the server without validating required secrets, placeholder tokens, URL shape, OIDC provider completeness beyond auth parsing, writable database directories, or whether optional integrations are intentionally disabled. The authenticated system status and API-compatible status endpoint report database path, SQLite version, runtime version, and Docker detection, but they do not surface startup validation results.

**Evidence:** `scripts/docker-entrypoint.sh` creates `/app/data`, runs `bun run db:migrate`, then starts `.output/server/index.mjs` with shell `echo` output. `Dockerfile` sets `DATABASE_URL=/app/data/sqlite.db` and `NODE_ENV=production`. `.env.example` includes placeholder values for `BETTER_AUTH_SECRET`, `HARDCOVER_TOKEN`, `TMDB_TOKEN`, VPN settings, and optional `OIDC_1_*` configuration. `src/lib/auth-config.ts` validates missing OIDC fields only while parsing configured providers. `src/server/system-info.ts` warns when `HARDCOVER_TOKEN` is missing and reports `databasePath`, `sqliteVersion`, `isDocker`, and uptime, while `src/routes/api/v1/system/status.ts` maps those values into an API status payload.

**Impact:** Operators can ship a container that starts but fails later in authentication, external search, metadata refresh, or OIDC login because startup did not make configuration health explicit. Support diagnostics also require checking logs, environment variables, and status responses separately.

**Suggested implementation:** Add a startup validation module that checks required production values, placeholder secrets/tokens, database directory readability/writability, `BETTER_AUTH_URL` parseability, OIDC provider completeness, and optional integration state. Persist or expose a sanitized validation summary through system health/status without leaking secrets, and make the entrypoint fail fast only for conditions that prevent the app from safely starting.

**Verification plan:** Run `bun run test -- src/lib/auth-config.test.ts src/server/system-info.test.ts src/server/system-status.test.ts src/routes/api/handlers.test.ts` plus `bun run typecheck`. Add container-level checks that start with placeholder and missing env values and confirm diagnostics are visible while secrets are redacted.

### P2-2: Harden backup and housekeeping safety controls

**Theme:** Operational quality
**Size:** M
**Risk:** medium

**Problem:** Backup and housekeeping are maintenance tasks with direct SQLite and filesystem side effects, but they do not currently expose enough safety checks around path handling, retention, lock behavior, free space, or destructive cleanup. Backup creates a backup directory next to `DATABASE_URL`, runs `VACUUM INTO` with an interpolated path, then deletes older matching backup files. Housekeeping deletes history older than 90 days and runs `PRAGMA optimize` without reporting database preconditions or optimization failures separately.

**Evidence:** `src/server/scheduler/tasks/backup.ts` derives `backupDir` from `process.env.DATABASE_URL || "data/sqlite.db"`, creates it recursively, builds a timestamped `allstarr_*.db` path, runs `sqlite.run(\`VACUUM INTO '${backupPath}'\`)`, and unlinks old backups after sorting. `src/server/scheduler/tasks/housekeeping.ts` deletes `history` rows older than 90 days and then runs `sqlite.run("PRAGMA optimize")`. `src/server/scheduler/index.ts` records task success/failure and logs only the final task message or thrown error.

**Impact:** A malformed database path, low disk space, SQLite lock, quoted backup path, or retention bug can turn routine maintenance into data-loss risk or silent operational drift. Operators may only learn that maintenance failed after checking the task page or logs.

**Suggested implementation:** Add path-safe backup creation using prepared SQLite APIs or strict path validation, preflight the database file and backup directory, check available disk space where possible, make retention deletion operate only on verified backup artifacts, and separate housekeeping deletion from SQLite optimization reporting. Include task result metadata for backup path, retained count, deleted count, elapsed time, and warnings.

**Verification plan:** Run `bun run test -- src/server/scheduler/tasks/backup.test.ts src/server/scheduler/tasks/housekeeping.test.ts src/server/scheduler/index.test.ts` plus `bun run typecheck`. Add failure-injection coverage for missing database files, unwritable backup directories, quoted paths, retention pruning, `VACUUM INTO` failure, and `PRAGMA optimize` failure.

### P2-3: Add Docker runtime smoke checks

**Theme:** Operational quality
**Size:** M
**Risk:** low

**Problem:** Docker build coverage can prove the image builds, but it does not necessarily prove the runtime container can migrate, create or write `/app/data`, start the Bun server, respond from the API status route, and include runtime dependencies such as ffmpeg/ffprobe. Compose includes health checks for Gluetun but no Allstarr service health check is visible in the inspected compose file.

**Evidence:** `Dockerfile` installs `ffmpeg`, copies Nitro output plus migrations, creates `/app/data`, sets `DATABASE_URL=/app/data/sqlite.db`, exposes port 3000, and uses `scripts/docker-entrypoint.sh`. The entrypoint runs `bun run db:migrate` before starting the app. `compose.yml` defines a Gluetun healthcheck and service dependencies on `service_healthy`, but the inspected services are download/indexer support containers rather than an Allstarr runtime healthcheck. `src/routes/api/v1/system/status.ts` provides an API-key-protected status response with production, Docker, SQLite, runtime, and URL fields.

**Impact:** A container can pass image build verification but fail only after deployment because migrations, filesystem permissions, runtime dependencies, env defaults, or status routing were not exercised in an actual running container.

**Suggested implementation:** Add a Docker smoke test that builds the image, starts it with a temporary writable data volume and test env, waits for startup, verifies migrations completed, checks `ffprobe -version` inside the container, and calls a lightweight health/status endpoint with the required API auth. If the current status endpoint is too privileged or auth-heavy for orchestrators, add a minimal readiness endpoint that does not leak operational details.

**Verification plan:** Run the existing Docker verification job plus a local smoke flow with an ephemeral localhost port and unconditional cleanup:

```bash
docker build -t allstarr-smoke .
set -a
. ./.env.smoke
set +a
docker run -d --rm --name allstarr-smoke -p 127.0.0.1::3000 --env-file .env.smoke allstarr-smoke
trap 'docker stop allstarr-smoke >/dev/null 2>&1 || true' EXIT
host_port="$(docker port allstarr-smoke 3000/tcp | sed 's/.*://')"
until curl -fsS -H "X-Api-Key: ${ALLSTARR_SMOKE_API_KEY:?set in .env.smoke and seeded by smoke setup}" "http://127.0.0.1:${host_port}/api/v1/system/status" >/dev/null; do sleep 1; done
docker exec allstarr-smoke ffprobe -version >/dev/null
```

In CI, confirm logs show migration completion, server readiness, and clean container shutdown.

### P2-4: Expose migration and SQLite pragma diagnostics

**Theme:** Operational quality
**Size:** M
**Risk:** medium

**Problem:** SQLite runtime setup applies important pragmas and migrations, but status diagnostics do not show the effective database mode, foreign key enforcement, migration state, busy timeout, or integrity check results. This makes it hard to debug lock contention, migration failures, or unexpected database behavior from the system page or status API.

**Evidence:** `scripts/docker-entrypoint.sh` runs `bun run db:migrate` with no structured output capture before starting the server. `drizzle.config.ts` uses `process.env.DATABASE_URL || "data/sqlite.db"`. `src/db/index.ts` opens Bun SQLite, sets `PRAGMA journal_mode = ${process.env.SQLITE_JOURNAL_MODE || "WAL"}`, enables `PRAGMA foreign_keys = ON`, creates cleanup triggers, and seeds auth settings. `src/server/system-info.ts` reports only `sqliteVersion`, `databasePath`, and `databaseSize` in the about payload. `src/routes/api/v1/system/status.ts` currently returns a hard-coded `migrationVersion: 1`.

**Impact:** Operators cannot quickly tell whether the container is running with WAL, whether foreign keys are enabled, whether migrations are current, or whether the database is writable and healthy. Debugging production database issues requires shell access and manual SQLite commands.

**Suggested implementation:** Add a sanitized database diagnostics function for effective `journal_mode`, `foreign_keys`, writable status, migration table/version state, `PRAGMA quick_check` or equivalent health signal, and relevant SQLite configuration such as busy timeout if configured. Surface concise diagnostics in authenticated system status and task output, and replace hard-coded migration metadata with real migration state where available.

**Verification plan:** Run `bun run test -- src/server/system-info.test.ts src/server/system-status.test.ts src/routes/api/handlers.test.ts` plus `bun run typecheck`. Add tests that mock pragma responses, missing migration metadata, read-only database errors, and quick-check failures without requiring a production database.

### P2-5: Standardize structured logging for background failures

**Theme:** Operational quality
**Size:** S
**Risk:** low

**Problem:** Background and operational logs are a mix of scoped logger helpers, raw console output, entrypoint `echo`, and task result strings. Scheduler failures are logged with task name and message, but maintenance task internals, startup migration output, direct database initialization warnings, and some API sync routes do not share a structured shape with task id, run id, duration, attempt, or sanitized context.

**Evidence:** `src/server/logger.ts` wraps `console.log`, `console.warn`, and `console.error` with a normalized scope string. `src/server/scheduler/index.ts` uses `logInfo("scheduler", ...)` and `logError("scheduler", ...)` around task completion/failure. `scripts/docker-entrypoint.sh` uses `echo` for startup and migration milestones. `src/db/index.ts` directly calls `console.warn` when root folder creation fails. The required grep also shows raw `console.info` calls in sync API routes and console-based coverage scripts.

**Impact:** When a scheduled task, startup migration, database initialization step, or background integration fails, logs may not carry enough consistent fields to correlate the failure with a job run, task id, container startup, or status-page symptom. That slows operational triage and makes log aggregation less useful.

**Suggested implementation:** Extend the logger with structured metadata support while preserving readable console output. Use it for scheduler task lifecycle events, backup/housekeeping warnings, startup validation and migration milestones, database initialization warnings, and background integration failures. Standardize fields such as `scope`, `event`, `taskId`, `jobRunId`, `durationMs`, `result`, and sanitized error details.

**Verification plan:** Run `bun run test -- src/server/logger.test.ts src/server/scheduler/index.test.ts src/server/scheduler/tasks/backup.test.ts src/server/scheduler/tasks/housekeeping.test.ts` plus `bun run typecheck`. Add assertions that errors include structured metadata without leaking secrets and that existing human-readable log output remains stable enough for local development.
