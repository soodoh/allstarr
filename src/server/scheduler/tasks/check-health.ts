import { db } from "src/db";
import { indexers, syncedIndexers, downloadClients } from "src/db/schema";
import * as fs from "node:fs";
import { getRootFolderPaths } from "src/server/disk-scan";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

function runHealthChecks(): number {
  let issues = 0;

  const folderPaths = getRootFolderPaths();
  if (folderPaths.length === 0) {
    issues += 1;
  } else {
    for (const folderPath of folderPaths) {
      try {
        // oxlint-disable-next-line no-bitwise
        fs.accessSync(folderPath, fs.constants.R_OK | fs.constants.W_OK);
      } catch {
        issues += 1;
      }
    }
  }

  const allIndexers = db.select().from(indexers).all();
  const allSyncedIndexers = db.select().from(syncedIndexers).all();
  if (allIndexers.length === 0 && allSyncedIndexers.length === 0) {
    issues += 1;
  }

  const allClients = db.select().from(downloadClients).all();
  if (allClients.length === 0) {
    issues += 1;
  }

  if (!process.env.HARDCOVER_TOKEN) {
    issues += 1;
  }

  return issues;
}

registerTask({
  id: "check-health",
  name: "Check Health",
  description:
    "Verify system health including root folders, indexers, and download clients.",
  defaultInterval: 25 * 60, // 25 minutes
  handler: async (): Promise<TaskResult> => {
    const issues = runHealthChecks();
    return {
      success: true,
      message:
        issues === 0
          ? "All systems healthy"
          : `Found ${issues} health issue(s)`,
    };
  },
});
