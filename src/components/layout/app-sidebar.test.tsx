import { render, screen, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@tanstack/react-query", () => ({
	useQuery: appSidebarMocks.useQuery,
}));

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

	it("shows admin navigation, active nested links, and positive count badges", () => {
		Object.assign(appSidebarMocks.state, {
			pathname: "/settings/users",
			role: "admin",
			unmappedCount: 2,
			queueCount: 5,
		});

		render(<AppSidebar />);

		expect(
			screen.getByRole("link", { name: /^Library\s*2$/ }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /^Activity\s*5$/ }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "System" })).toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: "Requests" }),
		).not.toBeInTheDocument();

		const settingsLink = screen.getByRole("link", { name: "Settings" });
		const usersLink = screen.getByRole("link", { name: "Users" });
		const libraryLink = screen.getByRole("link", {
			name: /^Library\s*2$/,
		});
		const activityLink = screen.getByRole("link", {
			name: /^Activity\s*5$/,
		});

		expect(settingsLink.parentElement).toHaveAttribute("data-active", "true");
		expect(usersLink.parentElement).toHaveAttribute("data-active", "true");
		expect(libraryLink.parentElement).toHaveAttribute("data-active", "false");
		expect(activityLink.parentElement).toHaveAttribute("data-active", "false");
		expect(within(libraryLink).getByText("2")).toBeInTheDocument();
		expect(within(activityLink).getByText("5")).toBeInTheDocument();
	});

	it("shows requester navigation without admin groups", () => {
		Object.assign(appSidebarMocks.state, {
			pathname: "/requests",
			role: "requester",
		});

		render(<AppSidebar />);

		const requestsLink = screen.getByRole("link", { name: "Requests" });

		expect(requestsLink).toBeInTheDocument();
		expect(requestsLink.parentElement).toHaveAttribute("data-active", "true");
		expect(
			screen.queryByRole("link", { name: "Library" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: "Activity" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: "Settings" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: "System" }),
		).not.toBeInTheDocument();
	});
});
