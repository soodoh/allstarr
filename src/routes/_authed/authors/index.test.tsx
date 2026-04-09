import { fireEvent } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authorsRouteMocks = vi.hoisted(() => {
	let observerCallback:
		| ((entries: IntersectionObserverEntry[]) => void)
		| undefined;

	return {
		AuthorCardsSkeleton: () => <div data-testid="author-cards-skeleton" />,
		AuthorTableRowsSkeleton: () => (
			<div data-testid="author-table-rows-skeleton" />
		),
		authors: [
			{
				bookCount: 12,
				id: 1,
				images: [],
				name: "Isaac Asimov",
			},
			{
				bookCount: 3,
				id: 2,
				images: [],
				name: "Ursula K. Le Guin",
			},
		],
		authorsInfiniteQuery: vi.fn((search = "") => ({
			queryKey: ["authors", "infinite", search],
		})),
		fetchNextPage: vi.fn(),
		hasNextPage: true,
		isFetchingNextPage: false,
		isLoading: false,
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
		useInfiniteQuery: vi.fn(),
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
			authorsRouteMocks.useInfiniteQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("lucide-react", () => ({
	LayoutGrid: ({ className }: { className?: string }) => (
		<span className={className}>Grid</span>
	),
	List: ({ className }: { className?: string }) => (
		<span className={className}>List</span>
	),
	Search: ({ className }: { className?: string }) => (
		<span className={className}>Search</span>
	),
	Users: ({ className }: { className?: string }) => (
		<span className={className}>Users</span>
	),
}));

vi.mock("src/components/bookshelf/authors/author-card", () => ({
	default: ({ author }: { author: { name: string } }) => (
		<article data-testid="author-card">{author.name}</article>
	),
}));

vi.mock("src/components/bookshelf/authors/author-table", () => ({
	default: ({
		authors,
		children,
	}: {
		authors: Array<{ name: string }>;
		children?: ReactNode;
	}) => (
		<div data-testid="author-table">
			<span data-testid="author-table-items">
				{authors.map((author) => author.name).join(",")}
			</span>
			{children}
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
	AuthorCardsSkeleton: authorsRouteMocks.AuthorCardsSkeleton,
	AuthorTableRowsSkeleton: authorsRouteMocks.AuthorTableRowsSkeleton,
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

vi.mock("src/hooks/use-view-mode", () => ({
	default: (...args: unknown[]) => authorsRouteMocks.useViewMode(...args),
}));

vi.mock("src/lib/queries", () => ({
	authorsInfiniteQuery: (...args: unknown[]) =>
		authorsRouteMocks.authorsInfiniteQuery(...args),
}));

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (...args: unknown[]) =>
		authorsRouteMocks.userSettingsQuery(...args),
}));

import { Route } from "./index";

describe("AuthorsRoute", () => {
	beforeEach(() => {
		authorsRouteMocks.viewMode = "grid";
		authorsRouteMocks.hasNextPage = true;
		authorsRouteMocks.isFetchingNextPage = false;
		authorsRouteMocks.isLoading = false;
		authorsRouteMocks.observe.mockReset();
		authorsRouteMocks.fetchNextPage.mockReset();
		authorsRouteMocks.setViewMode.mockReset();
		authorsRouteMocks.authorsInfiniteQuery.mockClear();
		authorsRouteMocks.userSettingsQuery.mockClear();
		authorsRouteMocks.useViewMode.mockImplementation(() => [
			authorsRouteMocks.viewMode,
			authorsRouteMocks.setViewMode,
		]);
		authorsRouteMocks.useInfiniteQuery.mockImplementation(() => ({
			data: {
				pages: [
					{
						items: authorsRouteMocks.authors,
						total: authorsRouteMocks.authors.length,
					},
				],
			},
			fetchNextPage: authorsRouteMocks.fetchNextPage,
			hasNextPage: authorsRouteMocks.hasNextPage,
			isFetchingNextPage: authorsRouteMocks.isFetchingNextPage,
			isLoading: authorsRouteMocks.isLoading,
		}));

		class MockIntersectionObserver implements IntersectionObserver {
			root = null;
			rootMargin = "200px";
			thresholds = [];

			constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
				authorsRouteMocks.setObserverCallback(callback);
			}

			disconnect = vi.fn();
			observe = authorsRouteMocks.observe;
			takeRecords = () => [];
			unobserve = vi.fn();
		}

		globalThis.IntersectionObserver =
			MockIntersectionObserver as typeof IntersectionObserver;
	});

	it("wires the loader and renders the empty state for an empty bookshelf", async () => {
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

		expect(authorsRouteMocks.authorsInfiniteQuery).toHaveBeenCalledWith();
		expect(prefetchInfiniteQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["authors", "infinite", ""],
			}),
		);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["user-settings", "authors"],
			}),
		);

		authorsRouteMocks.useInfiniteQuery.mockImplementation(() => ({
			data: {
				pages: [
					{
						items: [],
						total: 0,
					},
				],
			},
			fetchNextPage: authorsRouteMocks.fetchNextPage,
			hasNextPage: false,
			isFetchingNextPage: false,
			isLoading: false,
		}));

		const { getByTestId } = renderWithProviders(<routeConfig.component />);
		expect(getByTestId("page-header-title")).toHaveTextContent("Authors");
		expect(getByTestId("empty-state-title")).toHaveTextContent(
			"No authors yet",
		);
		expect(getByTestId("empty-state-description")).toHaveTextContent(
			"Search Hardcover to add your first author.",
		);
	});

	it("renders grid mode, reacts to search, toggles views, and fetches the next page", () => {
		const routeConfig = Route as unknown as {
			component: () => ReactNode;
		};

		const { getAllByTestId, getByTestId, getByText } = renderWithProviders(
			<routeConfig.component />,
		);

		expect(getByTestId("page-header-description")).toHaveTextContent(
			"2 authors on your bookshelf",
		);
		expect(getAllByTestId("author-card")).toHaveLength(2);
		expect(authorsRouteMocks.observe).toHaveBeenCalledTimes(1);

		fireEvent.change(getByTestId("search-input"), {
			target: { value: "asimov" },
		});
		expect(authorsRouteMocks.authorsInfiniteQuery).toHaveBeenLastCalledWith(
			"asimov",
		);
		expect(getByTestId("page-header-description")).toHaveTextContent(
			"2 matching authors",
		);

		fireEvent.click(getByText("List"));
		expect(authorsRouteMocks.setViewMode).toHaveBeenCalledWith("table");

		authorsRouteMocks.triggerIntersection({ isIntersecting: true });
		expect(authorsRouteMocks.fetchNextPage).toHaveBeenCalledTimes(1);
	});

	it("renders table mode with loading rows and skips fetches while already loading", () => {
		authorsRouteMocks.viewMode = "table";
		authorsRouteMocks.isFetchingNextPage = true;

		const routeConfig = Route as unknown as {
			component: () => ReactNode;
		};
		const { getByTestId, queryAllByTestId } = renderWithProviders(
			<routeConfig.component />,
		);

		expect(getByTestId("column-settings-popover")).toHaveTextContent("authors");
		expect(getByTestId("author-table-items")).toHaveTextContent(
			"Isaac Asimov,Ursula K. Le Guin",
		);
		expect(getByTestId("author-table-rows-skeleton")).toBeInTheDocument();
		expect(queryAllByTestId("author-card")).toHaveLength(0);

		fireEvent.click(getByTestId("search-input"));
		authorsRouteMocks.triggerIntersection({ isIntersecting: true });
		expect(authorsRouteMocks.fetchNextPage).not.toHaveBeenCalled();
	});
});
