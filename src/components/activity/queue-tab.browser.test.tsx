import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const queueTabMocks = vi.hoisted(() => ({
	pauseDownloadFn: vi.fn(),
	resumeDownloadFn: vi.fn(),
	setDownloadPriorityFn: vi.fn(),
	setQueryData: vi.fn(),
	toastError: vi.fn(),
	useQuery: vi.fn(),
	useQueryClient: vi.fn(),
	summaryProps: [] as Array<{
		filter: string;
		isConnected: boolean;
		items: Array<{ id: string; name: string }>;
		onFilterChange: (value: string) => void;
	}>,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			queueTabMocks.useQuery(...args),
		useQueryClient: () => queueTabMocks.useQueryClient(),
	};
});

vi.mock("sonner", () => ({
	toast: {
		error: queueTabMocks.toastError,
	},
}));

vi.mock("src/lib/queries", () => ({
	queueListQuery: () => ({
		queryFn: vi.fn(),
		queryKey: ["queue", "list"],
	}),
}));

vi.mock("src/lib/query-keys", () => ({
	queryKeys: {
		queue: {
			list: () => ["queue", "list"],
		},
	},
}));

vi.mock("src/server/queue", () => ({
	pauseDownloadFn: queueTabMocks.pauseDownloadFn,
	resumeDownloadFn: queueTabMocks.resumeDownloadFn,
	setDownloadPriorityFn: queueTabMocks.setDownloadPriorityFn,
}));

vi.mock("src/components/activity/content-type-filter", () => ({
	default: ({
		onChange,
		value,
	}: {
		onChange: (value: "all" | "books" | "movies" | "tv") => void;
		value: string;
	}) => (
		<div>
			<div>content:{value}</div>
			<button onClick={() => onChange("all")} type="button">
				All content
			</button>
			<button onClick={() => onChange("books")} type="button">
				Books content
			</button>
			<button onClick={() => onChange("tv")} type="button">
				TV content
			</button>
			<button onClick={() => onChange("movies")} type="button">
				Movies content
			</button>
			<button onClick={() => onChange("unexpected" as never)} type="button">
				Unexpected content
			</button>
		</div>
	),
}));

vi.mock("src/components/activity/queue-connection-banner", () => ({
	default: ({ warnings }: { warnings: string[] }) => (
		<div>Warnings: {warnings.join(" | ") || "none"}</div>
	),
}));

vi.mock("src/components/activity/queue-summary-bar", () => ({
	default: ({
		filter,
		isConnected,
		items,
		onFilterChange,
	}: {
		filter: string;
		isConnected: boolean;
		items: Array<{ id: string; name: string }>;
		onFilterChange: (value: string) => void;
	}) => {
		queueTabMocks.summaryProps.push({
			filter,
			isConnected,
			items,
			onFilterChange,
		});

		return (
			<div>
				<div>
					summary:{filter}:{isConnected ? "connected" : "disconnected"}:
					{items.map((item) => item.name).join(",")}
				</div>
				<button onClick={() => onFilterChange("all")} type="button">
					Show all statuses
				</button>
				<button onClick={() => onFilterChange("paused")} type="button">
					Show paused statuses
				</button>
			</div>
		);
	},
}));

vi.mock("src/components/activity/queue-item-row", () => ({
	default: ({
		item,
		onPause,
		onPriorityDown,
		onPriorityUp,
		onRemove,
		onResume,
	}: {
		item: { name: string };
		onPause: (item: unknown) => void;
		onPriorityDown: (item: unknown) => void;
		onPriorityUp: (item: unknown) => void;
		onRemove: (item: unknown) => void;
		onResume: (item: unknown) => void;
	}) => (
		<div>
			<div>{item.name}</div>
			<button onClick={() => onPause(item)} type="button">
				Pause {item.name}
			</button>
			<button onClick={() => onResume(item)} type="button">
				Resume {item.name}
			</button>
			<button onClick={() => onPriorityUp(item)} type="button">
				Priority up {item.name}
			</button>
			<button onClick={() => onPriorityDown(item)} type="button">
				Priority down {item.name}
			</button>
			<button onClick={() => onRemove(item)} type="button">
				Remove {item.name}
			</button>
		</div>
	),
}));

vi.mock("src/components/activity/remove-download-dialog", () => ({
	default: ({
		item,
		onOpenChange,
	}: {
		item: { name: string } | null;
		onOpenChange: (open: boolean) => void;
	}) => (
		<div>
			<div>remove-dialog:{item?.name ?? "none"}</div>
			<button onClick={() => onOpenChange(true)} type="button">
				Keep remove dialog open
			</button>
			<button onClick={() => onOpenChange(false)} type="button">
				Close remove dialog
			</button>
		</div>
	),
}));

import QueueTab from "./queue-tab";

describe("QueueTab", () => {
	afterEach(() => {
		queueTabMocks.pauseDownloadFn.mockReset();
		queueTabMocks.resumeDownloadFn.mockReset();
		queueTabMocks.setDownloadPriorityFn.mockReset();
		queueTabMocks.setQueryData.mockReset();
		queueTabMocks.toastError.mockReset();
		queueTabMocks.useQuery.mockReset();
		queueTabMocks.useQueryClient.mockReset();
		queueTabMocks.summaryProps.length = 0;
		queueTabMocks.useQueryClient.mockReturnValue({
			setQueryData: queueTabMocks.setQueryData,
		});
	});

	it("shows a loading state and configures fallback polling when disconnected", async () => {
		queueTabMocks.useQueryClient.mockReturnValue({
			setQueryData: queueTabMocks.setQueryData,
		});
		queueTabMocks.useQuery.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		const { container } = await renderWithProviders(
			<QueueTab isConnected={false} />,
		);

		expect(container.querySelector(".animate-spin")).not.toBeNull();
		expect(queueTabMocks.useQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				refetchInterval: 15_000,
			}),
		);
	});

	it("shows the empty state when there are no items or warnings", async () => {
		queueTabMocks.useQueryClient.mockReturnValue({
			setQueryData: queueTabMocks.setQueryData,
		});
		queueTabMocks.useQuery.mockReturnValue({
			data: { items: [], warnings: [] },
			isLoading: false,
		});

		await renderWithProviders(<QueueTab isConnected={true} />);

		await expect
			.element(page.getByText("No active downloads"))
			.toBeInTheDocument();
		await expect
			.element(
				page.getByText(
					"Downloads from your configured clients will appear here.",
				),
			)
			.toBeInTheDocument();
		expect(queueTabMocks.useQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				refetchInterval: false,
			}),
		);
	});

	it("filters items by content type and status and resets the remove dialog", async () => {
		queueTabMocks.useQueryClient.mockReturnValue({
			setQueryData: queueTabMocks.setQueryData,
		});
		queueTabMocks.useQuery.mockReturnValue({
			data: {
				items: [
					{
						bookId: 1,
						downloadClientId: 1,
						episodeId: null,
						id: "book-1",
						movieId: null,
						name: "Book download",
						showId: null,
						status: "downloading",
					},
					{
						bookId: null,
						downloadClientId: 2,
						episodeId: 3,
						id: "tv-1",
						movieId: null,
						name: "TV download",
						showId: 2,
						status: "paused",
					},
					{
						bookId: null,
						downloadClientId: 3,
						episodeId: null,
						id: "movie-1",
						movieId: 4,
						name: "Movie download",
						showId: null,
						status: "queued",
					},
				],
				warnings: ["Client offline"],
			},
			isLoading: false,
		});

		await renderWithProviders(<QueueTab isConnected={false} />);

		await expect
			.element(page.getByText("Warnings: Client offline"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Book download").first())
			.toBeInTheDocument();
		await expect
			.element(page.getByText("TV download").first())
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Books content" }).click();
		await expect
			.element(page.getByText("TV download").first())
			.not.toBeInTheDocument();
		expect(queueTabMocks.summaryProps.at(-1)?.items).toEqual([
			expect.objectContaining({ id: "book-1", name: "Book download" }),
		]);

		await page.getByRole("button", { name: "Show paused statuses" }).click();
		await expect
			.element(page.getByText("No paused downloads"))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "TV content" }).click();
		await expect
			.element(page.getByText("Book download").first())
			.not.toBeInTheDocument();
		await expect
			.element(page.getByText("TV download").first())
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Movies content" }).click();
		await expect
			.element(page.getByText("TV download").first())
			.not.toBeInTheDocument();
		await expect
			.element(page.getByText("No paused downloads"))
			.toBeInTheDocument();
		await page.getByRole("button", { name: "Show all statuses" }).click();
		await expect
			.element(page.getByText("Movie download").first())
			.toBeInTheDocument();
		expect(queueTabMocks.summaryProps.at(-1)?.items).toEqual([
			expect.objectContaining({ id: "movie-1", name: "Movie download" }),
		]);

		await page.getByRole("button", { name: "Unexpected content" }).click();
		await expect
			.element(page.getByText("Book download").first())
			.toBeInTheDocument();
		await expect
			.element(page.getByText("TV download").first())
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Movie download").first())
			.toBeInTheDocument();

		await page.getByRole("button", { name: "TV content" }).click();
		await page.getByRole("button", { name: "Remove TV download" }).click();
		await expect
			.element(page.getByText("remove-dialog:TV download"))
			.toBeInTheDocument();
		await page.getByRole("button", { name: "Keep remove dialog open" }).click();
		await expect
			.element(page.getByText("remove-dialog:TV download"))
			.toBeInTheDocument();
		await page.getByRole("button", { name: "Close remove dialog" }).click();
		await expect
			.element(page.getByText("remove-dialog:none"))
			.toBeInTheDocument();
	});

	it("optimistically updates queue state and reports mutation errors", async () => {
		const item = {
			bookId: 1,
			downloadClientId: 9,
			episodeId: null,
			id: "download-1",
			movieId: null,
			name: "Debian ISO",
			showId: null,
			status: "paused",
		};

		queueTabMocks.useQueryClient.mockReturnValue({
			setQueryData: queueTabMocks.setQueryData,
		});
		queueTabMocks.useQuery.mockReturnValue({
			data: { items: [item], warnings: [] },
			isLoading: false,
		});
		queueTabMocks.pauseDownloadFn.mockRejectedValueOnce(
			new Error("pause failed"),
		);
		queueTabMocks.pauseDownloadFn.mockRejectedValueOnce("not-an-error");
		queueTabMocks.resumeDownloadFn.mockRejectedValueOnce(
			new Error("resume failed"),
		);
		queueTabMocks.resumeDownloadFn.mockRejectedValueOnce("not-an-error");
		queueTabMocks.setDownloadPriorityFn.mockRejectedValueOnce(
			new Error("priority failed"),
		);
		queueTabMocks.setDownloadPriorityFn.mockRejectedValueOnce("not-an-error");

		await renderWithProviders(<QueueTab isConnected={true} />);

		await page.getByRole("button", { name: "Pause Debian ISO" }).click();
		expect(queueTabMocks.pauseDownloadFn).toHaveBeenCalledWith({
			data: {
				downloadClientId: 9,
				downloadItemId: "download-1",
			},
		});
		expect(queueTabMocks.setQueryData).toHaveBeenCalledWith(
			["queue", "list"],
			expect.any(Function),
		);
		const pauseUpdater = queueTabMocks.setQueryData.mock.calls[0]?.[1] as (
			old:
				| {
						items: Array<typeof item>;
						warnings: string[];
				  }
				| undefined,
		) =>
			| {
					items: Array<typeof item>;
					warnings: string[];
			  }
			| undefined;
		expect(pauseUpdater(undefined)).toBeUndefined();
		expect(
			pauseUpdater({
				items: [
					item,
					{
						...item,
						downloadClientId: 100,
						id: "download-2",
						status: "queued",
					},
				],
				warnings: [],
			})?.items,
		).toEqual([
			expect.objectContaining({ id: "download-1", status: "paused" }),
			expect.objectContaining({ id: "download-2", status: "queued" }),
		]);
		expect(queueTabMocks.toastError).toHaveBeenCalledWith(
			"Failed to pause: pause failed",
		);
		await page.getByRole("button", { name: "Pause Debian ISO" }).click();
		expect(queueTabMocks.toastError).toHaveBeenCalledWith(
			"Failed to pause: Unknown error",
		);

		await page.getByRole("button", { name: "Resume Debian ISO" }).click();
		expect(queueTabMocks.resumeDownloadFn).toHaveBeenCalledWith({
			data: {
				downloadClientId: 9,
				downloadItemId: "download-1",
			},
		});
		const resumeUpdater = queueTabMocks.setQueryData.mock.calls[2]?.[1] as (
			old:
				| {
						items: Array<typeof item>;
						warnings: string[];
				  }
				| undefined,
		) =>
			| {
					items: Array<typeof item>;
					warnings: string[];
			  }
			| undefined;
		expect(
			resumeUpdater({
				items: [
					item,
					{
						...item,
						downloadClientId: 100,
						id: "download-2",
						status: "queued",
					},
				],
				warnings: [],
			})?.items,
		).toEqual([
			expect.objectContaining({ id: "download-1", status: "downloading" }),
			expect.objectContaining({ id: "download-2", status: "queued" }),
		]);
		expect(queueTabMocks.toastError).toHaveBeenCalledWith(
			"Failed to resume: resume failed",
		);
		await page.getByRole("button", { name: "Resume Debian ISO" }).click();
		expect(queueTabMocks.toastError).toHaveBeenCalledWith(
			"Failed to resume: Unknown error",
		);

		await page.getByRole("button", { name: "Priority up Debian ISO" }).click();
		expect(queueTabMocks.setDownloadPriorityFn).toHaveBeenCalledWith({
			data: {
				downloadClientId: 9,
				downloadItemId: "download-1",
				priority: 1,
			},
		});

		await page
			.getByRole("button", { name: "Priority down Debian ISO" })
			.click();
		expect(queueTabMocks.setDownloadPriorityFn).toHaveBeenLastCalledWith({
			data: {
				downloadClientId: 9,
				downloadItemId: "download-1",
				priority: -1,
			},
		});
		expect(queueTabMocks.toastError).toHaveBeenCalledWith(
			"Failed to change priority: Unknown error",
		);
		expect(queueTabMocks.toastError).toHaveBeenCalledWith(
			"Failed to change priority: priority failed",
		);
	});
});
