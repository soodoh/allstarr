import * as path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, like, or } from "drizzle-orm";
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
import {
	buildBookAuthorFolderName,
	buildBookFolderName,
} from "src/server/book-paths";
import { eventBus } from "src/server/event-bus";
import {
	buildManagedEpisodeDestination,
	buildManagedMovieDestination,
} from "src/server/file-import";
import {
	type AssetOperation,
	assignImportAssets,
	buildAssetOperations,
	type ImportAssetRow,
	type ImportAssetRowInput,
	type ImportAssetSelection,
	pruneEmptyDirectories,
} from "src/server/import-assets";
import { logWarn } from "src/server/logger";
import { requireAdmin, requireAuth } from "src/server/middleware";
import { z } from "zod";

// ─── Helpers ───────────────────────────────────────────────────────────────

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

function moveFileToManagedPath(
	fs: typeof import("node:fs"),
	sourcePath: string,
	destPath: string,
): void {
	fs.mkdirSync(path.dirname(destPath), { recursive: true });

	try {
		fs.renameSync(sourcePath, destPath);
		return;
	} catch (error) {
		if (
			!(error instanceof Error) ||
			!("code" in error) ||
			error.code !== "EXDEV"
		) {
			throw error;
		}
	}

	fs.copyFileSync(sourcePath, destPath);
	try {
		fs.unlinkSync(sourcePath);
	} catch (error) {
		try {
			fs.unlinkSync(destPath);
		} catch {
			// Ignore cleanup failures so the original unlink error is preserved.
		}
		throw error;
	}
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

function movePathToManagedDestination(
	fs: typeof import("node:fs"),
	sourcePath: string,
	destPath: string,
	kind: "directory" | "file",
): void {
	fs.mkdirSync(path.dirname(destPath), { recursive: true });

	try {
		fs.renameSync(sourcePath, destPath);
		return;
	} catch (error) {
		if (
			kind === "directory" ||
			!(error instanceof Error) ||
			!("code" in error) ||
			error.code !== "EXDEV"
		) {
			throw error;
		}
	}

	fs.copyFileSync(sourcePath, destPath);
	try {
		fs.unlinkSync(sourcePath);
	} catch (error) {
		try {
			fs.unlinkSync(destPath);
		} catch {
			// Ignore cleanup failures so the original unlink error is preserved.
		}
		throw error;
	}
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

// ─── getUnmappedFilesFn ────────────────────────────────────────────────────

const getUnmappedFilesSchema = z.object({
	showIgnored: z.boolean().optional().default(false),
	contentType: z.string().optional(),
	search: z.string().optional(),
});

export const getUnmappedFilesFn = createServerFn({ method: "GET" })
	.inputValidator((d: unknown) => getUnmappedFilesSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();

		const conditions = [];
		if (!data.showIgnored) {
			conditions.push(eq(unmappedFiles.ignored, false));
		}
		if (data.contentType) {
			conditions.push(eq(unmappedFiles.contentType, data.contentType));
		}
		if (data.search) {
			conditions.push(like(unmappedFiles.path, `%${data.search}%`));
		}

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		const rows = db.select().from(unmappedFiles).where(where).all();

		// Group by rootFolderPath
		const grouped = new Map<
			string,
			{
				rootFolderPath: string;
				profileName: string | null;
				contentType: string;
				files: typeof rows;
			}
		>();

		for (const row of rows) {
			let group = grouped.get(row.rootFolderPath);
			if (!group) {
				// Look up profile name for this root folder
				const profile = db
					.select({ name: downloadProfiles.name })
					.from(downloadProfiles)
					.where(eq(downloadProfiles.rootFolderPath, row.rootFolderPath))
					.limit(1)
					.get();

				group = {
					rootFolderPath: row.rootFolderPath,
					profileName: profile?.name ?? null,
					contentType: row.contentType,
					files: [],
				};
				grouped.set(row.rootFolderPath, group);
			}
			group.files.push(row);
		}

		return Array.from(grouped.values());
	});

// ─── getUnmappedFileCountFn ────────────────────────────────────────────────

export const getUnmappedFileCountFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();

		const result = db
			.select({ count: count() })
			.from(unmappedFiles)
			.where(eq(unmappedFiles.ignored, false))
			.get();

		return result?.count ?? 0;
	},
);

// ─── ignoreUnmappedFilesFn ─────────────────────────────────────────────────

const ignoreUnmappedFilesSchema = z.object({
	ids: z.array(z.number()),
	ignored: z.boolean(),
});

export const ignoreUnmappedFilesFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => ignoreUnmappedFilesSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		for (const id of data.ids) {
			db.update(unmappedFiles)
				.set({ ignored: data.ignored })
				.where(eq(unmappedFiles.id, id))
				.run();
		}

		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true };
	});

// ─── deleteUnmappedFilesFn ─────────────────────────────────────────────────

const deleteUnmappedFilesSchema = z.object({
	ids: z.array(z.number()),
});

export const deleteUnmappedFilesFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => deleteUnmappedFilesSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		const fs = await import("node:fs");

		for (const id of data.ids) {
			const file = db
				.select()
				.from(unmappedFiles)
				.where(eq(unmappedFiles.id, id))
				.get();

			if (!file) continue;

			// Delete from disk
			try {
				fs.unlinkSync(file.path);
			} catch (error) {
				logWarn(
					"unmapped-files",
					`Failed to delete file from disk: ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}

			// Delete from DB
			db.delete(unmappedFiles).where(eq(unmappedFiles.id, id)).run();
		}

		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true };
	});

// ─── mapUnmappedFileFn ─────────────────────────────────────────────────────

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

const mapUnmappedFileSchema = z.union([
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

type ImportRow = z.infer<typeof importRowSchema>;

function normalizeImportRows(data: z.infer<typeof mapUnmappedFileSchema>): {
	deleteDeselectedRelatedFiles: boolean;
	moveRelatedFiles: boolean;
	rows: ImportRow[];
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

export const mapUnmappedFileFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => mapUnmappedFileSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		const fs = await import("node:fs");
		const { probeAudioFile, probeEbookFile, probeVideoFile } = await import(
			"src/server/media-probe"
		);
		const normalized = normalizeImportRows(data);
		const rows = normalized.rows;
		const mappedFileIds = new Set(rows.map((row) => row.unmappedFileId));
		const episodeRows = rows.filter(
			(row): row is ImportRow & { entityType: "episode" } =>
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
				const movedFiles: Array<{
					destPath: string;
					kind: "directory" | "file";
					sourcePath: string;
				}> = [];
				const movedSidecarIds: number[] = [];
				let plannedAssetRow: ImportAssetRow | undefined;

				try {
					moveFileToManagedPath(fs, file.path, managedEpisodePath);
					movedFiles.push({
						destPath: managedEpisodePath,
						kind: "file",
						sourcePath: file.path,
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
							const assetOperations = buildAssetOperations({
								row: plannedAssetRow,
								deleteDeselectedAssets: normalized.deleteDeselectedRelatedFiles,
							});

							for (const move of assetOperations.moves) {
								movePathToManagedDestination(fs, move.from, move.to, move.kind);
								movedFiles.push({
									destPath: move.to,
									kind: move.kind,
									sourcePath: move.from,
								});
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
							moveFileToManagedPath(fs, candidate.path, sidecarDest);
							movedFiles.push({
								destPath: sidecarDest,
								kind: "file",
								sourcePath: candidate.path,
							});
							usedDestPaths.add(sidecarDest);
							movedSidecarIds.push(candidate.id);
						}
					}

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

					if (plannedAssetRow) {
						const assetOperations = buildAssetOperations({
							row: plannedAssetRow,
							deleteDeselectedAssets: normalized.deleteDeselectedRelatedFiles,
						});

						for (const deletion of assetOperations.deletes) {
							fs.rmSync(deletion.path, {
								force: true,
								recursive: deletion.kind === "directory",
							});
						}

						pruneEmptyDirectories({
							startDirectories: assetOperations.pruneDirectories,
							stopAt: assetOperations.stopAt,
							listEntries: (dir) => fs.readdirSync(dir),
							removeDirectory: (dir) =>
								fs.rmSync(dir, { force: true, recursive: false }),
						});
					}

					mappedCount++;
				} catch (error) {
					for (const moved of [...movedFiles].reverse()) {
						try {
							movePathToManagedDestination(
								fs,
								moved.destPath,
								moved.sourcePath,
								moved.kind,
							);
						} catch (rollbackError) {
							logWarn(
								"unmapped-files",
								`Failed to roll back TV file move for ${moved.sourcePath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
							);
						}
					}
					throw error;
				}
			}

			eventBus.emit({ type: "unmappedFilesUpdated" });
			return { success: true, mappedCount };
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
					row: ImportRow;
				} => resolvedRow.file != null,
			)
			.sort((left, right) => naturalSort(left.file.path, right.file.path));

		let mappedCount = 0;

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

				const mediaType =
					profile.contentType === "audiobook" ? "audio" : "ebook";
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
				const managedRootPath = resolveManagedRootFolder(
					data.downloadProfileId,
				);
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
							audioRows.findIndex((audioRow) => audioRow.file.id === file.id) +
							1;
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
				const movedPaths: AssetOperation[] = [];
				let plannedAssetRow: ImportAssetRow | undefined;

				try {
					moveFileToManagedPath(fs, file.path, destPath);
					movedPaths.push({
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
							const assetOperations = buildAssetOperations({
								row: plannedAssetRow,
								deleteDeselectedAssets: normalized.deleteDeselectedRelatedFiles,
							});
							for (const move of assetOperations.moves) {
								movePathToManagedDestination(fs, move.from, move.to, move.kind);
								movedPaths.push(move);
							}
						}
					}

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

					if (plannedAssetRow) {
						const assetOperations = buildAssetOperations({
							row: plannedAssetRow,
							deleteDeselectedAssets: normalized.deleteDeselectedRelatedFiles,
						});

						for (const deletion of assetOperations.deletes) {
							fs.rmSync(deletion.path, {
								force: true,
								recursive: deletion.kind === "directory",
							});
						}

						pruneEmptyDirectories({
							startDirectories: assetOperations.pruneDirectories,
							stopAt: assetOperations.stopAt,
							listEntries: (dir) => fs.readdirSync(dir),
							removeDirectory: (dir) =>
								fs.rmSync(dir, { force: true, recursive: false }),
						});
					}
				} catch (error) {
					for (const moved of [...movedPaths].reverse()) {
						try {
							movePathToManagedDestination(
								fs,
								moved.to,
								moved.from,
								moved.kind,
							);
						} catch (rollbackError) {
							logWarn(
								"unmapped-files",
								`Failed to roll back file move for ${moved.from}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
							);
						}
					}
					throw error;
				}
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

				const managedRootPath = resolveManagedRootFolder(
					data.downloadProfileId,
				);
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
				const movedFiles: Array<{
					destPath: string;
					kind: "directory" | "file";
					sourcePath: string;
				}> = [];
				const movedSidecarIds: number[] = [];
				let plannedAssetRow: ImportAssetRow | undefined;

				try {
					moveFileToManagedPath(fs, file.path, destPath);
					movedFiles.push({
						destPath,
						kind: "file",
						sourcePath: file.path,
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
							const assetOperations = buildAssetOperations({
								row: plannedAssetRow,
								deleteDeselectedAssets: normalized.deleteDeselectedRelatedFiles,
							});

							for (const move of assetOperations.moves) {
								movePathToManagedDestination(fs, move.from, move.to, move.kind);
								movedFiles.push({
									destPath: move.to,
									kind: move.kind,
									sourcePath: move.from,
								});
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
							moveFileToManagedPath(fs, candidate.path, sidecarDest);
							movedFiles.push({
								destPath: sidecarDest,
								kind: "file",
								sourcePath: candidate.path,
							});
							usedDestPaths.add(sidecarDest);
							movedSidecarIds.push(candidate.id);
						}
					}

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

					if (plannedAssetRow) {
						const assetOperations = buildAssetOperations({
							row: plannedAssetRow,
							deleteDeselectedAssets: normalized.deleteDeselectedRelatedFiles,
						});

						for (const deletion of assetOperations.deletes) {
							fs.rmSync(deletion.path, {
								force: true,
								recursive: deletion.kind === "directory",
							});
						}

						pruneEmptyDirectories({
							startDirectories: assetOperations.pruneDirectories,
							stopAt: assetOperations.stopAt,
							listEntries: (dir) => fs.readdirSync(dir),
							removeDirectory: (dir) =>
								fs.rmSync(dir, { force: true, recursive: false }),
						});
					}
				} catch (error) {
					for (const moved of [...movedFiles].reverse()) {
						try {
							movePathToManagedDestination(
								fs,
								moved.destPath,
								moved.sourcePath,
								moved.kind,
							);
						} catch (rollbackError) {
							logWarn(
								"unmapped-files",
								`Failed to roll back movie file move for ${moved.sourcePath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
							);
						}
					}
					throw error;
				}
			} else if (row.entityType === "episode") {
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

				db.insert(episodeFiles)
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

				db.insert(history)
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
			}

			if (row.entityType !== "book" && row.entityType !== "movie") {
				db.delete(unmappedFiles).where(eq(unmappedFiles.id, file.id)).run();
			}
			mappedCount++;
		}

		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true, mappedCount };
	});

// ─── previewUnmappedImportAssetsFn ────────────────────────────────────────

const previewImportAssetRowsSchema = z.object({
	rows: z.array(
		z.object({
			contentType: z.enum(["audiobook", "book", "movie", "tv"]),
			fileId: z.number(),
			path: z.string(),
		}),
	),
});

export const previewUnmappedImportAssetsFn = createServerFn({ method: "GET" })
	.inputValidator((d: unknown) => previewImportAssetRowsSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();
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
	});

// ─── suggestUnmappedTvMappingsFn ──────────────────────────────────────────

const suggestUnmappedTvMappingsSchema = z.object({
	rows: z.array(
		z.object({
			fileId: z.number(),
			contentType: z.literal("tv"),
			path: z.string(),
			hints: z
				.object({
					title: z.string().optional(),
					season: z.number().optional(),
					episode: z.number().optional(),
					source: z.enum(["filename", "path", "metadata"]).optional(),
				})
				.nullable(),
		}),
	),
});

export const suggestUnmappedTvMappingsFn = createServerFn({ method: "GET" })
	.inputValidator((d: unknown) => suggestUnmappedTvMappingsSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();

		const { episodes, seasons, shows } = await import("src/db/schema");

		return {
			rows: data.rows.map((row) => {
				const hintTitle = row.hints?.title?.trim();
				const hintSeason = row.hints?.season;
				const hintEpisode = row.hints?.episode;

				if (!hintTitle || hintSeason == null || hintEpisode == null) {
					return {
						fileId: row.fileId,
						contentType: row.contentType,
						path: row.path,
						hints: row.hints,
						suggestedEpisodeId: null,
						subtitle: "",
					};
				}

				const candidates = db
					.select({
						id: episodes.id,
						episodeNumber: episodes.episodeNumber,
						seasonNumber: seasons.seasonNumber,
						showTitle: shows.title,
						title: episodes.title,
					})
					.from(episodes)
					.innerJoin(seasons, eq(seasons.id, episodes.seasonId))
					.innerJoin(shows, eq(shows.id, episodes.showId))
					.where(
						and(
							like(shows.title, `%${hintTitle}%`),
							eq(seasons.seasonNumber, hintSeason),
							eq(episodes.episodeNumber, hintEpisode),
						),
					)
					.limit(10)
					.all();

				const match = candidates[0];

				return {
					fileId: row.fileId,
					contentType: row.contentType,
					path: row.path,
					hints: row.hints,
					suggestedEpisodeId: match?.id ?? null,
					subtitle: match
						? `S${String(match.seasonNumber).padStart(2, "0")}E${String(match.episodeNumber).padStart(2, "0")} - ${match.title}`
						: "",
				};
			}),
		};
	});

// ─── rescanAllRootFoldersFn ────────────────────────────────────────────────

export const rescanAllRootFoldersFn = createServerFn({
	method: "POST",
}).handler(async () => {
	await requireAdmin();

	// Lazy import to break dependency cycles
	const { getRootFolderPaths, rescanRootFolder } = await import(
		"src/server/disk-scan"
	);

	const rootFolderPaths = getRootFolderPaths();
	const results = [];

	for (const rootFolderPath of rootFolderPaths) {
		const stats = await rescanRootFolder(rootFolderPath);
		results.push({ rootFolderPath, stats });
	}

	eventBus.emit({ type: "unmappedFilesUpdated" });
	return results;
});

// ─── rescanRootFolderFn ────────────────────────────────────────────────────

const rescanRootFolderSchema = z.object({
	rootFolderPath: z.string(),
});

export const rescanRootFolderFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => rescanRootFolderSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		// Lazy import to break dependency cycles
		const { rescanRootFolder } = await import("src/server/disk-scan");

		const stats = await rescanRootFolder(data.rootFolderPath);

		eventBus.emit({ type: "unmappedFilesUpdated" });
		return stats;
	});

// ─── searchLibraryFn ──────────────────────────────────────────────────────

const searchLibrarySchema = z.object({
	query: z.string().min(2).max(120),
	contentType: z.string(),
});

export const searchLibraryFn = createServerFn({ method: "GET" })
	.inputValidator((d: unknown) => searchLibrarySchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();

		const library: Array<{
			id: number;
			title: string;
			subtitle: string;
			entityType: "book" | "movie" | "episode";
		}> = [];

		const searchPattern = `%${data.query}%`;

		if (data.contentType === "ebook" || data.contentType === "audiobook") {
			const { books, booksAuthors } = await import("src/db/schema");
			const bookResults = db
				.select({
					id: books.id,
					title: books.title,
					releaseYear: books.releaseYear,
					authorName: booksAuthors.authorName,
				})
				.from(books)
				.leftJoin(
					booksAuthors,
					and(
						eq(booksAuthors.bookId, books.id),
						eq(booksAuthors.isPrimary, true),
					),
				)
				.where(like(books.title, searchPattern))
				.limit(10)
				.all();

			for (const book of bookResults) {
				library.push({
					id: book.id,
					title: book.title,
					subtitle: [book.authorName, book.releaseYear]
						.filter(Boolean)
						.join(" · "),
					entityType: "book",
				});
			}
		} else if (data.contentType === "movie") {
			const { movies } = await import("src/db/schema");
			const movieResults = db
				.select({ id: movies.id, title: movies.title, year: movies.year })
				.from(movies)
				.where(like(movies.title, searchPattern))
				.limit(10)
				.all();

			for (const movie of movieResults) {
				library.push({
					id: movie.id,
					title: movie.title,
					subtitle: movie.year ? String(movie.year) : "",
					entityType: "movie",
				});
			}
		} else if (data.contentType === "tv") {
			const { episodes, seasons, shows } = await import("src/db/schema");
			const episodeResults = db
				.select({
					id: episodes.id,
					title: episodes.title,
					seasonNumber: seasons.seasonNumber,
					episodeNumber: episodes.episodeNumber,
					showTitle: shows.title,
				})
				.from(episodes)
				.innerJoin(seasons, eq(seasons.id, episodes.seasonId))
				.innerJoin(shows, eq(shows.id, episodes.showId))
				.where(
					or(
						like(episodes.title, searchPattern),
						like(shows.title, searchPattern),
					),
				)
				.limit(10)
				.all();

			for (const ep of episodeResults) {
				library.push({
					id: ep.id,
					title: ep.showTitle,
					subtitle: `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")} - ${ep.title}`,
					entityType: "episode",
				});
			}
		}

		return {
			library,
			external: [] as Array<{
				foreignId: string;
				title: string;
				subtitle: string;
				entityType: "book" | "movie" | "episode";
			}>,
		};
	});
