import type { AnyRouter } from "@tanstack/react-router";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { getQueryClient } from "./lib/query-client";
import { routeTree } from "./routeTree.gen";

export function getRouter(): AnyRouter {
	const queryClient = getQueryClient();

	const router = createRouter({
		routeTree,
		context: { queryClient },
		scrollRestoration: true,
		defaultPreload: "intent",
	});

	setupRouterSsrQueryIntegration({ router, queryClient });

	return router;
}
