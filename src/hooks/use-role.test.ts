import { renderHook } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useRouteContext } = vi.hoisted(() => ({
	useRouteContext: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	useRouteContext,
}));

import { useIsAdmin, useUserRole } from "./use-role";

describe("use-role", () => {
	afterEach(() => {
		useRouteContext.mockReset();
	});

	it("returns the session role when present", () => {
		useRouteContext.mockReturnValue({
			session: {
				user: {
					role: "admin",
				},
			},
		});

		const { result } = renderHook(() => useUserRole());

		expect(result.current).toBe("admin");
		expect(useRouteContext).toHaveBeenCalledWith({ from: "/_authed" });
	});

	it("falls back to viewer when the session role is missing", () => {
		useRouteContext.mockReturnValue({
			session: {
				user: {},
			},
		});

		const { result } = renderHook(() => useUserRole());

		expect(result.current).toBe("viewer");
	});

	it("reports whether the current user is an admin", () => {
		useRouteContext.mockReturnValue({
			session: {
				user: {
					role: "viewer",
				},
			},
		});

		const { result, rerender } = renderHook(() => useIsAdmin());

		expect(result.current).toBe(false);

		useRouteContext.mockReturnValue({
			session: {
				user: {
					role: "admin",
				},
			},
		});

		rerender();

		expect(result.current).toBe(true);
	});
});
