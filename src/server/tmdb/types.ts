// Search results
export type TmdbSearchResult = TmdbMovieResult | TmdbTvResult;

export type TmdbMovieResult = {
	media_type: "movie";
	id: number;
	title: string;
	original_title: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	release_date: string;
	genre_ids: number[];
	popularity: number;
	vote_average: number;
	adult: boolean;
};

export type TmdbTvResult = {
	media_type: "tv";
	id: number;
	name: string;
	original_name: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	first_air_date: string;
	genre_ids: number[];
	popularity: number;
	vote_average: number;
	origin_country: string[];
};

// Show detail
export type TmdbShowDetail = {
	id: number;
	name: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	first_air_date: string;
	last_air_date: string;
	status: string;
	type: string;
	networks: Array<{ id: number; name: string }>;
	genres: Array<{ id: number; name: string }>;
	number_of_seasons: number;
	number_of_episodes: number;
	episode_run_time: number[];
	seasons: TmdbSeasonSummary[];
	external_ids?: { imdb_id: string | null };
};

export type TmdbSeasonSummary = {
	id: number;
	season_number: number;
	name: string;
	overview: string;
	poster_path: string | null;
	episode_count: number;
	air_date: string | null;
};

export type TmdbSeasonDetail = {
	id: number;
	season_number: number;
	name: string;
	overview: string;
	poster_path: string | null;
	episodes: TmdbEpisode[];
};

export type TmdbEpisode = {
	id: number;
	episode_number: number;
	name: string;
	overview: string;
	air_date: string | null;
	runtime: number | null;
	still_path: string | null;
	vote_average: number;
};

// Movie detail
export type TmdbMovieDetail = {
	id: number;
	title: string;
	original_title: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	release_date: string;
	status: string;
	runtime: number | null;
	genres: Array<{ id: number; name: string }>;
	production_companies: Array<{ id: number; name: string }>;
	imdb_id: string | null;
	budget: number;
	revenue: number;
	vote_average: number;
	belongs_to_collection: {
		id: number;
		name: string;
		poster_path: string | null;
		backdrop_path: string | null;
	} | null;
};

// Collection detail
export type TmdbCollectionDetail = {
	id: number;
	name: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	parts: Array<{
		id: number;
		title: string;
		overview: string;
		poster_path: string | null;
		backdrop_path: string | null;
		release_date: string;
		adult: boolean;
	}>;
};

// Paginated response
export type TmdbPaginatedResponse<T> = {
	page: number;
	results: T[];
	total_pages: number;
	total_results: number;
};

// Episode group types
export const EPISODE_GROUP_TYPES = {
	1: "Original Air Date",
	2: "Absolute",
	3: "DVD",
	4: "Digital",
	5: "Story Arc",
	6: "Production",
	7: "TV",
} as const;

export type EpisodeGroupType = keyof typeof EPISODE_GROUP_TYPES;

export type TmdbEpisodeGroupSummary = {
	id: string; // 24-char hex string
	name: string;
	description: string;
	episode_count: number;
	group_count: number;
	type: EpisodeGroupType;
	network: { id: number; name: string; origin_country: string } | null;
};

export type TmdbEpisodeGroupsResponse = {
	results: TmdbEpisodeGroupSummary[];
	id: number;
};

export type TmdbEpisodeGroupDetail = {
	id: string;
	name: string;
	description: string;
	episode_count: number;
	group_count: number;
	type: EpisodeGroupType;
	network: { id: number; name: string; origin_country: string } | null;
	groups: TmdbEpisodeGroup[];
};

export type TmdbEpisodeGroup = {
	id: string;
	name: string;
	order: number;
	locked: boolean;
	episodes: TmdbEpisodeGroupEpisode[];
};

export type TmdbEpisodeGroupEpisode = {
	id: number; // canonical TMDB episode ID
	name: string;
	overview: string;
	air_date: string | null;
	episode_number: number; // canonical episode number
	season_number: number; // canonical season number
	show_id: number;
	still_path: string | null;
	runtime: number | null;
	vote_average: number;
	order: number; // position within this group (0-indexed)
};

// Image base URL
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
