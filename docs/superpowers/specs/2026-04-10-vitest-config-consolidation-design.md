# Vitest Config Consolidation Design

Date: 2026-04-10

## Summary

Consolidate unit test execution into a single [`vitest.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.config.ts) that defines separate node and browser projects by filename suffix instead of path-based include and exclude lists. Remove the separate server-core Vitest config and script, and preserve the stricter server coverage gate by applying per-glob coverage thresholds to `src/server` source files inside the unified config.

## Goals

- Make `bun run test` the single entry point for all unit tests.
- Keep browser and node tests separated by runtime using filename conventions.
- Remove `test:coverage:server-core` and the extra Vitest config files.
- Replace large directory-based include and exclude lists with suffix-based project targeting.
- Preserve the stricter `95%` coverage requirement for server code without a separate Vitest config.

## Non-Goals

- Changing Playwright end-to-end test configuration in `e2e/tests`.
- Reorganizing source directories.
- Refactoring test internals beyond the filename rename and any minimal import or config fixes required by that rename.

## Current State

- [`package.json`](/Users/pauldiloreto/Projects/allstarr/package.json) defines:
  - `test` as `vitest run`
  - `test:coverage` as `vitest run --coverage`
  - `test:coverage:server-core` as a separate run against [`vitest.server-core.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.server-core.config.ts)
- [`vitest.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.config.ts) already uses Vitest projects, but test discovery is driven by multiple path-based include and exclude arrays.
- [`vitest.server-core.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.server-core.config.ts) exists only to run a second coverage pass over a server-core allowlist from [`vitest.server-core.allowlist.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.server-core.allowlist.ts) with stricter `95%` thresholds.
- Existing browser-mode unit tests mostly use `.test.tsx` names today, so suffix-based routing is not yet possible without renaming them.

## Proposed Approach

Use one Vitest config with two projects:

1. Node project
2. Browser project

Project routing will be based on suffix only:

- Node project targets regular `*.test.ts`, `*.test.tsx`, `*.spec.ts`, and `*.spec.tsx` files, but excludes `*.browser.test.ts`, `*.browser.test.tsx`, `*.browser.spec.ts`, and `*.browser.spec.tsx` so browser tests are not executed twice.
- Browser project targets only `*.browser.test.ts`, `*.browser.test.tsx`, `*.browser.spec.ts`, and `*.browser.spec.tsx`.

This keeps the minimal exclusion required to avoid overlap, while removing the current directory-specific include and exclude lists for components, hooks, routes, and server folders.

## File Naming Convention

Browser-mode unit tests will be renamed from `*.test.tsx` and `*.test.ts` to `*.browser.test.tsx` and `*.browser.test.ts` respectively.

Rules:

- Tests that import from `vitest/browser` should use the `.browser.test.*` suffix.
- Tests that rely on `vitest-browser-react` rendering helpers should use the `.browser.test.*` suffix if they are intended to run in the browser project.
- Regular node tests remain `*.test.ts[x]`.
- Playwright end-to-end tests remain `e2e/tests/*.spec.ts` and are unaffected.

## Coverage Design

Keep one coverage configuration in [`vitest.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.config.ts).

Coverage behavior:

- Preserve the existing global unit-test coverage thresholds.
- Remove the separate server-core coverage run.
- Add a stricter per-glob threshold for `src/server/**/*.{ts,tsx}`.
- Exclude test files from coverage matching so the stricter threshold applies to server source files, not test files.

Rationale:

- Vitest supports per-glob coverage thresholds inside one config, so a second config file is not required.
- Applying the stricter threshold to all `src/server` source files removes the need for a maintained allowlist.

Known risk:

- This is broader than the current curated allowlist. Based on the current tree, it reaches roughly all server source files, including thin wrappers, scheduler tasks, transport adapters, and helper modules. That can cause immediate coverage failures if some parts of `src/server` were not intended to meet the same `95%` bar.
- If this proves too blunt during implementation, the fallback is to narrow the threshold glob to a smaller source subset or adjust the threshold values, but the initial implementation should follow the full `src/server` boundary requested here.

## Configuration Changes

The implementation will make these config changes:

- Simplify [`vitest.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.config.ts) project discovery to suffix-based patterns.
- Keep the existing browser-specific alias and dependency optimization settings on the browser project.
- Remove exports that only existed to support the separate server-core config if they are no longer needed.
- Keep coverage include and exclude rules only where they still control report scope, not project routing.

The implementation will remove:

- [`vitest.server-core.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.server-core.config.ts)
- [`vitest.server-core.allowlist.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.server-core.allowlist.ts)
- `test:coverage:server-core` from [`package.json`](/Users/pauldiloreto/Projects/allstarr/package.json)

## Files Expected To Change

- [`vitest.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.config.ts)
- [`package.json`](/Users/pauldiloreto/Projects/allstarr/package.json)
- [`README.md`](/Users/pauldiloreto/Projects/allstarr/README.md)
- [`src/package-scripts.test.ts`](/Users/pauldiloreto/Projects/allstarr/src/package-scripts.test.ts)
- Browser unit test files renamed to `.browser.test.ts[x]`
- Removal of the old server-core config files

## Verification Plan

Run the following after implementation:

- `bun run test`
- `bun run test:coverage`
- `bun run typecheck`

If coverage failures occur specifically from the expanded `src/server` threshold scope, inspect the uncovered files and decide whether the threshold should remain broad or be narrowed in a follow-up change.

## Success Criteria

- `bun run test` executes both node and browser unit tests through a single Vitest config.
- Browser tests are discovered only by the `.browser.test.ts[x]` suffix.
- The current path-heavy include and exclude lists used for project routing are removed or reduced to the minimal suffix-based overlap prevention.
- `test:coverage:server-core` no longer exists.
- [`vitest.server-core.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.server-core.config.ts) and [`vitest.server-core.allowlist.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.server-core.allowlist.ts) no longer exist.
- The stricter `95%` coverage gate still applies to `src/server` source files through the unified config.
