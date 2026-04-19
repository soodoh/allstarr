import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

type MappingDialogFile = {
	id: number;
	path: string;
	hints: {
		author?: string;
		episode?: number;
		season?: number;
		source?: "filename" | "path" | "metadata";
		title?: string;
		year?: number;
	} | null;
};

const mappingDialogState = vi.hoisted(() => ({
	profiles: [] as Array<{
		contentType: string;
		id: number;
		name: string;
	}>,
	results: [] as Array<{
		entityType: "book" | "movie" | "episode";
		id: number;
		subtitle: string;
		title: string;
	}>,
	tvSuggestions: [] as Array<{
		fileId: number;
		hints: null | {
			episode?: number;
			season?: number;
			source?: "filename" | "path" | "metadata";
			title?: string;
		};
		path: string;
		subtitle: string;
		suggestedEpisodeId: number | null;
		title: string;
	}>,
	userSettings: undefined as
		| {
				addDefaults?: {
					moveRelatedSidecars?: boolean;
				};
		  }
		| undefined,
	loading: false,
}));

const mappingDialogMocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	mapUnmappedFileFn: vi.fn(),
	searchLibraryFn: vi.fn(),
	suggestUnmappedTvMappingsFn: vi.fn(),
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
	upsertUserSettingsFn: vi.fn(),
	useDebounce: vi.fn((value: string) => value),
	useQuery: vi.fn((options: { queryKey?: unknown }) => {
		const queryKey = Array.isArray(options.queryKey) ? options.queryKey : [];

		if (queryKey[0] === "downloadProfiles") {
			return {
				data: mappingDialogState.profiles,
				isFetched: true,
			};
		}

		if (queryKey[0] === "userSettings") {
			return {
				data: mappingDialogState.userSettings,
				isFetched: true,
			};
		}

		if (queryKey[0] === "unmappedFiles" && queryKey[1] === "search") {
			return {
				data: {
					library: mappingDialogState.results,
				},
				isFetched: true,
				isLoading: mappingDialogState.loading,
			};
		}

		if (queryKey[0] === "unmappedFiles" && queryKey[1] === "tv-suggestions") {
			return {
				data: {
					rows: mappingDialogState.tvSuggestions,
				},
				isFetched: true,
				isLoading: false,
			};
		}

		return {
			data: undefined,
			isFetched: true,
			isLoading: false,
		};
	}),
	useQueryClient: vi.fn(() => ({
		invalidateQueries: mappingDialogMocks.invalidateQueries,
	})),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (options: { queryKey?: unknown }) =>
			mappingDialogMocks.useQuery(options),
		useQueryClient: () => mappingDialogMocks.useQueryClient(),
	};
});

vi.mock("sonner", () => ({
	toast: mappingDialogMocks.toast,
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

vi.mock("src/components/ui/checkbox", () => ({
	default: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		id?: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			aria-label="Move related sidecar files"
			checked={Boolean(checked)}
			id={id}
			onChange={() => onCheckedChange?.(!checked)}
			type="checkbox"
		/>
	),
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({
		children,
		onOpenChange,
		open,
	}: {
		children: ReactNode;
		onOpenChange?: (open: boolean) => void;
		open: boolean;
	}) =>
		open ? (
			<div data-testid="dialog" data-on-open-change={Boolean(onOpenChange)}>
				{children}
			</div>
		) : null,
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
	default: ({ onChange, ...props }: ComponentPropsWithoutRef<"input">) => (
		<input {...props} onChange={(event) => onChange?.(event)} type="text" />
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
		<option value={value}>{children}</option>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectValue: () => null,
}));

vi.mock("src/hooks/mutations/user-settings", () => ({
	useUpsertUserSettings: () => ({
		mutate: mappingDialogMocks.upsertUserSettingsFn,
	}),
}));

vi.mock("src/hooks/use-debounce", () => ({
	useDebounce: (value: string) => mappingDialogMocks.useDebounce(value),
}));

vi.mock("src/lib/queries/download-profiles", () => ({
	downloadProfilesListQuery: () => ({
		queryKey: ["downloadProfiles", "list"],
	}),
}));

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (tableId: string) => ({
		queryKey: ["userSettings", tableId],
	}),
}));

vi.mock("src/server/unmapped-files", () => ({
	mapUnmappedFileFn: (...args: unknown[]) =>
		mappingDialogMocks.mapUnmappedFileFn(...args),
	searchLibraryFn: (...args: unknown[]) =>
		mappingDialogMocks.searchLibraryFn(...args),
	suggestUnmappedTvMappingsFn: (...args: unknown[]) =>
		mappingDialogMocks.suggestUnmappedTvMappingsFn(...args),
}));

import MappingDialog from "./mapping-dialog";

describe("MappingDialog", () => {
	afterEach(() => {
		vi.clearAllMocks();
		mappingDialogState.loading = false;
		mappingDialogState.profiles = [];
		mappingDialogState.results = [];
		mappingDialogState.tvSuggestions = [];
		mappingDialogState.userSettings = undefined;
	});

	it("renders one tv row per selected file and loads the saved sidecar default", async () => {
		mappingDialogState.profiles = [
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.userSettings = {
			addDefaults: { moveRelatedSidecars: true },
		};
		mappingDialogState.tvSuggestions = [
			{
				fileId: 11,
				hints: {
					episode: 1,
					season: 1,
					source: "filename",
					title: "Severance",
				},
				path: "/incoming/Severance.S01E01.mkv",
				subtitle: "S01E01 - Good News About Hell",
				suggestedEpisodeId: 101,
				title: "Severance",
			},
			{
				fileId: 12,
				hints: {
					episode: 2,
					season: 1,
					source: "filename",
					title: "Severance",
				},
				path: "/incoming/Severance.S01E02.mkv",
				subtitle: "S01E02 - Half Loop",
				suggestedEpisodeId: 102,
				title: "Severance",
			},
		];

		await renderWithProviders(
			<MappingDialog
				contentType="tv"
				files={
					[
						{
							id: 11,
							path: "/incoming/Severance.S01E01.mkv",
							hints: {
								episode: 1,
								season: 1,
								title: "Severance",
							},
						},
						{
							id: 12,
							path: "/incoming/Severance.S01E02.mkv",
							hints: {
								episode: 2,
								season: 1,
								title: "Severance",
							},
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByLabelText("Move related sidecar files"))
			.toBeChecked();
		await expect
			.element(page.getByText("S01E01 - Good News About Hell"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("S01E02 - Half Loop"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("/incoming/Severance.S01E01.mkv"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("/incoming/Severance.S01E02.mkv"))
			.toBeInTheDocument();
	});

	it("maps tv rows and persists the sidecar checkbox after success", async () => {
		const onClose = vi.fn();

		mappingDialogState.profiles = [
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.userSettings = {
			addDefaults: { moveRelatedSidecars: true },
		};
		mappingDialogState.tvSuggestions = [
			{
				fileId: 11,
				hints: {
					episode: 1,
					season: 1,
					source: "filename",
					title: "Severance",
				},
				path: "/incoming/Severance.S01E01.mkv",
				subtitle: "S01E01 - Good News About Hell",
				suggestedEpisodeId: 101,
				title: "Severance",
			},
			{
				fileId: 12,
				hints: {
					episode: 2,
					season: 1,
					source: "filename",
					title: "Severance",
				},
				path: "/incoming/Severance.S01E02.mkv",
				subtitle: "S01E02 - Half Loop",
				suggestedEpisodeId: 102,
				title: "Severance",
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockResolvedValue({
			mappedCount: 2,
			success: true,
		});

		await renderWithProviders(
			<MappingDialog
				contentType="tv"
				files={
					[
						{
							id: 11,
							path: "/incoming/Severance.S01E01.mkv",
							hints: {
								episode: 1,
								season: 1,
								title: "Severance",
							},
						},
						{
							id: 12,
							path: "/incoming/Severance.S01E02.mkv",
							hints: {
								episode: 2,
								season: 1,
								title: "Severance",
							},
						},
					] as MappingDialogFile[]
				}
				onClose={onClose}
			/>,
		);

		await page.getByLabelText("Move related sidecar files").click();
		await page.getByRole("button", { name: "Map Selected Files" }).click();

		expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
			data: {
				downloadProfileId: 8,
				entityType: "episode",
				moveRelatedSidecars: false,
				tvMappings: [
					{ episodeId: 101, unmappedFileId: 11 },
					{ episodeId: 102, unmappedFileId: 12 },
				],
			},
		});
		expect(mappingDialogMocks.upsertUserSettingsFn).toHaveBeenCalledWith({
			addDefaults: { moveRelatedSidecars: false },
			tableId: "unmapped-files",
		});
		expect(mappingDialogMocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["unmappedFiles"],
		});
		expect(mappingDialogMocks.toast.success).toHaveBeenCalledWith(
			"2 files mapped",
		);
		expect(mappingDialogMocks.toast.error).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("maps a search result with the hinted search text and selected profile", async () => {
		const onClose = vi.fn();

		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies 4K" },
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.results = [
			{
				entityType: "movie",
				id: 501,
				subtitle: "1979",
				title: "Alien",
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockResolvedValue({
			mappedCount: 2,
			success: true,
		});

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 11,
							path: "/incoming/Alien (1979).mkv",
							hints: { author: "Ridley Scott", title: "Alien" },
						},
						{
							id: 12,
							path: "/incoming/Alien sample.nfo",
							hints: null,
						},
					] as MappingDialogFile[]
				}
				onClose={onClose}
			/>,
		);

		await expect
			.element(page.getByRole("heading", { name: "Map 2 files" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByLabelText("Search Library"))
			.toHaveValue("Alien Ridley Scott");
		await expect.element(page.getByRole("combobox")).toHaveValue("7");
		await expect.element(page.getByText("Alien")).toBeInTheDocument();
		await expect.element(page.getByText("1979")).toBeInTheDocument();

		await page.getByRole("button", { name: "Map Here" }).click();

		expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
			data: {
				downloadProfileId: 7,
				entityId: 501,
				entityType: "movie",
				unmappedFileIds: [11, 12],
			},
		});
		expect(mappingDialogMocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["unmappedFiles"],
		});
		expect(mappingDialogMocks.toast.success).toHaveBeenCalledWith(
			'2 files mapped to "Alien"',
		);
		expect(mappingDialogMocks.toast.error).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("shows the profile fallback and no-results state when nothing matches", async () => {
		mappingDialogState.profiles = [
			{ contentType: "movie", id: 9, name: "Movies" },
		];

		await renderWithProviders(
			<MappingDialog
				contentType="tv"
				files={
					[
						{
							id: 42,
							path: "/incoming/Unknown show.mkv",
							hints: null,
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(
				page.getByText(
					"No tv profiles available. Create one in Settings > Profiles.",
				),
			)
			.toBeInTheDocument();
	});
});
