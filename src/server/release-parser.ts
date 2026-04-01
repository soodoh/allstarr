export type ParsedRelease = {
	title: string;
	year?: number;
	season?: number;
	episode?: number;
	episodes?: number[]; // for multi-episode (S01E01E02)
	absoluteNumber?: number;
	source?: "HDTV" | "WEBDL" | "WEBRip" | "Bluray" | "BlurayRemux" | "DVD";
	resolution?: 480 | 720 | 1080 | 2160;
	codec?: "x264" | "x265" | "AV1" | "MPEG2" | "VC1";
	releaseGroup?: string;
	isProper?: boolean;
	isRepack?: boolean;
};

// ─── Regex patterns ──────────────────────────────────────────────────────────

const RE_SEASON_EPISODE = /S(\d{1,2})(E(\d{1,3}))+/i;

const RE_MULTI_EPISODE = /S(\d{1,2})((?:E\d{1,3})+)/i;

const RE_DATE = /(\d{4})[.-](\d{2})[.-](\d{2})/;

const RE_RESOLUTION = /(480|720|1080|2160)[pi]/i;

const RE_SOURCE =
	/\b(HDTV|WEB[-.\s]?DL|WEBRip|WEB[-.\s]?Rip|Blu[-.\s]?Ray|BDRip|DVD(?:Rip)?)\b/i;

const RE_CODEC =
	/\b(x\.?264|x\.?265|h\.?264|h\.?265|HEVC|AV1|MPEG-?2|VC-?1|AVC)\b/i;

const RE_REMUX = /\bRemux\b/i;

const RE_RELEASE_GROUP = /-(\w+)$/;

const RE_PROPER_REPACK = /\b(PROPER|REPACK)\b/i;

const RE_YEAR_IN_CONTEXT = /[.\s(](\d{4})[.\s)]/;

const RE_ANIME_LEADING_GROUP = /^\[([^\]]+)\]\s*/;

const RE_ANIME_ABSOLUTE = /\s-\s(\d{2,4})(?:\s|\[|$)/;

const FILE_EXTENSIONS =
	/\.(mkv|mp4|avi|mov|wmv|flv|webm|m2ts|ts|m4v|divx|xvid|mpg|mpeg)$/i;

// ─── Source normalization ─────────────────────────────────────────────────────

function normalizeSource(
	raw: string,
	hasRemux: boolean,
): ParsedRelease["source"] {
	const s = raw.replaceAll(/[\s.]/g, "").toLowerCase();
	if (s === "hdtv") {
		return "HDTV";
	}
	if (s === "webdl" || s === "web-dl") {
		return "WEBDL";
	}
	if (s === "webrip" || s === "web-rip") {
		return "WEBRip";
	}
	if (s === "bluray" || s === "blu-ray" || s === "bdrip") {
		return hasRemux ? "BlurayRemux" : "Bluray";
	}
	if (s === "dvd" || s === "dvdrip") {
		return "DVD";
	}
	return undefined;
}

// ─── Codec normalization ──────────────────────────────────────────────────────

function normalizeCodec(raw: string): ParsedRelease["codec"] {
	const s = raw.replaceAll(/[.-]/g, "").toLowerCase();
	if (s === "x264" || s === "h264" || s === "avc") {
		return "x264";
	}
	if (s === "x265" || s === "h265" || s === "hevc") {
		return "x265";
	}
	if (s === "av1") {
		return "AV1";
	}
	if (s === "mpeg2") {
		return "MPEG2";
	}
	if (s === "vc1") {
		return "VC1";
	}
	return undefined;
}

// ─── Title extraction ─────────────────────────────────────────────────────────

function extractTitle(name: string): string {
	return name.replaceAll(/[._]/g, " ").trim();
}

function findMarkerPosition(name: string): number {
	const positions: number[] = [];

	// Season/episode marker
	const seMatch = RE_SEASON_EPISODE.exec(name);
	if (seMatch?.index !== undefined) {
		positions.push(seMatch.index);
	}

	// Date pattern — only use as title boundary if followed by resolution or source
	const dateMatch = RE_DATE.exec(name);
	if (dateMatch?.index !== undefined) {
		const afterDate = name.slice(dateMatch.index + dateMatch[0].length);
		if (RE_RESOLUTION.test(afterDate) || RE_SOURCE.test(afterDate)) {
			positions.push(dateMatch.index);
		}
	}

	// Resolution marker
	const resMatch = RE_RESOLUTION.exec(name);
	if (resMatch?.index !== undefined) {
		positions.push(resMatch.index);
	}

	// Source marker
	const srcMatch = RE_SOURCE.exec(name);
	if (srcMatch?.index !== undefined) {
		positions.push(srcMatch.index);
	}

	if (positions.length === 0) {
		return name.length;
	}

	return Math.min(...positions);
}

// ─── Anime pattern handling ───────────────────────────────────────────────────

function tryParseAnime(name: string): ParsedRelease | null {
	const leadingGroupMatch = RE_ANIME_LEADING_GROUP.exec(name);
	if (!leadingGroupMatch) {
		return null;
	}

	const withoutGroup = name.slice(leadingGroupMatch[0].length);
	const absoluteMatch = RE_ANIME_ABSOLUTE.exec(withoutGroup);

	if (!absoluteMatch) {
		return null;
	}

	const titleRaw = withoutGroup.slice(0, absoluteMatch.index).trim();
	const title = extractTitle(titleRaw);
	const absoluteNumber = Number.parseInt(absoluteMatch[1], 10);

	const result: ParsedRelease = { title, absoluteNumber };

	const resMatch = RE_RESOLUTION.exec(name);
	if (resMatch) {
		result.resolution = Number.parseInt(
			resMatch[1],
			10,
		) as ParsedRelease["resolution"];
	}

	// Use the bracket group label as the release group
	result.releaseGroup = leadingGroupMatch[1];

	return result;
}

// ─── Episode / year helpers ───────────────────────────────────────────────────

function applySeasonEpisode(stripped: string, result: ParsedRelease): void {
	const multiEpMatch = RE_MULTI_EPISODE.exec(stripped);
	if (!multiEpMatch) {
		return;
	}
	result.season = Number.parseInt(multiEpMatch[1], 10);
	const epSegment = multiEpMatch[2]; // e.g. "E01E02E03"
	const epNumbers: number[] = [];
	const epRe = /E(\d{1,3})/gi;
	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration pattern
	while ((m = epRe.exec(epSegment)) !== null) {
		epNumbers.push(Number.parseInt(m[1], 10));
	}
	if (epNumbers.length > 1) {
		result.episodes = epNumbers;
		result.episode = epNumbers[0];
	} else if (epNumbers.length === 1) {
		result.episode = epNumbers[0];
	}
}

function applyYear(stripped: string, result: ParsedRelease): void {
	// Daily TV: year from date pattern takes precedence
	const dateMatch = RE_DATE.exec(stripped);
	if (dateMatch && !result.season) {
		result.year = Number.parseInt(dateMatch[1], 10);
		return;
	}
	// Movie / show release year
	const yearMatch = RE_YEAR_IN_CONTEXT.exec(stripped);
	if (yearMatch) {
		const candidate = Number.parseInt(yearMatch[1], 10);
		if (candidate >= 1900 && candidate <= 2100) {
			result.year = candidate;
		}
	}
}

function applySourceAndCodec(stripped: string, result: ParsedRelease): void {
	const hasRemux = RE_REMUX.test(stripped);
	const srcMatch = RE_SOURCE.exec(stripped);
	if (srcMatch) {
		result.source = normalizeSource(srcMatch[1], hasRemux);
	} else if (hasRemux) {
		result.source = "BlurayRemux";
	}
	const codecMatch = RE_CODEC.exec(stripped);
	if (codecMatch) {
		result.codec = normalizeCodec(codecMatch[1]);
	}
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseReleaseName(name: string): ParsedRelease {
	// Strip file extension if present
	const stripped = name.replace(FILE_EXTENSIONS, "");

	// Try anime pattern first
	const animeResult = tryParseAnime(stripped);
	if (animeResult) {
		return animeResult;
	}

	const result: ParsedRelease = { title: "" };

	applySeasonEpisode(stripped, result);
	applyYear(stripped, result);

	// ── Absolute episode number (non-anime, e.g. "Episode 42") ──
	if (!result.season && !result.episode) {
		const absMatch = /\bEpisode\s+(\d+)\b/i.exec(stripped);
		if (absMatch) {
			result.absoluteNumber = Number.parseInt(absMatch[1], 10);
		}
	}

	// ── Resolution ──
	const resMatch = RE_RESOLUTION.exec(stripped);
	if (resMatch) {
		result.resolution = Number.parseInt(
			resMatch[1],
			10,
		) as ParsedRelease["resolution"];
	}

	applySourceAndCodec(stripped, result);

	// ── Proper / Repack ──
	const properRepackMatch = RE_PROPER_REPACK.exec(stripped);
	if (properRepackMatch) {
		result.isProper =
			properRepackMatch[1].toUpperCase() === "PROPER" || undefined;
		result.isRepack = !result.isProper || undefined;
	}

	// ── Release group ──
	const groupMatch = RE_RELEASE_GROUP.exec(stripped);
	if (groupMatch) {
		result.releaseGroup = groupMatch[1];
	}

	// ── Title ──
	const markerPos = findMarkerPosition(stripped);
	result.title = extractTitle(stripped.slice(0, markerPos));

	return result;
}
