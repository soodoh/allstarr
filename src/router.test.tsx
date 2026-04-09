import { describe, expect, it, vi } from "vitest";

const routerMocks = vi.hoisted(() => ({
	createRouter: vi.fn(),
	getQueryClient: vi.fn(),
	setupRouterSsrQueryIntegration: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	createRouter: routerMocks.createRouter,
}));

vi.mock("@tanstack/react-router-ssr-query", () => ({
	setupRouterSsrQueryIntegration: routerMocks.setupRouterSsrQueryIntegration,
}));

vi.mock("./lib/query-client", () => ({
	getQueryClient: routerMocks.getQueryClient,
}));

vi.mock("./routeTree.gen", () => ({
	routeTree: { id: "route-tree" },
}));

import { getRouter } from "./router";

describe("getRouter", () => {
	it("creates the router with the shared query client and wires SSR integration", () => {
		const queryClient = { id: "query-client" };
		const router = { id: "router" };

		routerMocks.getQueryClient.mockReturnValue(queryClient);
		routerMocks.createRouter.mockReturnValue(router);

		expect(getRouter()).toBe(router);
		expect(routerMocks.createRouter).toHaveBeenCalledWith({
			routeTree: { id: "route-tree" },
			context: { queryClient },
			scrollRestoration: true,
			defaultPreload: "intent",
		});
		expect(routerMocks.setupRouterSsrQueryIntegration).toHaveBeenCalledWith({
			router,
			queryClient,
		});
	});
});
