import { redirect } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	redirect: vi.fn((opts) => ({ _redirect: true, ...opts })),
}));

import { requireAdminBeforeLoad } from "./admin-route";

describe("requireAdminBeforeLoad", () => {
	it("throws a redirect to / when the user is not an admin", () => {
		expect(() =>
			requireAdminBeforeLoad({
				context: { session: { user: { role: "viewer" } } },
			}),
		).toThrow();

		expect(redirect).toHaveBeenCalledWith({ to: "/" });
	});

	it("throws a redirect when role is null", () => {
		expect(() =>
			requireAdminBeforeLoad({
				context: { session: { user: { role: null } } },
			}),
		).toThrow();
	});

	it("throws a redirect when role is undefined", () => {
		expect(() =>
			requireAdminBeforeLoad({
				context: { session: { user: { role: undefined } } },
			}),
		).toThrow();
	});

	it("does not throw for an admin user", () => {
		expect(() =>
			requireAdminBeforeLoad({
				context: { session: { user: { role: "admin" } } },
			}),
		).not.toThrow();
	});
});
