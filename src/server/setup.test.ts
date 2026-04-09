import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setupMocks = vi.hoisted(() => ({
	all: vi.fn(),
	get: vi.fn(),
	prepare: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
	}),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					all: setupMocks.all,
				})),
			})),
		})),
	},
	sqlite: {
		prepare: setupMocks.prepare,
	},
}));

vi.mock("src/db/schema", () => ({
	oidcProviders: {
		displayName: "oidcProviders.displayName",
		enabled: "oidcProviders.enabled",
		providerId: "oidcProviders.providerId",
	},
}));

import { getRegistrationStatusFn, hasUsersFn } from "./setup";

describe("setup server functions", () => {
	const originalDisableRegistration = process.env.DISABLE_REGISTRATION;

	beforeEach(() => {
		vi.clearAllMocks();
		setupMocks.prepare.mockReturnValue({ get: setupMocks.get });
	});

	afterEach(() => {
		process.env.DISABLE_REGISTRATION = originalDisableRegistration;
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
		process.env.DISABLE_REGISTRATION = "true";
		setupMocks.all.mockReturnValue([
			{ displayName: "GitHub", providerId: "github" },
		]);

		await expect(getRegistrationStatusFn()).resolves.toEqual({
			oidcProviders: [{ displayName: "GitHub", providerId: "github" }],
			registrationDisabled: true,
		});
	});
});
