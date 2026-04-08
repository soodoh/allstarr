import { afterEach, describe, expect, it } from "vitest";
import { createFakeServerManager } from "./manager";

afterEach(async () => {
	// Each test stops its manager explicitly; this hook is just a guard.
});

describe("createFakeServerManager", () => {
	it("starts only the requested services and exposes only their URLs", async () => {
		const manager = createFakeServerManager(["QBITTORRENT", "NEWZNAB"]);

		await manager.start();
		const urls = manager.getUrls();

		expect(urls.QBITTORRENT).toMatch(/^http:\/\/localhost:\d+$/);
		expect(urls.NEWZNAB).toMatch(/^http:\/\/localhost:\d+$/);
		expect(urls.HARDCOVER).toBeUndefined();

		const qbitState = await fetch(`${urls.QBITTORRENT}/__state`).then((r) =>
			r.json(),
		);
		expect(qbitState.version).toBe("v4.6.0");

		await manager.stop();
	});

	it("resets only the running services", async () => {
		const manager = createFakeServerManager(["QBITTORRENT"]);
		await manager.start();

		const urls = manager.getUrls();
		await fetch(`${urls.QBITTORRENT}/__control`, {
			method: "POST",
			body: JSON.stringify({ version: "v9.9.9" }),
		});

		await manager.reset();

		const qbitState = await fetch(`${urls.QBITTORRENT}/__state`).then((r) =>
			r.json(),
		);
		expect(qbitState.version).toBe("v4.6.0");

		await manager.stop();
	});
});
