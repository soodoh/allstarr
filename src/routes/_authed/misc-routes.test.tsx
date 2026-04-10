import type { ComponentType, JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const miscRouteMocks = vi.hoisted(() => ({
	historyListQuery: vi.fn(() => ({
		queryFn: vi.fn(),
		queryKey: ["history", "list"],
	})),
	systemNavItems: [
		{
			description:
				"Health checks, disk space, and system information at a glance.",
			icon: ({ className }: { className?: string }) => (
				<span data-testid="system-icon-status" data-classname={className} />
			),
			title: "Status",
			to: "/system/status",
		},
		{
			description:
				"Scheduled background tasks like metadata refresh, health checks, and backups.",
			icon: ({ className }: { className?: string }) => (
				<span data-testid="system-icon-tasks" data-classname={className} />
			),
			title: "Tasks",
			to: "/system/tasks",
		},
		{
			description:
				"View a log of all events - books added, updated, deleted, and more.",
			icon: ({ className }: { className?: string }) => (
				<span data-testid="system-icon-events" data-classname={className} />
			),
			title: "Events",
			to: "/system/events",
		},
	],
	userSettingsQuery: vi.fn((tableId: string) => ({
		queryFn: vi.fn(),
		queryKey: ["user-settings", tableId],
	})),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		className,
		to,
	}: {
		children: ReactNode;
		className?: string;
		to: string;
	}) => (
		<a href={to} className={className} data-testid={`link-${to}`}>
			{children}
		</a>
	),
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({
		description,
		title,
	}: {
		description?: string;
		title: string;
	}) => (
		<div data-testid="page-header">
			<span data-testid="page-header-title">{title}</span>
			{description ? (
				<span data-testid="page-header-description">{description}</span>
			) : null}
		</div>
	),
}));

vi.mock("src/components/shared/empty-state", () => ({
	default: ({
		description,
		icon: Icon,
		title,
	}: {
		description: string;
		icon: ComponentType<{ className?: string }>;
		title: string;
	}) => (
		<div data-testid="empty-state">
			<Icon className="empty-state-icon" />
			<span data-testid="empty-state-title">{title}</span>
			<span data-testid="empty-state-description">{description}</span>
		</div>
	),
}));

vi.mock("src/components/movies/tmdb-movie-search", () => ({
	default: () => <div data-testid="tmdb-movie-search" />,
}));

vi.mock("src/components/activity/history-tab", () => ({
	default: () => <div data-testid="history-tab" />,
}));

vi.mock("src/components/shared/loading-skeleton", () => ({
	TableSkeleton: () => <div>TableSkeleton</div>,
}));

vi.mock("src/components/tv/tmdb-show-search", () => ({
	default: () => <div data-testid="tmdb-show-search" />,
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => (
		<section className={className} data-testid="card">
			{children}
		</section>
	),
	CardContent: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => (
		<div className={className} data-testid="card-content">
			{children}
		</div>
	),
	CardDescription: ({ children }: { children: ReactNode }) => (
		<p data-testid="card-description">{children}</p>
	),
	CardHeader: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => (
		<header className={className} data-testid="card-header">
			{children}
		</header>
	),
	CardTitle: ({ children }: { children: ReactNode }) => (
		<h2 data-testid="card-title">{children}</h2>
	),
}));

vi.mock("src/lib/nav-config", () => ({
	systemNavItems: miscRouteMocks.systemNavItems,
}));

vi.mock("src/lib/queries", () => ({
	historyListQuery: () => miscRouteMocks.historyListQuery(),
}));

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (...args: unknown[]) =>
		miscRouteMocks.userSettingsQuery(args[0] as string),
}));

import { Route as AddMovieRoute } from "./movies/add";
import { Route as RequestsRoute } from "./requests/index";
import { Route as EventsRoute } from "./system/events";
import { Route as SystemRoute } from "./system/index";
import { Route as AddShowRoute } from "./tv/add";

describe("misc authed routes", () => {
	it("renders the requests page shell", async () => {
		const routeConfig = RequestsRoute as unknown as {
			component: () => JSX.Element;
		};
		await renderWithProviders(routeConfig.component());

		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("Requests");
		await expect
			.element(page.getByTestId("page-header-description"))
			.toHaveTextContent("Request books, movies, and more.");
		await expect
			.element(page.getByTestId("empty-state-title"))
			.toHaveTextContent("Coming Soon");
		await expect
			.element(page.getByTestId("empty-state-description"))
			.toHaveTextContent(
				"The requests feature is under development. Check back later!",
			);
		expect(document.querySelector("svg.lucide-book-open")).not.toBeNull();
	});

	it("wires the movie add loader and page composition", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = AddMovieRoute as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown> | unknown;
		};

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(miscRouteMocks.userSettingsQuery).toHaveBeenCalledWith("movies");
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["user-settings", "movies"],
			}),
		);

		await renderWithProviders(routeConfig.component());

		await expect
			.element(page.getByTestId("link-/movies"))
			.toHaveTextContent("Back to Movies");
		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("Add Movie");
		await expect.element(page.getByText("Search TMDB")).toBeInTheDocument();
		await expect
			.element(page.getByTestId("tmdb-movie-search"))
			.toBeInTheDocument();
	});

	it("wires the tv add loader and page composition", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = AddShowRoute as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown> | unknown;
		};

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(miscRouteMocks.userSettingsQuery).toHaveBeenCalledWith("tv");
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["user-settings", "tv"],
			}),
		);

		await renderWithProviders(routeConfig.component());

		await expect
			.element(page.getByTestId("link-/tv"))
			.toHaveTextContent("Back to TV Shows");
		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("Add TV Show");
		await expect.element(page.getByText("Search TMDB")).toBeInTheDocument();
		await expect
			.element(page.getByTestId("tmdb-show-search"))
			.toBeInTheDocument();
	});

	it("renders the system page cards from nav config", async () => {
		const routeConfig = SystemRoute as unknown as {
			component: () => JSX.Element;
		};
		await renderWithProviders(routeConfig.component());

		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("System");
		await expect
			.element(page.getByTestId("page-header-description"))
			.toHaveTextContent("Monitor activity and manage system-level features.");

		for (const item of miscRouteMocks.systemNavItems) {
			await expect
				.element(page.getByTestId(`link-${item.to}`))
				.toHaveTextContent(item.title);
			await expect
				.element(page.getByText(item.description))
				.toBeInTheDocument();
		}

		await expect
			.element(page.getByTestId("system-icon-status"))
			.toHaveAttribute("data-classname", "h-6 w-6 text-primary");
		await expect
			.element(page.getByTestId("system-icon-tasks"))
			.toHaveAttribute("data-classname", "h-6 w-6 text-primary");
		await expect
			.element(page.getByTestId("system-icon-events"))
			.toHaveAttribute("data-classname", "h-6 w-6 text-primary");
	});

	it("wires the system events loader and page shell", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = EventsRoute as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown> | unknown;
			pendingComponent: () => JSX.Element;
		};

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(miscRouteMocks.historyListQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["history", "list"],
			}),
		);

		const PendingComponent = routeConfig.pendingComponent;
		await renderWithProviders(<PendingComponent />);
		await expect.element(page.getByText("TableSkeleton")).toBeInTheDocument();

		await renderWithProviders(routeConfig.component());
		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("Events");
		await expect
			.element(page.getByText(/View a log of all events/))
			.toBeInTheDocument();
		await expect.element(page.getByTestId("history-tab")).toBeInTheDocument();
	});
});
