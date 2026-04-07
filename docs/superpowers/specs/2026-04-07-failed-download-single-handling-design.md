# Failed Download Single-Handling Design

## Overview

Prevent `refreshDownloads()` from running failed-download handling twice for the same tracked download when:

1. `importCompletedDownload()` marks the row as `failed` without throwing, and
2. `handleFailedDownload()` later throws while processing that failed row.

The fix is intentionally narrow. It changes the control flow in `src/server/download-manager.ts` so failed-download handling is attempted at most once per refresh cycle for a given download. It does not change the behavior or contract of `handleFailedDownload()`.

## Current Problem

`refreshDownloads()` currently mixes three different concerns inside one `try/catch`:

- running the import
- interpreting the refreshed tracked-download state
- handling side effects for a failed download

That structure creates an overlap between two failure paths:

- `importCompletedDownload()` can convert the download into `state = "failed"` without throwing
- `handleFailedDownload()` can throw later, most plausibly through `runAutoSearch()`

When both happen in sequence, the outer `catch` treats the handler exception like an import exception. The code then increments `stats.failed` again and calls `handleFailedDownload()` a second time, producing duplicate side effects such as repeated blocklist inserts, repeated removal attempts, and repeated re-search attempts.

## Design

### Control-Flow Boundary

Keep the fix in `src/server/download-manager.ts`.

This is the cleanest boundary because:

- `download-manager` owns the orchestration for completed-download processing
- `handleFailedDownload()` is currently called only from `download-manager`
- the review issue is caused by orchestration, not by the handler's internal behavior

### Revised Flow

For each tracked download that returns `"import"` from `reconcileTrackedDownload()`:

1. Run `importCompletedDownload(td.id)` in an import-only `try/catch`.
2. If the import call throws:
   - log the import failure
   - increment `stats.failed` once
   - call `handleFailedDownload()` in a separate nested `try/catch`
   - if the handler throws, log that handler failure and continue
3. If the import call does not throw:
   - re-read the tracked download state
   - if the refreshed state is `failed`:
     - increment `stats.failed` once
     - call `handleFailedDownload()` in its own `try/catch`
     - if the handler throws, log that handler failure and continue
   - if the refreshed state is `imported` and completed-download removal is enabled:
     - remove the completed download from the client as today

The key rule is that handler exceptions must not flow back into the import-failure path.

## Expected Behavior

After the change:

- a tracked download that fails import contributes one increment to `stats.failed`
- `handleFailedDownload()` is attempted once per refresh pass for that failed download
- a handler failure is logged but does not trigger another failed-download handling pass
- completed-download cleanup remains unchanged for successful imports

## Testing

Add regression coverage for the reviewed failure path.

The preferred test shape is a focused server-level test around `refreshDownloads()` that simulates:

1. a completed tracked download entering import handling
2. `importCompletedDownload()` marking the row as `failed` without throwing
3. `handleFailedDownload()` throwing after beginning its side effects

The assertions should verify that failed handling is single-shot. The most direct observable is that duplicate side effects do not occur, for example:

- only one blocklist row is created for the failed release
- failure accounting increments once for that download

If an existing end-to-end test can exercise that path without excessive setup, it may be extended instead. The priority is explicit regression coverage for the duplicate-handling case.

## Out Of Scope

- making `handleFailedDownload()` globally idempotent
- changing blocklist deduplication behavior
- altering the semantics of auto-search, removal, or event emission during failed-download handling
- broader refactoring of download refresh orchestration beyond the single-review issue
