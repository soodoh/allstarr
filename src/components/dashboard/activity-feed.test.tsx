import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const activityFeedMocks = vi.hoisted(() => ({
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: activityFeedMocks.useSuspenseQuery,
	};
});

vi.mock("src/lib/queries", () => ({
	dashboardRecentActivityQuery: () => ({
		queryKey: ["dashboard", "recentActivity"],
	}),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		...props
	}: React.ComponentPropsWithoutRef<"a"> & { to: string }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

import ActivityFeed from "./activity-feed";

describe("ActivityFeed", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders nothing when there is no recent activity", async () => {
		activityFeedMocks.useSuspenseQuery.mockReturnValue({ data: [] });

		const { container } = await renderWithProviders(<ActivityFeed />);

		expect(container).toBeEmptyDOMElement();
	});

	it("renders activity rows and falls back for unknown events and items", async () => {
		activityFeedMocks.useSuspenseQuery.mockReturnValue({
			data: [
				{
					id: 1,
					itemName: "Dune",
					eventType: "movieAdded",
					date: Date.now() - 60_000,
					contentType: "movie",
				},
				{
					id: 2,
					itemName: null,
					eventType: "mysteryEvent",
					date: Date.now() - 120_000,
					contentType: "book",
				},
			],
		});

		await renderWithProviders(<ActivityFeed />);

		await expect.element(page.getByText("Recent Activity")).toBeInTheDocument();
		await expect.element(page.getByText("Dune")).toBeInTheDocument();
		await expect.element(page.getByText(/was added/)).toBeInTheDocument();
		await expect.element(page.getByText("Unknown item")).toBeInTheDocument();
		await expect
			.element(page.getByText(/was mysteryEvent/))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: "View all activity →" }))
			.toHaveAttribute("href", "/activity/history");
	});
});
