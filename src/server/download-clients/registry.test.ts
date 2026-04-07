import { afterEach, describe, expect, it, vi } from "vitest";
import type { DownloadClientProvider } from "./types";

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
	vi.doUnmock("src/lib/runtime");
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
});
