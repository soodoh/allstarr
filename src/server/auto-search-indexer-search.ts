import type { AutoSearchOutcomeRecorder } from "./auto-search-outcomes";
import type { BookSearchParams } from "./indexers/http";

type IndexerSource = "manual" | "synced";
type GateResult =
	| { allowed: true }
	| {
			allowed: false;
			reason: "backoff" | "pacing" | "daily_query_limit" | "daily_grab_limit";
			waitMs?: number;
	  };
type EnabledIndexer = {
	id: number;
	name: string;
	baseUrl: string;
	apiPath: string | null;
	apiKey: string | null;
};
export type EnabledIndexers = {
	manual: EnabledIndexer[];
	synced: EnabledIndexer[];
};
type SearchResult = {
	title: string;
	guid: string;
	protocol: "torrent" | "usenet";
	size: number;
	downloadUrl: string;
	indexer?: string | null;
};
type EnrichedSearchResult<TRelease extends SearchResult> = TRelease & {
	indexer: string;
	allstarrIndexerId: number;
	indexerSource: IndexerSource;
};
type SearchOptions = {
	bookParams?: BookSearchParams;
	categories: number[];
	contentType?: "book" | "tv";
	enabledIndexers: EnabledIndexers;
	logPrefix?: string;
	searchContext?: "movie" | "episode";
	onOutcome?: AutoSearchOutcomeRecorder;
	query: string;
};

/** Bind adapters once; each search supplies only its query and media facts. */
export function createIndexerSearch<TRelease extends SearchResult, TEnriched>({
	canQueryIndexer,
	enrichRelease,
	logError,
	logInfo,
	searchNewznab,
	sleep,
}: {
	canQueryIndexer: (source: IndexerSource, id: number) => GateResult;
	enrichRelease: (
		release: EnrichedSearchResult<TRelease>,
		contentType?: "book" | "tv",
	) => TEnriched;
	logError: (prefix: string, message: string, error: unknown) => void;
	logInfo: (prefix: string, message: string) => void;
	searchNewznab: (
		feed: { baseUrl: string; apiPath: string; apiKey: string },
		query: string,
		categories: number[],
		bookParams: BookSearchParams | undefined,
		identity: { indexerType: IndexerSource; indexerId: number },
	) => Promise<TRelease[]>;
	sleep: (ms: number) => Promise<void> | void;
}) {
	return async function searchEnabledIndexers({
		bookParams,
		categories,
		contentType,
		enabledIndexers,
		logPrefix = "rss-sync",
		searchContext,
		onOutcome,
		query,
	}: SearchOptions): Promise<TEnriched[]> {
		const allReleases: TEnriched[] = [];
		const context = searchContext ? ` for ${searchContext}` : "";
		const groups = [
			{
				source: "synced" as const,
				indexers: enabledIndexers.synced.filter((indexer) => indexer.apiKey),
			},
			{ source: "manual" as const, indexers: enabledIndexers.manual },
		];
		for (const group of groups) {
			for (const indexer of group.indexers) {
				let gate = canQueryIndexer(group.source, indexer.id);
				if (
					!gate.allowed &&
					gate.reason === "pacing" &&
					gate.waitMs &&
					gate.waitMs > 0
				) {
					await sleep(gate.waitMs);
					gate = canQueryIndexer(group.source, indexer.id);
				}
				if (!gate.allowed) {
					onOutcome?.("indexer_skipped");
					logInfo(
						logPrefix,
						`Indexer "${indexer.name}" skipped${context}: ${gate.reason}`,
					);
					continue;
				}
				try {
					const results = await searchNewznab(
						{
							baseUrl: indexer.baseUrl,
							apiPath: indexer.apiPath ?? "/api",
							apiKey:
								group.source === "manual"
									? (indexer.apiKey as string)
									: (indexer.apiKey ?? ""),
						},
						query,
						categories,
						bookParams,
						{ indexerType: group.source, indexerId: indexer.id },
					);
					allReleases.push(
						...results.map((release) =>
							enrichRelease(
								{
									...release,
									indexer: release.indexer || indexer.name,
									allstarrIndexerId: indexer.id,
									indexerSource: group.source,
								},
								contentType,
							),
						),
					);
				} catch (error) {
					onOutcome?.("indexer_failed");
					logError(
						logPrefix,
						group.source === "manual" && searchContext
							? `Manual indexer failed${context}`
							: `Indexer "${indexer.name}" failed${context}`,
						error,
					);
				}
			}
		}
		return allReleases;
	};
}
