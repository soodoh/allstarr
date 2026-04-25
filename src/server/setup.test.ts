import { beforeEach, describe, expect, it, vi } from "vitest";

const setupMocks = vi.hoisted(() => ({
	authConfig: {
		emailPasswordRegistrationDisabled: true,
		publicOidcProviders: [{ displayName: "GitHub", providerId: "github" }],
		registrationDisabled: true,
	},
	get: vi.fn(),
	prepare: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
	}),
}));

vi.mock("src/db", () => ({
	sqlite: {
		prepare: setupMocks.prepare,
	},
}));

vi.mock("src/lib/auth-config", () => ({
	authConfig: setupMocks.authConfig,
}));

import { getRegistrationStatusFn, hasUsersFn } from "./setup";

describe("setup server functions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupMocks.prepare.mockReturnValue({ get: setupMocks.get });
	});

	it("reports whether at least one user exists", async () => {
		setupMocks.get.mockReturnValueOnce({ 1: 1 }).mockReturnValueOnce(undefined);

		await expect(hasUsersFn()).resolves.toEqual({ hasUsers: true });
		await expect(hasUsersFn()).resolves.toEqual({ hasUsers: false });

		expect(setupMocks.prepare).toHaveBeenCalledWith(
			"SELECT 1 FROM user LIMIT 1",
		);
		expect(setupMocks.get).toHaveBeenCalledTimes(2);
	});

	it("returns registration status and enabled oidc providers", async () => {
		await expect(getRegistrationStatusFn()).resolves.toEqual({
			emailPasswordRegistrationDisabled:
				setupMocks.authConfig.emailPasswordRegistrationDisabled,
			oidcProviders: setupMocks.authConfig.publicOidcProviders,
			registrationDisabled: setupMocks.authConfig.registrationDisabled,
		});
	});
});
