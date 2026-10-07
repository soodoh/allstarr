import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import type { JSX } from "react";
import { useEffect, useMemo } from "react";
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
import { useDebounce } from "src/hooks/use-debounce";
import { useMappingInteraction } from "src/hooks/use-mapping-interaction";
import type {
	MappingAction,
	MappingAsset,
	MappingFile,
	MappingLibraryResult,
	MappingRow,
	MappingSuggestion,
} from "src/lib/mapping-interaction";
import { searchLibraryFn } from "src/server/unmapped-files";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MappingDialogFile = MappingFile;
type MappingDialogProps = {
	contentType: string;
	files: MappingFile[];
	onClose: () => void;
};
type LibraryResult = MappingLibraryResult;
type ImportAssetState = MappingAsset;
type RowAssetsProps = {
	assetSummary: string;
	assets: readonly MappingAsset[];
	assetsExpanded: boolean;
	file: MappingFile;
	onAction: (action: MappingAction) => void;
};
type TvRowProps = {
	assetSummary: string;
	file: MappingFile;
	rowState: MappingRow["rowState"];
	suggestion: MappingSuggestion | undefined;
	onAction: (action: MappingAction) => void;
};
type NonTvRowProps = Omit<TvRowProps, "suggestion"> & { contentType: string };

function getFileName(pathname: string): string {
	const fileName = pathname.split("/").pop();
	return fileName && fileName.length > 0 ? fileName : pathname;
}

function getEntityTypeForContentType(
	contentType: string,
): LibraryResult["entityType"] {
	return contentType === "movie" ? "movie" : "book";
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

function summarizeAssets(assets: readonly ImportAssetState[]): string {
	if (assets.length === 0) {
		return "No assets";
	}

	const selectedCount = assets.filter((asset) => asset.selected).length;
	return `${selectedCount} selected / ${assets.length} total`;
}

function groupAssets(assets: readonly ImportAssetState[]): Array<{
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
	onAction,
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
				onClick={() =>
					onAction({
						type: "expanded",
						fileId: file.id,
						value: !assetsExpanded,
					})
				}
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
										onAction({
											type: "group",
											fileId: file.id,
											ownershipReason:
												group.assets[0]?.ownershipReason ?? "direct",
											value: Boolean(checked),
										})
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
												onAction({
													type: "asset",
													fileId: file.id,
													sourcePath: asset.sourcePath,
													value: Boolean(checked),
												})
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
	rowState,
	suggestion,
	onAction,
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
			rowState.selectedEntityId != null &&
			!options.has(rowState.selectedEntityId)
		) {
			options.set(rowState.selectedEntityId, {
				entityType: "episode",
				id: rowState.selectedEntityId,
				subtitle: "Selected manually",
				title: `Episode ${rowState.selectedEntityId}`,
			});
		}

		return Array.from(options.values());
	}, [
		file.hints?.title,
		file.path,
		rowState.selectedEntityId,
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
							onChange={(event) =>
								onAction({
									type: "search",
									fileId: file.id,
									value: event.target.value,
								})
							}
							className="pl-9"
						/>
					</div>
				</div>

				<div className="space-y-1.5">
					<Label>Episode target for {fileName}</Label>
					<Select
						aria-label={`Episode target for ${fileName}`}
						value={
							rowState.selectedEntityId != null
								? String(rowState.selectedEntityId)
								: ""
						}
						onValueChange={(value) =>
							onAction({
								type: "target",
								fileId: file.id,
								value: value.length > 0 ? Number(value) : null,
							})
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
				onAction={onAction}
			/>
		</div>
	);
}

function NonTvMappingRow({
	assetSummary,
	contentType,
	file,
	rowState,
	onAction,
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
		onAction({ type: "results", fileId: file.id, results: selectOptions });
	}, [file.id, onAction, selectOptions]);

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
							onChange={(event) =>
								onAction({
									type: "search",
									fileId: file.id,
									value: event.target.value,
								})
							}
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
							onAction({
								type: "target",
								fileId: file.id,
								value: value.length > 0 ? Number(value) : null,
							})
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
				onAction={onAction}
			/>
		</div>
	);
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function MappingDialog(props: MappingDialogProps): JSX.Element {
	const { contentType, files, onClose } = props;
	const {
		isTv,
		rows,
		mapping,
		filteredProfiles,
		effectiveProfileId,
		setSelectedProfileId,
		moveRelatedFiles,
		setMoveRelatedFiles,
		deleteDeselectedRelatedFiles,
		setDeleteDeselectedRelatedFiles,
		disableSubmit,
		dispatch,
		submit,
	} = useMappingInteraction(contentType, files, onClose);

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
									{rows.map(({ file, rowState, suggestion }) => (
										<TvMappingRow
											assetSummary={summarizeAssets(rowState.assets)}
											key={file.id}
											file={file}
											onAction={dispatch}
											rowState={rowState}
											suggestion={suggestion}
										/>
									))}
								</div>
							</div>

							<div className="flex justify-end">
								<Button
									disabled={disableSubmit}
									onClick={() => {
										void submit();
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
									{rows.map(({ file, rowState }) => (
										<NonTvMappingRow
											assetSummary={summarizeAssets(rowState.assets)}
											key={file.id}
											contentType={contentType}
											file={file}
											onAction={dispatch}
											rowState={rowState}
										/>
									))}
								</div>
							</div>

							<div className="flex justify-end">
								<Button
									disabled={disableSubmit}
									onClick={() => {
										void submit();
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
