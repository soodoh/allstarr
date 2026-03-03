// oxlint-disable no-console -- Scheduler task logs are intentional server-side diagnostics
import { db } from "src/db";
import { rootFolders } from "src/db/schema";
import { rescanRootFolder } from "src/server/disk-scan";
import type { ScanStats } from "src/server/disk-scan";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

registerTask({
  id: "rescan-folders",
  name: "Rescan Folders",
  description: "Scan root folders for new, changed, or removed book files.",
  defaultInterval: 6 * 60 * 60, // 6 hours
  handler: async (): Promise<TaskResult> => {
    const folders = db.select().from(rootFolders).all();

    if (folders.length === 0) {
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

    for (const folder of folders) {
      try {
        const result = rescanRootFolder(folder.path);
        totals.filesAdded += result.filesAdded;
        totals.filesRemoved += result.filesRemoved;
        totals.filesUnchanged += result.filesUnchanged;
        totals.filesUpdated += result.filesUpdated;
        totals.unmatchedFiles += result.unmatchedFiles;
        totals.errors.push(...result.errors);
      } catch (error) {
        console.error(
          `[rescan-folders] Failed to scan folder "${folder.path}":`,
          error,
        );
        totals.errors.push(
          `Failed to scan ${folder.path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const parts: string[] = [`Scanned ${plural(folders.length, "folder")}`];
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
