import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

type QueryState = {
	data?: unknown;
	isLoading?: boolean;
};

const episodeGroupAccordionMocks = vi.hoisted(() => {
	const queryStates = new Map<string, QueryState>();
	return {
		queryStates,
		useQueries: vi.fn(
			({
				queries,
			}: {
				queries: Array<{
					enabled?: boolean;
					queryKey: readonly unknown[];
				}>;
			}) =>
				queries.map((query) => {
					if (query.enabled === false) {
						return { data: undefined, isLoading: false };
					}

					return (
						queryStates.get(JSON.stringify(query.queryKey)) ?? {
							data: undefined,
							isLoading: false,
						}
					);
				}),
		),
		useQuery: vi.fn(
			({
				enabled,
				queryKey,
			}: {
				enabled?: boolean;
				queryKey: readonly unknown[];
			}) => {
				if (enabled === false) {
					return { data: undefined, isLoading: false };
				}

				return (
					queryStates.get(JSON.stringify(queryKey)) ?? {
						data: undefined,
						isLoading: false,
					}
				);
			},
		),
	};
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQueries: (
			...args: Parameters<typeof episodeGroupAccordionMocks.useQueries>
		) => episodeGroupAccordionMocks.useQueries(...args),
		useQuery: (
			...args: Parameters<typeof episodeGroupAccordionMocks.useQuery>
		) => episodeGroupAccordionMocks.useQuery(...args),
	};
});

vi.mock("src/server/tmdb/shows", () => ({
	getTmdbEpisodeGroupDetailFn: vi.fn(),
	getTmdbEpisodeGroupsFn: vi.fn(),
	getTmdbSeasonDetailFn: vi.fn(),
	getTmdbShowDetailFn: vi.fn(),
}));

vi.mock("src/components/ui/accordion", async () => {
	const { createContext, useContext } = await import("react");

	const AccordionContext = createContext<{
		onValueChange?: (value: string) => void;
		value: string;
	} | null>(null);
	const AccordionItemContext = createContext<string>("");

	return {
		Accordion: ({
			children,
			className,
			collapsible: _collapsible,
			onValueChange,
			type: _type,
			value,
		}: {
			children: ReactNode;
			className?: string;
			collapsible?: boolean;
			onValueChange?: (value: string) => void;
			type?: string;
			value?: string;
		}) => (
			<AccordionContext.Provider value={{ onValueChange, value: value ?? "" }}>
				<div
					className={className}
					data-testid="accordion"
					data-value={value ?? ""}
				>
					{children}
				</div>
			</AccordionContext.Provider>
		),
		AccordionContent: ({
			children,
			className,
		}: {
			children: ReactNode;
			className?: string;
		}) => {
			const accordion = useContext(AccordionContext);
			const itemValue = useContext(AccordionItemContext);

			if (accordion?.value !== itemValue) {
				return null;
			}

			return (
				<div
					className={className}
					data-testid={`accordion-content-${itemValue}`}
				>
					{children}
				</div>
			);
		},
		AccordionItem: ({
			children,
			value,
		}: {
			children: ReactNode;
			value: string;
		}) => (
			<AccordionItemContext.Provider value={value}>
				<div data-testid={`accordion-item-${value}`}>{children}</div>
			</AccordionItemContext.Provider>
		),
		AccordionTrigger: ({
			children,
			className,
		}: {
			children: ReactNode;
			className?: string;
		}) => {
			const accordion = useContext(AccordionContext);
			const itemValue = useContext(AccordionItemContext);

			return (
				<button
					className={className}
					data-state={accordion?.value === itemValue ? "open" : "closed"}
					onClick={() => accordion?.onValueChange?.(itemValue)}
					type="button"
				>
					{children}
				</button>
			);
		},
	};
});

vi.mock("src/components/ui/badge", () => ({
	Badge: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <span className={className}>{children}</span>,
}));

vi.mock("src/components/ui/label", () => ({
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import EpisodeGroupAccordion from "./episode-group-accordion";

function setQueryState(queryKey: readonly unknown[], state: QueryState): void {
	episodeGroupAccordionMocks.queryStates.set(JSON.stringify(queryKey), state);
}

describe("EpisodeGroupAccordion", () => {
	beforeEach(() => {
		episodeGroupAccordionMocks.queryStates.clear();
		episodeGroupAccordionMocks.useQuery.mockClear();
		episodeGroupAccordionMocks.useQueries.mockClear();
	});

	it("returns null while the episode group query is unresolved", async () => {
		setQueryState(["tmdb", "episode-groups", 123], { isLoading: true });
		setQueryState(["tmdb", "show-detail", 123], { data: undefined });

		const { container } = await renderWithProviders(
			<EpisodeGroupAccordion
				genreIds={[18]}
				onChange={vi.fn()}
				originCountry={["US"]}
				tmdbId={123}
				value={null}
			/>,
		);

		expect(container).toBeEmptyDOMElement();
	});

	it("preselects the recommended anime group and renders its detail rows", async () => {
		setQueryState(["tmdb", "episode-groups", 321], {
			data: [
				{
					description: "Production order",
					episode_count: 24,
					group_count: 2,
					id: "group-production",
					name: "Production",
					network: null,
					type: 6,
				},
				{
					description: "Original order",
					episode_count: 12,
					group_count: 1,
					id: "group-original",
					name: "Original",
					network: null,
					type: 1,
				},
			],
		});
		setQueryState(["tmdb", "show-detail", 321], {
			data: {
				backdrop_path: null,
				episode_run_time: [24],
				external_ids: { imdb_id: null },
				first_air_date: "2024-01-01",
				genres: [{ id: 16, name: "Animation" }],
				id: 321,
				last_air_date: "2024-03-01",
				name: "Anime Show",
				networks: [],
				number_of_episodes: 24,
				number_of_seasons: 2,
				overview: "",
				poster_path: null,
				seasons: [
					{
						air_date: null,
						episode_count: 0,
						id: 1,
						name: "Specials",
						overview: "",
						poster_path: null,
						season_number: 0,
					},
					{
						air_date: "2024-01-01",
						episode_count: 12,
						id: 2,
						name: "Season 1",
						overview: "",
						poster_path: null,
						season_number: 1,
					},
					{
						air_date: "2024-02-01",
						episode_count: 12,
						id: 3,
						name: "Season 2",
						overview: "",
						poster_path: null,
						season_number: 2,
					},
				],
				status: "Returning Series",
				type: "Scripted",
			},
		});
		setQueryState(["tmdb", "episode-group-detail", "group-production"], {
			data: {
				description: "Production order",
				episode_count: 24,
				group_count: 2,
				groups: [
					{
						episodes: [
							{
								air_date: "2024-01-08",
								episode_number: 2,
								id: 202,
								name: "Second",
								order: 1,
								overview: "",
								runtime: 24,
								season_number: 1,
								show_id: 321,
								still_path: null,
								vote_average: 7.2,
							},
							{
								air_date: "2024-01-01",
								episode_number: 1,
								id: 201,
								name: "First",
								order: 0,
								overview: "",
								runtime: 24,
								season_number: 1,
								show_id: 321,
								still_path: null,
								vote_average: 7.1,
							},
						],
						id: "season-group-1",
						locked: false,
						name: "Arc One",
						order: 0,
					},
				],
				id: "group-production",
				name: "Production",
				network: null,
				type: 6,
			},
		});

		const onChange = vi.fn();
		await renderWithProviders(
			<EpisodeGroupAccordion
				genreIds={[16]}
				onChange={onChange}
				originCountry={["JP"]}
				tmdbId={321}
				value={null}
			/>,
		);

		expect(onChange).toHaveBeenCalledWith("group-production");
		await expect
			.element(page.getByTestId("accordion"))
			.toHaveAttribute("data-value", "group-production");
		await expect
			.element(page.getByTestId("accordion-item-group-production"))
			.toBeInTheDocument();
		await expect.element(page.getByText("Recommended")).toBeInTheDocument();
		await expect.element(page.getByText("Arc One")).toBeInTheDocument();
		await expect.element(page.getByText("E01–E02")).toBeInTheDocument();
		await expect.element(page.getByText("2 eps").first()).toBeInTheDocument();
		await expect.element(page.getByText("TMDB Default")).toBeInTheDocument();
	});

	it("defaults to TMDB Default for non-anime shows and can switch to a group", async () => {
		setQueryState(["tmdb", "episode-groups", 456], {
			data: [
				{
					description: "Digital release",
					episode_count: 3,
					group_count: 1,
					id: "group-digital",
					name: "Digital",
					network: null,
					type: 4,
				},
			],
		});
		setQueryState(["tmdb", "episode-group-detail", "group-digital"], {
			data: {
				description: "Digital release",
				episode_count: 3,
				group_count: 1,
				groups: [
					{
						episodes: [
							{
								air_date: "2024-01-01",
								episode_number: 1,
								id: 901,
								name: "One",
								order: 0,
								overview: "",
								runtime: 42,
								season_number: 1,
								show_id: 456,
								still_path: null,
								vote_average: 7.5,
							},
							{
								air_date: "2024-01-08",
								episode_number: 2,
								id: 902,
								name: "Two",
								order: 1,
								overview: "",
								runtime: 42,
								season_number: 1,
								show_id: 456,
								still_path: null,
								vote_average: 7.7,
							},
						],
						id: "digital-group",
						locked: false,
						name: "Digital Arc",
						order: 0,
					},
				],
				id: "group-digital",
				name: "Digital release",
				network: null,
				type: 4,
			},
		});
		setQueryState(["tmdb", "show-detail", 456], {
			data: {
				backdrop_path: null,
				episode_run_time: [42],
				external_ids: { imdb_id: null },
				first_air_date: "2024-01-01",
				genres: [{ id: 18, name: "Drama" }],
				id: 456,
				last_air_date: "2024-03-01",
				name: "Drama Show",
				networks: [],
				number_of_episodes: 5,
				number_of_seasons: 3,
				overview: "",
				poster_path: null,
				seasons: [
					{
						air_date: null,
						episode_count: 1,
						id: 10,
						name: "Specials",
						overview: "",
						poster_path: null,
						season_number: 0,
					},
					{
						air_date: "2024-01-01",
						episode_count: 2,
						id: 11,
						name: "Season 1",
						overview: "",
						poster_path: null,
						season_number: 1,
					},
					{
						air_date: "2024-02-01",
						episode_count: 3,
						id: 12,
						name: "Season 2",
						overview: "",
						poster_path: null,
						season_number: 2,
					},
				],
				status: "Returning Series",
				type: "Scripted",
			},
		});
		setQueryState(["tmdb", "season-detail", 456, 1], {
			data: {
				episodes: [
					{
						air_date: "2024-01-08",
						episode_number: 2,
						id: 902,
						name: "Two",
						overview: "",
						runtime: 42,
						season_number: 1,
						still_path: null,
						vote_average: 7.7,
					},
					{
						air_date: "2024-01-01",
						episode_number: 1,
						id: 901,
						name: "One",
						overview: "",
						runtime: 42,
						season_number: 1,
						still_path: null,
						vote_average: 7.5,
					},
				],
				id: 11,
				name: "Season 1",
				overview: "",
				poster_path: null,
				season_number: 1,
			},
		});
		setQueryState(["tmdb", "season-detail", 456, 2], {
			data: {
				episodes: [],
				id: 12,
				name: "Season 2",
				overview: "",
				poster_path: null,
				season_number: 2,
			},
		});

		const onChange = vi.fn();
		await renderWithProviders(
			<EpisodeGroupAccordion
				genreIds={[18]}
				onChange={onChange}
				originCountry={["US"]}
				tmdbId={456}
				value={null}
			/>,
		);

		await expect
			.element(page.getByTestId("accordion"))
			.toHaveAttribute("data-value", "__default__");
		expect(onChange).not.toHaveBeenCalled();
		await expect.element(page.getByText("TMDB Default")).toBeInTheDocument();
		await expect
			.element(page.getByText("2 seasons · 5 eps"))
			.toBeInTheDocument();
		await expect.element(page.getByText("Season 1")).toBeInTheDocument();
		await expect.element(page.getByText("E01–E02")).toBeInTheDocument();
		await expect.element(page.getByText("2 eps").first()).toBeInTheDocument();
		await expect.element(page.getByText("Season 2")).toBeInTheDocument();
		await expect.element(page.getByText("E01–E03")).toBeInTheDocument();
		await expect.element(page.getByText("3 eps").first()).toBeInTheDocument();
		await expect.element(page.getByText("Recommended")).toBeInTheDocument();

		await page.getByRole("button", { name: /Digital/ }).click();

		expect(onChange).toHaveBeenCalledWith("group-digital");
		await expect
			.element(page.getByTestId("accordion"))
			.toHaveAttribute("data-value", "group-digital");
		await expect
			.element(page.getByTestId("accordion-item-group-digital"))
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId("accordion-content-group-digital"))
			.toBeInTheDocument();
		await expect.element(page.getByText("Digital Arc")).toBeInTheDocument();
		await expect.element(page.getByText("E01–E02")).toBeInTheDocument();
	});

	it("keeps an existing selection expanded in edit flow", async () => {
		setQueryState(["tmdb", "episode-groups", 789], {
			data: [
				{
					description: "TV order",
					episode_count: 4,
					group_count: 1,
					id: "group-tv",
					name: "TV",
					network: null,
					type: 7,
				},
			],
		});
		setQueryState(["tmdb", "show-detail", 789], {
			data: undefined,
		});
		setQueryState(["tmdb", "episode-group-detail", "group-tv"], {
			data: {
				description: "TV order",
				episode_count: 4,
				group_count: 1,
				groups: [
					{
						episodes: [
							{
								air_date: "2024-01-01",
								episode_number: 4,
								id: 104,
								name: "Four",
								order: 3,
								overview: "",
								runtime: 24,
								season_number: 1,
								show_id: 789,
								still_path: null,
								vote_average: 7.0,
							},
						],
						id: "tv-group",
						locked: false,
						name: "TV Arc",
						order: 0,
					},
				],
				id: "group-tv",
				name: "TV",
				network: null,
				type: 7,
			},
		});

		const onChange = vi.fn();
		await renderWithProviders(
			<EpisodeGroupAccordion
				genreIds={[18]}
				onChange={onChange}
				originCountry={["US"]}
				tmdbId={789}
				value="group-tv"
			/>,
		);

		expect(onChange).not.toHaveBeenCalled();
		await expect
			.element(page.getByTestId("accordion"))
			.toHaveAttribute("data-value", "group-tv");
		await expect
			.element(page.getByTestId("accordion-item-group-tv"))
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId("accordion-content-group-tv"))
			.toBeInTheDocument();
		await expect.element(page.getByText("TV Arc")).toBeInTheDocument();
		await expect.element(page.getByText("E04–E04")).toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: /TMDB Default/ }))
			.toBeInTheDocument();
	});
});
