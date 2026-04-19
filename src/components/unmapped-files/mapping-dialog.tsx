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
	searchLibraryFn,
	suggestUnmappedTvMappingsFn,
} from "src/server/unmapped-files";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MappingDialogFile = {
	id: number;
	path: string;
	hints: UnmappedFileHints | null;
};

type MappingDialogProps =
	| {
			contentType: string;
			files: MappingDialogFile[];
			onClose: () => void;
	  }
	| {
			contentType: string;
			fileIds: number[];
			hints: UnmappedFileHints | null;
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
	search: string;
	selectedEpisodeId: number | null;
};

type TvRowProps = {
	file: MappingDialogFile;
	onSearchChange: (fileId: number, search: string) => void;
	onSelectedEpisodeIdChange: (
		fileId: number,
		selectedEpisodeId: number | null,
	) => void;
	rowState: TvRowState;
	suggestion: TvSuggestionRow | undefined;
};

function getFileName(pathname: string): string {
	const fileName = pathname.split("/").pop();
	return fileName && fileName.length > 0 ? fileName : pathname;
}

function buildInitialSearch(files: MappingDialogFile[]): string {
	const hintedFile = files.find((file) => file.hints != null);
	if (!hintedFile?.hints) {
		return "";
	}

	const parts: string[] = [];
	if (hintedFile.hints.title) parts.push(hintedFile.hints.title);
	if (hintedFile.hints.author) parts.push(hintedFile.hints.author);
	return parts.join(" ");
}

function normalizeFiles(props: MappingDialogProps): MappingDialogFile[] {
	if ("files" in props) {
		return props.files;
	}

	return props.fileIds.map((id) => ({
		id,
		hints: props.hints,
		path: "",
	}));
}

function buildTvInitialRowState(
	files: MappingDialogFile[],
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
				search: defaultSearch,
				selectedEpisodeId: defaultSelection,
			};
			continue;
		}

		next[file.id] = {
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

function TvMappingRow({
	file,
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
							<SelectItem value="">
								{searchEnabled
									? "Select an episode"
									: "Type at least 2 characters to search"}
							</SelectItem>
							{selectOptions.map((option) => (
								<SelectItem key={option.id} value={String(option.id)}>
									{formatEpisodeOption(option)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{searchEnabled && isLoading ? (
				<p className="text-xs text-muted-foreground">Searching episodes...</p>
			) : null}
		</div>
	);
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function MappingDialog(props: MappingDialogProps): JSX.Element {
	const { contentType, onClose } = props;
	const files = normalizeFiles(props);
	const filesRef = useRef(files);
	const queryClient = useQueryClient();
	const upsertUserSettings = useUpsertUserSettings();
	const isTv = contentType === "tv";

	const initialSearch = useMemo(() => buildInitialSearch(files), [files]);
	const [search, setSearch] = useState(initialSearch);
	const [selectedProfileId, setSelectedProfileId] = useState<string>("");
	const [mapping, setMapping] = useState(false);
	const [moveRelatedSidecars, setMoveRelatedSidecars] = useState(false);
	const [tvRowStateById, setTvRowStateById] = useState<
		Record<number, TvRowState>
	>({});
	const previousSeedSignatureRef = useRef("");
	const searchTouchedRef = useRef(new Set<number>());
	const selectionTouchedRef = useRef(new Set<number>());
	const sidecarDefaultHydrated = useRef(false);
	filesRef.current = files;

	const debouncedSearch = useDebounce(search, 300);

	const { data: userSettings, isFetched: isUserSettingsFetched } = useQuery(
		userSettingsQuery("unmapped-files"),
	);

	useEffect(() => {
		if (!isUserSettingsFetched || sidecarDefaultHydrated.current) {
			return;
		}

		const savedMoveRelatedSidecars =
			userSettings?.addDefaults?.moveRelatedSidecars;
		setMoveRelatedSidecars(Boolean(savedMoveRelatedSidecars ?? false));
		sidecarDefaultHydrated.current = true;
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

	const { data: searchResults, isLoading: isSearching } = useQuery({
		queryKey: ["unmappedFiles", "search", debouncedSearch, contentType],
		queryFn: () =>
			searchLibraryFn({ data: { query: debouncedSearch, contentType } }),
		enabled: !isTv && debouncedSearch.length >= 2,
	});

	const { data: tvSuggestionResults } = useQuery({
		queryKey: [
			"unmappedFiles",
			"tv-suggestions",
			contentType,
			files.map((file) => file.id).join(","),
		],
		queryFn: () =>
			suggestUnmappedTvMappingsFn({
				data: {
					rows: files.map((file) => ({
						contentType: "tv" as const,
						fileId: file.id,
						hints: file.hints,
						path: file.path,
					})),
				},
			}),
		enabled: isTv && files.length > 0,
	});

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
	const tvSeedSignature = `${files.map((file) => file.id).join(",")}::${tvSuggestionRows
		.map(
			(row) =>
				`${row.fileId}:${row.suggestedEpisodeId ?? "null"}:${row.title ?? ""}:${row.subtitle}`,
		)
		.join("|")}`;

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
				tvSuggestionMap,
				current,
				searchTouchedRef.current,
				selectionTouchedRef.current,
			),
		);
	}, [isTv, tvSeedSignature, tvSuggestionMap]);

	const tvRows = useMemo(
		() =>
			files.map((file) => {
				const suggestion = tvSuggestionMap.get(file.id);
				const currentState = tvRowStateById[file.id];
				const defaultSearch =
					file.hints?.title ?? suggestion?.title ?? getFileName(file.path);
				const rowState = currentState ?? {
					search: defaultSearch,
					selectedEpisodeId: suggestion?.suggestedEpisodeId ?? null,
				};

				return {
					file,
					rowState,
					suggestion,
				};
			}),
		[files, tvRowStateById, tvSuggestionMap],
	);

	const handleMovieOrBookMap = async (result: LibraryResult) => {
		const profileId = Number(effectiveProfileId);
		if (!profileId) {
			toast.error("Please select a download profile first");
			return;
		}

		setMapping(true);
		try {
			await mapUnmappedFileFn({
				data: {
					downloadProfileId: profileId,
					entityId: result.id,
					entityType: result.entityType,
					unmappedFileIds: files.map((file) => file.id),
				},
			});

			queryClient.invalidateQueries({
				queryKey: queryKeys.unmappedFiles.all,
			});

			toast.success(
				`${files.length} file${files.length !== 1 ? "s" : ""} mapped to "${result.title}"`,
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

		setMapping(true);
		try {
			await mapUnmappedFileFn({
				data: {
					downloadProfileId: profileId,
					entityType: "episode",
					moveRelatedSidecars,
					tvMappings: tvRows.map((row) => ({
						episodeId: row.rowState.selectedEpisodeId as number,
						unmappedFileId: row.file.id,
					})),
				},
			});

			upsertUserSettings.mutate({
				addDefaults: { moveRelatedSidecars },
				tableId: "unmapped-files",
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.unmappedFiles.all,
			});
			toast.success(
				`${files.length} file${files.length !== 1 ? "s" : ""} mapped`,
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

					{isTv ? (
						<>
							<div className="space-y-1.5">
								<Label htmlFor="move-related-sidecars">
									Move related sidecar files
								</Label>
								<Checkbox
									checked={moveRelatedSidecars}
									id="move-related-sidecars"
									onCheckedChange={(checked) =>
										setMoveRelatedSidecars(Boolean(checked))
									}
								/>
							</div>

							<div className="min-h-[200px] max-h-[320px] overflow-y-auto rounded-md border border-border">
								<div className="divide-y divide-border">
									{tvRows.map(({ file, rowState, suggestion }) => (
										<TvMappingRow
											key={file.id}
											file={file}
											onSearchChange={(fileId, searchValue) => {
												searchTouchedRef.current.add(fileId);
												setTvRowStateById((current) => ({
													...current,
													[fileId]: {
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
									disabled={
										mapping ||
										!effectiveProfileId ||
										tvRows.length === 0 ||
										tvRows.some((row) => row.rowState.selectedEpisodeId == null)
									}
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
							<div className="space-y-1.5">
								<Label htmlFor="unmapped-file-library-search">
									Search Library
								</Label>
								<div className="relative">
									<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									<Input
										id="unmapped-file-library-search"
										placeholder="Search by title..."
										value={search}
										onChange={(event) => setSearch(event.target.value)}
										className="pl-9"
									/>
								</div>
							</div>

							<div className="min-h-[200px] max-h-[320px] overflow-y-auto rounded-md border border-border">
								{debouncedSearch.length < 2 ? (
									<div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
										Type at least 2 characters to search
									</div>
								) : isSearching ? (
									<div className="flex h-[200px] items-center justify-center">
										<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
									</div>
								) : searchResults?.library.length === 0 ? (
									<div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
										No results found in your library
									</div>
								) : (
									<div className="divide-y divide-border">
										{searchResults?.library.map((result) => (
											<div
												key={`${result.entityType}-${result.id}`}
												className="flex items-center justify-between gap-3 px-3 py-2.5"
											>
												<div className="min-w-0 flex-1">
													<p className="truncate text-sm font-medium">
														{result.title}
													</p>
													{result.subtitle && (
														<p className="truncate text-xs text-muted-foreground">
															{result.subtitle}
														</p>
													)}
												</div>
												<Button
													disabled={mapping || !effectiveProfileId}
													onClick={() => {
														void handleMovieOrBookMap(result);
													}}
													size="sm"
													variant="outline"
												>
													{mapping ? (
														<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
													) : null}
													Map Here
												</Button>
											</div>
										))}
									</div>
								)}
							</div>
						</>
					)}
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
