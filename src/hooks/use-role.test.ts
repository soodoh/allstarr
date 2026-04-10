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

	it("returns the session role when present", async () => {
		useRouteContext.mockReturnValue({
			session: {
				user: {
					role: "admin",
				},
			},
		});

		const { result } = await renderHook(() => useUserRole());

		expect(result.current).toBe("admin");
		expect(useRouteContext).toHaveBeenCalledWith({ from: "/_authed" });
	});

	it("falls back to viewer when the session role is missing", async () => {
		useRouteContext.mockReturnValue({
			session: {
				user: {},
			},
		});

		const { result } = await renderHook(() => useUserRole());

		expect(result.current).toBe("viewer");
	});

	it("reports whether the current user is an admin", async () => {
		useRouteContext.mockReturnValue({
			session: {
				user: {
					role: "viewer",
				},
			},
		});

		const { result, rerender } = await renderHook(() => useIsAdmin());

		expect(result.current).toBe(false);

		useRouteContext.mockReturnValue({
			session: {
				user: {
					role: "admin",
				},
			},
		});

		rerender();

		await vi.waitFor(() => {
			expect(result.current).toBe(true);
		});
	});
});
