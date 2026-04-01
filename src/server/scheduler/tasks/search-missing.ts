import { eq } from "drizzle-orm";
import { db } from "src/db";
import { indexers, syncedIndexers } from "src/db/schema";
import { runAutoSearch } from "src/server/auto-search";
import { anyIndexerAvailable } from "../../indexer-rate-limiter";
import type { TaskResult } from "../registry";
import { registerTask } from "../registry";

function plural(count: number, singular: string): string {
	return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

registerTask({
	id: "search-missing",
	name: "Search for Missing",
	description:
		"Search indexers for all wanted items across books, movies, TV shows, and manga.",
	defaultInterval: 24 * 60 * 60, // 24 hours
	group: "search",
	handler: async (updateProgress): Promise<TaskResult> => {
		// Check for search-enabled indexers using enableAutomaticSearch
		const enabledManual = db
			.select({ id: indexers.id })
			.from(indexers)
			.where(eq(indexers.enableAutomaticSearch, true))
			.all();
		const enabledSynced = db
			.select({ id: syncedIndexers.id })
			.from(syncedIndexers)
			.where(eq(syncedIndexers.enableAutomaticSearch, true))
			.all();

		if (enabledManual.length === 0 && enabledSynced.length === 0) {
			return {
				success: true,
				message: "No search-enabled indexers configured",
			};
		}

		if (
			!anyIndexerAvailable(
				enabledManual.map((m) => m.id),
				enabledSynced.map((s) => s.id),
			)
		) {
			return {
				success: true,
				message: "All indexers in backoff or exhausted, skipping cycle",
			};
		}

		updateProgress("Searching for wanted items...");
		const result = await runAutoSearch({ delayBetweenBooks: 2000 });

		if (result.searched === 0) {
			return { success: true, message: "No wanted items to search" };
		}

		// Build content-type-agnostic summary
		const typeParts: string[] = [];
		const bookCount = result.details.filter((d) => d.searched).length;
		const movieCount = (result.movieDetails ?? []).filter(
			(d) => d.searched,
		).length;
		const episodeCount = (result.episodeDetails ?? []).filter(
			(d) => d.searched,
		).length;
		const mangaCount = (result.mangaDetails ?? []).filter(
			(d) => d.searched,
		).length;

		if (bookCount > 0) {
			typeParts.push(plural(bookCount, "book"));
		}
		if (movieCount > 0) {
			typeParts.push(plural(movieCount, "movie"));
		}
		if (episodeCount > 0) {
			typeParts.push(plural(episodeCount, "episode"));
		}
		if (mangaCount > 0) {
			typeParts.push(plural(mangaCount, "chapter"));
		}

		const searched =
			typeParts.length > 0
				? `Searched ${typeParts.join(", ")}`
				: `Searched ${result.searched} items`;

		const extras: string[] = [];
		if (result.grabbed > 0) {
			extras.push(`${plural(result.grabbed, "release")} grabbed`);
		}
		if (result.errors > 0) {
			extras.push(plural(result.errors, "error"));
		}

		const message =
			extras.length > 0 ? `${searched} — ${extras.join(", ")}` : searched;

		return { success: result.errors === 0, message };
	},
});
