# Reliability Code Quality Backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a large, ranked backlog of concrete reliability and code-quality improvements for Allstarr, with repo evidence and verification guidance for each item.

**Architecture:** This is a documentation/audit deliverable, not a code implementation. The work is split into focused audit passes that collect evidence, then a synthesis pass that writes one backlog artifact with priorities, size, risk, and verification plans.

**Tech Stack:** TypeScript, Bun, TanStack Start, Drizzle/SQLite, Vitest browser tests, Playwright e2e, Biome, GitHub Actions, Docker.

---

### Target File Structure

**Files:**
- Read: `docs/superpowers/specs/2026-04-27-reliability-code-quality-backlog-design.md`
- Create: `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`
- Modify: none outside the backlog document

The backlog document owns the audit output. Do not edit application source files during this plan. Do not edit generated files such as `src/routeTree.gen.ts` or anything under `.worktrees/`.

### Backlog Document Template

Use this exact structure for `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`:

```markdown
# Reliability and Code Quality Backlog

## Summary

This backlog ranks reliability and code-quality improvements for Allstarr. Items are based on repository evidence from server workflows, external integrations, tests/CI, and operational runtime paths.

## Ranking Rubric

- P0: Production-risk failure modes where data can become incorrect, jobs can become stuck, imports/downloads can transition incorrectly, or external failures can leave persistent bad state.
- P1: Recurring maintainability or test-confidence problems in active code paths.
- P2: Improvements to clarity, observability, local development, or CI quality where the current behavior is serviceable but fragile or expensive.
- P3: Longer-term cleanup or architectural follow-ups after higher-risk work is complete.

## Recommended First Tranche

1. Harden scheduler and job-run lifecycle invariants.
2. Make tracked download state transitions explicit.
3. Strengthen import and file-move atomicity.
4. Centralize external HTTP timeout, retry, and rate-limit behavior.
5. Add restart/recovery regression tests for long-running workflows.

## Backlog

### P0-1: Harden scheduler and job-run lifecycle invariants

**Theme:** Runtime reliability
**Size:** M
**Risk:** medium

**Problem:** Scheduler tasks and ad-hoc commands depend on active job-run records, heartbeat intervals, dedupe keys, and restart cleanup. These paths are stateful and can leave confusing persisted state if startup, completion, duplicate execution, or heartbeat expiry behavior diverges.

**Evidence:** `src/server/scheduler/index.ts`, `src/server/commands.ts`, `src/server/job-runs.ts`, `src/server/scheduler/timers.ts`, and recent task reliability commits.

**Impact:** Operators can see stale or incorrect task state, and later executions may be blocked or misreported.

**Suggested implementation:** Define explicit lifecycle invariants for queued/running/completed/failed/expired runs, centralize startup cleanup and completion behavior, and add regression tests for restart recovery, heartbeat expiry, and duplicate execution.

**Verification plan:** Run `bun run test -- src/server/job-runs.test.ts src/server/scheduler/index.test.ts src/server/commands.test.ts` plus `bun run typecheck`.
```

Before finishing, replace any copied sample item that is not supported by the audit. The final backlog must contain only audited items with concrete evidence from this repository.

### Task 1: Runtime Reliability Audit

**Files:**
- Read: `src/server/commands.ts`
- Read: `src/server/job-runs.ts`
- Read: `src/server/scheduler/index.ts`
- Read: `src/server/scheduler/timers.ts`
- Read: `src/server/download-manager.ts`
- Read: `src/server/tracked-download-state.ts`
- Read: `src/server/file-import.ts`
- Read: `src/server/imports/apply.ts`
- Read: `src/server/unmapped-files.ts`
- Read: `src/server/auto-search.ts`
- Read: related `*.test.ts` files for these modules
- Write notes into: `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`

- [ ] **Step 1: Inspect runtime reliability hotspots**

Run:

```bash
rg -n "heartbeat|active|dedupe|transaction\\(|setInterval|setTimeout|state|status|retry|timeout|catch \\(|onConflict|rollback|trackedDownload|jobRun|command" src/server src/routes/api -g '!*.test.ts' -g '!*.test.tsx'
```

Expected: matches in scheduler, commands, job-runs, download manager, import, unmapped files, indexer/http, API cache, and external clients.

- [ ] **Step 2: Inspect recent reliability history**

Run:

```bash
git log --oneline -n 20 -- src/server src/routes/_authed/system src/routes/api
```

Expected: recent commits include task/job/download/import reliability work. Use those commits as evidence of active maintenance areas, not as proof of bugs.

- [ ] **Step 3: Draft at least 6 runtime reliability backlog items**

Add items to the backlog file using this shape:

```markdown
### P0-1: Harden scheduler and job-run lifecycle invariants

**Theme:** Runtime reliability
**Size:** M
**Risk:** medium

**Problem:** Scheduler tasks and ad-hoc commands depend on active job-run records, heartbeat intervals, dedupe keys, and restart cleanup. These paths are stateful and can leave confusing persisted state if startup, completion, duplicate execution, or heartbeat expiry behavior diverges.

**Evidence:** `src/server/scheduler/index.ts`, `src/server/commands.ts`, `src/server/job-runs.ts`, `src/server/scheduler/timers.ts`, and recent task reliability commits.

**Impact:** Operators can see stale or incorrect task state, and later executions may be blocked or misreported.

**Suggested implementation:** Define explicit lifecycle invariants for queued/running/completed/failed/expired runs, centralize startup cleanup and completion behavior, and add regression tests for restart recovery, heartbeat expiry, and duplicate execution.

**Verification plan:** Run `bun run test -- src/server/job-runs.test.ts src/server/scheduler/index.test.ts src/server/commands.test.ts` plus `bun run typecheck`.
```

Also include runtime items for tracked download state transitions, import/file move atomicity, unmapped file mapping rollback, external API retry consistency, auto-search partial-failure handling, and SQLite transaction boundary clarity.

- [ ] **Step 4: Verify runtime items have concrete evidence**

Run:

```bash
rg -n "Harden scheduler|tracked download|rollback|retry|auto-search|transaction" docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
```

Expected: every runtime item has file-level evidence and a verification plan with exact commands.

### Task 2: Maintainability Audit

**Files:**
- Read: `src/server/auto-search.ts`
- Read: `src/server/import.ts`
- Read: `src/server/unmapped-files.ts`
- Read: `src/server/search.ts`
- Read: `src/server/books.ts`
- Read: `src/server/shows.ts`
- Read: `src/routes/_authed/authors/$authorId.tsx`
- Read: `src/components/unmapped-files/mapping-dialog.tsx`
- Write notes into: `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`

- [ ] **Step 1: Measure large production files**

Run:

```bash
find src -type f \( -name '*.ts' -o -name '*.tsx' \) -not -name '*.test.ts' -not -name '*.test.tsx' -not -name '*.browser.test.tsx' -not -name 'routeTree.gen.ts' -print0 | xargs -0 wc -l | sort -n | tail -40
```

Expected: large files include `src/server/auto-search.ts`, `src/server/import.ts`, `src/server/unmapped-files.ts`, `src/server/search.ts`, `src/server/books.ts`, `src/server/shows.ts`, and route/component files.

- [ ] **Step 2: Find repeated media-domain flows**

Run:

```bash
rg -n "book|movie|show|series|episode|author|profile|rootFolder|monitor|quality|format" src/server src/components src/routes/_authed -g '!*.test.ts' -g '!*.test.tsx' -g '!*.browser.test.tsx'
```

Expected: repeated flows appear across books, movies, shows, series, profiles, imports, search, and detail views.

- [ ] **Step 3: Draft at least 5 maintainability backlog items**

Add items covering:

```markdown
### P1-1: Split auto-search into planning, indexer search, and download dispatch boundaries

**Theme:** Code maintainability
**Size:** L
**Risk:** high

**Problem:** Auto-search coordinates target selection, profile evaluation, indexer search, custom-format scoring, failure handling, and download dispatch in one large service module. This makes reliability fixes harder to isolate and increases regression risk.

**Evidence:** `src/server/auto-search.ts`, `src/server/auto-search.test.ts`, `src/server/auto-search-indexer-search.ts`, and `src/server/auto-search-download-dispatch.ts`.

**Impact:** Future changes to search behavior or download dispatch are harder to review, test, and reason about.

**Suggested implementation:** Extract a pure planning layer, keep indexer search orchestration separate, and keep download dispatch as a final side-effect boundary. Move tests toward smaller units before any behavior changes.

**Verification plan:** Run targeted auto-search tests with `bun run test -- src/server/auto-search.test.ts src/server/auto-search-indexer-search.test.ts src/server/auto-search-download-dispatch.test.ts`.
```

Also include items for import module phase boundaries, unmapped file mapping service boundaries, route view-model extraction for large route files, and shared media/profile primitives where duplication creates risk.

- [ ] **Step 4: Verify maintainability items are not generic cleanup**

Run:

```bash
rg -n "Code maintainability|auto-search|import|unmapped|view-model|shared media|profile" docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
```

Expected: each maintainability item explains how it reduces reliability risk or future change risk.

### Task 3: Test and CI Confidence Audit

**Files:**
- Read: `vitest.config.ts`
- Read: `e2e/playwright.config.ts`
- Read: `.github/workflows/ci.yml`
- Read: `scripts/merge-coverage.ts`
- Read: `e2e/fixtures/fake-servers/manager.ts`
- Read: `e2e/fixtures/golden/README.md`
- Read: `e2e/global-setup.ts`
- Read: `e2e/global-teardown.ts`
- Write notes into: `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`

- [ ] **Step 1: Inspect test and CI configuration**

Run:

```bash
sed -n '1,240p' vitest.config.ts
sed -n '1,240p' e2e/playwright.config.ts
sed -n '1,260p' .github/workflows/ci.yml
```

Expected: unit/browser projects, merged coverage, Playwright e2e, Docker verify, and artifact handoff are visible.

- [ ] **Step 2: Inspect fixture and fake-service stability**

Run:

```bash
find e2e/fixtures e2e/helpers -maxdepth 3 -type f | sort
rg -n "setTimeout|waitFor|retry|port|reset|seed|golden|compose-live|fake server|coverage" e2e scripts src/test
```

Expected: fake services, golden fixtures, wait loops, reset behavior, and coverage scripts are visible.

- [ ] **Step 3: Draft at least 5 test/CI backlog items**

Add items covering:

```markdown
### P1-2: Add a flake budget and diagnostics for e2e wait loops

**Theme:** Test and CI confidence
**Size:** M
**Risk:** low

**Problem:** E2E reliability depends on fake services, app startup, reset endpoints, SSE behavior, and explicit wait loops. Failures can be expensive to diagnose without consistent timing diagnostics.

**Evidence:** `e2e/fixtures/app.ts`, `e2e/fixtures/fake-servers/manager.ts`, `e2e/global-setup.ts`, `e2e/global-teardown.ts`, and `e2e/playwright.config.ts`.

**Impact:** CI failures can be harder to reproduce and may slow down reliability work.

**Suggested implementation:** Add structured setup/teardown timing logs, collect fake-service readiness diagnostics on failure, and document a small flake triage process without increasing retries.

**Verification plan:** Run `bun run test:e2e` locally and confirm failure artifacts still include Playwright trace and screenshots on retry/failure.
```

Also include items for targeted test ownership by layer, coverage threshold signal quality, CI dependency/cache cost, golden fixture drift checks, and browser test helper consistency.

- [ ] **Step 4: Verify test/CI items preserve thresholds**

Run:

```bash
rg -n "coverage|threshold|flake|e2e|browser|golden|CI|GitHub Actions" docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
```

Expected: test/CI items do not propose lowering coverage thresholds or replacing test layers.

### Task 4: Operational Quality Audit

**Files:**
- Read: `Dockerfile`
- Read: `compose.yml`
- Read: `scripts/docker-entrypoint.sh`
- Read: `src/server/system-info.ts`
- Read: `src/server/system-status.ts`
- Read: `src/routes/api/v1/system/status.ts`
- Read: `src/server/scheduler/tasks/backup.ts`
- Read: `src/server/scheduler/tasks/housekeeping.ts`
- Read: `src/lib/auth-config.ts`
- Read: `.env.example`
- Write notes into: `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`

- [ ] **Step 1: Inspect operational/runtime surfaces**

Run:

```bash
sed -n '1,220p' Dockerfile
sed -n '1,260p' compose.yml
sed -n '1,220p' scripts/docker-entrypoint.sh
sed -n '1,220p' .env.example
```

Expected: Docker build/runtime configuration, compose services, entrypoint behavior, and environment settings are visible.

- [ ] **Step 2: Inspect health/status and maintenance tasks**

Run:

```bash
rg -n "health|status|backup|housekeeping|PRAGMA|VACUUM|DATABASE_URL|BETTER_AUTH_URL|HARDCOVER|TMDB|OIDC|logger|console" src/server src/routes/api src/lib scripts Dockerfile compose.yml .env.example
```

Expected: health/status endpoints, backup/housekeeping tasks, database path handling, auth/external tokens, and logging surfaces are visible.

- [ ] **Step 3: Draft at least 4 operational backlog items**

Add items covering:

```markdown
### P2-1: Strengthen startup environment validation and status diagnostics

**Theme:** Operational quality
**Size:** M
**Risk:** low

**Problem:** Runtime behavior depends on environment values for database location, auth URL, OIDC providers, Hardcover, TMDB, and Docker/runtime paths. Operators need early, actionable feedback when configuration is incomplete or inconsistent.

**Evidence:** `.env.example`, `src/lib/auth-config.ts`, `src/server/system-info.ts`, `src/server/system-status.ts`, and `src/routes/api/v1/system/status.ts`.

**Impact:** Misconfiguration can surface later as failed imports, auth problems, or unclear health status.

**Suggested implementation:** Add a central startup validation report for required and optional integrations, then surface sanitized diagnostics through the existing system status route.

**Verification plan:** Run `bun run test -- src/lib/auth-config.test.ts src/server/system-info.test.ts src/server/system-status.test.ts` plus `bun run typecheck`.
```

Also include items for backup/housekeeping safety, Docker runtime smoke checks, migration/SQLite pragma diagnostics, and structured logging for background failures.

- [ ] **Step 4: Verify operational items are actionable**

Run:

```bash
rg -n "Operational quality|startup|status|Docker|backup|housekeeping|SQLite|logging" docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
```

Expected: operational items include repo evidence and exact verification commands.

### Task 5: Synthesize Rankings and First Tranche

**Files:**
- Modify: `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`

- [ ] **Step 1: Normalize priorities and numbering**

Ensure item headings use stable numbering:

```markdown
### P0-1: Harden scheduler and job-run lifecycle invariants
### P0-2: Make tracked download state transitions explicit
### P0-3: Strengthen import and file-move atomicity
### P1-1: Split auto-search into planning, indexer search, and download dispatch boundaries
```

Expected: headings are grouped by priority and numbered within each priority.

- [ ] **Step 2: Fill the recommended first tranche**

Use 5 items total:

```markdown
## Recommended First Tranche

1. Harden scheduler and job-run lifecycle invariants.
2. Make tracked download state transitions explicit.
3. Strengthen import and file-move atomicity.
4. Centralize external HTTP timeout, retry, and rate-limit behavior.
5. Add restart/recovery regression tests for long-running workflows.
```

Expected: the tranche favors P0/P1 runtime reliability work with bounded blast radius.

- [ ] **Step 3: Ensure every item has required fields**

Run:

```bash
rg -n "^### P|^\\*\\*Theme:\\*\\*|^\\*\\*Size:\\*\\*|^\\*\\*Risk:\\*\\*|^\\*\\*Problem:\\*\\*|^\\*\\*Evidence:\\*\\*|^\\*\\*Impact:\\*\\*|^\\*\\*Suggested implementation:\\*\\*|^\\*\\*Verification plan:\\*\\*" docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
```

Expected: each backlog item has all required fields.

- [ ] **Step 4: Remove template markers**

Run:

```bash
node -e 'const fs = require("fs"); const text = fs.readFileSync(process.argv[1], "utf8"); const markers = ["TB" + "D", "TO" + "DO", "FIX" + "ME", "implement " + "later", "Similar " + "to", "UNRESOLVED", "EXAMPLE_ONLY", "DRAFT_MARKER"]; for (const marker of markers) { if (text.includes(marker)) { console.log(marker); process.exitCode = 1; } }' docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
```

Expected: no matches.

### Task 6: Verify and Commit Backlog

**Files:**
- Modify: `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`

- [ ] **Step 1: Run documentation-focused checks**

Run:

```bash
bun run lint
```

Expected: PASS. Biome may skip Markdown formatting, but this catches accidental repository-wide lint issues before commit.

- [ ] **Step 2: Confirm only documentation changed**

Run:

```bash
git status --short
git diff --stat
```

Expected: only `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md` is modified or untracked.

- [ ] **Step 3: Commit the backlog**

Run:

```bash
git add docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
git commit -m "docs(quality): add reliability backlog"
```

Expected: commit succeeds. Do not include `Co-authored-by` trailers.

- [ ] **Step 4: Report the result**

Summarize:

```markdown
Backlog complete:
- File: docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
- Commit: the SHA printed by `git log --oneline -n 1`, with subject `docs(quality): add reliability backlog`
- First tranche: scheduler/job lifecycle, tracked download transitions, import/file atomicity, shared HTTP retry/timeout handling, restart/recovery tests
- Verification: bun run lint
```
