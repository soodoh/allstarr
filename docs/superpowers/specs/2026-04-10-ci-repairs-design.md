# CI Repairs — Design

**Date:** 2026-04-10
**Branch:** `fix/ci-repairs` (worktree at `.worktrees/fix-ci-repairs`)
**Status:** Approved

## Problem

Every CI run on `main` since 2026-04-08 has failed. Run `24271025865` (latest, at HEAD `c03bce5`) surfaces four distinct failures:

1. **Typecheck** — 173 `tsc` errors across 23 test files. Introduced by the vitest-browser-mode test migration (commits `b025515`, `ad22f8f`, `b6e04b8` on 4/9–4/10).
2. **Docker Verify** — `bun install --frozen-lockfile` in the builder stage fails with `Couldn't find patch file: 'patches/@vitest%2Fbrowser@4.1.4.patch'`. `Dockerfile:6` only copies `package.json bun.lock` before installing, but commit `c03bce5` added `patchedDependencies` pointing at `patches/*.patch`.
3. **Unit / Component Tests** — The hosted runner is killed after 47 minutes with "lost communication with the server" (OOM or hang). Earlier CI runs failed before this step executed because typecheck short-circuited them; `c03bce5` made tests actually reach this step, and now they don't complete.
4. **Node 20 deprecation warning** — `docker/build-push-action@v6` and `docker/setup-buildx-action@v3` run on Node 20, deprecated June 2, 2026. Non-blocking but worth fixing while we're in the file.

## Scope

One worktree, one branch, four fixes. All land together. The scope is explicitly CI repair — not a broader test-infrastructure refactor.

## Design

### 1. Typecheck

**Root causes:**
- **HookRunner duplication (8 files, ~160 errors).** Each file in `src/hooks/mutations/*.browser.test.ts` defines its own local helper:
  ```ts
  type HookRunner = () => { mutateAsync: (variables: unknown) => Promise<unknown> }
  async function runMutation(useHook: HookRunner, variables: unknown) { ... }
  ```
  This clashes with react-query's `UseMutationResult`, whose `mutateAsync` has a *strongly-typed* variables parameter, not `unknown`. `(variables: SomeType) => Promise<X>` is **not** assignable to `(variables: unknown) => Promise<unknown>` (contravariant parameter).
- **`src/test/render.tsx:56–71`.** `renderHookWithProviders` and `renderHook` type their `callback` as `(initialProps: Props) => Result` but pass it to `vbrRenderHook` which expects `(initialProps?: Props) => Result`.
- **Individual test issues (~10 errors).** Component-test API drift, stale server-test mocks typed as `never`, one stray `.validator` instead of `.inputValidator`, one `null → string` assignment.

**Fix:**

Create a new shared helper at `src/test/mutations.ts`:

```ts
import { renderHookWithProviders } from "src/test/render";

export async function runMutation<TVars, TResult>(
  useHook: () => { mutateAsync: (variables: TVars) => Promise<TResult> },
  variables: TVars,
): Promise<TResult> {
  const { result } = renderHookWithProviders(useHook);
  return result.current.mutateAsync(variables);
}
```

The generic parameters are inferred from the hook's return type at each call site, so callers get strong typing without annotating anything. The `UseMutationResult` shape is assignable to `{ mutateAsync: (v: TVars) => Promise<TResult> }` because the generics propagate instead of being widened to `unknown`.

Delete the local `HookRunner` type and `runMutation` function from each of:
- `src/hooks/mutations/books.browser.test.ts`
- `src/hooks/mutations/custom-formats.browser.test.ts`
- `src/hooks/mutations/download-clients.browser.test.ts`
- `src/hooks/mutations/download-profiles.browser.test.ts`
- `src/hooks/mutations/episode-profiles.browser.test.ts`
- `src/hooks/mutations/indexers.browser.test.ts`
- `src/hooks/mutations/settings.browser.test.ts`
- `src/hooks/mutations/user-settings.browser.test.ts`

Replace with `import { runMutation } from "src/test/mutations";`.

Fix `src/test/render.tsx:56–71` by making `callback`'s `initialProps` parameter optional:

```ts
export function renderHookWithProviders<Result, Props>(
  callback: (initialProps?: Props) => Result,
) { ... }
```

Individual fixes, discovered and addressed during the typecheck pass:
- `src/components/bookshelf/books/base-book-table.browser.test.tsx:202` — narrow the element type before `.click()` (e.g. `if (el instanceof HTMLElement) el.click()`).
- `src/components/ui/command.browser.test.tsx:99` — replace `.locator(...)` with the correct vitest-browser API; verify against installed `@vitest/browser` version.
- `src/server/series.test.ts:33` — rename `.validator` to `.inputValidator` on the `createServerFn` mock (per TanStack Start memory).
- `src/server/scheduler/tasks/search-missing.test.ts`, `src/server/__tests__/disk-scan.test.ts`, `src/server/__tests__/import.test.ts`, `src/server/__tests__/indexers.test.ts`, `src/server/auto-search.test.ts`, `src/server/download-clients.test.ts`, `src/server/scheduler/registry.test.ts`, `src/server/scheduler/tasks/rss-sync.test.ts` — `{ id: number } → never` errors indicate mock return values are being assigned to overly-narrow stub types. Provide generic mock helpers or widen the stub return types per file.
- `src/server/tmdb/shows.test.ts:127` — `null → string` assignment; provide a real string or widen via `as unknown as string` with a comment explaining why (if the field genuinely accepts null in fixture data).
- `src/package-scripts.test.ts`, `src/routes/_authed/settings/routes.browser.test.tsx` — inspect on the fly.

**Gate:** `bun run typecheck` exits 0.

### 2. Dockerfile patches

Modify `Dockerfile`:

```diff
 FROM oven/bun:1-alpine AS builder
 WORKDIR /app
-COPY package.json bun.lock ./
+COPY package.json bun.lock ./
+COPY patches ./patches
 RUN bun install --frozen-lockfile --ignore-scripts
 ...
 COPY --from=builder /app/package.json ./package.json
 COPY --from=builder /app/bun.lock ./bun.lock
+COPY --from=builder /app/patches ./patches
 RUN bun install --production --ignore-scripts
```

Patches are copied into both stages because `bun install` validates the patch manifest against the lockfile entries even when `--production` skips devDependencies (the patched packages themselves aren't installed in stage 2, but bun still resolves the manifest).

**Gate:** `docker build .` succeeds locally.

### 3. Unit-test hang — investigate first

Before touching CI config, reproduce locally:

```bash
time bun run test:coverage
```

Three outcomes:

- **Completes in reasonable time (< 5 min), exit 0.** The hang is CI-specific — almost certainly memory pressure from vitest browser + monocart coverage + Chromium on a 7 GB GitHub hosted runner. Remedy: add `NODE_OPTIONS: --max-old-space-size=6144` to the unit job env in `.github/workflows/ci.yml`. If still insufficient, shard via `vitest --shard=1/2` and `--shard=2/2` across two parallel jobs. No source changes.
- **Completes but very slow (> 10 min locally).** Monocart instrumentation overhead. Check `vitest.config.ts` `coverage.include` / `coverage.exclude` — narrow to `src/` and exclude test fixtures. Re-measure.
- **Hangs locally.** A real bug. Bisect with `bun run test:coverage --bail=1` and targeted `--exclude` until the culprit file is isolated. Fix at source.

**Decision point:** After the local run completes (or is killed), pick one remedy path. Document findings in the implementation plan before touching code.

**Gate:** CI unit job completes in < 15 minutes.

### 4. Node 20 deprecation

In `.github/workflows/ci.yml`:
- Bump `docker/build-push-action@v6` → `@v7` (confirm current stable via context7 before editing).
- Bump `docker/setup-buildx-action@v3` → current stable.

No other changes. If the new majors introduce breaking changes (unlikely — these are stable actions), revisit.

**Gate:** `Docker Verify` job no longer emits the Node 20 deprecation warning.

## Execution order

1. Create worktree `.worktrees/fix-ci-repairs` from `main`. *(Done.)*
2. Write and commit this spec.
3. Dockerfile fix + local `docker build .` verification.
4. Typecheck fixes: shared helper → render.tsx → mutation tests → component tests → server tests. Gate on `bun run typecheck`.
5. Local unit-test investigation; apply indicated remedy.
6. Action version bumps.
7. `bun run lint`, `bun run test`, final `docker build .`.
8. Push branch; confirm CI green.
9. Cherry-pick onto local `main` per CLAUDE.md workflow; clean up worktree and branch.

## Verification checklist

- [ ] `bun run typecheck` — 0 errors
- [ ] `bun run lint` — clean
- [ ] `bun run test` — passes locally
- [ ] `docker build .` — succeeds locally
- [ ] Remote CI: Lint, Typecheck, Unit/Component Tests, E2E + Merged Coverage, Docker Verify all green
- [ ] No Node 20 deprecation warning in Docker Verify logs

## Out of scope

- Broader test-infrastructure refactor (e.g., extracting other duplicated test helpers beyond `runMutation`).
- Changing the vitest browser-mode migration itself; we accept the migration as-is and only fix the type fallout.
- Monocart coverage configuration beyond what's needed to resolve the CI hang.
- Any non-test source-code changes.
