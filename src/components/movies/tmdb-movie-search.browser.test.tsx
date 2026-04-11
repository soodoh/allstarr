import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

const tmdbMovieSearchMocks = vi.hoisted(() => ({
	addMovie: {
		isPending: false,
		mutate: vi.fn(),
	},
	downloadProfiles: [
		{ contentType: "movie", id: 11, name: "HD" },
		{ contentType: "tv", id: 12, name: "TV" },
	],
	movieExists: false,
	searchStates: new Map<
		string,
		{
			data?: { query: string; results: Array<Record<string, unknown>> };
			error?: Error;
			isError?: boolean;
			isLoading?: boolean;
		}
	>(),
	settings: {
		addDefaults: {
			downloadProfileIds: [11],
			minimumAvailability: "released",
			monitorOption: "movieOnly",
			searchOnAdd: true,
		},
	},
	upsertUserSettings: {
		mutate: vi.fn(),
	},
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			tmdbMovieSearchMocks.useQuery(...args),
	};
});

vi.mock("lucide-react", () => ({
	Film: ({ className }: { className?: string }) => (
		<span className={className}>Film</span>
	),
	Search: ({ className }: { className?: string }) => (
		<span className={className}>Search</span>
	),
	Star: ({ className }: { className?: string }) => (
		<span className={className}>Star</span>
	),
}));

vi.mock("src/components/shared/empty-state", () => ({
	default: ({ description, title }: { description: string; title: string }) => (
		<div data-testid="empty-state">
			<span data-testid="empty-state-title">{title}</span>
			<span data-testid="empty-state-description">{description}</span>
		</div>
	),
}));

vi.mock("src/components/shared/optimized-image", () => ({
	default: ({
		alt,
		src,
		type,
	}: {
		alt: string;
		src: string | null;
		type: string;
	}) => <img alt={alt} data-type={type} src={src ?? undefined} />,
}));

vi.mock("src/components/shared/profile-checkbox-group", () => ({
	default: ({
		onToggle,
		profiles,
		selectedIds,
	}: {
		onToggle: (id: number) => void;
		profiles: Array<{ id: number; name: string }>;
		selectedIds: number[];
	}) => (
		<div>
			{profiles.map((profile) => (
				<button
					key={profile.id}
					onClick={() => onToggle(profile.id)}
					type="button"
				>
					{profile.name}:
					{selectedIds.includes(profile.id) ? "selected" : "idle"}
				</button>
			))}
		</div>
	),
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({ children, variant }: { children: ReactNode; variant?: string }) => (
		<span data-variant={variant}>{children}</span>
	),
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		className,
		disabled,
		onClick,
		variant,
	}: {
		children: ReactNode;
		className?: string;
		disabled?: boolean;
		onClick?: () => void;
		variant?: string;
	}) => (
		<button
			className={className}
			data-variant={variant}
			disabled={disabled}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
	CardContent: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
}));

vi.mock("src/components/ui/checkbox", () => ({
	default: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		id: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			checked={checked}
			id={id}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
			type="checkbox"
		/>
	),
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog-root">{children}</div> : null,
	DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/input", () => ({
	default: ({
		"aria-label": ariaLabel,
		onChange,
		placeholder,
		value,
	}: {
		"aria-label"?: string;
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		value?: string;
	}) => (
		<input
			aria-label={ariaLabel}
			onChange={onChange}
			placeholder={placeholder}
			value={value}
		/>
	),
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
			onChange={(event) => onValueChange?.(event.target.value)}
			value={value}
		>
			{children}
		</select>
	),
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>
			{typeof children === "string" ? children : value}
		</option>
	),
	SelectTrigger: () => null,
	SelectValue: () => null,
}));

vi.mock("src/hooks/mutations/movies", () => ({
	useAddMovie: () => tmdbMovieSearchMocks.addMovie,
}));

vi.mock("src/hooks/mutations/user-settings", () => ({
	useUpsertUserSettings: () => tmdbMovieSearchMocks.upsertUserSettings,
}));

vi.mock("src/lib/queries/download-profiles", () => ({
	downloadProfilesListQuery: () => ({
		queryKey: ["download-profiles", "list"],
	}),
}));

vi.mock("src/lib/queries/movies", () => ({
	movieExistenceQuery: (id: number) => ({
		queryKey: ["movie-existence", id],
	}),
}));

vi.mock("src/lib/queries/tmdb", () => ({
	tmdbSearchMoviesQuery: (query: string) => ({
		queryKey: ["tmdb-search", query],
	}),
}));

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (tableId: string) => ({
		queryKey: ["user-settings", tableId],
	}),
}));

vi.mock("src/lib/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
	resizeTmdbUrl: (url: string | null, size: string) => `resized:${url}:${size}`,
}));

import TmdbMovieSearch, { MoviePreviewModal } from "./tmdb-movie-search";

describe("MoviePreviewModal", () => {
	beforeEach(() => {
		tmdbMovieSearchMocks.addMovie.mutate.mockReset();
		tmdbMovieSearchMocks.upsertUserSettings.mutate.mockReset();
		tmdbMovieSearchMocks.movieExists = false;
		tmdbMovieSearchMocks.searchStates.clear();
		tmdbMovieSearchMocks.useQuery.mockImplementation(
			(input: { queryKey?: unknown[]; enabled?: boolean } | undefined) => {
				const query = input ?? {};
				const key = query.queryKey ?? [];

				if (key[0] === "user-settings") {
					return { data: tmdbMovieSearchMocks.settings };
				}
				if (key[0] === "movie-existence") {
					return {
						data:
							query.enabled === false
								? false
								: tmdbMovieSearchMocks.movieExists,
					};
				}
				if (key[0] === "download-profiles") {
					return {
						data:
							query.enabled === false
								? []
								: tmdbMovieSearchMocks.downloadProfiles,
					};
				}
				if (key[0] === "tmdb-search") {
					const searchQuery = String(key[1] ?? "");
					const state = tmdbMovieSearchMocks.searchStates.get(searchQuery);

					return {
						data: state?.data,
						error: state?.error,
						isError: Boolean(state?.isError),
						isLoading: Boolean(state?.isLoading),
					};
				}

				return {
					data: undefined,
					error: undefined,
					isError: false,
					isLoading: false,
				};
			},
		);
	});

	it("closes immediately for movies that already exist", async () => {
		tmdbMovieSearchMocks.movieExists = true;
		const onOpenChange = vi.fn();

		await renderWithProviders(
			<MoviePreviewModal
				addDefaults={tmdbMovieSearchMocks.settings.addDefaults}
				movie={{
					adult: false,
					backdrop_path: null,
					genre_ids: [],
					id: 7,
					media_type: "movie",
					original_title: "Alien",
					overview: "Xenomorphs.",
					popularity: 8,
					poster_path: "/alien.jpg",
					release_date: "1979-05-25",
					title: "Alien",
					vote_average: 8.5,
				}}
				onOpenChange={onOpenChange}
				open
			/>,
		);

		await expect.element(page.getByText("Add Movie")).not.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Close" }))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Close" }).click();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("persists defaults and adds a movie when the modal form is submitted", async () => {
		const onOpenChange = vi.fn();
		const onAdded = vi.fn();
		tmdbMovieSearchMocks.addMovie.mutate.mockImplementation(
			(
				_payload: unknown,
				options?: {
					onSuccess?: () => void;
				},
			) => {
				options?.onSuccess?.();
			},
		);

		await renderWithProviders(
			<MoviePreviewModal
				addDefaults={tmdbMovieSearchMocks.settings.addDefaults}
				movie={{
					adult: false,
					backdrop_path: null,
					genre_ids: [],
					id: 9,
					media_type: "movie",
					original_title: "Blade Runner",
					overview: "Replicants everywhere.",
					popularity: 9,
					poster_path: "/blade-runner.jpg",
					release_date: "1982-06-25",
					title: "Blade Runner",
					vote_average: 8.2,
				}}
				onAdded={onAdded}
				onOpenChange={onOpenChange}
				open
			/>,
		);

		await page.getByText("HD:selected").click();
		await userEvent.selectOptions(page.getByRole("combobox").first(), "none");
		await page.getByLabelText("Start search for missing movie").click();
		await page.getByRole("button", { name: "Add Movie" }).click();

		expect(tmdbMovieSearchMocks.upsertUserSettings.mutate).toHaveBeenCalledWith(
			{
				addDefaults: {
					downloadProfileIds: [],
					minimumAvailability: "released",
					monitorOption: "none",
					searchOnAdd: false,
				},
				tableId: "movies",
			},
		);
		expect(tmdbMovieSearchMocks.addMovie.mutate).toHaveBeenCalledWith(
			{
				downloadProfileIds: [],
				minimumAvailability: "released",
				monitorOption: "none",
				searchOnAdd: false,
				tmdbId: 9,
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onAdded).toHaveBeenCalledTimes(1);
	});
});

describe("TmdbMovieSearch", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	it("shows the initial empty state, then search results, and opens the preview modal", async () => {
		tmdbMovieSearchMocks.searchStates.set("alien", {
			data: {
				query: "alien",
				results: [
					{
						adult: false,
						backdrop_path: null,
						genre_ids: [],
						id: 1,
						media_type: "movie",
						original_title: "Alien",
						overview: "A xenomorph attack.",
						popularity: 10,
						poster_path: "/alien.jpg",
						release_date: "1979-05-25",
						title: "Alien",
						vote_average: 8.4,
					},
				],
			},
		});

		await renderWithProviders(<TmdbMovieSearch />);

		await expect
			.element(page.getByTestId("empty-state-title"))
			.toHaveTextContent("Search for a movie");

		await page.getByLabelText("Search movies").fill("alien");
		await vi.advanceTimersByTimeAsync(300);

		await expect
			.element(page.getByText(/Showing 1 result for/))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Search for a movie"))
			.not.toBeInTheDocument();

		await page.getByRole("heading", { name: "Alien" }).click();
		await expect.element(page.getByText("Add Movie")).toBeInTheDocument();
		await expect.element(page.getByText("HD:selected")).toBeInTheDocument();
	});

	it("renders the TMDB API key guidance for authorization failures", async () => {
		tmdbMovieSearchMocks.searchStates.set("bad", {
			error: new Error("TMDB API key unauthorized"),
			isError: true,
		});

		await renderWithProviders(<TmdbMovieSearch />);

		await page.getByLabelText("Search movies").fill("bad");
		await vi.advanceTimersByTimeAsync(300);

		await expect
			.element(page.getByTestId("empty-state-title"))
			.toHaveTextContent("Search failed");
		await expect
			.element(page.getByTestId("empty-state-description"))
			.toHaveTextContent(
				"Configure your TMDB API key in Settings > Metadata to search for movies.",
			);
	});
});
