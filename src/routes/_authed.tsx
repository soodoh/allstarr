import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAuthSessionFn } from "src/server/middleware";
import AppLayout from "src/components/layout/app-layout";
import NotFound from "src/components/NotFound";
import { useServerEvents } from "src/hooks/use-server-events";

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
  useServerEvents();
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
