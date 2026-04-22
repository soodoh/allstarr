import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const rows: Array<{
		apiKey: string;
		baseUrl: string;
		createdAt: Date;
		id: number;
		kind: string;
		label: string;
		lastSyncError: string | null;
		lastSyncedAt: Date | null;
		lastSyncStatus: string;
		updatedAt: Date;
	}> = [];
	let nextId = 1;

	const requireAdmin = vi.fn();
	const select = vi.fn();
	const insert = vi.fn();
	const update = vi.fn();
	const deleteFn = vi.fn();

	return {
		deleteFn,
		insert,
		nextIdRef: {
			get value() {
				return nextId;
			},
			set value(value: number) {
				nextId = value;
			},
		},
		requireAdmin,
		rows,
		select,
		update,
	};
});

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
	asc: vi.fn((column: unknown) => ({ column, type: "asc" })),
	eq: vi.fn((left: unknown, right: unknown) => ({ left, right, type: "eq" })),
}));

vi.mock("src/db", () => ({
	db: {
		delete: (...args: unknown[]) => mocks.deleteFn(...args),
		insert: (...args: unknown[]) => mocks.insert(...args),
		select: (...args: unknown[]) => mocks.select(...args),
		update: (...args: unknown[]) => mocks.update(...args),
	},
}));

vi.mock("src/db/schema", () => ({
	importSources: {
		id: "importSources.id",
		label: "importSources.label",
	},
}));

vi.mock("src/lib/validators", () => ({
	createImportSourceSchema: { parse: (data: unknown) => data },
	deleteImportSourceSchema: { parse: (data: unknown) => data },
	updateImportSourceSchema: { parse: (data: unknown) => data },
}));

vi.mock("./middleware", () => ({
	requireAdmin: mocks.requireAdmin,
}));

import {
	createImportSourceFn,
	deleteImportSourceFn,
	getImportSourcesFn,
	updateImportSourceFn,
} from "./import-sources";

function resetTable() {
	mocks.rows.splice(0, mocks.rows.length);
	mocks.nextIdRef.value = 1;
}

function installDbMocks() {
	mocks.select.mockImplementation(() => ({
		from: vi.fn(() => ({
			orderBy: vi.fn(() => ({
				all: vi.fn(() =>
					[...mocks.rows].sort((left, right) =>
						left.label.localeCompare(right.label),
					),
				),
			})),
		})),
	}));

	mocks.insert.mockImplementation(() => ({
		values: vi.fn(
			(data: {
				apiKey: string;
				baseUrl: string;
				createdAt: Date;
				kind: string;
				label: string;
				lastSyncStatus: string;
				updatedAt: Date;
			}) => ({
				returning: vi.fn(() => ({
					get: vi.fn(() => {
						const row = {
							...data,
							id: mocks.nextIdRef.value,
							lastSyncError: null,
							lastSyncedAt: null,
						};
						mocks.nextIdRef.value += 1;
						mocks.rows.push(row);
						return row;
					}),
				})),
			}),
		),
	}));

	mocks.update.mockImplementation(() => ({
		set: vi.fn(
			(data: {
				apiKey: string;
				baseUrl: string;
				kind: string;
				label: string;
				updatedAt: Date;
			}) => ({
				where: vi.fn((condition: { right: number }) => ({
					returning: vi.fn(() => ({
						get: vi.fn(() => {
							const index = mocks.rows.findIndex(
								(row) => row.id === condition.right,
							);
							const existing = mocks.rows[index];
							const updated = {
								...existing,
								...data,
							};
							mocks.rows[index] = updated;
							return updated;
						}),
					})),
				})),
			}),
		),
	}));

	mocks.deleteFn.mockImplementation(() => ({
		where: vi.fn((condition: { right: number }) => ({
			run: vi.fn(() => {
				const index = mocks.rows.findIndex((row) => row.id === condition.right);
				if (index >= 0) {
					mocks.rows.splice(index, 1);
				}
			}),
		})),
	}));
}

describe("import source CRUD", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetTable();
		installDbMocks();
		mocks.requireAdmin.mockResolvedValue({ user: { id: 1, role: "admin" } });
	});

	it("creates, lists, updates, and deletes a source", async () => {
		const created = await createImportSourceFn({
			data: {
				kind: "radarr",
				label: "Radarr 4K",
				baseUrl: "http://localhost:7878",
				apiKey: "secret",
			},
		});

		expect(created.lastSyncStatus).toBe("idle");
		expect(created).not.toHaveProperty("apiKey");
		expect(created.hasApiKey).toBe(true);

		const listed = await getImportSourcesFn();
		expect(listed).toHaveLength(1);
		expect(listed[0]).not.toHaveProperty("apiKey");
		expect(listed[0]?.hasApiKey).toBe(true);

		const updated = await updateImportSourceFn({
			data: {
				id: created.id,
				kind: "radarr",
				label: "Radarr UHD",
				baseUrl: "http://localhost:7878",
				apiKey: "secret-2",
			},
		});

		expect(updated.label).toBe("Radarr UHD");
		expect(updated).not.toHaveProperty("apiKey");
		expect(updated.hasApiKey).toBe(true);

		await deleteImportSourceFn({ data: { id: created.id } });
		await expect(getImportSourcesFn()).resolves.toEqual([]);
		expect(mocks.requireAdmin).toHaveBeenCalledTimes(5);
	});
});
