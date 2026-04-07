import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, genericOAuth } from "better-auth/plugins";
import { defaultRoles, userAc } from "better-auth/plugins/admin/access";
import { and, eq } from "drizzle-orm";
import { db, sqlite } from "src/db";
import { oidcProviders } from "src/db/schema";
import { getSettingValue } from "src/server/settings-store";

type DefaultRole = "viewer" | "requester";

function loadOidcProviders() {
	const rows = db
		.select()
		.from(oidcProviders)
		.where(eq(oidcProviders.enabled, true))
		.all();

	return rows.map((row) => ({
		providerId: row.providerId,
		clientId: row.clientId,
		clientSecret: row.clientSecret,
		discoveryUrl: row.discoveryUrl,
		scopes: row.scopes,
	}));
}

function getDefaultRole(): DefaultRole {
	const role = getSettingValue<string>("auth.defaultRole", "requester");
	if (role === "viewer" || role === "requester") {
		return role;
	}
	return "requester";
}

function isProviderTrusted(providerId: string): boolean {
	const provider = db
		.select()
		.from(oidcProviders)
		.where(
			and(
				eq(oidcProviders.providerId, providerId),
				eq(oidcProviders.enabled, true),
				eq(oidcProviders.trusted, true),
			),
		)
		.get();
	return !!provider;
}

type RequestLikeContext = {
	request?: Request;
};

function getRequestUrl(ctx: unknown): string {
	if (typeof ctx !== "object" || ctx === null || !("request" in ctx)) {
		return "";
	}
	const request = (ctx as RequestLikeContext).request;
	return request?.url ?? "";
}

const oidcConfig = loadOidcProviders();
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

					const requestUrl = getRequestUrl(ctx);

					// Admin-created users get the provided role or default
					if (requestUrl.includes("/admin/create-user")) {
						const defaultRole = getDefaultRole();
						return {
							data: {
								...userData,
								role: userData.role || defaultRole,
							},
						};
					}

					// OIDC callback — check if provider is trusted
					const callbackMatch = requestUrl.match(
						/\/oauth2\/callback\/([^/?]+)/,
					);
					if (callbackMatch) {
						const providerId = callbackMatch[1];
						if (
							process.env.DISABLE_REGISTRATION === "true" &&
							!isProviderTrusted(providerId)
						) {
							throw new Error("Registration is disabled");
						}
						return {
							data: { ...userData, role: getDefaultRole() },
						};
					}

					// Email/password signup — check DISABLE_REGISTRATION
					if (process.env.DISABLE_REGISTRATION === "true") {
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
