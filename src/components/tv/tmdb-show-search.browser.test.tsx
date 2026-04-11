import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const tmdbShowSearchMocks = vi.hoisted(() => ({
	addShow: {
		isPending: false,
		mutate: vi.fn(),
	},
	downloadProfiles: [{ contentType: "tv", id: 21, name: "HDTV" }],
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
			downloadProfileIds: [21],
			monitorOption: "future",
			searchCutoffUnmet: true,
			searchOnAdd: false,
			useSeasonFolder: true,
		},
	},
	showExists: false,
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
			tmdbShowSearchMocks.useQuery(...args),
	};
});

vi.mock("lucide-react", () => ({
	Search: ({ className }: { className?: string }) => (
		<span className={className}>Search</span>
	),
	Star: ({ className }: { className?: string }) => (
		<span className={className}>Star</span>
	),
	Tv: ({ className }: { className?: string }) => (
		<span className={className}>Tv</span>
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

vi.mock("src/components/tv/episode-group-accordion", () => ({
	default: ({
		onChange,
		value,
	}: {
		onChange: (value: string | null) => void;
		value: string | null;
	}) => (
		<div data-testid="episode-group-accordion">
			<span>{value ?? "none"}</span>
			<button onClick={() => onChange("group-1")} type="button">
				Choose group
			</button>
		</div>
	),
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		type?: "button" | "submit";
	}) => (
		<button disabled={disabled} onClick={onClick} type={type ?? "button"}>
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
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogDescription: ({ children }: { children: ReactNode }) => (
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

vi.mock("src/components/ui/switch", () => ({
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

vi.mock("src/hooks/mutations/shows", () => ({
	useAddShow: () => tmdbShowSearchMocks.addShow,
}));

vi.mock("src/hooks/mutations/user-settings", () => ({
	useUpsertUserSettings: () => tmdbShowSearchMocks.upsertUserSettings,
}));

vi.mock("src/lib/queries/download-profiles", () => ({
	downloadProfilesListQuery: () => ({
		queryKey: ["download-profiles", "list"],
	}),
}));

vi.mock("src/lib/queries/shows", () => ({
	showExistenceQuery: (id: number) => ({
		queryKey: ["show-existence", id],
	}),
}));

vi.mock("src/lib/queries/tmdb", () => ({
	tmdbSearchShowsQuery: (query: string) => ({
		queryKey: ["tmdb-show-search", query],
	}),
}));

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (tableId: string) => ({
		queryKey: ["user-settings", tableId],
	}),
}));

vi.mock("src/lib/utils", () => ({
	cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
	resizeTmdbUrl: (url: string | null, size: string) => `resized:${url}:${size}`,
}));

import TmdbShowSearch from "./tmdb-show-search";

describe("TmdbShowSearch", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		tmdbShowSearchMocks.addShow.mutate.mockReset();
		tmdbShowSearchMocks.upsertUserSettings.mutate.mockReset();
		tmdbShowSearchMocks.showExists = false;
		tmdbShowSearchMocks.searchStates.clear();
		tmdbShowSearchMocks.useQuery.mockImplementation(
			(input: { queryKey?: unknown[]; enabled?: boolean } | undefined) => {
				const query = input ?? {};
				const key = query.queryKey ?? [];

				if (key[0] === "user-settings") {
					return { data: tmdbShowSearchMocks.settings };
				}
				if (key[0] === "show-existence") {
					return {
						data:
							query.enabled === false ? false : tmdbShowSearchMocks.showExists,
					};
				}
				if (key[0] === "download-profiles") {
					return {
						data:
							query.enabled === false
								? []
								: tmdbShowSearchMocks.downloadProfiles,
					};
				}
				if (key[0] === "tmdb-show-search") {
					const searchQuery = String(key[1] ?? "");
					const state = tmdbShowSearchMocks.searchStates.get(searchQuery);

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

	it("shows search results, opens the preview modal, and adds a show", async () => {
		tmdbShowSearchMocks.searchStates.set("severance", {
			data: {
				query: "severance",
				results: [
					{
						first_air_date: "2022-02-18",
						genre_ids: [18],
						id: 100,
						name: "Severance",
						origin_country: ["US"],
						original_name: "Severance",
						overview: "Office mystery.",
						popularity: 9,
						poster_path: "/sev.jpg",
						vote_average: 8.6,
					},
				],
			},
		});
		tmdbShowSearchMocks.addShow.mutate.mockImplementation(
			(
				_payload: unknown,
				options?: {
					onSuccess?: () => void;
				},
			) => {
				options?.onSuccess?.();
			},
		);

		await renderWithProviders(<TmdbShowSearch />);

		await expect
			.element(page.getByTestId("empty-state-title"))
			.toHaveTextContent("Search for a TV show");

		await page.getByLabelText("Search TV shows").fill("severance");
		await vi.advanceTimersByTimeAsync(300);

		await expect
			.element(page.getByText(/Showing 1 result for/))
			.toBeInTheDocument();
		await page.getByRole("heading", { name: "Severance" }).click();
		await expect.element(page.getByText("HDTV:selected")).toBeInTheDocument();
		await expect
			.element(page.getByTestId("episode-group-accordion"))
			.toBeInTheDocument();

		await page.getByText("Choose group").click();
		await page.getByLabelText("Use Season Folder").click();
		await page.getByLabelText("Start search for missing episodes").click();
		await page.getByRole("button", { name: "Add Show" }).click();

		expect(tmdbShowSearchMocks.upsertUserSettings.mutate).toHaveBeenCalledWith({
			addDefaults: {
				downloadProfileIds: [21],
				monitorOption: "future",
				searchCutoffUnmet: true,
				searchOnAdd: true,
				useSeasonFolder: false,
			},
			tableId: "tv",
		});
		expect(tmdbShowSearchMocks.addShow.mutate).toHaveBeenCalledWith(
			{
				downloadProfileIds: [21],
				episodeGroupId: "group-1",
				monitorOption: "future",
				searchCutoffUnmet: true,
				searchOnAdd: true,
				seriesType: "standard",
				tmdbId: 100,
				useSeasonFolder: false,
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
	});

	it("shows the existing-library close branch when the show already exists", async () => {
		tmdbShowSearchMocks.showExists = true;
		tmdbShowSearchMocks.searchStates.set("lost", {
			data: {
				query: "lost",
				results: [
					{
						first_air_date: "2004-09-22",
						genre_ids: [18],
						id: 200,
						name: "Lost",
						origin_country: ["US"],
						original_name: "Lost",
						overview: "",
						popularity: 7,
						poster_path: "/lost.jpg",
						vote_average: 8,
					},
				],
			},
		});

		await renderWithProviders(<TmdbShowSearch />);

		await page.getByLabelText("Search TV shows").fill("lost");
		await vi.advanceTimersByTimeAsync(300);

		await page.getByRole("heading", { name: "Lost" }).click();
		await expect
			.element(page.getByText("Already in library"))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Close" }))
			.toBeInTheDocument();
	});

	it("renders the TMDB API key guidance for authorization failures", async () => {
		tmdbShowSearchMocks.searchStates.set("bad", {
			error: new Error("TMDB api key unauthorized"),
			isError: true,
		});

		await renderWithProviders(<TmdbShowSearch />);

		await page.getByLabelText("Search TV shows").fill("bad");
		await vi.advanceTimersByTimeAsync(300);

		await expect
			.element(page.getByTestId("empty-state-title"))
			.toHaveTextContent("Search failed");
		await expect
			.element(page.getByTestId("empty-state-description"))
			.toHaveTextContent(
				"Configure your TMDB API key in Settings > Metadata to search for TV shows.",
			);
	});
});
