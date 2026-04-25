# Code Quality Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a deep, workflow-led code quality audit report that ranks maintainability, functionality, consistency, risk, and test-quality improvements across Allstarr.

**Architecture:** This is an audit-only implementation. Each task traces one workflow through routes, UI, client data access, server boundaries, persistence/integration code, and tests, then records evidence in a single report. The final task ranks findings and recommends the first follow-up implementation target without changing production code.

**Tech Stack:** Bun, TypeScript, React 19, TanStack Start/Router, TanStack Query, Drizzle ORM with SQLite, Vitest, Vitest browser mode, Playwright, Biome.

---

## File Structure

Create:

- `docs/superpowers/reports/2026-04-25-code-quality-audit.md` - final audit report with workflow findings, ranked shortlist, verification evidence, and recommended first implementation target.

Read heavily:

- `docs/superpowers/specs/2026-04-25-code-quality-audit-design.md` - approved audit design.
- `README.md`, `package.json`, `vitest.config.ts`, `vite.config.ts`, `biome.json` - project commands and quality gates.
- `src/routes/**`, excluding `src/routeTree.gen.ts` - route boundaries, loaders, redirects, browser tests.
- `src/components/**` - UI ownership, component size, repeated patterns.
- `src/lib/queries/**` and `src/hooks/**` - React Query and shared hook patterns.
- `src/server/**` - server services, integration boundaries, validation, auth checks, tests.
- `src/db/schema/**` and `drizzle/*.sql` - schema usage and migration consistency.
- `e2e/**` and `src/test/**` - end-to-end setup and test helpers.

Do not modify:

- `src/routeTree.gen.ts`
- `.worktrees/**`
- Production source files during this audit

Use these Context7 references during evaluation:

- TanStack Router `/tanstack/router`: pathless layout auth guards, `beforeLoad`, `redirect`, route context, loaders, and not-found handling.
- TanStack Query `/tanstack/query`: query keys, `useSuspenseQuery`, mutation success invalidation, cache ownership, and avoiding object rest destructuring on query results.
- Drizzle ORM `/drizzle-team/drizzle-orm-docs`: typed SQLite schema definitions, inferred select/insert types, migrations, transactions, and query testing.

### Task 1: Establish Baseline Inventory

**Files:**

- Read: `docs/superpowers/specs/2026-04-25-code-quality-audit-design.md`
- Read: `README.md`
- Read: `package.json`
- Read: `vitest.config.ts`
- Read: `vite.config.ts`
- Read: `biome.json`
- Create: `docs/superpowers/reports/2026-04-25-code-quality-audit.md`

- [ ] **Step 1: Confirm the working tree state**

Run:

```bash
git status --short
```

Expected: either a clean tree or only this plan file if it has not been committed yet. If unrelated user changes appear, record them in the report under "Working Tree Context" and do not modify them.

- [ ] **Step 2: Read the approved spec**

Run:

```bash
sed -n '1,220p' docs/superpowers/specs/2026-04-25-code-quality-audit-design.md
```

Expected: the spec lists five workflows, test quality as first-class scope, and transition criteria for choosing the first implementation target.

- [ ] **Step 3: Capture project commands and quality gates**

Run:

```bash
sed -n '1,220p' README.md
sed -n '1,220p' package.json
sed -n '1,220p' vitest.config.ts
sed -n '1,220p' biome.json
```

Expected: commands include `bun run lint`, `bun run typecheck`, `bun run test`, `bun run test:e2e`, and coverage thresholds are visible in `vitest.config.ts`.

- [ ] **Step 4: Capture static hotspot metrics**

Run:

```bash
find src -type f \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/routeTree.gen.ts' -print0 | xargs -0 wc -l | sort -nr | head -60
rg -n "T[O]DO|FIX[ME]|HACK|@ts-ignore|@ts-expect-error|biome-ignore|eslint-disable|console\\.log" src e2e scripts package.json
find src -type f \( -name '*.test.ts' -o -name '*.browser.test.tsx' -o -name '*.spec.ts' \) | wc -l
find src -type f \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/routeTree.gen.ts' | wc -l
```

Expected: large files and any suppression or logging markers are visible. Use these as investigation leads, not as findings by themselves.

- [ ] **Step 5: Create the report skeleton**

Use `apply_patch` to create `docs/superpowers/reports/2026-04-25-code-quality-audit.md` with this exact structure:

```markdown
# Code Quality Audit Report

## Working Tree Context

- Branch: `improvements`
- Audit date: 2026-04-25
- Baseline notes:

## Executive Summary

## Verification

| Command | Result | Notes |
| --- | --- | --- |

## Workflow Findings

### Dashboard And Library Browsing

### Imports And Unmapped Files

### Indexers, Search, And Download Flow

### Settings And Configuration

### Auth, Setup, And Role-Gated Navigation

## Cross-Cutting Test Quality

## Ranked Shortlist

| Rank | Finding | Category | User Impact | Maintenance Cost | Risk | Implementation Size | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Fix Now

## Track Later

## Recommended First Implementation Target

## Risks And Open Questions
```

- [ ] **Step 6: Commit the report skeleton**

Run:

```bash
git add docs/superpowers/reports/2026-04-25-code-quality-audit.md
git commit -m "docs(audit): start code quality audit report"
```

Expected: commit succeeds. If Lefthook is unavailable in PATH, note that in the final verification section.

### Task 2: Audit Dashboard And Library Browsing

**Files:**

- Read: `src/routes/_authed/index.tsx`
- Read: `src/routes/_authed/index.browser.test.tsx`
- Read: `src/components/dashboard/activity-feed.tsx`
- Read: `src/components/dashboard/content-type-card.tsx`
- Read: `src/components/dashboard/summary-row.tsx`
- Read: `src/lib/queries/dashboard.ts`
- Read: `src/lib/queries/system-status.ts`
- Read: `src/server/dashboard.ts`
- Read: `src/server/dashboard.test.ts`
- Modify: `docs/superpowers/reports/2026-04-25-code-quality-audit.md`

- [ ] **Step 1: Read route, UI, query, and server files**

Run:

```bash
sed -n '1,260p' src/routes/_authed/index.tsx
sed -n '1,260p' src/routes/_authed/index.browser.test.tsx
sed -n '1,260p' src/components/dashboard/activity-feed.tsx
sed -n '1,260p' src/components/dashboard/content-type-card.tsx
sed -n '1,260p' src/components/dashboard/summary-row.tsx
sed -n '1,260p' src/lib/queries/dashboard.ts
sed -n '1,220p' src/lib/queries/system-status.ts
sed -n '1,260p' src/server/dashboard.ts
sed -n '1,260p' src/server/dashboard.test.ts
```

Expected: enough context to trace dashboard loader prefetching, `useSuspenseQuery`, component ownership, server aggregation, and tests.

- [ ] **Step 2: Check TanStack Query usage**

Run:

```bash
rg -n "dashboard.*Query|useSuspenseQuery|invalidateQueries|queryKey|\\.\\.\\." src/routes/_authed/index.tsx src/components/dashboard src/lib/queries src/server/dashboard.ts
```

Expected: query keys and suspense usage are visible. Compare against the Context7 Query guidance: explicit query keys, clear cache ownership, mutation invalidation where mutations exist, and no object rest destructuring of query results.

- [ ] **Step 3: Run dashboard-focused tests**

Run:

```bash
bun run test -- src/server/dashboard.test.ts src/routes/_authed/index.browser.test.tsx
```

Expected: PASS. If the command fails, record the failing test names and exact failure summary in the report.

- [ ] **Step 4: Record dashboard findings**

Modify `docs/superpowers/reports/2026-04-25-code-quality-audit.md` under `### Dashboard And Library Browsing` with this format for each finding:

```markdown
#### Finding: <short concrete title>

- Category: Boundary issue | Duplication issue | Test quality issue | Error-handling issue | Workflow consistency issue | Maintainability issue | Risk issue
- Evidence: `<file path>` and the relevant behavior observed.
- Impact: User Impact <High|Medium|Low>, Maintenance Cost <High|Medium|Low>, Risk <High|Medium|Low>, Implementation Size <Small|Medium|Large>.
- Recommendation: One concrete follow-up change with a testable outcome.
```

Expected: at least one of these outcomes is recorded: "No high-value finding in this workflow" or one or more evidence-backed findings.

- [ ] **Step 5: Commit dashboard audit notes**

Run:

```bash
git add docs/superpowers/reports/2026-04-25-code-quality-audit.md
git commit -m "docs(audit): assess dashboard workflow quality"
```

Expected: commit succeeds with only the report file staged.

### Task 3: Audit Imports And Unmapped Files

**Files:**

- Read: `src/routes/_authed/unmapped-files.tsx`
- Read: `src/routes/_authed/unmapped-files.browser.test.tsx`
- Read: `src/components/unmapped-files/mapping-dialog.tsx`
- Read: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`
- Read: `src/server/import.ts`
- Read: `src/server/import.test.ts`
- Read: `src/server/imports/plan.ts`
- Read: `src/server/imports/plan.test.ts`
- Read: `src/server/imports/apply.ts`
- Read: `src/server/imports/apply.test.ts`
- Read: `src/server/unmapped-files.ts`
- Read: `src/server/unmapped-files.test.ts`
- Modify: `docs/superpowers/reports/2026-04-25-code-quality-audit.md`

- [ ] **Step 1: Read route and UI files**

Run:

```bash
sed -n '1,320p' src/routes/_authed/unmapped-files.tsx
sed -n '1,320p' src/routes/_authed/unmapped-files.browser.test.tsx
sed -n '1,360p' src/components/unmapped-files/mapping-dialog.tsx
sed -n '1,260p' src/components/unmapped-files/mapping-dialog.browser.test.tsx
```

Expected: route behavior, dialog state ownership, browser assertions, loading states, and error states are visible.

- [ ] **Step 2: Read server import and unmapped files logic**

Run:

```bash
sed -n '1,360p' src/server/import.ts
sed -n '1,300p' src/server/import.test.ts
sed -n '1,360p' src/server/imports/plan.ts
sed -n '1,320p' src/server/imports/plan.test.ts
sed -n '1,360p' src/server/imports/apply.ts
sed -n '1,320p' src/server/imports/apply.test.ts
sed -n '1,360p' src/server/unmapped-files.ts
sed -n '1,320p' src/server/unmapped-files.test.ts
```

Expected: import planning, import application, unmapped-file persistence, test fixture shape, and failure handling are visible.

- [ ] **Step 3: Search for duplication and boundary pressure**

Run:

```bash
rg -n "mapping|unmapped|import plan|apply|targetId|targetIds|dryRun|rollback|transaction|filesystem|rename|move" src/routes/_authed/unmapped-files.tsx src/components/unmapped-files src/server/import.ts src/server/imports src/server/unmapped-files.ts src/server/*.test.ts
```

Expected: repeated parsing, planning, target selection, filesystem, and transaction handling patterns are visible.

- [ ] **Step 4: Run import and unmapped-file tests**

Run:

```bash
bun run test -- src/server/import.test.ts src/server/imports/plan.test.ts src/server/imports/apply.test.ts src/server/unmapped-files.test.ts src/routes/_authed/unmapped-files.browser.test.tsx src/components/unmapped-files/mapping-dialog.browser.test.tsx
```

Expected: PASS. If the command fails, record the failing test names and exact failure summary in the report.

- [ ] **Step 5: Record imports and unmapped-files findings**

Modify `docs/superpowers/reports/2026-04-25-code-quality-audit.md` under `### Imports And Unmapped Files` using the finding format from Task 2 Step 4.

Expected: findings explicitly address whether import orchestration, filesystem behavior, mapping UI state, and tests have clear boundaries.

- [ ] **Step 6: Commit import workflow audit notes**

Run:

```bash
git add docs/superpowers/reports/2026-04-25-code-quality-audit.md
git commit -m "docs(audit): assess import workflow quality"
```

Expected: commit succeeds with only the report file staged.

### Task 4: Audit Indexers, Search, And Download Flow

**Files:**

- Read: `src/routes/_authed/settings/indexers.tsx`
- Read: `src/routes/_authed/settings/indexers.browser.test.tsx`
- Read: `src/routes/api/v1/indexer/index.ts`
- Read: `src/routes/api/v1/indexer/$id.ts`
- Read: `src/routes/api/v1/indexer/schema.ts`
- Read: `src/server/indexers.ts`
- Read: `src/server/indexers.test.ts`
- Read: `src/server/search.ts`
- Read: `src/server/search.test.ts`
- Read: `src/server/auto-search.ts`
- Read: `src/server/auto-search.test.ts`
- Read: `src/server/download-manager.ts`
- Read: `src/server/download-manager.test.ts`
- Read: `src/server/download-clients/registry.ts`
- Read: `src/server/download-clients/registry.test.ts`
- Modify: `docs/superpowers/reports/2026-04-25-code-quality-audit.md`

- [ ] **Step 1: Read indexer route and API files**

Run:

```bash
sed -n '1,360p' src/routes/_authed/settings/indexers.tsx
sed -n '1,260p' src/routes/_authed/settings/indexers.browser.test.tsx
sed -n '1,260p' src/routes/api/v1/indexer/index.ts
sed -n '1,260p' 'src/routes/api/v1/indexer/$id.ts'
sed -n '1,260p' src/routes/api/v1/indexer/schema.ts
```

Expected: settings UI behavior, API validation, route handlers, and tests are visible.

- [ ] **Step 2: Read search, auto-search, and download orchestration**

Run:

```bash
sed -n '1,420p' src/server/indexers.ts
sed -n '1,320p' src/server/indexers.test.ts
sed -n '1,420p' src/server/search.ts
sed -n '1,320p' src/server/search.test.ts
sed -n '1,460p' src/server/auto-search.ts
sed -n '1,360p' src/server/auto-search.test.ts
sed -n '1,360p' src/server/download-manager.ts
sed -n '1,320p' src/server/download-manager.test.ts
sed -n '1,260p' src/server/download-clients/registry.ts
sed -n '1,260p' src/server/download-clients/registry.test.ts
```

Expected: orchestration boundaries, scoring, release selection, download dispatch, and external-client registry behavior are visible.

- [ ] **Step 3: Check for risky async and integration patterns**

Run:

```bash
rg -n "Promise\\.all|Promise\\.allSettled|setTimeout|retry|rate|queue|download|search|indexer|throw new Error|catch|Result|status" src/server/indexers.ts src/server/search.ts src/server/auto-search.ts src/server/download-manager.ts src/server/download-clients src/routes/api/v1/indexer
```

Expected: async orchestration, retry/rate handling, error handling, and external boundary behavior are visible.

- [ ] **Step 4: Run indexer/search/download tests**

Run:

```bash
bun run test -- src/routes/api/v1/indexer/routes.test.ts src/routes/api/v1/indexer/schema.test.ts src/server/indexers.test.ts src/server/search.test.ts src/server/auto-search.test.ts src/server/download-manager.test.ts src/server/download-clients/registry.test.ts src/routes/_authed/settings/indexers.browser.test.tsx
```

Expected: PASS. If the command fails, record the failing test names and exact failure summary in the report.

- [ ] **Step 5: Record indexer/search/download findings**

Modify `docs/superpowers/reports/2026-04-25-code-quality-audit.md` under `### Indexers, Search, And Download Flow` using the finding format from Task 2 Step 4.

Expected: findings explicitly address orchestration size, error handling, test fixture complexity, and whether integration boundaries are clear.

- [ ] **Step 6: Commit indexer/search/download audit notes**

Run:

```bash
git add docs/superpowers/reports/2026-04-25-code-quality-audit.md
git commit -m "docs(audit): assess search and download quality"
```

Expected: commit succeeds with only the report file staged.

### Task 5: Audit Settings And Configuration

**Files:**

- Read: `src/routes/_authed/settings/index.tsx`
- Read: `src/routes/_authed/settings/routes.browser.test.tsx`
- Read: `src/routes/_authed/settings/general.tsx`
- Read: `src/routes/_authed/settings/media-management.tsx`
- Read: `src/routes/_authed/settings/download-clients.tsx`
- Read: `src/routes/_authed/settings/profiles.tsx`
- Read: `src/routes/_authed/settings/formats.tsx`
- Read: `src/routes/_authed/settings/custom-formats.tsx`
- Read: `src/components/settings/**`
- Read: `src/server/settings-store.ts`
- Read: `src/server/__tests__/settings-store.test.ts`
- Read: `src/server/download-clients.ts`
- Read: `src/server/download-profiles.ts`
- Modify: `docs/superpowers/reports/2026-04-25-code-quality-audit.md`

- [ ] **Step 1: Read settings routes and route tests**

Run:

```bash
sed -n '1,240p' src/routes/_authed/settings/index.tsx
sed -n '1,320p' src/routes/_authed/settings/routes.browser.test.tsx
sed -n '1,320p' src/routes/_authed/settings/general.tsx
sed -n '1,360p' src/routes/_authed/settings/media-management.tsx
sed -n '1,360p' src/routes/_authed/settings/download-clients.tsx
sed -n '1,360p' src/routes/_authed/settings/profiles.tsx
sed -n '1,320p' src/routes/_authed/settings/formats.tsx
sed -n '1,320p' src/routes/_authed/settings/custom-formats.tsx
```

Expected: settings navigation, route organization, forms, validation, and browser coverage are visible.

- [ ] **Step 2: Inventory settings components**

Run:

```bash
find src/components/settings -type f \( -name '*.ts' -o -name '*.tsx' \) -print | sort
find src/components/settings -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 wc -l | sort -nr | head -40
```

Expected: component boundaries and large settings files are visible.

- [ ] **Step 3: Read settings server modules**

Run:

```bash
sed -n '1,320p' src/server/settings-store.ts
sed -n '1,320p' src/server/__tests__/settings-store.test.ts
sed -n '1,360p' src/server/download-clients.ts
sed -n '1,320p' src/server/download-profiles.ts
```

Expected: configuration persistence, server validation, and test coverage are visible.

- [ ] **Step 4: Search for duplicated form and mutation patterns**

Run:

```bash
rg -n "useMutation|invalidateQueries|useState|onSubmit|Form|toast|sonner|zod|schema|settings" src/routes/_authed/settings src/components/settings src/hooks src/lib/queries
```

Expected: repeated form state, validation, toast, mutation, and invalidation patterns are visible.

- [ ] **Step 5: Run settings tests**

Run:

```bash
bun run test -- src/routes/_authed/settings/routes.browser.test.tsx src/routes/_authed/settings/general.browser.test.tsx src/routes/_authed/settings/media-management.browser.test.tsx src/routes/_authed/settings/download-clients.browser.test.tsx src/routes/_authed/settings/profiles.browser.test.tsx src/routes/_authed/settings/formats.browser.test.tsx src/routes/_authed/settings/custom-formats.browser.test.tsx src/server/__tests__/settings-store.test.ts src/server/download-clients.test.ts src/server/download-profiles.test.ts
```

Expected: PASS. If the command fails, record the failing test names and exact failure summary in the report.

- [ ] **Step 6: Record settings findings**

Modify `docs/superpowers/reports/2026-04-25-code-quality-audit.md` under `### Settings And Configuration` using the finding format from Task 2 Step 4.

Expected: findings explicitly address route/component consistency, repeated form code, query invalidation, validation, and test setup.

- [ ] **Step 7: Commit settings audit notes**

Run:

```bash
git add docs/superpowers/reports/2026-04-25-code-quality-audit.md
git commit -m "docs(audit): assess settings workflow quality"
```

Expected: commit succeeds with only the report file staged.

### Task 6: Audit Auth, Setup, And Role-Gated Navigation

**Files:**

- Read: `src/routes/_authed.tsx`
- Read: `src/routes/_authed.browser.test.tsx`
- Read: `src/routes/login.tsx`
- Read: `src/routes/login.browser.test.tsx`
- Read: `src/routes/register.tsx`
- Read: `src/routes/register.browser.test.tsx`
- Read: `src/routes/setup.tsx`
- Read: `src/routes/setup.browser.test.tsx`
- Read: `src/components/layout/app-layout.tsx`
- Read: `src/components/layout/app-sidebar.tsx`
- Read: `src/components/layout/header.tsx`
- Read: `src/server/middleware.ts`
- Read: `src/server/setup.ts`
- Read: `src/db/schema/auth.ts`
- Modify: `docs/superpowers/reports/2026-04-25-code-quality-audit.md`

- [ ] **Step 1: Read auth and setup routes**

Run:

```bash
sed -n '1,320p' src/routes/_authed.tsx
sed -n '1,320p' src/routes/_authed.browser.test.tsx
sed -n '1,320p' src/routes/login.tsx
sed -n '1,260p' src/routes/login.browser.test.tsx
sed -n '1,320p' src/routes/register.tsx
sed -n '1,260p' src/routes/register.browser.test.tsx
sed -n '1,360p' src/routes/setup.tsx
sed -n '1,260p' src/routes/setup.browser.test.tsx
```

Expected: route guards, setup redirect behavior, auth forms, requester role behavior, and browser assertions are visible.

- [ ] **Step 2: Read layout and server auth files**

Run:

```bash
sed -n '1,260p' src/components/layout/app-layout.tsx
sed -n '1,360p' src/components/layout/app-sidebar.tsx
sed -n '1,260p' src/components/layout/header.tsx
sed -n '1,320p' src/server/middleware.ts
sed -n '1,320p' src/server/setup.ts
sed -n '1,260p' src/db/schema/auth.ts
```

Expected: protected layout ownership, sidebar role visibility, session access, setup checks, and user schema are visible.

- [ ] **Step 3: Compare route guards against TanStack Router guidance**

Run:

```bash
rg -n "beforeLoad|redirect|notFoundComponent|context\\.session|role|requester|location\\.href|/requests|/setup|/login" src/routes src/components/layout src/server/middleware.ts src/server/setup.ts
```

Expected: pathless authed route, auth redirects, role redirects, and setup redirects are visible. Compare against Context7 Router guidance for pathless layout auth guards, preserving redirect location, and route-context ownership.

- [ ] **Step 4: Run auth/setup tests**

Run:

```bash
bun run test -- src/routes/_authed.browser.test.tsx src/routes/login.browser.test.tsx src/routes/register.browser.test.tsx src/routes/setup.browser.test.tsx src/routes/__root.test.tsx src/router.test.tsx
```

Expected: PASS. If the command fails, record the failing test names and exact failure summary in the report.

- [ ] **Step 5: Record auth/setup findings**

Modify `docs/superpowers/reports/2026-04-25-code-quality-audit.md` under `### Auth, Setup, And Role-Gated Navigation` using the finding format from Task 2 Step 4.

Expected: findings explicitly address authorization consistency, redirect safety, role-gated navigation, layout ownership, and test coverage of access control.

- [ ] **Step 6: Commit auth/setup audit notes**

Run:

```bash
git add docs/superpowers/reports/2026-04-25-code-quality-audit.md
git commit -m "docs(audit): assess auth workflow quality"
```

Expected: commit succeeds with only the report file staged.

### Task 7: Cross-Cutting Test Quality And Verification

**Files:**

- Read: `src/test/**`
- Read: `e2e/**`
- Read: `vitest.config.ts`
- Read: `e2e/playwright.config.ts`
- Modify: `docs/superpowers/reports/2026-04-25-code-quality-audit.md`

- [ ] **Step 1: Inventory test helper files**

Run:

```bash
find src/test e2e -type f -print | sort
sed -n '1,260p' src/test/render.tsx
sed -n '1,260p' src/test/setup.ts
sed -n '1,260p' src/test/browser-console.ts
sed -n '1,260p' e2e/playwright.config.ts
sed -n '1,260p' e2e/global-setup.ts
sed -n '1,260p' e2e/global-teardown.ts
```

Expected: shared render helpers, setup behavior, browser console handling, and e2e setup are visible.

- [ ] **Step 2: Search for brittle test patterns**

Run:

```bash
rg -n "waitForTimeout|toHaveText|innerHTML|querySelector|data-testid|mock\\(|vi\\.mock|beforeEach|afterEach|testReset|__test-reset|fixture|golden|coverage" src e2e
```

Expected: test coupling, reset behavior, mocks, fixtures, and timing patterns are visible.

- [ ] **Step 3: Run static verification**

Run:

```bash
bun run lint
bun run typecheck
```

Expected: PASS for both commands. If either command fails, record the failing command and exact summary in the `## Verification` table.

- [ ] **Step 4: Run the full unit and browser test suite**

Run:

```bash
bun run test
```

Expected: PASS. If the command fails, record the failing test files, failing test names, and exact summary in the `## Verification` table.

- [ ] **Step 5: Record cross-cutting test findings**

Modify `docs/superpowers/reports/2026-04-25-code-quality-audit.md` under `## Cross-Cutting Test Quality` with finding entries using the format from Task 2 Step 4.

Expected: findings explicitly address fixture reuse, test speed, test readability, browser-mode coverage, e2e coverage, and coupling between tests and implementation details.

- [ ] **Step 6: Commit test-quality audit notes**

Run:

```bash
git add docs/superpowers/reports/2026-04-25-code-quality-audit.md
git commit -m "docs(audit): assess test quality"
```

Expected: commit succeeds with only the report file staged.

### Task 8: Rank Findings And Recommend First Target

**Files:**

- Modify: `docs/superpowers/reports/2026-04-25-code-quality-audit.md`

- [ ] **Step 1: Normalize finding scores**

Read all findings in `docs/superpowers/reports/2026-04-25-code-quality-audit.md` and ensure each has:

```markdown
- Category: Boundary issue | Duplication issue | Test quality issue | Error-handling issue | Workflow consistency issue | Maintainability issue | Risk issue
- Impact: User Impact <High|Medium|Low>, Maintenance Cost <High|Medium|Low>, Risk <High|Medium|Low>, Implementation Size <Small|Medium|Large>.
- Recommendation: One concrete follow-up change with a testable outcome.
```

Expected: every finding has the same scoring fields and a concrete recommendation.

- [ ] **Step 2: Build the ranked shortlist**

Populate `## Ranked Shortlist` with at least five rows and no more than ten rows. Use this exact scoring order:

1. High risk beats low implementation size.
2. High user impact beats maintenance-only cleanup.
3. High maintenance cost beats style-only consistency.
4. Smaller implementation size breaks ties.

Expected: the table is ordered from best first implementation candidate to lowest-priority tracked item.

- [ ] **Step 3: Separate fix-now and track-later items**

Populate `## Fix Now` with findings that have at least one of:

- User Impact High
- Risk High
- Maintenance Cost High and Implementation Size Small or Medium

Populate `## Track Later` with findings that are valid but either low impact, large implementation size, or dependent on another refactor.

Expected: every ranked finding appears in either `## Fix Now` or `## Track Later`.

- [ ] **Step 4: Write the recommended first implementation target**

Populate `## Recommended First Implementation Target` with:

```markdown
### Target: <finding title>

- Why first: <one paragraph tying score to workflow risk and implementation size>
- Owner files: `<exact file>`, `<exact file>`, `<exact test file>`
- Expected behavior after fix: <observable behavior>
- Minimum tests: `<exact command>` and the specific test names or files that should change
- Out of scope: <explicit boundaries that keep the follow-up implementation focused>
```

Expected: the next implementation plan can be written from this section without redoing the whole audit.

- [ ] **Step 5: Write executive summary**

Populate `## Executive Summary` with three short paragraphs:

1. The overall health of the codebase.
2. The most important quality pattern observed.
3. The recommended first target and why it is the best starting point.

Expected: a reader can understand the audit outcome before reading details.

- [ ] **Step 6: Commit ranked audit report**

Run:

```bash
git add docs/superpowers/reports/2026-04-25-code-quality-audit.md
git commit -m "docs(audit): rank code quality findings"
```

Expected: commit succeeds with only the report file staged.

### Task 9: Final Self-Review And Handoff

**Files:**

- Read: `docs/superpowers/specs/2026-04-25-code-quality-audit-design.md`
- Modify: `docs/superpowers/reports/2026-04-25-code-quality-audit.md`

- [ ] **Step 1: Check spec coverage**

Run:

```bash
sed -n '1,220p' docs/superpowers/specs/2026-04-25-code-quality-audit-design.md
sed -n '1,260p' docs/superpowers/reports/2026-04-25-code-quality-audit.md
```

Expected: the report covers all five workflows, test quality, scoring, verification, fix-now items, track-later items, risks, and the first target.

- [ ] **Step 2: Scan for incomplete markers and vague language**

Run:

```bash
rg -n "T[B]D|T[O]DO|FIX[ME]|place[holder]|fill[ ]in|appro[priate]|var[ious]|etc\\.|some[ ]files|may[be]|prob[ably]|should[ ]consider" docs/superpowers/reports/2026-04-25-code-quality-audit.md
```

Expected: no matches. If matches are legitimate quoted code or command output, rewrite the surrounding report text so the audit conclusions remain concrete.

- [ ] **Step 3: Verify only audit documentation changed**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: either a clean tree or only final report edits. No production code files should be modified.

- [ ] **Step 4: Commit final report polish if needed**

If Step 1 or Step 2 required report edits, run:

```bash
git add docs/superpowers/reports/2026-04-25-code-quality-audit.md
git commit -m "docs(audit): finalize code quality audit"
```

Expected: commit succeeds with only the report file staged. If no edits were needed, skip this commit and record "No final polish commit needed" in the final response.

- [ ] **Step 5: Provide handoff summary**

Final response should include:

```markdown
Audit report complete: `docs/superpowers/reports/2026-04-25-code-quality-audit.md`

Verification:
- `bun run lint`: <PASS|FAIL|not run with reason>
- `bun run typecheck`: <PASS|FAIL|not run with reason>
- `bun run test`: <PASS|FAIL|not run with reason>

Recommended first target: <target title>
Reason: <one sentence>

Commits created:
- `<hash> docs(audit): start code quality audit report`
- `<hash> docs(audit): assess dashboard workflow quality`
- `<hash> docs(audit): assess import workflow quality`
- `<hash> docs(audit): assess search and download quality`
- `<hash> docs(audit): assess settings workflow quality`
- `<hash> docs(audit): assess auth workflow quality`
- `<hash> docs(audit): assess test quality`
- `<hash> docs(audit): rank code quality findings`
```

Expected: the user can review the report and approve the recommended first implementation target.
