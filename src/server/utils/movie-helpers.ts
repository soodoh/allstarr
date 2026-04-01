import { TMDB_IMAGE_BASE } from "../tmdb/types";

export type MovieStatus =
	| "tba"
	| "announced"
	| "inCinemas"
	| "released"
	| "deleted"
	| "canceled";

export function mapMovieStatus(tmdbStatus: string): MovieStatus {
	switch (tmdbStatus) {
		case "Rumored":
		case "Planned": {
			return "tba";
		}
		case "In Production":
		case "Post Production": {
			return "announced";
		}
		case "Released": {
			return "released";
		}
		case "Canceled": {
			return "canceled";
		}
		default: {
			return "announced";
		}
	}
}

export function transformImagePath(
	path: string | null,
	size: string,
): string | null {
	return path === null ? null : `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function generateSortTitle(title: string): string {
	return title.replace(/^(The|A|An)\s+/i, "");
}
