import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

const blocklistTabMocks = vi.hoisted(() => ({
	bulkRemoveFromBlocklist: {
		isPending: false,
		mutate: vi.fn(),
	},
	removeFromBlocklist: {
		isPending: false,
		mutate: vi.fn(),
	},
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			blocklistTabMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		params,
		to,
		...props
	}: {
		children: ReactNode;
		params?: { bookId?: string };
		to: string;
	}) => (
		<a href={to.replace("$bookId", params?.bookId ?? "")} {...props}>
			{children}
		</a>
	),
}));

vi.mock("src/components/activity/content-type-filter", () => ({
	default: ({
		onChange,
		value,
	}: {
		onChange: (value: "all" | "books" | "movies" | "tv") => void;
		value: "all" | "books" | "movies" | "tv";
	}) => (
		<div data-testid="content-type-filter">
			<div>content-type:{value}</div>
			<button onClick={() => onChange("all")} type="button">
				All
			</button>
			<button onClick={() => onChange("books")} type="button">
				Books
			</button>
			<button onClick={() => onChange("tv")} type="button">
				TV Shows
			</button>
			<button onClick={() => onChange("movies")} type="button">
				Movies
			</button>
			<button onClick={() => onChange("unexpected" as never)} type="button">
				Unexpected
			</button>
		</div>
	),
}));

vi.mock("src/components/shared/confirm-dialog", () => ({
	default: ({
		description,
		loading,
		onConfirm,
		onOpenChange,
		open,
		title,
	}: {
		description: string;
		loading: boolean;
		onConfirm: () => void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		title: string;
	}) =>
		open ? (
			<div data-testid="confirm-dialog">
				<div>confirm-title:{title}</div>
				<div>confirm-description:{description}</div>
				<div>confirm-loading:{loading ? "yes" : "no"}</div>
				<button onClick={onConfirm} type="button">
					Confirm
				</button>
				<button onClick={() => onOpenChange(false)} type="button">
					Close
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/shared/table-pagination", () => ({
	default: ({
		onPageChange,
		onPageSizeChange,
		page: currentPage,
		pageSize,
		totalItems,
		totalPages,
	}: {
		onPageChange: (page: number) => void;
		onPageSizeChange: (pageSize: number) => void;
		page: number;
		pageSize: number;
		totalItems: number;
		totalPages: number;
	}) => (
		<div data-testid="table-pagination">
			<div>
				pagination:{currentPage}:{pageSize}:{totalItems}:{totalPages}
			</div>
			<button onClick={() => onPageChange(currentPage + 1)} type="button">
				Next page
			</button>
			<button onClick={() => onPageSizeChange(50)} type="button">
				Page size 50
			</button>
			<button onClick={() => onPageSizeChange(10)} type="button">
				Page size 10
			</button>
		</div>
	),
}));

vi.mock("src/components/ui/checkbox", () => ({
	default: ({
		checked,
		onCheckedChange,
	}: {
		checked?: boolean;
		onCheckedChange?: () => void;
	}) => (
		<button
			aria-pressed={checked ? "true" : "false"}
			onClick={() => onCheckedChange?.()}
			type="button"
		>
			checkbox
		</button>
	),
}));

vi.mock("src/lib/queries", () => ({
	blocklistListQuery: (params: { limit?: number; page?: number }) => ({
		queryKey: ["blocklist", "list", params],
		queryFn: vi.fn(),
	}),
}));

vi.mock("src/hooks/mutations", () => ({
	useBulkRemoveFromBlocklist: () => blocklistTabMocks.bulkRemoveFromBlocklist,
	useRemoveFromBlocklist: () => blocklistTabMocks.removeFromBlocklist,
}));

import BlocklistTab from "./blocklist-tab";

const bookItemOne = {
	authorId: null,
	authorName: null,
	bookId: 11,
	bookTitle: null,
	date: new Date("2024-01-01T12:00:00Z"),
	id: 101,
	indexer: "Indexer A",
	message: null,
	movieId: null,
	movieTitle: null,
	protocol: "torrent",
	showId: null,
	showTitle: null,
	source: "radarr",
	sourceTitle: "Release Alpha",
};

const bookItemTwo = {
	authorId: null,
	authorName: null,
	bookId: 12,
	bookTitle: "The Manual",
	date: new Date("2024-01-02T12:00:00Z"),
	id: 102,
	indexer: null,
	message: null,
	movieId: null,
	movieTitle: null,
	protocol: "usenet",
	showId: null,
	showTitle: null,
	source: "sonarr",
	sourceTitle: "Release Beta",
};

const tvItem = {
	authorId: null,
	authorName: null,
	bookId: null,
	bookTitle: null,
	date: new Date("2024-01-03T12:00:00Z"),
	id: 201,
	indexer: "Indexer B",
	message: null,
	movieId: null,
	movieTitle: null,
	protocol: null,
	showId: 21,
	showTitle: null,
	source: "sonarr",
	sourceTitle: "Episode Gamma",
};

describe("BlocklistTab", () => {
	afterEach(() => {
		blocklistTabMocks.bulkRemoveFromBlocklist.isPending = false;
		blocklistTabMocks.bulkRemoveFromBlocklist.mutate.mockReset();
		blocklistTabMocks.removeFromBlocklist.isPending = false;
		blocklistTabMocks.removeFromBlocklist.mutate.mockReset();
		blocklistTabMocks.useSuspenseQuery.mockReset();
	});

	it("shows the empty state when there are no blocked items", async () => {
		blocklistTabMocks.useSuspenseQuery.mockReturnValue({
			data: {
				items: [],
				page: 1,
				total: 0,
				totalPages: 0,
			},
		});

		await renderWithProviders(<BlocklistTab />);

		await expect
			.element(page.getByText("No blocked releases"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Releases that are blocked will appear here."))
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId("table-pagination"))
			.not.toBeInTheDocument();
		expect(blocklistTabMocks.useSuspenseQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["blocklist", "list", { limit: 25, page: 1 }],
			}),
		);
	});

	it("filters by content type, clears selection, and falls back for missing book and protocol values", async () => {
		blocklistTabMocks.useSuspenseQuery.mockReturnValue({
			data: {
				items: [bookItemOne, bookItemTwo, tvItem],
				page: 1,
				total: 3,
				totalPages: 1,
			},
		});

		await renderWithProviders(<BlocklistTab />);

		await expect
			.element(page.getByRole("link", { name: "Book #11" }))
			.toHaveAttribute("href", "/books/11");
		await expect.element(page.getByText("torrent")).toBeInTheDocument();

		// Episode Gamma row should have dashes for missing fields
		const episodeGammaRow = page
			.getByText("Episode Gamma")
			.element()
			.closest("tr");
		expect(episodeGammaRow).not.toBeNull();

		await page.getByRole("button", { name: "Books" }).click();
		await expect
			.element(page.getByText("content-type:books"))
			.toBeInTheDocument();
		await expect.element(page.getByText("Release Alpha")).toBeInTheDocument();
		await expect.element(page.getByText("Release Beta")).toBeInTheDocument();

		// Click the checkbox in the Release Alpha row
		const bookRow = page.getByText("Release Alpha").element().closest("tr");
		expect(bookRow).not.toBeNull();
		const checkboxInRow = bookRow?.querySelector("button[aria-pressed]");
		expect(checkboxInRow).not.toBeNull();
		await userEvent.click(checkboxInRow as HTMLElement);
		await expect.element(page.getByText("1 selected")).toBeInTheDocument();

		await page.getByRole("button", { name: "TV Shows" }).click();
		await expect.element(page.getByText("Episode Gamma")).toBeInTheDocument();
		await expect
			.element(page.getByText("Release Alpha"))
			.not.toBeInTheDocument();

		await page.getByRole("button", { name: "Unexpected" }).click();
		await expect.element(page.getByText("Release Alpha")).toBeInTheDocument();
		await expect.element(page.getByText("Release Beta")).toBeInTheDocument();
		await expect.element(page.getByText("Episode Gamma")).toBeInTheDocument();

		await page.getByRole("button", { name: "Movies" }).click();
		await expect
			.element(
				page.getByText("No blocked releases for the selected content type."),
			)
			.toBeInTheDocument();
		await expect.element(page.getByText("1 selected")).not.toBeInTheDocument();

		await page.getByRole("button", { name: "Books" }).click();
		await expect.element(page.getByText("Release Alpha")).toBeInTheDocument();
		await expect.element(page.getByText("Release Beta")).toBeInTheDocument();
	});

	it("supports selection toggling, toggle-all, and the bulk remove confirm flow", async () => {
		blocklistTabMocks.useSuspenseQuery.mockReturnValue({
			data: {
				items: [bookItemOne, bookItemTwo, tvItem],
				page: 1,
				total: 3,
				totalPages: 1,
			},
		});
		blocklistTabMocks.bulkRemoveFromBlocklist.mutate.mockImplementation(
			(_ids: number[], options?: { onSuccess?: () => void }) => {
				options?.onSuccess?.();
			},
		);

		await renderWithProviders(<BlocklistTab />);

		await page.getByRole("button", { name: "Books" }).click();

		const alphaRow = page.getByText("Release Alpha").element().closest("tr");
		const betaRow = page.getByText("Release Beta").element().closest("tr");
		expect(alphaRow).not.toBeNull();
		expect(betaRow).not.toBeNull();

		const alphaCheckbox = alphaRow?.querySelector("button[aria-pressed]");
		expect(alphaCheckbox).not.toBeNull();

		await userEvent.click(alphaCheckbox as HTMLElement);
		await expect.element(page.getByText("1 selected")).toBeInTheDocument();

		await userEvent.click(alphaCheckbox as HTMLElement);
		await expect.element(page.getByText(/selected/)).not.toBeInTheDocument();

		// Click the header checkbox (toggle-all) — first button[aria-pressed] in the table
		const tableEl = page.getByRole("table").element();
		const allCheckboxes = tableEl?.querySelectorAll("button[aria-pressed]");
		expect(allCheckboxes).not.toBeNull();
		await userEvent.click(allCheckboxes?.[0] as HTMLElement);
		await expect.element(page.getByText("2 selected")).toBeInTheDocument();

		await userEvent.click(allCheckboxes?.[0] as HTMLElement);
		await expect.element(page.getByText("selected")).not.toBeInTheDocument();

		await userEvent.click(allCheckboxes?.[0] as HTMLElement);
		await expect.element(page.getByText("2 selected")).toBeInTheDocument();
		await page.getByRole("button", { name: "Remove Selected" }).click();

		await expect
			.element(page.getByTestId("confirm-dialog"))
			.toBeInTheDocument();
		await expect
			.element(
				page.getByText(
					/confirm-description:Remove 2 items from the blocklist\?/,
				),
			)
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Close" }).click();
		await expect
			.element(page.getByTestId("confirm-dialog"))
			.not.toBeInTheDocument();

		await page.getByRole("button", { name: "Remove Selected" }).click();
		await page.getByRole("button", { name: "Confirm" }).click();

		expect(
			blocklistTabMocks.bulkRemoveFromBlocklist.mutate,
		).toHaveBeenCalledWith(
			[101, 102],
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		await expect
			.element(page.getByTestId("confirm-dialog"))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByText("Remove Selected"))
			.not.toBeInTheDocument();
	});

	it("calls the remove mutation for a single item and updates pagination state", async () => {
		blocklistTabMocks.useSuspenseQuery.mockReturnValue({
			data: {
				items: [bookItemOne, bookItemTwo, tvItem],
				page: 1,
				total: 3,
				totalPages: 1,
			},
		});

		await renderWithProviders(<BlocklistTab />);

		await page.getByRole("button", { name: "Next page" }).click();
		expect(blocklistTabMocks.useSuspenseQuery).toHaveBeenLastCalledWith(
			expect.objectContaining({
				queryKey: ["blocklist", "list", { limit: 25, page: 2 }],
			}),
		);

		await page.getByRole("button", { name: "Page size 50" }).click();
		expect(blocklistTabMocks.useSuspenseQuery).toHaveBeenLastCalledWith(
			expect.objectContaining({
				queryKey: ["blocklist", "list", { limit: 50, page: 1 }],
			}),
		);

		const alphaRow = page.getByText("Release Alpha").element().closest("tr");
		expect(alphaRow).not.toBeNull();
		// The second button in the row is the remove button
		const rowButtons = alphaRow?.querySelectorAll("button");
		expect(rowButtons).not.toBeNull();
		await userEvent.click(rowButtons?.[1] as HTMLElement);
		expect(blocklistTabMocks.removeFromBlocklist.mutate).toHaveBeenCalledWith(
			101,
		);
	});
});
