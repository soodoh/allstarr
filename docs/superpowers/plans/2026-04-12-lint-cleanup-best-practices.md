# Lint Cleanup Best Practices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all current Biome lint warnings, keeping test intent intact and aligning the touched code with the repo's current TypeScript and React testing patterns.

**Architecture:** Treat the lint cleanup as a few independent warning domains rather than one large sweep. Start from failing lint output, make the smallest behavior-preserving edits in each domain, and finish with full lint and type verification so the cleanup does not hide regressions.

**Tech Stack:** Bun, TypeScript, React, Vitest browser mode, Biome

---

### Task 1: Capture The Warning Domains

**Files:**
- Modify: `docs/superpowers/plans/2026-04-12-lint-cleanup-best-practices.md`
- Inspect: `package.json`

- [ ] **Step 1: Record the failing lint baseline**

Run: `bun run lint`
Expected: command exits with warnings for unused browser-test imports/locals, non-null assertions in query tests, and explicit `any` usage in `src/test/empty-module.ts`

- [ ] **Step 2: Confirm the available autofix path**

Run: `cat package.json`
Expected: `lint` / `lint:fix` scripts point to Biome commands that can be used after the manual cleanup

### Task 2: Clean Browser Test Dead Code

**Files:**
- Modify: `src/components/bookshelf/authors/author-form.browser.test.tsx`
- Modify: `src/components/settings/indexers/indexer-form.browser.test.tsx`
- Modify: `src/components/settings/indexers/indexer-list.browser.test.tsx`
- Modify: `src/components/tv/episode-group-accordion.browser.test.tsx`
- Modify: `src/components/tv/episode-row.browser.test.tsx`

- [ ] **Step 1: Remove unused imports and locals**

Edit only the bindings Biome reported as unused. Keep the test behavior and assertions unchanged.

- [ ] **Step 2: Verify these files are clean**

Run: `bunx biome check src/components/bookshelf/authors/author-form.browser.test.tsx src/components/settings/indexers/indexer-form.browser.test.tsx src/components/settings/indexers/indexer-list.browser.test.tsx src/components/tv/episode-group-accordion.browser.test.tsx src/components/tv/episode-row.browser.test.tsx`
Expected: zero diagnostics for these files

### Task 3: Replace Query-Test Non-Null Assertions

**Files:**
- Modify: `src/lib/queries/blocklist.test.ts`
- Modify: `src/lib/queries/books.test.ts`
- Modify: `src/lib/queries/dashboard.test.ts`
- Modify: `src/lib/queries/history.test.ts`
- Modify: `src/lib/queries/movie-collections.test.ts`
- Modify: `src/lib/queries/queue.test.ts`

- [ ] **Step 1: Add explicit runtime assertions or typed helpers**

Before calling `queryFn` or `getNextPageParam`, assert the property exists with `expect(...).toBeTypeOf("function")`, a local helper using `NonNullable`, or another existing test pattern that keeps the code type-safe without `!`.

- [ ] **Step 2: Re-run the affected unit tests**

Run: `bun run test -- src/lib/queries/blocklist.test.ts src/lib/queries/books.test.ts src/lib/queries/dashboard.test.ts src/lib/queries/history.test.ts src/lib/queries/movie-collections.test.ts src/lib/queries/queue.test.ts`
Expected: all touched query tests pass

### Task 4: Tighten Browser Test Shims

**Files:**
- Modify: `src/test/empty-module.ts`

- [ ] **Step 1: Replace `any` return types with precise throw-only or unknown-safe types**

Preserve the current runtime behavior: every exported function should still throw if used in browser mode, but the declarations should no longer rely on explicit `any`.

- [ ] **Step 2: Verify the shim compiles cleanly**

Run: `bunx biome check src/test/empty-module.ts && bun run typecheck`
Expected: no diagnostics from Biome for the shim and no TypeScript regressions

### Task 5: Final Cleanup And Verification

**Files:**
- Modify: any remaining lint-warning files reported after Tasks 2-4

- [ ] **Step 1: Apply repo-standard autofixes**

Run: `bun run lint:fix`
Expected: safe formatting/import-order cleanup is applied without introducing new warnings

- [ ] **Step 2: Prove the repository is clean**

Run: `bun run lint`
Expected: zero warnings and zero errors

- [ ] **Step 3: Re-run final verification**

Run: `bun run typecheck`
Expected: exit code 0
