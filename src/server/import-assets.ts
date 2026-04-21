import * as path from "node:path";

export type ImportAssetKind = "file" | "directory";
export type ImportAssetOwnershipReason =
	| "direct"
	| "token"
	| "nested"
	| "container";
export type ImportAssetAction = "move" | "delete" | "ignore";

export type ImportAssetSelection = {
	action: ImportAssetAction;
	destinationRelativePath: string;
	kind: ImportAssetKind;
	ownershipReason: ImportAssetOwnershipReason;
	relativeSourcePath: string;
	selected: boolean;
	sourcePath: string;
};

export type ImportAssetRowInput = {
	contentType: "audiobook" | "book" | "movie" | "tv";
	destinationContainerRoot: string;
	destinationPath: string;
	rowId: string;
	sourceContainerRoot: string;
	sourcePath: string;
};

export type ImportAssetRow = ImportAssetRowInput & {
	assets: ImportAssetSelection[];
};

export type AssetOperation = {
	from: string;
	kind: ImportAssetKind;
	to: string;
};

export type AssetDeleteOperation = {
	kind: ImportAssetKind;
	path: string;
};

const TV_EPISODE_PATTERN = /S(\d{1,2})E(\d{1,3})/i;

function naturalSort(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function stripExtension(filename: string): string {
	const extension = path.extname(filename);
	return extension.length > 0 ? filename.slice(0, -extension.length) : filename;
}

function normalizePath(value: string): string {
	return path.normalize(value).replace(/\\/g, "/");
}

function startsWithPath(parent: string, child: string): boolean {
	const normalizedParent = normalizePath(parent).replace(/\/+$/, "");
	const normalizedChild = normalizePath(child);
	return (
		normalizedChild === normalizedParent ||
		normalizedChild.startsWith(`${normalizedParent}/`)
	);
}

function getEpisodeToken(filePath: string): string | null {
	const basename = path.basename(filePath);
	const match = basename.match(TV_EPISODE_PATTERN);
	return match ? match[0].toUpperCase() : null;
}

function matchesStemPrefix(assetBaseName: string, sourceStem: string): boolean {
	if (!assetBaseName.toLowerCase().startsWith(sourceStem.toLowerCase())) {
		return false;
	}

	if (assetBaseName.length === sourceStem.length) {
		return true;
	}

	return /[ ._-]/.test(assetBaseName[sourceStem.length] ?? "");
}

function collapseAssetRoot(filePath: string): {
	kind: ImportAssetKind;
	rootPath: string;
} {
	const normalized = normalizePath(filePath);
	const trickplayIndex = normalized.toLowerCase().indexOf(".trickplay/");
	if (trickplayIndex >= 0) {
		return {
			kind: "directory",
			rootPath: normalized.slice(0, trickplayIndex + ".trickplay".length),
		};
	}

	return {
		kind: "file",
		rootPath: normalized,
	};
}

function replaceStemPrefix(
	assetBaseName: string,
	sourceStem: string,
	destinationStem: string,
): string {
	if (!matchesStemPrefix(assetBaseName, sourceStem)) {
		return assetBaseName;
	}

	return `${destinationStem}${assetBaseName.slice(sourceStem.length)}`;
}

function remapTvRelativePath(
	relativePath: string,
	row: ImportAssetRowInput,
): string {
	if (row.contentType !== "tv") {
		const normalized = normalizePath(relativePath);
		return normalized === "." ? "" : normalized;
	}

	const normalizedRelativePath = normalizePath(relativePath);
	const sourceRelativeDirectory = normalizePath(
		path.relative(row.sourceContainerRoot, path.dirname(row.sourcePath)),
	);
	const destinationRelativeDirectory = normalizePath(
		path.relative(
			row.destinationContainerRoot,
			path.dirname(row.destinationPath),
		),
	);

	if (sourceRelativeDirectory === "" || sourceRelativeDirectory === ".") {
		return normalizedRelativePath === "." ? "" : normalizedRelativePath;
	}

	if (normalizedRelativePath === sourceRelativeDirectory) {
		return destinationRelativeDirectory === "."
			? ""
			: destinationRelativeDirectory;
	}

	if (!normalizedRelativePath.startsWith(`${sourceRelativeDirectory}/`)) {
		return normalizedRelativePath;
	}

	const suffix = normalizedRelativePath.slice(
		sourceRelativeDirectory.length + 1,
	);
	if (
		destinationRelativeDirectory === "" ||
		destinationRelativeDirectory === "."
	) {
		return suffix;
	}

	return `${destinationRelativeDirectory}/${suffix}`;
}

function getDestinationPrimaryRelativeDir(row: ImportAssetRowInput): string {
	const relativeDirectory = normalizePath(
		path.relative(
			row.destinationContainerRoot,
			path.dirname(row.destinationPath),
		),
	);
	return relativeDirectory === "." ? "" : relativeDirectory;
}

function computeMatch(
	assetPath: string,
	assetKind: ImportAssetKind,
	row: ImportAssetRowInput,
): {
	destinationRelativePath: string;
	ownershipReason: ImportAssetOwnershipReason;
	proximity: number;
	score: number;
} | null {
	if (!startsWithPath(row.sourceContainerRoot, assetPath)) {
		return null;
	}

	const sourceStem = stripExtension(path.basename(row.sourcePath));
	const destinationStem = stripExtension(path.basename(row.destinationPath));
	const assetBaseName = path.basename(assetPath);
	const assetStem = stripExtension(assetBaseName);
	const assetDir = path.dirname(assetPath);
	const destinationRelativeDir = getDestinationPrimaryRelativeDir(row);
	const assetRelativeDirPrefix =
		destinationRelativeDir === "" ? "" : `${destinationRelativeDir}/`;
	const sourceToken = getEpisodeToken(row.sourcePath);
	const assetToken = getEpisodeToken(assetPath);

	const commonPrefixLength = normalizePath(assetPath)
		.split("/")
		.filter(
			(segment, index, _segments) =>
				row.sourcePath.split("/")[index] === segment,
		)
		.join("/").length;

	if (
		assetKind === "directory" &&
		assetDir === path.dirname(row.sourcePath) &&
		matchesStemPrefix(assetBaseName, sourceStem)
	) {
		const renamedBaseName = replaceStemPrefix(
			assetBaseName,
			sourceStem,
			destinationStem,
		);
		return {
			ownershipReason: "nested",
			score: 3,
			proximity: commonPrefixLength,
			destinationRelativePath:
				destinationRelativeDir === ""
					? renamedBaseName
					: `${destinationRelativeDir}/${renamedBaseName}`,
		};
	}

	if (
		assetDir === path.dirname(row.sourcePath) &&
		matchesStemPrefix(assetStem, sourceStem)
	) {
		return {
			ownershipReason: "direct",
			score: 4,
			proximity: commonPrefixLength,
			destinationRelativePath: `${assetRelativeDirPrefix}${replaceStemPrefix(assetBaseName, sourceStem, destinationStem)}`,
		};
	}

	if (
		sourceToken != null &&
		assetToken != null &&
		sourceToken === assetToken &&
		assetDir === path.dirname(row.sourcePath)
	) {
		return {
			ownershipReason: "token",
			score: 2,
			proximity: commonPrefixLength,
			destinationRelativePath: `${assetRelativeDirPrefix}${replaceStemPrefix(assetBaseName, sourceStem, destinationStem)}`,
		};
	}

	return {
		ownershipReason: "container",
		score: 1,
		proximity: commonPrefixLength,
		destinationRelativePath: remapTvRelativePath(
			path.relative(row.sourceContainerRoot, assetPath),
			row,
		),
	};
}

export function assignImportAssets({
	rows,
	discoveredPaths,
}: {
	discoveredPaths: string[];
	rows: ImportAssetRowInput[];
}): { rows: ImportAssetRow[]; unrelatedPaths: string[] } {
	const preparedRows: ImportAssetRow[] = rows.map((row) => ({
		...row,
		assets: [],
	}));
	const unrelatedPaths: string[] = [];
	const groupedRoots = new Map<string, ImportAssetKind>();

	for (const filePath of discoveredPaths) {
		const asset = collapseAssetRoot(filePath);
		groupedRoots.set(asset.rootPath, asset.kind);
	}

	for (const [rootPath, kind] of [...groupedRoots.entries()].sort((a, b) =>
		naturalSort(a[0], b[0]),
	)) {
		const candidates = preparedRows
			.map((row) => ({
				row,
				match: computeMatch(rootPath, kind, row),
			}))
			.filter(
				(
					entry,
				): entry is {
					match: NonNullable<ReturnType<typeof computeMatch>>;
					row: ImportAssetRow;
				} => entry.match != null,
			);

		if (candidates.length === 0) {
			unrelatedPaths.push(rootPath);
			continue;
		}

		const bestScore = Math.max(
			...candidates.map((candidate) => candidate.match.score),
		);
		const bestScoreCandidates = candidates.filter(
			(candidate) => candidate.match.score === bestScore,
		);
		const bestProximity = Math.max(
			...bestScoreCandidates.map((candidate) => candidate.match.proximity),
		);
		const winners = bestScoreCandidates.filter(
			(candidate) => candidate.match.proximity === bestProximity,
		);

		if (winners.length !== 1) {
			if (
				bestScore === 1 &&
				winners.every((winner) => winner.row.contentType === "tv")
			) {
				winners.sort((left, right) =>
					naturalSort(left.row.sourcePath, right.row.sourcePath),
				);
			} else {
				unrelatedPaths.push(rootPath);
				continue;
			}
		}

		if (winners.length === 0) {
			unrelatedPaths.push(rootPath);
			continue;
		}

		const winner = winners[0];
		winner.row.assets.push({
			sourcePath: rootPath,
			relativeSourcePath: path.relative(
				winner.row.sourceContainerRoot,
				rootPath,
			),
			destinationRelativePath: winner.match.destinationRelativePath,
			kind,
			selected: true,
			action: "move",
			ownershipReason: winner.match.ownershipReason,
		});
	}

	for (const row of preparedRows) {
		row.assets.sort((left, right) =>
			naturalSort(left.sourcePath, right.sourcePath),
		);
	}

	return {
		rows: preparedRows,
		unrelatedPaths: unrelatedPaths.sort(naturalSort),
	};
}

export function buildAssetOperations({
	row,
	deleteDeselectedAssets,
}: {
	deleteDeselectedAssets: boolean;
	row: ImportAssetRow;
}): {
	deletes: AssetDeleteOperation[];
	moves: AssetOperation[];
	pruneDirectories: string[];
	stopAt: string;
} {
	const moves: AssetOperation[] = [];
	const deletes: AssetDeleteOperation[] = [];
	const pruneDirectories = new Set<string>();

	for (const asset of row.assets) {
		if (asset.action === "move" && asset.selected) {
			moves.push({
				from: asset.sourcePath,
				to: path.join(
					row.destinationContainerRoot,
					asset.destinationRelativePath,
				),
				kind: asset.kind,
			});
			pruneDirectories.add(path.dirname(asset.sourcePath));
			continue;
		}

		if (
			asset.action === "delete" ||
			(deleteDeselectedAssets && !asset.selected && asset.action !== "ignore")
		) {
			deletes.push({
				path: asset.sourcePath,
				kind: asset.kind,
			});
			pruneDirectories.add(path.dirname(asset.sourcePath));
		}
	}

	return {
		moves,
		deletes,
		pruneDirectories: [...pruneDirectories].sort(naturalSort),
		stopAt: row.sourceContainerRoot,
	};
}

export function pruneEmptyDirectories({
	startDirectories,
	stopAt,
	listEntries,
	removeDirectory,
}: {
	listEntries: (dir: string) => string[];
	removeDirectory: (dir: string) => void;
	startDirectories: string[];
	stopAt: string;
}): void {
	const normalizedStopAt = normalizePath(stopAt);
	const seen = new Set<string>();

	for (const rawStartDirectory of startDirectories) {
		let currentDirectory = normalizePath(rawStartDirectory);

		while (
			currentDirectory !== normalizedStopAt &&
			startsWithPath(normalizedStopAt, currentDirectory) &&
			!seen.has(currentDirectory)
		) {
			seen.add(currentDirectory);

			if (listEntries(currentDirectory).length > 0) {
				break;
			}

			removeDirectory(currentDirectory);
			currentDirectory = normalizePath(path.dirname(currentDirectory));
		}
	}
}
