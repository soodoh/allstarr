import { fireEvent } from "@testing-library/react";
import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tvRouteMocks = vi.hoisted(() => ({
	monitorShowProfile: {
		isPending: false,
		mutate: vi.fn(),
	},
	queries: {
		downloadProfilesListQuery: vi.fn(() => ({
			queryFn: vi.fn(),
			queryKey: ["download-profiles"],
		})),
		showsListQuery: vi.fn(() => ({
			queryFn: vi.fn(),
			queryKey: ["shows"],
		})),
		userSettingsQuery: vi.fn((tableId: string) => ({
			queryFn: vi.fn(),
			queryKey: ["user-settings", tableId],
		})),
	},
	unmonitorShowProfile: {
		isPending: false,
		mutate: vi.fn(),
	},
	useSuspenseQuery: vi.fn(),
	viewMode: "table" as "table" | "grid",
	setViewMode: vi.fn((next: "table" | "grid") => {
		tvRouteMocks.viewMode = next;
	}),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			tvRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		className,
		to,
	}: {
		children: ReactNode;
		className?: string;
		to: string;
	}) => (
		<a className={className} href={to}>
			{children}
		</a>
	),
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/components/shared/column-settings-popover", () => ({
	default: ({ tableId }: { tableId: string }) => <div>columns:{tableId}</div>,
}));

vi.mock("src/components/shared/empty-state", () => ({
	default: ({ description, title }: { description: string; title: string }) => (
		<div>
			<div>{title}</div>
			<div>{description}</div>
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
		description?: string;
		title: string;
	}) => (
		<div>
			<div>{title}</div>
			{description ? <div>{description}</div> : null}
			{actions}
		</div>
	),
}));

vi.mock("src/components/tv/show-bulk-bar", () => ({
	default: ({
		onDone,
		profiles,
		selectedIds,
	}: {
		onDone: () => void;
		profiles: Array<{ id: number; name: string }>;
		selectedIds: Set<number>;
	}) => (
		<div>
			<div>bulk:{[...selectedIds].join(",")}</div>
			<div>profiles:{profiles.map((profile) => profile.name).join(",")}</div>
			<button onClick={onDone} type="button">
				Done bulk edit
			</button>
		</div>
	),
}));

vi.mock("src/components/tv/show-card", () => ({
	default: ({ show }: { show: { title: string } }) => (
		<div>card:{show.title}</div>
	),
}));

vi.mock("src/components/tv/show-table", () => ({
	default: ({
		onToggleAll,
		onToggleProfile,
		onToggleSelect,
		selectedIds,
		selectable,
		shows,
	}: {
		onToggleAll: () => void;
		onToggleProfile: (showId: number, profileId: number) => void;
		onToggleSelect: (id: number) => void;
		selectedIds: Set<number>;
		selectable: boolean;
		shows: Array<{ id: number; title: string }>;
	}) => (
		<div>
			<div>
				table:{shows.map((show) => show.title).join(",")}:
				{selectable ? "selectable" : "readonly"}:{[...selectedIds].join(",")}
			</div>
			<button onClick={onToggleAll} type="button">
				Toggle all rows
			</button>
			<button onClick={() => onToggleSelect(shows[0]?.id ?? 0)} type="button">
				Toggle first row
			</button>
			<button onClick={() => onToggleProfile(1, 101)} type="button">
				Toggle active profile
			</button>
			<button onClick={() => onToggleProfile(2, 101)} type="button">
				Toggle inactive profile
			</button>
		</div>
	),
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		asChild,
		children,
		onClick,
		type,
		variant,
	}: {
		asChild?: boolean;
		children: ReactNode;
		onClick?: () => void;
		type?: "button";
		variant?: string;
	}) =>
		asChild ? (
			<div data-variant={variant}>{children}</div>
		) : (
			<button data-variant={variant} onClick={onClick} type={type ?? "button"}>
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
		onChange: (event: { target: { value: string } }) => void;
		placeholder: string;
		value: string;
	}) => (
		<input
			aria-label={placeholder}
			onChange={(event) => onChange({ target: { value: event.target.value } })}
			value={value}
		/>
	),
}));

vi.mock("src/components/ui/skeleton", () => ({
	default: ({ className }: { className?: string }) => (
		<div className={className}>skeleton</div>
	),
}));

vi.mock("src/hooks/mutations", () => ({
	useMonitorShowProfile: () => tvRouteMocks.monitorShowProfile,
	useUnmonitorShowProfile: () => tvRouteMocks.unmonitorShowProfile,
}));

vi.mock("src/hooks/use-view-mode", () => ({
	default: () => [tvRouteMocks.viewMode, tvRouteMocks.setViewMode] as const,
}));

vi.mock("src/lib/queries/download-profiles", () => ({
	downloadProfilesListQuery: () =>
		tvRouteMocks.queries.downloadProfilesListQuery(),
}));

vi.mock("src/lib/queries/shows", () => ({
	showsListQuery: () => tvRouteMocks.queries.showsListQuery(),
}));

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (tableId: string) =>
		tvRouteMocks.queries.userSettingsQuery(tableId),
}));

vi.mock("src/components/shared/loading-skeleton", () => ({
	SKELETON_KEYS: Array.from({ length: 20 }, (_, index) => `skeleton-${index}`),
}));

import { Route } from "./index";

const shows = [
	{ downloadProfileIds: [101], id: 1, title: "Severance" },
	{ downloadProfileIds: [], id: 2, title: "Andor" },
];

const profiles = [
	{ contentType: "tv", id: 101, name: "4K" },
	{ contentType: "movie", id: 202, name: "Movie Profile" },
];

describe("tv index route", () => {
	beforeEach(() => {
		tvRouteMocks.monitorShowProfile.mutate.mockReset();
		tvRouteMocks.unmonitorShowProfile.mutate.mockReset();
		tvRouteMocks.useSuspenseQuery.mockReset();
		tvRouteMocks.viewMode = "table";
		tvRouteMocks.setViewMode.mockClear();
	});

	it("loads query dependencies and renders the empty state when there are no shows", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown>;
			pendingComponent: () => JSX.Element;
		};

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(tvRouteMocks.queries.showsListQuery).toHaveBeenCalledTimes(1);
		expect(
			tvRouteMocks.queries.downloadProfilesListQuery,
		).toHaveBeenCalledTimes(1);
		expect(tvRouteMocks.queries.userSettingsQuery).toHaveBeenCalledWith("tv");
		expect(ensureQueryData).toHaveBeenCalledTimes(3);

		tvRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey: string[] }) => {
				if (query.queryKey[0] === "shows") {
					return { data: [] };
				}
				return { data: profiles };
			},
		);

		const Component = routeConfig.component;
		const { container, getByText } = renderWithProviders(<Component />);

		expect(getByText("TV Shows")).toBeInTheDocument();
		expect(getByText("No TV shows yet")).toBeInTheDocument();
		expect(
			getByText("Add your first show to start building your collection."),
		).toBeInTheDocument();

		const pendingView = renderWithProviders(<routeConfig.pendingComponent />);
		expect(
			pendingView.container.querySelectorAll(".aspect-\\[2\\/3\\]").length,
		).toBe(12);
		expect(container.querySelector('a[href="/tv/add"]')).not.toBeNull();
	});

	it("renders the table flow, search empty state, and profile toggle mutations", () => {
		tvRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey: string[] }) => {
				if (query.queryKey[0] === "shows") {
					return { data: shows };
				}
				return { data: profiles };
			},
		);

		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = routeConfig.component;
		const { getByRole, getByText, queryByText } = renderWithProviders(
			<Component />,
		);

		expect(getByText("2 series")).toBeInTheDocument();
		expect(getByText("columns:tv")).toBeInTheDocument();
		expect(getByText("table:Severance,Andor:readonly:")).toBeInTheDocument();

		fireEvent.click(getByRole("button", { name: "Toggle active profile" }));
		expect(tvRouteMocks.unmonitorShowProfile.mutate).toHaveBeenCalledWith({
			downloadProfileId: 101,
			showId: 1,
		});

		fireEvent.click(getByRole("button", { name: "Toggle inactive profile" }));
		expect(tvRouteMocks.monitorShowProfile.mutate).toHaveBeenCalledWith({
			downloadProfileId: 101,
			showId: 2,
		});

		fireEvent.change(getByRole("textbox", { name: "Search by title..." }), {
			target: { value: "zzz" },
		});
		expect(getByText("0 matching series")).toBeInTheDocument();
		expect(getByText("No results")).toBeInTheDocument();
		expect(getByText('No shows match "zzz".')).toBeInTheDocument();
		expect(
			queryByText("table:Severance,Andor:readonly:"),
		).not.toBeInTheDocument();
	});

	it("supports grid view and mass edit selection/reset flows", () => {
		tvRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey: string[] }) => {
				if (query.queryKey[0] === "shows") {
					return { data: shows };
				}
				return { data: profiles };
			},
		);

		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = routeConfig.component;
		const { getAllByRole, getByRole, getByText, queryByText, rerender } =
			renderWithProviders(<Component />);

		fireEvent.click(getAllByRole("button")[1] as HTMLButtonElement);
		expect(tvRouteMocks.setViewMode).toHaveBeenCalledWith("grid");
		rerender(<Component />);
		expect(getByText("card:Severance")).toBeInTheDocument();
		expect(getByText("card:Andor")).toBeInTheDocument();
		expect(queryByText("columns:tv")).not.toBeInTheDocument();
		fireEvent.click(getAllByRole("button")[0] as HTMLButtonElement);
		expect(tvRouteMocks.setViewMode).toHaveBeenCalledWith("table");

		fireEvent.click(getByRole("button", { name: /Mass Editor/ }));
		expect(getByText("table:Severance,Andor:selectable:")).toBeInTheDocument();
		expect(getByText("bulk:")).toBeInTheDocument();
		expect(getByText("profiles:4K")).toBeInTheDocument();

		fireEvent.click(getByRole("button", { name: "Toggle all rows" }));
		expect(
			getByText("table:Severance,Andor:selectable:1,2"),
		).toBeInTheDocument();
		expect(getByText("bulk:1,2")).toBeInTheDocument();
		fireEvent.click(getByRole("button", { name: "Toggle all rows" }));
		expect(getByText("table:Severance,Andor:selectable:")).toBeInTheDocument();
		expect(getByText("bulk:")).toBeInTheDocument();

		fireEvent.click(getByRole("button", { name: "Done bulk edit" }));
		expect(queryByText("bulk:1,2")).not.toBeInTheDocument();
		expect(
			queryByText("table:Severance,Andor:selectable:1,2"),
		).not.toBeInTheDocument();

		fireEvent.click(getByRole("button", { name: /Mass Editor/ }));
		fireEvent.click(getByRole("button", { name: "Toggle first row" }));
		expect(getByText("table:Severance,Andor:selectable:1")).toBeInTheDocument();
		fireEvent.click(getByRole("button", { name: "Toggle first row" }));
		expect(getByText("table:Severance,Andor:selectable:")).toBeInTheDocument();
		fireEvent.click(getByRole("button", { name: "Cancel" }));
		expect(queryByText("bulk:1")).not.toBeInTheDocument();
		expect(
			queryByText("table:Severance,Andor:selectable:1"),
		).not.toBeInTheDocument();
	});
});
