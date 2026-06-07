import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

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
	tvSearchResults: [] as Array<{
		entityType: "episode";
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
		title?: string;
	}>,
	assetPreviewRows: [] as Array<{
		assets: Array<{
			kind: "directory" | "file";
			ownershipReason: "container" | "direct" | "nested" | "token";
			relativeSourcePath: string;
			selected: boolean;
			sourcePath: string;
		}>;
		fileId: number;
	}>,
	userSettings: undefined as
		| {
				addDefaults?: {
					deleteDeselectedRelatedFiles?: boolean;
					moveRelatedFiles?: boolean;
					moveRelatedSidecars?: boolean;
				};
		  }
		| undefined,
	assetPreviewLoading: false,
	assetPreviewUndefined: false,
	loading: false,
	tvSearchLoading: false,
	tvSuggestionsUndefined: false,
}));

const mappingDialogMocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	mapUnmappedFileFn: vi.fn(),
	previewUnmappedImportAssetsFn: vi.fn(),
	searchLibraryFn: vi.fn(),
	suggestUnmappedTvMappingsFn: vi.fn(),
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
	upsertUserSettingsFn: vi.fn(),
	useDebounce: vi.fn((value: string) => value),
	useQuery: vi.fn(
		(options: {
			enabled?: boolean;
			queryFn?: () => unknown;
			queryKey?: unknown;
		}) => {
			if (options.enabled !== false && options.queryFn) {
				void options.queryFn();
			}
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
				if (queryKey[3] === "tv") {
					return {
						data: {
							library: mappingDialogState.tvSearchResults,
						},
						isFetched: true,
						isLoading: mappingDialogState.tvSearchLoading,
					};
				}

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
					data: mappingDialogState.tvSuggestionsUndefined
						? undefined
						: {
								rows: mappingDialogState.tvSuggestions,
							},
					isFetched: true,
					isLoading: false,
				};
			}

			if (queryKey[0] === "unmappedFiles" && queryKey[1] === "asset-preview") {
				return {
					data: mappingDialogState.assetPreviewUndefined
						? undefined
						: {
								rows: mappingDialogState.assetPreviewRows,
							},
					isFetched: true,
					isFetching: mappingDialogState.assetPreviewLoading,
					isLoading: mappingDialogState.assetPreviewLoading,
				};
			}

			return {
				data: undefined,
				isFetched: true,
				isLoading: false,
			};
		},
	),
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
		"aria-label": ariaLabel,
		checked,
		id,
		onCheckedChange,
	}: {
		"aria-label"?: string;
		checked?: boolean;
		id?: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			aria-label={ariaLabel}
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
				<button type="button" onClick={() => onOpenChange?.(false)}>
					close-dialog
				</button>
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
		...props
	}: ComponentPropsWithoutRef<"select"> & {
		children: ReactNode;
		onValueChange?: (value: string) => void;
	}) => (
		<select
			{...props}
			onChange={(event) => onValueChange?.(event.target.value)}
		>
			{children}
		</select>
	),
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({
		children,
		disabled,
		value,
	}: {
		children: ReactNode;
		disabled?: boolean;
		value: string;
	}) => {
		if (value.length === 0) {
			throw new Error("SelectItem value cannot be empty");
		}

		return (
			<option disabled={disabled} value={value}>
				{children}
			</option>
		);
	},
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
	previewUnmappedImportAssetsFn: (...args: unknown[]) =>
		mappingDialogMocks.previewUnmappedImportAssetsFn(...args),
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
		mappingDialogState.tvSearchResults = [];
		mappingDialogState.tvSuggestions = [];
		mappingDialogState.assetPreviewRows = [];
		mappingDialogState.assetPreviewLoading = false;
		mappingDialogState.assetPreviewUndefined = false;
		mappingDialogState.tvSearchLoading = false;
		mappingDialogState.tvSuggestionsUndefined = false;
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
		mappingDialogState.tvSearchResults = [
			{
				entityType: "episode",
				id: 101,
				subtitle: "S01E01 - Good News About Hell",
				title: "Severance",
			},
			{
				entityType: "episode",
				id: 102,
				subtitle: "S01E02 - Half Loop",
				title: "Severance",
			},
			{
				entityType: "episode",
				id: 201,
				subtitle: "S01E03 - In Perpetuity",
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
			.element(page.getByLabelText("Move related files"))
			.toBeChecked();
		await expect
			.element(
				page
					.getByText("S01E01 - Good News About Hell", { exact: true })
					.first(),
			)
			.toBeInTheDocument();
		await expect
			.element(page.getByText("S01E02 - Half Loop", { exact: true }).first())
			.toBeInTheDocument();
		await expect
			.element(page.getByText("/incoming/Severance.S01E01.mkv"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("/incoming/Severance.S01E02.mkv"))
			.toBeInTheDocument();
	});

	it("renders unresolved tv rows when the server returns no suggested title", async () => {
		mappingDialogState.profiles = [
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.tvSuggestions = [
			{
				fileId: 21,
				hints: null,
				path: "/incoming/Mystery.Show.S01E09.mkv",
				subtitle: "",
				suggestedEpisodeId: null,
			},
		];

		await renderWithProviders(
			<MappingDialog
				contentType="tv"
				files={
					[
						{
							id: 21,
							path: "/incoming/Mystery.Show.S01E09.mkv",
							hints: null,
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByText("No episode suggestion found"))
			.toBeInTheDocument();
		await expect
			.element(
				page.getByLabelText("Search episodes for Mystery.Show.S01E09.mkv"),
			)
			.toHaveValue("Mystery.Show.S01E09.mkv");
		await expect
			.element(page.getByRole("button", { name: "Map Selected Files" }))
			.toBeDisabled();
	});

	it("keeps submit disabled while related files are still loading", async () => {
		mappingDialogState.profiles = [
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.userSettings = {
			addDefaults: { moveRelatedFiles: true },
		};
		mappingDialogState.assetPreviewLoading = true;
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
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByLabelText("Move related files"))
			.toBeChecked();
		await expect
			.element(page.getByRole("button", { name: "Map Selected Files" }))
			.toBeDisabled();
	});

	it("lets one tv row change without affecting the others", async () => {
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
		mappingDialogState.tvSearchResults = [
			{
				entityType: "episode",
				id: 101,
				subtitle: "S01E01 - Good News About Hell",
				title: "Severance",
			},
			{
				entityType: "episode",
				id: 102,
				subtitle: "S01E02 - Half Loop",
				title: "Severance",
			},
			{
				entityType: "episode",
				id: 201,
				subtitle: "S01E03 - In Perpetuity",
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
			.element(page.getByLabelText("Episode target for Severance.S01E01.mkv"))
			.toHaveValue("101");
		await expect
			.element(page.getByLabelText("Episode target for Severance.S01E02.mkv"))
			.toHaveValue("102");

		await userEvent.selectOptions(
			page.getByLabelText("Episode target for Severance.S01E01.mkv"),
			"201",
		);

		await expect
			.element(page.getByLabelText("Episode target for Severance.S01E01.mkv"))
			.toHaveValue("201");
		await expect
			.element(page.getByLabelText("Episode target for Severance.S01E02.mkv"))
			.toHaveValue("102");
	});

	it("maps tv rows and persists the related-file defaults after success", async () => {
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
		mappingDialogState.tvSearchResults = [
			{
				entityType: "episode",
				id: 101,
				subtitle: "S01E01 - Good News About Hell",
				title: "Severance",
			},
			{
				entityType: "episode",
				id: 102,
				subtitle: "S01E02 - Half Loop",
				title: "Severance",
			},
			{
				entityType: "episode",
				id: 201,
				subtitle: "S01E03 - In Perpetuity",
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

		await userEvent.selectOptions(
			page.getByLabelText("Episode target for Severance.S01E01.mkv"),
			"201",
		);
		await page.getByLabelText("Move related files").click();
		await page.getByRole("button", { name: "Map Selected Files" }).click();

		expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
			data: {
				deleteDeselectedRelatedFiles: false,
				downloadProfileId: 8,
				moveRelatedFiles: false,
				rows: [
					{
						assets: [],
						entityId: 201,
						entityType: "episode",
						unmappedFileId: 11,
					},
					{
						assets: [],
						entityId: 102,
						entityType: "episode",
						unmappedFileId: 12,
					},
				],
			},
		});
		expect(mappingDialogMocks.upsertUserSettingsFn).toHaveBeenCalledWith({
			addDefaults: {
				deleteDeselectedRelatedFiles: false,
				moveRelatedFiles: false,
			},
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

	it("keeps only failed tv rows visible after a partial-success import", async () => {
		const onClose = vi.fn();

		mappingDialogState.profiles = [
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
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
		mappingDialogState.tvSearchResults = [
			{
				entityType: "episode",
				id: 101,
				subtitle: "S01E01 - Good News About Hell",
				title: "Severance",
			},
			{
				entityType: "episode",
				id: 102,
				subtitle: "S01E02 - Half Loop",
				title: "Severance",
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockResolvedValue({
			failedCount: 1,
			failures: [
				{
					entityType: "episode",
					message: "episode failed",
					sourcePath: "/incoming/Severance.S01E02.mkv",
					unmappedFileId: 12,
				},
			],
			mappedCount: 1,
			success: true,
			warnings: [],
		});

		await renderWithProviders(
			<MappingDialog
				contentType="tv"
				files={
					[
						{
							id: 11,
							path: "/incoming/Severance.S01E01.mkv",
							hints: { episode: 1, season: 1, title: "Severance" },
						},
						{
							id: 12,
							path: "/incoming/Severance.S01E02.mkv",
							hints: { episode: 2, season: 1, title: "Severance" },
						},
					] as MappingDialogFile[]
				}
				onClose={onClose}
			/>,
		);

		await page.getByRole("button", { name: "Map Selected Files" }).click();

		await expect.element(page.getByText("episode failed")).toBeInTheDocument();
		await expect
			.element(page.getByText("/incoming/Severance.S01E02.mkv"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("/incoming/Severance.S01E01.mkv"))
			.not.toBeInTheDocument();
		expect(mappingDialogMocks.toast.error).toHaveBeenCalledWith(
			"1 file failed to map",
		);
		expect(onClose).not.toHaveBeenCalled();
	});

	it("maps non-tv rows independently with the hinted search text and selected profile", async () => {
		const onClose = vi.fn();

		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies 4K" },
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.userSettings = {
			addDefaults: { moveRelatedSidecars: true },
		};
		mappingDialogState.results = [
			{
				entityType: "movie",
				id: 501,
				subtitle: "1979",
				title: "Alien",
			},
			{
				entityType: "movie",
				id: 502,
				subtitle: "1986",
				title: "Aliens",
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
							hints: { title: "Alien" },
						},
						{
							id: 12,
							path: "/incoming/Aliens (1986).mkv",
							hints: { title: "Aliens" },
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
			.element(page.getByLabelText("Search library for Alien (1979).mkv"))
			.toHaveValue("Alien");
		await expect
			.element(page.getByLabelText("Search library for Aliens (1986).mkv"))
			.toHaveValue("Aliens");
		await expect
			.element(page.getByLabelText("Download Profile"))
			.toHaveValue("7");
		await expect
			.element(page.getByLabelText("Move related files"))
			.toBeChecked();
		await expect
			.element(page.getByLabelText("Target for Alien (1979).mkv"))
			.toHaveValue("501");
		await expect
			.element(page.getByLabelText("Target for Aliens (1986).mkv"))
			.toHaveValue("502");

		await page.getByLabelText("Move related files").click();
		await page.getByRole("button", { name: "Map Selected Files" }).click();

		expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
			data: {
				deleteDeselectedRelatedFiles: false,
				downloadProfileId: 7,
				moveRelatedFiles: false,
				rows: [
					{
						assets: [],
						entityId: 501,
						entityType: "movie",
						unmappedFileId: 11,
					},
					{
						assets: [],
						entityId: 502,
						entityType: "movie",
						unmappedFileId: 12,
					},
				],
			},
		});
		expect(mappingDialogMocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["unmappedFiles"],
		});
		expect(mappingDialogMocks.upsertUserSettingsFn).toHaveBeenCalledWith({
			addDefaults: {
				deleteDeselectedRelatedFiles: false,
				moveRelatedFiles: false,
			},
			tableId: "unmapped-files",
		});
		expect(mappingDialogMocks.toast.success).toHaveBeenCalledWith(
			"2 files mapped",
		);
		expect(mappingDialogMocks.toast.error).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("keeps only failed rows visible after a partial-success import", async () => {
		const onClose = vi.fn();

		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies 4K" },
		];
		mappingDialogState.results = [
			{
				entityType: "movie",
				id: 501,
				subtitle: "1979",
				title: "Alien",
			},
			{
				entityType: "movie",
				id: 502,
				subtitle: "1986",
				title: "Aliens",
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockResolvedValue({
			failedCount: 1,
			failures: [
				{
					entityType: "movie",
					message: "db failed",
					sourcePath: "/incoming/Aliens (1986).mkv",
					unmappedFileId: 12,
				},
			],
			mappedCount: 1,
			success: true,
			warnings: [],
		});

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 11,
							path: "/incoming/Alien (1979).mkv",
							hints: { title: "Alien" },
						},
						{
							id: 12,
							path: "/incoming/Aliens (1986).mkv",
							hints: { title: "Aliens" },
						},
					] as MappingDialogFile[]
				}
				onClose={onClose}
			/>,
		);

		await page.getByRole("button", { name: "Map Selected Files" }).click();

		await expect.element(page.getByText("db failed")).toBeInTheDocument();
		await expect
			.element(page.getByText("/incoming/Aliens (1986).mkv"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("/incoming/Alien (1979).mkv"))
			.not.toBeInTheDocument();
		expect(mappingDialogMocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["unmappedFiles"],
		});
		expect(mappingDialogMocks.upsertUserSettingsFn).toHaveBeenCalledWith({
			addDefaults: {
				deleteDeselectedRelatedFiles: false,
				moveRelatedFiles: false,
			},
			tableId: "unmapped-files",
		});
		expect(mappingDialogMocks.toast.error).toHaveBeenCalledWith(
			"1 file failed to map",
		);
		expect(mappingDialogMocks.toast.success).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it("keeps the dialog open and resets submit state when mapping fails", async () => {
		const onClose = vi.fn();

		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies 4K" },
		];
		mappingDialogState.results = [
			{
				entityType: "movie",
				id: 501,
				subtitle: "1979",
				title: "Alien",
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockRejectedValueOnce(
			new Error("network failed"),
		);

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 11,
							path: "/incoming/Alien (1979).mkv",
							hints: { title: "Alien" },
						},
					] as MappingDialogFile[]
				}
				onClose={onClose}
			/>,
		);

		await page.getByRole("button", { name: "Map Selected Files" }).click();

		expect(mappingDialogMocks.toast.error).toHaveBeenCalledWith(
			"Failed to map files",
		);
		expect(onClose).not.toHaveBeenCalled();
		await expect
			.element(page.getByRole("button", { name: "Map Selected Files" }))
			.toBeEnabled();
	});

	it("renders previewed assets per row and submits deselected asset actions", async () => {
		mappingDialogState.profiles = [
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.userSettings = {
			addDefaults: {
				deleteDeselectedRelatedFiles: true,
				moveRelatedFiles: true,
			},
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
		];
		mappingDialogState.tvSearchResults = [
			{
				entityType: "episode",
				id: 101,
				subtitle: "S01E01 - Good News About Hell",
				title: "Severance",
			},
		];
		mappingDialogState.assetPreviewRows = [
			{
				fileId: 11,
				assets: [
					{
						kind: "file",
						ownershipReason: "direct",
						relativeSourcePath: "Season 1/Severance - S01E01-thumb.jpg",
						selected: true,
						sourcePath:
							"/incoming/Severance/Season 1/Severance - S01E01-thumb.jpg",
					},
					{
						kind: "file",
						ownershipReason: "container",
						relativeSourcePath: "theme.mp3",
						selected: true,
						sourcePath: "/incoming/Severance/theme.mp3",
					},
					{
						kind: "directory",
						ownershipReason: "nested",
						relativeSourcePath: "Extras",
						selected: true,
						sourcePath: "/incoming/Severance/Extras",
					},
				],
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockResolvedValue({
			mappedCount: 1,
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
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByRole("button", { name: /3 selected \/ 3 total/i }))
			.toBeInTheDocument();

		await page.getByRole("button", { name: /3 selected \/ 3 total/i }).click();
		await page.getByLabelText("theme.mp3").click();
		await page
			.getByLabelText("Toggle Nested assets for Severance.S01E01.mkv")
			.click();
		await page.getByRole("button", { name: "Map Selected Files" }).click();

		expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
			data: {
				deleteDeselectedRelatedFiles: true,
				downloadProfileId: 8,
				moveRelatedFiles: true,
				rows: [
					{
						assets: [
							{
								action: "move",
								kind: "file",
								ownershipReason: "direct",
								relativeSourcePath: "Season 1/Severance - S01E01-thumb.jpg",
								selected: true,
								sourcePath:
									"/incoming/Severance/Season 1/Severance - S01E01-thumb.jpg",
							},
							{
								action: "delete",
								kind: "file",
								ownershipReason: "container",
								relativeSourcePath: "theme.mp3",
								selected: false,
								sourcePath: "/incoming/Severance/theme.mp3",
							},
							{
								action: "delete",
								kind: "directory",
								ownershipReason: "nested",
								relativeSourcePath: "Extras",
								selected: false,
								sourcePath: "/incoming/Severance/Extras",
							},
						],
						entityId: 101,
						entityType: "episode",
						unmappedFileId: 11,
					},
				],
			},
		});
	});

	it("auto-selects non-tv targets from search matches and first-result fallbacks", async () => {
		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies" },
		];
		mappingDialogState.results = [
			{
				entityType: "movie",
				id: 701,
				subtitle: "2012",
				title: "Prometheus",
			},
			{
				entityType: "movie",
				id: 702,
				subtitle: "1982",
				title: "The Thing",
			},
		];

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 41,
							path: "/incoming/Unknown.mkv",
							hints: { title: "No Match" },
						},
						{
							id: 42,
							path: "/incoming/The Thing",
							hints: null,
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByLabelText("Target for Unknown.mkv"))
			.toHaveValue("701");
		await expect
			.element(page.getByLabelText("Target for The Thing"))
			.toHaveValue("702");
	});

	it("keeps the tv dialog open and reports when mapping fails", async () => {
		const onClose = vi.fn();
		mappingDialogState.profiles = [
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.tvSuggestions = [
			{
				fileId: 11,
				hints: { episode: 1, season: 1, title: "Severance" },
				path: "/incoming/Severance.S01E01.mkv",
				subtitle: "S01E01 - Good News About Hell",
				suggestedEpisodeId: 101,
				title: "Severance",
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockRejectedValueOnce(
			new Error("tv network failed"),
		);

		await renderWithProviders(
			<MappingDialog
				contentType="tv"
				files={
					[
						{
							id: 11,
							path: "/incoming/Severance.S01E01.mkv",
							hints: { episode: 1, season: 1, title: "Severance" },
						},
					] as MappingDialogFile[]
				}
				onClose={onClose}
			/>,
		);

		await page.getByRole("button", { name: "Map Selected Files" }).click();

		expect(mappingDialogMocks.toast.error).toHaveBeenCalledWith(
			"Failed to map files",
		);
		expect(onClose).not.toHaveBeenCalled();
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

	it("shows non-tv short-search, loading, and no-results states", async () => {
		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies" },
		];

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 51,
							path: "/A",
							hints: null,
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByText("Type at least 2 characters to search"))
			.toBeInTheDocument();

		await page.getByLabelText("Search library for A").fill("Alien");

		expect(mappingDialogMocks.searchLibraryFn).toHaveBeenCalledWith({
			data: {
				contentType: "movie",
				query: "Alien",
			},
		});
		await expect
			.element(page.getByText("No matching library entries found"))
			.toBeInTheDocument();
	});

	it("keeps a manually selected non-tv target when later results omit it", async () => {
		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies" },
		];
		mappingDialogState.results = [
			{
				entityType: "movie",
				id: 501,
				subtitle: "1979",
				title: "Alien",
			},
			{
				entityType: "movie",
				id: 502,
				subtitle: "1986",
				title: "Aliens",
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockResolvedValue({
			mappedCount: 1,
			success: true,
		});

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 53,
							path: "/incoming/Alien.mkv",
							hints: { title: "Alien" },
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await userEvent.selectOptions(
			page.getByLabelText("Target for Alien.mkv"),
			"502",
		);
		mappingDialogState.results = [
			{
				entityType: "book",
				id: 502,
				subtitle: "Wrong type",
				title: "Aliens novelization",
			},
			{
				entityType: "movie",
				id: 501,
				subtitle: "1979",
				title: "Alien",
			},
		];
		await page.getByLabelText("Search library for Alien.mkv").fill("Aliens");

		await expect
			.element(page.getByText("Movie 502 · Selected manually"))
			.toBeInTheDocument();
		await expect
			.element(page.getByLabelText("Target for Alien.mkv"))
			.toHaveValue("502");

		await page.getByRole("button", { name: "Map Selected Files" }).click();

		expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
			data: {
				deleteDeselectedRelatedFiles: false,
				downloadProfileId: 7,
				moveRelatedFiles: false,
				rows: [
					{
						assets: [],
						entityId: 502,
						entityType: "movie",
						unmappedFileId: 53,
					},
				],
			},
		});
	});

	it("shows the non-tv loading state while searching", async () => {
		mappingDialogState.loading = true;
		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies" },
		];

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 52,
							path: "/incoming/Alien.mkv",
							hints: { title: "Alien" },
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByText("Searching library..."))
			.toBeInTheDocument();
	});

	it("keeps a manually selected tv episode when later results omit it", async () => {
		mappingDialogState.profiles = [
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.tvSuggestions = [
			{
				fileId: 62,
				hints: { episode: 1, season: 1, title: "Severance" },
				path: "/incoming/Severance.S01E01.mkv",
				subtitle: "S01E01 - Good News About Hell",
				suggestedEpisodeId: 101,
				title: "Severance",
			},
		];
		mappingDialogState.tvSearchResults = [
			{
				entityType: "episode",
				id: 101,
				subtitle: "S01E01 - Good News About Hell",
				title: "Severance",
			},
			{
				entityType: "episode",
				id: 102,
				subtitle: "S01E02 - Half Loop",
				title: "Severance",
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockResolvedValue({
			mappedCount: 1,
			success: true,
		});

		await renderWithProviders(
			<MappingDialog
				contentType="tv"
				files={
					[
						{
							id: 62,
							path: "/incoming/Severance.S01E01.mkv",
							hints: { episode: 1, season: 1, title: "Severance" },
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await userEvent.selectOptions(
			page.getByLabelText("Episode target for Severance.S01E01.mkv"),
			"102",
		);
		mappingDialogState.tvSuggestions = [];
		mappingDialogState.tvSearchResults = [];
		await page
			.getByLabelText("Search episodes for Severance.S01E01.mkv")
			.fill("Other Show");

		await expect
			.element(page.getByText("Episode 102 · Selected manually"))
			.toBeInTheDocument();
		await expect
			.element(page.getByLabelText("Episode target for Severance.S01E01.mkv"))
			.toHaveValue("102");

		await page.getByRole("button", { name: "Map Selected Files" }).click();

		expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
			data: {
				deleteDeselectedRelatedFiles: false,
				downloadProfileId: 8,
				moveRelatedFiles: false,
				rows: [
					{
						assets: [],
						entityId: 102,
						entityType: "episode",
						unmappedFileId: 62,
					},
				],
			},
		});
	});

	it("shows tv no-results state after a valid search", async () => {
		mappingDialogState.profiles = [
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.tvSuggestions = [
			{
				fileId: 63,
				hints: null,
				path: "/incoming/Unknown.S01E01.mkv",
				subtitle: "",
				suggestedEpisodeId: null,
			},
		];

		await renderWithProviders(
			<MappingDialog
				contentType="tv"
				files={
					[
						{
							id: 63,
							path: "/incoming/Unknown.S01E01.mkv",
							hints: null,
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await page
			.getByLabelText("Search episodes for Unknown.S01E01.mkv")
			.fill("Unknown");

		await expect
			.element(page.getByText("No matching episodes found"))
			.toBeInTheDocument();
	});

	it("shows tv short-search hint and searches after typing a show title", async () => {
		mappingDialogState.profiles = [
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.tvSuggestions = [
			{
				fileId: 61,
				hints: null,
				path: "/A",
				subtitle: "",
				suggestedEpisodeId: null,
			},
		];

		await renderWithProviders(
			<MappingDialog
				contentType="tv"
				files={
					[
						{
							id: 61,
							path: "/A",
							hints: null,
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByText("Type at least 2 characters to search"))
			.toBeInTheDocument();
		await page.getByLabelText("Search episodes for A").fill("Severance");

		expect(mappingDialogMocks.searchLibraryFn).toHaveBeenCalledWith({
			data: {
				contentType: "tv",
				query: "Severance",
			},
		});
	});

	it("requests ebook asset previews as book content and tolerates missing preview data", async () => {
		mappingDialogState.profiles = [
			{ contentType: "ebook", id: 12, name: "Ebooks" },
		];
		mappingDialogState.assetPreviewUndefined = true;
		mappingDialogState.results = [
			{
				entityType: "book",
				id: 801,
				subtitle: "Isaac Asimov",
				title: "Foundation",
			},
		];

		await renderWithProviders(
			<MappingDialog
				contentType="ebook"
				files={
					[
						{
							id: 81,
							path: "/incoming/Foundation.epub",
							hints: { title: "Foundation" },
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		expect(
			mappingDialogMocks.previewUnmappedImportAssetsFn,
		).toHaveBeenCalledWith({
			data: {
				rows: [
					{
						contentType: "book",
						fileId: 81,
						path: "/incoming/Foundation.epub",
					},
				],
			},
		});
		await expect
			.element(page.getByText("No related assets found"))
			.toBeInTheDocument();
	});

	it("renders tv rows when suggestion data is missing and shows search loading", async () => {
		mappingDialogState.profiles = [
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.tvSuggestionsUndefined = true;
		mappingDialogState.tvSearchLoading = true;

		await renderWithProviders(
			<MappingDialog
				contentType="tv"
				files={
					[
						{
							id: 82,
							path: "/incoming/Severance.S01E01.mkv",
							hints: { title: "Severance" },
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByText("No episode suggestion found"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Searching episodes..."))
			.toBeInTheDocument();
	});

	it("calls onClose when the dialog open state changes to closed", async () => {
		const onClose = vi.fn();
		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies" },
		];

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 71,
							path: "/incoming/Alien.mkv",
							hints: { title: "Alien" },
						},
					] as MappingDialogFile[]
				}
				onClose={onClose}
			/>,
		);

		await page.getByRole("button", { name: "close-dialog" }).click();

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("submits non-tv related asset group selections and delete actions", async () => {
		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies" },
		];
		mappingDialogState.userSettings = {
			addDefaults: { moveRelatedFiles: true },
		};
		mappingDialogState.results = [
			{
				entityType: "movie",
				id: 501,
				subtitle: "1979",
				title: "Alien",
			},
		];
		mappingDialogState.assetPreviewRows = [
			{
				fileId: 72,
				assets: [
					{
						kind: "file",
						ownershipReason: "direct",
						relativeSourcePath: "Alien.en.srt",
						selected: true,
						sourcePath: "/incoming/Alien.en.srt",
					},
					{
						kind: "file",
						ownershipReason: "nested",
						relativeSourcePath: "Subs/Alien.fr.srt",
						selected: true,
						sourcePath: "/incoming/Subs/Alien.fr.srt",
					},
					{
						kind: "file",
						ownershipReason: "token",
						relativeSourcePath: "Alien-poster.jpg",
						selected: true,
						sourcePath: "/incoming/Alien-poster.jpg",
					},
					{
						kind: "directory",
						ownershipReason: "container",
						relativeSourcePath: "Featurettes",
						selected: true,
						sourcePath: "/incoming/Featurettes",
					},
				],
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockResolvedValue({
			mappedCount: 1,
			success: true,
		});

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 72,
							path: "/incoming/Alien (1979).mkv",
							hints: { title: "Alien" },
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await page.getByRole("button", { name: /4 selected \/ 4 total/i }).click();
		await page
			.getByLabelText("Toggle Direct file assets for Alien (1979).mkv")
			.click();
		await page.getByLabelText("Subs/Alien.fr.srt").click();
		await page
			.getByLabelText("Toggle Container assets for Alien (1979).mkv")
			.click();
		await page.getByLabelText("Delete deselected related files").click();
		await page.getByRole("button", { name: "Map Selected Files" }).click();

		expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
			data: {
				deleteDeselectedRelatedFiles: true,
				downloadProfileId: 7,
				moveRelatedFiles: true,
				rows: [
					{
						assets: [
							{
								action: "delete",
								kind: "file",
								ownershipReason: "direct",
								relativeSourcePath: "Alien.en.srt",
								selected: false,
								sourcePath: "/incoming/Alien.en.srt",
							},
							{
								action: "delete",
								kind: "file",
								ownershipReason: "nested",
								relativeSourcePath: "Subs/Alien.fr.srt",
								selected: false,
								sourcePath: "/incoming/Subs/Alien.fr.srt",
							},
							{
								action: "delete",
								kind: "file",
								ownershipReason: "token",
								relativeSourcePath: "Alien-poster.jpg",
								selected: false,
								sourcePath: "/incoming/Alien-poster.jpg",
							},
							{
								action: "move",
								kind: "directory",
								ownershipReason: "container",
								relativeSourcePath: "Featurettes",
								selected: true,
								sourcePath: "/incoming/Featurettes",
							},
						],
						entityId: 501,
						entityType: "movie",
						unmappedFileId: 72,
					},
				],
			},
		});
	});

	it("submits related assets as ignore when related-file moves are disabled", async () => {
		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies" },
		];
		mappingDialogState.results = [
			{
				entityType: "movie",
				id: 501,
				subtitle: "1979",
				title: "Alien",
			},
		];
		mappingDialogState.assetPreviewRows = [
			{
				fileId: 73,
				assets: [
					{
						kind: "file",
						ownershipReason: "direct",
						relativeSourcePath: "Alien.en.srt",
						selected: true,
						sourcePath: "/incoming/Alien.en.srt",
					},
					{
						kind: "file",
						ownershipReason: "container",
						relativeSourcePath: "poster.jpg",
						selected: false,
						sourcePath: "/incoming/poster.jpg",
					},
				],
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockResolvedValue({
			mappedCount: 1,
			success: true,
		});

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 73,
							path: "/incoming/Alien (1979).mkv",
							hints: { title: "Alien" },
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await page.getByRole("button", { name: "Map Selected Files" }).click();

		expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
			data: {
				deleteDeselectedRelatedFiles: false,
				downloadProfileId: 7,
				moveRelatedFiles: false,
				rows: [
					{
						assets: [
							{
								action: "ignore",
								kind: "file",
								ownershipReason: "direct",
								relativeSourcePath: "Alien.en.srt",
								selected: true,
								sourcePath: "/incoming/Alien.en.srt",
							},
							{
								action: "ignore",
								kind: "file",
								ownershipReason: "container",
								relativeSourcePath: "poster.jpg",
								selected: false,
								sourcePath: "/incoming/poster.jpg",
							},
						],
						entityId: 501,
						entityType: "movie",
						unmappedFileId: 73,
					},
				],
			},
		});
	});

	it("uses manually selected profiles and non-tv targets in the payload", async () => {
		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Default Movies" },
			{ contentType: "movie", id: 9, name: "Archive Movies" },
		];
		mappingDialogState.results = [
			{
				entityType: "movie",
				id: 701,
				subtitle: "2012",
				title: "Prometheus",
			},
			{
				entityType: "movie",
				id: 702,
				subtitle: "1982",
				title: "The Thing",
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockResolvedValue({
			mappedCount: 1,
			success: true,
		});

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 73,
							path: "/incoming/Unknown.mkv",
							hints: { title: "Unknown" },
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await userEvent.selectOptions(page.getByLabelText("Download Profile"), "9");
		await userEvent.selectOptions(
			page.getByLabelText("Target for Unknown.mkv"),
			"702",
		);
		await page.getByRole("button", { name: "Map Selected Files" }).click();

		expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
			data: {
				deleteDeselectedRelatedFiles: false,
				downloadProfileId: 9,
				moveRelatedFiles: false,
				rows: [
					{
						assets: [],
						entityId: 702,
						entityType: "movie",
						unmappedFileId: 73,
					},
				],
			},
		});
	});

	it("disables submit for unresolved non-tv rows", async () => {
		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies" },
		];

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 74,
							path: "/incoming/A.mkv",
							hints: null,
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByRole("button", { name: "Map Selected Files" }))
			.toBeDisabled();
	});

	it("disables submit while non-tv asset previews are loading", async () => {
		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies" },
		];
		mappingDialogState.userSettings = {
			addDefaults: { moveRelatedFiles: true },
		};
		mappingDialogState.assetPreviewLoading = true;
		mappingDialogState.results = [
			{
				entityType: "movie",
				id: 501,
				subtitle: "1979",
				title: "Alien",
			},
		];

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				files={
					[
						{
							id: 75,
							path: "/incoming/Alien.mkv",
							hints: { title: "Alien" },
						},
					] as MappingDialogFile[]
				}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByRole("button", { name: "Map Selected Files" }))
			.toBeDisabled();
	});
});
