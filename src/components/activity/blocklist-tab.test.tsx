import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

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
		page,
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
				pagination:{page}:{pageSize}:{totalItems}:{totalPages}
			</div>
			<button onClick={() => onPageChange(page + 1)} type="button">
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

	it("shows the empty state when there are no blocked items", () => {
		blocklistTabMocks.useSuspenseQuery.mockReturnValue({
			data: {
				items: [],
				page: 1,
				total: 0,
				totalPages: 0,
			},
		});

		const { getByText, queryByTestId } = renderWithProviders(<BlocklistTab />);

		expect(getByText("No blocked releases")).toBeInTheDocument();
		expect(
			getByText("Releases that are blocked will appear here."),
		).toBeInTheDocument();
		expect(queryByTestId("table-pagination")).not.toBeInTheDocument();
		expect(blocklistTabMocks.useSuspenseQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["blocklist", "list", { limit: 25, page: 1 }],
			}),
		);
	});

	it("filters by content type, clears selection, and falls back for missing book and protocol values", async () => {
		const user = userEvent.setup();
		blocklistTabMocks.useSuspenseQuery.mockReturnValue({
			data: {
				items: [bookItemOne, bookItemTwo, tvItem],
				page: 1,
				total: 3,
				totalPages: 1,
			},
		});

		const { getByRole, getByText, queryByText } = renderWithProviders(
			<BlocklistTab />,
		);

		expect(getByRole("link", { name: "Book #11" })).toHaveAttribute(
			"href",
			"/books/11",
		);
		expect(getByText("torrent")).toBeInTheDocument();
		expect(getByText("Episode Gamma").closest("tr")).not.toBeNull();
		expect(
			within(
				getByText("Episode Gamma").closest("tr") as HTMLTableRowElement,
			).getAllByText("-"),
		).toHaveLength(2);

		await user.click(getByRole("button", { name: "Books" }));
		const bookRow = getByText("Release Alpha").closest("tr");
		expect(bookRow).not.toBeNull();
		expect(getByText("content-type:books")).toBeInTheDocument();
		expect(getByText("Release Alpha")).toBeInTheDocument();
		expect(getByText("Release Beta")).toBeInTheDocument();

		await user.click(
			within(bookRow as HTMLTableRowElement).getByRole("button", {
				name: "checkbox",
			}),
		);
		expect(getByText("1 selected")).toBeInTheDocument();

		await user.click(getByRole("button", { name: "TV Shows" }));
		expect(getByText("Episode Gamma")).toBeInTheDocument();
		expect(queryByText("Release Alpha")).not.toBeInTheDocument();

		await user.click(getByRole("button", { name: "Unexpected" }));
		expect(getByText("Release Alpha")).toBeInTheDocument();
		expect(getByText("Release Beta")).toBeInTheDocument();
		expect(getByText("Episode Gamma")).toBeInTheDocument();

		await user.click(getByRole("button", { name: "Movies" }));
		expect(
			getByText("No blocked releases for the selected content type."),
		).toBeInTheDocument();
		expect(queryByText("1 selected")).not.toBeInTheDocument();

		await user.click(getByRole("button", { name: "Books" }));
		expect(getByText("Release Alpha")).toBeInTheDocument();
		expect(getByText("Release Beta")).toBeInTheDocument();
	});

	it("supports selection toggling, toggle-all, and the bulk remove confirm flow", async () => {
		const user = userEvent.setup();
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

		const { getByRole, getByText, queryByTestId, queryByText } =
			renderWithProviders(<BlocklistTab />);

		await user.click(getByRole("button", { name: "Books" }));

		const rows = getByText("Release Alpha").closest("tr");
		const secondRows = getByText("Release Beta").closest("tr");
		expect(rows).not.toBeNull();
		expect(secondRows).not.toBeNull();

		await user.click(
			within(rows as HTMLTableRowElement).getByRole("button", {
				name: "checkbox",
			}),
		);
		expect(getByText("1 selected")).toBeInTheDocument();

		await user.click(
			within(rows as HTMLTableRowElement).getByRole("button", {
				name: "checkbox",
			}),
		);
		expect(queryByText(/selected/)).not.toBeInTheDocument();

		await user.click(
			within(getByRole("table")).getAllByRole("button", {
				name: "checkbox",
			})[0],
		);
		expect(getByText("2 selected")).toBeInTheDocument();

		await user.click(
			within(getByRole("table")).getAllByRole("button", {
				name: "checkbox",
			})[0],
		);
		expect(queryByText("selected")).not.toBeInTheDocument();

		await user.click(
			within(getByRole("table")).getAllByRole("button", {
				name: "checkbox",
			})[0],
		);
		expect(getByText("2 selected")).toBeInTheDocument();
		await user.click(getByRole("button", { name: "Remove Selected" }));

		expect(queryByTestId("confirm-dialog")).toBeInTheDocument();
		expect(
			getByText(/confirm-description:Remove 2 items from the blocklist\?/),
		).toBeInTheDocument();

		await user.click(getByRole("button", { name: "Close" }));
		expect(queryByTestId("confirm-dialog")).not.toBeInTheDocument();

		await user.click(getByRole("button", { name: "Remove Selected" }));
		await user.click(getByRole("button", { name: "Confirm" }));

		expect(
			blocklistTabMocks.bulkRemoveFromBlocklist.mutate,
		).toHaveBeenCalledWith(
			[101, 102],
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(queryByTestId("confirm-dialog")).not.toBeInTheDocument();
		expect(queryByText("Remove Selected")).not.toBeInTheDocument();
	});

	it("calls the remove mutation for a single item and updates pagination state", async () => {
		const user = userEvent.setup();
		blocklistTabMocks.useSuspenseQuery.mockReturnValue({
			data: {
				items: [bookItemOne, bookItemTwo, tvItem],
				page: 1,
				total: 3,
				totalPages: 1,
			},
		});

		const { getByRole, getByText } = renderWithProviders(<BlocklistTab />);

		await user.click(getByRole("button", { name: "Next page" }));
		expect(blocklistTabMocks.useSuspenseQuery).toHaveBeenLastCalledWith(
			expect.objectContaining({
				queryKey: ["blocklist", "list", { limit: 25, page: 2 }],
			}),
		);

		await user.click(getByRole("button", { name: "Page size 50" }));
		expect(blocklistTabMocks.useSuspenseQuery).toHaveBeenLastCalledWith(
			expect.objectContaining({
				queryKey: ["blocklist", "list", { limit: 50, page: 1 }],
			}),
		);

		const row = getByText("Release Alpha").closest("tr");
		expect(row).not.toBeNull();
		await user.click(
			within(row as HTMLTableRowElement).getAllByRole("button")[1],
		);
		expect(blocklistTabMocks.removeFromBlocklist.mutate).toHaveBeenCalledWith(
			101,
		);
	});
});
