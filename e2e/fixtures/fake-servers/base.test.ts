import { describe, expect, it } from "vitest";
import { createFakeServer } from "./base";

function fakeServer(port: number) {
	return createFakeServer({
		port,
		defaultState: () => ({ enabled: true }),
		handler: () => null,
	});
}

describe("fake server lifecycle", () => {
	it("exposes its actual ephemeral port after it is ready", async () => {
		const server = fakeServer(0);
		try {
			await server.ready;
			expect(server.url).not.toBe("http://localhost:0");
			const response = await fetch(`${server.url}/__state`);
			await expect(response.json()).resolves.toEqual({ enabled: true });
		} finally {
			await server.stop();
		}
	});

	it("rejects readiness on port collisions rather than emitting an unhandled error", async () => {
		const first = fakeServer(0);
		await first.ready;
		const port = Number(new URL(first.url).port);
		const second = fakeServer(port);
		try {
			await expect(second.ready).rejects.toThrow(/EADDRINUSE/);
		} finally {
			await second.stop();
			await first.stop();
		}
	});
});
