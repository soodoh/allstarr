import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAuthSessionFn } from "~/server/middleware";
import { AppLayout } from "~/components/layout/app-layout";

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
});

function AuthedLayout() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
