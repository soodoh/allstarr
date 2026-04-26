import path from "node:path";
import { logWarn as defaultLogWarn } from "src/server/logger";

export type MappingMoveKind = "file" | "directory";

export type MappingMoveOperation = {
	from: string;
	to: string;
	kind: MappingMoveKind;
};

type MappingFs = {
	existsSync: (target: string) => boolean;
	mkdirSync: (target: string, options?: { recursive?: boolean }) => unknown;
	renameSync: (from: string, to: string) => unknown;
};

type ExecuteMappingInput<TResult> = {
	fs: MappingFs;
	logLabel: string;
	logWarn?: (scope: string, message: string) => void;
	move: (helpers: {
		recordMove: (operation: MappingMoveOperation) => void;
	}) => void;
	runTransaction: () => TResult;
};

function movePathToManagedDestination(
	fs: MappingFs,
	from: string,
	to: string,
	_kind: MappingMoveKind,
): void {
	if (!fs.existsSync(from)) {
		return;
	}
	const parent = path.dirname(to);
	if (!fs.existsSync(parent)) {
		fs.mkdirSync(parent, { recursive: true });
	}
	fs.renameSync(from, to);
}

function rollbackMovedPaths({
	fs,
	logLabel,
	logWarn,
	movedPaths,
}: {
	fs: MappingFs;
	logLabel: string;
	logWarn: (scope: string, message: string) => void;
	movedPaths: MappingMoveOperation[];
}): void {
	for (const moved of [...movedPaths].reverse()) {
		try {
			movePathToManagedDestination(fs, moved.to, moved.from, moved.kind);
		} catch (rollbackError) {
			logWarn(
				"unmapped-files",
				`Failed to roll back ${logLabel} for ${moved.from}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
			);
		}
	}
}

export function executeMappingWithRollback<TResult>({
	fs,
	logLabel,
	logWarn = defaultLogWarn,
	move,
	runTransaction,
}: ExecuteMappingInput<TResult>): TResult {
	const movedPaths: MappingMoveOperation[] = [];
	const recordMove = (operation: MappingMoveOperation): void => {
		movedPaths.push(operation);
	};

	try {
		move({ recordMove });
		return runTransaction();
	} catch (error) {
		rollbackMovedPaths({ fs, logLabel, logWarn, movedPaths });
		throw error;
	}
}
