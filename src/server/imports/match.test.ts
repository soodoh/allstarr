import { describe, expect, it } from "vitest";
import {
	buildBookFingerprint,
	getMatchContextKind,
	matchBookCandidate,
	matchMovieCandidate,
	matchSonarrShowCandidate,
} from "./match";

describe("import match helpers", () => {
	it("normalizes book fingerprints with optional author and year", () => {
		expect(
			buildBookFingerprint({
				authorName: "  Ursula K. Le Guin ",
				title: "A Wizard: of Earthsea!",
				year: 1968,
			}),
		).toBe("a wizard of earthsea|ursula k. le guin|1968");
		expect(buildBookFingerprint({ title: "  ???  " })).toBe("||");
	});

	it("matches and rejects movie candidates by TMDB id", () => {
		expect(matchMovieCandidate({ title: "No ID", tmdbId: null })).toEqual({
			confidence: "low",
			reason: "Missing TMDB id for movie",
			status: "unresolved",
			targetId: null,
		});
		expect(
			matchMovieCandidate(
				{ title: "Missing Target", tmdbId: 999 },
				{ moviesByTmdbId: new Map() },
			),
		).toMatchObject({
			reason: "No existing TMDB target for movie Missing Target",
			status: "unresolved",
		});
		expect(
			matchMovieCandidate(
				{ title: "Matched", tmdbId: 603 },
				{ moviesByTmdbId: new Map([[603, { id: 44 }]]) },
			),
		).toMatchObject({
			confidence: "high",
			status: "matched",
			targetId: 44,
		});
	});

	it("matches Sonarr shows through TMDB or TVDB crosswalks", () => {
		expect(matchSonarrShowCandidate({ title: "No IDs" })).toMatchObject({
			reason: "Missing TMDB and TVDB ids for Sonarr series",
			status: "unresolved",
		});
		expect(
			matchSonarrShowCandidate(
				{ title: "No Crosswalk", tvdbId: 12 },
				{ tvdbToTmdb: new Map() },
			),
		).toMatchObject({
			reason: "No confident TMDB match for Sonarr series",
			status: "unresolved",
		});
		expect(
			matchSonarrShowCandidate(
				{ title: "No Target", tmdbId: 13 },
				{ showsByTmdbId: new Map() },
			),
		).toMatchObject({
			reason: "TMDB match did not resolve to an existing show target",
			status: "unresolved",
		});
		expect(
			matchSonarrShowCandidate(
				{ title: "Matched", tvdbId: 100 },
				{
					showsByTmdbId: new Map([[200, { id: 55 }]]),
					tvdbToTmdb: new Map([[100, 200]]),
				},
			),
		).toMatchObject({
			confidence: "high",
			status: "matched",
			targetId: 55,
		});
	});

	it("matches books by foreign id or fingerprint and reports unresolved candidates", () => {
		expect(
			matchBookCandidate(
				{ foreignBookId: "hc-1", title: "Book" },
				{ booksByForeignBookId: new Map([["hc-1", { id: 10 }]]) },
			),
		).toMatchObject({
			confidence: "high",
			status: "matched",
			targetId: 10,
		});

		const fingerprint = buildBookFingerprint({
			authorName: "Author",
			title: "Book",
			year: 2020,
		});
		expect(
			matchBookCandidate(
				{
					authorName: "Author",
					foreignBookId: "missing",
					title: "Book",
					year: 2020,
				},
				{ bookFingerprintToId: new Map([[fingerprint, 11]]) },
			),
		).toMatchObject({
			confidence: "medium",
			status: "matched",
			targetId: 11,
		});
		expect(matchBookCandidate({ title: "Unknown" })).toEqual({
			confidence: "low",
			reason: "No confident book match",
			status: "unresolved",
			targetId: null,
		});
	});

	it("maps import source kinds to media contexts", () => {
		expect(getMatchContextKind("radarr")).toBe("movie");
		expect(getMatchContextKind("sonarr")).toBe("show");
		expect(getMatchContextKind("readarr")).toBe("book");
		expect(getMatchContextKind("bookshelf")).toBe("book");
	});
});
