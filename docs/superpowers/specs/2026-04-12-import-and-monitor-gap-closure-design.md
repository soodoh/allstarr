# Import And Monitor Gap Closure Design

## Goal

Produce a combined audit and gap-closure plan for:

- file import behavior
- unmapped-file handling
- monitor-driven discovery and auto-search behavior

The output of this work is not just a list of observations. It is a coverage matrix that says what is already proven, what is only proven below E2E, what is missing, and what appears to be a behavior defect rather than a test gap.

## Scope

This spec covers these user-facing scenarios:

- import behavior for completed downloads
- hardlink vs copy behavior, including hardlink fallback
- audiobook imports with multiple audio files
- unmapped-file mapping behavior, including relocation into the managed library path
- automatically fetching newly discovered content when monitoring is enabled
- monitor-setting permutations during initial import and later edits for authors, books, series, movie collections, movies, shows, seasons, and episodes

This spec does not require every permutation to be tested in Playwright. The target is a layered strategy with explicit responsibilities per test layer.

## Coverage Model

Each behavior in the audit is classified as one of:

- `E2E confirmed`
- `lower-layer confirmed`
- `missing test`
- `behavior gap`

The test layers have different jobs:

- `Playwright E2E` proves critical cross-system flows where UI wiring, scheduled tasks, downloader/indexer fakes, filesystem state, and DB state must all agree.
- `server tests` prove the option matrix and branch behavior cheaply and deterministically.
- `browser tests` prove edit-form and mutation wiring where the risk is front-end state and mutation payloads rather than cross-system orchestration.

## Current Evidence

### File Import And Unmapped Files

Current evidence already in the repo:

- `e2e/tests/07-download-lifecycle.spec.ts`
  - proves completed download import reaches the DB
  - proves same-filesystem hardlink behavior by inode equality
  - proves multi-file audiobook import assigns `part` and `partCount`
- `src/server/file-import.test.ts`
  - proves `linkSync -> copyFileSync` fallback when hard-linking fails
  - proves audiobook metadata probing
  - proves naming-template behavior
  - proves upgrade cleanup paths
  - proves episode-pack import handling
- `e2e/tests/11-unmapped-files.spec.ts`
  - proves basic unmapped-file UI flows such as ignore, delete, rescan, and mapping to an existing book
- `src/server/unmapped-files.test.ts`
  - proves metadata probing for mapped ebook, audiobook, movie, and episode files
  - proves multi-part audiobook part numbering for unmapped files

Important finding:

- `src/server/unmapped-files.ts` currently inserts mapped file records using the original `file.path`.
- The required behavior is to move mapped unmapped files into the canonical managed library path, so this is a behavior gap, not just a missing test.

### Monitor-Driven Discovery And Auto-Search

Current evidence already in the repo:

- `e2e/tests/06-auto-search.spec.ts`
  - proves monitored book/author setups can participate in RSS sync and grabbing
  - proves cutoff and upgrade decisions in one book flow
- `src/server/__tests__/import.test.ts`
  - proves author import monitor-option branching, including `monitorOption`, `monitorNewBooks`, and `monitorSeries`
- `src/server/authors.test.ts`
  - proves author edit mutations update `monitorNewBooks`
- `src/server/series.test.ts`
  - proves series updates and monitored-series refresh behavior, including import of newly linked books and profile propagation
- `src/server/movies.test.ts`
  - proves movie import monitor behavior, collection-monitor interaction, and `searchOnAdd`
- `src/server/movie-collections.test.ts`
  - proves collection edit behavior, monitor toggles, and `searchOnAdd`
- `src/server/shows.test.ts`
  - proves show monitoring flows, new episode and new season handling, and `searchOnAdd`
- `src/server/auto-search.test.ts`
  - proves wanted-item selection logic for books, movies, and episodes
- browser tests
  - `src/routes/_authed/authors/$authorId.browser.test.tsx` proves author edit wiring and monitor payloads
  - `src/routes/_authed/series/index.browser.test.tsx` proves series monitor/profile actions
  - `src/routes/_authed/movies/collections.browser.test.tsx` proves collection toggle/edit wiring
  - `src/routes/_authed/books/$bookId.browser.test.tsx` proves book-level monitor/unmonitor wiring

Important finding:

- The monitor-option matrix is covered well at the server layer, but the repo has limited E2E confirmation that newly discovered content actually becomes wanted and is auto-searched after metadata-refresh or monitoring-edit flows.

## Gap Matrix

| Area | Behavior | Current State | Notes | Planned Closure |
| --- | --- | --- | --- | --- |
| Import | Completed download imports into managed library | E2E confirmed | Covered in `07-download-lifecycle` | Keep |
| Import | Same-filesystem hardlink import | E2E confirmed | Inode assertion already exists | Keep |
| Import | Hardlink failure falls back to copy | lower-layer confirmed | Proven in `src/server/file-import.test.ts`; not explicitly higher-layer confirmed | Add one explicit integration-style proof if a stable hook exists; otherwise keep as server proof |
| Import | Real cross-volume fallback | missing test | No current Playwright proof; true multi-volume setup is brittle | Do not require literal multi-volume E2E by default; prove branch in server tests and optionally add test hook for forced hardlink failure |
| Import | Multi-file audiobook completed-download import | E2E confirmed | Covered in `07-download-lifecycle` | Keep |
| Import | Episode pack handling | lower-layer confirmed | Covered at server layer | Keep server coverage unless a regression suggests higher-layer need |
| Unmapped | Map existing unmapped file into book/movie/episode records | E2E confirmed in basic form | Mapping UI works, DB rows created | Keep |
| Unmapped | Mapping moves file into canonical managed directory | behavior gap | Current code reuses original path | Fix behavior, then add server + E2E assertions |
| Unmapped | Multi-part audiobook mapping from unmapped files | lower-layer confirmed | Covered in `src/server/unmapped-files.test.ts` | Add one E2E proof only if canonical relocation work touches this flow |
| Books | Monitored author/book participates in RSS sync | E2E confirmed in one path | Existing `06-auto-search` coverage | Keep |
| Books | `monitorOption` / `monitorNewBooks` import matrix | lower-layer confirmed | Strong server coverage | Keep server matrix |
| Books | Editing author monitoring changes downstream wanted/search behavior | missing test | Browser test covers payload only | Add one E2E flow after author edit |
| Series | `monitorSeries` import behavior and series refresh | lower-layer confirmed | Strong server coverage | Keep server matrix |
| Series | Monitored series causes newly discovered books to become wanted/searchable | missing test | No direct E2E proof | Add targeted E2E |
| Movies | Movie import with collection-monitor semantics | lower-layer confirmed | Covered in `movies.test.ts` | Keep server matrix |
| Collections | Collection edit/toggle wiring | lower-layer confirmed | UI mutation payloads covered in browser tests | Keep |
| Collections | Monitored collection causes newly discovered movies to become wanted/searchable | missing test | No direct E2E proof | Add targeted E2E |
| TV | Show monitoring, new episodes, new seasons | lower-layer confirmed | Strong server coverage in `shows.test.ts` | Keep server matrix |
| TV | Monitored show causes newly discovered episodes to become wanted/searchable | missing test | No direct E2E proof | Add targeted E2E |
| TV | New season episodes inherit desired monitoring/search behavior | missing test | Server logic covered; no E2E confirmation | Fold into targeted E2E for show refresh |

## Closure Strategy

### P0: Resolve Behavior Mismatches

1. Update unmapped-file mapping so the file lands in the canonical managed library path.
2. Choose and document the transfer semantics for this path:
   - move
   - hard link with fallback to copy
   - copy only
3. Remove or retain the source artifact according to the chosen semantics and assert that behavior explicitly.
4. Update DB assertions to point at the managed path.
5. Add tests that lock the intended relocation behavior in place.

Rationale:

- There is no value in adding tests that freeze the current wrong behavior.

### P1: Add High-Value Playwright Proofs

Add a small set of end-to-end tests that each prove a full cross-system chain:

1. `unmapped file -> map -> canonical managed path`
   - seed an unmapped file outside the final library path
   - map it through the UI
   - assert final disk location, DB path, and cleanup of the original location

2. `monitored series -> refresh -> newly discovered book becomes wanted/searchable`
   - start with an imported monitored series
   - simulate discovery of a new book in that series
   - run the relevant task or action
   - assert monitoring/profile linkage and downstream search or tracked-download creation

3. `monitored movie collection -> refresh -> newly discovered movie becomes wanted/searchable`
   - cover the collection case with a single end-to-end proof

4. `monitored show -> refresh -> new episode or new season episode becomes wanted/searchable`
   - one E2E should cover both a new episode and at least one new-season path if the fixture setup stays manageable

5. `author monitoring edit -> downstream wanted/search behavior`
   - update an existing author through the UI
   - prove the edit affects the next discovery/search cycle, not just the mutation payload

These tests should be narrow and data-driven. The goal is one proof per high-risk chain, not a Playwright permutation matrix.

### P2: Complete Lower-Layer Matrix Coverage

Keep most permutations below E2E and extend them where needed:

- `src/server/__tests__/import.test.ts`
  - fill any missing `monitorOption` edge cases for author import
- `src/server/authors.test.ts`
  - extend edit cases if any monitor-setting permutations are not represented
- `src/server/series.test.ts`
  - confirm monitored series refresh behavior for newly discovered books under all supported monitoring modes
- `src/server/movies.test.ts` and `src/server/movie-collections.test.ts`
  - ensure collection-monitor permutations and `searchOnAdd` branches are fully represented
- `src/server/shows.test.ts`
  - ensure new-episode and new-season branches are explicit for monitored and unmonitored states
- browser tests
  - add only where edit forms or toggles currently lack payload coverage

## Implementation Shape

The implementation plan that follows this spec should be split into two tracks:

### Track 1: Audit And Matrix

- build the final behavior-by-behavior coverage table in the spec or implementation notes
- confirm each row against actual test files
- mark rows as owned by `Playwright`, `server`, or `browser`

### Track 2: Gap Closure

- fix behavior gaps first
- add P1 Playwright proofs
- add P2 lower-layer tests to close the remaining matrix
- re-run the relevant targeted suites after each cluster of changes

## Acceptance Criteria

The subsystem is sufficiently tested only when all of the following are true:

1. Every critical cross-system flow has at least one Playwright proof.
2. Every supported monitoring branch is covered by server or browser tests.
3. No row in the coverage matrix remains in `missing test` for the scenarios requested in this spec.
4. No row classified as `behavior gap` remains unresolved.
5. The final audit makes it obvious which layer owns proof for each behavior.

## Recommended Verification Set

At minimum, the implementation work should verify with these targeted suites:

- `bun run test -- src/server/file-import.test.ts src/server/unmapped-files.test.ts`
- `bun run test -- src/server/__tests__/import.test.ts src/server/authors.test.ts src/server/series.test.ts src/server/movies.test.ts src/server/movie-collections.test.ts src/server/shows.test.ts src/server/auto-search.test.ts`
- targeted browser tests for edited routes
- targeted Playwright specs for the new P1 flows

## Baseline Verified During Spec Work

In the isolated worktree for this spec, the following baseline verification passed before writing the document:

- `bun run test -- src/server/file-import.test.ts src/server/unmapped-files.test.ts src/server/__tests__/import.test.ts src/server/movie-collections.test.ts src/server/shows.test.ts src/server/movies.test.ts src/server/series.test.ts src/server/authors.test.ts`
- result: `8 passed, 341 tests passed`
