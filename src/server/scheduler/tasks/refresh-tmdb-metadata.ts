// oxlint-disable no-console -- Scheduler task logs are intentional server-side diagnostics
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

registerTask({
  id: "refresh-tmdb-metadata",
  name: "Refresh TMDB Metadata",
  description: "Refresh metadata for all monitored movies and shows from TMDB.",
  defaultInterval: 12 * 60 * 60, // 12 hours
  group: "metadata",
  handler: async (_updateProgress): Promise<TaskResult> => {
    console.log("TMDB metadata refresh: not yet implemented");
    return { success: true, message: "Not yet implemented" };
  },
});
