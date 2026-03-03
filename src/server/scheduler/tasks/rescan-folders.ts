import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

registerTask({
  id: "rescan-folders",
  name: "Rescan Folders",
  description: "Scan root folders for new, changed, or removed book files.",
  defaultInterval: 6 * 60 * 60, // 6 hours
  handler: async (): Promise<TaskResult> => {
    // Stub — requires file scanning infrastructure
    return {
      success: true,
      message: "Folder scanning not yet implemented",
    };
  },
});
