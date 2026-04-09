import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const summaryRowMocks = vi.hoisted(() => ({
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: summaryRowMocks.useSuspenseQuery,
	};
});

vi.mock("src/lib/queries", () => ({
	dashboardContentStatsQuery: () => ({
		queryKey: ["dashboard", "contentStats"],
	}),
	dashboardStorageQuery: () => ({
		queryKey: ["dashboard", "storage"],
	}),
}));

vi.mock("src/lib/queries/system-status", () => ({
	systemStatusQuery: () => ({
		queryKey: ["systemStatus", "detail"],
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

import SummaryRow from "./summary-row";

describe("SummaryRow", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders aggregate counts and a healthy system state", () => {
		summaryRowMocks.useSuspenseQuery
			.mockReturnValueOnce({
				data: {
					books: { total: 2, fileCount: 5 },
					shows: { total: 3, fileCount: 7 },
					movies: { total: 4, fileCount: 11 },
				},
			})
			.mockReturnValueOnce({
				data: {
					totalUsed: 1_073_741_824,
					totalCapacity: 2_147_483_648,
					rootFolderCount: 2,
				},
			})
			.mockReturnValueOnce({
				data: {
					health: [],
				},
			});

		const { getByRole, getByText } = renderWithProviders(<SummaryRow />);

		expect(getByText("9")).toBeInTheDocument();
		expect(getByText("23")).toBeInTheDocument();
		expect(getByText("1 GB")).toBeInTheDocument();
		expect(getByText("of 2 GB across 2 root folders")).toBeInTheDocument();
		expect(getByText("All systems healthy")).toBeInTheDocument();
		expect(getByRole("link", { name: /System Health/ })).toHaveAttribute(
			"href",
			"/system/status",
		);
	});

	it("renders issue and no-root-folder fallback messaging", () => {
		summaryRowMocks.useSuspenseQuery
			.mockReturnValueOnce({
				data: {
					books: { total: 1, fileCount: 1 },
					shows: { total: 0, fileCount: 0 },
					movies: { total: 0, fileCount: 0 },
				},
			})
			.mockReturnValueOnce({
				data: {
					totalUsed: 0,
					totalCapacity: 0,
					rootFolderCount: 0,
				},
			})
			.mockReturnValueOnce({
				data: {
					health: [{ name: "Indexer", type: "warning" }],
				},
			});

		const { getByText } = renderWithProviders(<SummaryRow />);

		expect(getByText("No root folders configured")).toBeInTheDocument();
		expect(getByText("1 issue detected")).toBeInTheDocument();
	});
});
