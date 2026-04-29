# Targeted Test Ownership Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Add a concise, enforceable testing ownership guide so new reliability changes land regression coverage in the smallest useful test layer.

**Architecture:** This is a documentation-first reliability improvement for backlog item P1-8. Add a new `docs/testing.md` guide that maps behavior to Node unit tests, Vitest browser tests, e2e fixture/helper tests, and Playwright e2e workflows, then link it from `README.md` and the reliability backlog. Keep implementation intentionally small: no new abstractions, no CI workflow changes, and no test rewrites unless verification reveals a broken documented command.

**Tech Stack:** Markdown, Bun, Vitest Node project, Vitest browser project with Chromium, Playwright e2e, existing fake-server fixtures.

---

### Task 1: Add the testing ownership guide

**Files:**
- Create: `docs/testing.md`

**Step 1: Write the guide**

Create `docs/testing.md` with this content:

```markdown
# Testing Ownership Guide

Use the smallest test layer that can prove the behavior. Prefer fast, deterministic tests for rules and data shaping; reserve Playwright e2e for workflows that require a running app, fake services, database setup, and real browser navigation.

## Layer ownership

| Layer | File pattern | Owns | Avoid using it for |
| --- | --- | --- | --- |
| Node unit tests | `src/**/*.test.ts`, `src/**/*.test.tsx` | Pure server rules, database-adjacent helpers with test DB setup, scheduler/task helpers, API/client parsers, fake-server loader contracts | DOM rendering, browser-only APIs, full cross-service workflows |
| Fixture/helper tests | `e2e/fixtures/**/*.test.ts`, `e2e/helpers/**/*.test.ts` | Fake-service manager behavior, golden fixture loading, app runtime helpers, e2e synchronization helpers | Product UI behavior that should be visible to users |
| Browser component tests | `src/**/*.browser.test.tsx` | DOM rendering, React state, hooks, TanStack Query behavior, form interactions, console-error expectations | Service orchestration, app startup, fake-server readiness, multi-page workflows |
| Playwright e2e tests | `e2e/tests/**/*.spec.ts` | Cross-service workflows that require the built app, authentication, routing, SQLite state, fake download/indexer/metadata services, and SSE/task synchronization | Pure business rules or component states that can be tested faster elsewhere |

## Decision checklist

1. Can the behavior be proven with a pure function or focused server helper? Use a Node unit test.
2. Is the behavior about a fake server, golden fixture, app runtime helper, or e2e wait helper? Use a fixture/helper test.
3. Does the behavior require React rendering, user events, browser APIs, or client cache state but not a full app server? Use a browser component test.
4. Does the behavior require app startup, auth, routing, SQLite persistence, fake external services, task/SSE synchronization, or multiple pages? Use Playwright e2e.
5. For high-risk workflows, combine layers: unit-test the rules, browser-test the interaction, and add one e2e smoke/regression for the full path.

## Existing examples

- Server rules and persistence helpers: `src/server/books.test.ts`, `src/server/shows.test.ts`, `src/server/unmapped-files.test.ts`.
- Fake-service and helper contracts: `e2e/fixtures/fake-servers/manager.test.ts`, `e2e/helpers/tasks.test.ts`.
- Browser UI behavior: `src/components/unmapped-files/mapping-dialog.browser.test.tsx`, `src/hooks/sse-context.browser.test.tsx`.
- Workflow coverage: `e2e/tests/07-download-lifecycle.spec.ts`, `e2e/tests/11-unmapped-files.spec.ts`.

## Coverage expectations for reliability changes

- Name the owning layer in the PR description for every high-risk reliability change.
- Prefer adding one narrow regression test at the layer where the bug originates before adding broad e2e coverage.
- Do not increase Playwright retries to hide flakes; add diagnostics or smaller-layer coverage instead.
- Do not lower coverage thresholds. If a threshold failure is noisy, improve the signal or add targeted coverage.

## Commands

```bash
bun run test -- e2e/fixtures/fake-servers/manager.test.ts e2e/helpers/tasks.test.ts src/components/unmapped-files/mapping-dialog.browser.test.tsx
bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts
bun run typecheck
```
```

**Step 2: Self-review the guide against the backlog item**

Confirm the guide explicitly covers:

- Pure server rules and helpers in Node tests.
- DOM interaction and client state in browser tests.
- Fake-server contracts and fixture loaders in fixture tests.
- Cross-service workflows in Playwright e2e.
- A requirement for high-risk workflow changes to name the owning coverage layer.

**Step 3: Commit**

```bash
git add docs/testing.md
git commit -m "docs(testing): define test ownership layers"
```

---

### Task 2: Link the guide from project development docs

**Files:**
- Modify: `README.md`

**Step 1: Add a testing note under Local Development**

In `README.md`, after the useful commands list, add:

```markdown
Testing guidance: see [`docs/testing.md`](docs/testing.md) for which layer should own new regression coverage.
```

**Step 2: Run formatting/lint check for Markdown-adjacent edits**

Run:

```bash
bun run lint
```

Expected: PASS. If Biome reports Markdown is ignored and no source files changed, that is acceptable. If it reports a formatting issue in a touched file, run `bun run lint:fix`, inspect the diff, and rerun `bun run lint`.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): link testing ownership guide"
```

---

### Task 3: Mark backlog item P1-8 as planned

**Files:**
- Modify: `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`

**Step 1: Add plan reference to P1-8**

In the `### P1-8: Define targeted test ownership by layer` section, after the `**Risk:** low` line, add:

```markdown
**Plan:** `docs/plans/2026-04-28-targeted-test-ownership.md`
```

Do not remove the backlog item until the implementation is merged and verified.

**Step 2: Run a focused docs sanity check**

Run:

```bash
grep -n "docs/plans/2026-04-28-targeted-test-ownership.md" docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
```

Expected: one match under P1-8.

**Step 3: Commit**

```bash
git add docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
git commit -m "docs(reliability): record test ownership plan"
```

---

### Task 4: Verify documented commands and adjust if stale

**Files:**
- Modify if needed: `docs/testing.md`

**Step 1: Run the focused test command from the guide**

```bash
bun run test -- e2e/fixtures/fake-servers/manager.test.ts e2e/helpers/tasks.test.ts src/components/unmapped-files/mapping-dialog.browser.test.tsx
```

Expected: PASS. This proves the guide's sample Node, fixture/helper, and browser-test command is valid.

**Step 2: Run the e2e smoke command from the guide**

```bash
bun run test:e2e -- e2e/tests/11-unmapped-files.spec.ts
```

Expected: PASS. This proves the guide's workflow-layer smoke command is valid. If Chromium is not installed locally, the script should install it through `bun run test:e2e:install`.

**Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS.

**Step 4: Fix stale paths only if verification failed because a documented path is wrong**

If any command fails because a documented test path is stale, update `docs/testing.md` to use an existing equivalent test path and rerun the failed command. Do not change application code as part of this docs-focused item.

**Step 5: Commit any verification-driven docs fixes**

```bash
git add docs/testing.md
git commit -m "docs(testing): fix ownership guide examples"
```

Skip this commit if no docs fixes were needed.

---

### Task 5: Final validation and handoff

**Files:**
- Verify only; no planned edits.

**Step 1: Check working tree**

```bash
git status --short
```

Expected: clean working tree after commits.

**Step 2: Review final diff summary**

```bash
git log --oneline --max-count=5
```

Expected: commits include the testing guide, README link, and backlog plan reference.

**Step 3: Summarize implementation**

Report:

- Backlog item selected: `P1-8: Define targeted test ownership by layer`.
- Added guide: `docs/testing.md`.
- Linked guide: `README.md`.
- Backlog plan reference: `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`.
- Verification commands and pass/fail results.

**Step 4: Integration choice**

Use the finishing-a-development-branch skill after implementation passes. Per repository guidance, either create a PR or cherry-pick commits onto local `main` without a merge commit and clean up the worktree/branch.
