# Vitest Browser Mode Migration + Merged Coverage

## Overview

Migrate all 151 component tests from React Testing Library + jsdom to Vitest Browser Mode + Playwright, unify coverage collection across unit/component and E2E tests using monocart, and enforce hybrid coverage thresholds.

**Goals (equal priority):**
- **Realism** — component tests run in a real Chromium browser instead of jsdom
- **Simplification** — drop RTL, jsdom, and related deps; one API (Playwright locators) for both component and E2E tests
- **Coverage merging** — merged coverage from all test types with enforced thresholds

## Dependencies

### Add
- `@vitest/browser` — Vitest browser mode provider
- `vitest-monocart-coverage` — monocart coverage provider for Vitest
- `monocart-coverage-reports` — coverage merging CLI/API
- `monocart-reporter` — Playwright reporter for E2E coverage collection
- `vite-plugin-istanbul` — Istanbul instrumentation for E2E server coverage

### Remove
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`
- `jsdom`

## Vitest Configuration

### Current State
Two vitest projects in `vitest.config.ts`:
- **Node project:** runs `src/**/*.test.ts`, server `.tsx` tests, e2e fixture tests — no environment
- **Frontend project:** runs `src/**/*.test.tsx` (excluding server) — jsdom environment

### New State
- **Node project:** unchanged
- **Browser project:** replaces jsdom project with Vitest browser mode

```ts
// vitest.config.ts — browser project
{
  extends: true,
  test: {
    include: frontendTestInclude,
    exclude: frontendTestExclude,
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [{ browser: 'chromium' }],
    },
  },
}
```

### Coverage Provider

Replace `@vitest/coverage-v8` with `vitest-monocart-coverage`:

```ts
coverage: {
  provider: 'custom',
  customProviderModule: 'vitest-monocart-coverage/browser',
  reports: ['v8', 'raw'],  // raw for later merging with E2E
  outputDir: 'coverage/unit',
  include: fullRepoCoverageInclude,
  exclude: coverageExclude,
  thresholds: {
    statements: 90,
    branches: 85,
    functions: 90,
    lines: 90,
  },
}
```

The `raw` report type preserves coverage data for later merging with E2E coverage.

### Server-Core Config

`vitest.server-core.config.ts` stays unchanged — it runs node-only tests against 16 critical server files with 95% thresholds. No browser mode needed.

## Component Test Migration

Big-bang migration of all 151 `.test.tsx` files from RTL to Vitest browser mode + Playwright locators.

### API Mapping

| RTL Pattern | Vitest Browser Mode Equivalent |
|---|---|
| `import { render } from '@testing-library/react'` | `import { render } from '@vitest/browser/utils'` |
| `import { screen } from '@testing-library/react'` | `import { page } from '@vitest/browser/context'` |
| `import userEvent from '@testing-library/user-event'` | Use locator methods directly (`.click()`, `.fill()`) |
| `renderWithProviders(<Comp />)` | `renderWithProviders(<Comp />)` (wrapper updated internally) |
| `screen.getByRole('button', { name: 'Save' })` | `page.getByRole('button', { name: 'Save' })` |
| `screen.getByText('Hello')` | `page.getByText('Hello')` |
| `screen.getByTestId('foo')` | `page.getByTestId('foo')` |
| `screen.queryByText('Gone')` | `expect.element(page.getByText('Gone')).not.toBeInTheDocument()` |
| `userEvent.setup()` then `user.click(el)` | `locator.click()` |
| `userEvent.type(el, 'text')` | `locator.fill('text')` |
| `fireEvent.change(el, { target: { value } })` | `locator.fill(value)` |
| `waitFor(() => expect(...))` | Playwright locators auto-retry; use `await expect.element(locator).toBeVisible()` |
| `within(container).getByRole(...)` | `container.getByRole(...)` (locators are scopeable) |
| `expect(el).toBeInTheDocument()` | `await expect.element(locator).toBeInTheDocument()` |
| `expect(el).toHaveTextContent('x')` | `await expect.element(locator).toHaveTextContent('x')` |

### Key Behavioral Changes

- **All locator assertions become `await`-ed** — `expect.element()` returns a promise with auto-retry
- **No more `act()` wrapping** — browser mode handles this naturally
- **`vi.mock()` still works** — Vitest handles module mocking before browser execution
- **`cleanup()` is automatic** — Vitest browser mode cleans up between tests
- **`ResizeObserver` mock removed** — real browser provides it

### Updated Test Utilities

**`src/test/setup.ts`:**
Remove RTL imports (`@testing-library/jest-dom/vitest`, `cleanup`), remove `ResizeObserver` mock. May become empty or minimal.

**`src/test/render.tsx`:**
```tsx
import { render, renderHook } from '@vitest/browser/utils';
import type { RenderHookOptions, ReactElement } from 'react';
// ... TestProviders component stays the same (QueryClientProvider + TooltipProvider) ...

export function renderWithProviders(ui: ReactElement) {
  return render(ui, { wrapper: TestProviders });
}

export function renderHookWithProviders<Result, Props>(
  callback: (initialProps: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, 'wrapper'>,
) {
  return renderHook(callback, { ...options, wrapper: TestProviders });
}
```

## E2E Coverage Collection

### The Problem

The E2E test server runs as `bun .output/server/index.mjs`. Bun uses JavaScriptCore (not V8), so `NODE_V8_COVERAGE`, `c8`, and CDP-based server coverage don't work.

### The Solution: Istanbul Instrumentation at Build Time

#### Step 1: Instrumented Build

Add `vite-plugin-istanbul` to the Vite config, activated by environment variable:

```ts
// In app.config.ts — TanStack Start's Vite config
import istanbul from 'vite-plugin-istanbul';

// Conditionally add Istanbul plugin when building for E2E coverage
const plugins = [];
if (process.env.INSTRUMENT_COVERAGE === 'true') {
  plugins.push(istanbul({
    include: 'src/**/*',
    exclude: ['node_modules', '**/*.test.*', '**/*.spec.*'],
    extension: ['.ts', '.tsx'],
  }));
}
// Add to the vite plugins array in app.config.ts
```

Build command: `INSTRUMENT_COVERAGE=true bun run build`

This produces `.output/server/index.mjs` with Istanbul instrumentation. When Bun runs it, `global.__coverage__` accumulates coverage data at runtime.

#### Step 2: Coverage Extraction Endpoint

Add a test-only API endpoint (gated behind existing `E2E_TEST_MODE` env var):

```ts
// GET /api/__test-coverage
// Returns global.__coverage__ as JSON
// Only available when E2E_TEST_MODE=true
```

#### Step 3: Playwright Coverage Collection

**Client-side coverage** — collected via Playwright's `page.coverage` CDP API:
- `page.coverage.startJSCoverage()` in test fixture setup
- `page.coverage.stopJSCoverage()` in `afterEach`, fed to monocart

**Server-side coverage** — collected in Playwright global teardown:
- `GET /api/__test-coverage` from the running server
- Write Istanbul data to `coverage/e2e/raw/`

**Playwright config gains monocart-reporter:**

```ts
// e2e/playwright.config.ts
export default defineConfig({
  reporter: [
    ['list'],
    ['monocart-reporter', {
      coverage: {
        reports: ['v8', 'raw'],
        outputDir: 'coverage/e2e',
      },
    }],
  ],
  // ... rest unchanged
});
```

No changes to the app spawn config (`e2e/fixtures/app-runtime.ts`) — still `bun .output/server/index.mjs`.

## Coverage Merging

### Three Coverage Sources

| Source | Directory | Format | Collected During |
|---|---|---|---|
| Vitest browser mode (unit/component) | `coverage/unit/raw/` | V8 | `bun run test:coverage` |
| Playwright client-side (browser JS) | `coverage/e2e/raw/` | V8 | `bun run test:e2e:coverage` |
| Playwright server-side (Istanbul) | `coverage/e2e/raw/` | Istanbul | `bun run test:e2e:coverage` |

### Merge Script

`scripts/merge-coverage.ts` — uses monocart's API to merge and enforce thresholds:

```ts
import { CoverageReport } from 'monocart-coverage-reports';

const mcr = new CoverageReport({
  inputDir: ['./coverage/unit/raw', './coverage/e2e/raw'],
  reports: ['v8', 'console-summary', 'html'],
  outputDir: './coverage/merged',
  // reuse existing include/exclude from vitest.config.ts
});

const result = await mcr.generate();

// Check thresholds against the summary
const summary = result.summary;
const thresholds = { lines: 100, statements: 100, functions: 100, branches: 95 };
let failed = false;
for (const [metric, threshold] of Object.entries(thresholds)) {
  const actual = summary[metric]?.pct ?? 0;
  if (actual < threshold) {
    console.error(`${metric}: ${actual}% < ${threshold}% threshold`);
    failed = true;
  }
}
if (failed) process.exit(1);
```

### Threshold Enforcement

| Level | Lines | Statements | Functions | Branches |
|---|---|---|---|---|
| Unit/component only (vitest config) | 90% | 90% | 90% | 85% |
| Merged: unit + e2e (merge script) | 100% | 100% | 100% | 95% |
| Server-core (unchanged) | 95% | 95% | 95% | 95% |

## Package.json Scripts

| Script | Command | Purpose |
|---|---|---|
| `test` | `vitest run` | Fast test run, no coverage |
| `test:watch` | `vitest` | Watch mode for development |
| `test:coverage` | `vitest run --coverage` | Unit/component with thresholds |
| `test:coverage:server-core` | `vitest run --config vitest.server-core.config.ts --coverage` | Server-core 95% gate (unchanged) |
| `test:e2e` | existing e2e command | E2E without coverage (fast, local dev) |
| `test:e2e:coverage` | `INSTRUMENT_COVERAGE=true bun run build && bun run test:e2e` (with monocart reporter active) | E2E with coverage collection |
| `test:coverage:merged` | `bun scripts/merge-coverage.ts` | Merge unit + e2e coverage, check thresholds |
| `test:coverage:full` | `test:coverage && test:e2e:coverage && test:coverage:merged` | Full pipeline |

## CI Pipeline

### Current Jobs (6)
Lint, Typecheck, Unit Tests, Coverage (Server/Core), Playwright, Docker Verify — all parallel.

### New Jobs (7)
Same structure with coverage-aware changes.

```
lint              ─┐
typecheck         ─┤
coverage-server   ─┤── all parallel
docker-verify     ─┤
unit              ─┘
                  │
                  ▼ (artifact: coverage/unit/raw/)
                e2e + merge
```

**Unit / Component Tests job:**
1. Checkout, Setup Bun, Install deps
2. Install Playwright Chromium (needed for browser mode)
3. `bun run test:coverage` — runs Vitest with browser mode, enforces unit thresholds
4. Upload `coverage/unit/raw/` as GitHub Actions artifact

**E2E + Merged Coverage job** (depends on Unit):
1. Checkout, Setup Bun, Install deps
2. Install ffmpeg, Install Playwright Chromium
3. Download unit coverage artifact
4. `INSTRUMENT_COVERAGE=true bun run build` — instrumented build
5. `bun run test:e2e:coverage` — E2E with monocart reporter
6. `bun run test:coverage:merged` — merge + threshold check

**Trade-off:** E2E becomes sequential after Unit (was parallel). This adds wall-clock time but is required for correct merged coverage. Unit still runs in parallel with lint/typecheck/docker for fast feedback on failures.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `vite-plugin-istanbul` may not instrument TanStack Start's SSR bundle correctly | Test early in implementation; fall back to Node for E2E server if needed |
| Browser mode is slower than jsdom for component tests | Chromium startup is one-time per run; individual test overhead is minimal. Monitor CI time. |
| 100% merged line coverage may be unreachable for some files | The merge script should report which files/lines are uncovered so they can be addressed. Adjust threshold if truly unreachable code exists. |
| Vitest browser mode + monocart custom provider compatibility | `vitest-monocart-coverage` has a dedicated `/browser` entry point for this; verify with current Vitest v4.x |
| 151-file big-bang migration may introduce test regressions | Run full suite after migration, compare test counts, fix failures before merging |
