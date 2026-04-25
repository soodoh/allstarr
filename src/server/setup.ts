import { createServerFn } from "@tanstack/react-start";
import { sqlite } from "src/db";
import { authConfig } from "src/lib/auth-config";

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
	return {
		emailPasswordRegistrationDisabled:
			authConfig.emailPasswordRegistrationDisabled,
		oidcProviders: authConfig.publicOidcProviders,
		registrationDisabled: authConfig.registrationDisabled,
	};
});
