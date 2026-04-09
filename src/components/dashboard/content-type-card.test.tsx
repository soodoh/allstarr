import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

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

import ContentTypeCard, { CONTENT_CONFIGS } from "./content-type-card";

describe("ContentTypeCard", () => {
	it("renders the empty state prompt for an empty library slice", () => {
		const { getByRole, getByText } = renderWithProviders(
			<ContentTypeCard
				config={CONTENT_CONFIGS[0]}
				stats={{
					total: 0,
					monitored: 0,
					fileCount: 0,
					extra: { label: "Authors", value: 0 },
				}}
				qualityBreakdown={[]}
				recentItems={[]}
				storageBytes={0}
				storageTotalBytes={0}
			/>,
		);

		expect(getByText(/No books in your library yet\./)).toBeInTheDocument();
		expect(getByRole("link", { name: "Search Books →" })).toHaveAttribute(
			"href",
			"/books/add",
		);
	});

	it("renders stats, quality, storage, and recent items for populated content", () => {
		const { getByRole, getByText } = renderWithProviders(
			<ContentTypeCard
				config={CONTENT_CONFIGS[2]}
				stats={{
					total: 12,
					monitored: 11,
					fileCount: 10,
					extra: { label: "Collections", value: 3 },
				}}
				qualityBreakdown={[
					{ name: "4K", count: 3 },
					{ name: "HD", count: 1 },
				]}
				recentItems={[
					{
						id: 1,
						eventType: "movieAdded",
						itemName: "Heat",
						contentType: "movie",
						date: Date.now() - 60_000,
					},
					{
						id: 2,
						eventType: "movieAdded",
						itemName: null,
						contentType: "movie",
						date: Date.now() - 3_600_000,
					},
				]}
				storageBytes={1_073_741_824}
				storageTotalBytes={2_147_483_648}
			/>,
		);

		expect(getByRole("link", { name: "View all →" })).toHaveAttribute(
			"href",
			"/movies",
		);
		expect(getByText("Movies")).toBeInTheDocument();
		expect(getByText("12")).toBeInTheDocument();
		expect(getByText("10")).toBeInTheDocument();
		expect(getByText("3")).toBeInTheDocument();
		expect(getByText("Quality Breakdown")).toBeInTheDocument();
		expect(getByText("4K (75%)")).toBeInTheDocument();
		expect(getByText("HD (25%)")).toBeInTheDocument();
		expect(getByText("1 GB / 2 GB")).toBeInTheDocument();
		expect(getByText("Heat")).toBeInTheDocument();
		expect(getByText("Unknown")).toBeInTheDocument();
	});
});
