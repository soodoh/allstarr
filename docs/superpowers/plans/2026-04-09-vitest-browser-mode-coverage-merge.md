# Vitest Browser Mode + Merged Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 151 component tests from RTL/jsdom to Vitest Browser Mode + Playwright, set up merged coverage across unit/component and E2E tests using monocart, and enforce hybrid thresholds.

**Architecture:** Replace the jsdom vitest project with a browser mode project using Playwright. Use `vitest-monocart-coverage` for unit/component coverage and `monocart-reporter` for E2E. Istanbul-instrument the server build for E2E server coverage (written to file on SIGTERM). Merge all coverage via monocart and enforce two threshold tiers.

**Tech Stack:** Vitest 4.x browser mode, Playwright, monocart-coverage-reports, vitest-monocart-coverage, monocart-reporter, vite-plugin-istanbul

**Spec:** `docs/superpowers/specs/2026-04-09-vitest-browser-mode-coverage-merge-design.md`

---

## File Structure

### New Files
- `scripts/merge-coverage.ts` — merges unit + e2e coverage, checks merged thresholds

### Modified Files
- `package.json` — add/remove deps, update test scripts
- `vitest.config.ts` — replace jsdom project with browser mode, switch to monocart coverage
- `src/test/setup.ts` — remove RTL imports and ResizeObserver mock
- `src/test/render.tsx` — use `@vitest/browser/utils` instead of RTL
- `vite.config.ts` — conditional `vite-plugin-istanbul` for instrumented builds
- `e2e/playwright.config.ts` — add monocart-reporter
- `e2e/fixtures/app.ts` — add client-side coverage collection via `page.coverage`
- `e2e/fixtures/app-runtime.ts` — pass `INSTRUMENT_COVERAGE` env to spawned server
- `e2e/global-teardown.ts` — no changes needed (SIGTERM handler writes file)
- `.github/workflows/ci.yml` — add Playwright to unit job, artifact passing, merge step in e2e job
- 151 `*.test.tsx` files — migrate from RTL to Vitest browser mode locators

---

## Migration Reference

This section documents every transformation pattern. Migration tasks below reference these patterns by ID (e.g., "Apply P1, P2, P5").

### P1: Remove RTL imports

```tsx
// BEFORE
import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// AFTER — remove both lines entirely
// Add this import instead (only if the test uses page locators, which most will):
import { page } from "@vitest/browser/context";
```

### P2: Destructured render → page locators

```tsx
// BEFORE
const { getByRole, getByText, getByTestId, queryByText } = renderWithProviders(<Comp />);
getByRole("button", { name: "Save" });
getByText("Hello");

// AFTER
renderWithProviders(<Comp />);
page.getByRole("button", { name: "Save" });
page.getByText("Hello");
```

Tests that use bare `render()` from RTL should switch to `renderWithProviders()` (or `render()` from the updated `src/test/render.tsx` if no providers needed).

### P3: screen.getByX → page.getByX

```tsx
// BEFORE
screen.getByRole("button", { name: "Save" });
screen.getByText("Hello");
screen.getAllByRole("button");

// AFTER
page.getByRole("button", { name: "Save" });
page.getByText("Hello");
page.getByRole("button").all();  // getAllByRole → getByRole().all()
```

### P4: userEvent → locator methods

```tsx
// BEFORE
const user = userEvent.setup();
await user.click(getByRole("button", { name: "Save" }));
await user.type(getByRole("textbox"), "hello");
await user.clear(getByRole("textbox"));

// AFTER — no setup needed, call methods on locators
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("textbox").fill("hello");
await page.getByRole("textbox").clear();
```

### P5: fireEvent → locator methods

```tsx
// BEFORE
fireEvent.click(getByRole("button", { name: "Save" }));
fireEvent.change(getByLabelText("Search"), { target: { value: "alien" } });
fireEvent.keyDown(getByRole("textbox"), { key: "Enter" });
fireEvent.submit(getByRole("form"));

// AFTER
await page.getByRole("button", { name: "Save" }).click();
await page.getByLabel("Search").fill("alien");
await page.getByRole("textbox").press("Enter");  // keyDown → press
await page.getByRole("form").press("Enter");       // submit → press Enter
```

Note: `fireEvent` calls are synchronous in RTL. Locator methods are async — add `await`.

### P6: queryBy (absence assertions)

```tsx
// BEFORE
expect(queryByText("Gone")).not.toBeInTheDocument();
expect(queryByText("Gone")).toBeNull();
expect(queryByTestId("dialog")).not.toBeInTheDocument();

// AFTER
await expect.element(page.getByText("Gone")).not.toBeInTheDocument();
await expect.element(page.getByTestId("dialog")).not.toBeInTheDocument();
```

### P7: Presence/content assertions

```tsx
// BEFORE
expect(getByText("Hello")).toBeInTheDocument();
expect(getByRole("button")).toHaveTextContent("Save");
expect(getByRole("button")).toBeDisabled();
expect(getByRole("textbox")).toHaveValue("test");
expect(getByRole("checkbox")).toBeChecked();

// AFTER — use expect.element() which auto-retries
await expect.element(page.getByText("Hello")).toBeInTheDocument();
await expect.element(page.getByRole("button")).toHaveTextContent("Save");
await expect.element(page.getByRole("button")).toBeDisabled();
await expect.element(page.getByRole("textbox")).toHaveValue("test");
await expect.element(page.getByRole("checkbox")).toBeChecked();
```

### P8: waitFor → auto-retry assertions

```tsx
// BEFORE
await waitFor(() => {
  expect(screen.getByText("Done")).toBeInTheDocument();
});
await waitFor(() => {
  expect(mockFn).toHaveBeenCalledTimes(1);
});

// AFTER — for DOM assertions, expect.element auto-retries:
await expect.element(page.getByText("Done")).toBeInTheDocument();

// For non-DOM assertions (mock calls), use expect.poll:
await expect.poll(() => mockFn).toHaveBeenCalledTimes(1);
```

### P9: within() → scoped locators

```tsx
// BEFORE
import { within } from "@testing-library/react";
const row = getByTestId("row-1");
within(row).getByText("Cell value");

// AFTER — use locator chaining
const row = page.getByTestId("row-1");
row.getByText("Cell value");
```

Locators are naturally scopeable — calling `.getByText()` on a locator scopes to that subtree.

### P10: act() + timers → async timers

```tsx
// BEFORE
import { act } from "@testing-library/react";
act(() => {
  vi.advanceTimersByTime(300);
});

// AFTER — use async timer API, no act() needed
await vi.advanceTimersByTimeAsync(300);
```

### P11: renderHook migration

```tsx
// BEFORE
import { renderHook } from "@testing-library/react";
// or: import { renderHook } from "src/test/render";
const { result } = renderHook(() => useMyHook());
expect(result.current).toBe(expected);

// AFTER — renderHook from @vitest/browser/utils (via updated src/test/render.tsx)
import { renderHook } from "src/test/render";
const { result } = renderHook(() => useMyHook());
// result.current works the same way
```

### P12: Non-DOM assertions stay unchanged

```tsx
// These don't change — they don't touch RTL APIs:
expect(mockFn).toHaveBeenCalledWith("arg");
expect(mockFn).toHaveBeenCalledTimes(1);
expect(result).toBe(true);
expect(array).toHaveLength(3);
```

---

## Phase 1: Infrastructure

### Task 1: Update Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install new dependencies**

```bash
bun add -d @vitest/browser vitest-monocart-coverage monocart-coverage-reports monocart-reporter vite-plugin-istanbul
```

- [ ] **Step 2: Remove old dependencies**

```bash
bun remove @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/coverage-v8
```

- [ ] **Step 3: Verify installation**

```bash
bun install --frozen-lockfile
```

If lockfile is stale, run `bun install` to regenerate it. Verify no resolution errors.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "build(testing): swap RTL/jsdom for vitest browser mode + monocart"
```

---

### Task 2: Update Vitest Configuration

**Files:**
- Modify: `vitest.config.ts`

The current config at `vitest.config.ts` has two projects: a node project (lines 66-76) and a jsdom frontend project (lines 78-84). Replace the frontend project with browser mode and switch coverage to monocart.

- [ ] **Step 1: Replace jsdom project with browser mode project**

Replace the frontend project block (the second object in the `projects` array):

```ts
// BEFORE (lines 78-84)
{
  extends: true,
  test: {
    include: frontendTestInclude,
    exclude: frontendTestExclude,
    environment: "jsdom",
  },
},

// AFTER
{
  extends: true,
  test: {
    include: frontendTestInclude,
    exclude: frontendTestExclude,
    browser: {
      enabled: true,
      provider: "playwright",
      instances: [{ browser: "chromium" }],
    },
  },
},
```

- [ ] **Step 2: Replace coverage provider**

Replace the coverage block (lines 87-94):

```ts
// BEFORE
coverage: {
  provider: "v8",
  all: true,
  include: fullRepoCoverageInclude,
  exclude: coverageExclude,
  reporter: ["text", "json-summary", "html"],
  reportsDirectory: "coverage",
} as any,

// AFTER
coverage: {
  provider: "custom",
  customProviderModule: "vitest-monocart-coverage/browser",
  all: true,
  include: fullRepoCoverageInclude,
  exclude: coverageExclude,
  reports: ["v8", "console-summary", "html", "raw"],
  outputDir: "coverage/unit",
  thresholds: {
    statements: 90,
    branches: 85,
    functions: 90,
    lines: 90,
  },
} as any,
```

- [ ] **Step 3: Verify config loads without errors**

```bash
bunx vitest --config vitest.config.ts --help
```

Should print help without config parsing errors.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts
git commit -m "test(config): switch vitest to browser mode + monocart coverage"
```

---

### Task 3: Update Test Utilities

**Files:**
- Modify: `src/test/setup.ts`
- Modify: `src/test/render.tsx`

- [ ] **Step 1: Rewrite setup.ts**

Replace the entire contents of `src/test/setup.ts`:

```ts
// Browser mode runs in a real browser — no jsdom matchers or ResizeObserver mocks needed.
// This file is intentionally minimal. Add browser-mode-specific setup here if needed.
```

The old file imported `@testing-library/jest-dom/vitest` (custom matchers), `cleanup` from RTL, and mocked `ResizeObserver`. In browser mode:
- `expect.element()` provides DOM assertions (replaces jest-dom matchers)
- Cleanup is automatic
- Real browser has `ResizeObserver`

- [ ] **Step 2: Rewrite render.tsx**

Replace the entire contents of `src/test/render.tsx`:

```tsx
import { render, renderHook } from "@vitest/browser/utils";
import type { ReactElement } from "react";
import { useState } from "react";
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "src/components/ui/tooltip";

function createTestQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				gcTime: Number.POSITIVE_INFINITY,
				staleTime: 30_000,
			},
			mutations: {
				retry: false,
				gcTime: Number.POSITIVE_INFINITY,
			},
		},
	});
}

function TestProviders({ children }: PropsWithChildren): ReactElement {
	const [queryClient] = useState(createTestQueryClient);

	return (
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>{children}</TooltipProvider>
		</QueryClientProvider>
	);
}

export function renderWithProviders(ui: ReactElement) {
	return render(ui, { wrapper: TestProviders });
}

export { render };

export function renderHookWithProviders<Result, Props>(
	callback: (initialProps: Props) => Result,
) {
	return renderHook(callback, { wrapper: TestProviders });
}

export { renderHook };
```

Key changes from old file:
- Imports `render` and `renderHook` from `@vitest/browser/utils` instead of `@testing-library/react`
- `renderWithProviders` no longer accepts RTL `RenderOptions` (browser mode render has different options)
- `renderHook` exported directly for tests that import it from `src/test/render`
- `renderHookWithProviders` replaces the old `renderHook` wrapper (renamed to avoid confusion)

- [ ] **Step 3: Commit**

```bash
git add src/test/setup.ts src/test/render.tsx
git commit -m "test(utils): rewrite test setup and render for vitest browser mode"
```

---

### Task 4: Pilot Migration — Validate Infrastructure

**Files:**
- Modify: `src/components/shared/confirm-dialog.test.tsx`
- Modify: `src/components/layout/header.test.tsx`

Migrate two representative files to validate the infrastructure works before bulk migration. The first uses destructured render + userEvent + queryBy. The second uses screen + userEvent + waitFor.

- [ ] **Step 1: Migrate confirm-dialog.test.tsx**

This file uses: `renderWithProviders`, destructured queries (`getByRole`, `getByText`, `queryByTestId`), `userEvent.setup()` + `user.click()`.

Apply patterns P1, P2, P4, P6, P7:

```tsx
// Replace the import line:
// REMOVE: import userEvent from "@testing-library/user-event";
// ADD:
import { page } from "@vitest/browser/context";

// In each test, replace destructured render:
// BEFORE: const { getByRole, getByText, queryByTestId } = renderWithProviders(<ConfirmDialog ... />);
// AFTER:  renderWithProviders(<ConfirmDialog ... />);

// Replace query calls:
// BEFORE: expect(queryByTestId("dialog-root")).not.toBeInTheDocument();
// AFTER:  await expect.element(page.getByTestId("dialog-root")).not.toBeInTheDocument();

// BEFORE: expect(getByText("Delete item")).toBeInTheDocument();
// AFTER:  await expect.element(page.getByText("Delete item")).toBeInTheDocument();

// Replace userEvent:
// BEFORE: const user = userEvent.setup();
//         await user.click(getByRole("button", { name: "Cancel" }));
// AFTER:  await page.getByRole("button", { name: "Cancel" }).click();

// Remove: const user = userEvent.setup(); lines
```

- [ ] **Step 2: Migrate header.test.tsx**

This file uses: bare `render` + `screen` + `userEvent` + `waitFor`.

Apply patterns P1, P3, P4, P7, P8:

```tsx
// Replace imports:
// REMOVE: import { render, screen, waitFor } from "@testing-library/react";
// REMOVE: import userEvent from "@testing-library/user-event";
// ADD:
import { page } from "@vitest/browser/context";
import { render } from "src/test/render";

// Replace screen calls:
// BEFORE: screen.getAllByRole("button")
// AFTER:  page.getByRole("button").all()

// BEFORE: screen.getByRole("button", { name: "Sign Out" })
// AFTER:  page.getByRole("button", { name: "Sign Out" })

// Replace userEvent:
// BEFORE: const user = userEvent.setup();
//         await user.click(toggleButton);
// AFTER:  await toggleButton.click();
// (where toggleButton is now a locator from page.getByRole)

// Replace waitFor with expect.poll for mock assertions:
// BEFORE:
// await waitFor(() => {
//   expect(headerMocks.signOut).toHaveBeenCalledTimes(1);
//   expect(headerMocks.toastSuccess).toHaveBeenCalledWith("Signed out");
//   expect(headerMocks.navigate).toHaveBeenCalledWith({ to: "/login" });
// });
// AFTER:
// await expect.poll(() => headerMocks.signOut).toHaveBeenCalledTimes(1);
// expect(headerMocks.toastSuccess).toHaveBeenCalledWith("Signed out");
// expect(headerMocks.navigate).toHaveBeenCalledWith({ to: "/login" });
```

Note: For `screen.getAllByRole("button")` returning an array, use `page.getByRole("button").all()` which returns `Locator[]`. To get the first one: `(await page.getByRole("button").all())[0]`.

- [ ] **Step 3: Run the two migrated tests in isolation**

```bash
bunx vitest run src/components/shared/confirm-dialog.test.tsx src/components/layout/header.test.tsx
```

Expected: Both tests pass. If they fail, debug and fix before proceeding — infrastructure issues must be resolved here, not during bulk migration.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/confirm-dialog.test.tsx src/components/layout/header.test.tsx
git commit -m "test(pilot): migrate confirm-dialog and header tests to browser mode"
```

---

## Phase 2: Component Test Migration

Each task below migrates all `.test.tsx` files in a directory group. For every file:
1. Apply the relevant patterns from the Migration Reference (P1–P12)
2. Key rule: every locator assertion needs `await expect.element()`, every interaction needs `await`
3. `vi.mock()` and `vi.hoisted()` blocks stay unchanged
4. Non-DOM assertions (`expect(mockFn)...`) stay unchanged (P12)

### Task 5: Migrate src/components/ui/ (21 files)

**Files:**
- Modify: all 21 `src/components/ui/*.test.tsx` files

These are UI primitive tests (button, dialog, input, select, etc.). Most use `renderWithProviders` + destructured queries + `fireEvent`.

- [ ] **Step 1: Migrate all 21 files**

For each file:
- Remove `@testing-library/react` and `@testing-library/user-event` imports (P1)
- Add `import { page } from "@vitest/browser/context";`
- Replace destructured render returns with `page.*` locators (P2)
- Replace `fireEvent.click(...)` → `await locator.click()` (P5)
- Replace `fireEvent.change(...)` → `await locator.fill(value)` (P5)
- Replace presence/absence assertions with `await expect.element(...)` (P6, P7)
- `sidebar.test.tsx` uses `renderHook` — update import to `import { renderHook, renderWithProviders } from "src/test/render"` (P11)
- `sidebar.test.tsx` uses `fireEvent.click` — replace with `await locator.click()` (P5)

- [ ] **Step 2: Run tests**

```bash
bunx vitest run src/components/ui/
```

Expected: All 21 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/
git commit -m "test(ui): migrate ui component tests to browser mode"
```

---

### Task 6: Migrate src/components/shared/ (18 files)

**Files:**
- Modify: all 18 `src/components/shared/*.test.tsx` files

- [ ] **Step 1: Migrate all 18 files**

Apply P1, P2, P4, P5, P6, P7. These follow the same patterns as UI tests. Skip `confirm-dialog.test.tsx` (already migrated in Task 4 pilot).

- [ ] **Step 2: Run tests**

```bash
bunx vitest run src/components/shared/
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/
git commit -m "test(shared): migrate shared component tests to browser mode"
```

---

### Task 7: Migrate src/components/bookshelf/ (21 files)

**Files:**
- Modify: all files in `src/components/bookshelf/books/*.test.tsx` (16 files)
- Modify: all files in `src/components/bookshelf/authors/*.test.tsx` (3 files)
- Modify: all files in `src/components/bookshelf/hardcover/*.test.tsx` (2 files)

- [ ] **Step 1: Migrate all 21 files**

Apply P1, P2, P4, P5, P6, P7. These are standard component tests with renderWithProviders + userEvent/fireEvent patterns.

- [ ] **Step 2: Run tests**

```bash
bunx vitest run src/components/bookshelf/
```

- [ ] **Step 3: Commit**

```bash
git add src/components/bookshelf/
git commit -m "test(bookshelf): migrate bookshelf tests to browser mode"
```

---

### Task 8: Migrate src/components/settings/ (17 files)

**Files:**
- Modify: `src/components/settings/custom-formats/*.test.tsx` (5 files)
- Modify: `src/components/settings/indexers/*.test.tsx` (4 files)
- Modify: `src/components/settings/download-profiles/*.test.tsx` (3 files)
- Modify: `src/components/settings/download-clients/*.test.tsx` (3 files)
- Modify: `src/components/settings/download-formats/*.test.tsx` (2 files)

Some of these use `within()` (indexer-list, download-client-list). Apply P9 for those.

- [ ] **Step 1: Migrate all 17 files**

Apply P1, P2, P4, P5, P6, P7. For files using `within()`:
- Replace `within(container).getByText(...)` with scoped locator: `container.getByText(...)` (P9)

- [ ] **Step 2: Run tests**

```bash
bunx vitest run src/components/settings/
```

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/
git commit -m "test(settings): migrate settings component tests to browser mode"
```

---

### Task 9: Migrate src/components/activity/ (8 files)

**Files:**
- Modify: all 8 `src/components/activity/*.test.tsx` files

- [ ] **Step 1: Migrate all 8 files**

Apply P1, P2, P4, P5, P6, P7.

- [ ] **Step 2: Run tests**

```bash
bunx vitest run src/components/activity/
```

- [ ] **Step 3: Commit**

```bash
git add src/components/activity/
git commit -m "test(activity): migrate activity component tests to browser mode"
```

---

### Task 10: Migrate src/components/movies/ (10 files)

**Files:**
- Modify: all 10 `src/components/movies/*.test.tsx` files

Some of these use `act()` + fake timers (`tmdb-movie-search.test.tsx`). Apply P10.

- [ ] **Step 1: Migrate all 10 files**

Apply P1, P2, P4, P5, P6, P7. For files using `act()` + timers:
- Replace `act(() => { vi.advanceTimersByTime(n); })` with `await vi.advanceTimersByTimeAsync(n)` (P10)
- Remove `import { act } from "@testing-library/react"`

- [ ] **Step 2: Run tests**

```bash
bunx vitest run src/components/movies/
```

- [ ] **Step 3: Commit**

```bash
git add src/components/movies/
git commit -m "test(movies): migrate movie component tests to browser mode"
```

---

### Task 11: Migrate src/components/tv/ (8 files)

**Files:**
- Modify: all 8 `src/components/tv/*.test.tsx` files

Some use `act()` + timers (`tmdb-show-search.test.tsx`, `show-detail-header.test.tsx`, `season-accordion.test.tsx`). Apply P10.

- [ ] **Step 1: Migrate all 8 files**

Apply P1, P2, P4, P5, P6, P7, P10.

- [ ] **Step 2: Run tests**

```bash
bunx vitest run src/components/tv/
```

- [ ] **Step 3: Commit**

```bash
git add src/components/tv/
git commit -m "test(tv): migrate tv component tests to browser mode"
```

---

### Task 12: Migrate src/components/ remaining (9 files)

**Files:**
- Modify: `src/components/layout/*.test.tsx` (3 files — skip header.test.tsx, already migrated in Task 4 pilot)
- Modify: `src/components/dashboard/*.test.tsx` (3 files)
- Modify: `src/components/unmapped-files/*.test.tsx` (2 files — these use `waitFor`)
- Modify: `src/components/icons/*.test.tsx` (1 file)

- [ ] **Step 1: Migrate all files**

Apply P1, P2, P4, P5, P6, P7. For unmapped-files tests using `waitFor`:
- Replace `waitFor(() => expect(element)...)` with `await expect.element(locator)...` (P8)
- Replace `waitFor(() => expect(mockFn)...)` with `await expect.poll(() => mockFn)...` (P8)

- [ ] **Step 2: Run tests**

```bash
bunx vitest run src/components/layout/ src/components/dashboard/ src/components/unmapped-files/ src/components/icons/
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/ src/components/dashboard/ src/components/unmapped-files/ src/components/icons/
git commit -m "test(components): migrate remaining component tests to browser mode"
```

---

### Task 13: Migrate src/hooks/*.test.tsx (2 files)

**Files:**
- Modify: `src/hooks/sse-context.test.tsx`
- Modify: `src/hooks/use-server-events.test.tsx`

Both use `renderHook`. `use-server-events.test.tsx` also uses `act()`.

- [ ] **Step 1: Migrate both files**

Apply P1, P11, P10:
- Replace `import { renderHook } from "@testing-library/react"` or `from "src/test/render"` — keep using `import { renderHook } from "src/test/render"` (the updated version now re-exports from `@vitest/browser/utils`)
- Replace `import { renderHook } from "src/test/render"` that used the old custom wrapper — if tests need providers, switch to `import { renderHookWithProviders } from "src/test/render"`
- Replace `act()` wrapping with direct async calls (P10)
- `result.current` access pattern stays the same

- [ ] **Step 2: Run tests**

```bash
bunx vitest run src/hooks/sse-context.test.tsx src/hooks/use-server-events.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/sse-context.test.tsx src/hooks/use-server-events.test.tsx
git commit -m "test(hooks): migrate hook tests to browser mode"
```

---

### Task 14: Migrate src/routes/ (36 files)

**Files:**
- Modify: `src/routes/*.test.tsx` (5 files)
- Modify: `src/routes/_authed/*.test.tsx` (3 files)
- Modify: `src/routes/_authed/settings/*.test.tsx` (11 files)
- Modify: `src/routes/_authed/movies/*.test.tsx` (4 files)
- Modify: `src/routes/_authed/books/*.test.tsx` (3 files)
- Modify: `src/routes/_authed/tv/*.test.tsx` (2 files)
- Modify: `src/routes/_authed/tv/series/*.test.tsx` (1 file)
- Modify: `src/routes/_authed/series/*.test.tsx` (1 file)
- Modify: `src/routes/_authed/authors/*.test.tsx` (2 files)
- Modify: `src/routes/_authed/system/*.test.tsx` (2 files)
- Modify: `src/routes/_authed/activity/*.test.tsx` (1 file)
- Modify: `src/components/*.test.tsx` (1 file — likely NotFound or similar at component root)

Route tests often use `waitFor` and `screen`. Some use bare `render` instead of `renderWithProviders`.

- [ ] **Step 1: Migrate all 36 files**

Apply P1, P2, P3, P4, P5, P6, P7, P8. For files using bare `render` from RTL:
- Replace `import { render } from "@testing-library/react"` with `import { render } from "src/test/render"`

- [ ] **Step 2: Run tests**

```bash
bunx vitest run src/routes/ src/components/NotFound.test.tsx
```

Adjust the path for the root-level component test as needed.

- [ ] **Step 3: Commit**

```bash
git add src/routes/ src/components/NotFound.test.tsx
git commit -m "test(routes): migrate route tests to browser mode"
```

---

### Task 15: Migrate remaining files + root-level test

**Files:**
- Modify: `src/router.test.tsx` (1 file)
- Any remaining `.test.tsx` files not covered above

- [ ] **Step 1: Find and migrate any remaining .test.tsx files**

```bash
# Find all .test.tsx files that still import from @testing-library
grep -rl "@testing-library" --include="*.test.tsx" src/
```

If this returns files, migrate them using the appropriate patterns.

For `src/router.test.tsx`: Apply P1, P2/P3, P7.

- [ ] **Step 2: Run the FULL test suite**

```bash
bun run test
```

Expected: All tests pass. Count should still be ~2542+ tests (same as before migration — no tests removed, just migrated).

- [ ] **Step 3: Verify no RTL imports remain**

```bash
grep -r "@testing-library" --include="*.tsx" --include="*.ts" src/
```

Expected: Zero results. All RTL imports should be gone.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: complete browser mode migration, verify all tests pass"
```

---

## Phase 3: E2E Coverage Collection

### Task 16: Istanbul Instrumentation for Server Build

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add conditional Istanbul plugin**

In `vite.config.ts`, add the import and conditionally include the plugin:

```ts
// Add at top of file:
import istanbul from "vite-plugin-istanbul";

// In the plugins array (line 135), conditionally add istanbul:
plugins: [
  tailwindcss(),
  tanstackStart(),
  nitro(),
  viteReact(),
  ...(process.env.INSTRUMENT_COVERAGE === "true"
    ? [
        istanbul({
          include: "src/**/*",
          exclude: ["node_modules", "**/*.test.*", "**/*.spec.*"],
          extension: [".ts", ".tsx"],
        }),
      ]
    : []),
],
```

- [ ] **Step 2: Test instrumented build**

```bash
INSTRUMENT_COVERAGE=true bun run build
```

Expected: Build succeeds. The output `.output/server/index.mjs` should contain Istanbul instrumentation code. Verify:

```bash
grep -c "__coverage__" .output/server/index.mjs
```

Expected: Non-zero count (instrumentation inserts `__coverage__` references).

- [ ] **Step 3: Test non-instrumented build still works**

```bash
bun run build
grep -c "__coverage__" .output/server/index.mjs
```

Expected: Build succeeds, `__coverage__` count is 0 (no instrumentation in normal builds).

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "build(coverage): add conditional istanbul instrumentation for e2e"
```

---

### Task 17: Server Coverage Written on Process Exit

**Files:**
- Create or modify: a server-side module that runs at startup

The instrumented server needs to write `global.__coverage__` to a file when it receives SIGTERM (from Playwright fixture teardown's `proc.kill()`).

The simplest approach is to add a small module in `src/server/` that self-registers the handler on import, then import it from the server entry or an existing server initialization path. Alternatively, if Nitro's plugin convention is set up (`server/plugins/`), use that. During implementation: check `ls src/server/plugins/ server/plugins/` for an existing plugin directory. If neither exists, create `src/server/coverage-exit.ts` and import it from a server initialization path that runs on startup.

- [ ] **Step 1: Create the SIGTERM coverage handler**

Create `src/server/coverage-exit.ts` (or the appropriate Nitro plugin path if one exists):

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

if (process.env.INSTRUMENT_COVERAGE === "true") {
	const coveragePath = "coverage/e2e/raw/server-istanbul.json";

	process.on("SIGTERM", () => {
		const coverage = (globalThis as Record<string, unknown>).__coverage__;
		if (coverage) {
			mkdirSync(dirname(coveragePath), { recursive: true });
			writeFileSync(coveragePath, JSON.stringify(coverage));
		}
		process.exit(0);
	});
}
```

- [ ] **Step 2: Pass INSTRUMENT_COVERAGE to the spawned E2E server**

In `e2e/fixtures/app-runtime.ts`, add `INSTRUMENT_COVERAGE` to the spawn env (line 35 area):

```ts
env: {
  ...process.env,
  DATABASE_URL: dbPath,
  // ... existing env vars ...
  INSTRUMENT_COVERAGE: process.env.INSTRUMENT_COVERAGE || "",
},
```

- [ ] **Step 3: Test the flow end-to-end**

```bash
INSTRUMENT_COVERAGE=true bun run build
# Start the server manually, kill it, check for coverage file:
INSTRUMENT_COVERAGE=true bun .output/server/index.mjs &
SERVER_PID=$!
sleep 2
kill $SERVER_PID
sleep 1
ls -la coverage/e2e/raw/server-istanbul.json
```

Expected: The file exists and contains JSON coverage data.

- [ ] **Step 4: Clean up test file and commit**

```bash
rm -rf coverage/e2e/raw/server-istanbul.json
git add e2e/fixtures/app-runtime.ts
# Also add the new server-side coverage handler file
git commit -m "test(e2e): write istanbul coverage to file on server shutdown"
```

---

### Task 18: Playwright Coverage Collection + monocart-reporter

**Files:**
- Modify: `e2e/playwright.config.ts`
- Modify: `e2e/fixtures/app.ts`

- [ ] **Step 1: Add monocart-reporter to Playwright config**

Update `e2e/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  reporter: [
    ["list"],
    ...(process.env.COLLECT_COVERAGE === "true"
      ? [
          [
            "monocart-reporter",
            {
              coverage: {
                reports: ["v8", "raw", "console-summary"],
                outputDir: "coverage/e2e",
              },
            },
          ] as const,
        ]
      : []),
  ],
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
});
```

The monocart-reporter is only active when `COLLECT_COVERAGE=true` to avoid overhead during normal E2E runs.

- [ ] **Step 2: Add client-side coverage collection to the test fixture**

In `e2e/fixtures/app.ts`, add coverage collection. Update the test fixture to start/stop JS coverage:

```ts
// Add to the test base fixture, before the existing beforeEach:
test.beforeEach(async ({ page }) => {
  if (process.env.COLLECT_COVERAGE === "true") {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
  }
});

test.afterEach(async ({ page }, testInfo) => {
  if (process.env.COLLECT_COVERAGE === "true") {
    const coverage = await page.coverage.stopJSCoverage();
    // Attach coverage to test info for monocart-reporter to collect
    const coverageJson = JSON.stringify(coverage);
    await testInfo.attach("coverage", {
      body: coverageJson,
      contentType: "application/json",
    });
  }
});
```

Note: The exact API for feeding coverage to monocart-reporter may vary. Check monocart-reporter docs for the recommended pattern with Playwright fixtures. The `testInfo.attach("coverage", ...)` pattern is one approach; monocart may also support `addCoverageReport()` via a global fixture.

- [ ] **Step 3: Test E2E with coverage collection**

```bash
INSTRUMENT_COVERAGE=true bun run build && COLLECT_COVERAGE=true bunx playwright test --config e2e/playwright.config.ts
```

Expected: Tests pass, `coverage/e2e/` directory is created with raw coverage data.

- [ ] **Step 4: Commit**

```bash
git add e2e/playwright.config.ts e2e/fixtures/app.ts
git commit -m "test(e2e): add monocart-reporter and client-side coverage collection"
```

---

### Task 19: Coverage Merge Script

**Files:**
- Create: `scripts/merge-coverage.ts`

- [ ] **Step 1: Write the merge script**

Create `scripts/merge-coverage.ts`:

```ts
import { CoverageReport } from "monocart-coverage-reports";

const thresholds: Record<string, number> = {
	lines: 100,
	statements: 100,
	functions: 100,
	branches: 95,
};

async function mergeCoverage(): Promise<void> {
	console.log("Merging coverage from unit + e2e...\n");

	const mcr = new CoverageReport({
		inputDir: ["./coverage/unit/raw", "./coverage/e2e/raw"],
		reports: ["v8", "console-summary", "html"],
		outputDir: "./coverage/merged",
	});

	const result = await mcr.generate();
	const summary = result.summary as Record<
		string,
		{ pct: number } | undefined
	>;

	console.log("\n--- Merged Coverage Thresholds ---");
	let failed = false;
	for (const [metric, threshold] of Object.entries(thresholds)) {
		const actual = summary[metric]?.pct ?? 0;
		const status = actual >= threshold ? "PASS" : "FAIL";
		console.log(
			`  ${metric}: ${actual.toFixed(2)}% (threshold: ${threshold}%) [${status}]`,
		);
		if (actual < threshold) {
			failed = true;
		}
	}

	if (failed) {
		console.error("\nMerged coverage thresholds not met.");
		process.exit(1);
	}

	console.log("\nAll merged coverage thresholds passed.");
}

mergeCoverage();
```

- [ ] **Step 2: Verify it runs (will fail without coverage data, that's expected)**

```bash
bun scripts/merge-coverage.ts
```

Expected: Runs but may error about missing input directories. That's fine — it proves the script loads and monocart API works.

- [ ] **Step 3: Commit**

```bash
git add scripts/merge-coverage.ts
git commit -m "test(coverage): add merged coverage script with threshold enforcement"
```

---

## Phase 4: Scripts + CI

### Task 20: Update package.json Scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update test scripts**

Replace the test scripts section in `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"test:coverage:server-core": "vitest run --config vitest.server-core.config.ts --coverage",
"test:e2e:install": "bunx playwright install chromium",
"test:e2e": "bun run test:e2e:install && bunx playwright test --config e2e/playwright.config.ts",
"test:e2e:coverage": "INSTRUMENT_COVERAGE=true bun run build && COLLECT_COVERAGE=true bun run test:e2e",
"test:coverage:merged": "bun scripts/merge-coverage.ts",
"test:coverage:full": "bun run test:coverage && bun run test:e2e:coverage && bun run test:coverage:merged"
```

Key changes from current:
- `test:coverage:all` renamed to `test:coverage` (simpler)
- `test:e2e` no longer builds (build is separate concern; CI builds in its own step)
- `test:e2e:coverage` does the instrumented build + coverage-enabled E2E run
- `test:coverage:merged` runs the merge script
- `test:coverage:full` chains all three

- [ ] **Step 2: Verify scripts work**

```bash
bun run test          # should run all tests
bun run test:coverage # should run with coverage + thresholds
```

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build(scripts): update test scripts for browser mode + merged coverage"
```

---

### Task 21: Update CI Pipeline

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update the unit test job**

Replace the `unit` job (lines 61-77) to install Playwright and run coverage:

```yaml
  unit:
    name: Unit / Component Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
        with:
          ref: ${{ env.CHECKOUT_REF }}

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Install Playwright Chromium
        run: bunx playwright install --with-deps chromium

      - name: Unit / Component Tests with Coverage
        run: bun run test:coverage

      - name: Upload unit coverage
        if: success()
        uses: actions/upload-artifact@v4
        with:
          name: unit-coverage
          path: coverage/unit/raw/
          retention-days: 1
```

- [ ] **Step 2: Update the e2e job to depend on unit and merge coverage**

Replace the `e2e` job (lines 94-119):

```yaml
  e2e:
    name: E2E + Merged Coverage
    needs: [unit]
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
        with:
          ref: ${{ env.CHECKOUT_REF }}

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Install ffmpeg
        run: sudo apt-get update && sudo apt-get install -y ffmpeg

      - name: Install Playwright Chromium
        run: bunx playwright install --with-deps chromium

      - name: Download unit coverage
        uses: actions/download-artifact@v4
        with:
          name: unit-coverage
          path: coverage/unit/raw/

      - name: E2E Tests with Coverage
        run: bun run test:e2e:coverage

      - name: Merge Coverage + Check Thresholds
        run: bun run test:coverage:merged
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add browser mode to unit job, coverage merge to e2e job"
```

---

### Task 22: Full Pipeline Verification

- [ ] **Step 1: Run the full local pipeline**

```bash
bun run test:coverage:full
```

This runs: unit/component coverage → E2E with instrumented build → merge + threshold check.

Expected: All steps pass. If merged thresholds fail, the console-summary report will show which files/lines are uncovered.

- [ ] **Step 2: Verify no RTL artifacts remain**

```bash
# No RTL imports in source
grep -r "@testing-library" --include="*.ts" --include="*.tsx" src/
# RTL packages not in node_modules (removed from deps)
ls node_modules/@testing-library 2>/dev/null && echo "STILL PRESENT" || echo "CLEAN"
# jsdom not in deps
grep "jsdom" package.json && echo "STILL PRESENT" || echo "CLEAN"
```

Expected: All checks show CLEAN.

- [ ] **Step 3: Run the server-core coverage gate**

```bash
bun run test:coverage:server-core
```

Expected: Passes with 95% thresholds (unchanged config).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test: verify full browser mode + merged coverage pipeline"
```
