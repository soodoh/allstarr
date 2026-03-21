# Plan: Fix All Failing Playwright E2E Tests

**Created:** 2026-03-21
**Status:** Ready for execution
**Goal:** Fix all 100 failing Playwright E2E tests using best practices for React SSR apps

## Diagnosis Summary

**100 tests across 10 suites.** Auth tests (suite 01, 6 tests) pass. All other 94 tests fail.

### Root Cause: React SSR Hydration Race Condition

When Playwright navigates to a page, TanStack Start serves server-rendered HTML. The browser fires `load` (which `navigateTo()` waits for), but React hasn't finished hydrating — meaning event handlers (onClick, onChange, etc.) are NOT attached to the DOM elements yet. Clicking buttons does nothing.

**Evidence:**

- Auth tests pass because they use `waitForHydration(page)` which checks for `__reactFiber` on `<form>` elements
- Settings test screenshot shows the Download Clients page fully rendered, but clicking "Add Client" doesn't open the dialog
- The `waitForHydration` helper only works on pages with `<form>` elements — it doesn't apply to general pages

### Affected Test Suites

| Suite                 | Tests | Primary Interaction Pattern              | Hydration-Sensitive? |
| --------------------- | ----- | ---------------------------------------- | -------------------- |
| 01-auth               | 6     | Form fill + submit                       | Already fixed        |
| 02-settings-config    | 22    | Button click to open dialogs, form fills | Yes                  |
| 03-author-book-import | 12    | Search, modals, button clicks            | Yes                  |
| 04-search-grab        | 9     | Tab clicks, grab buttons                 | Yes                  |
| 05-queue-management   | 9     | Pause/resume/remove buttons              | Yes                  |
| 06-auto-search        | 9     | Task trigger (button click)              | Yes                  |
| 07-download-lifecycle | 8     | Task trigger (button click)              | Yes                  |
| 08-disk-scan          | 7     | Task trigger (button click)              | Yes                  |
| 09-system-health      | 8     | Page checking + task trigger             | Yes                  |
| 10-blocklist-failure  | 9     | Button clicks, dialogs                   | Yes                  |

---

## Phase 1: Fix Hydration Wait Infrastructure

**Goal:** Make all page navigations wait for React hydration before allowing interactions.

### Task 1.1: Generalize `waitForHydration` in `e2e/helpers/auth.ts`

The current implementation only checks `<form>` elements:

```ts
// CURRENT (only works on form pages)
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const form = document.querySelector("form");
      if (!form) return false;
      return Object.keys(form).some(
        (k) => k.startsWith("__reactFiber") || k.startsWith("__reactProps"),
      );
    },
    undefined,
    { timeout: 15_000 },
  );
}
```

**Fix:** Create a new generic `waitForHydration` that checks any interactive element:

```ts
// NEW (works on any page with buttons, links, or inputs)
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('button, a, input, [role="button"]');
      if (!el) return false;
      return Object.keys(el).some(
        (k) => k.startsWith("__reactFiber") || k.startsWith("__reactProps"),
      );
    },
    undefined,
    { timeout: 15_000 },
  );
}
```

**File:** `e2e/helpers/auth.ts` — update the `waitForHydration` function (lines 14-28)

### Task 1.2: Add hydration wait to `navigateTo` in `e2e/helpers/navigation.ts`

```ts
// CURRENT
export default async function navigateTo(page, baseUrl, path): Promise<void> {
  await page.goto(`${baseUrl}${path}`);
  await page.waitForLoadState("load");
}
```

**Fix:** Import and call `waitForHydration` after load:

```ts
import { waitForHydration } from "./auth";

export default async function navigateTo(page, baseUrl, path): Promise<void> {
  await page.goto(`${baseUrl}${path}`);
  await page.waitForLoadState("load");
  await waitForHydration(page);
}
```

**File:** `e2e/helpers/navigation.ts`

### Task 1.3: Add hydration wait to `page.reload()` calls

Some tests call `page.reload()` directly (auth tests, settings tests). After each reload, add:

```ts
await page.reload();
await page.waitForLoadState("load");
await waitForHydration(page);
```

**Files to check:** All test files that call `page.reload()`

### Verification

Run just the auth + settings tests:

```bash
bun run test:e2e -- --grep "Auth|Settings" --workers=1
```

**Expected:** Auth tests still pass. Settings tests should progress further (dialogs should open).

---

## Phase 2: Fix Individual Test Suite Issues

After Phase 1 unblocks most tests, run each suite individually and fix remaining issues. These are the **predicted secondary issues** based on code review:

### Task 2.1: Verify and fix selectors in `02-settings-config.spec.ts`

Key selectors to verify against actual UI:

- `page.getByRole("button", { name: "qBittorrent" })` — button accessible name is "qBittorrent Web API v2" (contains label + description spans). Playwright's `getByRole` does substring matching by default so this _should_ work, but verify.
- `page.locator("#dc-name")`, `#dc-host`, `#dc-port` etc. — verify these IDs exist in `download-client-form.tsx` (confirmed: they do)
- `page.locator("#ix-name")`, `#ix-baseurl`, `#ix-apikey` — verify in indexer form
- `page.locator("#ix-download-client")` — verify in indexer form (download client override select)

**Files:** `e2e/tests/02-settings-config.spec.ts`, `src/components/settings/download-clients/`, `src/components/settings/indexers/`

### Task 2.2: Verify and fix `03-author-book-import.spec.ts`

Key interactions:

- Search input (`page.getByPlaceholder("Search...")` or similar)
- Hardcover search results rendering
- Add to bookshelf flow
- Author preview modal

**Dependencies:** Hardcover fake server must return valid GraphQL responses

### Task 2.3: Verify and fix `04-search-grab.spec.ts`

Key interactions:

- Tab switching ("Search Releases" tab on book detail page)
- Release list rendering from Newznab fake server
- Grab button with `title` attribute

### Task 2.4: Verify and fix `05-queue-management.spec.ts`

Key interactions:

- Queue items rendered from seeded `trackedDownloads` + fake server state
- Pause/resume/remove buttons with `title` attributes
- SSE real-time indicator
- Connection warning banner

### Task 2.5: Verify and fix `06-auto-search.spec.ts`

Key interactions:

- `triggerTask()` helper navigates to `/system/tasks`, finds task row, clicks Run
- After task runs, checks DB state (tracked downloads created, blocklist entries, etc.)
- Newznab fake server returns RSS releases

### Task 2.6: Verify and fix `07-download-lifecycle.spec.ts`

Key interactions:

- Task trigger for "Refresh Downloads"
- Filesystem operations with `tempDir`
- qBittorrent fake server state transitions (queued -> downloading -> completed)
- History entries, SSE events

### Task 2.7: Verify and fix `08-disk-scan.spec.ts`

Key interactions:

- Task trigger for "Rescan Folders"
- Filesystem operations (create author/book directories, write files)
- DB state verification after scan

### Task 2.8: Verify and fix `09-system-health.spec.ts`

Key interactions:

- Health status cards (checking text like "All systems healthy")
- Warning messages for missing config
- About card with version info
- Task list and "Run Now" button

### Task 2.9: Verify and fix `10-blocklist-failure.spec.ts`

Key interactions:

- Blocklist page rendering
- Task trigger for failure detection
- Remove/bulk-remove from blocklist
- Manual add to blocklist via queue dialog

### Verification (per suite)

After fixing each suite, run it individually:

```bash
bun run test:e2e -- --grep "Suite Name" --workers=1
```

---

## Phase 3: Integration Verification

### Task 3.1: Run full test suite

```bash
bun run test:e2e -- --workers=1
```

All 100 tests should pass.

### Task 3.2: Run with default parallelism

```bash
bun run test:e2e
```

Verify no race conditions between tests sharing the same worker's DB or fake servers.

### Task 3.3: Grep for anti-patterns

```bash
# Check no test uses networkidle (SSE keeps connection open)
grep -r "networkidle" e2e/

# Check all navigations go through navigateTo or use waitForHydration
grep -rn "page.goto" e2e/tests/

# Check no hardcoded ports (should use PORTS constant)
grep -rn "19[0-9][0-9][0-9]" e2e/tests/
```

---

## Key Patterns & Anti-Patterns

### Patterns to Follow

- **Always wait for hydration** after navigation or reload
- **Use `waitForLoadState("load")`** not `"networkidle"` — SSE keeps the network active
- **Use `getByRole`, `getByLabel`, `getByText`** for resilient selectors
- **Use `expect().toPass()`** for polling assertions (waiting for async state changes)
- **Reset fake servers** in beforeEach (handled by app fixture automatically)

### Anti-Patterns to Avoid

- `page.waitForLoadState("networkidle")` — never works with SSE connections
- `page.waitForTimeout(ms)` — flaky, prefer explicit wait conditions
- Direct `page.goto()` without hydration wait (outside of auth helpers)
- Checking for exact text that may vary (versions, timestamps)

---

## Files Modified Summary

| File                        | Change                                                         |
| --------------------------- | -------------------------------------------------------------- |
| `e2e/helpers/auth.ts`       | Generalize `waitForHydration` to check any interactive element |
| `e2e/helpers/navigation.ts` | Add `waitForHydration` call after load                         |
| `e2e/tests/02-*.spec.ts`    | Fix selectors/assertions as needed                             |
| `e2e/tests/03-*.spec.ts`    | Fix selectors/assertions as needed                             |
| `e2e/tests/04-*.spec.ts`    | Fix selectors/assertions as needed                             |
| `e2e/tests/05-*.spec.ts`    | Fix selectors/assertions as needed                             |
| `e2e/tests/06-*.spec.ts`    | Fix selectors/assertions as needed                             |
| `e2e/tests/07-*.spec.ts`    | Fix selectors/assertions as needed                             |
| `e2e/tests/08-*.spec.ts`    | Fix selectors/assertions as needed                             |
| `e2e/tests/09-*.spec.ts`    | Fix selectors/assertions as needed                             |
| `e2e/tests/10-*.spec.ts`    | Fix selectors/assertions as needed                             |
