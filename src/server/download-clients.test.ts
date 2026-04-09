import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireAdmin: vi.fn(),
	select: vi.fn(),
	insert: vi.fn(),
	update: vi.fn(),
	deleteFn: vi.fn(),
	getProvider: vi.fn(),
	testConnection: vi.fn(),
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
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("src/db", () => ({
	db: {
		select: (...args: unknown[]) => mocks.select(...args),
		insert: (...args: unknown[]) => mocks.insert(...args),
		update: (...args: unknown[]) => mocks.update(...args),
		delete: (...args: unknown[]) => mocks.deleteFn(...args),
	},
}));

vi.mock("src/db/schema", () => ({
	downloadClients: { id: "downloadClients.id" },
}));

vi.mock("src/lib/validators", () => ({
	createDownloadClientSchema: { parse: (d: unknown) => d },
	updateDownloadClientSchema: { parse: (d: unknown) => d },
	testDownloadClientSchema: { parse: (d: unknown) => d },
}));

vi.mock("./middleware", () => ({
	requireAdmin: () => mocks.requireAdmin(),
}));

vi.mock("./download-clients/registry", () => ({
	default: mocks.getProvider,
}));

import {
	createDownloadClientFn,
	deleteDownloadClientFn,
	getDownloadClientsFn,
	testDownloadClientFn,
	updateDownloadClientFn,
} from "./download-clients";

function createSelectChain(result: { all?: unknown }) {
	const chain = {
		from: vi.fn(() => chain),
		all: vi.fn(() => result.all),
	};
	return chain;
}

function createInsertChain(result?: { get?: unknown }) {
	const chain = {
		values: vi.fn(() => chain),
		returning: vi.fn(() => chain),
		get: vi.fn(() => result?.get),
	};
	return chain;
}

function createUpdateChain(result?: { get?: unknown }) {
	const chain = {
		set: vi.fn(() => chain),
		where: vi.fn(() => chain),
		returning: vi.fn(() => chain),
		get: vi.fn(() => result?.get),
	};
	return chain;
}

function createDeleteChain() {
	const chain = {
		where: vi.fn(() => chain),
		run: vi.fn(),
	};
	return chain;
}

describe("download-clients", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireAdmin.mockResolvedValue(undefined);
	});

	describe("getDownloadClientsFn", () => {
		it("requires admin and returns list", async () => {
			const clients = [
				{ id: 1, name: "qBit", implementation: "qBittorrent" },
				{ id: 2, name: "SAB", implementation: "SABnzbd" },
			];
			const chain = createSelectChain({ all: clients });
			mocks.select.mockReturnValueOnce(chain);

			const result = await getDownloadClientsFn();

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(result).toEqual(clients);
		});

		it("throws when not admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("Unauthorized"));

			await expect(getDownloadClientsFn()).rejects.toThrow("Unauthorized");
		});
	});

	describe("createDownloadClientFn", () => {
		it("requires admin and sets createdAt/updatedAt timestamps", async () => {
			const input = {
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
			};
			const created = { id: 1, ...input, createdAt: 1000, updatedAt: 1000 };
			const chain = createInsertChain({ get: created });
			mocks.insert.mockReturnValueOnce(chain);

			const now = Date.now();
			const result = await createDownloadClientFn({ data: input });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(result).toEqual(created);

			const insertedValues = chain.values.mock.calls[0][0];
			expect(insertedValues.createdAt).toBeGreaterThanOrEqual(now);
			expect(insertedValues.updatedAt).toBeGreaterThanOrEqual(now);
			expect(insertedValues.createdAt).toBe(insertedValues.updatedAt);
			expect(insertedValues.name).toBe("qBit");
			expect(insertedValues.settings).toBeNull();
		});
	});

	describe("updateDownloadClientFn", () => {
		it("requires admin and sets updatedAt timestamp", async () => {
			const input = {
				id: 1,
				name: "qBit Updated",
				implementation: "qBittorrent",
				protocol: "torrent",
				enabled: true,
				priority: 1,
				host: "localhost",
				port: 9090,
				useSsl: true,
				urlBase: null,
				username: "admin",
				password: "pass",
				apiKey: null,
				category: "allstarr",
				tag: null,
				removeCompletedDownloads: true,
				settings: null,
			};
			const updated = { ...input, updatedAt: 2000 };
			const chain = createUpdateChain({ get: updated });
			mocks.update.mockReturnValueOnce(chain);

			const now = Date.now();
			const result = await updateDownloadClientFn({ data: input });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(result).toEqual(updated);

			const setValues = chain.set.mock.calls[0][0];
			expect(setValues.updatedAt).toBeGreaterThanOrEqual(now);
			expect(setValues.name).toBe("qBit Updated");
			expect(setValues.port).toBe(9090);
			// id should not be in the set values — it's used in the where clause
			expect(setValues).not.toHaveProperty("id");
		});

		it("applies where clause with correct id", async () => {
			const input = {
				id: 42,
				name: "Test",
				implementation: "Transmission",
				protocol: "torrent",
				enabled: true,
				priority: 1,
				host: "localhost",
				port: 9091,
				useSsl: false,
				urlBase: null,
				username: null,
				password: null,
				apiKey: null,
				category: "allstarr",
				tag: null,
				removeCompletedDownloads: true,
				settings: null,
			};
			const chain = createUpdateChain({ get: { ...input, updatedAt: 3000 } });
			mocks.update.mockReturnValueOnce(chain);

			await updateDownloadClientFn({ data: input });

			expect(chain.where).toHaveBeenCalledWith({
				left: "downloadClients.id",
				right: 42,
			});
		});
	});

	describe("deleteDownloadClientFn", () => {
		it("requires admin and deletes by id", async () => {
			const chain = createDeleteChain();
			mocks.deleteFn.mockReturnValueOnce(chain);

			const result = await deleteDownloadClientFn({ data: { id: 5 } });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(chain.where).toHaveBeenCalledWith({
				left: "downloadClients.id",
				right: 5,
			});
			expect(chain.run).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true });
		});
	});

	describe("testDownloadClientFn", () => {
		it("requires admin and calls provider.testConnection with ConnectionConfig", async () => {
			const testResult = {
				success: true,
				message: "Connected",
				version: "4.5.0",
			};
			mocks.testConnection.mockResolvedValueOnce(testResult);
			mocks.getProvider.mockResolvedValueOnce({
				testConnection: mocks.testConnection,
			});

			const input = {
				implementation: "qBittorrent" as const,
				host: "192.168.1.10",
				port: 8080,
				useSsl: false,
				urlBase: null,
				username: "admin",
				password: "secret",
				apiKey: null,
			};

			const result = await testDownloadClientFn({ data: input });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.getProvider).toHaveBeenCalledWith("qBittorrent");
			expect(mocks.testConnection).toHaveBeenCalledWith({
				implementation: "qBittorrent",
				host: "192.168.1.10",
				port: 8080,
				useSsl: false,
				urlBase: null,
				username: "admin",
				password: "secret",
				apiKey: null,
				category: null,
				tag: null,
				settings: null,
			});
			expect(result).toEqual(testResult);
		});

		it("passes null fields for category, tag, and settings", async () => {
			const testResult = {
				success: false,
				message: "Connection refused",
				version: null,
			};
			mocks.testConnection.mockResolvedValueOnce(testResult);
			mocks.getProvider.mockResolvedValueOnce({
				testConnection: mocks.testConnection,
			});

			const input = {
				implementation: "SABnzbd" as const,
				host: "localhost",
				port: 8080,
				useSsl: true,
				urlBase: "/sabnzbd",
				username: null,
				password: null,
				apiKey: "abc123",
			};

			const result = await testDownloadClientFn({ data: input });

			expect(mocks.testConnection).toHaveBeenCalledWith(
				expect.objectContaining({
					category: null,
					tag: null,
					settings: null,
				}),
			);
			expect(result).toEqual(testResult);
		});
	});
});
