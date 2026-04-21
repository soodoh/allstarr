# Resilient Unmapped Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make unmapped-file imports continue past row failures and avoid rolling files back after a row's database commit.

**Architecture:** Keep the existing row-by-row import structure, but split each row into a reversible pre-commit phase and a non-reversible post-commit cleanup phase. Return structured per-row results to the mapping dialog so partial success can be surfaced without losing the remaining failed rows.

**Tech Stack:** TypeScript, React, TanStack Start server functions, Drizzle, Vitest, Bun

---

## File Structure

- Modify: `src/server/unmapped-files.ts`
  Purpose: change row execution to collect results, isolate rollback boundaries, and return per-row failures/warnings.
- Modify: `src/server/unmapped-files.test.ts`
  Purpose: add regression coverage for partial-success batch imports and post-commit cleanup safety.
- Modify: `src/components/unmapped-files/mapping-dialog.tsx`
  Purpose: consume structured import results and keep failed rows visible on partial success.
- Modify: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`
  Purpose: lock the new partial-success UI behavior.

## Task 1: Lock The Server Failure Semantics

**Files:**
- Modify: `src/server/unmapped-files.test.ts`
- Modify: `src/server/unmapped-files.ts`

- [ ] Write a failing test where row 1 succeeds, row 2 fails, and row 3 still imports.
- [ ] Run `bun run test -- src/server/unmapped-files.test.ts --testNamePattern \"continues after a row failure\"` and confirm it fails for the current batch-abort behavior.
- [ ] Implement row result collection in `mapUnmappedFileFn` so row failures are captured instead of thrown from the loop.
- [ ] Re-run the focused test until it passes.

## Task 2: Lock The Post-Commit Cleanup Boundary

**Files:**
- Modify: `src/server/unmapped-files.test.ts`
- Modify: `src/server/unmapped-files.ts`

- [ ] Write a failing test where asset deletion or directory pruning fails after the DB transaction commits.
- [ ] Run `bun run test -- src/server/unmapped-files.test.ts --testNamePattern \"does not roll back committed files on cleanup failure\"` and confirm it fails for the current rollback behavior.
- [ ] Refactor row execution so cleanup errors become warnings and never trigger file rollback after commit.
- [ ] Re-run the focused test until it passes.

## Task 3: Surface Partial Success In The Mapping Dialog

**Files:**
- Modify: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`
- Modify: `src/components/unmapped-files/mapping-dialog.tsx`

- [ ] Write a failing browser test for a partial-success server response with one failed row.
- [ ] Run `bun run test -- src/components/unmapped-files/mapping-dialog.browser.test.tsx --testNamePattern \"partial success\"` and confirm it fails.
- [ ] Update the dialog to keep failed rows visible, invalidate queries, persist options, and show the returned failure summary.
- [ ] Re-run the focused browser test until it passes.

## Task 4: Verify The Integrated Flow

**Files:**
- Modify: `src/server/unmapped-files.test.ts`
- Modify: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`

- [ ] Run `bun run test -- src/server/unmapped-files.test.ts src/components/unmapped-files/mapping-dialog.browser.test.tsx`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run typecheck`.
- [ ] Commit with a Conventional Commit message after all checks pass.
