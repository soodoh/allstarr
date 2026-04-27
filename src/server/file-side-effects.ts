import fs from "node:fs";

export type FileSideEffectCleanupFailure = {
	path: string;
	error: unknown;
};

type FileSideEffectRecorderOptions = {
	removeFile?: (filePath: string) => void;
};

export type FileSideEffectRecorder = {
	recordCreatedFile: (filePath: string) => void;
	recordCleanup: (label: string, cleanup: () => void) => void;
	rollbackCreatedFile: (
		filePath: string,
	) => FileSideEffectCleanupFailure | null;
	commit: () => void;
	cleanup: () => FileSideEffectCleanupFailure[];
};

export function createFileSideEffectRecorder(
	options: FileSideEffectRecorderOptions = {},
): FileSideEffectRecorder {
	const removeFile = options.removeFile ?? fs.unlinkSync;
	const createdFiles: string[] = [];
	const cleanupActions: Array<{ label: string; cleanup: () => void }> = [];
	let committed = false;
	let cleaned = false;

	return {
		recordCreatedFile(filePath) {
			if (!committed && !cleaned) {
				createdFiles.push(filePath);
			}
		},
		recordCleanup(label, cleanup) {
			if (!committed && !cleaned) {
				cleanupActions.push({ label, cleanup });
			}
		},
		rollbackCreatedFile(filePath) {
			const index = createdFiles.lastIndexOf(filePath);
			if (index === -1) {
				return null;
			}
			createdFiles.splice(index, 1);
			try {
				removeFile(filePath);
				return null;
			} catch (error) {
				return { path: filePath, error };
			}
		},
		commit() {
			committed = true;
			createdFiles.length = 0;
			cleanupActions.length = 0;
		},
		cleanup() {
			if (committed || cleaned) {
				return [];
			}
			cleaned = true;
			const failures: FileSideEffectCleanupFailure[] = [];
			let cleanupActionFailed = false;
			for (const action of cleanupActions.toReversed()) {
				try {
					action.cleanup();
				} catch (error) {
					cleanupActionFailed = true;
					failures.push({ path: action.label, error });
				}
			}
			if (!cleanupActionFailed) {
				for (const filePath of createdFiles.toReversed()) {
					try {
						removeFile(filePath);
					} catch (error) {
						failures.push({ path: filePath, error });
					}
				}
			}
			createdFiles.length = 0;
			cleanupActions.length = 0;
			return failures;
		},
	};
}
