import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, genericOAuth } from "better-auth/plugins";
import { defaultRoles, userAc } from "better-auth/plugins/admin/access";
import { db, sqlite } from "src/db";
import { authConfig } from "src/lib/auth-config";
import { getSettingValue } from "src/server/settings-store";

type DefaultRole = "viewer" | "requester";

function getDefaultRole(): DefaultRole {
	const role = getSettingValue<string>("auth.defaultRole", "requester");
	if (role === "viewer" || role === "requester") {
		return role;
	}
	return "requester";
}

type RequestLikeContext = {
	request?: Request;
};

function getRequestPathname(ctx: unknown): string {
	if (typeof ctx !== "object" || ctx === null || !("request" in ctx)) {
		return "";
	}
	const request = (ctx as RequestLikeContext).request;
	if (!request) {
		return "";
	}

	return new URL(request.url).pathname;
}

const oidcConfig = authConfig.oidcProviders.map(
	({
		allowAccountCreation: _allowAccountCreation,
		displayName: _displayName,
		...provider
	}) => provider,
);
const adminPluginRoles = {
	...defaultRoles,
	viewer: userAc,
	requester: userAc,
} as const;

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "sqlite",
	}),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		admin({
			defaultRole: "requester",
			roles: adminPluginRoles,
		}),
		...(oidcConfig.length > 0 ? [genericOAuth({ config: oidcConfig })] : []),
	],
	databaseHooks: {
		user: {
			create: {
				// This hook runs AFTER the admin plugin's own user.create.before hook.
				// The admin plugin sets role to its defaultRole, but our hook overrides
				// it by returning an explicit role value which takes precedence.
				before: async (userData, ctx) => {
					// Count existing users via raw SQL to avoid importing the user schema.
					const { count } = sqlite
						.prepare("SELECT COUNT(*) as count FROM user")
						.get() as { count: number };

					// First user is always admin
					if (count === 0) {
						return { data: { ...userData, role: "admin" } };
					}

					const requestPathname = getRequestPathname(ctx);

					// Admin-created users get the provided role or default
					if (requestPathname.endsWith("/admin/create-user")) {
						const defaultRole = getDefaultRole();
						return {
							data: {
								...userData,
								role: userData.role || defaultRole,
							},
						};
					}

					// OIDC callback
					const callbackMatch = requestPathname.match(
						/\/oauth2\/callback\/([^/]+)$/,
					);
					if (callbackMatch) {
						const providerId = callbackMatch[1] ?? "";
						if (
							authConfig.registrationDisabled &&
							!authConfig.allowOidcAccountCreation(providerId)
						) {
							throw new Error("Registration is disabled");
						}
						return {
							data: { ...userData, role: getDefaultRole() },
						};
					}

					// Email/password signup
					if (
						authConfig.registrationDisabled ||
						authConfig.emailPasswordRegistrationDisabled
					) {
						throw new Error("Registration is disabled");
					}

					return {
						data: { ...userData, role: getDefaultRole() },
					};
				},
			},
		},
	},
});
