import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

const systemStatusMocks = vi.hoisted(() => ({
	systemStatusQuery: vi.fn(() => ({
		queryFn: vi.fn(),
		queryKey: ["system-status"],
	})),
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			systemStatusMocks.useSuspenseQuery(...args),
	};
});

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
		<a className={className} href={to}>
			{children}
		</a>
	),
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/components/shared/loading-skeleton", () => ({
	SystemStatusSkeleton: () => <div data-testid="system-status-skeleton" />,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({ description, title }: { description: string; title: string }) => (
		<div data-testid="page-header">
			{title}:{description}
		</div>
	),
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({
		children,
		className,
		variant,
	}: {
		children: ReactNode;
		className?: string;
		variant?: string;
	}) => (
		<span className={className} data-variant={variant}>
			{children}
		</span>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => (
		<section>{children}</section>
	),
	CardContent: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
	CardHeader: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
	CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/lib/queries", () => ({
	systemStatusQuery: () => systemStatusMocks.systemStatusQuery(),
}));

import { Route } from "./status";

describe("system status route", () => {
	it("wires the loader and pending component", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = Route as unknown as {
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

		expect(systemStatusMocks.systemStatusQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["system-status"],
			}),
		);

		const pendingView = renderWithProviders(<routeConfig.pendingComponent />);
		expect(
			pendingView.getByTestId("system-status-skeleton"),
		).toBeInTheDocument();
	});

	it("renders healthy empty sections and baseline about metadata", () => {
		systemStatusMocks.useSuspenseQuery.mockReturnValue({
			data: {
				about: {
					databasePath: "/data/allstarr.db",
					databaseSize: 0,
					isDocker: false,
					osInfo: "Linux",
					runtimeVersion: "1.2.3",
					sqliteVersion: "3.45.0",
					startTime: "2025-01-01T12:00:00.000Z",
					uptimeSeconds: 65,
					version: "0.1.0",
				},
				diskSpace: [],
				health: [],
			},
		});

		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};
		const { getByRole, getByText } = renderWithProviders(
			routeConfig.component(),
		);

		expect(
			getByText("Status:Health checks, disk space, and system information."),
		).toBeInTheDocument();
		expect(getByText("All systems healthy")).toBeInTheDocument();
		expect(getByText("No root folders configured.")).toBeInTheDocument();
		expect(getByText("DB Size")).toBeInTheDocument();
		expect(getByText("0 B")).toBeInTheDocument();
		expect(getByText("Docker")).toBeInTheDocument();
		expect(getByText("No")).toBeInTheDocument();
		expect(getByText("Uptime")).toBeInTheDocument();
		expect(getByText("1m")).toBeInTheDocument();
		expect(getByRole("link", { name: /themoviedb.org/i })).toHaveAttribute(
			"href",
			"https://www.themoviedb.org/",
		);
		expect(getByRole("link", { name: /hardcover.app/i })).toHaveAttribute(
			"href",
			"https://hardcover.app/",
		);
	});

	it("renders health errors, disk usage states, and extended about rows", () => {
		systemStatusMocks.useSuspenseQuery.mockReturnValue({
			data: {
				about: {
					databasePath: "/data/allstarr.db",
					databaseSize: 2048,
					isDocker: true,
					osInfo: "Linux x64",
					runtimeVersion: "1.2.3",
					sqliteVersion: "3.45.0",
					startTime: "2025-01-03T12:00:00.000Z",
					uptimeSeconds: 90_061,
					version: "0.2.0",
				},
				diskSpace: [
					{
						freeSpace: 5,
						path: "/critical",
						totalSpace: 100,
					},
					{
						freeSpace: 20,
						path: "/warning",
						totalSpace: 100,
					},
					{
						freeSpace: 60,
						path: "/healthy",
						totalSpace: 100,
					},
					{
						freeSpace: 0,
						path: "/empty",
						totalSpace: 0,
					},
				],
				health: [
					{
						message: "Database unreachable",
						source: "database",
						type: "error",
						wikiUrl: "https://example.com/fix-db",
					},
					{
						message: "Indexer degraded",
						source: "indexer",
						type: "warning",
						wikiUrl: null,
					},
				],
			},
		});

		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};
		const { container, getAllByText, getByRole, getByText } =
			renderWithProviders(routeConfig.component());

		expect(getByText("Database unreachable")).toBeInTheDocument();
		expect(getByText("Indexer degraded")).toBeInTheDocument();
		expect(getByText("database")).toHaveAttribute(
			"data-variant",
			"destructive",
		);
		expect(getByText("indexer")).toHaveAttribute("data-variant", "outline");
		expect(getByRole("link", { name: "Fix" })).toHaveAttribute(
			"href",
			"https://example.com/fix-db",
		);

		expect(getByText("/critical")).toBeInTheDocument();
		expect(getByText("/warning")).toBeInTheDocument();
		expect(getByText("/healthy")).toBeInTheDocument();
		expect(getByText("/empty")).toBeInTheDocument();
		expect(getByText("5 B free / 100 B total")).toBeInTheDocument();
		expect(getByText("20 B free / 100 B total")).toBeInTheDocument();
		expect(getByText("60 B free / 100 B total")).toBeInTheDocument();
		expect(getAllByText("0 B free / 0 B total").length).toBeGreaterThan(0);
		expect(container.querySelector(".bg-destructive")).not.toBeNull();
		expect(container.querySelector(".bg-yellow-500")).not.toBeNull();
		expect(container.querySelector(".bg-primary")).not.toBeNull();

		expect(getByText("2.0 KB")).toBeInTheDocument();
		expect(getByText("Yes")).toBeInTheDocument();
		expect(getByText("1d 1h 1m")).toBeInTheDocument();
		expect(getByText("0.2.0")).toBeInTheDocument();
	});
});
