import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db, sqlite } from "src/db";
import { oidcProviders } from "src/db/schema";

/**
 * Check if any users exist in the database.
 * Public (no auth required) — used by /setup, /login, _authed.
 */
export const hasUsersFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const row = sqlite.prepare("SELECT 1 FROM user LIMIT 1").get();
		return { hasUsers: !!row };
	},
);

/**
 * Get registration status for the login/register pages.
 * Public (no auth required).
 */
export const getRegistrationStatusFn = createServerFn({
	method: "GET",
}).handler(async () => {
	const registrationDisabled = process.env.DISABLE_REGISTRATION === "true";

	// Get enabled OIDC providers (public info only — no secrets)
	const providers = db
		.select({
			providerId: oidcProviders.providerId,
			displayName: oidcProviders.displayName,
		})
		.from(oidcProviders)
		.where(eq(oidcProviders.enabled, true))
		.all();

	return {
		registrationDisabled,
		oidcProviders: providers,
	};
});
