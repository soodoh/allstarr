import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import QueueSummaryBar from "./queue-summary-bar";

describe("QueueSummaryBar", () => {
	const items = [
		{
			status: "downloading",
			downloadSpeed: 1_536,
			uploadSpeed: 512,
			protocol: "torrent",
		},
		{
			status: "queued",
			downloadSpeed: 0,
			uploadSpeed: 0,
			protocol: "usenet",
		},
	];

	it("renders connection status, counts, speeds, and upload only when torrents exist", async () => {
		await renderWithProviders(
			<QueueSummaryBar
				filter="downloading"
				isConnected={false}
				items={items as never[]}
				onFilterChange={vi.fn()}
			/>,
		);

		await expect.element(page.getByText("Reconnecting...")).toBeInTheDocument();
		await expect.element(page.getByText("1.5 KB/s")).toBeInTheDocument();
		await expect.element(page.getByText("512 B/s")).toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Downloading" }))
			.toHaveClass("text-blue-400");
		await expect.element(page.getByText("—")).not.toBeInTheDocument();
	});

	it("falls back to em-dash speeds and hides upload when there are no torrents", async () => {
		await renderWithProviders(
			<QueueSummaryBar
				filter="all"
				isConnected
				items={
					[
						{
							status: "failed",
							downloadSpeed: 0,
							uploadSpeed: 0,
							protocol: "usenet",
						},
					] as never[]
				}
				onFilterChange={vi.fn()}
			/>,
		);

		await expect.element(page.getByText("—")).toBeInTheDocument();
		await expect.element(page.getByText("Upload")).not.toBeInTheDocument();
	});

	it("calls back when a filter pill is clicked", async () => {
		const onFilterChange = vi.fn();
		await renderWithProviders(
			<QueueSummaryBar
				filter="all"
				isConnected
				items={items as never[]}
				onFilterChange={onFilterChange}
			/>,
		);

		await page.getByRole("button", { name: "Failed" }).click();

		expect(onFilterChange).toHaveBeenCalledWith("failed");
	});
});
