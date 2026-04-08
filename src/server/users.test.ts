import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeRow = Record<string, unknown>;

function createFakeUsersDb(selectResults: Array<Array<FakeRow>> = []) {
	let selectCallIndex = 0;

	const select = vi.fn(() => {
		const rows = selectResults[selectCallIndex++] ?? [];
		const chain = {
			orderBy: vi.fn(() => chain),
			groupBy: vi.fn(() => chain),
			all: vi.fn(() => rows),
			get: vi.fn(() => rows[0]),
		};

		return {
			from: vi.fn(() => chain),
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

		vi.doMock("drizzle-orm", () => ({
			desc: vi.fn(),
			eq: vi.fn((column, value) => ({ column, value })),
			max: vi.fn(),
		}));
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", () => ({
			account: {
				userId: { name: "userId" },
				providerId: { name: "providerId" },
			},
			session: {
				userId: { name: "userId" },
				createdAt: { name: "createdAt" },
			},
			user: {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				role: { name: "role" },
				image: { name: "image" },
				createdAt: { name: "createdAt" },
			},
		}));
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
		const db = createFakeUsersDb([
			[
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
			],
			[
				{
					userId: "user-1",
					lastLogin: new Date("2026-04-07T09:30:00.000Z"),
				},
			],
			[
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
		]);

		vi.doMock("drizzle-orm", () => ({
			desc: vi.fn(),
			eq: vi.fn((column, value) => ({ column, value })),
			max: vi.fn(),
		}));
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", () => ({
			account: {
				userId: { name: "userId" },
				providerId: { name: "providerId" },
			},
			session: {
				userId: { name: "userId" },
				createdAt: { name: "createdAt" },
			},
			user: {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				role: { name: "role" },
				image: { name: "image" },
				createdAt: { name: "createdAt" },
			},
		}));
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
				id: "user-1",
				name: "Alice",
				email: "alice@example.com",
				role: "viewer",
				image: null,
				createdAt: new Date("2026-04-01T10:00:00.000Z"),
				lastLogin: new Date("2026-04-07T09:30:00.000Z"),
				authMethod: "google",
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
		]);
	});
});

describe("setUserRoleFn", () => {
	it("rejects changing your own role", async () => {
		const db = createFakeUsersDb();

		vi.doMock("drizzle-orm", () => ({
			desc: vi.fn(),
			eq: vi.fn((column, value) => ({ column, value })),
			max: vi.fn(),
		}));
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", () => ({
			account: {
				userId: { name: "userId" },
				providerId: { name: "providerId" },
			},
			session: {
				userId: { name: "userId" },
				createdAt: { name: "createdAt" },
			},
			user: {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				role: { name: "role" },
				image: { name: "image" },
				createdAt: { name: "createdAt" },
			},
		}));
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

		vi.doMock("drizzle-orm", () => ({
			desc: vi.fn(),
			eq: vi.fn((column, value) => ({ column, value })),
			max: vi.fn(),
		}));
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", () => ({
			account: {
				userId: { name: "userId" },
				providerId: { name: "providerId" },
			},
			session: {
				userId: { name: "userId" },
				createdAt: { name: "createdAt" },
			},
			user: {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				role: { name: "role" },
				image: { name: "image" },
				createdAt: { name: "createdAt" },
			},
		}));
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
			column: { name: "id" },
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

		vi.doMock("drizzle-orm", () => ({
			desc: vi.fn(),
			eq: vi.fn((column, value) => ({ column, value })),
			max: vi.fn(),
		}));
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", () => ({
			account: {
				userId: { name: "userId" },
				providerId: { name: "providerId" },
			},
			session: {
				userId: { name: "userId" },
				createdAt: { name: "createdAt" },
			},
			user: {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				role: { name: "role" },
				image: { name: "image" },
				createdAt: { name: "createdAt" },
			},
		}));
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
});

describe("deleteUserFn", () => {
	it("rejects self-delete", async () => {
		const removeUser = vi.fn();
		const db = createFakeUsersDb();

		vi.doMock("drizzle-orm", () => ({
			desc: vi.fn(),
			eq: vi.fn((column, value) => ({ column, value })),
			max: vi.fn(),
		}));
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", () => ({
			account: {
				userId: { name: "userId" },
				providerId: { name: "providerId" },
			},
			session: {
				userId: { name: "userId" },
				createdAt: { name: "createdAt" },
			},
			user: {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				role: { name: "role" },
				image: { name: "image" },
				createdAt: { name: "createdAt" },
			},
		}));
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

		vi.doMock("drizzle-orm", () => ({
			desc: vi.fn(),
			eq: vi.fn((column, value) => ({ column, value })),
			max: vi.fn(),
		}));
		vi.doMock("src/db", () => ({
			db,
		}));
		vi.doMock("src/db/schema", () => ({
			account: {
				userId: { name: "userId" },
				providerId: { name: "providerId" },
			},
			session: {
				userId: { name: "userId" },
				createdAt: { name: "createdAt" },
			},
			user: {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				role: { name: "role" },
				image: { name: "image" },
				createdAt: { name: "createdAt" },
			},
		}));
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
