import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import type { JSX } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "src/components/ui/button";
import Checkbox from "src/components/ui/checkbox";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import type { UnmappedFileHints } from "src/db/schema/unmapped-files";
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
import { useDebounce } from "src/hooks/use-debounce";
import { downloadProfilesListQuery } from "src/lib/queries/download-profiles";
import { userSettingsQuery } from "src/lib/queries/user-settings";
import { queryKeys } from "src/lib/query-keys";
import {
	mapUnmappedFileFn,
	previewUnmappedImportAssetsFn,
	searchLibraryFn,
	suggestUnmappedTvMappingsFn,
} from "src/server/unmapped-files";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MappingDialogFile = {
	id: number;
	path: string;
	hints: UnmappedFileHints | null;
};

type MappingDialogProps = {
	contentType: string;
	files: MappingDialogFile[];
	onClose: () => void;
};

type LibraryResult = {
	id: number;
	title: string;
	subtitle: string;
	entityType: "book" | "movie" | "episode";
};

type TvSuggestionRow = {
	fileId: number;
	hints: MappingDialogFile["hints"];
	path: string;
	subtitle: string;
	suggestedEpisodeId: number | null;
	title?: string;
};

type TvRowState = {
	assets: ImportAssetState[];
	assetsExpanded: boolean;
	errorMessage: string | null;
	search: string;
	selectedEpisodeId: number | null;
};

type NonTvRowState = {
	assets: ImportAssetState[];
	assetsExpanded: boolean;
	errorMessage: string | null;
	search: string;
	selectedEntityId: number | null;
};

type ImportRowIssue = {
	entityType: "book" | "episode" | "movie";
	message: string;
	sourcePath: string;
	unmappedFileId: number;
};

type MapImportResult = {
	failedCount?: number;
	failures?: ImportRowIssue[];
	mappedCount: number;
	success: boolean;
	warnings?: ImportRowIssue[];
};

type ImportAssetState = {
	kind: "directory" | "file";
	ownershipReason: "container" | "direct" | "nested" | "token";
	relativeSourcePath: string;
	selected: boolean;
	sourcePath: string;
};

type TvRowProps = {
	assetSummary: string;
	file: MappingDialogFile;
	onAssetExpandedChange: (fileId: number, expanded: boolean) => void;
	onAssetSelectedChange: (
		fileId: number,
		sourcePath: string,
		selected: boolean,
	) => void;
	onGroupSelectedChange: (
		fileId: number,
		ownershipReason: ImportAssetState["ownershipReason"],
		selected: boolean,
	) => void;
	onSearchChange: (fileId: number, search: string) => void;
	onSelectedEpisodeIdChange: (
		fileId: number,
		selectedEpisodeId: number | null,
	) => void;
	rowState: TvRowState;
	suggestion: TvSuggestionRow | undefined;
};

type NonTvRowProps = {
	assetSummary: string;
	contentType: string;
	file: MappingDialogFile;
	onAssetExpandedChange: (fileId: number, expanded: boolean) => void;
	onAssetSelectedChange: (
		fileId: number,
		sourcePath: string,
		selected: boolean,
	) => void;
	onGroupSelectedChange: (
		fileId: number,
		ownershipReason: ImportAssetState["ownershipReason"],
		selected: boolean,
	) => void;
	onSearchChange: (fileId: number, search: string) => void;
	onSelectedEntityIdChange: (
		fileId: number,
		selectedEntityId: number | null,
	) => void;
	rowState: NonTvRowState;
	selectionTouched: boolean;
};

type RowAssetsProps = {
	assetSummary: string;
	assets: ImportAssetState[];
	assetsExpanded: boolean;
	file: MappingDialogFile;
	onAssetExpandedChange: (fileId: number, expanded: boolean) => void;
	onAssetSelectedChange: (
		fileId: number,
		sourcePath: string,
		selected: boolean,
	) => void;
	onGroupSelectedChange: (
		fileId: number,
		ownershipReason: ImportAssetState["ownershipReason"],
		selected: boolean,
	) => void;
};

function getFileName(pathname: string): string {
	const fileName = pathname.split("/").pop();
	return fileName && fileName.length > 0 ? fileName : pathname;
}

function buildInitialRowSearch(file: MappingDialogFile): string {
	if (file.hints?.title) {
		return file.hints.title;
	}

	return getFileName(file.path);
}

function getEntityTypeForContentType(
	contentType: string,
): LibraryResult["entityType"] {
	return contentType === "movie" ? "movie" : "book";
}

function buildTvInitialRowState(
	files: MappingDialogFile[],
	assetStateById: Record<number, ImportAssetState[]>,
	suggestionMap: Map<number, TvSuggestionRow>,
	current: Record<number, TvRowState>,
	searchTouched: Set<number>,
	selectionTouched: Set<number>,
): Record<number, TvRowState> {
	const next: Record<number, TvRowState> = {};

	for (const file of files) {
		const suggestion = suggestionMap.get(file.id);
		const currentRow = current[file.id];
		const defaultSearch =
			file.hints?.title ?? suggestion?.title ?? getFileName(file.path) ?? "";
		const defaultSelection = suggestion?.suggestedEpisodeId ?? null;

		if (!currentRow) {
			next[file.id] = {
				assets: assetStateById[file.id] ?? [],
				assetsExpanded: false,
				errorMessage: null,
				search: defaultSearch,
				selectedEpisodeId: defaultSelection,
			};
			continue;
		}

		next[file.id] = {
			assets:
				currentRow.assets.length > 0
					? currentRow.assets
					: (assetStateById[file.id] ?? []),
			assetsExpanded: currentRow.assetsExpanded,
			errorMessage: currentRow.errorMessage ?? null,
			search: searchTouched.has(file.id)
				? currentRow.search
				: currentRow.search.length > 0
					? currentRow.search
					: defaultSearch,
			selectedEpisodeId: selectionTouched.has(file.id)
				? currentRow.selectedEpisodeId
				: (currentRow.selectedEpisodeId ?? defaultSelection),
		};
	}

	return next;
}

function formatEpisodeOption(option: LibraryResult): string {
	return option.subtitle
		? `${option.title} · ${option.subtitle}`
		: option.title;
}

function formatLibraryOption(option: LibraryResult): string {
	return option.subtitle
		? `${option.title} · ${option.subtitle}`
		: option.title;
}

function normalizeComparisonValue(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, " ");
}

function pickSuggestedLibraryOption(
	file: MappingDialogFile,
	rowState: NonTvRowState,
	options: LibraryResult[],
): LibraryResult | undefined {
	const hintedTitle = file.hints?.title;
	const normalizedHint =
		typeof hintedTitle === "string" && hintedTitle.length > 0
			? normalizeComparisonValue(hintedTitle)
			: "";
	if (normalizedHint.length > 0) {
		const hintMatch = options.find(
			(option) => normalizeComparisonValue(option.title) === normalizedHint,
		);
		if (hintMatch) {
			return hintMatch;
		}
	}

	const normalizedSearch = normalizeComparisonValue(rowState.search);
	if (normalizedSearch.length > 0) {
		const searchMatch = options.find(
			(option) => normalizeComparisonValue(option.title) === normalizedSearch,
		);
		if (searchMatch) {
			return searchMatch;
		}
	}

	return options[0];
}

function summarizeAssets(assets: ImportAssetState[]): string {
	if (assets.length === 0) {
		return "No assets";
	}

	const selectedCount = assets.filter((asset) => asset.selected).length;
	return `${selectedCount} selected / ${assets.length} total`;
}

function groupAssets(assets: ImportAssetState[]): Array<{
	assets: ImportAssetState[];
	label: string;
}> {
	const groups = new Map<string, ImportAssetState[]>();

	for (const asset of assets) {
		const label =
			asset.ownershipReason === "direct"
				? "Direct file assets"
				: asset.ownershipReason === "nested"
					? "Nested assets"
					: "Container assets";
		const current = groups.get(label) ?? [];
		current.push(asset);
		groups.set(label, current);
	}

	return Array.from(groups.entries()).map(([label, groupedAssets]) => ({
		label,
		assets: groupedAssets,
	}));
}

function RowAssets({
	assetSummary,
	assets,
	assetsExpanded,
	file,
	onAssetExpandedChange,
	onAssetSelectedChange,
	onGroupSelectedChange,
}: RowAssetsProps): JSX.Element {
	if (assets.length === 0) {
		return (
			<div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
				No related assets found
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<Button
				type="button"
				variant="ghost"
				className="h-auto w-full justify-between px-2 py-2 text-left"
				onClick={() => onAssetExpandedChange(file.id, !assetsExpanded)}
			>
				<span>Assets</span>
				<span className="text-xs text-muted-foreground">{assetSummary}</span>
			</Button>

			{assetsExpanded ? (
				<div className="space-y-3 rounded-md border p-3">
					{groupAssets(assets).map((group) => (
						<div key={group.label} className="space-y-2">
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
									{group.label}
								</p>
								<Checkbox
									aria-label={`Toggle ${group.label} for ${getFileName(file.path)}`}
									checked={group.assets.every((asset) => asset.selected)}
									onCheckedChange={(checked) =>
										onGroupSelectedChange(
											file.id,
											group.assets[0]?.ownershipReason ?? "direct",
											Boolean(checked),
										)
									}
								/>
							</div>

							<div className="space-y-2">
								{group.assets.map((asset) => (
									<div
										key={asset.sourcePath}
										className="flex items-start gap-2 rounded-sm border px-2 py-1.5"
									>
										<Checkbox
											aria-label={asset.relativeSourcePath}
											checked={asset.selected}
											onCheckedChange={(checked) =>
												onAssetSelectedChange(
													file.id,
													asset.sourcePath,
													Boolean(checked),
												)
											}
										/>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm">
												{asset.relativeSourcePath}
											</p>
											<p className="text-xs text-muted-foreground">
												{asset.kind === "directory" ? "Directory" : "File"}
											</p>
										</div>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

function TvMappingRow({
	assetSummary,
	file,
	onAssetExpandedChange,
	onAssetSelectedChange,
	onGroupSelectedChange,
	onSearchChange,
	onSelectedEpisodeIdChange,
	rowState,
	suggestion,
}: TvRowProps): JSX.Element {
	const debouncedSearch = useDebounce(rowState.search, 300);
	const searchEnabled = debouncedSearch.trim().length >= 2;

	const { data: searchResults, isLoading } = useQuery({
		queryKey: ["unmappedFiles", "search", debouncedSearch, "tv", file.id],
		queryFn: () =>
			searchLibraryFn({
				data: {
					contentType: "tv",
					query: debouncedSearch,
				},
			}),
		enabled: searchEnabled,
	});

	const selectOptions = useMemo(() => {
		const options = new Map<number, LibraryResult>();

		if (suggestion?.suggestedEpisodeId != null) {
			options.set(suggestion.suggestedEpisodeId, {
				entityType: "episode",
				id: suggestion.suggestedEpisodeId,
				subtitle: suggestion.subtitle,
				title: suggestion.title ?? file.hints?.title ?? getFileName(file.path),
			});
		}

		for (const result of searchResults?.library ?? []) {
			if (result.entityType !== "episode" || options.has(result.id)) {
				continue;
			}
			options.set(result.id, result);
		}

		if (
			rowState.selectedEpisodeId != null &&
			!options.has(rowState.selectedEpisodeId)
		) {
			options.set(rowState.selectedEpisodeId, {
				entityType: "episode",
				id: rowState.selectedEpisodeId,
				subtitle: "Selected manually",
				title: `Episode ${rowState.selectedEpisodeId}`,
			});
		}

		return Array.from(options.values());
	}, [
		file.hints?.title,
		file.path,
		rowState.selectedEpisodeId,
		searchResults?.library,
		suggestion,
	]);
	const selectHint = !searchEnabled
		? "Type at least 2 characters to search"
		: !isLoading && selectOptions.length === 0
			? "No matching episodes found"
			: null;

	const fileName = getFileName(file.path);
	const searchId = `tv-episode-search-${file.id}`;

	return (
		<div className="space-y-3 px-3 py-2.5">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium">
						{file.path || `Unmapped file ${file.id}`}
					</p>
					<p className="truncate text-xs text-muted-foreground">
						{suggestion?.subtitle || "No episode suggestion found"}
					</p>
				</div>
				<div className="shrink-0 text-xs text-muted-foreground">
					{suggestion?.suggestedEpisodeId != null
						? "Suggested"
						: "Needs selection"}
				</div>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor={searchId}>Search episodes for {fileName}</Label>
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							id={searchId}
							placeholder="Search by show title..."
							value={rowState.search}
							onChange={(event) => onSearchChange(file.id, event.target.value)}
							className="pl-9"
						/>
					</div>
				</div>

				<div className="space-y-1.5">
					<Label>Episode target for {fileName}</Label>
					<Select
						aria-label={`Episode target for ${fileName}`}
						value={
							rowState.selectedEpisodeId != null
								? String(rowState.selectedEpisodeId)
								: ""
						}
						onValueChange={(value) =>
							onSelectedEpisodeIdChange(
								file.id,
								value.length > 0 ? Number(value) : null,
							)
						}
					>
						<SelectTrigger>
							<SelectValue
								placeholder={
									searchEnabled
										? "Select an episode"
										: "Type to search episodes"
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{selectOptions.map((option) => (
								<SelectItem key={option.id} value={String(option.id)}>
									{formatEpisodeOption(option)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{selectHint ? (
						<p className="text-xs text-muted-foreground">{selectHint}</p>
					) : null}
				</div>
			</div>

			{searchEnabled && isLoading ? (
				<p className="text-xs text-muted-foreground">Searching episodes...</p>
			) : null}
			{rowState.errorMessage ? (
				<p className="text-xs text-destructive">{rowState.errorMessage}</p>
			) : null}

			<RowAssets
				assetSummary={assetSummary}
				assets={rowState.assets}
				assetsExpanded={rowState.assetsExpanded}
				file={file}
				onAssetExpandedChange={onAssetExpandedChange}
				onAssetSelectedChange={onAssetSelectedChange}
				onGroupSelectedChange={onGroupSelectedChange}
			/>
		</div>
	);
}

function NonTvMappingRow({
	assetSummary,
	contentType,
	file,
	onAssetExpandedChange,
	onAssetSelectedChange,
	onGroupSelectedChange,
	onSearchChange,
	onSelectedEntityIdChange,
	rowState,
	selectionTouched,
}: NonTvRowProps): JSX.Element {
	const debouncedSearch = useDebounce(rowState.search, 300);
	const searchEnabled = debouncedSearch.trim().length >= 2;
	const expectedEntityType = getEntityTypeForContentType(contentType);
	const searchId = `library-search-${file.id}`;
	const fileName = getFileName(file.path);

	const { data: searchResults, isLoading } = useQuery({
		queryKey: [
			"unmappedFiles",
			"search",
			debouncedSearch,
			contentType,
			file.id,
		],
		queryFn: () =>
			searchLibraryFn({
				data: {
					contentType,
					query: debouncedSearch,
				},
			}),
		enabled: searchEnabled,
	});

	const selectOptions = useMemo(() => {
		const options = new Map<number, LibraryResult>();

		for (const result of searchResults?.library ?? []) {
			if (result.entityType !== expectedEntityType || options.has(result.id)) {
				continue;
			}
			options.set(result.id, result);
		}

		if (
			rowState.selectedEntityId != null &&
			!options.has(rowState.selectedEntityId)
		) {
			options.set(rowState.selectedEntityId, {
				entityType: expectedEntityType,
				id: rowState.selectedEntityId,
				subtitle: "Selected manually",
				title: `${expectedEntityType === "movie" ? "Movie" : "Book"} ${rowState.selectedEntityId}`,
			});
		}

		return Array.from(options.values());
	}, [expectedEntityType, rowState.selectedEntityId, searchResults?.library]);

	useEffect(() => {
		const suggestedOption = pickSuggestedLibraryOption(
			file,
			rowState,
			selectOptions,
		);

		if (
			selectionTouched ||
			rowState.selectedEntityId != null ||
			suggestedOption == null
		) {
			return;
		}

		onSelectedEntityIdChange(file.id, suggestedOption.id);
	}, [
		file.id,
		file,
		onSelectedEntityIdChange,
		rowState.selectedEntityId,
		rowState,
		selectOptions,
		selectionTouched,
	]);

	const selectHint = !searchEnabled
		? "Type at least 2 characters to search"
		: !isLoading && selectOptions.length === 0
			? "No matching library entries found"
			: null;

	return (
		<div className="space-y-3 px-3 py-2.5">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium">
						{file.path || `Unmapped file ${file.id}`}
					</p>
				</div>
				<div className="shrink-0 text-xs text-muted-foreground">
					{rowState.selectedEntityId != null ? "Ready" : "Needs selection"}
				</div>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor={searchId}>Search library for {fileName}</Label>
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							id={searchId}
							placeholder="Search by title..."
							value={rowState.search}
							onChange={(event) => onSearchChange(file.id, event.target.value)}
							className="pl-9"
						/>
					</div>
				</div>

				<div className="space-y-1.5">
					<Label>Target for {fileName}</Label>
					<Select
						aria-label={`Target for ${fileName}`}
						value={
							rowState.selectedEntityId != null
								? String(rowState.selectedEntityId)
								: ""
						}
						onValueChange={(value) =>
							onSelectedEntityIdChange(
								file.id,
								value.length > 0 ? Number(value) : null,
							)
						}
					>
						<SelectTrigger>
							<SelectValue
								placeholder={
									searchEnabled
										? "Select a library entry"
										: "Type to search the library"
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{selectOptions.map((option) => (
								<SelectItem key={option.id} value={String(option.id)}>
									{formatLibraryOption(option)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{selectHint ? (
						<p className="text-xs text-muted-foreground">{selectHint}</p>
					) : null}
				</div>
			</div>

			{searchEnabled && isLoading ? (
				<p className="text-xs text-muted-foreground">Searching library...</p>
			) : null}
			{rowState.errorMessage ? (
				<p className="text-xs text-destructive">{rowState.errorMessage}</p>
			) : null}

			<RowAssets
				assetSummary={assetSummary}
				assets={rowState.assets}
				assetsExpanded={rowState.assetsExpanded}
				file={file}
				onAssetExpandedChange={onAssetExpandedChange}
				onAssetSelectedChange={onAssetSelectedChange}
				onGroupSelectedChange={onGroupSelectedChange}
			/>
		</div>
	);
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function MappingDialog(props: MappingDialogProps): JSX.Element {
	const { contentType, files, onClose } = props;
	const filesRef = useRef(files);
	const queryClient = useQueryClient();
	const upsertUserSettings = useUpsertUserSettings();
	const isTv = contentType === "tv";

	const [activeFileIds, setActiveFileIds] = useState<number[]>(() =>
		files.map((file) => file.id),
	);
	const [selectedProfileId, setSelectedProfileId] = useState<string>("");
	const [mapping, setMapping] = useState(false);
	const [moveRelatedFiles, setMoveRelatedFiles] = useState(false);
	const [deleteDeselectedRelatedFiles, setDeleteDeselectedRelatedFiles] =
		useState(false);
	const [tvRowStateById, setTvRowStateById] = useState<
		Record<number, TvRowState>
	>({});
	const [nonTvRowStateById, setNonTvRowStateById] = useState<
		Record<number, NonTvRowState>
	>(() =>
		Object.fromEntries(
			files.map((file) => [
				file.id,
				{
					assets: [],
					assetsExpanded: false,
					errorMessage: null,
					search: buildInitialRowSearch(file),
					selectedEntityId: null,
				},
			]),
		),
	);
	const previousSeedSignatureRef = useRef("");
	const previousNonTvAssetSignatureRef = useRef("");
	const searchTouchedRef = useRef(new Set<number>());
	const selectionTouchedRef = useRef(new Set<number>());
	const nonTvSelectionTouchedRef = useRef(new Set<number>());
	const importDefaultsHydrated = useRef(false);
	const initialFileSignatureRef = useRef("");
	filesRef.current = files;

	const fileSignature = files.map((file) => file.id).join(",");
	useEffect(() => {
		if (initialFileSignatureRef.current === fileSignature) {
			return;
		}

		initialFileSignatureRef.current = fileSignature;
		setActiveFileIds(files.map((file) => file.id));
	}, [fileSignature, files]);

	const visibleFiles = useMemo(
		() => files.filter((file) => activeFileIds.includes(file.id)),
		[activeFileIds, files],
	);
	filesRef.current = visibleFiles;

	const { data: userSettings, isFetched: isUserSettingsFetched } = useQuery(
		userSettingsQuery("unmapped-files"),
	);

	useEffect(() => {
		if (!isUserSettingsFetched || importDefaultsHydrated.current) {
			return;
		}

		const savedMoveRelatedFiles =
			userSettings?.addDefaults?.moveRelatedFiles ??
			userSettings?.addDefaults?.moveRelatedSidecars;
		const savedDeleteDeselected =
			userSettings?.addDefaults?.deleteDeselectedRelatedFiles;
		setMoveRelatedFiles(Boolean(savedMoveRelatedFiles ?? false));
		setDeleteDeselectedRelatedFiles(Boolean(savedDeleteDeselected ?? false));
		importDefaultsHydrated.current = true;
	}, [isUserSettingsFetched, userSettings]);

	const { data: allProfiles = [] } = useQuery(downloadProfilesListQuery());

	const filteredProfiles = useMemo(
		() => allProfiles.filter((profile) => profile.contentType === contentType),
		[allProfiles, contentType],
	);

	const effectiveProfileId = useMemo(() => {
		if (selectedProfileId) return selectedProfileId;
		if (filteredProfiles.length > 0) return String(filteredProfiles[0].id);
		return "";
	}, [filteredProfiles, selectedProfileId]);

	const { data: tvSuggestionResults } = useQuery({
		queryKey: [
			"unmappedFiles",
			"tv-suggestions",
			contentType,
			visibleFiles.map((file) => file.id).join(","),
		],
		queryFn: () =>
			suggestUnmappedTvMappingsFn({
				data: {
					rows: visibleFiles.map((file) => ({
						contentType: "tv" as const,
						fileId: file.id,
						hints: file.hints,
						path: file.path,
					})),
				},
			}),
		enabled: isTv && visibleFiles.length > 0,
	});

	const assetPreviewQuery = useQuery({
		queryKey: [
			"unmappedFiles",
			"asset-preview",
			contentType,
			visibleFiles.map((file) => file.id).join(","),
		],
		queryFn: () =>
			previewUnmappedImportAssetsFn({
				data: {
					rows: visibleFiles.map((file) => ({
						contentType:
							contentType === "ebook"
								? "book"
								: (contentType as "audiobook" | "book" | "movie" | "tv"),
						fileId: file.id,
						path: file.path,
					})),
				},
			}),
		enabled: visibleFiles.length > 0,
	});
	const assetPreviewResults = assetPreviewQuery.data;
	const isAssetPreviewPending = Boolean(
		assetPreviewQuery.isLoading || assetPreviewQuery.isFetching,
	);
	const assetPreviewById = useMemo(
		() =>
			Object.fromEntries(
				(assetPreviewResults?.rows ?? []).map((row) => [
					row.fileId,
					row.assets.map((asset) => ({
						kind: asset.kind,
						ownershipReason: asset.ownershipReason,
						relativeSourcePath: asset.relativeSourcePath,
						selected: asset.selected,
						sourcePath: asset.sourcePath,
					})),
				]),
			) as Record<number, ImportAssetState[]>,
		[assetPreviewResults],
	);
	const assetPreviewSignature = useMemo(
		() =>
			(assetPreviewResults?.rows ?? [])
				.map(
					(row) =>
						`${row.fileId}:${row.assets
							.map((asset) => `${asset.sourcePath}:${asset.selected}`)
							.join(",")}`,
				)
				.join("|"),
		[assetPreviewResults],
	);

	const tvSuggestionRows: TvSuggestionRow[] = (
		tvSuggestionResults?.rows ?? []
	).map((row) => ({
		...row,
		title:
			"title" in row && typeof row.title === "string" ? row.title : undefined,
	}));
	const tvSuggestionMap = useMemo(
		() =>
			new Map<number, TvSuggestionRow>(
				tvSuggestionRows.map((row) => [row.fileId, row]),
			),
		[tvSuggestionRows],
	);
	const tvSeedSignature = `${visibleFiles.map((file) => file.id).join(",")}::${tvSuggestionRows
		.map(
			(row) =>
				`${row.fileId}:${row.suggestedEpisodeId ?? "null"}:${row.title ?? ""}:${row.subtitle}`,
		)
		.join("|")}::${assetPreviewSignature}`;

	useEffect(() => {
		if (!isTv) {
			return;
		}

		if (previousSeedSignatureRef.current === tvSeedSignature) {
			return;
		}
		previousSeedSignatureRef.current = tvSeedSignature;

		setTvRowStateById((current) =>
			buildTvInitialRowState(
				filesRef.current,
				assetPreviewById,
				tvSuggestionMap,
				current,
				searchTouchedRef.current,
				selectionTouchedRef.current,
			),
		);
	}, [assetPreviewById, isTv, tvSeedSignature, tvSuggestionMap]);

	useEffect(() => {
		if (isTv) {
			return;
		}

		const nonTvSignature = `${visibleFiles.map((file) => file.id).join(",")}::${assetPreviewSignature}`;
		if (previousNonTvAssetSignatureRef.current === nonTvSignature) {
			return;
		}
		previousNonTvAssetSignatureRef.current = nonTvSignature;

		setNonTvRowStateById((current) =>
			Object.fromEntries(
				visibleFiles.map((file) => [
					file.id,
					current[file.id]
						? {
								...current[file.id],
								assets:
									current[file.id].assets.length > 0
										? current[file.id].assets
										: (assetPreviewById[file.id] ?? []),
							}
						: {
								assets: assetPreviewById[file.id] ?? [],
								assetsExpanded: false,
								errorMessage: null,
								search: buildInitialRowSearch(file),
								selectedEntityId: null,
							},
				]),
			),
		);
	}, [assetPreviewById, assetPreviewSignature, isTv, visibleFiles]);

	const tvRows = useMemo(
		() =>
			visibleFiles.map((file) => {
				const suggestion = tvSuggestionMap.get(file.id);
				const currentState = tvRowStateById[file.id];
				const defaultSearch =
					file.hints?.title ?? suggestion?.title ?? getFileName(file.path);
				const rowState = currentState ?? {
					assets: assetPreviewById[file.id] ?? [],
					assetsExpanded: false,
					errorMessage: null,
					search: defaultSearch,
					selectedEpisodeId: suggestion?.suggestedEpisodeId ?? null,
				};

				return {
					file,
					rowState,
					suggestion,
				};
			}),
		[assetPreviewById, tvRowStateById, tvSuggestionMap, visibleFiles],
	);

	const nonTvRows = useMemo(
		() =>
			visibleFiles.map((file) => ({
				file,
				rowState: nonTvRowStateById[file.id] ?? {
					assets: assetPreviewById[file.id] ?? [],
					assetsExpanded: false,
					errorMessage: null,
					search: buildInitialRowSearch(file),
					selectedEntityId: null,
				},
			})),
		[assetPreviewById, nonTvRowStateById, visibleFiles],
	);
	const requiresAssetPreview = moveRelatedFiles || deleteDeselectedRelatedFiles;
	const disableTvSubmit =
		mapping ||
		!effectiveProfileId ||
		tvRows.length === 0 ||
		tvRows.some((row) => row.rowState.selectedEpisodeId == null) ||
		(requiresAssetPreview && isAssetPreviewPending);
	const disableNonTvSubmit =
		mapping ||
		!effectiveProfileId ||
		nonTvRows.length === 0 ||
		nonTvRows.some((row) => row.rowState.selectedEntityId == null) ||
		(requiresAssetPreview && isAssetPreviewPending);

	const getFallbackSearchValue = (fileId: number): string => {
		const fallbackFile =
			filesRef.current.find((file) => file.id === fileId) ??
			filesRef.current[0];
		return fallbackFile ? buildInitialRowSearch(fallbackFile) : "";
	};

	const setTvAssetsExpanded = (fileId: number, assetsExpanded: boolean) => {
		setTvRowStateById((current) => ({
			...current,
			[fileId]: {
				...(current[fileId] ?? {
					assets: assetPreviewById[fileId] ?? [],
					assetsExpanded: false,
					search: getFallbackSearchValue(fileId),
					selectedEpisodeId: null,
				}),
				assetsExpanded,
			},
		}));
	};

	const setNonTvAssetsExpanded = (fileId: number, assetsExpanded: boolean) => {
		setNonTvRowStateById((current) => ({
			...current,
			[fileId]: {
				...(current[fileId] ?? {
					assets: assetPreviewById[fileId] ?? [],
					assetsExpanded: false,
					search: getFallbackSearchValue(fileId),
					selectedEntityId: null,
				}),
				assetsExpanded,
			},
		}));
	};

	const setTvAssetSelected = (
		fileId: number,
		sourcePath: string,
		selected: boolean,
	) => {
		setTvRowStateById((current) => ({
			...current,
			[fileId]: {
				...current[fileId],
				assets:
					current[fileId]?.assets.map((asset) =>
						asset.sourcePath === sourcePath ? { ...asset, selected } : asset,
					) ?? [],
			},
		}));
	};

	const setNonTvAssetSelected = (
		fileId: number,
		sourcePath: string,
		selected: boolean,
	) => {
		setNonTvRowStateById((current) => ({
			...current,
			[fileId]: {
				...current[fileId],
				assets:
					current[fileId]?.assets.map((asset) =>
						asset.sourcePath === sourcePath ? { ...asset, selected } : asset,
					) ?? [],
			},
		}));
	};

	const setTvGroupSelected = (
		fileId: number,
		ownershipReason: ImportAssetState["ownershipReason"],
		selected: boolean,
	) => {
		setTvRowStateById((current) => ({
			...current,
			[fileId]: {
				...current[fileId],
				assets:
					current[fileId]?.assets.map((asset) =>
						asset.ownershipReason === ownershipReason
							? { ...asset, selected }
							: asset,
					) ?? [],
			},
		}));
	};

	const setNonTvGroupSelected = (
		fileId: number,
		ownershipReason: ImportAssetState["ownershipReason"],
		selected: boolean,
	) => {
		setNonTvRowStateById((current) => ({
			...current,
			[fileId]: {
				...current[fileId],
				assets:
					current[fileId]?.assets.map((asset) =>
						asset.ownershipReason === ownershipReason
							? { ...asset, selected }
							: asset,
					) ?? [],
			},
		}));
	};

	const clearRowErrors = () => {
		setTvRowStateById((current) =>
			Object.fromEntries(
				Object.entries(current).map(([fileId, rowState]) => [
					Number(fileId),
					{ ...rowState, errorMessage: null },
				]),
			),
		);
		setNonTvRowStateById((current) =>
			Object.fromEntries(
				Object.entries(current).map(([fileId, rowState]) => [
					Number(fileId),
					{ ...rowState, errorMessage: null },
				]),
			),
		);
	};

	const applyRowFailures = (failures: ImportRowIssue[]) => {
		const failureMessageById = new Map(
			failures.map((failure) => [failure.unmappedFileId, failure.message]),
		);
		setTvRowStateById((current) =>
			Object.fromEntries(
				Object.entries(current).map(([fileId, rowState]) => [
					Number(fileId),
					{
						...rowState,
						errorMessage: failureMessageById.get(Number(fileId)) ?? null,
					},
				]),
			),
		);
		setNonTvRowStateById((current) =>
			Object.fromEntries(
				Object.entries(current).map(([fileId, rowState]) => [
					Number(fileId),
					{
						...rowState,
						errorMessage: failureMessageById.get(Number(fileId)) ?? null,
					},
				]),
			),
		);
	};

	const handleNonTvMap = async () => {
		const profileId = Number(effectiveProfileId);
		if (!profileId) {
			toast.error("Please select a download profile first");
			return;
		}

		if (nonTvRows.some((row) => row.rowState.selectedEntityId == null)) {
			toast.error("Please resolve all rows first");
			return;
		}
		if (requiresAssetPreview && isAssetPreviewPending) {
			toast.error("Please wait for related files to finish loading");
			return;
		}

		setMapping(true);
		clearRowErrors();
		try {
			const result = (await mapUnmappedFileFn({
				data: {
					downloadProfileId: profileId,
					deleteDeselectedRelatedFiles,
					moveRelatedFiles,
					rows: nonTvRows.map((row) => ({
						assets: row.rowState.assets.map((asset) => ({
							action: !moveRelatedFiles
								? "ignore"
								: asset.selected
									? "move"
									: deleteDeselectedRelatedFiles
										? "delete"
										: "ignore",
							kind: asset.kind,
							ownershipReason: asset.ownershipReason,
							relativeSourcePath: asset.relativeSourcePath,
							selected: asset.selected,
							sourcePath: asset.sourcePath,
						})),
						entityId: row.rowState.selectedEntityId as number,
						entityType: getEntityTypeForContentType(contentType),
						unmappedFileId: row.file.id,
					})),
				},
			})) as MapImportResult;

			queryClient.invalidateQueries({
				queryKey: queryKeys.unmappedFiles.all,
			});
			upsertUserSettings.mutate({
				addDefaults: {
					deleteDeselectedRelatedFiles,
					moveRelatedFiles,
				},
				tableId: "unmapped-files",
			});
			const failures = result.failures ?? [];
			const failedCount = result.failedCount ?? failures.length;
			if (failedCount > 0) {
				applyRowFailures(failures);
				setActiveFileIds(failures.map((failure) => failure.unmappedFileId));
				toast.error(
					`${failedCount} file${failedCount !== 1 ? "s" : ""} failed to map`,
				);
				return;
			}

			toast.success(
				`${result.mappedCount} file${result.mappedCount !== 1 ? "s" : ""} mapped`,
			);
			onClose();
		} catch {
			toast.error("Failed to map files");
		} finally {
			setMapping(false);
		}
	};

	const handleTvMap = async () => {
		const profileId = Number(effectiveProfileId);
		if (!profileId) {
			toast.error("Please select a download profile first");
			return;
		}

		if (tvRows.some((row) => row.rowState.selectedEpisodeId == null)) {
			toast.error("Please resolve all TV rows first");
			return;
		}
		if (requiresAssetPreview && isAssetPreviewPending) {
			toast.error("Please wait for related files to finish loading");
			return;
		}

		setMapping(true);
		clearRowErrors();
		try {
			const result = (await mapUnmappedFileFn({
				data: {
					downloadProfileId: profileId,
					deleteDeselectedRelatedFiles,
					moveRelatedFiles,
					rows: tvRows.map((row) => ({
						assets: row.rowState.assets.map((asset) => ({
							action: !moveRelatedFiles
								? "ignore"
								: asset.selected
									? "move"
									: deleteDeselectedRelatedFiles
										? "delete"
										: "ignore",
							kind: asset.kind,
							ownershipReason: asset.ownershipReason,
							relativeSourcePath: asset.relativeSourcePath,
							selected: asset.selected,
							sourcePath: asset.sourcePath,
						})),
						entityId: row.rowState.selectedEpisodeId as number,
						entityType: "episode" as const,
						unmappedFileId: row.file.id,
					})),
				},
			})) as MapImportResult;

			upsertUserSettings.mutate({
				addDefaults: {
					deleteDeselectedRelatedFiles,
					moveRelatedFiles,
				},
				tableId: "unmapped-files",
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.unmappedFiles.all,
			});
			const failures = result.failures ?? [];
			const failedCount = result.failedCount ?? failures.length;
			if (failedCount > 0) {
				applyRowFailures(failures);
				setActiveFileIds(failures.map((failure) => failure.unmappedFileId));
				toast.error(
					`${failedCount} file${failedCount !== 1 ? "s" : ""} failed to map`,
				);
				return;
			}
			toast.success(
				`${result.mappedCount} file${result.mappedCount !== 1 ? "s" : ""} mapped`,
			);
			onClose();
		} catch {
			toast.error("Failed to map files");
		} finally {
			setMapping(false);
		}
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle>
						Map {files.length} file{files.length !== 1 ? "s" : ""}
					</DialogTitle>
				</DialogHeader>

				<DialogBody className="space-y-4">
					<div className="space-y-1.5">
						<Label>Download Profile</Label>
						{filteredProfiles.length > 0 ? (
							<Select
								aria-label="Download Profile"
								value={effectiveProfileId}
								onValueChange={setSelectedProfileId}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a profile" />
								</SelectTrigger>
								<SelectContent>
									{filteredProfiles.map((profile) => (
										<SelectItem key={profile.id} value={String(profile.id)}>
											{profile.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<p className="text-sm text-muted-foreground">
								No {contentType} profiles available. Create one in Settings &gt;
								Profiles.
							</p>
						)}
					</div>

					<div className="space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="move-related-files">Move related files</Label>
							<Checkbox
								checked={moveRelatedFiles}
								id="move-related-files"
								onCheckedChange={(checked) =>
									setMoveRelatedFiles(Boolean(checked))
								}
							/>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="delete-deselected-related-files">
								Delete deselected related files
							</Label>
							<Checkbox
								checked={deleteDeselectedRelatedFiles}
								id="delete-deselected-related-files"
								onCheckedChange={(checked) =>
									setDeleteDeselectedRelatedFiles(Boolean(checked))
								}
							/>
						</div>
					</div>

					{isTv ? (
						<>
							<div className="min-h-[200px] max-h-[320px] overflow-y-auto rounded-md border border-border">
								<div className="divide-y divide-border">
									{tvRows.map(({ file, rowState, suggestion }) => (
										<TvMappingRow
											assetSummary={summarizeAssets(rowState.assets)}
											key={file.id}
											file={file}
											onAssetExpandedChange={setTvAssetsExpanded}
											onAssetSelectedChange={setTvAssetSelected}
											onGroupSelectedChange={setTvGroupSelected}
											onSearchChange={(fileId, searchValue) => {
												searchTouchedRef.current.add(fileId);
												setTvRowStateById((current) => ({
													...current,
													[fileId]: {
														assets:
															current[fileId]?.assets ??
															assetPreviewById[fileId] ??
															[],
														assetsExpanded:
															current[fileId]?.assetsExpanded ?? false,
														errorMessage: null,
														search: searchValue,
														selectedEpisodeId:
															current[fileId]?.selectedEpisodeId ??
															suggestion?.suggestedEpisodeId ??
															null,
													},
												}));
											}}
											onSelectedEpisodeIdChange={(
												fileId,
												selectedEpisodeId,
											) => {
												selectionTouchedRef.current.add(fileId);
												setTvRowStateById((current) => ({
													...current,
													[fileId]: {
														assets:
															current[fileId]?.assets ??
															assetPreviewById[fileId] ??
															[],
														assetsExpanded:
															current[fileId]?.assetsExpanded ?? false,
														errorMessage: null,
														search:
															current[fileId]?.search ??
															file.hints?.title ??
															suggestion?.title ??
															getFileName(file.path),
														selectedEpisodeId,
													},
												}));
											}}
											rowState={rowState}
											suggestion={suggestion}
										/>
									))}
								</div>
							</div>

							<div className="flex justify-end">
								<Button
									disabled={disableTvSubmit}
									onClick={() => {
										void handleTvMap();
									}}
								>
									{mapping ? (
										<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
									) : null}
									Map Selected Files
								</Button>
							</div>
						</>
					) : (
						<>
							<div className="min-h-[200px] max-h-[320px] overflow-y-auto rounded-md border border-border">
								<div className="divide-y divide-border">
									{nonTvRows.map(({ file, rowState }) => (
										<NonTvMappingRow
											assetSummary={summarizeAssets(rowState.assets)}
											key={file.id}
											contentType={contentType}
											file={file}
											onAssetExpandedChange={setNonTvAssetsExpanded}
											onAssetSelectedChange={setNonTvAssetSelected}
											onGroupSelectedChange={setNonTvGroupSelected}
											onSearchChange={(fileId, searchValue) => {
												setNonTvRowStateById((current) => ({
													...current,
													[fileId]: {
														assets:
															current[fileId]?.assets ??
															assetPreviewById[fileId] ??
															[],
														assetsExpanded:
															current[fileId]?.assetsExpanded ?? false,
														errorMessage: null,
														search: searchValue,
														selectedEntityId:
															current[fileId]?.selectedEntityId ?? null,
													},
												}));
											}}
											onSelectedEntityIdChange={(fileId, selectedEntityId) => {
												nonTvSelectionTouchedRef.current.add(fileId);
												setNonTvRowStateById((current) => ({
													...current,
													[fileId]: {
														assets:
															current[fileId]?.assets ??
															assetPreviewById[fileId] ??
															[],
														assetsExpanded:
															current[fileId]?.assetsExpanded ?? false,
														errorMessage: null,
														search:
															current[fileId]?.search ??
															buildInitialRowSearch(file),
														selectedEntityId,
													},
												}));
											}}
											rowState={rowState}
											selectionTouched={nonTvSelectionTouchedRef.current.has(
												file.id,
											)}
										/>
									))}
								</div>
							</div>

							<div className="flex justify-end">
								<Button
									disabled={disableNonTvSubmit}
									onClick={() => {
										void handleNonTvMap();
									}}
								>
									{mapping ? (
										<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
									) : null}
									Map Selected Files
								</Button>
							</div>
						</>
					)}
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
