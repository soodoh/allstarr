import * as path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "src/db";
import {
	bookFiles,
	books,
	booksAuthors,
	downloadProfiles,
	episodeFiles,
	episodes,
	history,
	movieFiles,
	movies,
	seasons,
	shows,
	unmappedFiles,
} from "src/db/schema";
import { z } from "zod";
import { buildBookAuthorFolderName, buildBookFolderName } from "./book-paths";
import {
	buildManagedEpisodeDestination,
	buildManagedMovieDestination,
} from "./file-import";
import {
	assignImportAssets,
	buildAssetOperations,
	type ImportAssetRow,
	type ImportAssetRowInput,
	type ImportAssetSelection,
	pruneEmptyDirectories,
} from "./import-assets";
import { executeMappingWithRollback } from "./unmapped-file-mapping-executor";

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4b", ".flac"]);
const EBOOK_EXTENSIONS = new Set([".azw", ".azw3", ".epub", ".mobi", ".pdf"]);
const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".ts"]);
const TV_SIDECAR_EXTENSIONS = new Set([
	".ass",
	".idx",
	".nfo",
	".srt",
	".ssa",
	".sub",
	".vtt",
	".xml",
]);
const MOVIE_SIDECAR_EXTENSIONS = TV_SIDECAR_EXTENSIONS;
const TV_EPISODE_PATTERN = /S(\d{1,2})E(\d{1,3})/i;

function naturalSort(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function stripFileExtension(filename: string): string {
	const dotIndex = filename.lastIndexOf(".");
	return dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
}

function escapeRegExp(value: string): string {
	return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTvEpisodeToken(filePath: string): string | null {
	const match = path.basename(filePath).match(TV_EPISODE_PATTERN);
	return match ? match[0].toUpperCase() : null;
}

function isWithinSourceDirectoryTree(
	sourcePath: string,
	candidatePath: string,
): boolean {
	const sourceDir = path.dirname(sourcePath);
	return (
		candidatePath.startsWith(`${sourceDir}/`) || candidatePath === sourcePath
	);
}

function stripSourceStemPrefix(
	candidatePart: string,
	sourcePart: string,
): string {
	if (!candidatePart || !sourcePart) {
		return candidatePart;
	}

	return candidatePart.replace(
		new RegExp(`^${escapeRegExp(sourcePart)}[ ._-]*`, "i"),
		"",
	);
}

function normalizeSuffixParts(value: string): string[] {
	return value
		.split(/[ ._-]+/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function getRelativeSidecarDirectoryParts(
	sourcePath: string,
	sidecarPath: string,
): string[] {
	const sourceDir = path.dirname(sourcePath);
	const sidecarDir = path.dirname(sidecarPath);
	if (sidecarDir === sourceDir || !sidecarDir.startsWith(`${sourceDir}/`)) {
		return [];
	}

	return sidecarDir
		.slice(sourceDir.length + 1)
		.split("/")
		.flatMap((segment) => normalizeSuffixParts(segment));
}

function getTvSidecarSuffixParts(
	sourcePath: string,
	sidecarPath: string,
): string[] {
	const sourceStem = stripFileExtension(path.basename(sourcePath));
	const sidecarStem = stripFileExtension(path.basename(sidecarPath));

	if (sidecarStem === sourceStem) {
		return [];
	}

	const episodeToken = getTvEpisodeToken(sourcePath);
	if (!episodeToken) {
		return [];
	}

	const sourceMatch = sourceStem.match(TV_EPISODE_PATTERN);
	const sidecarMatch = sidecarStem.match(TV_EPISODE_PATTERN);
	if (!sourceMatch || !sidecarMatch) {
		return [];
	}

	const sourcePrefix = sourceStem
		.slice(0, sourceMatch.index)
		.replace(/[ ._-]+$/g, "");
	const sourceSuffix = sourceStem
		.slice((sourceMatch.index ?? 0) + sourceMatch[0].length)
		.replace(/^[ ._-]+/g, "");
	const sidecarPrefix = stripSourceStemPrefix(
		sidecarStem.slice(0, sidecarMatch.index).replace(/[ ._-]+$/g, ""),
		sourcePrefix,
	);
	const sidecarSuffix = stripSourceStemPrefix(
		sidecarStem
			.slice((sidecarMatch.index ?? 0) + sidecarMatch[0].length)
			.replace(/^[ ._-]+/g, ""),
		sourceSuffix,
	);

	return [sidecarPrefix, sidecarSuffix].flatMap((part) =>
		normalizeSuffixParts(part),
	);
}

function isRelatedTvSidecar(
	sourcePath: string,
	candidatePath: string,
): boolean {
	if (!isWithinSourceDirectoryTree(sourcePath, candidatePath)) {
		return false;
	}

	const candidateExt = path.extname(candidatePath).toLowerCase();
	if (!TV_SIDECAR_EXTENSIONS.has(candidateExt)) {
		return false;
	}

	const sourceStem = stripFileExtension(path.basename(sourcePath));
	const candidateStem = stripFileExtension(path.basename(candidatePath));
	if (candidateStem === sourceStem) {
		return true;
	}

	const sourceToken = getTvEpisodeToken(sourcePath);
	const candidateToken = getTvEpisodeToken(candidatePath);
	return sourceToken != null && candidateToken === sourceToken;
}

function buildManagedTvEpisodePath({
	rootFolderPath,
	showTitle,
	showYear,
	seasonNumber,
	episodeNumber,
	sourcePath,
	useSeasonFolder,
}: {
	episodeNumber: number;
	rootFolderPath: string;
	seasonNumber: number;
	showTitle: string;
	showYear: number | null;
	sourcePath: string;
	useSeasonFolder: boolean;
}): string {
	const managedFilename = `${showTitle} S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}${path.extname(sourcePath)}`;
	return buildManagedEpisodeDestination({
		rootFolderPath,
		showTitle,
		showYear,
		seasonNumber,
		useSeasonFolder,
		sourcePath: path.join(path.dirname(sourcePath), managedFilename),
	});
}

function buildManagedTvSidecarPath(
	managedEpisodePath: string,
	sourcePath: string,
	sidecarPath: string,
	usedDestPaths: Set<string>,
	preferRelativeDirParts = false,
): string {
	const baseName = stripFileExtension(path.basename(managedEpisodePath));
	const ext = path.extname(sidecarPath);
	const suffixParts = getTvSidecarSuffixParts(sourcePath, sidecarPath);
	const relativeDirParts = getRelativeSidecarDirectoryParts(
		sourcePath,
		sidecarPath,
	);
	const candidatePartSets = [
		preferRelativeDirParts && relativeDirParts.length > 0
			? [...relativeDirParts, ...suffixParts]
			: suffixParts,
		relativeDirParts.length > 0 ? [...relativeDirParts, ...suffixParts] : null,
		preferRelativeDirParts ? suffixParts : null,
	].filter((parts): parts is string[] => parts != null);

	for (const parts of candidatePartSets) {
		const candidatePath = path.join(
			path.dirname(managedEpisodePath),
			`${baseName}${parts.length > 0 ? `.${parts.join(".")}` : ""}${ext}`,
		);
		if (!usedDestPaths.has(candidatePath)) {
			return candidatePath;
		}
	}

	let counter = 2;
	while (true) {
		const candidatePath = path.join(
			path.dirname(managedEpisodePath),
			`${baseName}.${[...relativeDirParts, ...suffixParts, String(counter)].filter(Boolean).join(".")}${ext}`,
		);
		if (!usedDestPaths.has(candidatePath)) {
			return candidatePath;
		}
		counter++;
	}
}

function buildTvSidecarCollisionKey(
	managedEpisodePath: string,
	sourcePath: string,
	sidecarPath: string,
): string {
	const suffixParts = getTvSidecarSuffixParts(sourcePath, sidecarPath);
	return path.join(
		path.dirname(managedEpisodePath),
		`${stripFileExtension(path.basename(managedEpisodePath))}${suffixParts.length > 0 ? `.${suffixParts.join(".")}` : ""}${path.extname(sidecarPath)}`,
	);
}

function getMovieSidecarSuffixParts(
	sourcePath: string,
	sidecarPath: string,
): string[] {
	const sourceStem = stripFileExtension(path.basename(sourcePath));
	const sidecarStem = stripFileExtension(path.basename(sidecarPath));

	if (sidecarStem === sourceStem) {
		return [];
	}

	if (!sidecarStem.toLowerCase().startsWith(sourceStem.toLowerCase())) {
		return [];
	}

	const suffix = sidecarStem
		.slice(sourceStem.length)
		.replace(/^[ ._-]+/g, "")
		.trim();

	return normalizeSuffixParts(suffix);
}

function isRelatedMovieSidecar(
	sourcePath: string,
	candidatePath: string,
): boolean {
	if (!isWithinSourceDirectoryTree(sourcePath, candidatePath)) {
		return false;
	}

	const candidateExt = path.extname(candidatePath).toLowerCase();
	if (!MOVIE_SIDECAR_EXTENSIONS.has(candidateExt)) {
		return false;
	}

	const sourceStem = stripFileExtension(path.basename(sourcePath));
	const candidateStem = stripFileExtension(path.basename(candidatePath));
	if (candidateStem === sourceStem) {
		return true;
	}

	if (!candidateStem.toLowerCase().startsWith(sourceStem.toLowerCase())) {
		return false;
	}

	return /^[ ._-]+/.test(candidateStem.slice(sourceStem.length));
}

function buildManagedMovieSidecarPath(
	managedMoviePath: string,
	sourcePath: string,
	sidecarPath: string,
	usedDestPaths: Set<string>,
	preferRelativeDirParts = false,
): string {
	const baseName = stripFileExtension(path.basename(managedMoviePath));
	const ext = path.extname(sidecarPath);
	const suffixParts = getMovieSidecarSuffixParts(sourcePath, sidecarPath);
	const relativeDirParts = getRelativeSidecarDirectoryParts(
		sourcePath,
		sidecarPath,
	);
	const candidatePartSets = [
		preferRelativeDirParts && relativeDirParts.length > 0
			? [...relativeDirParts, ...suffixParts]
			: suffixParts,
		relativeDirParts.length > 0 ? [...relativeDirParts, ...suffixParts] : null,
		preferRelativeDirParts ? suffixParts : null,
	].filter((parts): parts is string[] => parts != null);

	for (const parts of candidatePartSets) {
		const candidatePath = path.join(
			path.dirname(managedMoviePath),
			`${baseName}${parts.length > 0 ? `.${parts.join(".")}` : ""}${ext}`,
		);
		if (!usedDestPaths.has(candidatePath)) {
			return candidatePath;
		}
	}

	let counter = 2;
	while (true) {
		const candidatePath = path.join(
			path.dirname(managedMoviePath),
			`${baseName}.${[...relativeDirParts, ...suffixParts, String(counter)].filter(Boolean).join(".")}${ext}`,
		);
		if (!usedDestPaths.has(candidatePath)) {
			return candidatePath;
		}
		counter++;
	}
}

function buildMovieSidecarCollisionKey(
	managedMoviePath: string,
	sourcePath: string,
	sidecarPath: string,
): string {
	const suffixParts = getMovieSidecarSuffixParts(sourcePath, sidecarPath);
	return path.join(
		path.dirname(managedMoviePath),
		`${stripFileExtension(path.basename(managedMoviePath))}${suffixParts.length > 0 ? `.${suffixParts.join(".")}` : ""}${path.extname(sidecarPath)}`,
	);
}

function resolveManagedRootFolder(downloadProfileId: number): string | null {
	const profile = db
		.select()
		.from(downloadProfiles)
		.where(eq(downloadProfiles.id, downloadProfileId))
		.get();

	if (profile?.rootFolderPath) {
		return profile.rootFolderPath;
	}

	const fallbackProfiles = db.select().from(downloadProfiles).all();
	return (
		fallbackProfiles
			.filter(
				(candidate) =>
					typeof candidate.rootFolderPath === "string" &&
					candidate.rootFolderPath.trim() !== "",
			)
			.sort((left, right) => left.id - right.id)[0]?.rootFolderPath ?? null
	);
}

function isPrimaryImportFile(contentType: string, filePath: string): boolean {
	const ext = path.extname(filePath).toLowerCase();
	if (contentType === "tv" || contentType === "movie") {
		return VIDEO_EXTENSIONS.has(ext);
	}

	if (contentType === "audiobook") {
		return AUDIO_EXTENSIONS.has(ext);
	}

	return AUDIO_EXTENSIONS.has(ext) || EBOOK_EXTENSIONS.has(ext);
}

function inferTvSourceContainerRoot(filePath: string): string {
	const parentDirectory = path.dirname(filePath);
	return /^season\b/i.test(path.basename(parentDirectory))
		? path.dirname(parentDirectory)
		: parentDirectory;
}

function inferTvDestinationContainerRoot(destinationPath: string): string {
	const parentDirectory = path.dirname(destinationPath);
	return /^season\b/i.test(path.basename(parentDirectory))
		? path.dirname(parentDirectory)
		: parentDirectory;
}

function collectNonPrimaryFiles(
	fs: typeof import("node:fs"),
	rootPath: string,
	contentType: string,
): string[] {
	const results: string[] = [];

	function walk(currentPath: string): void {
		for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
			const absolutePath = path.join(currentPath, entry.name);

			if (entry.isDirectory()) {
				walk(absolutePath);
				continue;
			}

			if (isPrimaryImportFile(contentType, absolutePath)) {
				continue;
			}

			results.push(absolutePath);
		}
	}

	walk(rootPath);
	return results.sort(naturalSort);
}

function buildImportAssetRows({
	contentType,
	destinationPathByRowId,
	filesByRowId,
}: {
	contentType: "audiobook" | "book" | "movie" | "tv";
	destinationPathByRowId: Map<string, string>;
	filesByRowId: Map<string, { path: string }>;
}): ImportAssetRowInput[] {
	return [...filesByRowId.entries()].map(([rowId, file]) => {
		const destinationPath = destinationPathByRowId.get(rowId);
		if (!destinationPath) {
			throw new Error(`Missing destination path for import row ${rowId}`);
		}

		if (contentType === "tv") {
			return {
				rowId,
				contentType,
				sourcePath: file.path,
				destinationPath,
				sourceContainerRoot: inferTvSourceContainerRoot(file.path),
				destinationContainerRoot:
					inferTvDestinationContainerRoot(destinationPath),
			};
		}

		return {
			rowId,
			contentType,
			sourcePath: file.path,
			destinationPath,
			sourceContainerRoot: path.dirname(file.path),
			destinationContainerRoot: path.dirname(destinationPath),
		};
	});
}

function buildImportAssetPlan({
	contentType,
	destinationPathByRowId,
	filesByRowId,
	requestedAssetsByRowId,
}: {
	contentType: "audiobook" | "book" | "movie" | "tv";
	destinationPathByRowId: Map<string, string>;
	filesByRowId: Map<string, { path: string }>;
	requestedAssetsByRowId: Map<
		string,
		Array<
			Pick<ImportAssetSelection, "action" | "kind" | "selected" | "sourcePath">
		>
	>;
}): Map<string, ImportAssetRow> {
	const assetRows = buildImportAssetRows({
		contentType,
		destinationPathByRowId,
		filesByRowId,
	});
	const rowsByContainer = new Map<string, ImportAssetRowInput[]>();

	for (const row of assetRows) {
		const key = `${row.sourceContainerRoot}::${row.destinationContainerRoot}`;
		const current = rowsByContainer.get(key) ?? [];
		current.push(row);
		rowsByContainer.set(key, current);
	}

	const plannedRows = new Map<string, ImportAssetRow>();

	for (const rows of rowsByContainer.values()) {
		const selectedPaths = new Set(
			rows.flatMap((row) =>
				(requestedAssetsByRowId.get(row.rowId) ?? []).map(
					(asset) => asset.sourcePath,
				),
			),
		);
		const assigned = assignImportAssets({
			rows,
			discoveredPaths: [...selectedPaths],
		});

		for (const row of assigned.rows) {
			const requestedByPath = new Map(
				(requestedAssetsByRowId.get(row.rowId) ?? []).map((asset) => [
					asset.sourcePath,
					asset,
				]),
			);

			plannedRows.set(row.rowId, {
				...row,
				assets: row.assets.map((asset) => ({
					...asset,
					selected:
						requestedByPath.get(asset.sourcePath)?.selected ?? asset.selected,
					action: requestedByPath.get(asset.sourcePath)?.action ?? asset.action,
					kind: requestedByPath.get(asset.sourcePath)?.kind ?? asset.kind,
				})),
			});
		}
	}

	return plannedRows;
}

const tvMappingSchema = z.object({
	unmappedFileId: z.number(),
	episodeId: z.number(),
});

const importAssetSchema = z.object({
	action: z.enum(["move", "delete", "ignore"]).default("move"),
	kind: z.enum(["file", "directory"]),
	ownershipReason: z.enum(["direct", "token", "nested", "container"]),
	relativeSourcePath: z.string().optional(),
	selected: z.boolean().default(true),
	sourcePath: z.string(),
});

const importRowSchema = z.object({
	assets: z.array(importAssetSchema).default([]),
	unmappedFileId: z.number(),
	entityId: z.number(),
	entityType: z.enum(["book", "movie", "episode"]),
});

export const mappingInputSchema = z.union([
	z
		.object({
			entityType: z.enum(["book", "movie"]),
			unmappedFileIds: z.array(z.number()),
			entityId: z.number(),
			downloadProfileId: z.number(),
		})
		.strict(),
	z
		.object({
			entityType: z.literal("episode"),
			unmappedFileIds: z.array(z.number()),
			entityId: z.number(),
			downloadProfileId: z.number(),
		})
		.strict(),
	z
		.object({
			entityType: z.literal("episode"),
			downloadProfileId: z.number(),
			moveRelatedSidecars: z.boolean().default(false),
			moveRelatedFiles: z.boolean().optional(),
			deleteDeselectedRelatedFiles: z.boolean().default(false),
			tvMappings: z.array(tvMappingSchema).min(1),
		})
		.strict(),
	z
		.object({
			downloadProfileId: z.number(),
			rows: z.array(importRowSchema).min(1),
			moveRelatedSidecars: z.boolean().default(false),
			moveRelatedFiles: z.boolean().optional(),
			deleteDeselectedRelatedFiles: z.boolean().default(false),
		})
		.strict(),
]);

type MappingRow = z.infer<typeof importRowSchema>;
type MappingIssue = {
	entityType: MappingRow["entityType"];
	message: string;
	sourcePath: string;
	unmappedFileId: number;
};
type MappingResult = {
	failedCount: number;
	failures: MappingIssue[];
	mappedCount: number;
	success: true;
	warnings: MappingIssue[];
};

function normalizeMappingRows(data: z.infer<typeof mappingInputSchema>): {
	deleteDeselectedRelatedFiles: boolean;
	moveRelatedFiles: boolean;
	rows: MappingRow[];
} {
	if ("rows" in data) {
		return {
			deleteDeselectedRelatedFiles: data.deleteDeselectedRelatedFiles,
			moveRelatedFiles:
				data.moveRelatedFiles ?? data.moveRelatedSidecars ?? false,
			rows: data.rows,
		};
	}

	if ("tvMappings" in data) {
		return {
			deleteDeselectedRelatedFiles: data.deleteDeselectedRelatedFiles,
			moveRelatedFiles:
				data.moveRelatedFiles ?? data.moveRelatedSidecars ?? false,
			rows: data.tvMappings.map((mapping) => ({
				assets: [],
				unmappedFileId: mapping.unmappedFileId,
				entityId: mapping.episodeId,
				entityType: "episode" as const,
			})),
		};
	}

	return {
		deleteDeselectedRelatedFiles: false,
		moveRelatedFiles: false,
		rows: data.unmappedFileIds.map((unmappedFileId) => ({
			assets: [],
			unmappedFileId,
			entityId: data.entityId,
			entityType: data.entityType,
		})),
	};
}

function toIssue({
	error,
	file,
	row,
}: {
	error: unknown;
	file: { path: string };
	row: MappingRow;
}): MappingIssue {
	return {
		entityType: row.entityType,
		message: error instanceof Error ? error.message : String(error),
		sourcePath: file.path,
		unmappedFileId: row.unmappedFileId,
	};
}

function createMappingResult({
	failures,
	mappedCount,
	warnings,
}: {
	failures: MappingIssue[];
	mappedCount: number;
	warnings: MappingIssue[];
}): MappingResult {
	return {
		failedCount: failures.length,
		failures,
		mappedCount,
		success: true,
		warnings,
	};
}

function cleanupMappingAssets(
	fs: typeof import("node:fs"),
	operations: ReturnType<typeof buildAssetOperations> | undefined,
): void {
	if (!operations) return;
	for (const deletion of operations.deletes)
		fs.rmSync(deletion.path, {
			force: true,
			recursive: deletion.kind === "directory",
		});
	pruneEmptyDirectories({
		startDirectories: operations.pruneDirectories,
		stopAt: operations.stopAt,
		listEntries: (dir) => fs.readdirSync(dir),
		removeDirectory: (dir) => fs.rmSync(dir, { force: true, recursive: false }),
	});
}
function runMappingRow({
	file,
	row,
	failures,
	warnings,
	cleanup,
	...execution
}: Parameters<typeof executeMappingWithRollback>[0] & {
	file: { path: string };
	row: MappingRow;
	failures: MappingIssue[];
	warnings: MappingIssue[];
	cleanup: () => void;
}): boolean {
	try {
		executeMappingWithRollback(execution);
	} catch (error) {
		failures.push(toIssue({ error, file, row }));
		return false;
	}
	// Once committed, destructive cleanup is best-effort and must never trigger rollback.
	try {
		cleanup();
	} catch (error) {
		warnings.push(toIssue({ error, file, row }));
	}
	return true;
}

export async function executeMapping(
	data: z.infer<typeof mappingInputSchema>,
): Promise<MappingResult> {
	const fs = await import("node:fs");
	const { probeAudioFile, probeEbookFile, probeVideoFile } = await import(
		"src/server/media-probe"
	);
	const normalized = normalizeMappingRows(data);
	const rows = normalized.rows;
	const mappedFileIds = new Set(rows.map((row) => row.unmappedFileId));
	const episodeRows = rows.filter(
		(row): row is MappingRow & { entityType: "episode" } =>
			row.entityType === "episode",
	);

	if (
		episodeRows.length > 0 &&
		episodeRows.length === rows.length &&
		("tvMappings" in data || "rows" in data)
	) {
		const profile = db
			.select()
			.from(downloadProfiles)
			.where(eq(downloadProfiles.id, data.downloadProfileId))
			.get();

		if (!profile) {
			throw new Error(`Download profile ${data.downloadProfileId} not found`);
		}

		const managedRootPath = resolveManagedRootFolder(profile.id);
		if (!managedRootPath) {
			throw new Error(
				`Download profile ${data.downloadProfileId} has no root folder configured`,
			);
		}

		const mappedIds = new Set(episodeRows.map((row) => row.unmappedFileId));
		let mappedCount = 0;
		const failures: MappingIssue[] = [];
		const warnings: MappingIssue[] = [];

		for (const row of episodeRows) {
			const file = db
				.select()
				.from(unmappedFiles)
				.where(eq(unmappedFiles.id, row.unmappedFileId))
				.get();

			if (!file) continue;

			const episode = db
				.select({
					episodeNumber: episodes.episodeNumber,
					seasonNumber: seasons.seasonNumber,
					showTitle: shows.title,
					showYear: shows.year,
					useSeasonFolder: shows.useSeasonFolder,
				})
				.from(episodes)
				.innerJoin(seasons, eq(seasons.id, episodes.seasonId))
				.innerJoin(shows, eq(shows.id, episodes.showId))
				.where(eq(episodes.id, row.entityId))
				.limit(1)
				.get();

			if (!episode) {
				throw new Error(`Episode ${row.entityId} not found`);
			}

			let duration: number | null = null;
			let codec: string | null = null;
			let container: string | null = null;

			if (VIDEO_EXTENSIONS.has(path.extname(file.path).toLowerCase())) {
				const meta = await probeVideoFile(file.path);
				if (meta) {
					duration = meta.duration;
					codec = meta.codec;
					container = meta.container;
				}
			}

			const managedEpisodePath = buildManagedTvEpisodePath({
				rootFolderPath: managedRootPath,
				showTitle: episode.showTitle,
				showYear: episode.showYear,
				seasonNumber: episode.seasonNumber,
				episodeNumber: episode.episodeNumber,
				sourcePath: file.path,
				useSeasonFolder: Boolean(episode.useSeasonFolder),
			});
			const movedSidecarIds: number[] = [];
			let plannedAssetRow: ImportAssetRow | undefined;
			let assetOperations: ReturnType<typeof buildAssetOperations> | undefined;

			const mapped = runMappingRow({
				fs,
				logLabel: "TV file move",
				move: ({ movePath }) => {
					movePath({
						from: file.path,
						kind: "file",
						to: managedEpisodePath,
					});
					const usedDestPaths = new Set([managedEpisodePath]);

					if (normalized.moveRelatedFiles && row.assets.length > 0) {
						plannedAssetRow = buildImportAssetPlan({
							contentType: "tv",
							destinationPathByRowId: new Map([
								[String(row.unmappedFileId), managedEpisodePath],
							]),
							filesByRowId: new Map([
								[String(row.unmappedFileId), { path: file.path }],
							]),
							requestedAssetsByRowId: new Map([
								[String(row.unmappedFileId), row.assets],
							]),
						}).get(String(row.unmappedFileId));

						if (plannedAssetRow) {
							assetOperations = buildAssetOperations({
								row: plannedAssetRow,
								deleteDeselectedAssets: normalized.deleteDeselectedRelatedFiles,
							});

							for (const move of assetOperations.moves) {
								movePath(move);
							}
						}
					} else if (normalized.moveRelatedFiles) {
						const candidates = db
							.select()
							.from(unmappedFiles)
							.where(eq(unmappedFiles.rootFolderPath, file.rootFolderPath))
							.all();
						const relatedSidecars = candidates.filter(
							(candidate) =>
								candidate.id !== file.id &&
								!mappedIds.has(candidate.id) &&
								isRelatedTvSidecar(file.path, candidate.path),
						);
						const sidecarCollisionCounts = new Map<string, number>();

						for (const candidate of relatedSidecars) {
							const collisionKey = buildTvSidecarCollisionKey(
								managedEpisodePath,
								file.path,
								candidate.path,
							);
							sidecarCollisionCounts.set(
								collisionKey,
								(sidecarCollisionCounts.get(collisionKey) ?? 0) + 1,
							);
						}

						for (const candidate of relatedSidecars) {
							const collisionKey = buildTvSidecarCollisionKey(
								managedEpisodePath,
								file.path,
								candidate.path,
							);
							const sidecarDest = buildManagedTvSidecarPath(
								managedEpisodePath,
								file.path,
								candidate.path,
								usedDestPaths,
								(sidecarCollisionCounts.get(collisionKey) ?? 0) > 1,
							);
							movePath({
								from: candidate.path,
								kind: "file",
								to: sidecarDest,
							});
							usedDestPaths.add(sidecarDest);
							movedSidecarIds.push(candidate.id);
						}
					}
				},
				runTransaction: () => {
					db.transaction((tx) => {
						tx.insert(episodeFiles)
							.values({
								episodeId: row.entityId,
								path: managedEpisodePath,
								size: file.size,
								quality: file.quality,
								downloadProfileId: data.downloadProfileId,
								duration,
								codec,
								container,
							})
							.run();

						tx.insert(history)
							.values({
								eventType: "episodeFileAdded",
								episodeId: row.entityId,
								data: {
									path: managedEpisodePath,
									size: file.size,
									quality: file.quality?.quality?.name ?? "Unknown",
									source: "unmappedFileMapping",
								},
							})
							.run();

						tx.delete(unmappedFiles).where(eq(unmappedFiles.id, file.id)).run();
						for (const sidecarId of movedSidecarIds) {
							tx.delete(unmappedFiles)
								.where(eq(unmappedFiles.id, sidecarId))
								.run();
						}
					});
				},
				file,
				row,
				failures,
				warnings,
				cleanup: () => cleanupMappingAssets(fs, assetOperations),
			});
			if (!mapped) continue;
			mappedCount++;
		}

		return createMappingResult({ failures, mappedCount, warnings });
	}

	// Validate profile exists
	const profile = db
		.select()
		.from(downloadProfiles)
		.where(eq(downloadProfiles.id, data.downloadProfileId))
		.get();

	if (!profile) {
		throw new Error(`Download profile ${data.downloadProfileId} not found`);
	}

	// Fetch all unmapped rows and sort naturally for deterministic part numbering
	const resolvedRows = rows
		.map((row) => ({
			file: db
				.select()
				.from(unmappedFiles)
				.where(eq(unmappedFiles.id, row.unmappedFileId))
				.get(),
			row,
		}))
		.filter(
			(
				resolvedRow,
			): resolvedRow is {
				file: NonNullable<typeof resolvedRow.file>;
				row: MappingRow;
			} => resolvedRow.file != null,
		)
		.sort((left, right) => naturalSort(left.file.path, right.file.path));

	let mappedCount = 0;
	const failures: MappingIssue[] = [];
	const warnings: MappingIssue[] = [];

	const audioRowsByBookId = new Map<number, typeof resolvedRows>();
	for (const resolvedRow of resolvedRows) {
		if (
			resolvedRow.row.entityType !== "book" ||
			!AUDIO_EXTENSIONS.has(path.extname(resolvedRow.file.path).toLowerCase())
		) {
			continue;
		}

		const current = audioRowsByBookId.get(resolvedRow.row.entityId) ?? [];
		current.push(resolvedRow);
		audioRowsByBookId.set(resolvedRow.row.entityId, current);
	}

	for (const bookRows of audioRowsByBookId.values()) {
		bookRows.sort((left, right) =>
			naturalSort(left.file.path, right.file.path),
		);
	}

	for (const { file, row } of resolvedRows) {
		const ext = path.extname(file.path).toLowerCase();
		const isAudio = AUDIO_EXTENSIONS.has(ext);
		const isVideo = VIDEO_EXTENSIONS.has(ext);

		if (row.entityType === "book") {
			const book = db
				.select({
					authorName: booksAuthors.authorName,
					releaseYear: books.releaseYear,
					title: books.title,
				})
				.from(books)
				.leftJoin(
					booksAuthors,
					and(
						eq(booksAuthors.bookId, books.id),
						eq(booksAuthors.isPrimary, true),
					),
				)
				.where(eq(books.id, row.entityId))
				.limit(1)
				.get();

			if (!book) {
				throw new Error(`Book ${row.entityId} not found`);
			}

			const mediaType = profile.contentType === "audiobook" ? "audio" : "ebook";
			const authorFolderName = buildBookAuthorFolderName({
				mediaType,
				authorName: book.authorName ?? "Unknown Author",
				bookTitle: book.title,
				releaseYear: book.releaseYear,
				authorFolderVarsMode: "author-only",
			});
			const bookFolderName = buildBookFolderName({
				mediaType,
				authorName: book.authorName ?? "Unknown Author",
				bookTitle: book.title,
				releaseYear: book.releaseYear,
			});
			const managedRootPath = resolveManagedRootFolder(data.downloadProfileId);
			if (!managedRootPath) {
				throw new Error(
					`Download profile ${data.downloadProfileId} has no root folder configured`,
				);
			}

			// Probe metadata
			let duration: number | null = null;
			let bitrate: number | null = null;
			let sampleRate: number | null = null;
			let channels: number | null = null;
			let codec: string | null = null;
			let pageCount: number | null = null;
			let language: string | null = null;
			let part: number | null = null;
			let partCount: number | null = null;

			if (isAudio) {
				const meta = await probeAudioFile(file.path);
				if (meta) {
					duration = meta.duration;
					bitrate = meta.bitrate;
					sampleRate = meta.sampleRate;
					channels = meta.channels;
					codec = meta.codec;
				}
				const audioRows = audioRowsByBookId.get(row.entityId) ?? [];
				if (audioRows.length > 1) {
					part =
						audioRows.findIndex((audioRow) => audioRow.file.id === file.id) + 1;
					partCount = audioRows.length;
				}
			} else {
				const meta = probeEbookFile(file.path);
				if (meta) {
					pageCount = meta.pageCount;
					language = meta.language;
				}
			}

			const destPath = path.join(
				managedRootPath,
				authorFolderName,
				bookFolderName,
				path.basename(file.path),
			);
			let plannedAssetRow: ImportAssetRow | undefined;
			let assetOperations: ReturnType<typeof buildAssetOperations> | undefined;

			const mapped = runMappingRow({
				fs,
				logLabel: "file move",
				move: ({ movePath }) => {
					movePath({
						from: file.path,
						to: destPath,
						kind: "file",
					});

					if (normalized.moveRelatedFiles && row.assets.length > 0) {
						plannedAssetRow = buildImportAssetPlan({
							contentType:
								profile.contentType === "audiobook" ? "audiobook" : "book",
							destinationPathByRowId: new Map([
								[String(row.unmappedFileId), destPath],
							]),
							filesByRowId: new Map([
								[String(row.unmappedFileId), { path: file.path }],
							]),
							requestedAssetsByRowId: new Map([
								[String(row.unmappedFileId), row.assets],
							]),
						}).get(String(row.unmappedFileId));

						if (plannedAssetRow) {
							assetOperations = buildAssetOperations({
								row: plannedAssetRow,
								deleteDeselectedAssets: normalized.deleteDeselectedRelatedFiles,
							});
							for (const move of assetOperations.moves) {
								movePath(move);
							}
						}
					}
				},
				runTransaction: () => {
					db.transaction((tx) => {
						tx.insert(bookFiles)
							.values({
								bookId: row.entityId,
								path: destPath,
								size: file.size,
								quality: file.quality,
								downloadProfileId: data.downloadProfileId,
								duration,
								bitrate,
								sampleRate,
								channels,
								codec,
								pageCount,
								language,
								part,
								partCount,
							})
							.run();

						tx.insert(history)
							.values({
								eventType: "bookFileAdded",
								bookId: row.entityId,
								data: {
									path: destPath,
									size: file.size,
									quality: file.quality?.quality?.name ?? "Unknown",
									source: "unmappedFileMapping",
								},
							})
							.run();

						tx.delete(unmappedFiles).where(eq(unmappedFiles.id, file.id)).run();
					});
				},
				file,
				row,
				failures,
				warnings,
				cleanup: () => cleanupMappingAssets(fs, assetOperations),
			});
			if (!mapped) continue;
		} else if (row.entityType === "movie") {
			const movie = db
				.select({
					title: movies.title,
					year: movies.year,
				})
				.from(movies)
				.where(eq(movies.id, row.entityId))
				.limit(1)
				.get();

			if (!movie) {
				throw new Error(`Movie ${row.entityId} not found`);
			}

			const managedRootPath = resolveManagedRootFolder(data.downloadProfileId);
			if (!managedRootPath) {
				throw new Error(
					`Download profile ${data.downloadProfileId} has no root folder configured`,
				);
			}

			// Probe video metadata
			let duration: number | null = null;
			let codec: string | null = null;
			let container: string | null = null;

			if (isVideo) {
				const meta = await probeVideoFile(file.path);
				if (meta) {
					duration = meta.duration;
					codec = meta.codec;
					container = meta.container;
				}
			}

			const destPath = buildManagedMovieDestination({
				rootFolderPath: managedRootPath,
				movieTitle: movie.title,
				movieYear: movie.year,
				sourcePath: file.path,
			});
			const movedSidecarIds: number[] = [];
			let plannedAssetRow: ImportAssetRow | undefined;
			let assetOperations: ReturnType<typeof buildAssetOperations> | undefined;

			const mapped = runMappingRow({
				fs,
				logLabel: "movie file move",
				move: ({ movePath }) => {
					movePath({
						from: file.path,
						kind: "file",
						to: destPath,
					});
					const usedDestPaths = new Set([destPath]);

					if (normalized.moveRelatedFiles && row.assets.length > 0) {
						plannedAssetRow = buildImportAssetPlan({
							contentType: "movie",
							destinationPathByRowId: new Map([
								[String(row.unmappedFileId), destPath],
							]),
							filesByRowId: new Map([
								[String(row.unmappedFileId), { path: file.path }],
							]),
							requestedAssetsByRowId: new Map([
								[String(row.unmappedFileId), row.assets],
							]),
						}).get(String(row.unmappedFileId));

						if (plannedAssetRow) {
							assetOperations = buildAssetOperations({
								row: plannedAssetRow,
								deleteDeselectedAssets: normalized.deleteDeselectedRelatedFiles,
							});

							for (const move of assetOperations.moves) {
								movePath(move);
							}
						}
					} else if (normalized.moveRelatedFiles) {
						const candidates = db
							.select()
							.from(unmappedFiles)
							.where(eq(unmappedFiles.rootFolderPath, file.rootFolderPath))
							.all();
						const relatedSidecars = candidates.filter(
							(candidate) =>
								candidate.id !== file.id &&
								!mappedFileIds.has(candidate.id) &&
								isRelatedMovieSidecar(file.path, candidate.path),
						);
						const sidecarCollisionCounts = new Map<string, number>();

						for (const candidate of relatedSidecars) {
							const collisionKey = buildMovieSidecarCollisionKey(
								destPath,
								file.path,
								candidate.path,
							);
							sidecarCollisionCounts.set(
								collisionKey,
								(sidecarCollisionCounts.get(collisionKey) ?? 0) + 1,
							);
						}

						for (const candidate of relatedSidecars) {
							const collisionKey = buildMovieSidecarCollisionKey(
								destPath,
								file.path,
								candidate.path,
							);
							const sidecarDest = buildManagedMovieSidecarPath(
								destPath,
								file.path,
								candidate.path,
								usedDestPaths,
								(sidecarCollisionCounts.get(collisionKey) ?? 0) > 1,
							);
							movePath({
								from: candidate.path,
								kind: "file",
								to: sidecarDest,
							});
							usedDestPaths.add(sidecarDest);
							movedSidecarIds.push(candidate.id);
						}
					}
				},
				runTransaction: () => {
					db.transaction((tx) => {
						tx.insert(movieFiles)
							.values({
								movieId: row.entityId,
								path: destPath,
								size: file.size,
								quality: file.quality,
								downloadProfileId: data.downloadProfileId,
								duration,
								codec,
								container,
							})
							.run();

						tx.update(movies)
							.set({ path: path.dirname(destPath) })
							.where(eq(movies.id, row.entityId))
							.run();

						tx.insert(history)
							.values({
								eventType: "movieFileAdded",
								movieId: row.entityId,
								data: {
									path: destPath,
									size: file.size,
									quality: file.quality?.quality?.name ?? "Unknown",
									source: "unmappedFileMapping",
								},
							})
							.run();

						tx.delete(unmappedFiles).where(eq(unmappedFiles.id, file.id)).run();
						for (const sidecarId of movedSidecarIds) {
							tx.delete(unmappedFiles)
								.where(eq(unmappedFiles.id, sidecarId))
								.run();
						}
					});
				},
				file,
				row,
				failures,
				warnings,
				cleanup: () => cleanupMappingAssets(fs, assetOperations),
			});
			if (!mapped) continue;
		} else if (row.entityType === "episode") {
			try {
				// Probe video metadata
				let duration: number | null = null;
				let codec: string | null = null;
				let container: string | null = null;

				if (isVideo) {
					const meta = await probeVideoFile(file.path);
					if (meta) {
						duration = meta.duration;
						codec = meta.codec;
						container = meta.container;
					}
				}

				db.transaction((tx) => {
					tx.insert(episodeFiles)
						.values({
							episodeId: row.entityId,
							path: file.path,
							size: file.size,
							quality: file.quality,
							downloadProfileId: data.downloadProfileId,
							duration,
							codec,
							container,
						})
						.run();

					tx.insert(history)
						.values({
							eventType: "episodeFileAdded",
							episodeId: row.entityId,
							data: {
								path: file.path,
								size: file.size,
								quality: file.quality?.quality?.name ?? "Unknown",
								source: "unmappedFileMapping",
							},
						})
						.run();

					tx.delete(unmappedFiles).where(eq(unmappedFiles.id, file.id)).run();
				});
			} catch (error) {
				failures.push(toIssue({ error, file, row }));
				continue;
			}
		}

		mappedCount++;
	}

	return createMappingResult({ failures, mappedCount, warnings });
}

export async function previewMappingAssets(data: {
	rows: Array<{
		fileId: number;
		path: string;
		contentType: "audiobook" | "book" | "movie" | "tv";
	}>;
}) {
	const fs = await import("node:fs");
	const rowsByContainer = new Map<
		string,
		Array<ImportAssetRowInput & { fileId: number }>
	>();

	for (const row of data.rows) {
		const sourceContainerRoot =
			row.contentType === "tv"
				? inferTvSourceContainerRoot(row.path)
				: path.dirname(row.path);
		const containerKey = `${row.contentType}::${sourceContainerRoot}`;
		const current = rowsByContainer.get(containerKey) ?? [];
		current.push({
			rowId: String(row.fileId),
			fileId: row.fileId,
			contentType: row.contentType,
			sourcePath: row.path,
			destinationPath: row.path,
			sourceContainerRoot,
			destinationContainerRoot: sourceContainerRoot,
		});
		rowsByContainer.set(containerKey, current);
	}

	const previewRows = new Map<
		number,
		{
			assets: Array<
				Pick<
					ImportAssetSelection,
					| "kind"
					| "ownershipReason"
					| "relativeSourcePath"
					| "selected"
					| "sourcePath"
				>
			>;
			fileId: number;
		}
	>();

	for (const rows of rowsByContainer.values()) {
		const discoveredPaths = collectNonPrimaryFiles(
			fs,
			rows[0].sourceContainerRoot,
			rows[0].contentType,
		);
		const assigned = assignImportAssets({
			rows,
			discoveredPaths,
		});

		for (const row of assigned.rows) {
			previewRows.set(Number(row.rowId), {
				fileId: Number(row.rowId),
				assets: row.assets.map((asset) => ({
					kind: asset.kind,
					ownershipReason: asset.ownershipReason,
					relativeSourcePath: asset.relativeSourcePath,
					selected: asset.selected,
					sourcePath: asset.sourcePath,
				})),
			});
		}
	}

	return {
		rows: data.rows.map((row) => ({
			fileId: row.fileId,
			assets: previewRows.get(row.fileId)?.assets ?? [],
		})),
	};
}
