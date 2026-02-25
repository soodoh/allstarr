import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAuthSessionFn } from "src/server/middleware";
import AppLayout from "src/components/layout/app-layout";
import BookDetailModalProvider from "src/components/books/book-detail-modal-provider";
import NotFound from "src/components/NotFound";

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
  return (
    <AppLayout>
      <BookDetailModalProvider>
        <Outlet />
      </BookDetailModalProvider>
    </AppLayout>
  );
}
