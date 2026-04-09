import userEvent from "@testing-library/user-event";
import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const collectionsRouteMocks = vi.hoisted(() => ({
	baseCollections: [
		{
			id: 1,
			monitored: true,
			missingMovies: 0,
			sortTitle: "Alien Anthology",
			title: "Alien Anthology",
			movies: [
				{
					isExcluded: false,
					isExisting: true,
					movieId: 11,
					overview: "Ripley returns.",
					posterUrl: "/alien.jpg",
					title: "Alien",
					tmdbId: 101,
					year: 1979,
				},
				{
					isExcluded: false,
					isExisting: false,
					movieId: null,
					overview: "Deckard returns.",
					posterUrl: "/blade.jpg",
					title: "Blade Runner",
					tmdbId: 102,
					year: 1982,
				},
			],
		},
		{
			id: 2,
			monitored: false,
			missingMovies: 2,
			sortTitle: "Back to the Future",
			title: "Back to the Future",
			movies: [
				{
					isExcluded: false,
					isExisting: true,
					movieId: 21,
					overview: "A time travel classic.",
					posterUrl: "/future.jpg",
					title: "Back to the Future",
					tmdbId: 201,
					year: 1985,
				},
				{
					isExcluded: false,
					isExisting: false,
					movieId: null,
					overview: "The sequel returns.",
					posterUrl: "/future2.jpg",
					title: "Back to the Future Part II",
					tmdbId: 202,
					year: 1989,
				},
			],
		},
		{
			id: 3,
			monitored: true,
			missingMovies: 1,
			sortTitle: "Dune Collection",
			title: "Dune Collection",
			movies: [
				{
					isExcluded: false,
					isExisting: true,
					movieId: 31,
					overview: "Desert power.",
					posterUrl: "/dune.jpg",
					title: "Dune",
					tmdbId: 301,
					year: 2021,
				},
				{
					isExcluded: false,
					isExisting: false,
					movieId: null,
					overview: "The sequel arrives.",
					posterUrl: "/dune2.jpg",
					title: "Dune: Part Two",
					tmdbId: 302,
					year: 2024,
				},
			],
		},
	],
	collections: [
		{
			id: 1,
			monitored: true,
			missingMovies: 0,
			sortTitle: "Alien Anthology",
			title: "Alien Anthology",
			movies: [
				{
					isExcluded: false,
					isExisting: true,
					movieId: 11,
					overview: "Ripley returns.",
					posterUrl: "/alien.jpg",
					title: "Alien",
					tmdbId: 101,
					year: 1979,
				},
				{
					isExcluded: false,
					isExisting: false,
					movieId: null,
					overview: "Deckard returns.",
					posterUrl: "/blade.jpg",
					title: "Blade Runner",
					tmdbId: 102,
					year: 1982,
				},
			],
		},
		{
			id: 2,
			monitored: false,
			missingMovies: 2,
			sortTitle: "Back to the Future",
			title: "Back to the Future",
			movies: [
				{
					isExcluded: false,
					isExisting: true,
					movieId: 21,
					overview: "A time travel classic.",
					posterUrl: "/future.jpg",
					title: "Back to the Future",
					tmdbId: 201,
					year: 1985,
				},
				{
					isExcluded: false,
					isExisting: false,
					movieId: null,
					overview: "The sequel returns.",
					posterUrl: "/future2.jpg",
					title: "Back to the Future Part II",
					tmdbId: 202,
					year: 1989,
				},
			],
		},
		{
			id: 3,
			monitored: true,
			missingMovies: 1,
			sortTitle: "Dune Collection",
			title: "Dune Collection",
			movies: [
				{
					isExcluded: false,
					isExisting: true,
					movieId: 31,
					overview: "Desert power.",
					posterUrl: "/dune.jpg",
					title: "Dune",
					tmdbId: 301,
					year: 2021,
				},
				{
					isExcluded: false,
					isExisting: false,
					movieId: null,
					overview: "The sequel arrives.",
					posterUrl: "/dune2.jpg",
					title: "Dune: Part Two",
					tmdbId: 302,
					year: 2024,
				},
			],
		},
	],
	refreshCollections: {
		isPending: false,
		mutate: vi.fn(),
	},
	excludeMovie: {
		mutate: vi.fn(),
	},
	updateCollection: {
		mutate: vi.fn(),
	},
	useSuspenseQuery: vi.fn(),
	movieCollectionsListQuery: vi.fn(() => ({
		queryKey: ["movie-collections", "list"],
	})),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: unknown[]) =>
			collectionsRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/components/movies/add-missing-movies-dialog", () => ({
	default: ({
		collection,
		open,
		onOpenChange,
	}: {
		collection: { title: string } | null;
		open: boolean;
		onOpenChange: (open: boolean) => void;
	}) =>
		open ? (
			<div data-testid="add-missing-dialog">
				Add missing: {collection?.title}
				<button type="button" onClick={() => onOpenChange(false)}>
					Close Add Missing
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/movies/collection-card", () => ({
	default: ({
		collection,
		onAddMissing,
		onAddMovie,
		onEdit,
		onExcludeMovie,
		onToggleMonitor,
	}: {
		collection: {
			id: number;
			missingMovies: number;
			movies: Array<{
				isExcluded: boolean;
				isExisting: boolean;
				movieId: number | null;
				overview: string;
				posterUrl: string | null;
				title: string;
				tmdbId: number;
				year: number | null;
			}>;
			title: string;
		};
		onAddMissing: (collection: unknown) => void;
		onAddMovie: (movie: unknown) => void;
		onEdit: (collection: unknown) => void;
		onExcludeMovie: (movie: unknown) => void;
		onToggleMonitor: (collection: unknown) => void;
	}) => (
		<article data-testid="collection-card">
			<span data-testid="collection-title">{collection.title}</span>
			<span data-testid="collection-missing">
				{String(collection.missingMovies)}
			</span>
			<button type="button" onClick={() => onEdit(collection)}>
				Edit
			</button>
			<button type="button" onClick={() => onAddMissing(collection)}>
				Add Missing
			</button>
			<button type="button" onClick={() => onToggleMonitor(collection)}>
				Toggle Monitor
			</button>
			<button type="button" onClick={() => onAddMovie(collection.movies[1])}>
				Preview Missing Movie
			</button>
			<button
				type="button"
				onClick={() => onExcludeMovie(collection.movies[0])}
			>
				Exclude Existing Movie
			</button>
		</article>
	),
}));

vi.mock("src/components/movies/edit-collection-dialog", () => ({
	default: ({
		collection,
		open,
		onOpenChange,
	}: {
		collection: { title: string } | null;
		open: boolean;
		onOpenChange: (open: boolean) => void;
	}) =>
		open ? (
			<div data-testid="edit-dialog">
				<span>{collection?.title}</span>
				<button type="button" onClick={() => onOpenChange(false)}>
					Close Edit
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/movies/tmdb-movie-search", () => ({
	MoviePreviewModal: ({
		movie,
		open,
		onOpenChange,
	}: {
		movie: { title: string };
		open: boolean;
		onOpenChange: (open: boolean) => void;
	}) =>
		open ? (
			<div data-testid="movie-preview-modal">
				<span>{movie.title}</span>
				<button type="button" onClick={() => onOpenChange(false)}>
					Close Preview
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/shared/empty-state", () => ({
	default: ({
		description,
		title,
	}: {
		description: string;
		icon: unknown;
		title: string;
	}) => (
		<div data-testid="empty-state">
			<span data-testid="empty-state-title">{title}</span>
			<span data-testid="empty-state-description">{description}</span>
		</div>
	),
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
		className,
		disabled,
		onClick,
		type,
	}: {
		children: ReactNode;
		className?: string;
		disabled?: boolean;
		onClick?: () => void;
		type?: "button";
	}) => (
		<button
			className={className}
			disabled={disabled}
			onClick={onClick}
			type={type ?? "button"}
		>
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

vi.mock("src/components/ui/select", () => ({
	Select: ({
		children,
		onValueChange,
		value,
	}: {
		children: ReactNode;
		onValueChange?: (value: string) => void;
		value?: string;
	}) => (
		<select
			data-testid="sort-select"
			onChange={(event) => onValueChange?.(event.target.value)}
			value={value}
		>
			{children}
		</select>
	),
	SelectContent: ({ children }: { children: ReactNode }) => children,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => children,
	SelectValue: () => null,
}));

vi.mock("src/components/ui/skeleton", () => ({
	default: ({ className }: { className?: string }) => (
		<div className={className} data-testid="skeleton" />
	),
}));

vi.mock("src/components/ui/tooltip", () => ({
	TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("src/hooks/mutations/movie-collections", () => ({
	useAddMovieImportExclusion: () => collectionsRouteMocks.excludeMovie,
	useRefreshCollections: () => collectionsRouteMocks.refreshCollections,
	useUpdateMovieCollection: () => collectionsRouteMocks.updateCollection,
}));

vi.mock("src/lib/queries/movie-collections", () => ({
	movieCollectionsListQuery: () =>
		collectionsRouteMocks.movieCollectionsListQuery(),
}));

vi.mock("src/lib/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
	resizeTmdbUrl: (url: string | null, size: string) => `resized:${url}:${size}`,
}));

import { Route } from "./collections";

describe("collections route", () => {
	beforeEach(() => {
		collectionsRouteMocks.collections =
			collectionsRouteMocks.baseCollections.map((collection) => ({
				...collection,
				movies: collection.movies.map((movie) => ({ ...movie })),
			}));
		collectionsRouteMocks.excludeMovie.mutate.mockReset();
		collectionsRouteMocks.movieCollectionsListQuery.mockClear();
		collectionsRouteMocks.refreshCollections.isPending = false;
		collectionsRouteMocks.refreshCollections.mutate.mockReset();
		collectionsRouteMocks.updateCollection.mutate.mockReset();
		collectionsRouteMocks.useSuspenseQuery.mockReset();
		collectionsRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey: [string, ...unknown[]] }) => {
				if (query.queryKey[0] === "movie-collections") {
					return { data: collectionsRouteMocks.collections };
				}
				return { data: [] };
			},
		);
	});

	it("wires the loader and pending skeleton", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown> | unknown;
			pendingComponent: () => JSX.Element;
		};

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(
			collectionsRouteMocks.movieCollectionsListQuery,
		).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["movie-collections", "list"] }),
		);

		const PendingComponent = routeConfig.pendingComponent;
		const { getAllByTestId } = renderWithProviders(<PendingComponent />);
		expect(getAllByTestId("skeleton").length).toBeGreaterThan(0);
	});

	it("shows the empty state when no collections exist", () => {
		collectionsRouteMocks.collections = [];

		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};

		const Component = routeConfig.component;
		const { getByTestId } = renderWithProviders(<Component />);

		expect(getByTestId("page-header-title")).toHaveTextContent("Collections");
		expect(getByTestId("empty-state-title")).toHaveTextContent(
			"No collections found",
		);
		expect(getByTestId("empty-state-description")).toHaveTextContent(
			"Collections are automatically discovered when you add movies that belong to a TMDB collection.",
		);
	});

	it("filters, sorts, refreshes, and opens the collection dialogs", async () => {
		const user = userEvent.setup();
		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};

		const Component = routeConfig.component;
		const { getAllByTestId, getByRole, getByTestId, getByText, queryByTestId } =
			renderWithProviders(<Component />);

		expect(getByTestId("page-header-description")).toHaveTextContent(
			"3 collections",
		);
		expect(
			getAllByTestId("collection-card").map((card) => card.textContent),
		).toEqual([
			"Alien Anthology0EditAdd MissingToggle MonitorPreview Missing MovieExclude Existing Movie",
			"Back to the Future2EditAdd MissingToggle MonitorPreview Missing MovieExclude Existing Movie",
			"Dune Collection1EditAdd MissingToggle MonitorPreview Missing MovieExclude Existing Movie",
		]);

		await user.click(getByRole("button", { name: "missing" }));
		expect(
			getAllByTestId("collection-card").map(
				(card) =>
					card.querySelector("[data-testid='collection-title']")?.textContent,
			),
		).toEqual(["Back to the Future", "Dune Collection"]);

		await user.selectOptions(getByTestId("sort-select"), "missing");
		expect(
			getAllByTestId("collection-card").map(
				(card) =>
					card.querySelector("[data-testid='collection-title']")?.textContent,
			),
		).toEqual(["Back to the Future", "Dune Collection"]);

		await user.type(getByTestId("search-input"), "dune");
		expect(
			getAllByTestId("collection-card").map(
				(card) =>
					card.querySelector("[data-testid='collection-title']")?.textContent,
			),
		).toEqual(["Dune Collection"]);

		await user.click(getByRole("button", { name: "Refresh All" }));
		expect(
			collectionsRouteMocks.refreshCollections.mutate,
		).toHaveBeenCalledTimes(1);

		await user.click(getByRole("button", { name: "Edit" }));
		expect(getByTestId("edit-dialog")).toHaveTextContent("Dune Collection");
		await user.click(getByText("Close Edit"));
		expect(queryByTestId("edit-dialog")).toBeNull();

		await user.click(getByRole("button", { name: "Add Missing" }));
		expect(getByTestId("add-missing-dialog")).toHaveTextContent(
			"Dune Collection",
		);
		await user.click(getByText("Close Add Missing"));

		await user.click(getByRole("button", { name: "Preview Missing Movie" }));
		expect(getByTestId("movie-preview-modal")).toHaveTextContent(
			"Dune: Part Two",
		);
		await user.click(getByText("Close Preview"));
		expect(queryByTestId("movie-preview-modal")).toBeNull();

		await user.click(getByRole("button", { name: "Toggle Monitor" }));
		expect(collectionsRouteMocks.updateCollection.mutate).toHaveBeenCalledWith({
			id: 3,
			monitored: false,
		});

		await user.click(getByRole("button", { name: "Exclude Existing Movie" }));
		expect(collectionsRouteMocks.excludeMovie.mutate).toHaveBeenCalledWith({
			tmdbId: 301,
			title: "Dune",
			year: 2021,
		});
	});
});
