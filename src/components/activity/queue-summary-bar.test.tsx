import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

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

	it("renders connection status, counts, speeds, and upload only when torrents exist", () => {
		const { getAllByText, getByRole, getByText, queryByText } =
			renderWithProviders(
				<QueueSummaryBar
					filter="downloading"
					isConnected={false}
					items={items as never[]}
					onFilterChange={vi.fn()}
				/>,
			);

		expect(getByText("Reconnecting...")).toBeInTheDocument();
		expect(getAllByText("1")).toHaveLength(2);
		expect(getByText("1.5 KB/s")).toBeInTheDocument();
		expect(getByText("512 B/s")).toBeInTheDocument();
		expect(getByRole("button", { name: "Downloading" })).toHaveClass(
			"text-blue-400",
		);
		expect(queryByText("—")).not.toBeInTheDocument();
	});

	it("falls back to em-dash speeds and hides upload when there are no torrents", () => {
		const { getAllByText, queryByText } = renderWithProviders(
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

		expect(getAllByText("—")).toHaveLength(1);
		expect(queryByText("Upload")).not.toBeInTheDocument();
	});

	it("calls back when a filter pill is clicked", async () => {
		const user = userEvent.setup();
		const onFilterChange = vi.fn();
		const { getByRole } = renderWithProviders(
			<QueueSummaryBar
				filter="all"
				isConnected
				items={items as never[]}
				onFilterChange={onFilterChange}
			/>,
		);

		await user.click(getByRole("button", { name: "Failed" }));

		expect(onFilterChange).toHaveBeenCalledWith("failed");
	});
});
