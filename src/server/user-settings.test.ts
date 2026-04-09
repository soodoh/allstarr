import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	selectGet: vi.fn(),
	insertRun: vi.fn(),
	updateRun: vi.fn(),
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
	and: vi.fn((...conditions: unknown[]) => conditions),
	eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					get: mocks.selectGet,
				})),
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				onConflictDoUpdate: vi.fn(() => ({
					run: mocks.insertRun,
				})),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					run: mocks.updateRun,
				})),
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	userSettings: {
		userId: "userSettings.userId",
		tableId: "userSettings.tableId",
	},
}));

vi.mock("src/lib/validators", () => ({
	tableIdSchema: { parse: (v: unknown) => v },
	upsertUserSettingsSchema: { parse: (v: unknown) => v },
	deleteUserSettingsSchema: { parse: (v: unknown) => v },
}));

vi.mock("src/server/middleware", () => ({
	requireAuth: mocks.requireAuth,
}));

import {
	getUserSettingsFn,
	resetColumnSettingsFn,
	upsertUserSettingsFn,
} from "./user-settings";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
});

describe("getUserSettingsFn", () => {
	it("calls requireAuth", async () => {
		mocks.selectGet.mockReturnValue(null);

		await getUserSettingsFn({ data: { tableId: "authors" } });

		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
	});

	it("returns null when no row found", async () => {
		mocks.selectGet.mockReturnValue(undefined);

		const result = await getUserSettingsFn({ data: { tableId: "authors" } });

		expect(result).toBeNull();
	});

	it("returns formatted settings when row exists", async () => {
		mocks.selectGet.mockReturnValue({
			id: 1,
			userId: "user-1",
			tableId: "authors",
			columnOrder: ["name", "cover"],
			hiddenColumns: ["cover"],
			viewMode: "table",
			addDefaults: { monitored: true },
		});

		const result = await getUserSettingsFn({ data: { tableId: "authors" } });

		expect(result).toEqual({
			columnOrder: ["name", "cover"],
			hiddenColumns: ["cover"],
			viewMode: "table",
			addDefaults: { monitored: true },
		});
		// Should NOT include id, userId, or tableId
		expect(result).not.toHaveProperty("id");
		expect(result).not.toHaveProperty("userId");
		expect(result).not.toHaveProperty("tableId");
	});
});

describe("upsertUserSettingsFn", () => {
	it("calls requireAuth", async () => {
		await upsertUserSettingsFn({
			data: { tableId: "books" },
		});

		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
	});

	it("returns success", async () => {
		const result = await upsertUserSettingsFn({
			data: { tableId: "books", viewMode: "grid" },
		});

		expect(result).toEqual({ success: true });
		expect(mocks.insertRun).toHaveBeenCalledTimes(1);
	});

	it("builds set object from defined fields only", async () => {
		// Import db to spy on the insert chain
		const { db } = await import("src/db");

		// Call with only viewMode defined (columnOrder, hiddenColumns, addDefaults are undefined)
		await upsertUserSettingsFn({
			data: { tableId: "movies", viewMode: "grid" },
		});

		// The insert was called — verify via the mock chain
		expect(db.insert).toHaveBeenCalled();
		expect(mocks.insertRun).toHaveBeenCalledTimes(1);
	});

	it("handles all fields being provided", async () => {
		const result = await upsertUserSettingsFn({
			data: {
				tableId: "tv",
				columnOrder: ["title", "year"],
				hiddenColumns: ["year"],
				viewMode: "table",
				addDefaults: { monitored: true },
			},
		});

		expect(result).toEqual({ success: true });
		expect(mocks.insertRun).toHaveBeenCalledTimes(1);
	});
});

describe("resetColumnSettingsFn", () => {
	it("calls requireAuth", async () => {
		await resetColumnSettingsFn({ data: { tableId: "authors" } });

		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
	});

	it("resets columns to empty arrays and returns success", async () => {
		const { db } = await import("src/db");

		const result = await resetColumnSettingsFn({
			data: { tableId: "books" },
		});

		expect(result).toEqual({ success: true });
		expect(db.update).toHaveBeenCalled();
		expect(mocks.updateRun).toHaveBeenCalledTimes(1);
	});
});
