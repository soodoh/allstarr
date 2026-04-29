import { describe, expect, it, vi } from "vitest";
import {
	createDiagnosticBuffer,
	formatDiagnosticLine,
	redactDiagnosticValue,
	timeDiagnosticOperation,
} from "./diagnostics";

describe("e2e diagnostics", () => {
	it("formats structured diagnostic lines with elapsed time", () => {
		expect(
			formatDiagnosticLine({
				scope: "fake-service",
				event: "ready",
				status: "ok",
				elapsedMs: 123,
				fields: { service: "QBITTORRENT", endpoint: "/__state" },
			}),
		).toBe(
			"[e2e] scope=fake-service event=ready status=ok elapsedMs=123 service=QBITTORRENT endpoint=/__state",
		);
	});

	it("redacts secret-like field values", () => {
		expect(redactDiagnosticValue("apiKey", "super-secret")).toBe("[redacted]");
		expect(redactDiagnosticValue("url", "http://127.0.0.1:3000/login")).toBe(
			"http://127.0.0.1:3000/login",
		);
	});

	it("keeps a bounded in-memory event buffer", () => {
		const buffer = createDiagnosticBuffer(2);
		buffer.record({ scope: "test", event: "one", status: "ok" });
		buffer.record({ scope: "test", event: "two", status: "ok" });
		buffer.record({ scope: "test", event: "three", status: "ok" });

		expect(buffer.toJSON()).toHaveLength(2);
		expect(buffer.toJSON().map((entry) => entry.event)).toEqual([
			"two",
			"three",
		]);
	});

	it("times successful and failed operations", async () => {
		vi.useFakeTimers();
		const logs: string[] = [];

		const success = timeDiagnosticOperation(
			{
				scope: "setup",
				event: "db-push",
				fields: { command: "bun run db:push" },
			},
			async () => {
				vi.advanceTimersByTime(25);
				return "done";
			},
			{ log: (line) => logs.push(line), now: () => Date.now() },
		);

		await expect(success).resolves.toBe("done");
		expect(logs.at(-1)).toContain("status=ok");
		expect(logs.at(-1)).toContain("event=db-push");

		const failure = timeDiagnosticOperation(
			{ scope: "setup", event: "db-push" },
			async () => {
				vi.advanceTimersByTime(10);
				throw new Error("boom");
			},
			{ log: (line) => logs.push(line), now: () => Date.now() },
		);

		await expect(failure).rejects.toThrow("boom");
		expect(logs.at(-1)).toContain("status=error");
		expect(logs.at(-1)).toContain("error=boom");
		vi.useRealTimers();
	});
});
