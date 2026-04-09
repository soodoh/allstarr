import { render, screen, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const layoutMocks = vi.hoisted(() => ({
	appSidebar: vi.fn(),
	header: vi.fn(),
	sidebarProvider: vi.fn(),
	tooltipProvider: vi.fn(),
}));

vi.mock("src/components/ui/sidebar", () => ({
	SidebarProvider: ({ children }: PropsWithChildren) => {
		layoutMocks.sidebarProvider();
		return <div data-testid="sidebar-provider">{children}</div>;
	},
}));

vi.mock("src/components/ui/tooltip", () => ({
	TooltipProvider: ({ children }: PropsWithChildren) => {
		layoutMocks.tooltipProvider();
		return <div data-testid="tooltip-provider">{children}</div>;
	},
}));

vi.mock("./app-sidebar", () => ({
	default: () => {
		layoutMocks.appSidebar();
		return <aside data-testid="app-sidebar" />;
	},
}));

vi.mock("./header", () => ({
	default: () => {
		layoutMocks.header();
		return <header data-testid="layout-header" />;
	},
}));

import AppLayout from "./app-layout";

describe("AppLayout", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("wraps the page with tooltip and sidebar providers", () => {
		render(
			<AppLayout>
				<div>Library content</div>
			</AppLayout>,
		);

		const tooltipProvider = screen.getByTestId("tooltip-provider");
		const sidebarProvider =
			within(tooltipProvider).getByTestId("sidebar-provider");
		const main = screen.getByRole("main");

		expect(sidebarProvider).toContainElement(screen.getByTestId("app-sidebar"));
		expect(sidebarProvider).toContainElement(
			screen.getByTestId("layout-header"),
		);
		expect(within(main).getByText("Library content")).toBeInTheDocument();
		expect(layoutMocks.tooltipProvider).toHaveBeenCalledTimes(1);
		expect(layoutMocks.sidebarProvider).toHaveBeenCalledTimes(1);
		expect(layoutMocks.appSidebar).toHaveBeenCalledTimes(1);
		expect(layoutMocks.header).toHaveBeenCalledTimes(1);
	});
});
