import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const movieDetailRouteMocks = vi.hoisted(() => ({
	downloadProfilesListQuery: vi.fn(() => ({
		queryKey: ["download-profiles", "list"],
	})),
	movieDetailQuery: vi.fn((id: number) => ({
		queryKey: ["movie-detail", id],
	})),
	movieFilesTabCalls: [] as Array<Array<{ path: string }>>,
	notFound: vi.fn(() => new Error("not-found")),
	params: {
		movieId: "9",
	},
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			movieDetailRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => ({
		...(config as Record<string, unknown>),
		useParams: () => movieDetailRouteMocks.params,
	}),
	notFound: () => movieDetailRouteMocks.notFound(),
}));

vi.mock("src/components/movies/movie-detail-header", () => ({
	default: ({
		downloadProfiles,
		movie,
	}: {
		downloadProfiles: Array<{ id: number; name: string }>;
		movie: { title: string };
	}) => (
		<div>
			header:{movie.title}:
			{downloadProfiles.map((profile) => profile.name).join(",")}
		</div>
	),
}));

vi.mock("src/components/movies/movie-files-tab", () => ({
	default: ({ files }: { files: Array<{ path: string }> }) => {
		movieDetailRouteMocks.movieFilesTabCalls.push(files);
		return <div>files:{files.map((file) => file.path).join(",")}</div>;
	},
}));

vi.mock("src/components/NotFound", () => ({
	default: () => <div>Missing movie</div>,
}));

vi.mock("src/components/shared/loading-skeleton", () => ({
	SKELETON_KEYS: Array.from({ length: 20 }, (_, index) => `skeleton-${index}`),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => (
		<section>{children}</section>
	),
	CardContent: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
}));

vi.mock("src/components/ui/skeleton", () => ({
	default: ({ className }: { className?: string }) => (
		<div className={className}>skeleton</div>
	),
}));

vi.mock("src/components/ui/tabs", async () => {
	const React = await import("react");
	const TabsContext = React.createContext<{
		onValueChange?: (value: string) => void;
		value: string;
	}>({ value: "" });

	return {
		Tabs: ({
			children,
			onValueChange,
			value,
		}: {
			children: ReactNode;
			onValueChange?: (value: string) => void;
			value: string;
		}) => (
			<TabsContext.Provider value={{ onValueChange, value }}>
				<div>{children}</div>
			</TabsContext.Provider>
		),
		TabsContent: ({
			children,
			value,
		}: {
			children: ReactNode;
			value: string;
		}) => {
			const context = React.useContext(TabsContext);
			return context.value === value ? <div>{children}</div> : null;
		},
		TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		TabsTrigger: ({
			children,
			value,
		}: {
			children: ReactNode;
			value: string;
		}) => {
			const context = React.useContext(TabsContext);
			return (
				<button onClick={() => context.onValueChange?.(value)} type="button">
					{children}
				</button>
			);
		},
	};
});

vi.mock("src/lib/queries", () => ({
	downloadProfilesListQuery: () =>
		movieDetailRouteMocks.downloadProfilesListQuery(),
	movieDetailQuery: (id: number) => movieDetailRouteMocks.movieDetailQuery(id),
}));

import { Route } from "./$movieId";

describe("movie detail route", () => {
	beforeEach(() => {
		movieDetailRouteMocks.downloadProfilesListQuery.mockClear();
		movieDetailRouteMocks.movieDetailQuery.mockClear();
		movieDetailRouteMocks.movieFilesTabCalls = [];
		movieDetailRouteMocks.notFound.mockClear();
		movieDetailRouteMocks.params.movieId = "9";
		movieDetailRouteMocks.useSuspenseQuery.mockReset();
	});

	it("rejects invalid ids and converts missing-movie loader errors into notFound", async () => {
		const routeConfig = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: (query: unknown) => Promise<unknown>;
					};
				};
				params: { movieId: string };
			}) => Promise<unknown>;
		};

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData: vi.fn(),
					},
				},
				params: { movieId: "-1" },
			}),
		).rejects.toThrow("not-found");

		const ensureQueryData = vi
			.fn()
			.mockRejectedValueOnce(new Error("movie not found"))
			.mockResolvedValueOnce([]);

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData,
					},
				},
				params: { movieId: "9" },
			}),
		).rejects.toThrow("not-found");

		expect(movieDetailRouteMocks.movieDetailQuery).toHaveBeenCalledWith(9);
		expect(
			movieDetailRouteMocks.downloadProfilesListQuery,
		).toHaveBeenCalledTimes(1);

		const nullMovieEnsureQueryData = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce([]);

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData: nullMovieEnsureQueryData,
					},
				},
				params: { movieId: "9" },
			}),
		).rejects.toThrow("not-found");

		const upstreamError = new Error("boom");
		const unexpectedEnsureQueryData = vi
			.fn()
			.mockRejectedValueOnce(upstreamError)
			.mockResolvedValueOnce([]);

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData: unexpectedEnsureQueryData,
					},
				},
				params: { movieId: "9" },
			}),
		).rejects.toBe(upstreamError);
	});

	it("renders not found for missing data and switches between overview and files tabs", async () => {
		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
			pendingComponent: () => JSX.Element;
		};
		const Component = routeConfig.component;

		movieDetailRouteMocks.useSuspenseQuery
			.mockReturnValueOnce({ data: null })
			.mockReturnValueOnce({ data: [] });

		const missingView = await renderWithProviders(<Component />);
		await expect
			.element(missingView.getByText("Missing movie"))
			.toBeInTheDocument();

		movieDetailRouteMocks.useSuspenseQuery.mockReset();
		movieDetailRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey: [string, ...unknown[]] }) => {
				if (query.queryKey[0] === "movie-detail") {
					return {
						data: {
							files: [{ path: "/movies/alien.mkv" }],
							id: 9,
							overview: "",
							title: "Alien",
						},
					};
				}

				return {
					data: [{ id: 7, name: "4K" }],
				};
			},
		);

		await renderWithProviders(<Component />);

		await expect.element(page.getByText("header:Alien:4K")).toBeInTheDocument();
		await expect
			.element(page.getByText("No overview available."))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("files:/movies/alien.mkv"))
			.not.toBeInTheDocument();

		await page.getByRole("button", { name: "Files" }).click();

		await expect
			.element(page.getByText("files:/movies/alien.mkv"))
			.toBeInTheDocument();
		expect(movieDetailRouteMocks.movieFilesTabCalls[0]).toEqual([
			{ path: "/movies/alien.mkv" },
		]);

		const PendingComponent = routeConfig.pendingComponent;
		const pendingView = await renderWithProviders(<PendingComponent />);
		expect(
			pendingView.container.querySelectorAll(".h-4.w-20").length,
		).toBeGreaterThan(0);
	});
});
