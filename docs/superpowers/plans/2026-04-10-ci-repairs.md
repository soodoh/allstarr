# CI Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four blocking CI failures on `main` — typecheck regressions, missing Dockerfile patches, unit-test runner timeout, and the Node 20 deprecation — so that CI goes green.

**Architecture:** Work happens in `.worktrees/fix-ci-repairs` on branch `fix/ci-repairs`. Fixes are ordered from lowest-risk/fastest (Dockerfile) to highest-unknown (unit-test hang). The typecheck fix centralizes a duplicated `runMutation` helper across 8 mutation test files into `src/test/mutations.ts`, then cleans up the 8 callers.

**Tech Stack:** TypeScript, vitest 4 (browser mode + Chromium via Playwright), vitest-browser-react, react-query, monocart coverage, bun, Docker, GitHub Actions.

**Working directory for all commands:** `/Users/pauldiloreto/Projects/allstarr/.worktrees/fix-ci-repairs`

---

## File inventory

**Create:**
- `src/test/mutations.ts` — shared `runMutation` helper (new)

**Modify:**
- `Dockerfile` — copy `patches/` into both stages before `bun install`
- `src/test/render.tsx` — make `renderHook*` callback `initialProps` optional
- `src/hooks/mutations/books.browser.test.ts` — delete local helper, import shared
- `src/hooks/mutations/custom-formats.browser.test.ts` — ditto
- `src/hooks/mutations/download-clients.browser.test.ts` — ditto
- `src/hooks/mutations/download-profiles.browser.test.ts` — ditto
- `src/hooks/mutations/episode-profiles.browser.test.ts` — ditto
- `src/hooks/mutations/indexers.browser.test.ts` — ditto
- `src/hooks/mutations/settings.browser.test.ts` — ditto
- `src/hooks/mutations/user-settings.browser.test.ts` — ditto
- `src/components/bookshelf/books/base-book-table.browser.test.tsx` — narrow element type before `.click()`
- `src/components/ui/command.browser.test.tsx` — replace invalid `.locator(...)` API call
- `src/server/series.test.ts` — `.validator` → `.inputValidator`
- `src/server/tmdb/shows.test.ts` — fix `null → string` assignment
- `src/server/scheduler/tasks/search-missing.test.ts` — fix stale mock typed as `never`
- `src/server/scheduler/tasks/rss-sync.test.ts` — ditto (on-demand inspect)
- `src/server/scheduler/registry.test.ts` — ditto
- `src/server/__tests__/disk-scan.test.ts` — ditto
- `src/server/__tests__/import.test.ts` — ditto
- `src/server/__tests__/indexers.test.ts` — ditto
- `src/server/auto-search.test.ts` — ditto
- `src/server/download-clients.test.ts` — ditto
- `src/package-scripts.test.ts` — on-demand inspect
- `src/routes/_authed/settings/routes.browser.test.tsx` — on-demand inspect
- `.github/workflows/ci.yml` — (possibly) add `NODE_OPTIONS` to unit job, bump Docker action versions

**Verify with:**
- `bun run typecheck` — must exit 0 after Phase 3
- `bun run lint` — must exit 0 at the end
- `bun run test` — must pass at the end
- `docker build .` — must succeed at the end

---

## Phase 1: Dockerfile patches

### Task 1: Fix Dockerfile to copy patches

**Files:**
- Modify: `Dockerfile:6-7` and `Dockerfile:24-26`

- [ ] **Step 1: Read current Dockerfile** to confirm line numbers.

Run: `cat Dockerfile`
Expected: builder stage has `COPY package.json bun.lock ./` at line 6, runtime stage has a similar copy at lines 24–26.

- [ ] **Step 2: Modify the builder stage**

Replace:
```dockerfile
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
```
With:
```dockerfile
COPY package.json bun.lock ./
COPY patches ./patches
RUN bun install --frozen-lockfile --ignore-scripts
```

- [ ] **Step 3: Modify the runtime stage**

Replace:
```dockerfile
# Copy package files and install production deps directly
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
RUN bun install --production --ignore-scripts
```
With:
```dockerfile
# Copy package files and install production deps directly
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/patches ./patches
RUN bun install --production --ignore-scripts
```

- [ ] **Step 4: Verify the Docker build succeeds locally**

Run: `docker build . -t allstarr-ci-verify`
Expected: build completes without `Couldn't find patch file` error. Both builder and runtime stages pass `bun install`. The build may take several minutes; that's fine.

If the build fails for a reason unrelated to the patches (e.g., ffmpeg apk fetch failure), retry once. If it still fails for a non-patch reason, investigate before continuing.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile
git commit -m "fix(docker): copy patches directory before bun install"
```

---

## Phase 2: Shared mutation test helper

### Task 2: Create the shared `runMutation` helper

**Files:**
- Create: `src/test/mutations.ts`

**Context:** Each of the 8 mutation test files currently defines a local `runMutation` that typechecks its `useHook` parameter against `{ mutateAsync: (variables: unknown) => Promise<unknown> }`. Because react-query's `mutateAsync` is *strongly typed* on its variables parameter, `(v: SomeType) => Promise<X>` is **not** assignable to `(v: unknown) => Promise<unknown>` (contravariant parameter position). This is the source of ~160 of the 173 typecheck errors.

The fix: make the helper generic over `TVars` and `TResult` so the hook's real signature is inferred at each call site. Also preserve the `swallowError` option (7 of 8 files use it).

- [ ] **Step 1: Write the helper**

Create `src/test/mutations.ts` with exactly this content:

```ts
import { renderHook } from "src/test/render";

type MutationHook<TVars, TResult> = () => {
	mutateAsync: (variables: TVars) => Promise<TResult>;
};

export async function runMutation<TVars, TResult>(
	useHook: MutationHook<TVars, TResult>,
	variables: TVars,
	swallowError = false,
): Promise<TResult | undefined> {
	const { result } = await renderHook(() => useHook());

	const promise = result.current.mutateAsync(variables);
	if (swallowError) {
		return promise.catch(() => undefined);
	}
	return promise;
}
```

Notes:
- `renderHook` is re-exported from `src/test/render.tsx` (wraps `vitest-browser-react`'s `renderHook`).
- `await renderHook(...)` matches the pre-existing callers — awaiting a non-promise is a no-op and doesn't hurt if the upstream signature ever becomes async.
- The generics are **inferred** from the hook's return type at each call site. Callers don't annotate them.
- The return type is `Promise<TResult | undefined>` because the swallow-error branch can't produce a `TResult`. Callers that previously did `await runMutation(...)` already ignored the return value, so this is source-compatible.

- [ ] **Step 2: Verify typecheck on the new file**

Run: `bun run typecheck 2>&1 | grep "src/test/mutations.ts" || echo "clean"`
Expected: `clean` (no errors in the new file). Existing 173 errors elsewhere are still present — that's fine.

- [ ] **Step 3: Commit**

```bash
git add src/test/mutations.ts
git commit -m "test(helpers): add generic runMutation helper for hook tests"
```

### Task 3: Fix `src/test/render.tsx` renderHook wrappers

**Files:**
- Modify: `src/test/render.tsx:56-71`

- [ ] **Step 1: Read the current file**

Run: `cat src/test/render.tsx`
Expected: see `renderHookWithProviders` and `renderHook` declared with `callback: (initialProps: Props) => Result`.

- [ ] **Step 2: Update both function signatures**

Change:
```tsx
export function renderHookWithProviders<Result, Props>(
	callback: (initialProps: Props) => Result,
) {
	return vbrRenderHook(callback, { wrapper: TestProviders });
}

export function renderHook<Result, Props>(
	callback: (initialProps: Props) => Result,
	options?: RenderHookOptions<Props>,
) {
	const { wrapper, ...rest } = options ?? {};
	return vbrRenderHook(callback, {
		...rest,
		wrapper: composeWrapper(wrapper as ComponentType<PropsWithChildren>),
	});
}
```
To:
```tsx
export function renderHookWithProviders<Result, Props>(
	callback: (initialProps?: Props) => Result,
) {
	return vbrRenderHook(callback, { wrapper: TestProviders });
}

export function renderHook<Result, Props>(
	callback: (initialProps?: Props) => Result,
	options?: RenderHookOptions<Props>,
) {
	const { wrapper, ...rest } = options ?? {};
	return vbrRenderHook(callback, {
		...rest,
		wrapper: composeWrapper(wrapper as ComponentType<PropsWithChildren>),
	});
}
```

The only change is `initialProps: Props` → `initialProps?: Props` on both functions. This matches `vbrRenderHook`'s own callback signature.

- [ ] **Step 3: Verify typecheck on just this file**

Run: `bun run typecheck 2>&1 | grep "src/test/render.tsx" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add src/test/render.tsx
git commit -m "fix(test): make renderHook callback initialProps optional"
```

---

## Phase 3: Replace local runMutation in each mutation test file

**Pattern (applied identically for Tasks 4–11):** Each file currently has:
```ts
type HookRunner = () => {
	mutateAsync: (variables: unknown) => Promise<unknown>;
};

async function runMutation(
	useHook: HookRunner,
	variables: unknown,
	swallowError = false,  // present in 7 of 8; absent in custom-formats
) {
	const { result } = await renderHook(() => useHook());
	const promise = result.current.mutateAsync(variables as never);
	if (swallowError) {
		await promise.catch(() => {});
		return;
	}
	await promise;
}
```

The replacement is:
1. Delete the `type HookRunner = ...` block.
2. Delete the entire `async function runMutation` block.
3. Add `import { runMutation } from "src/test/mutations";` next to the existing imports (keep imports alphabetized).
4. Remove `renderHook` from the import from `src/test/render` **only if** it's no longer used elsewhere in the file. If the file also uses `renderHook` directly (not just through `runMutation`), keep the import.
5. Do **not** change any call site — `runMutation(useHook, variables)` or `runMutation(useHook, variables, true)` still works, and type inference now flows through.

After each file, gate locally on a narrower typecheck to catch regressions immediately.

### Task 4: books.browser.test.ts

**Files:**
- Modify: `src/hooks/mutations/books.browser.test.ts`

- [ ] **Step 1:** Read the file and locate the `type HookRunner` and `async function runMutation` blocks.

Run: `grep -n "HookRunner\|runMutation\|renderHook" src/hooks/mutations/books.browser.test.ts`

- [ ] **Step 2:** Apply the pattern above (delete helper, add import, keep/remove `renderHook` import as appropriate).

- [ ] **Step 3:** Verify typecheck on this file.

Run: `bun run typecheck 2>&1 | grep "src/hooks/mutations/books.browser.test.ts" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4:** Commit.

```bash
git add src/hooks/mutations/books.browser.test.ts
git commit -m "test(books): use shared runMutation helper"
```

### Task 5: custom-formats.browser.test.ts

Same pattern. Note this file has the **shorter** helper (no `swallowError` parameter) — the new shared helper's optional third arg is still compatible.

- [ ] **Step 1:** Locate and delete the local helper.
- [ ] **Step 2:** Add `import { runMutation } from "src/test/mutations";`.
- [ ] **Step 3:** Verify: `bun run typecheck 2>&1 | grep "src/hooks/mutations/custom-formats.browser.test.ts" || echo "clean"` → `clean`.
- [ ] **Step 4:** Commit: `git commit -am "test(custom-formats): use shared runMutation helper"`.

### Task 6: download-clients.browser.test.ts

- [ ] **Step 1:** Delete local helper.
- [ ] **Step 2:** Add import.
- [ ] **Step 3:** Verify: `bun run typecheck 2>&1 | grep "src/hooks/mutations/download-clients.browser.test.ts" || echo "clean"` → `clean`.
- [ ] **Step 4:** Commit: `git commit -am "test(download-clients): use shared runMutation helper"`.

### Task 7: download-profiles.browser.test.ts

- [ ] **Step 1:** Delete local helper.
- [ ] **Step 2:** Add import.
- [ ] **Step 3:** Verify: `bun run typecheck 2>&1 | grep "src/hooks/mutations/download-profiles.browser.test.ts" || echo "clean"` → `clean`.
- [ ] **Step 4:** Commit: `git commit -am "test(download-profiles): use shared runMutation helper"`.

### Task 8: episode-profiles.browser.test.ts

- [ ] **Step 1:** Delete local helper.
- [ ] **Step 2:** Add import.
- [ ] **Step 3:** Verify: `bun run typecheck 2>&1 | grep "src/hooks/mutations/episode-profiles.browser.test.ts" || echo "clean"` → `clean`.
- [ ] **Step 4:** Commit: `git commit -am "test(episode-profiles): use shared runMutation helper"`.

### Task 9: indexers.browser.test.ts

- [ ] **Step 1:** Delete local helper.
- [ ] **Step 2:** Add import.
- [ ] **Step 3:** Verify: `bun run typecheck 2>&1 | grep "src/hooks/mutations/indexers.browser.test.ts" || echo "clean"` → `clean`.
- [ ] **Step 4:** Commit: `git commit -am "test(indexers): use shared runMutation helper"`.

### Task 10: settings.browser.test.ts

- [ ] **Step 1:** Delete local helper.
- [ ] **Step 2:** Add import.
- [ ] **Step 3:** Verify: `bun run typecheck 2>&1 | grep "src/hooks/mutations/settings.browser.test.ts" || echo "clean"` → `clean`.
- [ ] **Step 4:** Commit: `git commit -am "test(settings): use shared runMutation helper"`.

### Task 11: user-settings.browser.test.ts

- [ ] **Step 1:** Delete local helper.
- [ ] **Step 2:** Add import.
- [ ] **Step 3:** Verify: `bun run typecheck 2>&1 | grep "src/hooks/mutations/user-settings.browser.test.ts" || echo "clean"` → `clean`.
- [ ] **Step 4:** Commit: `git commit -am "test(user-settings): use shared runMutation helper"`.

### Task 12: Checkpoint — re-run full typecheck

- [ ] **Step 1:** Run the full typecheck and inspect the remaining errors.

Run: `bun run typecheck 2>&1 | tee /tmp/typecheck-after-phase3.log; echo "---"; grep "error TS" /tmp/typecheck-after-phase3.log | wc -l`

Expected: all 8 mutation files are clean. Remaining errors should be concentrated in:
- `src/components/bookshelf/books/base-book-table.browser.test.tsx` (1)
- `src/components/ui/command.browser.test.tsx` (1)
- `src/server/**` test files (several)
- `src/package-scripts.test.ts` (unknown count)
- `src/routes/_authed/settings/routes.browser.test.tsx` (unknown count)

If any mutation file still reports errors, fix them before proceeding — likely a stray `as never` cast that's now unnecessary, or a call site that assumed a specific return type.

---

## Phase 4: Component and server test fixes

### Task 13: Fix `base-book-table.browser.test.tsx:202`

**Files:**
- Modify: `src/components/bookshelf/books/base-book-table.browser.test.tsx:202`

**Context:** The error is `Property 'click' does not exist on type 'HTMLElement | SVGElement'`. `SVGElement` doesn't have `.click()` in TS's lib.dom, so the union erases it.

- [ ] **Step 1:** Read the surrounding context.

Run: `sed -n '190,215p' src/components/bookshelf/books/base-book-table.browser.test.tsx`

- [ ] **Step 2:** Narrow the element before calling `.click()`.

At line 202 (adjust if the surrounding change shifts the number), wrap the `.click()` call:
```ts
if (el instanceof HTMLElement) {
	el.click();
}
```
Do **not** use a type assertion (`as HTMLElement`) — CLAUDE.md prohibits type-ignore and we prefer real narrowing.

If the element comes from a vitest-browser locator and `.element()` is already being called, the cleanest fix may be to call `.click()` through the locator API directly (e.g. `await locator.click()`) instead of manipulating the native element. Prefer that if the surrounding code already uses a locator variable.

- [ ] **Step 3:** Verify.

Run: `bun run typecheck 2>&1 | grep "base-book-table" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4:** Commit: `git commit -am "test(books): narrow element type for click in base-book-table"`.

### Task 14: Fix `command.browser.test.tsx:99`

**Files:**
- Modify: `src/components/ui/command.browser.test.tsx:99`

**Context:** `Property 'locator' does not exist on type 'Locator'`. vitest-browser's `Locator` type doesn't expose `.locator(...)` the way Playwright's does. The correct API for chaining/nesting a locator in vitest-browser is typically `.getByRole()`, `.getByText()`, `.getByTestId()`, `.filter()`, or the top-level `page.locator()` / `page.getBy*()` functions.

- [ ] **Step 1:** Read the surrounding context.

Run: `sed -n '85,115p' src/components/ui/command.browser.test.tsx`

- [ ] **Step 2:** Identify what the chained locator is trying to find (a child element inside another locator). Replace with the appropriate vitest-browser API.

If the original was `parentLocator.locator('[data-foo]')`, common replacements:
- For an ARIA role: `parentLocator.getByRole('option', { name: 'Foo' })`
- For test IDs: `parentLocator.getByTestId('foo')`
- For text: `parentLocator.getByText('Foo')`
- For filtering a collection: `parentLocator.filter({ hasText: 'Foo' })`

Pick the one that matches the original selector intent. If the original used a CSS selector with no semantic equivalent, fall back to `page.getByTestId(...)` from the top level (vitest-browser's `page` import).

- [ ] **Step 3:** Verify typecheck **and** run the specific test to make sure the selector actually finds the element.

Run:
```bash
bun run typecheck 2>&1 | grep "command.browser" || echo "clean"
bun run test -- src/components/ui/command.browser.test.tsx
```
Expected: `clean` and the test passes.

- [ ] **Step 4:** Commit: `git commit -am "test(command): use correct vitest-browser locator API"`.

### Task 15: Fix `src/server/series.test.ts:33`

**Files:**
- Modify: `src/server/series.test.ts:33`

**Context:** The error says the mock uses `.validator(...)` where the real `createServerFn` returns a type with `.inputValidator(...)`. Per project memory, TanStack Start renamed this method.

- [ ] **Step 1:** Read the surrounding context.

Run: `sed -n '20,50p' src/server/series.test.ts`

- [ ] **Step 2:** Rename `validator` to `inputValidator` in the mock.

In the mock for `@tanstack/react-start`'s `createServerFn`, the returned object should have `inputValidator` (not `validator`). Update both the method name and any `handler` chain if necessary so the mock shape matches:
```ts
{
	inputValidator: (validator: unknown) => ({
		handler: (fn: (opts: { data: unknown }) => unknown) => /* ... */
	})
}
```
The exact return value depends on what the rest of the file needs; keep the runtime behavior identical.

- [ ] **Step 3:** Verify.

Run: `bun run typecheck 2>&1 | grep "src/server/series.test.ts" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4:** Commit: `git commit -am "test(series): rename validator to inputValidator in mock"`.

### Task 16: Fix `src/server/tmdb/shows.test.ts:127`

**Files:**
- Modify: `src/server/tmdb/shows.test.ts:127`

**Context:** `Type 'null' is not assignable to type 'string'`. A fixture or mock is passing `null` where the type expects `string`.

- [ ] **Step 1:** Read the context.

Run: `sed -n '115,140p' src/server/tmdb/shows.test.ts`

- [ ] **Step 2:** Choose the correct fix based on what the field represents:
- If the field genuinely can be nullable in production, widen the type in the source to `string | null` (not in this task — flag it and skip if it requires source changes).
- If the field is always a string and `null` was a placeholder for "unknown", replace with a sensible empty string, a fixture-appropriate value, or `"" as unknown as string` only if required.
- The most likely fix is to pass `""` or a realistic fixture value.

- [ ] **Step 3:** Verify.

Run: `bun run typecheck 2>&1 | grep "src/server/tmdb/shows.test.ts" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4:** Commit: `git commit -am "test(tmdb): fix null string assignment in shows test"`.

### Task 17: Fix `{ id } → never` stale mocks in server tests

**Files (expect stale mock errors in each):**
- `src/server/scheduler/tasks/search-missing.test.ts`
- `src/server/scheduler/tasks/rss-sync.test.ts`
- `src/server/scheduler/registry.test.ts`
- `src/server/__tests__/disk-scan.test.ts`
- `src/server/__tests__/import.test.ts`
- `src/server/__tests__/indexers.test.ts`
- `src/server/auto-search.test.ts`
- `src/server/download-clients.test.ts`

**Context:** The common error is `Type '{ id: number; }' is not assignable to type 'never'`. This happens when `vi.fn()` (or a similar stub) is typed with no explicit return type, so its inferred return is `never`, and then a `.mockResolvedValue({ id: 1 })` or `.mockReturnValue(...)` fails.

The fix, applied per file: either
- (preferred) annotate the `vi.fn()` with an explicit generic: `vi.fn<(...args) => ReturnType>()`, or
- use `vi.fn().mockResolvedValue({ id: 1 } as never)` only if the real type is not accessible. Avoid this unless the imported type can't be reached.

- [ ] **Step 1:** Run targeted typecheck to see the exact errors for all affected files.

Run: `bun run typecheck 2>&1 | grep -E "(server/scheduler|server/__tests__|server/auto-search|server/download-clients)"`

- [ ] **Step 2:** For each file in the list above, inspect the mock declaration(s) producing the `never` error. Walk through them one at a time:

For each file:
1. `sed -n '1,40p' <file>` to see imports and mock declarations.
2. Find the `vi.fn()` whose `.mockResolvedValue({ id: ... })` (or similar) is the error source.
3. Add the generic: import or define the expected function signature from the module being mocked, then annotate `vi.fn<typeof actualFn>()` or `vi.fn<Args, Return>()`.
4. If the real function type can't be imported because it's a server-only module, define a minimal local type alias at the top of the test file and use that.

- [ ] **Step 3:** After fixing each file, verify that file is clean before moving on.

Run per file: `bun run typecheck 2>&1 | grep "<filename>" || echo "clean"` → `clean`.

- [ ] **Step 4:** After all 8 files are clean, commit them as one commit (they're all the same kind of fix).

```bash
git add src/server/scheduler/tasks/search-missing.test.ts \
        src/server/scheduler/tasks/rss-sync.test.ts \
        src/server/scheduler/registry.test.ts \
        src/server/__tests__/disk-scan.test.ts \
        src/server/__tests__/import.test.ts \
        src/server/__tests__/indexers.test.ts \
        src/server/auto-search.test.ts \
        src/server/download-clients.test.ts
git commit -m "test(server): annotate vi.fn generics to fix never return types"
```

### Task 18: Fix remaining unclassified errors

**Files (on-demand):**
- `src/package-scripts.test.ts`
- `src/routes/_authed/settings/routes.browser.test.tsx`
- Any others surfaced by the final typecheck run

**Context:** These weren't classifiable from the CI log summary. Handle them one at a time.

- [ ] **Step 1:** Run the full typecheck and list remaining errors.

Run: `bun run typecheck 2>&1 | grep "error TS"`

- [ ] **Step 2:** For each remaining error, inspect the surrounding code and apply a targeted fix. Do not add suppression comments. Prefer real type narrowing, type annotations on generics, or fixture adjustments.

- [ ] **Step 3:** After each fix, re-run the full typecheck to confirm the error count is decreasing.

- [ ] **Step 4:** Commit each file (or group of closely related files) with a descriptive message.

Example: `git commit -am "test(package-scripts): annotate fixture types"`.

### Task 19: Phase 4 gate — full typecheck passes

- [ ] **Step 1:** Run the full typecheck.

Run: `bun run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 2:** If errors remain, loop back to Task 18.

- [ ] **Step 3:** Run the linter and fix any warnings introduced.

Run: `bun run lint`
Expected: exit 0.

If lint fails: `bun run lint:fix` and re-run `bun run lint`.

- [ ] **Step 4:** If `lint:fix` changed files, commit:

```bash
git add -u
git commit -m "style: apply biome auto-fixes"
```

---

## Phase 5: Unit-test hang investigation

### Task 20: Reproduce locally

**Context:** CI killed the "Unit / Component Tests with Coverage" step after 47 minutes with "runner lost communication" (OOM or hang). We need to figure out whether it's CI-specific resource pressure or a real test hang before picking a remedy.

- [ ] **Step 1:** Measure a local baseline run with time + memory telemetry.

Run:
```bash
/usr/bin/time -l bun run test:coverage 2>&1 | tee /tmp/test-coverage-local.log
```
On macOS `/usr/bin/time -l` prints `maximum resident set size` in bytes at the end. Note the elapsed time and peak RSS.

Expected outcomes (pick one):

**Outcome A — completes in < 5 minutes, exit 0, peak RSS < ~3 GB:**
The hang is CI-specific — probably memory pressure (GitHub hosted runners are 7 GB, and the process + Chromium + coverage instrumentation together fit tightly). Proceed to Task 21a.

**Outcome B — completes in > 5 minutes OR exits 0 with peak RSS > ~4 GB:**
Slow/heavy but works. Coverage instrumentation overhead. Proceed to Task 21b.

**Outcome C — hangs or is killed locally (OOM):**
Real bug. Proceed to Task 21c.

**Outcome D — fails with a test failure (non-zero exit, clear error):**
Fix that test first. Add a task inline and re-run this step.

- [ ] **Step 2:** Record which outcome applies in a one-line note at the end of `docs/superpowers/plans/2026-04-10-ci-repairs.md` (this file), e.g., `<!-- unit-test investigation: Outcome A, 3m12s, peak RSS 2.1 GB -->`.

- [ ] **Step 3:** Commit if the plan was edited.

```bash
git commit -am "docs(plan): record unit-test investigation outcome"
```

### Task 21a: Apply CI memory/shard remedy (if Outcome A)

**Files:**
- Modify: `.github/workflows/ci.yml` — the `unit` job

**Context:** Local run succeeded; CI is memory-limited. Bump the Node heap and retry.

- [ ] **Step 1:** Read the current unit job definition.

Run: `sed -n '61,89p' .github/workflows/ci.yml`

- [ ] **Step 2:** Add `env:` to the "Unit / Component Tests with Coverage" step (or set at the job level).

Change:
```yaml
      - name: Unit / Component Tests with Coverage
        run: bun run test:coverage
```
To:
```yaml
      - name: Unit / Component Tests with Coverage
        env:
          NODE_OPTIONS: --max-old-space-size=6144
        run: bun run test:coverage
```

- [ ] **Step 3:** If after pushing the CI run still times out, add `--shard` and parallelize into two jobs. Do that as a follow-up task only if needed — don't do it preemptively.

- [ ] **Step 4:** Commit.

```bash
git commit -am "ci: bump NODE_OPTIONS heap for unit test coverage job"
```

Skip to Task 22.

### Task 21b: Narrow coverage instrumentation (if Outcome B)

**Files:**
- Modify: `vitest.config.ts` — the `coverage.include` / `coverage.exclude` arrays

**Context:** Instrumentation overhead is dragging runtime. Tighten the include list.

- [ ] **Step 1:** Read the current coverage config.

Run: `sed -n '85,120p' vitest.config.ts`

- [ ] **Step 2:** Verify `coverage.include` is `["src/**/*.{ts,tsx}", "e2e/fixtures/**/*.ts"]`. If `e2e/fixtures/**/*.ts` is being instrumented for unit runs that never execute those files, remove it from the unit-run coverage config. (The merged coverage run still picks it up from the e2e run.)

- [ ] **Step 3:** Confirm `coverage.exclude` already excludes `**/*.test.*`, `src/routeTree.gen.ts`, `src/test/**`, etc. Add any additional exclusions for files that are clearly not production source (e.g. `src/**/*.stories.tsx` if they exist).

- [ ] **Step 4:** Re-run locally and compare.

Run: `time bun run test:coverage`
Expected: noticeably faster than the baseline in Task 20.

- [ ] **Step 5:** Commit.

```bash
git commit -am "test(coverage): narrow unit coverage include to reduce instrumentation overhead"
```

Then apply Task 21a as well (NODE_OPTIONS bump) as a defensive measure. Then skip to Task 22.

### Task 21c: Bisect the hang (if Outcome C)

**Context:** Real bug. Need to isolate the offending test file.

- [ ] **Step 1:** Run with `--bail=1` and a reasonable timeout to get a faster signal.

Run: `bun run test -- --bail=1 --testTimeout=30000`

If that reveals a specific failing test, fix it. If it still hangs, proceed to bisect.

- [ ] **Step 2:** Bisect by excluding halves of the test suite.

Run the browser-mode tests alone:
```bash
bun run test -- 'src/**/*.browser.test.{ts,tsx}'
```
And the node-mode tests alone:
```bash
bun run test -- 'src/**/*.test.ts' --project=default
```
(Adjust the project selector to match `vitest.config.ts` — the first project in the `projects` array handles node-mode tests, second handles browser-mode.)

Whichever half hangs is the suspect. Keep halving until you find the single file.

- [ ] **Step 3:** Once isolated, read the file and look for:
- Infinite retry logic in mocks
- Missing `afterEach`/`afterAll` cleanup of timers, intervals, or async listeners
- A mocked server fn that never resolves
- Browser-mode tests that leak Chromium contexts

- [ ] **Step 4:** Fix the root cause. Add a regression test or a clarifying comment if the fix is non-obvious (a single short line).

- [ ] **Step 5:** Re-run the full `bun run test:coverage` locally to confirm it now completes.

- [ ] **Step 6:** Commit with a message describing the fix.

```bash
git commit -am "fix(test): <specific root cause>"
```

### Task 22: Verify unit tests run clean

- [ ] **Step 1:** Full local run.

Run: `bun run test`
Expected: all tests pass, exits 0.

- [ ] **Step 2:** Full coverage run.

Run: `bun run test:coverage`
Expected: all tests pass, coverage thresholds met, exits 0.

If coverage thresholds fail because we didn't write new tests for `src/test/mutations.ts`: the file is a test helper (under `src/test/**`), which is already excluded from coverage — no new test required.

---

## Phase 6: Node 20 deprecation

### Task 23: Look up the current stable Docker action majors via context7

- [ ] **Step 1:** Resolve the action library IDs.

Use `mcp__plugin_context7_context7__resolve-library-id` with query `docker/build-push-action`. Then again for `docker/setup-buildx-action`.

- [ ] **Step 2:** Query each for the current stable major and confirm they run on Node 24.

Use `mcp__plugin_context7_context7__query-docs` with the resolved IDs. Look for: "Node.js" or "runs:" configuration and note the latest `@vN` tag.

- [ ] **Step 3:** Record the resolved versions (e.g., `docker/build-push-action@v7`, `docker/setup-buildx-action@v3` if v3 was refreshed for Node 24).

If context7 doesn't have authoritative version info, fall back to reading the GitHub Marketplace page for the action (via WebFetch) — but only if context7 fails.

### Task 24: Bump action versions in ci.yml

**Files:**
- Modify: `.github/workflows/ci.yml` — the `docker-verify` job

- [ ] **Step 1:** Read the current definitions.

Run: `sed -n '124,145p' .github/workflows/ci.yml`

- [ ] **Step 2:** Replace the action versions with the ones resolved in Task 23. Example (adjust to actual resolved versions):
```yaml
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build Docker image
        uses: docker/build-push-action@v7
```

- [ ] **Step 3:** Commit.

```bash
git commit -am "ci(docker): bump build-push and setup-buildx actions for Node 24"
```

---

## Phase 7: Full verification

### Task 25: End-to-end local verification

- [ ] **Step 1:** Typecheck.

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 2:** Lint.

Run: `bun run lint`
Expected: exit 0.

- [ ] **Step 3:** Unit + browser tests (without coverage, for speed).

Run: `bun run test`
Expected: all pass.

- [ ] **Step 4:** Unit + browser tests with coverage.

Run: `bun run test:coverage`
Expected: all pass, thresholds met, exits 0.

- [ ] **Step 5:** Docker build (re-verify the earlier fix didn't regress).

Run: `docker build . -t allstarr-ci-verify`
Expected: builder and runtime stages both pass `bun install`.

- [ ] **Step 6:** If any of the above fail, fix the issue and re-run the affected step.

### Task 26: Push and watch CI

- [ ] **Step 1:** Push the branch.

Run: `git push -u origin fix/ci-repairs`

- [ ] **Step 2:** Watch the CI run.

Run: `gh run watch` (it'll auto-pick the latest run on the branch).

- [ ] **Step 3:** Confirm all jobs green: Lint, Typecheck, Unit / Component Tests, E2E + Merged Coverage, Docker Verify.

- [ ] **Step 4:** If any job fails, investigate, fix, push a new commit, and re-watch.

### Task 27: Merge to main and clean up

Per CLAUDE.md: "When 'merging' to main, we should not use a merge commit; cherrypick all the commits on top of the local main branch." And: "clean up both worktree and branch."

- [ ] **Step 1:** From the main working directory (not the worktree), list the commits on the branch.

Run: `cd /Users/pauldiloreto/Projects/allstarr && git log main..fix/ci-repairs --oneline`
Note the commit range (oldest → newest, excluding the spec and plan commits — or including them, your choice; the spec/plan docs are useful history).

- [ ] **Step 2:** Cherry-pick the commits onto main in order.

Run: `git checkout main && git cherry-pick <oldest>..<newest>`

Resolve any conflicts (unlikely if nobody else has touched these files since branching).

- [ ] **Step 3:** Confirm main builds and tests cleanly.

Run: `bun run typecheck && bun run lint`
Expected: both exit 0.

- [ ] **Step 4:** Clean up the worktree and branch.

Run:
```bash
git worktree remove .worktrees/fix-ci-repairs
git branch -D fix/ci-repairs
```

- [ ] **Step 5:** Push main.

Run: `git push origin main`

- [ ] **Step 6:** Confirm the CI run on main is green.

Run: `gh run watch`

---

## Notes

- Keep commits small and conventionally formatted (`feat(scope):`, `fix(scope):`, `test(scope):`, `ci:`, `docs:`, `style:`, `chore:`). Lefthook runs commitlint — a malformed message will be rejected.
- Do **not** add suppression comments. If a type issue can't be fixed cleanly, raise it in the commit message as a follow-up rather than suppressing.
- If the typecheck error count in the initial run (173) doesn't match what you see after starting the work, don't assume new errors have been introduced — some of the errors are counted per overload / per diagnostic line, not per file. The 23-file number is the authoritative target.
- Don't touch `src/routeTree.gen.ts` or anything under `.worktrees/` that isn't the branch's own checkout.
