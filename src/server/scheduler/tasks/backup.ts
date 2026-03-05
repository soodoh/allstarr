import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "src/db";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

const MAX_BACKUPS = 5;

registerTask({
  id: "backup",
  name: "Backup Database",
  description: "Create a backup of the SQLite database file.",
  defaultInterval: 7 * 24 * 60 * 60, // 7 days
  handler: async (): Promise<TaskResult> => {
    const dbPath = process.env.DATABASE_URL || "data/sqlite.db";
    const backupDir = path.join(path.dirname(dbPath), "backups");

    if (!fs.existsSync(dbPath)) {
      return { success: false, message: "Database file not found" };
    }

    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `allstarr_${timestamp}.db`);

    // Use SQLite VACUUM INTO for a consistent copy
    db.$client.run(`VACUUM INTO '${backupPath}'`);

    // Clean up old backups, keep only MAX_BACKUPS most recent
    const backups = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("allstarr_") && f.endsWith(".db"))
      .toSorted()
      .toReversed();

    for (const old of backups.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(backupDir, old));
    }

    return {
      success: true,
      message: `Backup created: ${path.basename(backupPath)}`,
    };
  },
});
