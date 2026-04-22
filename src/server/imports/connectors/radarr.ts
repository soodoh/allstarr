import { fetchPagedRecords, fetchQueueRecords, fetchSourceJson } from "../http";
import type { RawImportSnapshot, SourceConfig } from "../types";

export async function fetchRadarrSnapshot(
	config: SourceConfig,
): Promise<RawImportSnapshot> {
	const [
		naming,
		mediaManagement,
		downloadClients,
		indexers,
		rootFolders,
		profiles,
		movies,
		movieFiles,
		history,
		queue,
		blocklist,
	] = await Promise.all([
		fetchSourceJson<Record<string, unknown>>({
			...config,
			path: "/api/v3/config/naming",
		}),
		fetchSourceJson<Record<string, unknown>>({
			...config,
			path: "/api/v3/config/mediamanagement",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v3/downloadclient",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v3/indexer",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v3/rootfolder",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v3/qualityprofile",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v3/movie",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v3/moviefile",
		}),
		fetchPagedRecords(config, "/api/v3/history"),
		fetchQueueRecords(config, "/api/v3/queue"),
		fetchPagedRecords(config, "/api/v3/blocklist"),
	]);

	return {
		kind: "radarr",
		fetchedAt: new Date().toISOString(),
		settings: {
			naming,
			mediaManagement,
			downloadClients,
			indexers,
		},
		rootFolders,
		profiles,
		library: {
			movies,
			movieFiles,
		},
		activity: {
			history,
			queue,
			blocklist,
		},
	};
}
