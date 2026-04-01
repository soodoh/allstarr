import { createApiFetcher } from "src/server/api-cache";
import type {
	FilterList,
	MangaDetails,
	MangaPage,
	MangaSource,
	PageUrl,
	SourceChapter,
} from "../types";

export type ApiEngineConfig = {
	id: string;
	name: string;
	baseUrl: string;
	lang: string;
	supportsLatest: boolean;
	rateLimit?: { maxRequests: number; windowMs: number };
};

export abstract class ApiEngine implements MangaSource {
	readonly id: string;
	readonly name: string;
	readonly baseUrl: string;
	readonly lang: string;
	readonly supportsLatest: boolean;
	protected readonly fetcher: ReturnType<typeof createApiFetcher>;

	constructor(config: ApiEngineConfig) {
		this.id = config.id;
		this.name = config.name;
		this.baseUrl = config.baseUrl;
		this.lang = config.lang;
		this.supportsLatest = config.supportsLatest;
		this.fetcher = createApiFetcher({
			name: `manga-source-${config.id}`,
			cache: { ttlMs: 5 * 60 * 1000, maxEntries: 200 },
			rateLimit: config.rateLimit ?? { maxRequests: 3, windowMs: 1000 },
			retry: { maxRetries: 2, baseDelayMs: 1000 },
		});
	}

	protected async fetchJson<T>(url: string, cacheKey?: string): Promise<T> {
		return this.fetcher.fetch<T>(cacheKey ?? url, async () => {
			const response = await fetch(url, {
				headers: ApiEngine.getHeaders(),
				signal: AbortSignal.timeout(15_000),
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${url}`);
			}
			return response.json() as Promise<T>;
		});
	}

	protected static getHeaders(): Record<string, string> {
		return { "User-Agent": "Allstarr/1.0" };
	}

	abstract searchManga(
		page: number,
		query: string,
		filters?: FilterList,
	): Promise<MangaPage>;
	abstract getPopularManga(page: number): Promise<MangaPage>;
	abstract getLatestUpdates(page: number): Promise<MangaPage>;
	abstract getMangaDetails(mangaUrl: string): Promise<MangaDetails>;
	abstract getChapterList(mangaUrl: string): Promise<SourceChapter[]>;
	abstract getPageList(chapterUrl: string): Promise<PageUrl[]>;
}
