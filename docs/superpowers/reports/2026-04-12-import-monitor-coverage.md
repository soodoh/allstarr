# Import Monitor Coverage Report

Status: DONE

## Server evidence

| Area | Evidence | Status | Files | Notes |
| --- | --- | --- | --- | --- |
| Books | `monitorOption` / `monitorNewBooks` import matrix | lower-layer confirmed | `src/server/__tests__/import.test.ts`, `src/server/authors.test.ts` | Includes refresh-time propagation for newly discovered author books |
| Series | `monitorSeries` import behavior and series refresh | lower-layer confirmed | `src/server/series.test.ts` | Closed at server layer |
| Collections | Collection monitor and `searchOnAdd` branches | lower-layer confirmed | `src/server/movie-collections.test.ts` | Closed at server layer |
| TV | Show monitoring, new episodes, new seasons | lower-layer confirmed | `src/server/shows.test.ts` | Includes refresh-time profile propagation for newly discovered episodes |

## E2E evidence

| Area | Evidence | Status | Files | Notes |
| --- | --- | --- | --- | --- |
| Unmapped | Mapping moves files into canonical managed directories | E2E confirmed | `e2e/tests/11-unmapped-files.spec.ts` | Verifies DB path update plus source-file removal |
| Books | Editing an author to monitor new books changes the next RSS sync | E2E confirmed | `e2e/tests/12-monitor-discovery.spec.ts` | Verifies new book becomes wanted and is queued |
| Series | Refreshing a monitored series adds a newly discovered book to the wanted set | E2E confirmed | `e2e/tests/12-monitor-discovery.spec.ts` | Verifies new series book import and profile linkage |
| Collections | Refreshing monitored collections makes a newly discovered movie searchable | E2E confirmed | `e2e/tests/12-monitor-discovery.spec.ts` | Verifies TMDB refresh inserts the new movie |
| TV | Refreshing monitored shows picks up new-season episodes | E2E confirmed | `e2e/tests/12-monitor-discovery.spec.ts` | Verifies season 2 discovery and episode profile linkage |

## Harness notes

- `src/routes/api/__test-reset.ts` now clears the TMDB API cache so fake-server state changes are visible across Playwright tests.
- `e2e/fixtures/fake-servers/hardcover.ts` now routes `SeriesComplete` queries correctly and honors `seriesIds`.
