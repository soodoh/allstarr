import { fireEvent } from "@testing-library/react";
import type { ComponentType, JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const moviesRouteMocks = vi.hoisted(() => ({
	downloadProfilesListQuery: vi.fn(() => ({
		queryKey: ["download-profiles", "list"],
	})),
	monitorMovieProfile: {
		isPending: false,
		mutate: vi.fn(),
	},
	movies: [
		{
			downloadProfileIds: [7],
			id: 1,
			title: "Alien",
		},
		{
			downloadProfileIds: [],
			id: 2,
			title: "Blade Runner",
		},
	],
	moviesListQuery: vi.fn(() => ({
		queryKey: ["movies", "list"],
	})),
	pendingSkeletonCount: 0,
	setViewMode: vi.fn(),
	unmonitorMovieProfile: {
		isPending: false,
		mutate: vi.fn(),
	},
	useSuspenseQuery: vi.fn(),
	useViewMode: vi.fn(),
	userSettingsQuery: vi.fn((tableId: string) => ({
		queryKey: ["user-settings", tableId],
	})),
	viewMode: "grid" as "grid" | "table",
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			moviesRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to }: { children: ReactNode; to: string }) => (
		<a href={to} data-testid={`link-${to}`}>
			{children}
		</a>
	),
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("lucide-react", () => ({
	Film: ({ className }: { className?: string }) => (
		<span className={className}>Film</span>
	),
	LayoutGrid: ({ className }: { className?: string }) => (
		<span className={className}>Grid</span>
	),
	List: ({ className }: { className?: string }) => (
		<span className={className}>List</span>
	),
	Pencil: ({ className }: { className?: string }) => (
		<span className={className}>Pencil</span>
	),
	Plus: ({ className }: { className?: string }) => (
		<span className={className}>Plus</span>
	),
	Search: ({ className }: { className?: string }) => (
		<span className={className}>Search</span>
	),
	X: ({ className }: { className?: string }) => (
		<span className={className}>X</span>
	),
}));

vi.mock("src/components/movies/movie-bulk-bar", () => ({
	default: ({
		onDone,
		profiles,
		selectedIds,
	}: {
		onDone: () => void;
		profiles: Array<{ id: number; name: string }>;
		selectedIds: Set<number>;
	}) => (
		<div data-testid="movie-bulk-bar">
			<span data-testid="movie-bulk-bar-selected">
				{selectedIds.size} selected
			</span>
			<span data-testid="movie-bulk-bar-profiles">
				{profiles.map((profile) => profile.name).join(",")}
			</span>
			<button type="button" onClick={onDone}>
				done
			</button>
		</div>
	),
}));

vi.mock("src/components/movies/movie-card", () => ({
	default: ({ movie }: { movie: { id: number; title: string } }) => (
		<article data-testid="movie-card">
			<span>{movie.title}</span>
		</article>
	),
}));

vi.mock("src/components/movies/movie-table", () => ({
	default: ({
		downloadProfiles,
		movies,
		onToggleAll,
		onToggleProfile,
		onToggleSelect,
		selectedIds,
		selectable,
	}: {
		downloadProfiles?: Array<{ id: number; name: string }>;
		movies: Array<{ id: number; title: string }>;
		onToggleAll?: () => void;
		onToggleProfile?: (movieId: number, profileId: number) => void;
		onToggleSelect?: (id: number) => void;
		selectedIds?: Set<number>;
		selectable?: boolean;
	}) => (
		<div data-testid="movie-table">
			<span data-testid="movie-table-movies">
				{movies.map((movie) => movie.title).join(",")}
			</span>
			<span data-testid="movie-table-selectable">
				{String(Boolean(selectable))}
			</span>
			<span data-testid="movie-table-selected-count">
				{String(selectedIds?.size ?? 0)}
			</span>
			<span data-testid="movie-table-profiles">
				{downloadProfiles?.map((profile) => profile.name).join(",") ?? ""}
			</span>
			<button
				type="button"
				onClick={() => onToggleSelect?.(movies[0]?.id ?? 0)}
			>
				select-first
			</button>
			<button type="button" onClick={() => onToggleAll?.()}>
				toggle-all
			</button>
			<button
				type="button"
				onClick={() => onToggleProfile?.(movies[0]?.id ?? 0, 7)}
			>
				toggle-active-profile
			</button>
			<button
				type="button"
				onClick={() => onToggleProfile?.(movies[1]?.id ?? 0, 7)}
			>
				toggle-inactive-profile
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
			placeholder={placeholder}
			value={value}
			onChange={onChange}
			data-testid="search-input"
		/>
	),
}));

vi.mock("src/components/ui/skeleton", () => ({
	default: ({ className }: { className?: string }) => (
		<div className={className} data-testid="skeleton" />
	),
}));

vi.mock("src/hooks/mutations", () => ({
	useMonitorMovieProfile: () => moviesRouteMocks.monitorMovieProfile,
	useUnmonitorMovieProfile: () => moviesRouteMocks.unmonitorMovieProfile,
}));

vi.mock("src/hooks/use-view-mode", () => ({
	default: (...args: unknown[]) => moviesRouteMocks.useViewMode(...args),
}));

vi.mock("src/lib/queries/download-profiles", () => ({
	downloadProfilesListQuery: () => moviesRouteMocks.downloadProfilesListQuery(),
}));

vi.mock("src/lib/queries/movies", () => ({
	moviesListQuery: () => moviesRouteMocks.moviesListQuery(),
}));

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (...args: unknown[]) =>
		moviesRouteMocks.userSettingsQuery(args[0] as string),
}));

import { Route } from "./index";

describe("movies index route", () => {
	beforeEach(() => {
		moviesRouteMocks.downloadProfilesListQuery.mockClear();
		moviesRouteMocks.monitorMovieProfile.mutate.mockClear();
		moviesRouteMocks.movies = [
			{
				downloadProfileIds: [7],
				id: 1,
				title: "Alien",
			},
			{
				downloadProfileIds: [],
				id: 2,
				title: "Blade Runner",
			},
		];
		moviesRouteMocks.moviesListQuery.mockClear();
		moviesRouteMocks.setViewMode.mockClear();
		moviesRouteMocks.unmonitorMovieProfile.mutate.mockClear();
		moviesRouteMocks.useSuspenseQuery.mockReset();
		moviesRouteMocks.useViewMode.mockReset();
		moviesRouteMocks.userSettingsQuery.mockClear();
		moviesRouteMocks.viewMode = "grid";

		moviesRouteMocks.useViewMode.mockImplementation(() => [
			moviesRouteMocks.viewMode,
			moviesRouteMocks.setViewMode,
		]);
		moviesRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey: [string, ...unknown[]] }) => {
				switch (query.queryKey[0]) {
					case "movies":
						return { data: moviesRouteMocks.movies };
					case "download-profiles":
						return {
							data: [
								{ contentType: "movie", id: 7, name: "Movie Profile" },
								{ contentType: "tv", id: 8, name: "TV Profile" },
							],
						};
					default:
						return { data: [] };
				}
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

		expect(moviesRouteMocks.moviesListQuery).toHaveBeenCalledTimes(1);
		expect(moviesRouteMocks.downloadProfilesListQuery).toHaveBeenCalledTimes(1);
		expect(moviesRouteMocks.userSettingsQuery).toHaveBeenCalledWith("movies");
		expect(ensureQueryData).toHaveBeenCalledTimes(3);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["movies", "list"] }),
		);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["download-profiles", "list"] }),
		);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["user-settings", "movies"] }),
		);

		const PendingComponent = routeConfig.pendingComponent;
		const pendingView = renderWithProviders(<PendingComponent />);
		expect(pendingView.getAllByTestId("skeleton").length).toBeGreaterThan(0);
	});

	it("shows the empty state when there are no movies and no search", () => {
		moviesRouteMocks.movies = [];

		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};

		const Component = routeConfig.component;
		const { getByTestId, queryByTestId, queryByPlaceholderText } =
			renderWithProviders(<Component />);

		expect(getByTestId("page-header-title")).toHaveTextContent("Movies");
		expect(getByTestId("empty-state-title")).toHaveTextContent("No movies yet");
		expect(getByTestId("empty-state-description")).toHaveTextContent(
			"Add your first movie to start building your collection.",
		);
		expect(queryByPlaceholderText("Search by title...")).toBeNull();
		expect(queryByTestId("movie-table")).toBeNull();
	});

	it("renders the table path, selection wiring, profile toggles, and mass edit reset", () => {
		moviesRouteMocks.viewMode = "table";

		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};

		const Component = routeConfig.component;
		const { getByTestId, getByText, queryByTestId } = renderWithProviders(
			<Component />,
		);

		expect(getByTestId("page-header-description")).toHaveTextContent(
			"2 movies",
		);
		expect(getByTestId("movie-table")).toBeInTheDocument();
		expect(getByTestId("movie-table-selectable")).toHaveTextContent("false");
		expect(getByTestId("movie-table-movies")).toHaveTextContent(
			"Alien,Blade Runner",
		);
		expect(getByTestId("movie-table-profiles")).toHaveTextContent(
			"Movie Profile",
		);
		expect(getByTestId("column-settings-popover")).toHaveTextContent("movies");

		fireEvent.click(getByText("select-first"));
		expect(getByTestId("movie-table-selected-count")).toHaveTextContent("1");

		fireEvent.click(getByText("select-first"));
		expect(getByTestId("movie-table-selected-count")).toHaveTextContent("0");

		fireEvent.click(getByText("toggle-all"));
		expect(getByTestId("movie-table-selected-count")).toHaveTextContent("2");

		fireEvent.click(getByText("toggle-all"));
		expect(getByTestId("movie-table-selected-count")).toHaveTextContent("0");

		fireEvent.click(getByText("select-first"));
		expect(getByTestId("movie-table-selected-count")).toHaveTextContent("1");

		fireEvent.click(getByText("toggle-active-profile"));
		expect(moviesRouteMocks.unmonitorMovieProfile.mutate).toHaveBeenCalledWith({
			downloadProfileId: 7,
			movieId: 1,
		});

		fireEvent.click(getByText("toggle-inactive-profile"));
		expect(moviesRouteMocks.monitorMovieProfile.mutate).toHaveBeenCalledWith({
			downloadProfileId: 7,
			movieId: 2,
		});

		fireEvent.click(getByText("Mass Editor"));
		expect(getByTestId("movie-table-selectable")).toHaveTextContent("true");
		expect(getByTestId("movie-bulk-bar")).toBeInTheDocument();
		expect(getByTestId("movie-bulk-bar-selected")).toHaveTextContent(
			"1 selected",
		);
		expect(getByTestId("movie-bulk-bar-profiles")).toHaveTextContent(
			"Movie Profile",
		);

		fireEvent.click(getByText("Cancel"));
		expect(queryByTestId("movie-bulk-bar")).toBeNull();
		expect(getByTestId("movie-table-selected-count")).toHaveTextContent("0");
		expect(getByTestId("movie-table-selectable")).toHaveTextContent("false");
	});

	it("renders the grid path, search filtering, and view toggle wiring", () => {
		moviesRouteMocks.viewMode = "grid";

		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};

		const Component = routeConfig.component;
		const { getByPlaceholderText, getByTestId, getByText, queryAllByTestId } =
			renderWithProviders(<Component />);

		expect(getByTestId("page-header-description")).toHaveTextContent(
			"2 movies",
		);
		expect(queryAllByTestId("movie-card")).toHaveLength(2);
		expect(getByText("Alien")).toBeInTheDocument();
		expect(getByText("Blade Runner")).toBeInTheDocument();

		fireEvent.change(getByPlaceholderText("Search by title..."), {
			target: { value: "alien" },
		});

		expect(getByTestId("page-header-description")).toHaveTextContent(
			"1 matching movies",
		);
		expect(queryAllByTestId("movie-card")).toHaveLength(1);
		expect(getByText("Alien")).toBeInTheDocument();

		fireEvent.click(getByText("List"));
		fireEvent.click(getByText("Grid"));
		expect(moviesRouteMocks.setViewMode).toHaveBeenCalledWith("table");
		expect(moviesRouteMocks.setViewMode).toHaveBeenCalledWith("grid");
	});
});
