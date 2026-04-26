import type { BookSearchParams } from "./indexers/http";
import type { IndexerRelease } from "./indexers/types";

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

type SearchNewznab<TRelease extends SearchResult> = (
	feed: { baseUrl: string; apiPath: string; apiKey: string },
	query: string,
	categories: number[],
	bookParams: BookSearchParams | undefined,
	indexerIdentity: { indexerType: IndexerSource; indexerId: number },
) => Promise<TRelease[]>;

export type SearchEnabledIndexersOptions<
	TRelease extends SearchResult,
	TEnriched,
> = {
	bookParams?: BookSearchParams;
	canQueryIndexer: (
		indexerType: IndexerSource,
		indexerId: number,
	) => GateResult;
	categories: number[];
	contentType?: "book" | "tv";
	enabledIndexers: EnabledIndexers;
	enrichRelease: (
		release: EnrichedSearchResult<TRelease>,
		contentType?: "book" | "tv",
	) => TEnriched;
	logError: (prefix: string, message: string, error: unknown) => void;
	logInfo: (prefix: string, message: string) => void;
	logPrefix?: string;
	query: string;
	searchNewznab: SearchNewznab<TRelease>;
	sleep: (ms: number) => Promise<void> | void;
};

async function waitOrSkipBlockedIndexer(
	indexer: EnabledIndexer,
	gate: Exclude<GateResult, { allowed: true }>,
	logInfo: (prefix: string, message: string) => void,
	logPrefix: string,
	sleep: (ms: number) => Promise<void> | void,
): Promise<boolean> {
	if (gate.reason === "pacing" && gate.waitMs) {
		await sleep(gate.waitMs);
		return true;
	}

	logInfo(logPrefix, `Indexer "${indexer.name}" skipped: ${gate.reason}`);
	return false;
}

export async function searchEnabledIndexers<
	TRelease extends SearchResult,
	TEnriched = IndexerRelease,
>({
	bookParams,
	canQueryIndexer,
	categories,
	contentType,
	enabledIndexers,
	enrichRelease,
	logError,
	logInfo,
	logPrefix = "rss-sync",
	query,
	searchNewznab,
	sleep,
}: SearchEnabledIndexersOptions<TRelease, TEnriched>): Promise<TEnriched[]> {
	const allReleases: TEnriched[] = [];

	const indexerGroups = [
		{
			source: "synced" as const,
			indexers: enabledIndexers.synced.filter((indexer) => indexer.apiKey),
		},
		{ source: "manual" as const, indexers: enabledIndexers.manual },
	];

	for (const group of indexerGroups) {
		for (const indexer of group.indexers) {
			const gate = canQueryIndexer(group.source, indexer.id);
			if (!gate.allowed) {
				const shouldQuery = await waitOrSkipBlockedIndexer(
					indexer,
					gate,
					logInfo,
					logPrefix,
					sleep,
				);
				if (!shouldQuery) {
					continue;
				}
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
				logError(logPrefix, `Indexer "${indexer.name}" failed`, error);
			}
		}
	}

	return allReleases;
}
