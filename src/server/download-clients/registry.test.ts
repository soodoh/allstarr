import { afterEach, describe, expect, it, vi } from "vitest";
import type { DownloadClientProvider } from "./types";

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
	vi.doUnmock("src/lib/runtime");
	vi.doUnmock("./qbittorrent");
	vi.doUnmock("./transmission");
	vi.doUnmock("./deluge");
	vi.doUnmock("./rtorrent");
	vi.doUnmock("./sabnzbd");
	vi.doUnmock("./nzbget");
	vi.doUnmock("./blackhole");
});

describe("getProvider", () => {
	it("throws when loaded in a browser runtime", async () => {
		vi.doMock("src/lib/runtime", () => ({
			isServerRuntime: false,
		}));

		const { default: getProvider } = await import("./registry");

		await expect(getProvider("Blackhole")).rejects.toThrow(
			"Download client providers are only available on the server",
		);
	});

	it("resolves providers when loaded on the server", async () => {
		const provider = {
			addDownload: vi.fn(),
			getDownloads: vi.fn(),
			removeDownload: vi.fn(),
			testConnection: vi.fn(),
		} satisfies DownloadClientProvider;

		vi.doMock("src/lib/runtime", () => ({
			isServerRuntime: true,
		}));
		vi.doMock("./blackhole", () => ({
			default: provider,
		}));

		const { default: getProvider } = await import("./registry");

		await expect(getProvider("Blackhole")).resolves.toBe(provider);
	});

	it.each([
		["qBittorrent", "./qbittorrent"],
		["Transmission", "./transmission"],
		["Deluge", "./deluge"],
		["rTorrent", "./rtorrent"],
		["SABnzbd", "./sabnzbd"],
		["NZBGet", "./nzbget"],
		["Blackhole", "./blackhole"],
	] as const)("loads %s on the server", async (implementation, modulePath) => {
		const provider = {
			addDownload: vi.fn(),
			getDownloads: vi.fn(),
			removeDownload: vi.fn(),
			testConnection: vi.fn(),
		};

		vi.doMock("src/lib/runtime", () => ({ isServerRuntime: true }));
		vi.doMock(modulePath, () => ({ default: provider }));

		const { default: getProvider } = await import("./registry");

		await expect(getProvider(implementation)).resolves.toBe(provider);
	});

	it("throws for an unknown implementation", async () => {
		vi.doMock("src/lib/runtime", () => ({ isServerRuntime: true }));
		const { default: getProvider } = await import("./registry");
		await expect(getProvider("NopeClient")).rejects.toThrow(
			"Unknown download client implementation: NopeClient",
		);
	});
});
