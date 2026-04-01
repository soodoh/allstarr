import type { Cheerio, CheerioAPI } from "cheerio";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { createApiFetcher } from "src/server/api-cache";
import type {
	FilterList,
	MangaDetails,
	MangaPage,
	MangaSource,
	PageUrl,
	SourceChapter,
} from "../types";

export type HtmlEngineConfig = {
	id: string;
	name: string;
	baseUrl: string;
	lang: string;
	supportsLatest: boolean;
	rateLimit?: { maxRequests: number; windowMs: number };
};

export abstract class HtmlEngine implements MangaSource {
	readonly id: string;
	readonly name: string;
	readonly baseUrl: string;
	readonly lang: string;
	readonly supportsLatest: boolean;
	protected readonly fetcher: ReturnType<typeof createApiFetcher>;

	constructor(config: HtmlEngineConfig) {
		this.id = config.id;
		this.name = config.name;
		this.baseUrl = config.baseUrl;
		this.lang = config.lang;
		this.supportsLatest = config.supportsLatest;
		this.fetcher = createApiFetcher({
			name: `manga-source-${config.id}`,
			cache: { ttlMs: 5 * 60 * 1000, maxEntries: 200 },
			rateLimit: config.rateLimit ?? { maxRequests: 2, windowMs: 1000 },
			retry: { maxRetries: 2, baseDelayMs: 1000 },
		});
	}

	protected async fetchDocument(
		url: string,
		cacheKey?: string,
	): Promise<CheerioAPI> {
		return this.fetcher.fetch<CheerioAPI>(cacheKey ?? url, async () => {
			const response = await fetch(url, {
				headers: HtmlEngine.buildHeaders(url),
				signal: AbortSignal.timeout(15_000),
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${url}`);
			}
			const html = await response.text();
			return cheerio.load(html);
		});
	}

	/** POST a form and parse the HTML response. */
	protected async postDocument(
		url: string,
		body: string | Record<string, string>,
		cacheKey?: string,
	): Promise<CheerioAPI> {
		return this.fetcher.fetch<CheerioAPI>(cacheKey ?? url, async () => {
			const isFormData = typeof body !== "string";
			const response = await fetch(url, {
				method: "POST",
				headers: {
					...HtmlEngine.buildHeaders(url),
					"Content-Type": isFormData
						? "application/x-www-form-urlencoded"
						: "text/plain",
				},
				body: isFormData ? new URLSearchParams(body).toString() : body,
				signal: AbortSignal.timeout(15_000),
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${url}`);
			}
			const html = await response.text();
			return cheerio.load(html);
		});
	}

	static buildHeaders(url: string): Record<string, string> {
		let referer: string;
		try {
			const parsed = new URL(url);
			referer = `${parsed.protocol}//${parsed.host}/`;
		} catch {
			referer = url;
		}

		return {
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
			Accept:
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
			Referer: referer,
			"Sec-Fetch-Dest": "document",
			"Sec-Fetch-Mode": "navigate",
			"Sec-Fetch-Site": "same-origin",
		};
	}

	// Keep for backward compat with engines calling HtmlEngine.getHeaders()
	static getHeaders(): Record<string, string> {
		return HtmlEngine.buildHeaders("https://example.com");
	}

	/** Extract the best image URL from an element (handles lazy-loading attrs). */
	static imgAttr(el: Cheerio<AnyNode>): string {
		return (
			el.attr("data-src") ??
			el.attr("data-lazy-src") ??
			el.attr("srcset")?.split(" ")[0] ??
			el.attr("src") ??
			""
		);
	}

	/** Make a relative URL absolute using this source's baseUrl. */
	protected absUrl(path: string): string {
		if (path.startsWith("http")) {
			return path;
		}
		return `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
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
