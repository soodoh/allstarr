import type { PropsWithChildren } from "react";
import { render } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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

	it("wraps the page with tooltip and sidebar providers", async () => {
		await render(
			<AppLayout>
				<div>Library content</div>
			</AppLayout>,
		);

		const tooltipProvider = page.getByTestId("tooltip-provider");
		await expect.element(tooltipProvider).toBeInTheDocument();
		await expect
			.element(page.getByTestId("sidebar-provider"))
			.toBeInTheDocument();
		await expect.element(page.getByRole("main")).toBeInTheDocument();
		await expect.element(page.getByTestId("app-sidebar")).toBeInTheDocument();
		await expect.element(page.getByTestId("layout-header")).toBeInTheDocument();
		await expect.element(page.getByText("Library content")).toBeInTheDocument();
		expect(layoutMocks.tooltipProvider).toHaveBeenCalledTimes(1);
		expect(layoutMocks.sidebarProvider).toHaveBeenCalledTimes(1);
		expect(layoutMocks.appSidebar).toHaveBeenCalledTimes(1);
		expect(layoutMocks.header).toHaveBeenCalledTimes(1);
	});
});
