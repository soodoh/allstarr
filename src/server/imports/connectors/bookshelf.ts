import { fetchPagedRecords, fetchQueueRecords, fetchSourceJson } from "../http";
import type { RawImportSnapshot, SourceConfig } from "../types";

export async function fetchBookshelfSnapshot(
	config: SourceConfig,
): Promise<RawImportSnapshot> {
	const [
		settings,
		libraries,
		collections,
		authors,
		books,
		history,
		queue,
		blocklist,
	] = await Promise.all([
		fetchSourceJson<Record<string, unknown>>({
			...config,
			path: "/api/settings",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/libraries",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/collections",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/authors",
		}),
		fetchSourceJson<Array<Record<string, unknown>>>({
			...config,
			path: "/api/books",
		}),
		fetchPagedRecords(config, "/api/history"),
		fetchQueueRecords(config, "/api/queue"),
		fetchPagedRecords(config, "/api/blocklist"),
	]);

	return {
		kind: "bookshelf",
		fetchedAt: new Date().toISOString(),
		settings,
		rootFolders: libraries,
		profiles: collections,
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
