import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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
	it("renders the empty state prompt for an empty library slice", async () => {
		await renderWithProviders(
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

		await expect
			.element(page.getByText(/No books in your library yet\./))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: "Search Books →" }))
			.toHaveAttribute("href", "/books/add");
	});

	it("renders stats, quality, storage, and recent items for populated content", async () => {
		await renderWithProviders(
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

		await expect
			.element(page.getByRole("link", { name: "View all →" }))
			.toHaveAttribute("href", "/movies");
		await expect.element(page.getByText("Movies")).toBeInTheDocument();
		await expect.element(page.getByText("12")).toBeInTheDocument();
		await expect.element(page.getByText("10")).toBeInTheDocument();
		await expect.element(page.getByText("3")).toBeInTheDocument();
		await expect
			.element(page.getByText("Quality Breakdown"))
			.toBeInTheDocument();
		await expect.element(page.getByText("4K (75%)")).toBeInTheDocument();
		await expect.element(page.getByText("HD (25%)")).toBeInTheDocument();
		await expect.element(page.getByText("1 GB / 2 GB")).toBeInTheDocument();
		await expect.element(page.getByText("Heat")).toBeInTheDocument();
		await expect.element(page.getByText("Unknown")).toBeInTheDocument();
	});

	it("renders the shows stat ordering without optional sections", async () => {
		await renderWithProviders(
			<ContentTypeCard
				config={CONTENT_CONFIGS[1]}
				stats={{
					total: 7,
					monitored: 6,
					fileCount: 9,
					extra: { label: "Episodes", value: 4 },
				}}
				qualityBreakdown={[]}
				recentItems={[]}
				storageBytes={0}
				storageTotalBytes={0}
			/>,
		);

		await expect
			.element(page.getByRole("link", { name: "View all →" }))
			.toHaveAttribute("href", "/tv");
		await expect
			.element(page.getByText("Quality Breakdown"))
			.not.toBeInTheDocument();
		await expect.element(page.getByText("Storage")).not.toBeInTheDocument();
		await expect
			.element(page.getByText("Recently Added"))
			.not.toBeInTheDocument();
		await expect.element(page.getByText("7")).toBeInTheDocument();
		await expect.element(page.getByText("4")).toBeInTheDocument();
		await expect.element(page.getByText("9")).toBeInTheDocument();
	});
});
