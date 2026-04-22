import { fetchPagedRecords, fetchQueueRecords, fetchSourceJson } from "../http";
import type { RawImportSnapshot, SourceConfig } from "../types";

export async function fetchSonarrSnapshot(
	config: SourceConfig,
): Promise<RawImportSnapshot> {
	const [
		naming,
		mediaManagement,
		downloadClients,
		indexers,
		rootFolders,
		profiles,
		series,
		episodes,
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
			path: "/api/v3/series",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/v3/episode",
		}),
		fetchPagedRecords(config, "/api/v3/history"),
		fetchQueueRecords(config, "/api/v3/queue"),
		fetchPagedRecords(config, "/api/v3/blocklist"),
	]);

	return {
		kind: "sonarr",
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
			series,
			episodes,
		},
		activity: {
			history,
			queue,
			blocklist,
		},
	};
}
