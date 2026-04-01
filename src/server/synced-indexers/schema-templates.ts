import type { ReadarrIndexerResource } from "./mapper";

/**
 * Schema templates returned from GET /api/v1/indexer/schema.
 * Prowlarr uses these templates to know what indexer types Allstarr supports,
 * then clones the matching template and fills in its own values when syncing.
 */
export default function getSchemaTemplates(): ReadarrIndexerResource[] {
	return [
		{
			id: 0,
			name: "",
			implementation: "Newznab",
			implementationName: "Newznab",
			configContract: "NewznabSettings",
			infoLink: "",
			fields: [
				{ name: "baseUrl", value: "" },
				{ name: "apiPath", value: "/api" },
				{ name: "apiKey", value: "" },
				{ name: "categories", value: [] },
				{ name: "animeCategories", value: [] },
				{ name: "additionalParameters", value: null },
				{ name: "removeYear", value: false },
				{ name: "searchByTitle", value: false },
			],
			enableRss: true,
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			supportsRss: true,
			supportsSearch: true,
			protocol: "usenet",
			priority: 25,
			tags: [],
		},
		{
			id: 0,
			name: "",
			implementation: "Torznab",
			implementationName: "Torznab",
			configContract: "TorznabSettings",
			infoLink: "",
			fields: [
				{ name: "baseUrl", value: "" },
				{ name: "apiPath", value: "/api" },
				{ name: "apiKey", value: "" },
				{ name: "categories", value: [] },
				{ name: "animeCategories", value: [] },
				{ name: "additionalParameters", value: null },
				{ name: "minimumSeeders", value: 1 },
				{ name: "seedCriteria.seedRatio", value: null },
				{ name: "seedCriteria.seedTime", value: null },
				{ name: "seedCriteria.discographySeedTime", value: null },
				{ name: "rejectBlocklistedTorrentHashesWhileGrabbing", value: false },
			],
			enableRss: true,
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			supportsRss: true,
			supportsSearch: true,
			protocol: "torrent",
			priority: 25,
			tags: [],
		},
	];
}
