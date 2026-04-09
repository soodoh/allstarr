import { renderHook, renderWithProviders } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const sidebarMocks = vi.hoisted(() => ({
	cookieSet: vi.fn(),
	isMobile: false,
}));

vi.mock("src/hooks/use-mobile", () => ({
	useIsMobile: () => sidebarMocks.isMobile,
}));

vi.mock("src/components/ui/sheet", () => ({
	Sheet: ({ children, open }: React.PropsWithChildren<{ open?: boolean }>) => (
		<div data-open={String(open)} data-testid="sheet-root">
			{children}
		</div>
	),
	SheetContent: ({
		children,
		side,
		...props
	}: React.PropsWithChildren<{ side?: string }>) => (
		<div data-side={side} data-testid="sheet-content" {...props}>
			{children}
		</div>
	),
	SheetDescription: ({ children }: React.PropsWithChildren) => (
		<div data-testid="sheet-description">{children}</div>
	),
	SheetHeader: ({
		children,
		className,
	}: React.PropsWithChildren<{ className?: string }>) => (
		<div className={className} data-testid="sheet-header">
			{children}
		</div>
	),
	SheetTitle: ({ children }: React.PropsWithChildren) => (
		<div data-testid="sheet-title">{children}</div>
	),
}));

vi.mock("src/components/ui/tooltip", () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => (
		<div data-testid="tooltip-root">{children}</div>
	),
	TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TooltipContent: ({
		children,
		hidden,
		...props
	}: React.PropsWithChildren<{ hidden?: boolean }>) => (
		<div data-hidden={String(hidden)} data-testid="tooltip-content" {...props}>
			{children}
		</div>
	),
	TooltipProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	useSidebar,
} from "./sidebar";

function SidebarProbe() {
	const sidebar = useSidebar();

	return (
		<div>
			<span data-testid="sidebar-state">{sidebar.state}</span>
			<span data-testid="sidebar-open">{String(sidebar.open)}</span>
			<span data-testid="sidebar-mobile">{String(sidebar.isMobile)}</span>
			<span data-testid="sidebar-mobile-open">
				{String(sidebar.openMobile)}
			</span>
			<button onClick={() => sidebar.toggleSidebar()} type="button">
				Toggle
			</button>
			<button onClick={() => sidebar.setOpen(false)} type="button">
				Close
			</button>
		</div>
	);
}

describe("Sidebar primitives", () => {
	beforeEach(() => {
		sidebarMocks.cookieSet.mockReset();
		sidebarMocks.isMobile = false;
		Object.defineProperty(globalThis, "cookieStore", {
			configurable: true,
			value: { set: sidebarMocks.cookieSet },
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("throws when useSidebar is used outside the provider", async () => {
		await expect(renderHook(() => useSidebar())).rejects.toThrow(
			"useSidebar must be used within a SidebarProvider.",
		);
	});

	it("toggles desktop state from the keyboard shortcut and persists the cookie", async () => {
		await renderWithProviders(
			<SidebarProvider>
				<SidebarProbe />
			</SidebarProvider>,
		);

		await expect
			.element(page.getByTestId("sidebar-state"))
			.toHaveTextContent("expanded");
		await expect
			.element(page.getByTestId("sidebar-open"))
			.toHaveTextContent("true");
		await expect
			.element(page.getByTestId("sidebar-mobile"))
			.toHaveTextContent("false");

		document.dispatchEvent(
			new KeyboardEvent("keydown", { ctrlKey: true, key: "x", bubbles: true }),
		);

		await expect
			.element(page.getByTestId("sidebar-state"))
			.toHaveTextContent("expanded");

		document.dispatchEvent(
			new KeyboardEvent("keydown", { ctrlKey: true, key: "b", bubbles: true }),
		);

		await expect
			.element(page.getByTestId("sidebar-state"))
			.toHaveTextContent("collapsed");
		await expect
			.element(page.getByTestId("sidebar-open"))
			.toHaveTextContent("false");
		expect(sidebarMocks.cookieSet).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "sidebar_state",
				value: "false",
				path: "/",
			}),
		);
	});

	it("uses the controlled open handler instead of mutating internal desktop state", async () => {
		const onOpenChange = vi.fn();
		await renderWithProviders(
			<SidebarProvider onOpenChange={onOpenChange} open={false}>
				<SidebarProbe />
			</SidebarProvider>,
		);

		await page.getByRole("button", { name: "Toggle" }).click();

		expect(onOpenChange).toHaveBeenCalledWith(true);
		await expect
			.element(page.getByTestId("sidebar-state"))
			.toHaveTextContent("collapsed");
	});

	it("accepts direct boolean setOpen values", async () => {
		await renderWithProviders(
			<SidebarProvider>
				<SidebarProbe />
			</SidebarProvider>,
		);

		await page.getByRole("button", { name: "Close" }).click();

		await expect
			.element(page.getByTestId("sidebar-open"))
			.toHaveTextContent("false");
		await expect
			.element(page.getByTestId("sidebar-state"))
			.toHaveTextContent("collapsed");
	});

	it("renders the mobile sheet variant and toggles openMobile state", async () => {
		sidebarMocks.isMobile = true;
		await renderWithProviders(
			<SidebarProvider>
				<SidebarProbe />
				<Sidebar side="right">
					<SidebarHeader>Header</SidebarHeader>
				</Sidebar>
			</SidebarProvider>,
		);

		await expect
			.element(page.getByTestId("sheet-root"))
			.toHaveAttribute("data-open", "false");
		await page.getByRole("button", { name: "Toggle" }).click();
		await expect
			.element(page.getByTestId("sheet-root"))
			.toHaveAttribute("data-open", "true");
		await expect
			.element(page.getByTestId("sidebar-mobile-open"))
			.toHaveTextContent("true");
		await expect
			.element(page.getByTestId("sheet-content"))
			.toHaveAttribute("data-mobile", "true");
		await expect
			.element(page.getByTestId("sheet-content"))
			.toHaveAttribute("data-side", "right");
		await expect.element(page.getByText("Header")).toBeInTheDocument();
		await expect
			.element(page.getByTestId("sheet-title"))
			.toHaveTextContent("Sidebar");
		await expect
			.element(page.getByTestId("sheet-description"))
			.toHaveTextContent("Displays the mobile sidebar.");
	});

	it("renders the desktop structural slots for icon-collapsed floating sidebars", async () => {
		const { container } = await renderWithProviders(
			<SidebarProvider defaultOpen={false}>
				<Sidebar side="right" variant="floating">
					<SidebarContent>Body</SidebarContent>
				</Sidebar>
			</SidebarProvider>,
		);

		const sidebar = container.querySelector('[data-slot="sidebar"]');
		const gap = container.querySelector('[data-slot="sidebar-gap"]');
		const inner = container.querySelector('[data-slot="sidebar-inner"]');

		expect(sidebar).toHaveAttribute("data-state", "collapsed");
		expect(sidebar).toHaveAttribute("data-collapsible", "offcanvas");
		expect(sidebar).toHaveAttribute("data-side", "right");
		expect(sidebar).toHaveAttribute("data-variant", "floating");
		expect(gap).toBeInTheDocument();
		expect(inner).toBeInTheDocument();
		expect(
			container.querySelector('[data-slot="sidebar-content"]'),
		).toHaveTextContent("Body");
	});

	it("renders left-side inset desktop sidebars while expanded", async () => {
		const { container } = await renderWithProviders(
			<SidebarProvider defaultOpen>
				<Sidebar side="left" variant="inset" collapsible="icon">
					<SidebarContent>Inset body</SidebarContent>
				</Sidebar>
			</SidebarProvider>,
		);

		const sidebar = container.querySelector('[data-slot="sidebar"]');

		expect(sidebar).toHaveAttribute("data-state", "expanded");
		expect(sidebar).toHaveAttribute("data-collapsible", "");
		expect(sidebar).toHaveAttribute("data-side", "left");
		expect(sidebar).toHaveAttribute("data-variant", "inset");
		expect(
			container.querySelector('[data-slot="sidebar-container"]'),
		).toBeInTheDocument();
	});

	it("renders the default desktop sidebar variant branch", async () => {
		const { container } = await renderWithProviders(
			<SidebarProvider defaultOpen={false}>
				<Sidebar collapsible="icon">
					<SidebarContent>Default body</SidebarContent>
				</Sidebar>
			</SidebarProvider>,
		);

		expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
			"data-variant",
			"sidebar",
		);
		expect(
			container.querySelector('[data-slot="sidebar-container"]'),
		).toBeInTheDocument();
	});

	it("renders the non-collapsible variant and the menu helper primitives", async () => {
		const { container } = await renderWithProviders(
			<SidebarProvider defaultOpen={false}>
				<Sidebar collapsible="none">
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton isActive size="lg" tooltip="Library">
										<span>Library</span>
									</SidebarMenuButton>
									<SidebarMenuSub>
										<SidebarMenuSubItem>
											<SidebarMenuSubButton isActive size="sm">
												Child
											</SidebarMenuSubButton>
										</SidebarMenuSubItem>
									</SidebarMenuSub>
								</SidebarMenuItem>
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</Sidebar>
			</SidebarProvider>,
		);

		expect(container.querySelector('[data-slot="sidebar"]')).toHaveTextContent(
			"Library",
		);
		await expect
			.element(page.getByRole("button", { name: "Library" }))
			.toHaveAttribute("data-active", "true");
		await expect
			.element(page.getByRole("button", { name: "Library" }))
			.toHaveAttribute("data-size", "lg");
		await expect
			.element(page.getByTestId("tooltip-content"))
			.toHaveAttribute("data-hidden", "false");
		expect(
			container.querySelector('[data-slot="sidebar-menu-sub"]'),
		).toBeInTheDocument();
		expect(
			container.querySelector('[data-slot="sidebar-menu-sub-button"]'),
		).toHaveAttribute("data-size", "sm");
		expect(
			container.querySelector('[data-slot="sidebar-menu-sub-button"]'),
		).toHaveAttribute("data-active", "true");
	});

	it("returns the plain button when no tooltip is provided", async () => {
		await renderWithProviders(
			<SidebarProvider>
				<SidebarMenuButton>Plain</SidebarMenuButton>
			</SidebarProvider>,
		);

		await expect
			.element(page.getByTestId("tooltip-content"))
			.not.toBeInTheDocument();
	});

	it("accepts tooltip props objects and hides them when expanded", async () => {
		await renderWithProviders(
			<SidebarProvider>
				<SidebarMenuButton
					tooltip={{ children: "More info", className: "custom-tooltip" }}
				>
					Info
				</SidebarMenuButton>
			</SidebarProvider>,
		);

		await expect
			.element(page.getByTestId("tooltip-content"))
			.toHaveTextContent("More info");
		await expect
			.element(page.getByTestId("tooltip-content"))
			.toHaveClass("custom-tooltip");
		await expect
			.element(page.getByTestId("tooltip-content"))
			.toHaveAttribute("data-hidden", "true");
	});

	it("supports asChild menu buttons and sub-buttons with outline and md variants", async () => {
		const { container } = await renderWithProviders(
			<SidebarProvider defaultOpen={false}>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							tooltip={{ children: "Docs tip" }}
							variant="outline"
						>
							<a href="/docs">Docs</a>
						</SidebarMenuButton>
						<SidebarMenuSub>
							<SidebarMenuSubItem>
								<SidebarMenuSubButton asChild size="md">
									<a href="/docs/child">Child docs</a>
								</SidebarMenuSubButton>
							</SidebarMenuSubItem>
						</SidebarMenuSub>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarProvider>,
		);

		const docsLink = container.querySelector(
			'[data-slot="sidebar-menu-button"]',
		);
		const childLink = container.querySelector(
			'[data-slot="sidebar-menu-sub-button"]',
		);

		expect(docsLink).toHaveAttribute("data-slot", "sidebar-menu-button");
		expect(docsLink).toHaveAttribute("data-size", "default");
		expect(childLink).toHaveAttribute("data-slot", "sidebar-menu-sub-button");
		expect(childLink).toHaveAttribute("data-size", "md");
		await expect
			.element(page.getByTestId("tooltip-content"))
			.toHaveTextContent("Docs tip");
		await expect
			.element(page.getByTestId("tooltip-content"))
			.toHaveAttribute("data-hidden", "false");
	});
});
