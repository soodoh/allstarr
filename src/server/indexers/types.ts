export type IndexerConnectionConfig = {
	host: string;
	port: number;
	useSsl: boolean;
	urlBase: string | null;
	apiKey: string;
};

export type TestResult = {
	success: boolean;
	message: string;
	version: string | null;
};

/** Raw search result shape returned by Prowlarr's /api/v1/search endpoint */
export type ProwlarrSearchResult = {
	guid: string;
	title: string;
	size: number;
	/** Direct download URL. May be absent for torrent results — use magnetUrl instead. */
	downloadUrl: string | null;
	/** Magnet/torrent download URL, used when downloadUrl is absent (common for public trackers). */
	magnetUrl: string | null;
	infoUrl: string | null;
	publishDate: string | null;
	indexerId: number;
	indexer: string | null;
	protocol: "torrent" | "usenet";
	seeders: number | null;
	leechers: number | null;
	grabs: number | null;
	categories: Array<{ id: number; name: string }> | null;
	age: number | null;
	indexerFlags: number | null;
};

/** Prowlarr indexer info from /api/v1/indexer */
export type ProwlarrIndexerInfo = {
	id: number;
	name: string;
	enable: boolean;
	protocol: string;
	privacy: string;
};

/** Quality annotation attached to an IndexerRelease */
export type ReleaseQuality = {
	id: number;
	name: string;
	weight: number;
	color: string;
};

/** All possible rejection reasons */
export type ReleaseRejectionReason =
	| "unknownQuality"
	| "qualityNotWanted"
	| "belowMinimumSize"
	| "aboveMaximumSize"
	| "blocklisted"
	| "belowMinimumCFScore";

/** A reason why a release would be rejected */
export type ReleaseRejection = {
	reason: ReleaseRejectionReason;
	message: string;
};

export const ReleaseType = {
	Unknown: 0,
	// TV Shows
	SingleEpisode: 1,
	MultiEpisode: 2,
	SeasonPack: 3,
	MultiSeasonPack: 4,
	// Books
	SingleBook: 10,
	AuthorPack: 11,
} as const;

export type ReleaseType = (typeof ReleaseType)[keyof typeof ReleaseType];

export type ParsedPackInfo = {
	seasons?: number[];
	episodes?: number[];
	volumes?: number[];
	chapters?: number[];
};

/** Per-profile format score breakdown */
export type FormatScoreDetail = {
	profileName: string;
	score: number;
	allowed: boolean;
};

/** Status map for tracking release states on the search page */
export type ReleaseStatusMap = {
	grabbedGuids: string[];
	queueTitles: string[];
	existingQualityIds: number[];
};

/** Normalized release for the UI, enriched with quality info */
export type IndexerRelease = Omit<
	ProwlarrSearchResult,
	"downloadUrl" | "magnetUrl"
> & {
	/** Always present: coalesced from downloadUrl ?? magnetUrl at the HTTP layer. */
	downloadUrl: string;
	allstarrIndexerId: number;
	/** Which table the allstarrIndexerId refers to */
	indexerSource: "manual" | "synced";
	quality: ReleaseQuality;
	sizeFormatted: string;
	ageFormatted: string;
	indexerFlags: number | null;
	rejections: ReleaseRejection[];
	formatScore: number;
	formatScoreDetails: FormatScoreDetail[];
	cfScore: number;
	cfDetails: Array<{ cfId: number; name: string; score: number }>;
	releaseType: ReleaseType;
	packInfo: ParsedPackInfo | null;
};
