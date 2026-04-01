import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import AppLayout from "src/components/layout/app-layout";
import NotFound from "src/components/NotFound";
import { SSEContext } from "src/hooks/sse-context";
import { useServerEvents } from "src/hooks/use-server-events";
import { getAuthSessionFn } from "src/server/middleware";

export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ location }) => {
		const session = await getAuthSessionFn();
		if (!session) {
			throw redirect({
				to: "/login",
				search: { redirect: location.href },
			});
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
