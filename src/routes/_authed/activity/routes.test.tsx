import type { JSX } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const activityRouteMocks = vi.hoisted(() => ({
	blocklistListQuery: vi.fn(() => ({
		queryFn: vi.fn(),
		queryKey: ["blocklist", "list"],
	})),
	historyListQuery: vi.fn(() => ({
		queryFn: vi.fn(),
		queryKey: ["history", "list"],
	})),
	useSSEConnection: vi.fn(() => ({ isConnected: true })),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/components/activity/blocklist-tab", () => ({
	default: () => <div data-testid="blocklist-tab" />,
}));

vi.mock("src/components/activity/history-tab", () => ({
	default: () => <div data-testid="history-tab" />,
}));

vi.mock("src/components/activity/queue-tab", () => ({
	default: ({ isConnected }: { isConnected: boolean }) => (
		<div data-connected={String(isConnected)} data-testid="queue-tab" />
	),
}));

vi.mock("src/components/shared/loading-skeleton", () => ({
	TableSkeleton: () => <div data-testid="table-skeleton" />,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({ description, title }: { description: string; title: string }) => (
		<div data-testid="page-header">
			{title}:{description}
		</div>
	),
}));

vi.mock("src/hooks/sse-context", () => ({
	useSSEConnection: () => activityRouteMocks.useSSEConnection(),
}));

vi.mock("src/lib/queries", () => ({
	blocklistListQuery: () => activityRouteMocks.blocklistListQuery(),
	historyListQuery: () => activityRouteMocks.historyListQuery(),
}));

import { Route as BlocklistRoute } from "./blocklist";
import { Route as HistoryRoute } from "./history";
import { Route as QueueRoute } from "./index";

describe("activity routes", () => {
	it("renders the queue page with the SSE connection state", async () => {
		const routeConfig = QueueRoute as unknown as {
			component: () => JSX.Element;
		};
		await renderWithProviders(routeConfig.component());

		await expect
			.element(page.getByText("Queue:Active and pending downloads"))
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId("queue-tab"))
			.toHaveAttribute("data-connected", "true");
	});

	it("wires the blocklist loader, pending component, and page shell", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = BlocklistRoute as unknown as {
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
		expect(activityRouteMocks.blocklistListQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["blocklist", "list"],
			}),
		);

		const PendingComponent = routeConfig.pendingComponent;
		await renderWithProviders(<PendingComponent />);
		await expect
			.element(page.getByTestId("table-skeleton"))
			.toBeInTheDocument();

		await renderWithProviders(routeConfig.component());
		await expect
			.element(
				page.getByText("Blocklist:Releases blocked from automatic download"),
			)
			.toBeInTheDocument();
		await expect.element(page.getByTestId("blocklist-tab")).toBeInTheDocument();
	});

	it("wires the history loader, pending component, and page shell", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = HistoryRoute as unknown as {
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
		expect(activityRouteMocks.historyListQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["history", "list"],
			}),
		);

		const PendingComponent = routeConfig.pendingComponent;
		await renderWithProviders(<PendingComponent />);
		await expect
			.element(page.getByTestId("table-skeleton"))
			.toBeInTheDocument();

		await renderWithProviders(routeConfig.component());
		await expect
			.element(page.getByText("History:Activity log for your library"))
			.toBeInTheDocument();
		await expect.element(page.getByTestId("history-tab")).toBeInTheDocument();
	});
});
