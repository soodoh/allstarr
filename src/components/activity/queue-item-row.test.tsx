import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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

		await renderWithProviders(
			<QueueItemRow {...handlers} item={item as never} />,
		);

		await expect.element(page.getByText("Ubuntu ISO")).toBeInTheDocument();
		await expect.element(page.getByText("Canonical")).toBeInTheDocument();
		await expect.element(page.getByText("42%")).toBeInTheDocument();
		await expect.element(page.getByText("↓ 1.5 KB/s")).toBeInTheDocument();
		await expect.element(page.getByText("↑ 512 B/s")).toBeInTheDocument();
		await expect.element(page.getByText("2 KB / 4 KB")).toBeInTheDocument();
		await expect.element(page.getByText("ETA: 1m 5s")).toBeInTheDocument();
		await expect.element(page.getByText("qBittorrent")).toBeInTheDocument();
		await expect
			.element(page.getByText("torrent", { exact: true }))
			.toBeInTheDocument();

		await page.getByTitle("Increase priority").click();
		await page.getByTitle("Decrease priority").click();
		await page.getByTitle("Pause").click();
		await page.getByTitle("Remove").click();

		expect(handlers.onPriorityUp).toHaveBeenCalledWith(item);
		expect(handlers.onPriorityDown).toHaveBeenCalledWith(item);
		expect(handlers.onPause).toHaveBeenCalledWith(item);
		expect(handlers.onRemove).toHaveBeenCalledWith(item);
	});

	it("renders paused and queued statuses with their specific controls", async () => {
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

		await renderWithProviders(
			<QueueItemRow {...handlers} item={pausedItem as never} />,
		);

		await expect.element(page.getByText("Paused").first()).toBeInTheDocument();
		await page.getByTitle("Resume").click();
		expect(handlers.onResume).toHaveBeenCalledWith(pausedItem);

		await renderWithProviders(
			<QueueItemRow {...handlers} item={queuedItem as never} />,
		);

		await expect.element(page.getByText("Waiting")).toBeInTheDocument();
		await page.getByTitle("Increase priority").click();
		await page.getByTitle("Decrease priority").click();
		expect(handlers.onPriorityUp).toHaveBeenCalledWith(queuedItem);
		expect(handlers.onPriorityDown).toHaveBeenCalledWith(queuedItem);
	});

	it("renders failed statuses with the fallback error details", async () => {
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

		await renderWithProviders(
			<QueueItemRow {...handlers} item={failedItem as never} />,
		);

		await expect
			.element(page.getByText("Failed", { exact: true }))
			.toBeInTheDocument();
		await expect.element(page.getByText("Download failed")).toBeInTheDocument();
		await expect.element(page.getByText("1 KB")).toBeInTheDocument();
	});

	it("renders completed statuses with the final size", async () => {
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

		await renderWithProviders(
			<QueueItemRow {...handlers} item={completedItem as never} />,
		);

		await expect.element(page.getByText("Done")).toBeInTheDocument();
		await expect.element(page.getByText("1 KB")).toBeInTheDocument();
	});

	it("formats short, empty, and hour-based download ETAs", async () => {
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

		await renderWithProviders(
			<QueueItemRow {...handlers} item={shortEtaItem as never} />,
		);
		await expect.element(page.getByText("ETA: 45s")).toBeInTheDocument();

		await renderWithProviders(
			<QueueItemRow {...handlers} item={emptyEtaItem as never} />,
		);
		await expect.element(page.getByText("ETA: —")).toBeInTheDocument();

		await renderWithProviders(
			<QueueItemRow {...handlers} item={longEtaItem as never} />,
		);
		await expect.element(page.getByText("ETA: 1h 1m")).toBeInTheDocument();
	});

	it("shows the failed output path when one is available", async () => {
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

		await renderWithProviders(
			<QueueItemRow {...handlers} item={failedItem as never} />,
		);

		await expect
			.element(page.getByText("/downloads/failed/import.nzb"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Download failed"))
			.not.toBeInTheDocument();
	});
});
