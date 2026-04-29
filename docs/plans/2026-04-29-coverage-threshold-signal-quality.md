# Coverage Threshold Signal Quality Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Make coverage failures explain which coverage layer/input failed and what each threshold means, without lowering thresholds or changing the existing CI gates.

**Architecture:** Keep `scripts/merge-coverage.ts` as the CLI entry point, but extract small pure helpers so threshold formatting and input diagnostics are unit-testable. Add lightweight filesystem diagnostics for raw coverage inputs before the Monocart merge, and document how unit/browser thresholds differ from merged e2e thresholds in `docs/testing.md`.

**Tech Stack:** Bun, TypeScript, Vitest, Monocart coverage reports, GitHub Actions.

---

## Chosen backlog item

Address `P1-9: Improve coverage threshold signal quality` from `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`.

Current evidence:

- `vitest.config.ts` owns unit/browser coverage instrumentation and exclusions.
- `.github/workflows/ci.yml` runs unit/browser coverage first, uploads `coverage/unit/raw`, then e2e coverage and merged thresholds.
- `scripts/merge-coverage.ts` merges `coverage/unit/raw` and `coverage/e2e/raw`, then reports only aggregate merged threshold pass/fail.

Out of scope:

- Do not lower thresholds.
- Do not replace Monocart or split the existing CI jobs.
- Do not add broad new product tests; this work improves diagnostics around existing coverage gates.

## Design options considered

1. **Recommended: testable merge helpers + source diagnostics + docs.** Smallest change that makes failures actionable. It preserves current commands while adding input summaries and tested formatting.
2. **Docs only.** Low effort, but failures would still be ambiguous in CI logs when raw coverage inputs are missing, empty, or below a merged threshold.
3. **Large CI/reporting redesign.** Could produce richer artifacts, but it is too much for this backlog item and risks changing reliable CI gates unnecessarily.

## Task 1: Make merge threshold logic testable

**Files:**

- Modify: `vitest.config.ts`
- Modify: `scripts/merge-coverage.ts`
- Create: `scripts/merge-coverage.test.ts`

**Step 1: Write the failing tests**

Create `scripts/merge-coverage.test.ts` with tests for pure threshold formatting and failure detection:

```ts
import { describe, expect, it } from "vitest";
import {
	buildThresholdReport,
	coverageThresholds,
	isThresholdReportPassing,
} from "./merge-coverage";

describe("merge coverage threshold reporting", () => {
	it("marks every metric with pass/fail status", () => {
		const report = buildThresholdReport(
			{
				lines: { pct: 81.23 },
				statements: { pct: 74.5 },
				functions: { pct: 75 },
				branches: { pct: 44.99 },
			},
			coverageThresholds,
		);

		expect(report).toEqual([
			{ metric: "lines", actual: 81.23, threshold: 80, passed: true },
			{ metric: "statements", actual: 74.5, threshold: 75, passed: false },
			{ metric: "functions", actual: 75, threshold: 75, passed: true },
			{ metric: "branches", actual: 44.99, threshold: 45, passed: false },
		]);
		expect(isThresholdReportPassing(report)).toBe(false);
	});

	it("treats missing summary metrics as zero", () => {
		const report = buildThresholdReport({}, coverageThresholds);

		expect(report.map((entry) => entry.actual)).toEqual([0, 0, 0, 0]);
		expect(isThresholdReportPassing(report)).toBe(false);
	});
});
```

**Step 2: Include script tests in Vitest**

In `vitest.config.ts`, add `scripts/**/*.test.ts` to the Node project `include` list:

```ts
include: [
	"src/**/*.test.{ts,tsx}",
	"e2e/fixtures/**/*.test.ts",
	"e2e/helpers/**/*.test.ts",
	"scripts/**/*.test.ts",
],
```

**Step 3: Run the focused failing test**

Run:

```bash
bun run test -- scripts/merge-coverage.test.ts
```

Expected: FAIL because `buildThresholdReport`, `coverageThresholds`, and `isThresholdReportPassing` are not exported yet.

**Step 4: Extract pure helpers**

Refactor `scripts/merge-coverage.ts` so importing it does not run the merge. Keep the existing CLI behavior behind `if (import.meta.main)`.

Add exports shaped like this:

```ts
export const coverageThresholds = {
	lines: 80,
	statements: 75,
	functions: 75,
	branches: 45,
} as const;

type CoverageMetric = keyof typeof coverageThresholds;

type CoverageSummary = Partial<Record<CoverageMetric, { pct: number }>>;

export type ThresholdReportEntry = {
	metric: CoverageMetric;
	actual: number;
	threshold: number;
	passed: boolean;
};

export function buildThresholdReport(
	summary: CoverageSummary,
	thresholds: typeof coverageThresholds,
): ThresholdReportEntry[] {
	return Object.entries(thresholds).map(([metric, threshold]) => {
		const coverageMetric = metric as CoverageMetric;
		const actual = summary[coverageMetric]?.pct ?? 0;
		return {
			metric: coverageMetric,
			actual,
			threshold,
			passed: actual >= threshold,
		};
	});
}

export function isThresholdReportPassing(
	report: ThresholdReportEntry[],
): boolean {
	return report.every((entry) => entry.passed);
}
```

Update the existing CLI output loop to consume `buildThresholdReport(result.summary, coverageThresholds)`.

**Step 5: Verify the focused test passes**

Run:

```bash
bun run test -- scripts/merge-coverage.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add vitest.config.ts scripts/merge-coverage.ts scripts/merge-coverage.test.ts
git commit -m "test(coverage): cover merged threshold reporting"
```

## Task 2: Add coverage input diagnostics to the merge script

**Files:**

- Modify: `scripts/merge-coverage.ts`
- Modify: `scripts/merge-coverage.test.ts`

**Step 1: Write failing tests for input summaries**

Add tests that create temporary raw coverage directories and assert summarized source labels, existence, and file counts:

```ts
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { readCoverageInputSummaries } from "./merge-coverage";

let tempDir: string | undefined;

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

it("summarizes coverage input directories", async () => {
	tempDir = await mkdtemp(join(tmpdir(), "coverage-inputs-"));
	const unitRaw = join(tempDir, "unit", "raw");
	const e2eRaw = join(tempDir, "e2e", "raw");
	await mkdir(unitRaw, { recursive: true });
	await mkdir(e2eRaw, { recursive: true });
	await writeFile(join(unitRaw, "unit.json"), "{}");
	await writeFile(join(e2eRaw, "server.json"), "{}");
	await writeFile(join(e2eRaw, "browser.json"), "{}");

	await expect(
		readCoverageInputSummaries([
			{ label: "unit/browser", path: unitRaw },
			{ label: "e2e", path: e2eRaw },
		]),
	).resolves.toEqual([
		{ label: "unit/browser", path: unitRaw, exists: true, fileCount: 1 },
		{ label: "e2e", path: e2eRaw, exists: true, fileCount: 2 },
	]);
});

it("reports missing coverage input directories", async () => {
	tempDir = await mkdtemp(join(tmpdir(), "coverage-inputs-"));
	const missingRaw = join(tempDir, "missing", "raw");

	await expect(
		readCoverageInputSummaries([{ label: "e2e", path: missingRaw }]),
	).resolves.toEqual([
		{ label: "e2e", path: missingRaw, exists: false, fileCount: 0 },
	]);
});
```

Adjust imports in the existing test file so `describe`, `expect`, `it`, and `afterEach` are imported once.

**Step 2: Run the focused failing test**

Run:

```bash
bun run test -- scripts/merge-coverage.test.ts
```

Expected: FAIL because `readCoverageInputSummaries` does not exist yet.

**Step 3: Implement input summaries**

In `scripts/merge-coverage.ts`, add typed coverage inputs and a recursive file counter:

```ts
import { readdir } from "node:fs/promises";

export type CoverageInput = {
	label: string;
	path: string;
};

export type CoverageInputSummary = CoverageInput & {
	exists: boolean;
	fileCount: number;
};

export const coverageInputs: CoverageInput[] = [
	{ label: "unit/browser", path: "./coverage/unit/raw" },
	{ label: "e2e", path: "./coverage/e2e/raw" },
];

async function countFiles(path: string): Promise<number | undefined> {
	try {
		const entries = await readdir(path, { recursive: true, withFileTypes: true });
		return entries.filter((entry) => entry.isFile()).length;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

export async function readCoverageInputSummaries(
	inputs: CoverageInput[],
): Promise<CoverageInputSummary[]> {
	return Promise.all(
		inputs.map(async (input) => {
			const fileCount = await countFiles(input.path);
			return {
				...input,
				exists: fileCount !== undefined,
				fileCount: fileCount ?? 0,
			};
		}),
	);
}
```

If TypeScript rejects `error.code`, use a local helper type instead of adding a suppression comment:

```ts
function isNodeError(error: unknown): error is Error & { code?: string } {
	return error instanceof Error;
}
```

**Step 4: Print source summaries before merging**

At the start of `mergeCoverage`, print the source summary:

```ts
console.log("Coverage inputs:");
for (const input of await readCoverageInputSummaries(coverageInputs)) {
	const status = input.exists ? `${input.fileCount} raw file(s)` : "missing";
	console.log(`  ${input.label}: ${input.path} (${status})`);
}
console.log("");
```

Then pass `coverageInputs.map((input) => input.path)` into `CoverageReport`.

**Step 5: Verify focused tests pass**

Run:

```bash
bun run test -- scripts/merge-coverage.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add scripts/merge-coverage.ts scripts/merge-coverage.test.ts
git commit -m "feat(coverage): summarize merged coverage inputs"
```

## Task 3: Document coverage threshold ownership and CI signals

**Files:**

- Modify: `docs/testing.md`
- Modify: `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`

**Step 1: Update testing docs**

Add a `Coverage threshold signals` section to `docs/testing.md` after `Coverage expectations for reliability changes`:

```md
## Coverage threshold signals

Coverage has two complementary gates:

- `bun run test:coverage` runs the Vitest Node and browser projects with Monocart instrumentation. Treat failures here as missing unit/browser/helper coverage for source files included by `vitest.config.ts`.
- `bun run test:coverage:merged` merges `coverage/unit/raw` and `coverage/e2e/raw`, then checks the merged e2e-aware thresholds. Treat failures here as a workflow coverage signal: first confirm both raw input directories are present and non-empty, then add the smallest useful regression test at the owning layer.

The merged threshold numbers are intentionally lower than the unit/browser guidance because they combine different raw inputs and include e2e instrumentation limits. Do not lower either gate to fix noise. If the signal is confusing, improve diagnostics or revisit exclusions.

When a coverage failure occurs in CI:

1. Check whether the failed command was `test:coverage` or `test:coverage:merged`.
2. For merged failures, read the `Coverage inputs` lines to confirm unit/browser and e2e raw reports were both merged.
3. Use the uncovered file and `Layer ownership` table above to choose the smallest test layer that proves the missing behavior.
4. Audit exclusions in `vitest.config.ts` only when a source file is permanently untestable at that layer; do not exclude high-risk code just to restore percentages.
```

**Step 2: Link the plan from the backlog**

Under `### P1-9: Improve coverage threshold signal quality`, add:

```md
**Plan:** `docs/plans/2026-04-29-coverage-threshold-signal-quality.md`
```

Do not change the backlog ranking or mark the item complete until implementation and verification are done.

**Step 3: Verify documentation references**

Run:

```bash
rg -n "Coverage threshold signals|2026-04-29-coverage-threshold-signal-quality" docs/testing.md docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
```

Expected: both new references are present.

**Step 4: Commit**

```bash
git add docs/testing.md docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
git commit -m "docs(testing): explain coverage threshold signals"
```

## Task 4: Final verification

**Files:**

- Read: `scripts/merge-coverage.ts`
- Read: `docs/testing.md`
- Read: `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md`

**Step 1: Run focused tests**

Run:

```bash
bun run test -- scripts/merge-coverage.test.ts src/package-scripts.test.ts
```

Expected: PASS.

**Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

**Step 3: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS. If Biome reports formatting issues, run `bun run lint:fix`, review the diff, then rerun `bun run lint`.

**Step 4: Run merged coverage when raw inputs exist**

If local raw coverage is absent, run the full flow:

```bash
bun run test:coverage:full
```

Expected: PASS, and `scripts/merge-coverage.ts` prints `Coverage inputs` lines before the merged threshold table.

If raw inputs already exist and time is constrained, run:

```bash
bun run test:coverage:merged
```

Expected: PASS, with source input summaries and unchanged threshold enforcement.

**Step 5: Inspect git state**

Run:

```bash
git status --short
```

Expected: only intentional files are modified before final commit or PR.

**Step 6: Final commit if needed**

If verification required lint fixes or small corrections, commit them:

```bash
git add scripts/merge-coverage.ts scripts/merge-coverage.test.ts vitest.config.ts docs/testing.md docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
git commit -m "chore(coverage): improve threshold diagnostics"
```

## Completion criteria

- `scripts/merge-coverage.ts` still enforces the same merged thresholds.
- Merged coverage output identifies the raw unit/browser and e2e inputs before reporting thresholds.
- Threshold pass/fail logic and input summaries are covered by fast unit tests.
- `docs/testing.md` explains how to interpret unit/browser versus merged e2e coverage failures.
- The backlog item links to this plan but is not marked complete until implementation is verified.
