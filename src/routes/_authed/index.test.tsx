import type { JSX } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const dashboardRouteMocks = vi.hoisted(() => ({
	contentStatsQuery: vi.fn(() => ({ queryKey: ["dashboard-content-stats"] })),
	qualityBreakdownQuery: vi.fn(() => ({
		queryKey: ["dashboard-quality-breakdown"],
	})),
	recentActivityQuery: vi.fn(() => ({
		queryKey: ["dashboard-recent-activity"],
	})),
	storageQuery: vi.fn(() => ({ queryKey: ["dashboard-storage"] })),
	systemStatusQuery: vi.fn(() => ({ queryKey: ["system-status"] })),
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			dashboardRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
	redirect: (options: { to: string }) => options,
}));

vi.mock("src/components/dashboard/activity-feed", () => ({
	default: () => <div data-testid="activity-feed" />,
}));

vi.mock("src/components/dashboard/content-type-card", () => ({
	CONTENT_CONFIGS: [
		{ key: "books", title: "Books" },
		{ key: "movies", title: "Movies" },
	],
	default: ({ config }: { config: { title: string } }) => (
		<div data-testid="content-type-card">{config.title}</div>
	),
}));

vi.mock("src/components/dashboard/summary-row", () => ({
	default: () => <div data-testid="summary-row" />,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({
		description,
		title,
	}: {
		description?: string;
		title: string;
	}) => (
		<header data-testid="page-header">
			<div data-testid="page-header-title">{title}</div>
			{description ? (
				<div data-testid="page-header-description">{description}</div>
			) : null}
		</header>
	),
}));

vi.mock("src/lib/queries", () => ({
	dashboardContentStatsQuery: () => dashboardRouteMocks.contentStatsQuery(),
	dashboardQualityBreakdownQuery: () =>
		dashboardRouteMocks.qualityBreakdownQuery(),
	dashboardRecentActivityQuery: () => dashboardRouteMocks.recentActivityQuery(),
	dashboardStorageQuery: () => dashboardRouteMocks.storageQuery(),
}));

vi.mock("src/lib/queries/system-status", () => ({
	systemStatusQuery: () => dashboardRouteMocks.systemStatusQuery(),
}));

import { Route } from "./index";

describe("dashboard route", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		dashboardRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey?: Array<string> }) => {
				switch (query.queryKey?.[0]) {
					case "dashboard-content-stats":
						return { data: { books: { total: 3 }, movies: { total: 2 } } };
					case "dashboard-quality-breakdown":
						return { data: { books: {}, movies: {} } };
					case "dashboard-recent-activity":
						return { data: [] };
					case "dashboard-storage":
						return {
							data: {
								byContentType: [
									{ contentType: "Books", totalSize: 100 },
									{ contentType: "Movies", totalSize: 200 },
								],
								totalCapacity: 1000,
							},
						};
					default:
						return { data: {} };
				}
			},
		);
	});

	it("redirects requesters away from the dashboard", async () => {
		const route = Route as unknown as {
			beforeLoad: (input: {
				context: { session: { user: { role?: string | null } } };
			}) => Promise<unknown>;
		};

		await expect(
			route.beforeLoad({
				context: { session: { user: { role: "requester" } } },
			}),
		).rejects.toMatchObject({ to: "/requests" });
	});

	it("wires the loader and renders the dashboard shell", async () => {
		const ensureQueryData = vi.fn();
		const route = Route as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<void>;
		};

		await route.loader({
			context: { queryClient: { ensureQueryData } },
		});

		expect(dashboardRouteMocks.contentStatsQuery).toHaveBeenCalledTimes(1);
		expect(dashboardRouteMocks.qualityBreakdownQuery).toHaveBeenCalledTimes(1);
		expect(dashboardRouteMocks.storageQuery).toHaveBeenCalledTimes(1);
		expect(dashboardRouteMocks.recentActivityQuery).toHaveBeenCalledTimes(1);
		expect(dashboardRouteMocks.systemStatusQuery).toHaveBeenCalledTimes(1);

		const Component = route.component;
		await renderWithProviders(<Component />);

		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("Dashboard");
		await expect.element(page.getByTestId("summary-row")).toBeInTheDocument();
		await expect.element(page.getByTestId("activity-feed")).toBeInTheDocument();
		await expect
			.poll(
				() =>
					document.querySelectorAll('[data-testid="content-type-card"]').length,
			)
			.toBe(2);
	});
});
