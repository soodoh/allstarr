# Resilient Unmapped Import Design

## Summary

Make unmapped-file imports resilient to row-level failures during large batches.

Today the server rolls a single row back on failure, but still aborts the whole batch on the first thrown error. It also performs some related-file deletion and empty-directory pruning after the row's database transaction commits, then treats those cleanup errors like pre-commit failures and attempts to move files back. That can leave the database committed while files are restored to the source path.

The fix is to make import execution explicitly row-isolated, separate pre-commit failures from post-commit cleanup failures, and return structured per-row results to the UI.

## Goals

- Continue processing later rows when one row fails.
- Keep rollback scoped to the failing row.
- Prevent post-commit cleanup errors from rolling back already-committed file/database state.
- Return enough result detail for the UI to report partial success.
- Preserve current managed-path and asset-move semantics for successful rows.

## Non-Goals

- Introduce a global all-or-nothing import transaction.
- Change import matching, asset ownership, or destination naming rules.
- Add retry logic for filesystem failures.

## Current Failure Modes

### First Failure Aborts The Batch

`mapUnmappedFileFn` loops rows and `throw`s on the first row error. Earlier rows may already have succeeded, but later rows never run.

### Post-Commit Cleanup Can Corrupt Consistency

For rows with explicit asset plans, the current flow is:

1. move primary file and selected assets
2. commit DB transaction
3. delete deselected assets
4. prune empty source directories

If step 3 or 4 fails, the catch block still tries to move the imported files back. The filesystem state may get rolled back while the DB transaction remains committed.

## Recommended Approach

Use row-isolated execution with an explicit commit boundary.

For each row:

1. resolve metadata and destination paths
2. perform reversible filesystem moves
3. commit DB transaction
4. run post-commit cleanup as best-effort row finalization
5. record either success, import success with cleanup warnings, or failure

Bulk import returns a structured summary instead of throwing on the first row failure.

## Server Design

### Result Shape

`mapUnmappedFileFn` should return:

- `success: true`
- `mappedCount`
- `failedCount`
- `failures`
- `warnings`

Each failure entry should include:

- `unmappedFileId`
- `sourcePath`
- `entityType`
- `message`

Warnings should be row-scoped as well, so cleanup failures can be surfaced without marking the import row as rolled back.

### Row Execution Rules

- Failures before the DB transaction commits are reversible.
  - Move the row's files back.
  - Record a row failure.
  - Continue with the next row.
- Failures after the DB transaction commits are not reversible by moving files back.
  - Keep the moved files and committed DB rows in place.
  - Record a row warning.
  - Continue with the next row.
- Unexpected lookup failures like missing target entities should also become row failures, not batch aborts, unless they prevent validating the entire request shape up front.

### Event Emission

Emit `unmappedFilesUpdated` once after the loop if any row succeeded or any row changed source files. Keep the existing single event model.

## UI Design

The modal should handle three outcomes:

- full success:
  - keep current behavior: invalidate queries, persist options, close modal, success toast
- partial success:
  - invalidate queries and persist options
  - keep the modal open so unresolved rows remain visible
  - show a destructive toast summarizing how many rows failed
  - show row-level error text in the modal for failed rows
- full failure:
  - keep the modal open and show the returned row errors if available

This avoids losing the user's row assignments after a partial import.

## Testing

Add coverage for:

- one failing row does not stop later rows from importing
- post-commit cleanup failure does not move files back after DB commit
- partial-success response is rendered in the modal
- successful rows disappear after query invalidation while failed rows stay actionable

## Risks

- The return type change touches both server and browser tests.
- Cleanup warnings may expose previously hidden filesystem issues in user-facing toasts.

## Acceptance Criteria

- A large import with one bad row completes the other valid rows.
- No row ends with DB-imported state pointing at a file that was rolled back to the source path because of late cleanup failure.
- The user can see which rows failed and retry only those rows.
