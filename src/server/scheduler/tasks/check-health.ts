import { db } from "src/db";
import {
  rootFolders,
  indexers,
  syncedIndexers,
  downloadClients,
  settings,
} from "src/db/schema";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

function runHealthChecks(): number {
  let issues = 0;

  const folders = db.select().from(rootFolders).all();
  if (folders.length === 0) {
    issues += 1;
  } else {
    for (const folder of folders) {
      try {
        // oxlint-disable-next-line no-bitwise
        fs.accessSync(folder.path, fs.constants.R_OK | fs.constants.W_OK);
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

  const tokenSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "hardcoverToken"))
    .get();
  const hasToken =
    (tokenSetting && tokenSetting.value) || process.env.HARDCOVER_TOKEN;
  if (!hasToken) {
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
