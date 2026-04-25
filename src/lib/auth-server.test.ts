import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	authConfig: {
		registrationDisabled: false,
		emailPasswordRegistrationDisabled: false,
		oidcProviders: [
			{
				providerId: "authentik",
				displayName: "Authentik",
				clientId: "client-id",
				clientSecret: "client-secret",
				discoveryUrl:
					"https://auth.example.com/.well-known/openid-configuration",
				scopes: ["openid", "profile", "email"],
				allowAccountCreation: false,
			},
		],
		publicOidcProviders: [
			{ providerId: "authentik", displayName: "Authentik" },
		],
		allowOidcAccountCreation: vi.fn(() => false),
	},
	getSettingValue: vi.fn(),
	sqlitePrepareGet: vi.fn(),
}));

vi.mock("src/db", () => ({
	db: {},
	sqlite: {
		prepare: vi.fn(() => ({
			get: mocks.sqlitePrepareGet,
		})),
	},
}));

vi.mock("src/lib/auth-config", () => ({
	authConfig: mocks.authConfig,
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

import "./auth-server";

const config = (betterAuth as unknown as ReturnType<typeof vi.fn>).mock
	.calls[0][0];
const beforeCreate = config.databaseHooks.user.create.before;

describe("auth-server", () => {
	const baseUserData = { name: "Test User", email: "test@example.com" };

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.authConfig.registrationDisabled = false;
		mocks.authConfig.emailPasswordRegistrationDisabled = false;
		mocks.authConfig.allowOidcAccountCreation.mockReturnValue(false);
	});

	it("builds generic OAuth config from env providers without app-only metadata", () => {
		expect(config.plugins).toContainEqual({
			config: [
				{
					providerId: "authentik",
					clientId: "client-id",
					clientSecret: "client-secret",
					discoveryUrl:
						"https://auth.example.com/.well-known/openid-configuration",
					scopes: ["openid", "profile", "email"],
				},
			],
		});
	});

	describe("databaseHooks.user.create.before", () => {
		it("assigns admin role to the first user (count=0)", async () => {
			mocks.sqlitePrepareGet.mockReturnValue({ count: 0 });

			const result = await beforeCreate(baseUserData, undefined);

			expect(result).toEqual({
				data: { ...baseUserData, role: "admin" },
			});
		});

		it("assigns admin role to the first user when registration is disabled", async () => {
			mocks.authConfig.registrationDisabled = true;
			mocks.authConfig.emailPasswordRegistrationDisabled = true;
			mocks.sqlitePrepareGet.mockReturnValue({ count: 0 });

			const result = await beforeCreate(baseUserData, {
				request: new Request(
					"http://localhost:3000/api/auth/oauth2/callback/authentik",
				),
			});

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

		it("assigns default role to admin-created users with path context when registration is disabled", async () => {
			mocks.authConfig.registrationDisabled = true;
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });
			mocks.getSettingValue.mockReturnValue("viewer");

			const result = await beforeCreate(baseUserData, {
				path: "/admin/create-user",
			});

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

		it("assigns default role for OIDC callback when registration is enabled", async () => {
			mocks.sqlitePrepareGet.mockReturnValue({ count: 3 });
			mocks.getSettingValue.mockReturnValue("viewer");

			const ctx = {
				request: new Request(
					"http://localhost:3000/api/auth/oauth2/callback/authentik",
				),
			};

			const result = await beforeCreate(baseUserData, ctx);

			expect(result).toEqual({
				data: { ...baseUserData, role: "viewer" },
			});
		});

		it("blocks OIDC callback when global registration is disabled and provider does not allow account creation", async () => {
			mocks.authConfig.registrationDisabled = true;
			mocks.sqlitePrepareGet.mockReturnValue({ count: 3 });

			const ctx = {
				request: new Request(
					"http://localhost:3000/api/auth/oauth2/callback/authentik",
				),
			};

			await expect(beforeCreate(baseUserData, ctx)).rejects.toThrow(
				"Registration is disabled",
			);
			expect(mocks.authConfig.allowOidcAccountCreation).toHaveBeenCalledWith(
				"authentik",
			);
		});

		it("allows OIDC callback when global registration is disabled and provider allows account creation", async () => {
			mocks.authConfig.registrationDisabled = true;
			mocks.authConfig.allowOidcAccountCreation.mockReturnValue(true);
			mocks.sqlitePrepareGet.mockReturnValue({ count: 3 });
			mocks.getSettingValue.mockReturnValue("requester");

			const ctx = {
				request: new Request(
					"http://localhost:3000/api/auth/oauth2/callback/authentik",
				),
			};

			const result = await beforeCreate(baseUserData, ctx);

			expect(result).toEqual({
				data: { ...baseUserData, role: "requester" },
			});
			expect(mocks.authConfig.allowOidcAccountCreation).toHaveBeenCalledWith(
				"authentik",
			);
		});

		it("blocks email/password signup when DISABLE_REGISTRATION is set", async () => {
			mocks.authConfig.registrationDisabled = true;
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });

			await expect(
				beforeCreate(baseUserData, {
					request: new Request("http://localhost:3000/api/auth/sign-up/email"),
				}),
			).rejects.toThrow("Registration is disabled");
		});

		it("blocks disabled email/password signup when query string includes admin create path", async () => {
			mocks.authConfig.registrationDisabled = true;
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });

			await expect(
				beforeCreate(baseUserData, {
					request: new Request(
						"http://localhost:3000/api/auth/sign-up/email?next=/admin/create-user",
					),
				}),
			).rejects.toThrow("Registration is disabled");
		});

		it("blocks disabled email/password signup when query string includes OIDC callback path", async () => {
			mocks.authConfig.registrationDisabled = true;
			mocks.authConfig.allowOidcAccountCreation.mockReturnValue(true);
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });

			await expect(
				beforeCreate(baseUserData, {
					request: new Request(
						"http://localhost:3000/api/auth/sign-up/email?next=/oauth2/callback/authentik",
					),
				}),
			).rejects.toThrow("Registration is disabled");
		});

		it("blocks email/password signup when DISABLE_EMAIL_PASSWORD_REGISTRATION is set", async () => {
			mocks.authConfig.emailPasswordRegistrationDisabled = true;
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });

			await expect(
				beforeCreate(baseUserData, {
					request: new Request("http://localhost:3000/api/auth/sign-up/email"),
				}),
			).rejects.toThrow("Registration is disabled");
		});

		it("allows OIDC callback when email/password registration is disabled", async () => {
			mocks.authConfig.emailPasswordRegistrationDisabled = true;
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });
			mocks.getSettingValue.mockReturnValue("requester");

			const result = await beforeCreate(baseUserData, {
				request: new Request(
					"http://localhost:3000/api/auth/oauth2/callback/authentik",
				),
			});

			expect(result).toEqual({
				data: { ...baseUserData, role: "requester" },
			});
		});

		it("allows email/password signup when registration flags are not set", async () => {
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });
			mocks.getSettingValue.mockReturnValue("requester");

			const result = await beforeCreate(baseUserData, {
				request: new Request("http://localhost:3000/api/auth/sign-up/email"),
			});

			expect(result).toEqual({
				data: { ...baseUserData, role: "requester" },
			});
		});

		it("assigns default role to users created without request context", async () => {
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });
			mocks.getSettingValue.mockReturnValue("requester");

			const result = await beforeCreate(baseUserData, undefined);

			expect(result).toEqual({
				data: { ...baseUserData, role: "requester" },
			});
		});

		it("blocks users created without request context when global registration is disabled", async () => {
			mocks.authConfig.registrationDisabled = true;
			mocks.sqlitePrepareGet.mockReturnValue({ count: 5 });

			await expect(beforeCreate(baseUserData, undefined)).rejects.toThrow(
				"Registration is disabled",
			);
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
