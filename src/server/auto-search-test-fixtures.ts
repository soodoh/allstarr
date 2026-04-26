import type { IndexerRelease } from "src/server/indexers/types";

export function buildRelease(
	overrides: Partial<IndexerRelease> = {},
): IndexerRelease {
	return {
		age: null,
		ageFormatted: "1d",
		allstarrIndexerId: 1,
		categories: null,
		cfDetails: [],
		cfScore: 0,
		downloadUrl: "https://indexer.example/download/1",
		formatScore: 0,
		formatScoreDetails: [],
		grabs: null,
		guid: "release-guid",
		indexer: "Test Indexer",
		indexerFlags: null,
		indexerId: 1,
		indexerSource: "manual",
		infoUrl: null,
		leechers: null,
		packInfo: null,
		protocol: "usenet",
		publishDate: null,
		quality: { id: 1, name: "EPUB", weight: 1, color: "#0f0" },
		rejections: [],
		releaseType: 0,
		seeders: null,
		size: 1024,
		sizeFormatted: "1 KB",
		title: "Test Release",
		...overrides,
	};
}

export function buildManualIndexer(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: "Manual Indexer",
		baseUrl: "https://manual.example",
		apiPath: "/api",
		apiKey: "manual-key",
		enableRss: true,
		priority: 25,
		protocol: "usenet",
		...overrides,
	};
}

export function buildSyncedIndexer(overrides: Record<string, unknown> = {}) {
	return {
		id: 2,
		name: "Synced Indexer",
		baseUrl: "https://synced.example",
		apiPath: "/api",
		apiKey: "synced-key",
		enableRss: true,
		priority: 25,
		protocol: "usenet",
		...overrides,
	};
}

export function buildDownloadClient(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: "Download Client",
		implementation: "sabnzbd",
		host: "localhost",
		port: 8080,
		useSsl: false,
		urlBase: "",
		username: null,
		password: null,
		apiKey: "client-key",
		category: null,
		tag: null,
		settings: null,
		enabled: true,
		priority: 1,
		protocol: "usenet",
		...overrides,
	};
}
