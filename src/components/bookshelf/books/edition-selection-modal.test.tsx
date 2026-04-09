import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const editionSelectionModalMocks = vi.hoisted(() => ({
	fetchNextPage: vi.fn(),
	intersectionObserver: null as {
		callback: IntersectionObserverCallback;
		disconnect: ReturnType<typeof vi.fn>;
		observe: ReturnType<typeof vi.fn>;
		trigger: (isIntersecting: boolean) => void;
	} | null,
	visibleColumns: [
		{ key: "title" },
		{ key: "readers" },
		{ key: "format" },
	] as Array<{ key: string }>,
	queryData: {
		pages: [
			{
				items: [
					{
						audioLength: null,
						asin: null,
						bookId: 77,
						country: null,
						downloadProfileIds: [3],
						editionInformation: "Hardcover edition",
						format: "ebook",
						id: 1,
						images: [{ url: "/matched.jpg" }],
						isbn10: "1111111111",
						isbn13: "9781111111111",
						language: "en",
						pageCount: 320,
						publisher: "Publisher One",
						releaseDate: "2024-01-01",
						score: 8,
						title: "Matching edition",
						usersCount: 15,
					},
					{
						audioLength: null,
						asin: null,
						bookId: 77,
						country: null,
						downloadProfileIds: [],
						editionInformation: "Paperback edition",
						format: "paperback",
						id: 2,
						images: [],
						isbn10: "2222222222",
						isbn13: "9782222222222",
						language: "en",
						pageCount: 280,
						publisher: "Publisher Two",
						releaseDate: "2023-05-15",
						score: 6,
						title: "Filtered edition",
						usersCount: 5,
					},
				],
			},
		],
	},
	useInfiniteQuery: vi.fn(),
	bookEditionsInfiniteQuery: vi.fn(
		(bookId: number, sortKey: string, sortDir: string) => ({
			queryKey: ["book-editions", bookId, sortKey, sortDir],
		}),
	),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useInfiniteQuery: (...args: Parameters<typeof actual.useInfiniteQuery>) =>
			editionSelectionModalMocks.useInfiniteQuery(...args),
	};
});

vi.mock("src/components/bookshelf/books/base-book-table", () => ({
	default: ({
		onRowClick,
		onSort,
		rows,
		selectedRowKey,
	}: {
		onRowClick?: (row: { key: number }) => void;
		onSort?: (key: string) => void;
		rows: Array<{ key: number; title: string }>;
		selectedRowKey?: number;
	}) => (
		<div data-testid="base-book-table">
			<button onClick={() => onSort?.("readers")} type="button">
				Sort readers
			</button>
			<button onClick={() => onSort?.("title")} type="button">
				Sort title
			</button>
			{rows.length === 0 ? <p>No editions found.</p> : null}
			{rows.map((row) => (
				<button
					aria-pressed={selectedRowKey === row.key}
					key={row.key}
					onClick={() => onRowClick?.(row)}
					type="button"
				>
					{row.title}
					{selectedRowKey === row.key ? " selected" : ""}
				</button>
			))}
		</div>
	),
}));

vi.mock("src/components/shared/column-settings-popover", () => ({
	default: ({ tableId }: { tableId: string }) => <div>{tableId}</div>,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
	}) => (
		<button disabled={disabled} onClick={onClick} type="button">
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog-root">{children}</div> : null,
	DialogContent: ({
		children,
	}: {
		children: ReactNode;
		onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
	}) => <div>{children}</div>,
	DialogFooter: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/label", () => ({
	default: ({
		children,
		htmlFor,
	}: {
		children: ReactNode;
		htmlFor?: string;
	}) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("src/components/ui/switch", () => ({
	default: ({
		checked,
		onCheckedChange,
	}: {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<button onClick={() => onCheckedChange?.(!checked)} type="button">
			{checked ? "format filter on" : "format filter off"}
		</button>
	),
}));

vi.mock("src/hooks/use-table-columns", () => ({
	useTableColumns: () => ({
		visibleColumns: editionSelectionModalMocks.visibleColumns,
	}),
}));

vi.mock("src/lib/editions", () => ({
	matchesProfileFormat: (format: string | null, target: string) =>
		format === target,
}));

vi.mock("src/lib/queries/books", () => ({
	bookEditionsInfiniteQuery: (
		bookId: number,
		sortKey: string,
		sortDir: string,
	) =>
		editionSelectionModalMocks.bookEditionsInfiniteQuery(
			bookId,
			sortKey,
			sortDir,
		),
}));

import EditionSelectionModal from "./edition-selection-modal";

class MockIntersectionObserver {
	callback: IntersectionObserverCallback;
	disconnect = vi.fn();
	observe = vi.fn();

	constructor(callback: IntersectionObserverCallback) {
		this.callback = callback;
		editionSelectionModalMocks.intersectionObserver = {
			callback,
			disconnect: this.disconnect,
			observe: this.observe,
			trigger: (isIntersecting: boolean) =>
				callback(
					[{ isIntersecting } as IntersectionObserverEntry],
					this as never,
				),
		};
	}
}

describe("EditionSelectionModal", () => {
	beforeEach(() => {
		editionSelectionModalMocks.fetchNextPage.mockReset();
		editionSelectionModalMocks.visibleColumns = [
			{ key: "title" },
			{ key: "readers" },
			{ key: "format" },
		];
		editionSelectionModalMocks.queryData.pages[0].items[0].format = "ebook";
		editionSelectionModalMocks.queryData.pages[0].items[1].format = "paperback";
		editionSelectionModalMocks.useInfiniteQuery.mockReturnValue({
			data: editionSelectionModalMocks.queryData,
			fetchNextPage: editionSelectionModalMocks.fetchNextPage,
			hasNextPage: true,
			isFetchingNextPage: false,
			isLoading: false,
		});
		editionSelectionModalMocks.bookEditionsInfiniteQuery.mockClear();
		editionSelectionModalMocks.intersectionObserver = null;
		vi.stubGlobal("IntersectionObserver", MockIntersectionObserver as never);
	});

	it("shows the loading state while the query is pending", async () => {
		editionSelectionModalMocks.useInfiniteQuery.mockReturnValueOnce({
			data: undefined,
			fetchNextPage: editionSelectionModalMocks.fetchNextPage,
			hasNextPage: false,
			isFetchingNextPage: false,
			isLoading: true,
		});

		await renderWithProviders(
			<EditionSelectionModal
				bookCoverUrl="/cover.jpg"
				bookId={77}
				currentEditionId={undefined}
				isPending={false}
				onConfirm={vi.fn()}
				onOpenChange={vi.fn()}
				open
				profile={{ contentType: "ebook", id: 1, name: "EPUB" }}
			/>,
		);

		await expect
			.element(page.getByTestId("base-book-table"))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Confirm" }))
			.toBeDisabled();
		await expect
			.element(page.getByRole("button", { name: "Cancel" }))
			.toBeInTheDocument();
	});

	it("filters, sorts, selects, and confirms an edition", async () => {
		const onConfirm = vi.fn();
		const onOpenChange = vi.fn();
		const { rerender } = await renderWithProviders(
			<EditionSelectionModal
				bookCoverUrl="/cover.jpg"
				bookId={77}
				currentEditionId={1}
				isPending={false}
				onConfirm={onConfirm}
				onOpenChange={onOpenChange}
				open
				profile={{ contentType: "ebook", id: 1, name: "EPUB" }}
			/>,
		);

		await expect
			.element(page.getByText("Matching edition selected"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Filtered edition"))
			.not.toBeInTheDocument();
		expect(
			editionSelectionModalMocks.bookEditionsInfiniteQuery,
		).toHaveBeenCalledWith(77, "readers", "desc");

		await page.getByRole("button", { name: "Sort title" }).click();
		await page.getByRole("button", { name: "Sort title" }).click();
		expect(
			editionSelectionModalMocks.bookEditionsInfiniteQuery,
		).toHaveBeenLastCalledWith(77, "title", "desc");

		await page.getByRole("button", { name: "format filter on" }).click();
		await expect
			.element(page.getByText("Filtered edition"))
			.toBeInTheDocument();

		await rerender(
			<EditionSelectionModal
				bookCoverUrl="/cover.jpg"
				bookId={77}
				currentEditionId={2}
				isPending={false}
				onConfirm={onConfirm}
				onOpenChange={onOpenChange}
				open
				profile={{ contentType: "ebook", id: 1, name: "EPUB" }}
			/>,
		);
		await expect
			.element(page.getByText("Filtered edition selected"))
			.toBeInTheDocument();

		await page.getByText("Matching edition").click();
		await expect
			.element(page.getByText("Matching edition selected"))
			.toBeInTheDocument();

		editionSelectionModalMocks.intersectionObserver?.trigger(true);
		expect(editionSelectionModalMocks.fetchNextPage).toHaveBeenCalledTimes(1);

		await page.getByRole("button", { name: "Confirm" }).click();
		expect(onConfirm).toHaveBeenCalledWith(1);
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("cancels without confirming", async () => {
		const onConfirm = vi.fn();
		const onOpenChange = vi.fn();

		await renderWithProviders(
			<EditionSelectionModal
				bookCoverUrl={null}
				bookId={77}
				currentEditionId={undefined}
				isPending={true}
				onConfirm={onConfirm}
				onOpenChange={onOpenChange}
				open
				profile={{ contentType: "audiobook", id: 2, name: "Audio" }}
			/>,
		);

		await page.getByRole("button", { name: "Cancel" }).click();
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onConfirm).not.toHaveBeenCalled();
	});
});
