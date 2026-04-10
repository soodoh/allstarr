import type { PropsWithChildren } from "react";
import { render } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

type SidebarRole = "admin" | "requester" | "viewer";

const appSidebarMocks = vi.hoisted(() => {
	const state = {
		pathname: "/",
		role: "admin" as SidebarRole,
		unmappedCount: 0,
		queueCount: 0,
	};

	return {
		state,
		useQuery: vi.fn(
			(options: {
				queryKey?: unknown;
				select?: (data: unknown) => unknown;
			}) => {
				const queryKey = Array.isArray(options.queryKey)
					? options.queryKey[0]
					: options.queryKey;
				let data: unknown;

				if (queryKey === "unmapped-files-count") {
					data = state.unmappedCount;
				} else if (queryKey === "queue-list") {
					data = {
						items: Array.from({ length: state.queueCount }, (_, index) => ({
							id: index,
						})),
					};
				}

				return {
					data: options.select ? options.select(data) : data,
				};
			},
		),
	};
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();
	return {
		...actual,
		useQuery: appSidebarMocks.useQuery,
	};
});

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		className,
		to,
	}: PropsWithChildren<{ className?: string; to: string }>) => (
		<a className={className} href={to}>
			{children}
		</a>
	),
	useRouterState: () => ({
		location: {
			pathname: appSidebarMocks.state.pathname,
		},
	}),
}));

vi.mock("src/components/icons/allstarr-icon", () => ({
	default: ({ className }: { className?: string }) => (
		<span className={className} data-testid="allstarr-icon" />
	),
}));

vi.mock("src/components/ui/sidebar", () => ({
	Sidebar: ({ children }: PropsWithChildren) => <aside>{children}</aside>,
	SidebarContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SidebarGroup: ({ children }: PropsWithChildren) => (
		<section>{children}</section>
	),
	SidebarGroupContent: ({ children }: PropsWithChildren) => (
		<div>{children}</div>
	),
	SidebarHeader: ({
		children,
		className,
	}: PropsWithChildren<{ className?: string }>) => (
		<header className={className}>{children}</header>
	),
	SidebarMenu: ({ children }: PropsWithChildren) => <ul>{children}</ul>,
	SidebarMenuButton: ({
		children,
		className,
		isActive,
	}: PropsWithChildren<{ className?: string; isActive?: boolean }>) => (
		<div className={className} data-active={isActive ? "true" : "false"}>
			{children}
		</div>
	),
	SidebarMenuItem: ({ children }: PropsWithChildren) => <li>{children}</li>,
	SidebarMenuSub: ({ children }: PropsWithChildren) => <ul>{children}</ul>,
	SidebarMenuSubButton: ({
		children,
		isActive,
	}: PropsWithChildren<{ isActive?: boolean }>) => (
		<div data-active={isActive ? "true" : "false"}>{children}</div>
	),
	SidebarMenuSubItem: ({ children }: PropsWithChildren) => <li>{children}</li>,
}));

vi.mock("src/hooks/use-role", () => ({
	useUserRole: () => appSidebarMocks.state.role,
}));

vi.mock("src/lib/queries", () => ({
	unmappedFilesCountQuery: () => ({
		queryKey: ["unmapped-files-count"],
	}),
}));

vi.mock("src/lib/queries/queue", () => ({
	queueListQuery: () => ({
		queryKey: ["queue-list"],
	}),
}));

import AppSidebar from "./app-sidebar";

describe("AppSidebar", () => {
	afterEach(() => {
		vi.clearAllMocks();
		Object.assign(appSidebarMocks.state, {
			pathname: "/",
			role: "admin",
			unmappedCount: 0,
			queueCount: 0,
		});
	});

	it("shows admin navigation, active nested links, and positive count badges", async () => {
		Object.assign(appSidebarMocks.state, {
			pathname: "/settings/users",
			role: "admin",
			unmappedCount: 2,
			queueCount: 5,
		});

		await render(<AppSidebar />);

		await expect
			.element(page.getByRole("link", { name: /^Library\s*2$/ }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: /^Activity\s*5$/ }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: "Settings" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: "System" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: "Requests" }))
			.not.toBeInTheDocument();

		const settingsLink = page.getByRole("link", { name: "Settings" });
		const usersLink = page.getByRole("link", { name: "Users" });
		const libraryLink = page.getByRole("link", { name: /^Library\s*2$/ });
		const activityLink = page.getByRole("link", { name: /^Activity\s*5$/ });

		await expect.element(settingsLink).toHaveAttribute("href", "/settings");
		// Check parent data-active via DOM
		const settingsEl = await settingsLink.element();
		expect(settingsEl.parentElement).toHaveAttribute("data-active", "true");
		const usersEl = await usersLink.element();
		expect(usersEl.parentElement).toHaveAttribute("data-active", "true");
		const libraryEl = await libraryLink.element();
		expect(libraryEl.parentElement).toHaveAttribute("data-active", "false");
		const activityEl = await activityLink.element();
		expect(activityEl.parentElement).toHaveAttribute("data-active", "false");
		await expect.element(page.getByText("2")).toBeInTheDocument();
		await expect.element(page.getByText("5")).toBeInTheDocument();
	});

	it("shows requester navigation without admin groups", async () => {
		Object.assign(appSidebarMocks.state, {
			pathname: "/requests",
			role: "requester",
		});

		await render(<AppSidebar />);

		const requestsLink = page.getByRole("link", { name: "Requests" });
		await expect.element(requestsLink).toBeInTheDocument();
		const requestsEl = await requestsLink.element();
		expect(requestsEl.parentElement).toHaveAttribute("data-active", "true");
		await expect
			.element(page.getByRole("link", { name: "Library" }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: "Activity" }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: "Settings" }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: "System" }))
			.not.toBeInTheDocument();
	});

	it("falls back to the first visible group when the path does not match", async () => {
		Object.assign(appSidebarMocks.state, {
			pathname: "/totally-unknown",
			role: "viewer",
		});

		await render(<AppSidebar />);

		const libraryLink = page.getByRole("link", { name: "Library" });
		await expect.element(libraryLink).toBeInTheDocument();
		const libraryEl = await libraryLink.element();
		expect(libraryEl.parentElement).toHaveAttribute("data-active", "true");
		await expect
			.element(page.getByRole("link", { name: "Settings" }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: "Requests" }))
			.not.toBeInTheDocument();
	});

	it("keeps a child active when the path includes a trailing slash", async () => {
		Object.assign(appSidebarMocks.state, {
			pathname: "/books/",
			role: "admin",
		});

		await render(<AppSidebar />);

		const bookLinks = page.getByRole("link", { name: "Books" }).all();
		expect(bookLinks).toHaveLength(2);
		const el0 = await bookLinks[0].element();
		const el1 = await bookLinks[1].element();
		expect(el0.parentElement).toHaveAttribute("data-active", "true");
		expect(el1.parentElement).toHaveAttribute("data-active", "true");
	});
});
