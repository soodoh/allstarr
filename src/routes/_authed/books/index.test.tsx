import { fireEvent } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const booksRouteMocks = vi.hoisted(() => {
	let observerCallback:
		| ((entries: IntersectionObserverEntry[]) => void)
		| undefined;

	return {
		BookCardsSkeleton: () => <div data-testid="book-cards-skeleton" />,
		BookTableRowsSkeleton: ({ columns }: { columns: number }) => (
			<div
				data-columns={String(columns)}
				data-testid="book-table-rows-skeleton"
			/>
		),
		books: [
			{
				downloadProfileIds: [11],
				id: 1,
				title: "Dune",
			},
			{
				downloadProfileIds: [],
				id: 2,
				title: "Neuromancer",
			},
		],
		booksInfiniteQuery: vi.fn(
			(
				search = "",
				monitored = true,
				sortKey = "readers",
				sortDir = "desc",
			) => ({
				queryKey: ["books", "infinite", search, monitored, sortKey, sortDir],
			}),
		),
		downloadProfiles: [
			{ contentType: "ebook", id: 11, name: "eBook" },
			{ contentType: "audiobook", id: 12, name: "Audio" },
		],
		downloadProfilesListQuery: vi.fn(() => ({
			queryKey: ["download-profiles", "list"],
		})),
		fetchNextPage: vi.fn(),
		hasNextPage: true,
		isFetchingNextPage: false,
		isLoading: false,
		monitorBookProfile: {
			isPending: false,
			mutate: vi.fn(),
		},
		observe: vi.fn(),
		setObserverCallback: (
			callback: (entries: IntersectionObserverEntry[]) => void,
		) => {
			observerCallback = callback;
		},
		setViewMode: vi.fn(),
		triggerIntersection: (entry: Partial<IntersectionObserverEntry>) => {
			observerCallback?.([
				{
					intersectionRatio: 1,
					isIntersecting: true,
					target: document.createElement("div"),
					...entry,
				} as IntersectionObserverEntry,
			]);
		},
		unmonitorBookProfile: {
			isPending: false,
			mutate: vi.fn(),
		},
		useInfiniteQuery: vi.fn(),
		useSuspenseQuery: vi.fn(),
		useViewMode: vi.fn(),
		userSettingsQuery: vi.fn((tableId: string) => ({
			queryKey: ["user-settings", tableId],
		})),
		viewMode: "grid" as "grid" | "table",
	};
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useInfiniteQuery: (...args: Parameters<typeof actual.useInfiniteQuery>) =>
			booksRouteMocks.useInfiniteQuery(...args),
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			booksRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("lucide-react", () => ({
	BookOpen: ({ className }: { className?: string }) => (
		<span className={className}>BookOpen</span>
	),
	LayoutGrid: ({ className }: { className?: string }) => (
		<span className={className}>Grid</span>
	),
	List: ({ className }: { className?: string }) => (
		<span className={className}>List</span>
	),
	Search: ({ className }: { className?: string }) => (
		<span className={className}>Search</span>
	),
}));

vi.mock("src/components/bookshelf/books/book-card", () => ({
	default: ({ book }: { book: { title: string } }) => (
		<article data-testid="book-card">{book.title}</article>
	),
}));

vi.mock("src/components/bookshelf/books/book-table", () => ({
	default: ({
		books,
		children,
		downloadProfiles,
		onSort,
		onToggleProfile,
		sortDir,
		sortKey,
	}: {
		books: Array<{ id: number; title: string }>;
		children?: ReactNode;
		downloadProfiles?: Array<{ id: number; name: string }>;
		onSort: (key: string) => void;
		onToggleProfile: (bookId: number, profileId: number) => void;
		sortDir: string;
		sortKey: string;
	}) => (
		<div data-testid="book-table">
			<span data-testid="book-table-items">
				{books.map((book) => book.title).join(",")}
			</span>
			<span data-testid="book-table-sort">
				{sortKey}:{sortDir}
			</span>
			<span data-testid="book-table-profiles">
				{downloadProfiles?.map((profile) => profile.name).join(",") ?? ""}
			</span>
			<button type="button" onClick={() => onSort("readers")}>
				sort-readers
			</button>
			<button type="button" onClick={() => onSort("readers")}>
				sort-readers-again
			</button>
			<button type="button" onClick={() => onToggleProfile(1, 11)}>
				unmonitor-first
			</button>
			<button type="button" onClick={() => onToggleProfile(2, 11)}>
				monitor-second
			</button>
			{children}
		</div>
	),
}));

vi.mock("src/components/bookshelf/books/unmonitor-dialog", () => ({
	default: ({
		itemTitle,
		onConfirm,
		open,
		profileName,
	}: {
		itemTitle: string;
		onConfirm: (deleteFiles: boolean) => void;
		open: boolean;
		profileName: string;
	}) => (
		<div data-open={String(open)} data-testid="unmonitor-dialog">
			<span data-testid="unmonitor-dialog-title">{itemTitle}</span>
			<span data-testid="unmonitor-dialog-profile">{profileName}</span>
			<button type="button" onClick={() => onConfirm(true)}>
				confirm-unmonitor
			</button>
		</div>
	),
}));

vi.mock("src/components/shared/column-settings-popover", () => ({
	default: ({ tableId }: { tableId: string }) => (
		<div data-testid="column-settings-popover">{tableId}</div>
	),
}));

vi.mock("src/components/shared/empty-state", () => ({
	default: ({
		description,
		title,
	}: {
		description: string;
		icon: ComponentType<{ className?: string }>;
		title: string;
	}) => (
		<div data-testid="empty-state">
			<span data-testid="empty-state-title">{title}</span>
			<span data-testid="empty-state-description">{description}</span>
		</div>
	),
}));

vi.mock("src/components/shared/loading-skeleton", () => ({
	BookCardsSkeleton: booksRouteMocks.BookCardsSkeleton,
	BookTableRowsSkeleton: booksRouteMocks.BookTableRowsSkeleton,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({
		actions,
		description,
		title,
	}: {
		actions?: ReactNode;
		description?: ReactNode;
		title: string;
	}) => (
		<div data-testid="page-header">
			<span data-testid="page-header-title">{title}</span>
			{description ? (
				<span data-testid="page-header-description">{description}</span>
			) : null}
			{actions}
		</div>
	),
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
	}: {
		children: ReactNode;
		onClick?: () => void;
	}) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/input", () => ({
	default: ({
		onChange,
		placeholder,
		value,
	}: {
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		value?: string;
	}) => (
		<input
			data-testid="search-input"
			onChange={onChange}
			placeholder={placeholder}
			value={value}
		/>
	),
}));

vi.mock("src/hooks/mutations", () => ({
	useMonitorBookProfile: () => booksRouteMocks.monitorBookProfile,
	useUnmonitorBookProfile: () => booksRouteMocks.unmonitorBookProfile,
}));

vi.mock("src/hooks/use-view-mode", () => ({
	default: (tableId: string) => booksRouteMocks.useViewMode(tableId),
}));

vi.mock("src/lib/queries", () => ({
	booksInfiniteQuery: (
		search?: string,
		monitored?: boolean,
		sortKey?: string,
		sortDir?: "asc" | "desc",
	) => booksRouteMocks.booksInfiniteQuery(search, monitored, sortKey, sortDir),
	downloadProfilesListQuery: () => booksRouteMocks.downloadProfilesListQuery(),
}));

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (tableId: string) =>
		booksRouteMocks.userSettingsQuery(tableId),
}));

import { Route } from "./index";

describe("BooksRoute", () => {
	beforeEach(() => {
		booksRouteMocks.viewMode = "grid";
		booksRouteMocks.hasNextPage = true;
		booksRouteMocks.isFetchingNextPage = false;
		booksRouteMocks.isLoading = false;
		booksRouteMocks.observe.mockReset();
		booksRouteMocks.fetchNextPage.mockReset();
		booksRouteMocks.setViewMode.mockReset();
		booksRouteMocks.monitorBookProfile.mutate.mockReset();
		booksRouteMocks.unmonitorBookProfile.mutate.mockReset();
		booksRouteMocks.booksInfiniteQuery.mockClear();
		booksRouteMocks.downloadProfilesListQuery.mockClear();
		booksRouteMocks.useViewMode.mockImplementation(() => [
			booksRouteMocks.viewMode,
			booksRouteMocks.setViewMode,
		]);
		booksRouteMocks.useInfiniteQuery.mockImplementation(() => ({
			data: {
				pages: [
					{
						items: booksRouteMocks.books,
						total: booksRouteMocks.books.length,
					},
				],
			},
			fetchNextPage: booksRouteMocks.fetchNextPage,
			hasNextPage: booksRouteMocks.hasNextPage,
			isFetchingNextPage: booksRouteMocks.isFetchingNextPage,
			isLoading: booksRouteMocks.isLoading,
		}));
		booksRouteMocks.useSuspenseQuery.mockReturnValue({
			data: booksRouteMocks.downloadProfiles,
		});
		booksRouteMocks.unmonitorBookProfile.mutate.mockImplementation(
			(
				_payload: unknown,
				options?: {
					onSuccess?: () => void;
				},
			) => {
				options?.onSuccess?.();
			},
		);

		class MockIntersectionObserver implements IntersectionObserver {
			root = null;
			rootMargin = "200px";
			scrollMargin = "0px";
			thresholds = [];

			constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
				booksRouteMocks.setObserverCallback(callback);
			}

			disconnect = vi.fn();
			observe = booksRouteMocks.observe;
			takeRecords = () => [];
			unobserve = vi.fn();
		}

		globalThis.IntersectionObserver =
			MockIntersectionObserver as unknown as typeof IntersectionObserver;
	});

	it("wires the loader and renders the empty state when the bookshelf is empty", async () => {
		const prefetchInfiniteQuery = vi.fn();
		const ensureQueryData = vi.fn();
		const routeConfig = Route as unknown as {
			component: () => ReactNode;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
						prefetchInfiniteQuery: typeof prefetchInfiniteQuery;
					};
				};
			}) => Promise<unknown>;
		};

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
					prefetchInfiniteQuery,
				},
			},
		});

		expect(prefetchInfiniteQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["books", "infinite", "", true, "readers", "desc"],
			}),
		);
		expect(ensureQueryData).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				queryKey: ["download-profiles", "list"],
			}),
		);
		expect(ensureQueryData).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				queryKey: ["user-settings", "books"],
			}),
		);

		booksRouteMocks.useInfiniteQuery.mockImplementation(() => ({
			data: {
				pages: [
					{
						items: [],
						total: 0,
					},
				],
			},
			fetchNextPage: booksRouteMocks.fetchNextPage,
			hasNextPage: false,
			isFetchingNextPage: false,
			isLoading: false,
		}));

		const { getByTestId } = renderWithProviders(<routeConfig.component />);
		expect(getByTestId("page-header-title")).toHaveTextContent("Books");
		expect(getByTestId("empty-state-title")).toHaveTextContent("No books yet");
		expect(getByTestId("empty-state-description")).toHaveTextContent(
			"Search Hardcover to add your first book.",
		);
	});

	it("renders grid mode, reacts to search, toggles views, and fetches more books", () => {
		const routeConfig = Route as unknown as {
			component: () => ReactNode;
		};
		const { getAllByTestId, getByTestId, getByText } = renderWithProviders(
			<routeConfig.component />,
		);

		expect(getByTestId("page-header-description")).toHaveTextContent(
			"2 books on your bookshelf",
		);
		expect(getAllByTestId("book-card")).toHaveLength(2);
		expect(booksRouteMocks.observe).toHaveBeenCalledTimes(1);

		fireEvent.change(getByTestId("search-input"), {
			target: { value: "dune" },
		});
		expect(booksRouteMocks.booksInfiniteQuery).toHaveBeenLastCalledWith(
			"dune",
			true,
			"readers",
			"desc",
		);
		expect(getByTestId("page-header-description")).toHaveTextContent(
			"2 matching books",
		);

		fireEvent.click(getByText("List"));
		expect(booksRouteMocks.setViewMode).toHaveBeenCalledWith("table");

		booksRouteMocks.triggerIntersection({ isIntersecting: true });
		expect(booksRouteMocks.fetchNextPage).toHaveBeenCalledTimes(1);
	});

	it("renders table mode, handles sorting, and monitors or unmonitors profiles", () => {
		booksRouteMocks.viewMode = "table";
		booksRouteMocks.isFetchingNextPage = true;

		const routeConfig = Route as unknown as {
			component: () => ReactNode;
		};
		const { getByTestId, getByText } = renderWithProviders(
			<routeConfig.component />,
		);

		expect(getByTestId("column-settings-popover")).toHaveTextContent("books");
		expect(getByTestId("book-table-sort")).toHaveTextContent("readers:desc");
		expect(getByTestId("book-table-profiles")).toHaveTextContent("eBook,Audio");
		expect(getByTestId("book-table-rows-skeleton")).toHaveAttribute(
			"data-columns",
			"6",
		);

		fireEvent.click(getByText("sort-readers"));
		expect(booksRouteMocks.booksInfiniteQuery).toHaveBeenLastCalledWith(
			"",
			true,
			"readers",
			"asc",
		);

		fireEvent.click(getByText("sort-readers-again"));
		expect(booksRouteMocks.booksInfiniteQuery).toHaveBeenLastCalledWith(
			"",
			true,
			"readers",
			"desc",
		);

		fireEvent.click(getByText("monitor-second"));
		expect(booksRouteMocks.monitorBookProfile.mutate).toHaveBeenCalledWith({
			bookId: 2,
			downloadProfileId: 11,
		});

		fireEvent.click(getByText("unmonitor-first"));
		expect(getByTestId("unmonitor-dialog")).toHaveAttribute(
			"data-open",
			"true",
		);
		expect(getByTestId("unmonitor-dialog-title")).toHaveTextContent("Dune");
		expect(getByTestId("unmonitor-dialog-profile")).toHaveTextContent("eBook");

		fireEvent.click(getByText("confirm-unmonitor"));
		expect(booksRouteMocks.unmonitorBookProfile.mutate).toHaveBeenCalledWith(
			{
				bookId: 1,
				deleteFiles: true,
				downloadProfileId: 11,
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(getByTestId("unmonitor-dialog")).toHaveAttribute(
			"data-open",
			"false",
		);
	});
});
