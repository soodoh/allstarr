import type { JSX } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const rootRouteMocks = vi.hoisted(() => ({
	HeadContent: () => <div data-testid="head-content" />,
	Outlet: () => <div data-testid="outlet" />,
	Scripts: () => <div data-testid="scripts" />,
}));

vi.mock("@tanstack/react-router", () => ({
	HeadContent: rootRouteMocks.HeadContent,
	Outlet: rootRouteMocks.Outlet,
	Scripts: rootRouteMocks.Scripts,
	createRootRouteWithContext: () => (config: unknown) => config,
}));

vi.mock("src/styles/app.css?url", () => ({
	default: "/assets/app.css",
}));

vi.mock("src/components/ui/sonner", () => ({
	default: () => <div data-testid="toaster" />,
}));

import NotFound from "src/components/NotFound";

import { Route } from "./__root";

describe("root route", () => {
	it("declares the expected head metadata and assets", () => {
		const routeConfig = Route as unknown as {
			head: () => {
				meta: Array<Record<string, string>>;
				links: Array<Record<string, string>>;
			};
			notFoundComponent: unknown;
		};
		const head = routeConfig.head();

		expect(head.meta).toEqual([
			{ charSet: "utf8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Allstarr" },
		]);
		expect(head.links).toEqual([
			{ rel: "icon", href: "/favicon.ico", sizes: "48x48" },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
			{ rel: "manifest", href: "/site.webmanifest" },
			{ rel: "stylesheet", href: "/assets/app.css" },
		]);
		expect(routeConfig.notFoundComponent).toBe(NotFound);
	});

	it("renders the root document with outlet, toaster, and scripts", () => {
		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};
		const markup = renderToStaticMarkup(routeConfig.component());

		expect(markup).toContain('<html lang="en" class="dark">');
		expect(markup).toContain('<div data-testid="head-content"></div>');
		expect(markup).toContain('<div data-testid="outlet"></div>');
		expect(markup).toContain('<div data-testid="toaster"></div>');
		expect(markup).toContain('<div data-testid="scripts"></div>');
	});
});
