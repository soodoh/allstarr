import { fetchPagedRecords, fetchQueueRecords, fetchSourceJson } from "../http";
import type { RawImportSnapshot, SourceConfig } from "../types";

export async function fetchBookshelfSnapshot(
	config: SourceConfig,
): Promise<RawImportSnapshot> {
	const [
		naming,
		mediaManagement,
		downloadClients,
		indexers,
		rootFolders,
		qualityProfiles,
		metadataProfiles,
		authors,
		books,
		history,
		queue,
		blocklist,
	] = await Promise.all([
		fetchSourceJson<Record<string, unknown>>({
			...config,
			path: "/api/v1/config/naming",
		}),
		fetchSourceJson<Record<string, unknown>>({
			...config,
			path: "/api/v1/config/mediamanagement",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v1/downloadclient",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v1/indexer",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v1/rootfolder",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v1/qualityprofile",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v1/metadataprofile",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v1/author",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v1/book",
		}),
		fetchPagedRecords(config, "/api/v1/history"),
		fetchQueueRecords(config, "/api/v1/queue"),
		fetchPagedRecords(config, "/api/v1/blocklist"),
	]);

	return {
		kind: "bookshelf",
		fetchedAt: new Date().toISOString(),
		settings: {
			naming,
			mediaManagement,
			downloadClients,
			indexers,
			metadataProfiles,
		},
		rootFolders,
		profiles: qualityProfiles,
		library: {
			authors,
			books,
		},
		activity: {
			history,
			queue,
			blocklist,
		},
	};
}
