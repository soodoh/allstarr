import { eq } from "drizzle-orm";
import { db } from "src/db";
import { manga } from "src/db/schema";
import { refreshMangaInternal } from "src/server/manga-import";
import type { TaskResult } from "../registry";
import { registerTask } from "../registry";

registerTask({
	id: "refresh-manga-sources",
	name: "Refresh Manga Sources",
	description:
		"Refresh metadata and check for new chapters for all monitored manga from their assigned sources.",
	defaultInterval: 12 * 60 * 60, // 12 hours
	group: "metadata",
	handler: async (updateProgress): Promise<TaskResult> => {
		const monitoredManga = db
			.select({ id: manga.id, title: manga.title, sourceId: manga.sourceId })
			.from(manga)
			.where(eq(manga.monitored, true))
			.all();

		if (monitoredManga.length === 0) {
			return { success: true, message: "No monitored manga to refresh" };
		}

		let refreshed = 0;
		let errors = 0;
		let totalNewChapters = 0;

		for (const m of monitoredManga) {
			try {
				updateProgress(
					`Refreshing ${m.title} (${refreshed + 1}/${monitoredManga.length})`,
				);
				const result = await refreshMangaInternal(m.id);
				totalNewChapters += result.newChaptersAdded;
				refreshed += 1;
			} catch {
				errors += 1;
			}

			// Throttle: 1 second between manga
			if (refreshed + errors < monitoredManga.length) {
				await new Promise<void>((resolve) => {
					setTimeout(resolve, 1000);
				});
			}
		}

		return {
			success: errors === 0,
			message: `Refreshed ${refreshed}/${monitoredManga.length} manga, ${totalNewChapters} new chapters${errors > 0 ? `, ${errors} errors` : ""}`,
		};
	},
});
