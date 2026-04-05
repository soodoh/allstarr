import type { ParsedPackInfo } from "./types";
import { ReleaseType } from "./types";

type ContentType = "tv" | "book";

type DetectionResult = {
	releaseType: ReleaseType;
	packInfo: ParsedPackInfo | null;
};

// TV patterns — ordered from most specific to least specific
const TV_MULTI_SEASON_RANGE = /S(\d{1,2})\s*-\s*S(\d{1,2})/i;
const TV_COMPLETE_SERIES = /\bcomplete[\s._-]+series\b/i;
const TV_MULTI_EPISODE_RANGE = /S(\d{1,2})E(\d{1,3})\s*-\s*E(\d{1,3})/i;
const TV_MULTI_EPISODE_CONCAT = /S(\d{1,2})((?:E\d{1,3}){2,})/i;
const TV_SINGLE_EPISODE = /S(\d{1,2})E(\d{1,3})/i;
const TV_SEASON_ONLY = /(?:^|[\s._-])S(\d{1,2})(?:[\s._-]|$)/i;
const TV_SEASON_WORD = /\b(?:Season|Saison|Series|Stagione)\s*(\d{1,2})\b/i;
const TV_DAILY = /\b\d{4}[._-]\d{2}[._-]\d{2}\b/;

// Book patterns
const BOOK_COMPLETE = /\bcomplete\s+(?:collection|works|series)\b/i;
const BOOK_COLLECTION = /\b(?:collection|anthology|omnibus)\b/i;
const BOOK_N_BOOKS = /\(\d+\s+books?\)/i;
const BOOK_SERIES = /\bseries\b/i;

function expandRange(start: number, end: number): number[] {
	const result: number[] = [];
	for (let i = start; i <= end; i += 1) {
		result.push(i);
	}
	return result;
}

function detectTvReleaseType(title: string): DetectionResult {
	// Multi-season range: S01-S03
	const multiSeasonMatch = title.match(TV_MULTI_SEASON_RANGE);
	if (multiSeasonMatch) {
		const start = Number.parseInt(multiSeasonMatch[1], 10);
		const end = Number.parseInt(multiSeasonMatch[2], 10);
		return {
			releaseType: ReleaseType.MultiSeasonPack,
			packInfo: { seasons: expandRange(start, end) },
		};
	}

	// Complete series (no specific seasons known)
	if (TV_COMPLETE_SERIES.test(title)) {
		return {
			releaseType: ReleaseType.MultiSeasonPack,
			packInfo: { seasons: [] },
		};
	}

	// Multi-episode range: S01E01-E03
	const multiEpRangeMatch = title.match(TV_MULTI_EPISODE_RANGE);
	if (multiEpRangeMatch) {
		const season = Number.parseInt(multiEpRangeMatch[1], 10);
		const epStart = Number.parseInt(multiEpRangeMatch[2], 10);
		const epEnd = Number.parseInt(multiEpRangeMatch[3], 10);
		return {
			releaseType: ReleaseType.MultiEpisode,
			packInfo: { seasons: [season], episodes: expandRange(epStart, epEnd) },
		};
	}

	// Multi-episode concatenated: S01E01E02E03
	const multiEpConcatMatch = title.match(TV_MULTI_EPISODE_CONCAT);
	if (multiEpConcatMatch) {
		const season = Number.parseInt(multiEpConcatMatch[1], 10);
		const epPart = multiEpConcatMatch[2];
		const episodes = [...epPart.matchAll(/E(\d{1,3})/gi)].map((m) =>
			Number.parseInt(m[1], 10),
		);
		return {
			releaseType: ReleaseType.MultiEpisode,
			packInfo: { seasons: [season], episodes },
		};
	}

	// Single episode: S01E01 (must come after multi-episode checks)
	if (TV_SINGLE_EPISODE.test(title)) {
		return { releaseType: ReleaseType.SingleEpisode, packInfo: null };
	}

	// Daily show: 2024.03.15
	if (TV_DAILY.test(title)) {
		return { releaseType: ReleaseType.SingleEpisode, packInfo: null };
	}

	// Season only: S01 (no episode number)
	const seasonOnlyMatch = title.match(TV_SEASON_ONLY);
	if (seasonOnlyMatch) {
		return {
			releaseType: ReleaseType.SeasonPack,
			packInfo: { seasons: [Number.parseInt(seasonOnlyMatch[1], 10)] },
		};
	}

	// Season word: "Season 2"
	const seasonWordMatch = title.match(TV_SEASON_WORD);
	if (seasonWordMatch) {
		return {
			releaseType: ReleaseType.SeasonPack,
			packInfo: { seasons: [Number.parseInt(seasonWordMatch[1], 10)] },
		};
	}

	return { releaseType: ReleaseType.Unknown, packInfo: null };
}

function detectBookReleaseType(title: string): DetectionResult {
	if (
		BOOK_COMPLETE.test(title) ||
		BOOK_COLLECTION.test(title) ||
		BOOK_N_BOOKS.test(title) ||
		BOOK_SERIES.test(title)
	) {
		return { releaseType: ReleaseType.AuthorPack, packInfo: {} };
	}

	return { releaseType: ReleaseType.SingleBook, packInfo: null };
}

export default function detectReleaseType(
	title: string,
	contentType: ContentType,
): DetectionResult {
	switch (contentType) {
		case "tv": {
			return detectTvReleaseType(title);
		}
		case "book": {
			return detectBookReleaseType(title);
		}
		default: {
			return { releaseType: ReleaseType.Unknown, packInfo: null };
		}
	}
}
