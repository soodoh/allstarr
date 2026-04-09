import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

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

	it("renders nothing when there is no recent activity", () => {
		activityFeedMocks.useSuspenseQuery.mockReturnValue({ data: [] });

		const { container } = renderWithProviders(<ActivityFeed />);

		expect(container).toBeEmptyDOMElement();
	});

	it("renders activity rows and falls back for unknown events and items", () => {
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

		const { getByRole, getByText } = renderWithProviders(<ActivityFeed />);

		expect(getByText("Recent Activity")).toBeInTheDocument();
		expect(getByText("Dune")).toBeInTheDocument();
		expect(getByText(/was added/)).toBeInTheDocument();
		expect(getByText("Unknown item")).toBeInTheDocument();
		expect(getByText(/was mysteryEvent/)).toBeInTheDocument();
		expect(getByRole("link", { name: "View all activity →" })).toHaveAttribute(
			"href",
			"/activity/history",
		);
	});
});
