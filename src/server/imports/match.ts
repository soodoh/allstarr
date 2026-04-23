import type { ImportSourceKind } from "./types";

export type MatchResult = {
	status: "matched" | "unresolved";
	confidence: "high" | "medium" | "low";
	targetId: number | null;
	reason: string;
};

type MovieCandidate = {
	tmdbId?: number | null;
	title: string;
	year?: number | null;
};

type ShowCandidate = {
	tmdbId?: number | null;
	tvdbId?: number | null;
	title: string;
	year?: number | null;
};

type BookCandidate = {
	foreignBookId?: string | null;
	title: string;
	authorName?: string | null;
	year?: number | null;
};

export type MatchContext = {
	moviesByTmdbId?: Map<number, { id: number }>;
	showsByTmdbId?: Map<number, { id: number }>;
	tvdbToTmdb?: Map<number, number>;
	booksByForeignBookId?: Map<string, { id: number }>;
	bookFingerprintToId?: Map<string, number>;
};

function normalizeTitle(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

export function buildBookFingerprint(candidate: BookCandidate): string {
	return [
		normalizeTitle(candidate.title),
		(candidate.authorName ?? "").toLowerCase().trim(),
		candidate.year?.toString() ?? "",
	]
		.join("|")
		.trim();
}

export function matchMovieCandidate(
	candidate: MovieCandidate,
	context: Pick<MatchContext, "moviesByTmdbId"> = {},
): MatchResult {
	if (candidate.tmdbId === null || candidate.tmdbId === undefined) {
		return {
			status: "unresolved",
			confidence: "low",
			targetId: null,
			reason: "Missing TMDB id for movie",
		};
	}

	const target = context.moviesByTmdbId?.get(candidate.tmdbId);
	if (!target) {
		return {
			status: "unresolved",
			confidence: "low",
			targetId: null,
			reason: `No existing TMDB target for movie ${candidate.title}`,
		};
	}

	return {
		status: "matched",
		confidence: "high",
		targetId: target.id,
		reason: `Matched movie by TMDB id ${candidate.tmdbId}`,
	};
}

export function matchSonarrShowCandidate(
	candidate: ShowCandidate,
	context: Pick<MatchContext, "showsByTmdbId" | "tvdbToTmdb"> = {},
): MatchResult {
	if (
		(candidate.tmdbId === null || candidate.tmdbId === undefined) &&
		(candidate.tvdbId === null || candidate.tvdbId === undefined)
	) {
		return {
			status: "unresolved",
			confidence: "low",
			targetId: null,
			reason: "Missing TMDB and TVDB ids for Sonarr series",
		};
	}

	const tmdbId =
		candidate.tmdbId ??
		(candidate.tvdbId !== null && candidate.tvdbId !== undefined
			? context.tvdbToTmdb?.get(candidate.tvdbId)
			: undefined);
	if (tmdbId === null || tmdbId === undefined) {
		return {
			status: "unresolved",
			confidence: "low",
			targetId: null,
			reason: "No confident TMDB match for Sonarr series",
		};
	}

	const target = context.showsByTmdbId?.get(tmdbId);
	if (!target) {
		return {
			status: "unresolved",
			confidence: "low",
			targetId: null,
			reason: "TMDB match did not resolve to an existing show target",
		};
	}

	return {
		status: "matched",
		confidence: "high",
		targetId: target.id,
		reason: `Matched Sonarr series by TVDB->TMDB crosswalk (${candidate.tvdbId} -> ${tmdbId})`,
	};
}

export function matchBookCandidate(
	candidate: BookCandidate,
	context: Pick<
		MatchContext,
		"booksByForeignBookId" | "bookFingerprintToId"
	> = {},
): MatchResult {
	if (candidate.foreignBookId) {
		const target = context.booksByForeignBookId?.get(candidate.foreignBookId);
		if (target) {
			return {
				status: "matched",
				confidence: "high",
				targetId: target.id,
				reason: `Matched book by foreignBookId ${candidate.foreignBookId}`,
			};
		}
	}

	const fingerprint = buildBookFingerprint(candidate);
	if (fingerprint.length > 0) {
		const targetId = context.bookFingerprintToId?.get(fingerprint);
		if (targetId !== null && targetId !== undefined) {
			return {
				status: "matched",
				confidence: "medium",
				targetId,
				reason: "Matched book by exact title/author/year fingerprint",
			};
		}
	}

	return {
		status: "unresolved",
		confidence: "low",
		targetId: null,
		reason: "No confident book match",
	};
}

export function getMatchContextKind(
	kind: ImportSourceKind,
): "movie" | "show" | "book" {
	switch (kind) {
		case "radarr":
			return "movie";
		case "sonarr":
			return "show";
		case "readarr":
		case "bookshelf":
			return "book";
	}
}
