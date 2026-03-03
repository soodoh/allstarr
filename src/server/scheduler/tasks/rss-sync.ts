import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

registerTask({
  id: "rss-sync",
  name: "RSS Sync",
  description: "Sync RSS feeds from indexers and search for wanted books.",
  defaultInterval: 15 * 60, // 15 minutes
  handler: async (): Promise<TaskResult> => {
    // Stub — requires automated search infrastructure
    return {
      success: true,
      message: "RSS sync not yet implemented",
    };
  },
});
