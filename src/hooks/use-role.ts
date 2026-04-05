import { useRouteContext } from "@tanstack/react-router";

export function useUserRole(): string {
	const context = useRouteContext({ from: "/_authed" });
	return context.session?.user?.role || "viewer";
}

export function useIsAdmin(): boolean {
	return useUserRole() === "admin";
}
