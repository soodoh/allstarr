import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeRow = Record<string, unknown>;
type FakeTable = {
	tableName: "account" | "session" | "user";
};
type FakeColumn = {
	name: string;
	tableName: "account" | "session" | "user";
};
type FakeAggregate = {
	kind: "max";
	column: FakeColumn;
};
type FakeSelectShape = Record<string, FakeColumn | FakeAggregate>;

function createFakeSchema() {
	function column(tableName: FakeColumn["tableName"], name: string) {
		return { tableName, name };
	}

	return {
		account: {
			tableName: "account" as const,
			userId: column("account", "userId"),
			providerId: column("account", "providerId"),
		},
		session: {
			tableName: "session" as const,
			userId: column("session", "userId"),
			createdAt: column("session", "createdAt"),
		},
		user: {
			tableName: "user" as const,
			id: column("user", "id"),
			name: column("user", "name"),
			email: column("user", "email"),
			role: column("user", "role"),
			image: column("user", "image"),
			createdAt: column("user", "createdAt"),
		},
	};
}

function createDrizzleOrmMock() {
	return {
		desc: vi.fn((column: FakeColumn) => ({ column, direction: "desc" })),
		eq: vi.fn((column, value) => ({ column, value })),
		max: vi.fn((column: FakeColumn) => ({ kind: "max", column })),
	};
}

function createFakeUsersDb({
	userRows = [],
	sessionRows = [],
	accountRows = [],
}: {
	userRows?: Array<FakeRow>;
	sessionRows?: Array<FakeRow>;
	accountRows?: Array<FakeRow>;
} = {}) {
	function pickRows(table?: FakeTable) {
		switch (table?.tableName) {
			case "account":
				return accountRows;
			case "session":
				return sessionRows;
			case "user":
			default:
				return userRows;
		}
	}

	const select = vi.fn((shape?: FakeSelectShape) => {
		let rows = pickRows();
		let currentTable: FakeTable | undefined;
		let groupByColumn: FakeColumn | undefined;

		function projectRow(row: FakeRow) {
			if (!shape) {
				return row;
			}

			return Object.fromEntries(
				Object.entries(shape).map(([key, value]) => {
					if ("kind" in value) {
						return [key, row[value.column.name]];
					}

					return [key, row[value.name]];
				}),
			);
		}

		function aggregateRows() {
			if (currentTable?.tableName !== "session" || !groupByColumn || !shape) {
				return rows.map((row) => projectRow(row));
			}

			const grouped = new Map<unknown, FakeRow>();

			for (const row of rows) {
				const groupKey = row[groupByColumn.name];
				const projected = Object.fromEntries(
					Object.entries(shape).map(([key, value]) => {
						if ("kind" in value) {
							return [key, row[value.column.name]];
						}

						return [key, row[value.name]];
					}),
				);
				const existing = grouped.get(groupKey);

				if (!existing) {
					grouped.set(groupKey, projected);
					continue;
				}

				for (const [key, value] of Object.entries(shape)) {
					if (!("kind" in value) || value.kind !== "max") {
						continue;
					}

					const nextValue = projected[key];
					const currentValue = existing[key];
					if (
						nextValue instanceof Date &&
						(!(currentValue instanceof Date) ||
							nextValue.getTime() > currentValue.getTime())
					) {
						existing[key] = nextValue;
					}
				}
			}

			return [...grouped.values()];
		}

		function compareValues(left: unknown, right: unknown) {
			if (left instanceof Date && right instanceof Date) {
				return right.getTime() - left.getTime();
			}

			if (typeof left === "number" && typeof right === "number") {
				return right - left;
			}

			if (typeof left === "string" && typeof right === "string") {
				return right.localeCompare(left);
			}

			if (left === right) {
				return 0;
			}

			return 0;
		}

		const chain = {
			orderBy: vi.fn((order?: { column?: FakeColumn; direction?: string }) => {
				if (order?.direction === "desc" && order.column?.name) {
					rows = [...rows].sort((left, right) =>
						compareValues(left[order.column.name], right[order.column.name]),
					);
				}

				return chain;
			}),
			groupBy: vi.fn((column?: FakeColumn) => {
				groupByColumn = column;
				return chain;
			}),
			all: vi.fn(() => aggregateRows()),
			get: vi.fn(() => projectRow(rows[0] ?? {})),
		};

		return {
			from: vi.fn((table?: FakeTable) => {
				currentTable = table;
				rows = pickRows(table);
				return chain;
			}),
		};
	});

	const updateRun = vi.fn();
	const updateWhere = vi.fn(() => ({ run: updateRun }));
	const updateSet = vi.fn(() => ({ where: updateWhere }));
	const update = vi.fn(() => ({ set: updateSet }));

	return {
		select,
		update,
		updateSet,
		updateWhere,
		updateRun,
	};
}

function mockUsersRuntime() {
	vi.doMock("@tanstack/react-start", () => ({
		createServerFn: ({ method }: { method?: "GET" | "POST" } = {}) => {
			let inputValidator:
				| ((data: unknown) => unknown)
				| { parse: (data: unknown) => unknown }
				| undefined;

			function validateInput(data: unknown) {
				if (!inputValidator) {
					return data;
				}

				if (typeof inputValidator === "function") {
					return inputValidator(data);
				}

				return inputValidator.parse(data);
			}

			const builder: {
				inputValidator: (validator: unknown) => typeof builder;
				middleware: (middlewares: unknown) => typeof builder;
				handler: (fn: (opts: { data: unknown }) => unknown) => unknown;
			} = {
				inputValidator: (validator) => {
					inputValidator = validator as
						| ((data: unknown) => unknown)
						| { parse: (data: unknown) => unknown };
					return builder;
				},
				middleware: () => builder,
				handler: (fn) =>
					Object.assign(
						async (opts: { data?: unknown } = {}) =>
							fn({ data: validateInput(opts.data) }),
						{
							method: method ?? "GET",
						},
					),
			};

			return builder;
		},
	}));
}

beforeEach(() => {
	mockUsersRuntime();
});

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

describe("createUserFn", () => {
	it("passes non-admin roles through Better Auth without a follow-up db patch", async () => {
		const createUser = vi.fn().mockResolvedValue({
			user: {
				id: "user-1",
				role: "viewer",
			},
		});
		const db = createFakeUsersDb();

		vi.doMock("drizzle-orm", createDrizzleOrmMock);
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", createFakeSchema);
		vi.doMock("src/lib/auth", () => ({
			getAuth: vi.fn().mockResolvedValue({
				api: {
					createUser,
				},
			}),
		}));
		vi.doMock("./middleware", () => ({
			requireAdmin: vi.fn().mockResolvedValue({
				user: { id: "admin-1", role: "admin" },
			}),
		}));
		vi.doMock("./settings-store", () => ({
			getSettingValue: vi.fn(),
			upsertSettingValue: vi.fn(),
		}));

		const { createUserFn } = await import("./users");

		await createUserFn({
			data: {
				name: "Viewer User",
				email: "viewer@example.com",
				password: "password123",
				role: "viewer",
			},
		});

		expect(createUser).toHaveBeenCalledWith({
			body: {
				name: "Viewer User",
				email: "viewer@example.com",
				password: "password123",
				role: "viewer",
			},
		});
		expect(db.update).not.toHaveBeenCalled();
	});
});

describe("listUsersFn", () => {
	it("hydrates authMethod and lastLogin for each user", async () => {
		const db = createFakeUsersDb({
			userRows: [
				{
					id: "user-1",
					name: "Alice",
					email: "alice@example.com",
					role: "viewer",
					image: null,
					createdAt: new Date("2026-04-01T10:00:00.000Z"),
				},
				{
					id: "user-2",
					name: "Bob",
					email: "bob@example.com",
					role: "requester",
					image: "https://example.com/bob.png",
					createdAt: new Date("2026-04-02T10:00:00.000Z"),
				},
				{
					id: "user-3",
					name: "Charlie",
					email: "charlie@example.com",
					role: "viewer",
					image: null,
					createdAt: new Date("2026-04-03T10:00:00.000Z"),
				},
			],
			sessionRows: [
				{
					userId: "user-1",
					createdAt: new Date("2026-04-05T09:30:00.000Z"),
				},
				{
					userId: "user-1",
					createdAt: new Date("2026-04-07T09:30:00.000Z"),
				},
			],
			accountRows: [
				{
					userId: "user-1",
					providerId: "credential",
				},
				{
					userId: "user-1",
					providerId: "google",
				},
				{
					userId: "user-2",
					providerId: "google",
				},
				{
					userId: "user-2",
					providerId: "credential",
				},
			],
		});

		vi.doMock("drizzle-orm", createDrizzleOrmMock);
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", createFakeSchema);
		vi.doMock("src/lib/auth", () => ({
			getAuth: vi.fn(),
		}));
		vi.doMock("./middleware", () => ({
			requireAdmin: vi.fn().mockResolvedValue({
				user: { id: "admin-1", role: "admin" },
			}),
		}));
		vi.doMock("./settings-store", () => ({
			getSettingValue: vi.fn(),
			upsertSettingValue: vi.fn(),
		}));

		const { listUsersFn } = await import("./users");
		const users = await listUsersFn();

		expect(users).toEqual([
			{
				id: "user-3",
				name: "Charlie",
				email: "charlie@example.com",
				role: "viewer",
				image: null,
				createdAt: new Date("2026-04-03T10:00:00.000Z"),
				lastLogin: null,
				authMethod: "credential",
			},
			{
				id: "user-2",
				name: "Bob",
				email: "bob@example.com",
				role: "requester",
				image: "https://example.com/bob.png",
				createdAt: new Date("2026-04-02T10:00:00.000Z"),
				lastLogin: null,
				authMethod: "google",
			},
			{
				id: "user-1",
				name: "Alice",
				email: "alice@example.com",
				role: "viewer",
				image: null,
				createdAt: new Date("2026-04-01T10:00:00.000Z"),
				lastLogin: new Date("2026-04-07T09:30:00.000Z"),
				authMethod: "google",
			},
		]);
	});
});

describe("setUserRoleFn", () => {
	it("rejects changing your own role", async () => {
		const db = createFakeUsersDb();

		vi.doMock("drizzle-orm", createDrizzleOrmMock);
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", createFakeSchema);
		vi.doMock("src/lib/auth", () => ({
			getAuth: vi.fn(),
		}));
		vi.doMock("./middleware", () => ({
			requireAdmin: vi.fn().mockResolvedValue({
				user: { id: "admin-1", role: "admin" },
			}),
		}));
		vi.doMock("./settings-store", () => ({
			getSettingValue: vi.fn(),
			upsertSettingValue: vi.fn(),
		}));

		const { setUserRoleFn } = await import("./users");

		await expect(
			setUserRoleFn({
				data: {
					userId: "admin-1",
					role: "viewer",
				},
			}),
		).rejects.toThrow("Cannot change your own role");
		expect(db.update).not.toHaveBeenCalled();
	});

	it("updates another user's role through Drizzle and returns success", async () => {
		const db = createFakeUsersDb();

		vi.doMock("drizzle-orm", createDrizzleOrmMock);
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", createFakeSchema);
		vi.doMock("src/lib/auth", () => ({
			getAuth: vi.fn(),
		}));
		vi.doMock("./middleware", () => ({
			requireAdmin: vi.fn().mockResolvedValue({
				user: { id: "admin-1", role: "admin" },
			}),
		}));
		vi.doMock("./settings-store", () => ({
			getSettingValue: vi.fn(),
			upsertSettingValue: vi.fn(),
		}));

		const { setUserRoleFn } = await import("./users");

		await expect(
			setUserRoleFn({
				data: {
					userId: "user-2",
					role: "requester",
				},
			}),
		).resolves.toEqual({ success: true });
		expect(db.update).toHaveBeenCalledTimes(1);
		expect(db.updateSet).toHaveBeenCalledWith({ role: "requester" });
		expect(db.updateWhere).toHaveBeenCalledWith({
			column: { name: "id", tableName: "user" },
			value: "user-2",
		});
		expect(db.updateRun).toHaveBeenCalledTimes(1);
	});
});

describe("default role flows", () => {
	it("falls back to requester and persists configured default role", async () => {
		const getSettingValue = vi.fn().mockReturnValue("admin");
		const upsertSettingValue = vi.fn();
		const db = createFakeUsersDb();

		vi.doMock("drizzle-orm", createDrizzleOrmMock);
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", createFakeSchema);
		vi.doMock("src/lib/auth", () => ({
			getAuth: vi.fn(),
		}));
		vi.doMock("./middleware", () => ({
			requireAdmin: vi.fn().mockResolvedValue({
				user: { id: "admin-1", role: "admin" },
			}),
		}));
		vi.doMock("./settings-store", () => ({
			getSettingValue,
			upsertSettingValue,
		}));

		const { getDefaultRoleFn, updateDefaultRoleFn } = await import("./users");

		await expect(getDefaultRoleFn()).resolves.toEqual({
			defaultRole: "requester",
		});

		await expect(
			updateDefaultRoleFn({
				data: {
					role: "viewer",
				},
			}),
		).resolves.toEqual({ success: true });
		expect(upsertSettingValue).toHaveBeenCalledWith(
			"auth.defaultRole",
			"viewer",
		);
	});

	it("returns a configured valid default role unchanged", async () => {
		const getSettingValue = vi.fn().mockReturnValue("viewer");
		const db = createFakeUsersDb();

		vi.doMock("drizzle-orm", createDrizzleOrmMock);
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", createFakeSchema);
		vi.doMock("src/lib/auth", () => ({
			getAuth: vi.fn(),
		}));
		vi.doMock("./middleware", () => ({
			requireAdmin: vi.fn().mockResolvedValue({
				user: { id: "admin-1", role: "admin" },
			}),
		}));
		vi.doMock("./settings-store", () => ({
			getSettingValue,
			upsertSettingValue: vi.fn(),
		}));

		const { getDefaultRoleFn } = await import("./users");

		await expect(getDefaultRoleFn()).resolves.toEqual({
			defaultRole: "viewer",
		});
	});
});

describe("deleteUserFn", () => {
	it("rejects self-delete", async () => {
		const removeUser = vi.fn();
		const db = createFakeUsersDb();

		vi.doMock("drizzle-orm", createDrizzleOrmMock);
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", createFakeSchema);
		vi.doMock("src/lib/auth", () => ({
			getAuth: vi.fn().mockResolvedValue({
				api: {
					removeUser,
				},
			}),
		}));
		vi.doMock("./middleware", () => ({
			requireAdmin: vi.fn().mockResolvedValue({
				user: { id: "user-1", role: "admin" },
			}),
		}));
		vi.doMock("./settings-store", () => ({
			getSettingValue: vi.fn(),
			upsertSettingValue: vi.fn(),
		}));

		const { deleteUserFn } = await import("./users");

		await expect(
			deleteUserFn({
				data: {
					userId: "user-1",
				},
			}),
		).rejects.toThrow("Cannot delete your own account");
		expect(removeUser).not.toHaveBeenCalled();
	});

	it("deletes a different user via Better Auth", async () => {
		const removeUser = vi.fn();
		const db = createFakeUsersDb();

		vi.doMock("drizzle-orm", createDrizzleOrmMock);
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", createFakeSchema);
		vi.doMock("src/lib/auth", () => ({
			getAuth: vi.fn().mockResolvedValue({
				api: {
					removeUser,
				},
			}),
		}));
		vi.doMock("./middleware", () => ({
			requireAdmin: vi.fn().mockResolvedValue({
				user: { id: "admin-1", role: "admin" },
			}),
		}));
		vi.doMock("./settings-store", () => ({
			getSettingValue: vi.fn(),
			upsertSettingValue: vi.fn(),
		}));

		const { deleteUserFn } = await import("./users");

		await expect(
			deleteUserFn({
				data: {
					userId: "user-2",
				},
			}),
		).resolves.toEqual({ success: true });
		expect(removeUser).toHaveBeenCalledWith({
			body: {
				userId: "user-2",
			},
		});
	});
});
