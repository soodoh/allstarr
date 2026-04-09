import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const movieDetailHeaderMocks = vi.hoisted(() => ({
	deleteMovie: {
		isPending: false,
		mutate: vi.fn(),
	},
	monitorProfile: {
		mutate: vi.fn(),
	},
	navigate: vi.fn(),
	refreshMetadata: {
		isPending: false,
		mutate: vi.fn(),
	},
	router: {
		invalidate: vi.fn(),
	},
	unmonitorProfile: {
		isPending: false,
		mutate: vi.fn(),
	},
	updateMovie: {
		isPending: false,
		mutate: vi.fn(),
	},
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to }: { children: ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
	useNavigate: () => movieDetailHeaderMocks.navigate,
	useRouter: () => movieDetailHeaderMocks.router,
}));

vi.mock("src/components/shared/action-button-group", () => ({
	default: ({
		externalLabel,
		externalUrl,
		onDelete,
		onEdit,
		onRefreshMetadata,
	}: {
		externalLabel?: string;
		externalUrl?: string | null;
		onDelete: () => void;
		onEdit: () => void;
		onRefreshMetadata: () => void;
	}) => (
		<div>
			<button onClick={onRefreshMetadata} type="button">
				Refresh metadata
			</button>
			<button onClick={onEdit} type="button">
				Edit
			</button>
			<button onClick={onDelete} type="button">
				Delete
			</button>
			{externalUrl ? (
				<a href={externalUrl}>{externalLabel ?? "External"}</a>
			) : null}
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
	}) => <img alt={alt} data-type={type} src={src ?? ""} />,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({
		description,
		title,
	}: {
		description?: string;
		title: string;
	}) => (
		<div>
			<h1>{title}</h1>
			{description ? <p>{description}</p> : null}
		</div>
	),
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

vi.mock("src/components/shared/profile-toggle-icons", () => ({
	default: ({
		activeProfileIds,
		onToggle,
		profiles,
	}: {
		activeProfileIds: number[];
		onToggle: (profileId: number) => void;
		profiles: Array<{ id: number; name: string }>;
	}) => (
		<div>
			{profiles.map((profile) => (
				<button
					key={profile.id}
					onClick={() => onToggle(profile.id)}
					type="button"
				>
					{profile.name}:
					{activeProfileIds.includes(profile.id) ? "active" : "inactive"}
				</button>
			))}
		</div>
	),
}));

vi.mock("src/components/shared/unmonitor-dialog", () => ({
	default: ({
		isPending,
		itemTitle,
		open,
		onConfirm,
		onOpenChange,
		profileName,
	}: {
		isPending: boolean;
		itemTitle: string;
		open: boolean;
		onConfirm: (deleteFiles: boolean) => void;
		onOpenChange: (open: boolean) => void;
		profileName: string;
	}) =>
		open ? (
			<div data-testid="unmonitor-dialog">
				<div>
					{profileName}:{itemTitle}:{String(isPending)}
				</div>
				<button onClick={() => onConfirm(false)} type="button">
					Confirm unmonitor
				</button>
				<button onClick={() => onOpenChange(false)} type="button">
					Close unmonitor
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <span className={className}>{children}</span>,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
	}) => (
		<button disabled={disabled} onClick={onClick} type="button">
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
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
	DialogDescription: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogFooter: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
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
	useDeleteMovie: () => movieDetailHeaderMocks.deleteMovie,
	useMonitorMovieProfile: () => movieDetailHeaderMocks.monitorProfile,
	useRefreshMovieMetadata: () => movieDetailHeaderMocks.refreshMetadata,
	useUnmonitorMovieProfile: () => movieDetailHeaderMocks.unmonitorProfile,
	useUpdateMovie: () => movieDetailHeaderMocks.updateMovie,
}));

import MovieDetailHeader from "./movie-detail-header";

describe("MovieDetailHeader", () => {
	beforeEach(() => {
		movieDetailHeaderMocks.navigate.mockReset();
		movieDetailHeaderMocks.router.invalidate.mockReset();
		movieDetailHeaderMocks.updateMovie.mutate.mockReset();
		movieDetailHeaderMocks.monitorProfile.mutate.mockReset();
		movieDetailHeaderMocks.unmonitorProfile.mutate.mockReset();
		movieDetailHeaderMocks.refreshMetadata.mutate.mockReset();
		movieDetailHeaderMocks.deleteMovie.mutate.mockReset();

		movieDetailHeaderMocks.updateMovie.mutate.mockImplementation(
			(
				_payload: unknown,
				options?: {
					onSuccess?: () => void;
				},
			) => {
				options?.onSuccess?.();
			},
		);
		movieDetailHeaderMocks.monitorProfile.mutate.mockImplementation(
			(
				_payload: unknown,
				options?: {
					onSuccess?: () => void;
				},
			) => {
				options?.onSuccess?.();
			},
		);
		movieDetailHeaderMocks.unmonitorProfile.mutate.mockImplementation(
			(
				_payload: unknown,
				options?: {
					onSuccess?: () => void;
				},
			) => {
				options?.onSuccess?.();
			},
		);
		movieDetailHeaderMocks.refreshMetadata.mutate.mockImplementation(
			(
				_payload: unknown,
				options?: {
					onSuccess?: () => void;
				},
			) => {
				options?.onSuccess?.();
			},
		);
		movieDetailHeaderMocks.deleteMovie.mutate.mockImplementation(
			(
				_payload: unknown,
				options?: {
					onSuccess?: () => void;
				},
			) => {
				options?.onSuccess?.();
			},
		);
	});

	it("renders metadata, fallback labels, and refreshes metadata", async () => {
		const user = userEvent.setup();
		const { container, getByText } = renderWithProviders(
			<MovieDetailHeader
				downloadProfiles={[
					{ contentType: "movie", icon: "film", id: 1, name: "HD" },
					{ contentType: "tv", icon: "tv", id: 2, name: "TV" },
				]}
				movie={{
					collectionId: null,
					downloadProfileIds: [1],
					genres: null,
					id: 5,
					imdbId: null,
					minimumAvailability: "unknown",
					overview: "",
					posterUrl: "",
					runtime: 61,
					status: "archived",
					studio: "",
					title: "Alien",
					tmdbId: 77,
					year: 0,
				}}
			/>,
		);

		expect(getByText("Alien")).toBeInTheDocument();
		expect(getByText("Archived")).toHaveClass("bg-zinc-600");
		expect(getByText("Unknown")).toBeInTheDocument();
		expect(getByText("1h 1m")).toBeInTheDocument();
		expect(getByText("No description available.")).toBeInTheDocument();
		expect(container.querySelector('a[href="/movies"]')).not.toBeNull();
		expect(
			container.querySelector('a[href="https://www.themoviedb.org/movie/77"]'),
		).not.toBeNull();

		await user.click(getByText("Refresh metadata"));
		expect(movieDetailHeaderMocks.refreshMetadata.mutate).toHaveBeenCalledWith(
			5,
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(movieDetailHeaderMocks.router.invalidate).toHaveBeenCalled();
	});

	it("edits profiles and saves updated download settings", async () => {
		const user = userEvent.setup();
		const { getByText } = renderWithProviders(
			<MovieDetailHeader
				downloadProfiles={[
					{ contentType: "movie", icon: "film", id: 1, name: "HD" },
					{ contentType: "movie", icon: "film", id: 3, name: "4K" },
				]}
				movie={{
					collectionId: 88,
					downloadProfileIds: [1],
					genres: ["Sci-Fi"],
					id: 9,
					imdbId: "tt0083658",
					minimumAvailability: "released",
					overview: "Replicants everywhere.",
					posterUrl: "/poster.jpg",
					runtime: 117,
					status: "released",
					studio: "Warner",
					title: "Blade Runner",
					tmdbId: 78,
					year: 1982,
				}}
			/>,
		);

		await user.click(getByText("Edit"));
		await user.selectOptions(
			document.querySelector("select") as HTMLSelectElement,
			"inCinemas",
		);
		await user.click(getByText("4K:idle"));
		await user.click(getByText("Save"));

		expect(movieDetailHeaderMocks.updateMovie.mutate).toHaveBeenCalledWith(
			{
				downloadProfileIds: [1, 3],
				id: 9,
				minimumAvailability: "inCinemas",
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
	});

	it("unmonitors active profiles and deletes collection movies with exclusions", async () => {
		const user = userEvent.setup();
		const { getByLabelText, getByTestId, getByText } = renderWithProviders(
			<MovieDetailHeader
				downloadProfiles={[
					{ contentType: "movie", icon: "film", id: 1, name: "HD" },
				]}
				movie={{
					collectionId: 44,
					downloadProfileIds: [1],
					genres: ["Sci-Fi"],
					id: 12,
					imdbId: "tt0133093",
					minimumAvailability: "announced",
					overview: "Wake up.",
					posterUrl: "/matrix.jpg",
					runtime: 0,
					status: "inCinemas",
					studio: "WB",
					title: "The Matrix",
					tmdbId: 603,
					year: 1999,
				}}
			/>,
		);

		await user.click(getByText("HD:active"));
		expect(getByTestId("unmonitor-dialog")).toHaveTextContent("HD:The Matrix");

		await user.click(getByText("Confirm unmonitor"));
		expect(movieDetailHeaderMocks.unmonitorProfile.mutate).toHaveBeenCalledWith(
			{ downloadProfileId: 1, movieId: 12 },
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);

		await user.click(getByText("Delete"));
		await user.click(
			getByLabelText("Prevent this movie from being re-added by collections"),
		);
		await user.click(getByText("Confirm"));

		expect(movieDetailHeaderMocks.deleteMovie.mutate).toHaveBeenCalledWith(
			{
				addImportExclusion: true,
				deleteFiles: true,
				id: 12,
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(movieDetailHeaderMocks.navigate).toHaveBeenCalledWith({
			to: "/movies",
		});
	});
});
