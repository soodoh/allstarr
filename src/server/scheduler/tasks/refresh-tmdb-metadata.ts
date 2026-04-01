import { sql } from "drizzle-orm";
import { db } from "src/db";
import {
	episodeDownloadProfiles,
	episodes,
	movieDownloadProfiles,
	movies,
	shows,
} from "src/db/schema";
import { refreshMovieInternal } from "src/server/movies";
import { refreshShowInternal } from "src/server/shows";
import type { TaskResult } from "../registry";
import { registerTask } from "../registry";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function plural(count: number, singular: string): string {
	return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

registerTask({
	id: "refresh-tmdb-metadata",
	name: "Refresh TMDB Metadata",
	description: "Refresh metadata for all monitored movies and shows from TMDB.",
	defaultInterval: 12 * 60 * 60, // 12 hours
	group: "metadata",
	handler: async (updateProgress): Promise<TaskResult> => {
		// Find monitored movies (those with at least one download profile)
		const monitoredMovies = db
			.select({ id: movies.id, title: movies.title })
			.from(movies)
			.where(
				sql`EXISTS (
          SELECT 1 FROM ${movieDownloadProfiles}
          WHERE ${movieDownloadProfiles.movieId} = ${movies.id}
        )`,
			)
			.all();

		// Find monitored shows (those with at least one episode that has a download profile)
		const monitoredShows = db
			.select({ id: shows.id, title: shows.title })
			.from(shows)
			.where(
				sql`EXISTS (
          SELECT 1 FROM ${episodeDownloadProfiles}
          INNER JOIN ${episodes} ON ${episodes.id} = ${episodeDownloadProfiles.episodeId}
          WHERE ${episodes.showId} = ${shows.id}
        )`,
			)
			.all();

		const totalItems = monitoredMovies.length + monitoredShows.length;

		if (totalItems === 0) {
			return { success: true, message: "No monitored movies or shows" };
		}

		let moviesRefreshed = 0;
		let movieErrors = 0;
		let showsRefreshed = 0;
		let showErrors = 0;
		let totalNewEpisodes = 0;
		let completed = 0;

		// Refresh movies
		for (const movie of monitoredMovies) {
			try {
				await refreshMovieInternal(movie.id);
				moviesRefreshed += 1;
			} catch (error) {
				console.error(
					`[refresh-tmdb-metadata] Failed to refresh movie "${movie.title}" (id=${movie.id}):`,
					error,
				);
				movieErrors += 1;
			}

			completed += 1;
			updateProgress(completed, totalItems);

			if (completed < totalItems) {
				await sleep(1000);
			}
		}

		// Refresh shows
		for (const show of monitoredShows) {
			try {
				const result = await refreshShowInternal(show.id);
				showsRefreshed += 1;
				totalNewEpisodes += result.newEpisodes;
			} catch (error) {
				console.error(
					`[refresh-tmdb-metadata] Failed to refresh show "${show.title}" (id=${show.id}):`,
					error,
				);
				showErrors += 1;
			}

			completed += 1;
			updateProgress(completed, totalItems);

			if (completed < totalItems) {
				await sleep(1000);
			}
		}

		const totalErrors = movieErrors + showErrors;
		const parts: string[] = [];

		if (moviesRefreshed > 0) {
			parts.push(plural(moviesRefreshed, "movie"));
		}
		if (showsRefreshed > 0) {
			parts.push(plural(showsRefreshed, "show"));
		}
		if (totalNewEpisodes > 0) {
			parts.push(`${plural(totalNewEpisodes, "new episode")}`);
		}
		if (totalErrors > 0) {
			parts.push(plural(totalErrors, "error"));
		}

		return {
			success: totalErrors === 0,
			message:
				parts.length > 0
					? `Refreshed ${parts.join(", ")}`
					: "No metadata changes",
		};
	},
});
