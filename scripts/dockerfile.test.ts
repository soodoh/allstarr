import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");
const dockerfile = readFileSync(resolve(projectRoot, "Dockerfile"), "utf8");
const contextInputs = dockerfile
	.split("\n")
	.filter((line) => line.startsWith("COPY ") && !line.includes("--from="))
	.flatMap((line) => line.trim().split(/\s+/).slice(1, -1));

describe("Docker build context", () => {
	it.each(contextInputs)("contains COPY input %s", (input) => {
		expect(existsSync(resolve(projectRoot, input))).toBe(true);
	});

	it("excludes Vitest artifacts from the image context", () => {
		const dockerignore = readFileSync(
			resolve(projectRoot, ".dockerignore"),
			"utf8",
		);
		expect(dockerignore.split("\n")).toContain(".vitest");
	});
});
