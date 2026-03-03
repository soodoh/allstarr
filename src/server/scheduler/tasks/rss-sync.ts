// oxlint-disable no-console -- Scheduler task logs are intentional server-side diagnostics
import { runAutoSearch } from "src/server/auto-search";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

registerTask({
  id: "rss-sync",
  name: "RSS Sync",
  description: "Sync RSS feeds from indexers and search for wanted books.",
  defaultInterval: 15 * 60, // 15 minutes
  handler: async (): Promise<TaskResult> => {
    const result = await runAutoSearch({ delayBetweenBooks: 2000 });

    if (result.searched === 0) {
      return { success: true, message: "No wanted books to search" };
    }

    const parts: string[] = [`${plural(result.searched, "book")} searched`];

    if (result.grabbed > 0) {
      parts.push(`${plural(result.grabbed, "release")} grabbed`);
    }
    if (result.errors > 0) {
      parts.push(`${plural(result.errors, "error")}`);
    }

    return {
      success: result.errors === 0,
      message: parts.join(", "),
    };
  },
});
