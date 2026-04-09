import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showDetailRouteMocks = vi.hoisted(() => ({
	downloadProfilesListQuery: vi.fn(() => ({
		queryKey: ["download-profiles", "list"],
	})),
	notFound: vi.fn(() => new Error("not-found")),
	params: {
		showId: "7",
	},
	seasonAccordionCalls: [] as Array<{
		downloadProfiles: Array<{ contentType?: string; id: number; name: string }>;
		season: { id: number; seasonNumber: number };
		seriesType: string;
	}>,
	showDetailQuery: vi.fn((id: number) => ({
		queryKey: ["show-detail", id],
	})),
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			showDetailRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => ({
		...(config as Record<string, unknown>),
		useParams: () => showDetailRouteMocks.params,
	}),
	notFound: () => showDetailRouteMocks.notFound(),
}));

vi.mock("src/components/NotFound", () => ({
	default: () => <div>Missing show</div>,
}));

vi.mock("src/components/shared/loading-skeleton", () => ({
	SKELETON_KEYS: Array.from({ length: 20 }, (_, index) => `skeleton-${index}`),
}));

vi.mock("src/components/tv/season-accordion", () => ({
	default: ({
		downloadProfiles,
		season,
		seriesType,
	}: {
		downloadProfiles: Array<{ contentType?: string; id: number; name: string }>;
		season: { id: number; seasonNumber: number };
		seriesType: string;
	}) => {
		showDetailRouteMocks.seasonAccordionCalls.push({
			downloadProfiles,
			season,
			seriesType,
		});

		return (
			<div>
				season:{season.seasonNumber}:profiles:
				{downloadProfiles.map((profile) => profile.name).join(",")}
			</div>
		);
	},
}));

vi.mock("src/components/tv/show-detail-header", () => ({
	default: ({
		downloadProfiles,
		show,
	}: {
		downloadProfiles: Array<{ id: number; name: string }>;
		show: { title: string };
	}) => (
		<div>
			header:{show.title}:
			{downloadProfiles.map((profile) => profile.name).join(",")}
		</div>
	),
}));

vi.mock("src/components/ui/accordion", () => ({
	Accordion: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

vi.mock("src/lib/queries", () => ({
	downloadProfilesListQuery: () =>
		showDetailRouteMocks.downloadProfilesListQuery(),
	showDetailQuery: (id: number) => showDetailRouteMocks.showDetailQuery(id),
}));

import { Route } from "./$showId";

describe("show detail route", () => {
	beforeEach(() => {
		showDetailRouteMocks.downloadProfilesListQuery.mockClear();
		showDetailRouteMocks.notFound.mockClear();
		showDetailRouteMocks.params.showId = "7";
		showDetailRouteMocks.seasonAccordionCalls = [];
		showDetailRouteMocks.showDetailQuery.mockClear();
		showDetailRouteMocks.useSuspenseQuery.mockReset();
	});

	it("rejects invalid ids and converts missing-show loader errors into notFound", async () => {
		const routeConfig = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: (query: unknown) => Promise<unknown>;
					};
				};
				params: { showId: string };
			}) => Promise<unknown>;
		};

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData: vi.fn(),
					},
				},
				params: { showId: "0" },
			}),
		).rejects.toThrow("not-found");

		const ensureQueryData = vi
			.fn()
			.mockRejectedValueOnce(new Error("show not found"))
			.mockResolvedValueOnce([]);

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData,
					},
				},
				params: { showId: "7" },
			}),
		).rejects.toThrow("not-found");

		expect(showDetailRouteMocks.showDetailQuery).toHaveBeenCalledWith(7);
		expect(
			showDetailRouteMocks.downloadProfilesListQuery,
		).toHaveBeenCalledTimes(1);

		const nullShowEnsureQueryData = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce([]);

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData: nullShowEnsureQueryData,
					},
				},
				params: { showId: "7" },
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
				params: { showId: "7" },
			}),
		).rejects.toBe(upstreamError);
	});

	it("renders not found for missing data and otherwise sorts seasons with filtered profiles", () => {
		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
			pendingComponent: () => JSX.Element;
		};
		const Component = routeConfig.component;

		showDetailRouteMocks.useSuspenseQuery
			.mockReturnValueOnce({ data: null })
			.mockReturnValueOnce({ data: [] });

		const missingView = renderWithProviders(<Component />);
		expect(missingView.getByText("Missing show")).toBeInTheDocument();

		showDetailRouteMocks.useSuspenseQuery.mockReset();
		showDetailRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey: [string, ...unknown[]] }) => {
				if (query.queryKey[0] === "show-detail") {
					return {
						data: {
							downloadProfileIds: [11, 13],
							files: [],
							id: 7,
							seasons: [
								{ id: 1, seasonNumber: 1 },
								{ id: 2, seasonNumber: 0 },
								{ id: 3, seasonNumber: 3 },
							],
							seriesType: "anime",
							title: "Severance",
						},
					};
				}

				return {
					data: [
						{ contentType: "tv", id: 11, name: "4K" },
						{ contentType: "movie", id: 12, name: "Movie Profile" },
						{ contentType: "tv", id: 13, name: "Anime" },
					],
				};
			},
		);

		const { container, getByText } = renderWithProviders(<Component />);

		expect(
			getByText("header:Severance:4K,Movie Profile,Anime"),
		).toBeInTheDocument();
		expect(getByText("season:3:profiles:4K,Anime")).toBeInTheDocument();
		expect(getByText("season:1:profiles:4K,Anime")).toBeInTheDocument();
		expect(getByText("season:0:profiles:4K,Anime")).toBeInTheDocument();
		expect(
			showDetailRouteMocks.seasonAccordionCalls.map(
				(call) => call.season.seasonNumber,
			),
		).toEqual([3, 1, 0]);
		expect(showDetailRouteMocks.seasonAccordionCalls[0]?.seriesType).toBe(
			"anime",
		);
		expect(
			showDetailRouteMocks.seasonAccordionCalls[0]?.downloadProfiles.map(
				(profile) => profile.id,
			),
		).toEqual([11, 13]);

		const PendingComponent = routeConfig.pendingComponent;
		const pendingView = renderWithProviders(<PendingComponent />);
		expect(
			pendingView.container.querySelectorAll(".h-4.w-20").length,
		).toBeGreaterThan(0);
		expect(container.querySelectorAll("section").length).toBe(1);
	});
});
