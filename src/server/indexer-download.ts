import getProvider from "./download-clients/registry";
import type {
	ConnectionConfig,
	DownloadRequest,
} from "./download-clients/types";
import { canGrabIndexer } from "./indexer-rate-limiter";

export type IndexerDownloadResult =
	| { status: "grab_limit_reached" }
	| { status: "accepted"; downloadId: string | null };

/** Resolve the provider before consuming a slot; charge every dispatch attempt. */
export async function dispatchIndexerDownload({
	indexerSource,
	indexerId,
	config,
	download,
}: {
	indexerSource: "manual" | "synced";
	indexerId: number;
	config: ConnectionConfig;
	download: DownloadRequest;
}): Promise<IndexerDownloadResult> {
	const provider = await getProvider(config.implementation);
	const gate = canGrabIndexer(indexerSource, indexerId);
	if (!gate.allowed) {
		return { status: "grab_limit_reached" };
	}

	// No await between admission and dispatch: concurrent callers cannot share a slot.
	const downloadId = await provider.addDownload(config, download);
	return { status: "accepted", downloadId };
}
