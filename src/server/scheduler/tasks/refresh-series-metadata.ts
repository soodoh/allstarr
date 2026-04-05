import { refreshSeriesInternal } from "src/server/series";
import type { TaskResult } from "../registry";
import { registerTask } from "../registry";

registerTask({
	id: "refresh-series-metadata",
	name: "Refresh Series Metadata",
	description:
		"Refresh metadata for all monitored book series from Hardcover. Discovers and imports new books and authors.",
	defaultInterval: 12 * 60 * 60, // 12 hours
	group: "metadata",
	handler: async (_updateProgress): Promise<TaskResult> => {
		const result = await refreshSeriesInternal();

		if (result.seriesRefreshed === 0) {
			return { success: true, message: "No monitored series" };
		}

		const parts: string[] = [];
		parts.push(`${result.seriesRefreshed} series`);
		if (result.booksAdded > 0) {
			parts.push(`${result.booksAdded} books added`);
		}
		if (result.authorsImported > 0) {
			parts.push(`${result.authorsImported} authors imported`);
		}
		if (result.errors.length > 0) {
			parts.push(`${result.errors.length} errors`);
		}

		return {
			success: result.errors.length === 0,
			message: `Refreshed ${parts.join(", ")}`,
		};
	},
});
