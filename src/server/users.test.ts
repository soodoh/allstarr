import { afterEach, describe, expect, it, vi } from "vitest";

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
		const updateRun = vi.fn();
		const updateWhere = vi.fn(() => ({ run: updateRun }));
		const updateSet = vi.fn(() => ({ where: updateWhere }));
		const update = vi.fn(() => ({ set: updateSet }));

		vi.doMock("drizzle-orm", () => ({
			desc: vi.fn(),
			eq: vi.fn((column, value) => ({ column, value })),
			max: vi.fn(),
		}));
		vi.doMock("src/db", () => ({
			db: {
				update,
			},
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
		expect(update).not.toHaveBeenCalled();
	});
});
