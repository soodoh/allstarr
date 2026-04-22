export type ImportSourceKind = "sonarr" | "radarr" | "readarr" | "bookshelf";

export type SourceConfig = {
	baseUrl: string;
	apiKey: string;
};

export type RawImportSnapshot = {
	kind: ImportSourceKind;
	fetchedAt: string;
	settings: Record<string, unknown>;
	rootFolders: Array<Record<string, unknown>>;
	profiles: Array<Record<string, unknown>>;
	library: Record<string, Array<Record<string, unknown>>>;
	activity: {
		history: Array<Record<string, unknown>>;
		queue: Array<Record<string, unknown>>;
		blocklist: Array<Record<string, unknown>>;
	};
};

export type PagedRecordsResponse<T extends Record<string, unknown>> = {
	records: T[];
	totalRecords: number;
};
