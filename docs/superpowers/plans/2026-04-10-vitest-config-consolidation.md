# Vitest Config Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate unit tests into one Vitest config, route node and browser tests by filename suffix, remove the separate server-core config/script, and preserve stricter `src/server` coverage thresholds.

**Architecture:** Keep a single [`vitest.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.config.ts) with two projects: one node project for regular `*.test.ts[x]` files and one browser project for `*.browser.test.ts[x]` files. Use one shared coverage configuration with global thresholds plus a stricter glob threshold for `src/server` source files, and rename browser-mode tests so suffix-based routing is authoritative.

**Tech Stack:** Bun, TypeScript, Vitest 4, `@vitest/browser`, Playwright provider, Biome

---

## File Map

- Modify: [`vitest.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.config.ts)
- Modify: [`package.json`](/Users/pauldiloreto/Projects/allstarr/package.json)
- Modify: [`README.md`](/Users/pauldiloreto/Projects/allstarr/README.md)
- Modify: [`src/package-scripts.test.ts`](/Users/pauldiloreto/Projects/allstarr/src/package-scripts.test.ts)
- Create: [`src/vitest-config.test.ts`](/Users/pauldiloreto/Projects/allstarr/src/vitest-config.test.ts)
- Rename: browser-mode test files under `src/components/**`, `src/routes/**`, and any other unit-test paths matched by the browser import scan
- Delete: [`vitest.server-core.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.server-core.config.ts)
- Delete: [`vitest.server-core.allowlist.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.server-core.allowlist.ts)

### Task 1: Lock Down The Unified Vitest Contract

**Files:**
- Create: [`src/vitest-config.test.ts`](/Users/pauldiloreto/Projects/allstarr/src/vitest-config.test.ts)
- Modify: [`vitest.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.config.ts)
- Delete: [`vitest.server-core.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.server-core.config.ts)
- Delete: [`vitest.server-core.allowlist.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.server-core.allowlist.ts)
- Test: [`src/vitest-config.test.ts`](/Users/pauldiloreto/Projects/allstarr/src/vitest-config.test.ts)

- [ ] **Step 1: Write the failing config guard test**

```ts
import { describe, expect, it } from "vitest";
import config from "../vitest.config";

describe("vitest config", () => {
	it("routes node and browser tests by suffix", () => {
		const projects = config.test?.projects;

		expect(projects).toHaveLength(2);
		expect(projects?.[0]?.test?.include).toEqual(["**/*.test.ts", "**/*.test.tsx"]);
		expect(projects?.[0]?.test?.exclude).toEqual([
			"**/*.browser.test.ts",
			"**/*.browser.test.tsx",
		]);
		expect(projects?.[1]?.test?.include).toEqual([
			"**/*.browser.test.ts",
			"**/*.browser.test.tsx",
		]);
	});

	it("keeps stricter coverage thresholds for server source files", () => {
		expect(config.test?.coverage?.thresholds).toMatchObject({
			statements: 90,
			branches: 85,
			functions: 90,
			lines: 90,
			"src/server/**/*.{ts,tsx}": {
				statements: 95,
				branches: 95,
				functions: 95,
				lines: 95,
			},
		});
	});
});
```

- [ ] **Step 2: Run the guard test to verify it fails against the old config**

Run: `bunx vitest run src/vitest-config.test.ts`

Expected: FAIL because the current config still uses path-based `include` and `exclude` arrays and does not expose the `src/server/**/*.{ts,tsx}` threshold.

- [ ] **Step 3: Simplify `vitest.config.ts` and remove the extra server-core config files**

```ts
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import tsconfigPaths from "vite-tsconfig-paths";

const nodeTestInclude = ["**/*.test.ts", "**/*.test.tsx"];
const browserTestPatterns = ["**/*.browser.test.ts", "**/*.browser.test.tsx"];

const coverageExclude = [
	"**/*.test.*",
	"**/*.spec.*",
	"src/routeTree.gen.ts",
	"src/db/index.ts",
	"src/db/schema/**",
	"e2e/fixtures/**",
	"**/types.ts",
	"src/lib/auth-client.ts",
	"src/lib/query-client.ts",
	"src/lib/auth.ts",
	"src/lib/queries/index.ts",
	"src/hooks/mutations/index.ts",
	"src/lib/custom-format-preset-data.ts",
	"src/lib/tmdb-validators.ts",
	"src/test/**",
];

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		setupFiles: ["src/test/setup.ts"],
		projects: [
			{
				extends: true,
				test: {
					include: nodeTestInclude,
					exclude: browserTestPatterns,
				},
			},
			{
				extends: true,
				resolve: {
					alias: {
						"@tanstack/react-start/server": new URL(
							"./src/test/empty-module.ts",
							import.meta.url,
						).pathname,
						"@tanstack/react-start-server": new URL(
							"./src/test/empty-module.ts",
							import.meta.url,
						).pathname,
						"@tanstack/start-server-core": new URL(
							"./src/test/empty-module.ts",
							import.meta.url,
						).pathname,
					},
				},
				optimizeDeps: {
					include: [
						"react",
						"react/jsx-dev-runtime",
						"react-dom",
						"react-dom/client",
						"react-dom/server",
						"@tanstack/react-query",
						"@tanstack/react-router",
						"vitest-browser-react",
						"clsx",
						"tailwind-merge",
						"class-variance-authority",
						"lucide-react",
						"radix-ui",
						"sonner",
						"better-auth/client/plugins",
						"better-auth/react",
					],
					exclude: [
						"@tanstack/react-start",
						"@tanstack/react-start/server",
						"@tanstack/react-start-server",
						"@tanstack/start-server-core",
					],
				},
				test: {
					include: browserTestPatterns,
					browser: {
						enabled: true,
						headless: true,
						provider: playwright(),
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
		coverage: {
			provider: "custom",
			customProviderModule: "vitest-monocart-coverage/browser",
			all: true,
			include: ["src/**/*.{ts,tsx}", "e2e/fixtures/**/*.ts"],
			exclude: coverageExclude,
			reports: ["v8", "console-summary", "html", "raw"],
			outputDir: "coverage/unit",
			thresholds: {
				statements: 90,
				branches: 85,
				functions: 90,
				lines: 90,
				"src/server/**/*.{ts,tsx}": {
					statements: 95,
					branches: 95,
					functions: 95,
					lines: 95,
				},
			},
		} as any,
	},
});
```

Also remove the separate files entirely:

```bash
rm vitest.server-core.config.ts vitest.server-core.allowlist.ts
```

- [ ] **Step 4: Run the config guard test to verify the unified config passes**

Run: `bunx vitest run src/vitest-config.test.ts`

Expected: PASS with two config assertions and no references to the deleted server-core config files.

- [ ] **Step 5: Commit the config consolidation**

```bash
git add src/vitest-config.test.ts vitest.config.ts vitest.server-core.config.ts vitest.server-core.allowlist.ts
git commit -m "test(config): consolidate vitest projects"
```

### Task 2: Rename Browser Tests To The `.browser.test` Suffix

**Files:**
- Modify: browser-mode unit test filenames currently using `.test.ts` or `.test.tsx`
- Test: all browser-mode files matched by the `vitest/browser` and `vitest-browser-react` import scan

- [ ] **Step 1: Generate the rename set from browser-runtime imports**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
import subprocess

root = Path("/Users/pauldiloreto/Projects/allstarr")
matches = subprocess.check_output(
	["rg", "-l", 'from "vitest/browser"|from "vitest-browser-react"', "src", "e2e/fixtures"],
	cwd=root,
	text=True,
).splitlines()

for rel in matches:
	if rel == "src/test/render.tsx":
		continue
	print(rel)
PY
```

Expected: a deterministic list of browser-mode unit tests, currently about 140 files.

- [ ] **Step 2: Rename each browser-mode test with `git mv`**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
import subprocess

root = Path("/Users/pauldiloreto/Projects/allstarr")
matches = subprocess.check_output(
	["rg", "-l", 'from "vitest/browser"|from "vitest-browser-react"', "src", "e2e/fixtures"],
	cwd=root,
	text=True,
).splitlines()

for rel in matches:
	if rel == "src/test/render.tsx" or ".browser.test." in rel:
		continue
	new_rel = rel.replace(".test.tsx", ".browser.test.tsx").replace(
		".test.ts",
		".browser.test.ts",
	)
	subprocess.run(["git", "mv", rel, new_rel], cwd=root, check=True)
	print(f"{rel} -> {new_rel}")
PY
```

Expected: every browser-mode unit test now ends in `.browser.test.ts` or `.browser.test.tsx`.

- [ ] **Step 3: Verify no browser-runtime imports remain in plain `.test` files**

Run:

```bash
rg -n 'from "vitest/browser"|from "vitest-browser-react"' src e2e/fixtures \
	-g '!**/*.browser.test.ts' \
	-g '!**/*.browser.test.tsx' \
	-g '!src/test/render.tsx'
```

Expected: no output.

- [ ] **Step 4: Smoke-test browser discovery on a renamed file**

Run: `bunx vitest run src/components/ui/accordion.browser.test.tsx`

Expected: PASS, confirming a renamed `.browser.test.tsx` file is discovered and executed successfully under the browser project.

- [ ] **Step 5: Commit the rename set**

```bash
git add src
git commit -m "test(browser): rename browser vitest files"
```

### Task 3: Remove The Extra Script Surface And Update Documentation

**Files:**
- Modify: [`package.json`](/Users/pauldiloreto/Projects/allstarr/package.json)
- Modify: [`src/package-scripts.test.ts`](/Users/pauldiloreto/Projects/allstarr/src/package-scripts.test.ts)
- Modify: [`README.md`](/Users/pauldiloreto/Projects/allstarr/README.md)
- Test: [`src/package-scripts.test.ts`](/Users/pauldiloreto/Projects/allstarr/src/package-scripts.test.ts)

- [ ] **Step 1: Add a failing script regression test for the removed server-core script**

Update [`src/package-scripts.test.ts`](/Users/pauldiloreto/Projects/allstarr/src/package-scripts.test.ts) to include:

```ts
it("does not expose a separate server-core coverage script", () => {
	expect(packageJson.scripts["test:coverage:server-core"]).toBeUndefined();
});
```

- [ ] **Step 2: Run the package script test to verify it fails**

Run: `bunx vitest run src/package-scripts.test.ts`

Expected: FAIL because `package.json` still contains `test:coverage:server-core`.

- [ ] **Step 3: Remove the old script and refresh command docs**

Update [`package.json`](/Users/pauldiloreto/Projects/allstarr/package.json):

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"test:e2e:install": "bunx playwright install chromium",
"test:e2e": "bun run test:e2e:install && bunx playwright test --config e2e/playwright.config.ts",
"test:e2e:coverage": "INSTRUMENT_COVERAGE=true bun run build && COLLECT_COVERAGE=true bun run test:e2e",
"test:coverage:merged": "bun scripts/merge-coverage.ts",
"test:coverage:full": "bun run test:coverage && bun run test:e2e:coverage && bun run test:coverage:merged"
```

Update the README command list to remove `test:coverage:server-core` and correct the stale `test:coverage:all` entry to `test:coverage:full`:

```md
- `bun run build`
- `bun run start`
- `bun run test`
- `bun run test:coverage`
- `bun run test:coverage:full`
- `bun run lint`
- `bun run db:migrate`
```

- [ ] **Step 4: Run the package script regression test again**

Run: `bunx vitest run src/package-scripts.test.ts`

Expected: PASS with both the instrumentation-order assertion and the removed-script assertion succeeding.

- [ ] **Step 5: Commit the script and docs cleanup**

```bash
git add package.json README.md src/package-scripts.test.ts
git commit -m "test(scripts): remove server-core coverage script"
```

### Task 4: Full Verification And Coverage Gate Review

**Files:**
- Review: [`vitest.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.config.ts)
- Review: coverage output under `coverage/unit/`

- [ ] **Step 1: Run the full unit test suite through the unified config**

Run: `bun run test`

Expected: PASS with both node and browser unit tests discovered from the single Vitest config.

- [ ] **Step 2: Run coverage through the unified config**

Run: `bun run test:coverage`

Expected: PASS with the global thresholds and the stricter `src/server/**/*.{ts,tsx}` thresholds both enforced from the single config.

- [ ] **Step 3: Run type-checking to catch rename or config fallout**

Run: `bun run typecheck`

Expected: PASS with no import-resolution or config typing regressions after the file renames.

- [ ] **Step 4: If coverage fails on the expanded `src/server` threshold, inspect before changing scope**

Run:

```bash
git diff -- vitest.config.ts
```

Then inspect the coverage summary already printed by `bun run test:coverage` and identify whether the misses come from:

- thin adapters or wrappers that should still meet `95%`
- large integration-oriented modules that may need a narrower threshold glob

Do not lower the threshold blindly. If narrowing is required, adjust only the threshold glob in [`vitest.config.ts`](/Users/pauldiloreto/Projects/allstarr/vitest.config.ts), rerun `bun run test:coverage`, and record the rationale in the commit message.

- [ ] **Step 5: Commit only if verification required a threshold-scope change**

```bash
git add vitest.config.ts
git commit -m "test(coverage): narrow server threshold scope"
```

Expected: create this commit only if Step 4 required a change to the `src/server` threshold scope. If verification passed without further edits, there is nothing to commit in this task.
