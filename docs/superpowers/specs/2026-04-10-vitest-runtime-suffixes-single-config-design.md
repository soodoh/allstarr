# Vitest Runtime Suffixes + Single Config Design

## Summary

Consolidate the repo onto a single root `vitest.config.ts` with two explicit Vitest projects:

- `node`
- `browser`

Replace path-based discovery rules with runtime suffixes:

- `*.node.test.ts`
- `*.node.test.tsx`
- `*.browser.test.ts`
- `*.browser.test.tsx`

This is a full rename with no compatibility layer. Legacy Vitest `*.test.*` and `*.spec.*` filenames stop being discovered outside Playwright e2e.

## Goals

- Use one Vitest config entry point for all Vitest execution.
- Make runtime selection obvious from the filename instead of inferred from folder structure.
- Remove most explicit include/exclude lists from test discovery.
- Preserve the current browser-mode setup and the current server-core coverage gate.
- Keep CI job boundaries stable while simplifying local and scripted test execution.

## Non-Goals

- Do not redesign Playwright e2e naming or structure under `e2e/`.
- Do not refactor source modules just to eliminate the existing server-core coverage allowlist.
- Do not introduce extra filename taxonomy for unit/integration/component intent.
- Do not support a transition period where old and new suffixes both work.

## Current State

The repo currently uses:

- A root `vitest.config.ts` with two projects and substantial include/exclude routing.
- A separate `vitest.server-core.config.ts` for the 95% server-core coverage gate.
- A curated `vitest.server-core.allowlist.ts` for source files covered by that gate.

Current test routing is driven partly by file extension and partly by directory heuristics:

- frontend/browser tests are inferred from `.tsx` and selected directories
- node tests are inferred by excluding browser-oriented paths
- server-core coverage uses a separate config file instead of a profile within one config

This creates three problems:

1. Runtime is not obvious from the filename.
2. Test discovery requires ongoing include/exclude maintenance.
3. Vitest behavior is split across two config entry points.

## External Research

Current official docs support the overall direction:

- Vitest projects are the standard mechanism for running different configurations from one config file.
- Vitest documentation examples use suffix-based discovery patterns such as `**/*.{browser}.test.{ts,js}` and `**/*.{node}.test.{ts,js}` for project-specific routing.
- Playwright documentation also uses suffix-driven project filtering with names like `*.smoke.spec.ts` and `*.setup.ts`.

The conclusion from current docs is:

- suffix-based routing is standard practice
- `.node.test.ts` and `.browser.test.ts` are reasonable repo conventions
- these exact suffixes are not mandated by Vitest, so the repo should treat them as house style

Sources:

- Vitest Projects / Workspace: https://vitest.dev/guide/workspace
- Vitest Browser Multiple Setups: https://vitest.dev/guide/browser/multiple-setups.html
- Playwright Projects: https://playwright.dev/docs/test-projects

## Proposed Design

### 1. Single Root Vitest Config

Keep one root `vitest.config.ts` as the only Vitest config entry point.

It defines two projects:

- `node`
- `browser`

The `node` project runs Node-runtime tests and owns all `*.node.test.*` files.

The `browser` project runs Playwright-backed Vitest browser mode and owns all `*.browser.test.*` files. It keeps the existing browser-specific alias stubs and dependency optimization settings already required by the repo.

### 2. Runtime-Only Filename Convention

Adopt one naming rule: the suffix encodes runtime only.

Allowed Vitest suffixes:

- `*.node.test.ts`
- `*.node.test.tsx`
- `*.browser.test.ts`
- `*.browser.test.tsx`

Playwright e2e remains separate and can continue using `*.spec.ts`.

This avoids filename bloat such as `.unit.node.test.ts` or `.component.browser.test.tsx`. Runtime is the part Vitest needs for routing; intent is not needed to solve the current problem.

### 3. Discovery Rules

The root config should discover tests primarily by suffix rather than path.

Target shape:

- node project `include`: `["src/**/*.node.test.{ts,tsx}", "e2e/fixtures/**/*.node.test.{ts,tsx}"]`
- browser project `include`: `["src/**/*.browser.test.{ts,tsx}", "e2e/fixtures/**/*.browser.test.{ts,tsx}"]`

The goal is to avoid large negative filters. Some small, local exclusions may still be acceptable if Vitest or coverage tooling requires them, but directory-based test classification should be removed.

### 4. Coverage Profiles In One Config

Keep two logical coverage modes, but drive both from the same root config:

- default unit/component coverage profile
- server-core coverage profile

The default coverage profile continues to run across both Vitest projects and produces the raw output consumed by the existing merge step.

The server-core profile is activated by an environment selector or equivalent script-level switch, for example:

- `VITEST_COVERAGE_PROFILE=default`
- `VITEST_COVERAGE_PROFILE=server-core`

This removes `vitest.server-core.config.ts` while preserving the separate CI gate.

### 5. Server-Core Allowlist

Do not try to eliminate `vitest.server-core.allowlist.ts` in this change.

Reason:

- test discovery and source coverage targeting are different concerns
- suffixes solve test routing, not curated source ownership
- forcing both problems into the same change would require a larger source-tree refactor

The allowlist can remain as the source include list for the server-core coverage profile until the repo chooses to create a dedicated source boundary such as `src/server/core/**`.

### 6. Script Shape

Keep the public script surface familiar, but point everything at the root config:

- `test` -> run all Vitest projects
- `test:watch` -> watch all Vitest projects
- `test:coverage` -> root config with default coverage profile
- `test:coverage:server-core` -> root config with server-core coverage profile enabled

This preserves the current CI job split without keeping two config files.

### 7. CI Shape

Keep the existing high-level CI jobs:

- `unit`
- `coverage-server-core`
- `e2e`

The change is operational, not structural:

- `unit` still runs unit/component coverage and uploads raw unit coverage
- `coverage-server-core` still enforces the 95% curated server-core gate
- `e2e` still downloads unit raw coverage, runs Playwright e2e coverage, and merges reports

The difference is that both Vitest jobs run through the same root config with different coverage-profile inputs.

## Migration Plan

This is a clean break migration.

### Rename Strategy

Rename all current Vitest test files in one pass.

Classification rule:

- tests that require Vitest browser mode become `*.browser.test.*`
- tests that do not become `*.node.test.*`

Current import usage is a strong signal:

- tests importing `vitest/browser` should map to `*.browser.test.*`
- tests without browser-mode dependencies should usually map to `*.node.test.*`

Ambiguous files should be classified by actual runtime needs, not by extension alone.

### Discovery Cutover

After rename:

- the config only recognizes `*.node.test.*` and `*.browser.test.*`
- old Vitest `*.test.*` and `*.spec.*` names are intentionally undiscoverable

This prevents the repo from drifting back into mixed naming.

### Lightweight Enforcement

Add one small enforcement mechanism so new tests follow the rule. Acceptable options include:

- a meta-test that scans for invalid Vitest test suffixes
- a small script checked in CI

The rule should be narrow: Vitest tests must end in `.node.test.*` or `.browser.test.*`, while Playwright e2e under `e2e/` can continue using `*.spec.ts`.

## Risks And Mitigations

### Risk: Wrong Runtime Classification During Rename

Some `.tsx` tests may look like browser tests but not actually require browser mode, and a smaller number of `.ts` tests may still rely on browser behavior.

Mitigation:

- classify by imported runtime dependencies and test helpers
- run the full Vitest suite immediately after the rename
- fix any stragglers before merging

### Risk: Editor / Test Explorer Friction

Repo-wide test renames can disrupt local test explorer assumptions and muscle memory.

Mitigation:

- keep the suffix rule simple and global
- keep project names stable and explicit: `node`, `browser`

### Risk: Over-scoping The Change

Trying to also eliminate the server-core source allowlist would turn a test-infra cleanup into a source-architecture refactor.

Mitigation:

- keep the allowlist for now
- treat source consolidation as a later, separate proposal

## Testing And Verification

Before considering the migration complete:

- run all Vitest projects with the renamed files
- run default coverage mode from the root config
- run server-core coverage mode from the root config
- confirm raw unit coverage output still matches the merge step expectations
- run the existing e2e coverage flow to confirm merged coverage still works
- confirm CI still enforces the 95% server-core gate

## Recommendation

Proceed with:

- one root `vitest.config.ts`
- two projects: `node` and `browser`
- full rename to `.node.test.*` and `.browser.test.*`
- no compatibility window
- server-core coverage kept as a profile inside the root config
- server-core allowlist retained for now

This is the smallest design that meaningfully improves clarity and removes ongoing config churn without bundling in an unrelated source-tree refactor.
