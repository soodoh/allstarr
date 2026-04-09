import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

import QueueItemRow from "./queue-item-row";

describe("QueueItemRow", () => {
	const handlers = {
		onPause: vi.fn(),
		onResume: vi.fn(),
		onRemove: vi.fn(),
		onPriorityUp: vi.fn(),
		onPriorityDown: vi.fn(),
	};

	it("renders downloading rows with author, progress details, and all action buttons", async () => {
		const user = userEvent.setup();
		const item = {
			id: "dl-1",
			name: "Ubuntu ISO",
			authorName: "Canonical",
			status: "downloading",
			progress: 42,
			downloadSpeed: 1_536,
			uploadSpeed: 512,
			downloaded: 2_048,
			size: 4_096,
			estimatedTimeLeft: 65,
			outputPath: null,
			downloadClientName: "qBittorrent",
			protocol: "torrent",
		};

		const { getByText, getByTitle } = renderWithProviders(
			<QueueItemRow {...handlers} item={item as never} />,
		);

		expect(getByText("Ubuntu ISO")).toBeInTheDocument();
		expect(getByText("Canonical")).toBeInTheDocument();
		expect(getByText("42%")).toBeInTheDocument();
		expect(getByText("↓ 1.5 KB/s")).toBeInTheDocument();
		expect(getByText("↑ 512 B/s")).toBeInTheDocument();
		expect(getByText("2 KB / 4 KB")).toBeInTheDocument();
		expect(getByText("ETA: 1m 5s")).toBeInTheDocument();
		expect(getByText("qBittorrent")).toBeInTheDocument();
		expect(getByText("torrent")).toBeInTheDocument();

		await user.click(getByTitle("Increase priority"));
		await user.click(getByTitle("Decrease priority"));
		await user.click(getByTitle("Pause"));
		await user.click(getByTitle("Remove"));

		expect(handlers.onPriorityUp).toHaveBeenCalledWith(item);
		expect(handlers.onPriorityDown).toHaveBeenCalledWith(item);
		expect(handlers.onPause).toHaveBeenCalledWith(item);
		expect(handlers.onRemove).toHaveBeenCalledWith(item);
	});

	it("renders paused and queued statuses with their specific controls", async () => {
		const user = userEvent.setup();
		const pausedItem = {
			id: "dl-2",
			name: "Paused item",
			authorName: null,
			status: "paused",
			progress: 12,
			downloadSpeed: 0,
			uploadSpeed: 0,
			downloaded: 1_024,
			size: 2_048,
			estimatedTimeLeft: null,
			outputPath: null,
			downloadClientName: "SABnzbd",
			protocol: "usenet",
		};
		const queuedItem = {
			...pausedItem,
			id: "dl-3",
			name: "Queued item",
			status: "queued",
		};

		const pausedView = renderWithProviders(
			<QueueItemRow {...handlers} item={pausedItem as never} />,
		);
		const queuedView = renderWithProviders(
			<QueueItemRow {...handlers} item={queuedItem as never} />,
		);

		expect(pausedView.getAllByText("Paused")).toHaveLength(2);
		await user.click(pausedView.getByTitle("Resume"));
		expect(handlers.onResume).toHaveBeenCalledWith(pausedItem);

		expect(queuedView.getByText("Waiting")).toBeInTheDocument();
		await user.click(queuedView.getByTitle("Increase priority"));
		await user.click(queuedView.getByTitle("Decrease priority"));
		expect(handlers.onPriorityUp).toHaveBeenCalledWith(queuedItem);
		expect(handlers.onPriorityDown).toHaveBeenCalledWith(queuedItem);
	});

	it("renders failed statuses with the fallback error details", () => {
		const failedItem = {
			id: "dl-4",
			name: "Failed item",
			authorName: null,
			status: "failed",
			progress: 0,
			downloadSpeed: 0,
			uploadSpeed: 0,
			downloaded: 0,
			size: 1_024,
			estimatedTimeLeft: null,
			outputPath: null,
			downloadClientName: "Client",
			protocol: "usenet",
		};
		const failedView = renderWithProviders(
			<QueueItemRow {...handlers} item={failedItem as never} />,
		);

		expect(failedView.getByText("Failed")).toBeInTheDocument();
		expect(failedView.getByText("Download failed")).toBeInTheDocument();
		expect(failedView.getByText("1 KB")).toBeInTheDocument();
	});

	it("renders completed statuses with the final size", () => {
		const completedItem = {
			id: "dl-5",
			name: "Complete item",
			authorName: null,
			status: "completed",
			progress: 100,
			downloadSpeed: 0,
			uploadSpeed: 0,
			downloaded: 1_024,
			size: 1_024,
			estimatedTimeLeft: null,
			outputPath: "/downloads/complete",
			downloadClientName: "Client",
			protocol: "usenet",
		};
		const { getByText } = renderWithProviders(
			<QueueItemRow {...handlers} item={completedItem as never} />,
		);

		expect(getByText("Done")).toBeInTheDocument();
		expect(getByText("1 KB")).toBeInTheDocument();
	});

	it("formats short, empty, and hour-based download ETAs", () => {
		const shortEtaItem = {
			id: "dl-6",
			name: "Short ETA",
			authorName: null,
			status: "downloading",
			progress: 5,
			downloadSpeed: 128,
			uploadSpeed: 0,
			downloaded: 128,
			size: 1024,
			estimatedTimeLeft: 45,
			outputPath: null,
			downloadClientName: "Client",
			protocol: "usenet",
		};
		const emptyEtaItem = {
			...shortEtaItem,
			id: "dl-7",
			name: "Empty ETA",
			estimatedTimeLeft: 0,
		};
		const longEtaItem = {
			...shortEtaItem,
			id: "dl-8",
			name: "Long ETA",
			estimatedTimeLeft: 3660,
		};

		const shortView = renderWithProviders(
			<QueueItemRow {...handlers} item={shortEtaItem as never} />,
		);
		const emptyView = renderWithProviders(
			<QueueItemRow {...handlers} item={emptyEtaItem as never} />,
		);
		const longView = renderWithProviders(
			<QueueItemRow {...handlers} item={longEtaItem as never} />,
		);

		expect(shortView.getByText("ETA: 45s")).toBeInTheDocument();
		expect(emptyView.getByText("ETA: —")).toBeInTheDocument();
		expect(longView.getByText("ETA: 1h 1m")).toBeInTheDocument();
	});

	it("shows the failed output path when one is available", () => {
		const failedItem = {
			id: "dl-9",
			name: "Failed import",
			authorName: null,
			status: "failed",
			progress: 0,
			downloadSpeed: 0,
			uploadSpeed: 0,
			downloaded: 0,
			size: 2048,
			estimatedTimeLeft: null,
			outputPath: "/downloads/failed/import.nzb",
			downloadClientName: "Client",
			protocol: "usenet",
		};

		const { getByText, queryByText } = renderWithProviders(
			<QueueItemRow {...handlers} item={failedItem as never} />,
		);

		expect(getByText("/downloads/failed/import.nzb")).toBeInTheDocument();
		expect(queryByText("Download failed")).not.toBeInTheDocument();
	});
});
