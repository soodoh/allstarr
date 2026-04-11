import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

const showDetailHeaderMocks = vi.hoisted(() => ({
	bulkMonitor: {
		mutate: vi.fn(),
	},
	bulkUnmonitor: {
		isPending: false,
		mutate: vi.fn(),
	},
	deleteShow: {
		isPending: false,
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
	unmonitorShowProfile: {
		mutate: vi.fn(),
	},
	updateShow: {
		isPending: false,
		mutate: vi.fn(),
	},
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		params,
		to,
	}: {
		children: ReactNode;
		params?: Record<string, string>;
		to: string;
	}) => <a href={to.replace("$showId", params?.showId ?? "")}>{children}</a>,
	useNavigate: () => showDetailHeaderMocks.navigate,
	useRouter: () => showDetailHeaderMocks.router,
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
				Update metadata
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
		className,
		src,
		type,
	}: {
		alt: string;
		className?: string;
		src: string | null;
		type: string;
	}) => (
		<img
			alt={alt}
			className={className}
			data-type={type}
			src={src ?? undefined}
		/>
	),
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

vi.mock("src/components/shared/profile-toggle-icons", () => ({
	default: ({
		activeProfileIds,
		onToggle,
		partialProfileIds,
		profiles,
	}: {
		activeProfileIds: number[];
		onToggle: (profileId: number) => void;
		partialProfileIds: number[];
		profiles: Array<{ id: number; name: string }>;
	}) => (
		<div>
			{profiles.map((profile) => {
				const state = activeProfileIds.includes(profile.id)
					? "active"
					: partialProfileIds.includes(profile.id)
						? "partial"
						: "inactive";

				return (
					<button
						key={profile.id}
						onClick={() => onToggle(profile.id)}
						type="button"
					>
						{profile.name}:{state}
					</button>
				);
			})}
		</div>
	),
}));

vi.mock("src/components/shared/confirm-dialog", () => ({
	default: ({
		description,
		loading,
		onConfirm,
		onOpenChange,
		open,
		title,
	}: {
		description: string;
		loading?: boolean;
		onConfirm: () => void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		title: string;
	}) =>
		open ? (
			<div data-testid="confirm-dialog">
				<div>{title}</div>
				<div>{description}</div>
				<button onClick={() => onOpenChange(false)} type="button">
					Cancel
				</button>
				<button disabled={loading} onClick={onConfirm} type="button">
					Confirm
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/shared/unmonitor-dialog", () => ({
	default: ({
		fileCount,
		isPending,
		itemTitle,
		itemType,
		open,
		onConfirm,
		onOpenChange,
		profileName,
	}: {
		fileCount: number;
		isPending: boolean;
		itemTitle: string;
		itemType: string;
		open: boolean;
		onConfirm: (deleteFiles: boolean) => void;
		onOpenChange: (open: boolean) => void;
		profileName: string;
	}) =>
		open ? (
			<div data-testid="unmonitor-dialog">
				<div>
					unmonitor:{profileName}:{itemTitle}:{itemType}:{String(isPending)}:
					{fileCount}
				</div>
				<button onClick={() => onConfirm(false)} type="button">
					Confirm
				</button>
				<button onClick={() => onOpenChange(false)} type="button">
					Close dialog
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/tv/episode-group-accordion", () => ({
	default: ({
		isAnimeOverride,
		onChange,
		value,
	}: {
		isAnimeOverride: boolean;
		onChange: (value: string | null) => void;
		value: string | null;
	}) => (
		<div data-testid="episode-group-accordion">
			<div>{`episode-group:${value ?? "none"}:${String(isAnimeOverride)}`}</div>
			<button onClick={() => onChange("group-1")} type="button">
				Choose episode group
			</button>
		</div>
	),
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
		asChild,
		children,
		disabled,
		onClick,
	}: {
		asChild?: boolean;
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
	}) =>
		asChild ? (
			children
		) : (
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

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog-root">{children}</div> : null,
	DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogContent: ({ children }: { children: ReactNode }) => (
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

vi.mock("src/components/ui/switch", () => ({
	default: ({
		checked,
		onCheckedChange,
	}: {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			aria-label="Use Season Folder"
			checked={checked}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
			type="checkbox"
		/>
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
				<label key={profile.id}>
					<input
						aria-label={profile.name}
						checked={selectedIds.includes(profile.id)}
						onChange={() => onToggle(profile.id)}
						type="checkbox"
					/>
					{profile.name}
				</label>
			))}
		</div>
	),
}));

vi.mock("src/hooks/mutations/episode-profiles", () => ({
	useBulkMonitorEpisodeProfile: () => showDetailHeaderMocks.bulkMonitor,
	useBulkUnmonitorEpisodeProfile: () => showDetailHeaderMocks.bulkUnmonitor,
}));

vi.mock("src/hooks/mutations/shows", () => ({
	useDeleteShow: () => showDetailHeaderMocks.deleteShow,
	useRefreshShowMetadata: () => showDetailHeaderMocks.refreshMetadata,
	useUnmonitorShowProfile: () => showDetailHeaderMocks.unmonitorShowProfile,
	useUpdateShow: () => showDetailHeaderMocks.updateShow,
}));

import ShowDetailHeader from "./show-detail-header";

describe("ShowDetailHeader", () => {
	beforeEach(() => {
		showDetailHeaderMocks.bulkMonitor.mutate.mockReset();
		showDetailHeaderMocks.bulkUnmonitor.isPending = false;
		showDetailHeaderMocks.bulkUnmonitor.mutate.mockReset();
		showDetailHeaderMocks.deleteShow.isPending = false;
		showDetailHeaderMocks.deleteShow.mutate.mockReset();
		showDetailHeaderMocks.navigate.mockReset();
		showDetailHeaderMocks.refreshMetadata.isPending = false;
		showDetailHeaderMocks.refreshMetadata.mutate.mockReset();
		showDetailHeaderMocks.router.invalidate.mockReset();
		showDetailHeaderMocks.unmonitorShowProfile.mutate.mockReset();
		showDetailHeaderMocks.updateShow.isPending = false;
		showDetailHeaderMocks.updateShow.mutate.mockReset();
	});

	it("renders the show summary, assigned profiles, and fallbacks", async () => {
		await renderWithProviders(
			<ShowDetailHeader
				downloadProfiles={[
					{ contentType: "tv", icon: "tv", id: 11, name: "4K" },
					{ contentType: "tv", icon: "tv", id: 12, name: "HD" },
					{ contentType: "movie", icon: "film", id: 13, name: "Movies" },
				]}
				show={{
					downloadProfileIds: [11, 12],
					episodeGroupId: null,
					genres: ["Drama", "Mystery"],
					id: 8,
					imdbId: null,
					monitorNewSeasons: "all",
					network: "Apple TV+",
					overview: "",
					posterUrl: "/severance.jpg",
					runtime: 55,
					seasons: [
						{
							id: 1,
							episodes: [
								{ id: 1, downloadProfileIds: [11, 12], hasFile: true },
								{ id: 2, downloadProfileIds: [11], hasFile: false },
							],
							seasonNumber: 1,
						},
					],
					seriesType: "standard",
					status: "continuing",
					title: "Severance",
					tmdbId: 12345,
					useSeasonFolder: null,
					year: 2022,
				}}
			/>,
		);

		await expect
			.element(page.getByRole("heading", { name: "Severance" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("2022 - Apple TV+"))
			.toBeInTheDocument();
		await expect.element(page.getByText("55m")).toBeInTheDocument();
		await expect
			.element(page.getByText("Continuing"))
			.toHaveClass("bg-green-600");
		await expect.element(page.getByText("Standard")).toBeInTheDocument();
		await expect.element(page.getByText("Drama, Mystery")).toBeInTheDocument();
		await expect.element(page.getByText("1/2 episodes")).toBeInTheDocument();
		await expect
			.element(page.getByText("No description available."))
			.toBeInTheDocument();
		await expect.element(page.getByText("IMDB")).not.toBeInTheDocument();
		await expect.element(page.getByText("4K:active")).toBeInTheDocument();
		await expect.element(page.getByText("HD:partial")).toBeInTheDocument();
		await expect
			.element(page.getByText("Movies:inactive"))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: "Back to TV Shows" }))
			.toHaveAttribute("href", "/tv");
		await expect
			.element(page.getByRole("link", { name: "Open in TMDB" }))
			.toHaveAttribute("href", "https://www.themoviedb.org/tv/12345");
		await expect
			.element(page.getByAltText("Severance poster"))
			.toHaveAttribute("src", "/severance.jpg");
	});

	it("refreshes metadata and saves edited show settings", async () => {
		await renderWithProviders(
			<ShowDetailHeader
				downloadProfiles={[
					{ contentType: "tv", icon: "tv", id: 11, name: "4K" },
					{ contentType: "tv", icon: "tv", id: 12, name: "HD" },
				]}
				show={{
					downloadProfileIds: [11],
					episodeGroupId: null,
					genres: null,
					id: 99,
					imdbId: "tt1234567",
					monitorNewSeasons: "all",
					network: "HBO",
					overview: "A mysterious story about profile management.",
					posterUrl: "/darkroom.jpg",
					runtime: 60,
					seasons: [
						{
							id: 3,
							episodes: [
								{ id: 301, downloadProfileIds: [11], hasFile: true },
								{ id: 302, downloadProfileIds: [11], hasFile: true },
							],
							seasonNumber: 1,
						},
					],
					seriesType: "standard",
					status: "upcoming",
					title: "Darkroom",
					tmdbId: 777,
					useSeasonFolder: null,
					year: 2024,
				}}
			/>,
		);

		await page.getByRole("button", { name: "Update metadata" }).click();
		expect(showDetailHeaderMocks.refreshMetadata.mutate).toHaveBeenCalledWith(
			99,
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);

		const refreshOnSuccess = showDetailHeaderMocks.refreshMetadata.mutate.mock
			.calls[0]?.[1]?.onSuccess as (() => void) | undefined;
		refreshOnSuccess?.();
		expect(showDetailHeaderMocks.router.invalidate).toHaveBeenCalledTimes(1);

		await page.getByRole("button", { name: "Edit" }).click();
		await expect
			.element(page.getByText("Edit Download Profiles"))
			.toBeInTheDocument();

		const selects = page.getByRole("combobox").all();
		await userEvent.selectOptions(selects[0], "new");
		await userEvent.selectOptions(selects[1], "anime");
		await page.getByRole("checkbox", { name: "HD" }).click();
		await page.getByRole("checkbox", { name: "Use Season Folder" }).click();
		await page.getByRole("button", { name: "Choose episode group" }).click();
		await page.getByRole("button", { name: "Save" }).click();

		expect(showDetailHeaderMocks.updateShow.mutate).toHaveBeenCalledWith(
			{
				downloadProfileIds: [11, 12],
				episodeGroupId: "group-1",
				id: 99,
				monitorNewSeasons: "new",
				seriesType: "anime",
				useSeasonFolder: true,
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);

		const updateOnSuccess = showDetailHeaderMocks.updateShow.mutate.mock
			.calls[0]?.[1]?.onSuccess as (() => void) | undefined;
		updateOnSuccess?.();

		expect(showDetailHeaderMocks.router.invalidate).toHaveBeenCalledTimes(2);
		await expect
			.element(page.getByTestId("dialog-root"))
			.not.toBeInTheDocument();
	});

	it("unmonitors an active profile and deletes the show", async () => {
		await renderWithProviders(
			<ShowDetailHeader
				downloadProfiles={[
					{ contentType: "tv", icon: "tv", id: 11, name: "4K" },
					{ contentType: "tv", icon: "tv", id: 12, name: "HD" },
				]}
				show={{
					downloadProfileIds: [11],
					episodeGroupId: null,
					genres: null,
					id: 42,
					imdbId: null,
					monitorNewSeasons: "all",
					network: "",
					overview: "A second show used to exercise destructive flows.",
					posterUrl: "/archive.jpg",
					runtime: 44,
					seasons: [
						{
							id: 9,
							episodes: [
								{ id: 901, downloadProfileIds: [11], hasFile: true },
								{ id: 902, downloadProfileIds: [11], hasFile: true },
							],
							seasonNumber: 1,
						},
					],
					seriesType: "daily",
					status: "ended",
					title: "Archive",
					tmdbId: 888,
					useSeasonFolder: null,
					year: 2021,
				}}
			/>,
		);

		await page.getByRole("button", { name: "4K:active" }).click();
		await expect
			.element(page.getByTestId("unmonitor-dialog"))
			.toHaveTextContent("unmonitor:4K:Archive:show:false:0");

		await page.getByRole("button", { name: "Confirm" }).click();
		expect(showDetailHeaderMocks.bulkUnmonitor.mutate).toHaveBeenCalledWith(
			{
				deleteFiles: false,
				downloadProfileId: 11,
				episodeIds: [901, 902],
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);

		const bulkUnmonitorOnSuccess = showDetailHeaderMocks.bulkUnmonitor.mutate
			.mock.calls[0]?.[1]?.onSuccess as (() => void) | undefined;
		bulkUnmonitorOnSuccess?.();

		expect(
			showDetailHeaderMocks.unmonitorShowProfile.mutate,
		).toHaveBeenCalledWith(
			{ downloadProfileId: 11, showId: 42 },
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);

		const unmonitorShowOnSuccess = showDetailHeaderMocks.unmonitorShowProfile
			.mutate.mock.calls[0]?.[1]?.onSuccess as (() => void) | undefined;
		unmonitorShowOnSuccess?.();

		expect(showDetailHeaderMocks.router.invalidate).toHaveBeenCalledTimes(1);

		await page.getByRole("button", { name: "Delete" }).click();
		await expect
			.element(page.getByTestId("confirm-dialog"))
			.toHaveTextContent("Delete Show");

		await page.getByRole("button", { name: "Confirm" }).click();
		expect(showDetailHeaderMocks.deleteShow.mutate).toHaveBeenCalledWith(
			{ deleteFiles: true, id: 42 },
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);

		const deleteOnSuccess = showDetailHeaderMocks.deleteShow.mutate.mock
			.calls[0]?.[1]?.onSuccess as (() => void) | undefined;
		deleteOnSuccess?.();

		expect(showDetailHeaderMocks.navigate).toHaveBeenCalledWith({
			to: "/tv",
		});
	});
});
