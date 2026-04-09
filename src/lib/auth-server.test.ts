import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	dbSelectAll: vi.fn().mockReturnValue([]),
	dbSelectGet: vi.fn(),
	getSettingValue: vi.fn(),
	sqlitePrepareGet: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					all: mocks.dbSelectAll,
					get: mocks.dbSelectGet,
				})),
				all: mocks.dbSelectAll,
			})),
		})),
	},
	sqlite: {
		prepare: vi.fn(() => ({
			get: mocks.sqlitePrepareGet,
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	oidcProviders: {
		enabled: "oidcProviders.enabled",
		providerId: "oidcProviders.providerId",
		trusted: "oidcProviders.trusted",
	},
}));

vi.mock("src/server/settings-store", () => ({
	getSettingValue: mocks.getSettingValue,
}));

vi.mock("better-auth", () => ({
	betterAuth: vi.fn((config) => config),
}));

vi.mock("better-auth/adapters/drizzle", () => ({
	drizzleAdapter: vi.fn(),
}));

vi.mock("better-auth/plugins", () => ({
	admin: vi.fn(() => "admin-plugin"),
	genericOAuth: vi.fn((opts) => opts),
}));

vi.mock("better-auth/plugins/admin/access", () => ({
	defaultRoles: {},
	userAc: "userAc",
}));

import { betterAuth } from "better-auth";

// Importing the module triggers loadOidcProviders which calls db.select()
// The mock returns [] by default so no OIDC providers are loaded
import "./auth-server";

const config = (betterAuth as unknown as ReturnType<typeof vi.fn>).mock
	.calls[0][0];
const beforeCreate = config.databaseHooks.user.create.before;

describe("auth-server", () => {
	const baseUserData = { name: "Test User", email: "test@example.com" };
	const originalEnv = process.env.DISABLE_REGISTRATION;

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.DISABLE_REGISTRATION = originalEnv;
	});

	describe("databaseHooks.user.create.before", () => {
		it("assigns admin role to the first user (count=0)", async () => {
			mocks.sqlitePrepareGet.mockReturnValue({ count: 0 });

			const result = await beforeCreate(baseUserData, undefined);

			expect(result).toEqual({
				data: { ...baseUserData, role: "admin" },
			});
		});

		it("assigns the default role to subsequent users", async () => {
			mocks.sqlitePrepareGet.mockReturnValue({ count: 1 });
			mocks.getSettingValue.mockReturnValue("viewer");

			const result = await beforeCreate(baseUserData, undefined);

			expect(result).toEqual({
				data: { ...baseUserData, role: "viewer" },
			});
		});

		it("assigns default role to admin-created users via /admin/create-user", async () => {
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });
			mocks.getSettingValue.mockReturnValue("viewer");

			const ctx = {
				request: new Request(
					"http://localhost:3000/api/auth/admin/create-user",
				),
			};

			const result = await beforeCreate(baseUserData, ctx);

			expect(result).toEqual({
				data: { ...baseUserData, role: "viewer" },
			});
		});

		it("preserves an explicit role for admin-created users", async () => {
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });
			mocks.getSettingValue.mockReturnValue("viewer");

			const ctx = {
				request: new Request(
					"http://localhost:3000/api/auth/admin/create-user",
				),
			};
			const userData = { ...baseUserData, role: "requester" };

			const result = await beforeCreate(userData, ctx);

			expect(result).toEqual({
				data: { ...userData, role: "requester" },
			});
		});

		it("assigns default role for OIDC callback with trusted provider", async () => {
			mocks.sqlitePrepareGet.mockReturnValue({ count: 3 });
			mocks.getSettingValue.mockReturnValue("viewer");
			mocks.dbSelectGet.mockReturnValue({ providerId: "my-idp" });

			const ctx = {
				request: new Request(
					"http://localhost:3000/api/auth/oauth2/callback/my-idp",
				),
			};

			const result = await beforeCreate(baseUserData, ctx);

			expect(result).toEqual({
				data: { ...baseUserData, role: "viewer" },
			});
		});

		it("blocks OIDC callback when DISABLE_REGISTRATION is set and provider is not trusted", async () => {
			process.env.DISABLE_REGISTRATION = "true";
			mocks.sqlitePrepareGet.mockReturnValue({ count: 3 });
			mocks.dbSelectGet.mockReturnValue(undefined);

			const ctx = {
				request: new Request(
					"http://localhost:3000/api/auth/oauth2/callback/untrusted-idp",
				),
			};

			await expect(beforeCreate(baseUserData, ctx)).rejects.toThrow(
				"Registration is disabled",
			);
		});

		it("allows OIDC callback when DISABLE_REGISTRATION is set but provider is trusted", async () => {
			process.env.DISABLE_REGISTRATION = "true";
			mocks.sqlitePrepareGet.mockReturnValue({ count: 3 });
			mocks.getSettingValue.mockReturnValue("requester");
			mocks.dbSelectGet.mockReturnValue({ providerId: "trusted-idp" });

			const ctx = {
				request: new Request(
					"http://localhost:3000/api/auth/oauth2/callback/trusted-idp",
				),
			};

			const result = await beforeCreate(baseUserData, ctx);

			expect(result).toEqual({
				data: { ...baseUserData, role: "requester" },
			});
		});

		it("blocks email/password signup when DISABLE_REGISTRATION is set", async () => {
			process.env.DISABLE_REGISTRATION = "true";
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });

			await expect(beforeCreate(baseUserData, undefined)).rejects.toThrow(
				"Registration is disabled",
			);
		});

		it("allows email/password signup when DISABLE_REGISTRATION is not set", async () => {
			delete process.env.DISABLE_REGISTRATION;
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });
			mocks.getSettingValue.mockReturnValue("requester");

			const result = await beforeCreate(baseUserData, undefined);

			expect(result).toEqual({
				data: { ...baseUserData, role: "requester" },
			});
		});
	});

	describe("getDefaultRole (via beforeCreate)", () => {
		it("returns 'requester' when setting value is invalid", async () => {
			mocks.sqlitePrepareGet.mockReturnValue({ count: 1 });
			mocks.getSettingValue.mockReturnValue("admin");

			const result = await beforeCreate(baseUserData, undefined);

			expect(result).toEqual({
				data: { ...baseUserData, role: "requester" },
			});
		});

		it("returns 'viewer' when setting value is 'viewer'", async () => {
			mocks.sqlitePrepareGet.mockReturnValue({ count: 1 });
			mocks.getSettingValue.mockReturnValue("viewer");

			const result = await beforeCreate(baseUserData, undefined);

			expect(result).toEqual({
				data: { ...baseUserData, role: "viewer" },
			});
		});

		it("returns 'requester' when setting value is 'requester'", async () => {
			mocks.sqlitePrepareGet.mockReturnValue({ count: 1 });
			mocks.getSettingValue.mockReturnValue("requester");

			const result = await beforeCreate(baseUserData, undefined);

			expect(result).toEqual({
				data: { ...baseUserData, role: "requester" },
			});
		});
	});
});
