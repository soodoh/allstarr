import { afterEach, describe, expect, it } from "vitest";
import { createFakeServerManager } from "./manager";

afterEach(async () => {
	// Each test stops its manager explicitly; this hook is just a guard.
});

describe("createFakeServerManager", () => {
	it("starts only the requested services and exposes only their URLs", async () => {
		const manager = createFakeServerManager(["QBITTORRENT", "NEWZNAB"], {
			scenarioName: "search-grab-torrent",
		});
		try {
			await manager.start();
			const urls = manager.getUrls();

			expect(urls.QBITTORRENT).toMatch(/^http:\/\/localhost:\d+$/);
			expect(urls.NEWZNAB).toMatch(/^http:\/\/localhost:\d+$/);
			expect(urls.HARDCOVER).toBeUndefined();

			const qbitState = await fetch(`${urls.QBITTORRENT}/__state`).then((r) =>
				r.json(),
			);
			expect(qbitState.version).toBe("v4.6.3");

			const newznabState = await fetch(`${urls.NEWZNAB}/__state`).then((r) =>
				r.json(),
			);
			expect(newznabState.serverVersion).toBe("1.1.0-captured");
			expect(newznabState.releases).toHaveLength(2);
		} finally {
			await manager.stop();
		}
	});

	it("resets only the running services back to the selected scenario state", async () => {
		const manager = createFakeServerManager(["QBITTORRENT"], {
			scenarioName: "search-grab-torrent",
		});
		try {
			await manager.start();

			const urls = manager.getUrls();

			await fetch(`${urls.QBITTORRENT}/api/v2/auth/login`, {
				method: "POST",
				body: "username=admin&password=adminadmin",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
			});
			await fetch(`${urls.QBITTORRENT}/api/v2/torrents/add`, {
				method: "POST",
				body: "urls=magnet%3A%3Fxt%3Durn%3Abtih%3Aabc123&category=books",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Cookie: "SID=test-session-id",
				},
			});

			let qbitState = await fetch(`${urls.QBITTORRENT}/__state`).then((r) =>
				r.json(),
			);
			expect(qbitState.addedDownloads).toHaveLength(1);

			await manager.reset();

			qbitState = await fetch(`${urls.QBITTORRENT}/__state`).then((r) =>
				r.json(),
			);
			expect(qbitState.version).toBe("v4.6.3");
			expect(qbitState.addedDownloads).toEqual([]);
		} finally {
			await manager.stop();
		}
	});

	it("reports fake-service readiness failures with service, endpoint, and attempts", async () => {
		const manager = createFakeServerManager(["QBITTORRENT"], {
			ports: { QBITTORRENT: 9 },
			readinessTimeoutMs: 20,
			readinessIntervalMs: 1,
		});

		await expect(manager.start()).rejects.toThrow(
			/Fake service QBITTORRENT at http:\/\/localhost:9\/__state did not become ready/,
		);
	});

	it("keeps reset scoped to running services after diagnostics are added", async () => {
		const manager = createFakeServerManager(["QBITTORRENT"]);
		try {
			await manager.start();
			await expect(manager.reset()).resolves.toBeUndefined();
		} finally {
			await manager.stop();
		}
	});

	it("can swap the running services to a different immutable scenario", async () => {
		const manager = createFakeServerManager(
			["QBITTORRENT", "NEWZNAB", "SABNZBD"],
			{
				scenarioName: "search-grab-torrent",
			},
		);
		try {
			await manager.start();
			const urls = manager.getUrls();

			let newznabState = await fetch(`${urls.NEWZNAB}/__state`).then((r) =>
				r.json(),
			);
			expect(newznabState.releases).toHaveLength(2);

			let sabState = await fetch(`${urls.SABNZBD}/__state`).then((r) => r.json());
			expect(sabState.version).toBe("4.2.0");

			await manager.setScenario("search-grab-usenet");

			newznabState = await fetch(`${urls.NEWZNAB}/__state`).then((r) => r.json());
			expect(newznabState.releases).toHaveLength(1);
			expect(newznabState.releases[0]?.protocol).toBe("usenet");

			sabState = await fetch(`${urls.SABNZBD}/__state`).then((r) => r.json());
			expect(sabState.version).toBe("4.2.1");
			expect(sabState.apiKey).toBe("test-sabnzbd-api-key");

			const qbitState = await fetch(`${urls.QBITTORRENT}/__state`).then((r) =>
				r.json(),
			);
			expect(qbitState.version).toBe("v4.6.3");
			expect(qbitState.torrents).toEqual([]);
		} finally {
			await manager.stop();
		}
	});
});
