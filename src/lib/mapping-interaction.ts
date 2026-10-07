import type { UnmappedFileHints } from "src/db/schema/unmapped-files";

export type MappingFile = {
	id: number;
	path: string;
	hints: UnmappedFileHints | null;
};
export type MappingAsset = {
	kind: "directory" | "file";
	ownershipReason: "container" | "direct" | "nested" | "token";
	relativeSourcePath: string;
	selected: boolean;
	sourcePath: string;
};
export type MappingSuggestion = {
	fileId: number;
	subtitle: string;
	suggestedEpisodeId: number | null;
	title?: string;
};
export type MappingLibraryResult = {
	id: number;
	title: string;
	subtitle: string;
	entityType: "book" | "movie" | "episode";
};
export type MappingIssue = {
	entityType: "book" | "movie" | "episode";
	message: string;
	sourcePath: string;
	unmappedFileId: number;
};
export type MappingResult = {
	failedCount?: number;
	failures?: MappingIssue[];
	mappedCount: number;
	success: boolean;
	warnings?: MappingIssue[];
};
export type MappingRow = {
	file: MappingFile;
	suggestion?: MappingSuggestion;
	rowState: {
		assets: readonly MappingAsset[];
		assetsExpanded: boolean;
		errorMessage: string | null;
		search: string;
		selectedEntityId: number | null;
	};
};
type InternalRow = MappingRow & {
	searchSeeded: boolean;
	searchTouched: boolean;
	selectionTouched: boolean;
};
export type MappingAction =
	| { type: "files"; files: MappingFile[]; contentType?: string }
	| { type: "suggestions"; suggestions: MappingSuggestion[] }
	| { type: "assets"; rows: Array<{ fileId: number; assets: MappingAsset[] }> }
	| { type: "search"; fileId: number; value: string }
	| { type: "target"; fileId: number; value: number | null }
	| { type: "results"; fileId: number; results: MappingLibraryResult[] }
	| { type: "expanded"; fileId: number; value: boolean }
	| { type: "asset"; fileId: number; sourcePath: string; value: boolean }
	| {
			type: "group";
			fileId: number;
			ownershipReason: MappingAsset["ownershipReason"];
			value: boolean;
	  }
	| { type: "started" }
	| { type: "completed"; result: MappingResult }
	| { type: "failed" };
export type MappingOptions = {
	profileId: string;
	moveRelatedFiles: boolean;
	deleteDeselectedRelatedFiles: boolean;
	previewPending: boolean;
};

function fileName(path: string): string {
	return path.split("/").pop() || path;
}
function normalize(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, " ");
}
function initialRow(file: MappingFile, contentType: string): InternalRow {
	return {
		file,
		searchSeeded: false,
		searchTouched: false,
		selectionTouched: false,
		rowState: {
			assets: [],
			assetsExpanded: false,
			errorMessage: null,
			search:
				contentType === "tv"
					? (file.hints?.title ?? fileName(file.path))
					: file.hints?.title || fileName(file.path),
			selectedEntityId: null,
		},
	};
}

/** Owns Mapping intent, asynchronous defaults, readiness and retry state. */
export class MappingInteraction {
	private constructor(
		private readonly contentType: string,
		private readonly sourceFiles: MappingFile[],
		private readonly state: InternalRow[],
		readonly mapping: boolean,
	) {}
	static start(contentType: string, files: MappingFile[]): MappingInteraction {
		return new MappingInteraction(
			contentType,
			files,
			files.map((file) => initialRow(file, contentType)),
			false,
		);
	}
	get rows(): readonly MappingRow[] {
		return this.state;
	}
	private next(
		rows: InternalRow[],
		mapping = this.mapping,
		files = this.sourceFiles,
	): MappingInteraction {
		if (
			mapping === this.mapping &&
			files === this.sourceFiles &&
			rows.every((row, index) => row === this.state[index]) &&
			rows.length === this.state.length
		)
			return this;
		return new MappingInteraction(this.contentType, files, rows, mapping);
	}
	transition(action: MappingAction): MappingInteraction {
		if (action.type === "files") {
			if (
				action.contentType !== undefined &&
				action.contentType !== this.contentType
			)
				return MappingInteraction.start(action.contentType, action.files);
			if (
				action.files.length === this.sourceFiles.length &&
				action.files.every((file, index) => file === this.sourceFiles[index])
			)
				return this;
			const sameIds =
				action.files.map((file) => file.id).join(",") ===
				this.sourceFiles.map((file) => file.id).join(",");
			const current = new Map(this.state.map((row) => [row.file.id, row]));
			return this.next(
				action.files
					.filter((file) => !sameIds || current.has(file.id))
					.map((file) => {
						const row = current.get(file.id);
						return row ? { ...row, file } : initialRow(file, this.contentType);
					}),
				this.mapping,
				action.files,
			);
		}
		if (action.type === "started")
			return this.next(
				this.state.map((row) => ({
					...row,
					rowState: { ...row.rowState, errorMessage: null },
				})),
				true,
			);
		if (action.type === "failed") return this.next(this.state, false);
		if (action.type === "completed") {
			const failures = action.result.failures ?? [];
			if ((action.result.failedCount ?? failures.length) === 0)
				return this.next(this.state, false);
			const byId = new Map(
				failures.map((failure) => [failure.unmappedFileId, failure.message]),
			);
			return this.next(
				this.state
					.filter((row) => byId.has(row.file.id))
					.map((row) => ({
						...row,
						rowState: {
							...row.rowState,
							errorMessage: byId.get(row.file.id) ?? null,
						},
					})),
				false,
			);
		}
		return this.next(this.state.map((row) => this.updateRow(row, action)));
	}
	private updateRow(
		row: InternalRow,
		action: Exclude<
			MappingAction,
			{ type: "files" | "started" | "failed" | "completed" }
		>,
	): InternalRow {
		const state = row.rowState;
		if (action.type === "suggestions") {
			if (this.contentType !== "tv") return row;
			const suggestion = action.suggestions.find(
				(item) => item.fileId === row.file.id,
			);
			const selectedEntityId = row.selectionTouched
				? state.selectedEntityId
				: (state.selectedEntityId ?? suggestion?.suggestedEpisodeId ?? null);
			const search =
				row.searchTouched || (row.searchSeeded && state.search.length > 0)
					? state.search
					: (row.file.hints?.title ??
						suggestion?.title ??
						fileName(row.file.path));
			if (
				row.searchSeeded &&
				row.suggestion === suggestion &&
				selectedEntityId === state.selectedEntityId &&
				search === state.search
			)
				return row;
			return {
				...row,
				searchSeeded: true,
				suggestion,
				rowState: { ...state, search, selectedEntityId },
			};
		}
		if (action.type === "assets") {
			const assets =
				action.rows.find((item) => item.fileId === row.file.id)?.assets ?? [];
			return state.assets.length > 0 || assets.length === 0
				? row
				: { ...row, rowState: { ...state, assets } };
		}
		if (action.fileId !== row.file.id) return row;
		switch (action.type) {
			case "search":
				return {
					...row,
					searchTouched: true,
					rowState: { ...state, search: action.value, errorMessage: null },
				};
			case "target":
				return {
					...row,
					selectionTouched: true,
					rowState: {
						...state,
						selectedEntityId: action.value,
						errorMessage: null,
					},
				};
			case "results": {
				if (
					this.contentType === "tv" ||
					row.selectionTouched ||
					state.selectedEntityId !== null
				)
					return row;
				const expectedType = this.contentType === "movie" ? "movie" : "book";
				const options = action.results.filter(
					(option) => option.entityType === expectedType,
				);
				const hinted = normalize(row.file.hints?.title ?? "");
				const searched = normalize(state.search);
				const suggested =
					(hinted
						? options.find((option) => normalize(option.title) === hinted)
						: undefined) ??
					(searched
						? options.find((option) => normalize(option.title) === searched)
						: undefined) ??
					options[0];
				return suggested
					? { ...row, rowState: { ...state, selectedEntityId: suggested.id } }
					: row;
			}
			case "expanded":
				return { ...row, rowState: { ...state, assetsExpanded: action.value } };
			case "asset":
				return {
					...row,
					rowState: {
						...state,
						assets: state.assets.map((asset) =>
							asset.sourcePath === action.sourcePath
								? { ...asset, selected: action.value }
								: asset,
						),
					},
				};
			case "group":
				return {
					...row,
					rowState: {
						...state,
						assets: state.assets.map((asset) =>
							asset.ownershipReason === action.ownershipReason
								? { ...asset, selected: action.value }
								: asset,
						),
					},
				};
		}
	}
	submission(options: MappingOptions) {
		const downloadProfileId = Number(options.profileId);
		const error = this.mapping
			? "Mapping is already in progress"
			: !downloadProfileId
				? "Please select a download profile first"
				: this.state.some((row) => row.rowState.selectedEntityId === null)
					? this.contentType === "tv"
						? "Please resolve all TV rows first"
						: "Please resolve all rows first"
					: (options.moveRelatedFiles ||
								options.deleteDeselectedRelatedFiles) &&
							options.previewPending
						? "Please wait for related files to finish loading"
						: this.state.length === 0
							? "No files to map"
							: null;
		if (error) return { ok: false as const, message: error };
		return {
			ok: true as const,
			data: {
				downloadProfileId,
				moveRelatedFiles: options.moveRelatedFiles,
				deleteDeselectedRelatedFiles: options.deleteDeselectedRelatedFiles,
				rows: this.state.map((row) => ({
					unmappedFileId: row.file.id,
					entityId: row.rowState.selectedEntityId as number,
					entityType:
						this.contentType === "tv"
							? ("episode" as const)
							: this.contentType === "movie"
								? ("movie" as const)
								: ("book" as const),
					assets: row.rowState.assets.map((asset) => ({
						...asset,
						action: !options.moveRelatedFiles
							? ("ignore" as const)
							: asset.selected
								? ("move" as const)
								: options.deleteDeselectedRelatedFiles
									? ("delete" as const)
									: ("ignore" as const),
					})),
				})),
			},
		};
	}
}
