import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	requireAdmin: vi.fn(),
	getProvider: vi.fn(),
	selectAll: vi.fn(),
	selectGet: vi.fn(),
	deleteRun: vi.fn(),
	insertRun: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
		inputValidator: (validator: (input: unknown) => unknown) => ({
			handler:
				(handler: (input: { data: unknown }) => unknown) =>
				(input: { data: unknown }) =>
					handler({ data: validator(input.data) }),
		}),
	}),
	createServerOnlyFn: (fn: unknown) => fn,
}));
vi.mock("@tanstack/react-start/server", () => ({
	getRequest: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
}));

vi.mock("../download-clients/registry", () => ({
	default: mocks.getProvider,
}));
vi.mock("../middleware", () => ({
	requireAdmin: mocks.requireAdmin,
	requireAuth: mocks.requireAuth,
}));

/*
 * The db mock needs two distinct select chains:
 * 1. select().from(downloadClients).where().all()  — used by fetchQueueItems to get enabled clients
 * 2. select().from(table).where().get()             — used by resolveTrackedMeta, fetchClientItems,
 *    and the server fn handlers to look up individual rows
 */
vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					all: mocks.selectAll,
					get: mocks.selectGet,
				})),
				all: mocks.selectAll,
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				run: mocks.insertRun,
			})),
		})),
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				run: mocks.deleteRun,
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	downloadClients: {
		id: "dc.id",
		enabled: "dc.enabled",
		implementation: "dc.implementation",
	},
	trackedDownloads: {
		downloadClientId: "td.downloadClientId",
		downloadId: "td.downloadId",
	},
	books: { id: "books.id", title: "books.title" },
	authors: { id: "authors.id", name: "authors.name" },
	blocklist: { id: "blocklist.id" },
}));

beforeEach(() => {
	vi.clearAllMocks();
});

/* ---------- helpers ---------- */

function makeClient(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: "qBit",
		implementation: "qBittorrent",
		protocol: "torrent",
		enabled: true,
		priority: 1,
		host: "localhost",
		port: 8080,
		useSsl: false,
		urlBase: null,
		username: null,
		password: null,
		apiKey: null,
		category: "allstarr",
		tag: null,
		removeCompletedDownloads: true,
		settings: null,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		...overrides,
	};
}

function makeDownloadItem(overrides: Record<string, unknown> = {}) {
	return {
		id: "dl-1",
		name: "Test.Download",
		status: "downloading" as const,
		size: 1000,
		downloaded: 500,
		uploadSpeed: 0,
		downloadSpeed: 100,
		category: "allstarr",
		outputPath: "/downloads/test",
		isCompleted: false,
		...overrides,
	};
}

/* ---------- fetchQueueItems ---------- */

describe("fetchQueueItems", () => {
	it("returns empty items and warnings when no enabled clients exist", async () => {
		mocks.selectAll.mockReturnValueOnce([]);

		const { fetchQueueItems } = await import("../queue");
		const result = await fetchQueueItems();

		expect(result).toEqual({ items: [], warnings: [] });
	});

	it("computes progress and estimatedTimeLeft correctly", async () => {
		const client = makeClient();
		const dl = makeDownloadItem({
			size: 2000,
			downloaded: 1000,
			downloadSpeed: 200,
		});

		mocks.selectAll.mockReturnValueOnce([client]);
		mocks.getProvider.mockResolvedValueOnce({
			getDownloads: vi.fn().mockResolvedValue([dl]),
		});
		// tracked download lookup returns undefined (untracked)
		mocks.selectGet.mockReturnValue(undefined);

		const { fetchQueueItems } = await import("../queue");
		const result = await fetchQueueItems();

		expect(result.items).toHaveLength(1);
		expect(result.items[0].progress).toBe(50); // 1000/2000 * 100
		expect(result.items[0].estimatedTimeLeft).toBe(5); // (2000-1000)/200
		expect(result.warnings).toEqual([]);
	});

	it("returns progress 0 when size is 0", async () => {
		const client = makeClient();
		const dl = makeDownloadItem({ size: 0, downloaded: 0, downloadSpeed: 100 });

		mocks.selectAll.mockReturnValueOnce([client]);
		mocks.getProvider.mockResolvedValueOnce({
			getDownloads: vi.fn().mockResolvedValue([dl]),
		});
		mocks.selectGet.mockReturnValue(undefined);

		const { fetchQueueItems } = await import("../queue");
		const result = await fetchQueueItems();

		expect(result.items[0].progress).toBe(0);
	});

	it("returns null estimatedTimeLeft when downloadSpeed is 0", async () => {
		const client = makeClient();
		const dl = makeDownloadItem({ downloadSpeed: 0 });

		mocks.selectAll.mockReturnValueOnce([client]);
		mocks.getProvider.mockResolvedValueOnce({
			getDownloads: vi.fn().mockResolvedValue([dl]),
		});
		mocks.selectGet.mockReturnValue(undefined);

		const { fetchQueueItems } = await import("../queue");
		const result = await fetchQueueItems();

		expect(result.items[0].estimatedTimeLeft).toBeNull();
	});

	it("resolves book title and author name from tracked metadata", async () => {
		const client = makeClient();
		const dl = makeDownloadItem();
		const tracked = {
			id: 1,
			downloadClientId: 1,
			downloadId: "dl-1",
			bookId: 42,
			authorId: 7,
			showId: null,
			episodeId: null,
			movieId: null,
			state: "importing",
		};

		mocks.selectAll.mockReturnValueOnce([client]);
		mocks.getProvider.mockResolvedValueOnce({
			getDownloads: vi.fn().mockResolvedValue([dl]),
		});
		// First get: trackedDownloads lookup
		mocks.selectGet.mockReturnValueOnce(tracked);
		// Second get: books lookup
		mocks.selectGet.mockReturnValueOnce({ title: "The Great Novel" });
		// Third get: authors lookup
		mocks.selectGet.mockReturnValueOnce({ name: "Jane Author" });

		const { fetchQueueItems } = await import("../queue");
		const result = await fetchQueueItems();

		expect(result.items[0].bookTitle).toBe("The Great Novel");
		expect(result.items[0].authorName).toBe("Jane Author");
		expect(result.items[0].bookId).toBe(42);
		expect(result.items[0].trackedState).toBe("importing");
	});

	it("captures warnings from failed clients", async () => {
		const client1 = makeClient({ id: 1, name: "Good Client" });
		const client2 = makeClient({ id: 2, name: "Bad Client" });

		mocks.selectAll.mockReturnValueOnce([client1, client2]);

		// First client succeeds with no downloads
		mocks.getProvider.mockResolvedValueOnce({
			getDownloads: vi.fn().mockResolvedValue([]),
		});
		// Second client throws
		mocks.getProvider.mockResolvedValueOnce({
			getDownloads: vi.fn().mockRejectedValue(new Error("Connection refused")),
		});

		const { fetchQueueItems } = await import("../queue");
		const result = await fetchQueueItems();

		expect(result.items).toEqual([]);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toBe(
			"Failed to connect to Bad Client: Connection refused",
		);
	});

	it("handles non-Error thrown values in warning message", async () => {
		const client = makeClient({ name: "Broken Client" });

		mocks.selectAll.mockReturnValueOnce([client]);
		mocks.getProvider.mockResolvedValueOnce({
			getDownloads: vi.fn().mockRejectedValue("string error"),
		});

		const { fetchQueueItems } = await import("../queue");
		const result = await fetchQueueItems();

		expect(result.warnings[0]).toBe(
			"Failed to connect to Broken Client: Unknown error",
		);
	});

	it("attaches downloadClientId, downloadClientName, and protocol from client", async () => {
		const client = makeClient({ id: 5, name: "My qBit", protocol: "torrent" });
		const dl = makeDownloadItem();

		mocks.selectAll.mockReturnValueOnce([client]);
		mocks.getProvider.mockResolvedValueOnce({
			getDownloads: vi.fn().mockResolvedValue([dl]),
		});
		mocks.selectGet.mockReturnValue(undefined);

		const { fetchQueueItems } = await import("../queue");
		const result = await fetchQueueItems();

		expect(result.items[0].downloadClientId).toBe(5);
		expect(result.items[0].downloadClientName).toBe("My qBit");
		expect(result.items[0].protocol).toBe("torrent");
	});
});

/* ---------- getQueueFn ---------- */

describe("getQueueFn", () => {
	it("calls requireAuth before fetching", async () => {
		mocks.selectAll.mockReturnValueOnce([]);

		const { getQueueFn } = await import("../queue");
		await getQueueFn();

		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
	});
});

/* ---------- removeFromQueueFn ---------- */

describe("removeFromQueueFn", () => {
	it("throws when download client is not found", async () => {
		mocks.selectGet.mockReturnValueOnce(undefined);

		const { removeFromQueueFn } = await import("../queue");

		await expect(
			removeFromQueueFn({
				data: {
					downloadClientId: 999,
					downloadItemId: "dl-1",
				},
			}),
		).rejects.toThrow("Download client not found");

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
	});

	it("removes from client when removeFromClient is true", async () => {
		const client = makeClient();
		const removeDownload = vi.fn().mockResolvedValue(undefined);

		mocks.selectGet.mockReturnValueOnce(client);
		mocks.getProvider.mockResolvedValueOnce({ removeDownload });

		const { removeFromQueueFn } = await import("../queue");
		const result = await removeFromQueueFn({
			data: {
				downloadClientId: 1,
				downloadItemId: "dl-1",
				removeFromClient: true,
				addToBlocklist: false,
			},
		});

		expect(removeDownload).toHaveBeenCalledWith(
			expect.objectContaining({ host: "localhost", port: 8080 }),
			"dl-1",
			true,
		);
		expect(result).toEqual({ success: true });
	});

	it("does not call provider when removeFromClient is false", async () => {
		const client = makeClient();

		mocks.selectGet.mockReturnValueOnce(client);

		const { removeFromQueueFn } = await import("../queue");
		await removeFromQueueFn({
			data: {
				downloadClientId: 1,
				downloadItemId: "dl-1",
				removeFromClient: false,
				addToBlocklist: false,
			},
		});

		expect(mocks.getProvider).not.toHaveBeenCalled();
	});

	it("inserts into blocklist when addToBlocklist is true and sourceTitle is provided", async () => {
		const client = makeClient();

		mocks.selectGet.mockReturnValueOnce(client);

		const { removeFromQueueFn } = await import("../queue");
		await removeFromQueueFn({
			data: {
				downloadClientId: 1,
				downloadItemId: "dl-1",
				removeFromClient: false,
				addToBlocklist: true,
				sourceTitle: "Bad.Release",
				protocol: "torrent",
			},
		});

		expect(mocks.insertRun).toHaveBeenCalledTimes(1);
	});

	it("does not insert into blocklist when sourceTitle is missing", async () => {
		const client = makeClient();

		mocks.selectGet.mockReturnValueOnce(client);

		const { removeFromQueueFn } = await import("../queue");
		await removeFromQueueFn({
			data: {
				downloadClientId: 1,
				downloadItemId: "dl-1",
				removeFromClient: false,
				addToBlocklist: true,
				// sourceTitle omitted
			},
		});

		expect(mocks.insertRun).not.toHaveBeenCalled();
	});
});

/* ---------- pauseDownloadFn ---------- */

describe("pauseDownloadFn", () => {
	it("throws when download client is not found", async () => {
		mocks.selectGet.mockReturnValueOnce(undefined);

		const { pauseDownloadFn } = await import("../queue");

		await expect(
			pauseDownloadFn({
				data: { downloadClientId: 999, downloadItemId: "dl-1" },
			}),
		).rejects.toThrow("Download client not found");
	});

	it("throws when provider does not support pausing", async () => {
		const client = makeClient();

		mocks.selectGet.mockReturnValueOnce(client);
		mocks.getProvider.mockResolvedValueOnce({
			getDownloads: vi.fn(),
			// pauseDownload intentionally omitted
		});

		const { pauseDownloadFn } = await import("../queue");

		await expect(
			pauseDownloadFn({
				data: { downloadClientId: 1, downloadItemId: "dl-1" },
			}),
		).rejects.toThrow("Client does not support pausing");
	});

	it("delegates to provider.pauseDownload", async () => {
		const client = makeClient();
		const pauseDownload = vi.fn().mockResolvedValue(undefined);

		mocks.selectGet.mockReturnValueOnce(client);
		mocks.getProvider.mockResolvedValueOnce({ pauseDownload });

		const { pauseDownloadFn } = await import("../queue");
		const result = await pauseDownloadFn({
			data: { downloadClientId: 1, downloadItemId: "dl-1" },
		});

		expect(pauseDownload).toHaveBeenCalledWith(
			expect.objectContaining({ host: "localhost", port: 8080 }),
			"dl-1",
		);
		expect(result).toEqual({ success: true });
	});
});

/* ---------- resumeDownloadFn ---------- */

describe("resumeDownloadFn", () => {
	it("throws when download client is not found", async () => {
		mocks.selectGet.mockReturnValueOnce(undefined);

		const { resumeDownloadFn } = await import("../queue");

		await expect(
			resumeDownloadFn({
				data: { downloadClientId: 999, downloadItemId: "dl-1" },
			}),
		).rejects.toThrow("Download client not found");
	});

	it("throws when provider does not support resuming", async () => {
		const client = makeClient();

		mocks.selectGet.mockReturnValueOnce(client);
		mocks.getProvider.mockResolvedValueOnce({
			getDownloads: vi.fn(),
			// resumeDownload intentionally omitted
		});

		const { resumeDownloadFn } = await import("../queue");

		await expect(
			resumeDownloadFn({
				data: { downloadClientId: 1, downloadItemId: "dl-1" },
			}),
		).rejects.toThrow("Client does not support resuming");
	});

	it("delegates to provider.resumeDownload", async () => {
		const client = makeClient();
		const resumeDownload = vi.fn().mockResolvedValue(undefined);

		mocks.selectGet.mockReturnValueOnce(client);
		mocks.getProvider.mockResolvedValueOnce({ resumeDownload });

		const { resumeDownloadFn } = await import("../queue");
		const result = await resumeDownloadFn({
			data: { downloadClientId: 1, downloadItemId: "dl-1" },
		});

		expect(resumeDownload).toHaveBeenCalledWith(
			expect.objectContaining({ host: "localhost", port: 8080 }),
			"dl-1",
		);
		expect(result).toEqual({ success: true });
	});
});

/* ---------- setDownloadPriorityFn ---------- */

describe("setDownloadPriorityFn", () => {
	it("throws when download client is not found", async () => {
		mocks.selectGet.mockReturnValueOnce(undefined);

		const { setDownloadPriorityFn } = await import("../queue");

		await expect(
			setDownloadPriorityFn({
				data: { downloadClientId: 999, downloadItemId: "dl-1", priority: 1 },
			}),
		).rejects.toThrow("Download client not found");
	});

	it("throws when provider does not support priority changes", async () => {
		const client = makeClient();

		mocks.selectGet.mockReturnValueOnce(client);
		mocks.getProvider.mockResolvedValueOnce({
			getDownloads: vi.fn(),
			// setPriority intentionally omitted
		});

		const { setDownloadPriorityFn } = await import("../queue");

		await expect(
			setDownloadPriorityFn({
				data: { downloadClientId: 1, downloadItemId: "dl-1", priority: 5 },
			}),
		).rejects.toThrow("Client does not support priority changes");
	});

	it("delegates to provider.setPriority with correct args", async () => {
		const client = makeClient();
		const setPriority = vi.fn().mockResolvedValue(undefined);

		mocks.selectGet.mockReturnValueOnce(client);
		mocks.getProvider.mockResolvedValueOnce({ setPriority });

		const { setDownloadPriorityFn } = await import("../queue");
		const result = await setDownloadPriorityFn({
			data: { downloadClientId: 1, downloadItemId: "dl-1", priority: 3 },
		});

		expect(setPriority).toHaveBeenCalledWith(
			expect.objectContaining({ host: "localhost", port: 8080 }),
			"dl-1",
			3,
		);
		expect(result).toEqual({ success: true });
	});
});
