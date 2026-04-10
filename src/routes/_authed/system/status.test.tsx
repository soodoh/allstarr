import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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

		const PendingComponent = routeConfig.pendingComponent;
		await renderWithProviders(<PendingComponent />);
		await expect
			.element(page.getByTestId("system-status-skeleton"))
			.toBeInTheDocument();
	});

	it("renders healthy empty sections and baseline about metadata", async () => {
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
		await renderWithProviders(routeConfig.component());

		await expect
			.element(
				page.getByText(
					"Status:Health checks, disk space, and system information.",
				),
			)
			.toBeInTheDocument();
		await expect
			.element(page.getByText("All systems healthy"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("No root folders configured."))
			.toBeInTheDocument();
		await expect.element(page.getByText("DB Size")).toBeInTheDocument();
		await expect.element(page.getByText("0 B")).toBeInTheDocument();
		await expect.element(page.getByText("Docker")).toBeInTheDocument();
		await expect
			.element(page.getByText("No", { exact: true }))
			.toBeInTheDocument();
		await expect.element(page.getByText("Uptime")).toBeInTheDocument();
		await expect.element(page.getByText("1m")).toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: /themoviedb.org/i }))
			.toHaveAttribute("href", "https://www.themoviedb.org/");
		await expect
			.element(page.getByRole("link", { name: /hardcover.app/i }))
			.toHaveAttribute("href", "https://hardcover.app/");
	});

	it("renders health errors, disk usage states, and extended about rows", async () => {
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
		await renderWithProviders(routeConfig.component());

		await expect
			.element(page.getByText("Database unreachable"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Indexer degraded"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("database", { exact: true }))
			.toHaveAttribute("data-variant", "destructive");
		await expect
			.element(page.getByText("indexer", { exact: true }))
			.toHaveAttribute("data-variant", "outline");
		await expect
			.element(page.getByRole("link", { name: "Fix" }))
			.toHaveAttribute("href", "https://example.com/fix-db");

		await expect.element(page.getByText("/critical")).toBeInTheDocument();
		await expect.element(page.getByText("/warning")).toBeInTheDocument();
		await expect.element(page.getByText("/healthy")).toBeInTheDocument();
		await expect.element(page.getByText("/empty")).toBeInTheDocument();
		await expect
			.element(page.getByText("5 B free / 100 B total"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("20 B free / 100 B total"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("60 B free / 100 B total"))
			.toBeInTheDocument();
		expect(
			Array.from(document.querySelectorAll("*")).filter(
				(element) =>
					element.children.length === 0 &&
					element.textContent === "0 B free / 0 B total",
			).length,
		).toBeGreaterThan(0);
		expect(document.querySelector(".bg-destructive")).not.toBeNull();
		expect(document.querySelector(".bg-yellow-500")).not.toBeNull();
		expect(document.querySelector(".bg-primary")).not.toBeNull();

		await expect.element(page.getByText("2.0 KB")).toBeInTheDocument();
		await expect.element(page.getByText("Yes")).toBeInTheDocument();
		await expect.element(page.getByText("1d 1h 1m")).toBeInTheDocument();
		await expect.element(page.getByText("0.2.0")).toBeInTheDocument();
	});
});
