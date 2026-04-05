import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import AppLayout from "src/components/layout/app-layout";
import NotFound from "src/components/NotFound";
import { SSEContext } from "src/hooks/sse-context";
import { useServerEvents } from "src/hooks/use-server-events";
import { getAuthSessionFn } from "src/server/middleware";
import { hasUsersFn } from "src/server/setup";

export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ location }) => {
		// Redirect to setup if no users exist
		const { hasUsers } = await hasUsersFn();
		if (!hasUsers) {
			throw redirect({ to: "/setup" });
		}

		const session = await getAuthSessionFn();
		if (!session) {
			throw redirect({
				to: "/login",
				search: { redirect: location.href },
			});
		}

		// Requester role can only access /requests
		const isRequester = session.user.role === "requester";
		const isRequestsRoute = location.pathname.startsWith("/requests");
		if (isRequester && !isRequestsRoute) {
			throw redirect({ to: "/requests" });
		}

		return { session };
	},
	component: AuthedLayout,
	notFoundComponent: NotFound,
});

function AuthedLayout() {
	const { isConnected } = useServerEvents();
	const sseValue = useMemo(() => ({ isConnected }), [isConnected]);
	return (
		<SSEContext.Provider value={sseValue}>
			<AppLayout>
				<Outlet />
			</AppLayout>
		</SSEContext.Provider>
	);
}
