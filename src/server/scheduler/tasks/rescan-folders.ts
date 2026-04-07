import type { ScanStats } from "src/server/disk-scan";
import { getRootFolderPaths, rescanRootFolder } from "src/server/disk-scan";
import { logError } from "src/server/logger";
import type { TaskResult } from "../registry";
import { registerTask } from "../registry";

function plural(count: number, singular: string): string {
	return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

registerTask({
	id: "rescan-folders",
	name: "Rescan Folders",
	description: "Scan root folders for new, changed, or removed book files.",
	defaultInterval: 6 * 60 * 60, // 6 hours
	group: "media",
	handler: async (_updateProgress): Promise<TaskResult> => {
		const folderPaths = getRootFolderPaths();

		if (folderPaths.length === 0) {
			return { success: true, message: "No root folders configured" };
		}

		const totals: ScanStats = {
			filesAdded: 0,
			filesRemoved: 0,
			filesUnchanged: 0,
			filesUpdated: 0,
			unmatchedFiles: 0,
			errors: [],
		};

		for (const folderPath of folderPaths) {
			try {
				const result = await rescanRootFolder(folderPath);
				totals.filesAdded += result.filesAdded;
				totals.filesRemoved += result.filesRemoved;
				totals.filesUnchanged += result.filesUnchanged;
				totals.filesUpdated += result.filesUpdated;
				totals.unmatchedFiles += result.unmatchedFiles;
				totals.errors.push(...result.errors);
			} catch (error) {
				logError(
					"rescan-folders",
					`Failed to scan folder "${folderPath}"`,
					error,
				);
				totals.errors.push(
					`Failed to scan ${folderPath}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		const parts: string[] = [`Scanned ${plural(folderPaths.length, "folder")}`];
		if (totals.filesAdded > 0) {
			parts.push(`${plural(totals.filesAdded, "file")} added`);
		}
		if (totals.filesRemoved > 0) {
			parts.push(`${plural(totals.filesRemoved, "file")} removed`);
		}
		if (totals.filesUpdated > 0) {
			parts.push(`${plural(totals.filesUpdated, "file")} updated`);
		}
		if (totals.filesUnchanged > 0) {
			parts.push(`${plural(totals.filesUnchanged, "file")} unchanged`);
		}
		if (totals.unmatchedFiles > 0) {
			parts.push(`${plural(totals.unmatchedFiles, "unmatched file")}`);
		}
		if (totals.errors.length > 0) {
			parts.push(`${plural(totals.errors.length, "error")}`);
		}

		const hasChanges =
			totals.filesAdded > 0 ||
			totals.filesRemoved > 0 ||
			totals.filesUpdated > 0;

		return {
			success: totals.errors.length === 0,
			message: hasChanges ? parts.join(", ") : "No changes detected",
		};
	},
});
