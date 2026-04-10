import { type JSX, type ReactNode, useContext } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const authedRouteMocks = vi.hoisted(() => ({
	getAuthSessionFn: vi.fn(),
	hasUsersFn: vi.fn(),
	useServerEvents: vi.fn(),
}));

function OutletProbe() {
	const { isConnected } = useContext(SSEContext);

	return <div data-testid="outlet-probe">{String(isConnected)}</div>;
}

vi.mock("@tanstack/react-router", () => ({
	Outlet: () => <OutletProbe />,
	createFileRoute: () => (config: unknown) => config,
	redirect: (options: { search?: Record<string, unknown>; to: string }) =>
		options,
}));

vi.mock("src/components/layout/app-layout", () => ({
	default: ({ children }: { children: ReactNode }) => (
		<div data-testid="app-layout">{children}</div>
	),
}));

vi.mock("src/components/NotFound", () => ({
	default: () => <div data-testid="not-found" />,
}));

vi.mock("src/hooks/use-server-events", () => ({
	useServerEvents: () => authedRouteMocks.useServerEvents(),
}));

vi.mock("src/server/middleware", () => ({
	getAuthSessionFn: () => authedRouteMocks.getAuthSessionFn(),
}));

vi.mock("src/server/setup", () => ({
	hasUsersFn: () => authedRouteMocks.hasUsersFn(),
}));

import { SSEContext } from "src/hooks/sse-context";
import { Route } from "./_authed";

describe("authed route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedRouteMocks.useServerEvents.mockReturnValue({ isConnected: true });
	});

	it("redirects to setup when no users exist", async () => {
		const route = Route as unknown as {
			beforeLoad: (input: {
				location: { href: string; pathname: string };
			}) => Promise<unknown>;
		};

		authedRouteMocks.hasUsersFn.mockResolvedValueOnce({ hasUsers: false });

		await expect(
			route.beforeLoad({
				location: { href: "http://localhost/any", pathname: "/any" },
			}),
		).rejects.toMatchObject({ to: "/setup" });
		expect(authedRouteMocks.getAuthSessionFn).not.toHaveBeenCalled();
	});

	it("redirects unauthenticated users to login with the requested href", async () => {
		const route = Route as unknown as {
			beforeLoad: (input: {
				location: { href: string; pathname: string };
			}) => Promise<unknown>;
		};

		authedRouteMocks.hasUsersFn.mockResolvedValueOnce({ hasUsers: true });
		authedRouteMocks.getAuthSessionFn.mockResolvedValueOnce(null);

		await expect(
			route.beforeLoad({
				location: { href: "http://localhost/books", pathname: "/books" },
			}),
		).rejects.toMatchObject({
			search: { redirect: "http://localhost/books" },
			to: "/login",
		});
	});

	it("redirects requester users away from non-requests routes", async () => {
		const route = Route as unknown as {
			beforeLoad: (input: {
				location: { href: string; pathname: string };
			}) => Promise<unknown>;
		};

		authedRouteMocks.hasUsersFn.mockResolvedValueOnce({ hasUsers: true });
		authedRouteMocks.getAuthSessionFn.mockResolvedValueOnce({
			user: { role: "requester" },
		});

		await expect(
			route.beforeLoad({
				location: {
					href: "http://localhost/authors",
					pathname: "/authors",
				},
			}),
		).rejects.toMatchObject({ to: "/requests" });
	});

	it("returns the session for permitted users", async () => {
		const route = Route as unknown as {
			beforeLoad: (input: {
				location: { href: string; pathname: string };
			}) => Promise<{ session: { user: { role: string } } }>;
		};

		const session = { user: { role: "admin" } };
		authedRouteMocks.hasUsersFn.mockResolvedValueOnce({ hasUsers: true });
		authedRouteMocks.getAuthSessionFn.mockResolvedValueOnce(session);

		await expect(
			route.beforeLoad({
				location: { href: "http://localhost/books", pathname: "/books" },
			}),
		).resolves.toEqual({ session });
	});

	it("renders the authed layout with the SSE context value", async () => {
		const route = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = route.component;

		await renderWithProviders(<Component />);

		await expect.element(page.getByTestId("app-layout")).toBeInTheDocument();
		await expect
			.element(page.getByTestId("outlet-probe"))
			.toHaveTextContent("true");
	});
});
