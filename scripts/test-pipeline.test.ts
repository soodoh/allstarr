import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const scripts = JSON.parse(
	readFileSync(resolve(root, "package.json"), "utf8"),
).scripts;

describe("E2E test pipeline", () => {
	it("builds a fresh app before launching Playwright", () => {
		const steps = scripts["test:e2e"].split(" && ");
		expect(steps).toContain("bun run build");
		expect(steps.indexOf("bun run build")).toBeLessThan(
			steps.findIndex((step: string) =>
				step.startsWith("bunx playwright test"),
			),
		);
	});

	it("identifies the repository for dispatched PR title checks without a checkout", () => {
		const workflow = readFileSync(
			resolve(root, ".github/workflows/pr-title.yml"),
			"utf8",
		);
		expect(workflow).toContain(
			'gh pr view "$PR_NUMBER" --repo "$GITHUB_REPOSITORY"',
		);
	});

	it("uses the self-contained E2E command in CI", () => {
		const workflow = readFileSync(
			resolve(root, ".github/workflows/ci.yml"),
			"utf8",
		);
		expect(workflow).toContain("run: bun run test:e2e");
	});
});
