import { db } from "src/db";
import { history } from "src/db/schema";
import { lt } from "drizzle-orm";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

registerTask({
  id: "housekeeping",
  name: "Housekeeping",
  description: "Clean up old history records and optimize the database.",
  defaultInterval: 24 * 60 * 60, // 24 hours
  handler: async (): Promise<TaskResult> => {
    // Delete history older than 90 days
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const deleted = db
      .delete(history)
      .where(lt(history.date, cutoff))
      .returning({ id: history.id })
      .all();

    // Optimize the database
    db.$client.run("PRAGMA optimize");

    return {
      success: true,
      message: `Cleaned ${deleted.length} old history record(s), optimized database`,
    };
  },
});
