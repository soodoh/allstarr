import type { Cheerio, CheerioAPI } from "cheerio";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type {
	FilterList,
	MangaDetails,
	MangaPage,
	PageUrl,
	SourceChapter,
	SourceManga,
} from "../types";
import type { HtmlEngineConfig } from "./html-engine";
import { HtmlEngine } from "./html-engine";

export type MadaraEngineConfig = HtmlEngineConfig & {
	mangaSubString?: string;
};

// --- Module-level helpers (avoid class-methods-use-this lint rule) ---

const MANGA_PER_PAGE = 20;

function parseMangaCard(
	el: Cheerio<AnyNode>,
	_baseUrl: string,
): SourceManga | null {
	const link = el.find("a").first();
	const href = link.attr("href");
	if (!href) {
		return null;
	}

	const img = el.find("img").first();
	const title =
		img.attr("alt") ?? link.attr("title") ?? link.text().trim() ?? "";
	const thumbnailUrl = HtmlEngine.imgAttr(img) || undefined;

	// Store as relative path from baseUrl for consistency
	const url = href.startsWith("http") ? new URL(href).pathname : href;

	return {
		url,
		title: title.trim(),
		thumbnailUrl,
	};
}

function parseMangaList($: CheerioAPI, baseUrl: string): SourceManga[] {
	const manga: SourceManga[] = [];
	const selectors = [
		".page-item-detail",
		".manga",
		".c-tabs-item__content",
		".manga-item",
	];

	let items: Cheerio<AnyNode> | null = null;
	for (const sel of selectors) {
		const found = $(sel);
		if (found.length > 0) {
			items = found;
			break;
		}
	}

	if (!items) {
		return manga;
	}

	items.each((_i, el) => {
		const entry = parseMangaCard($(el), baseUrl);
		if (entry) {
			manga.push(entry);
		}
	});

	return manga;
}

function parseChapterDate(dateText: string): Date | undefined {
	const trimmed = dateText.trim();
	if (!trimmed) {
		return undefined;
	}

	// Handle relative dates like "1 hour ago", "2 days ago"
	const relMatch = trimmed.match(
		/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i,
	);
	if (relMatch) {
		const amount = Number.parseInt(relMatch[1], 10);
		const unit = relMatch[2].toLowerCase();
		const now = new Date();
		const multipliers: Record<string, number> = {
			second: 1000,
			minute: 60 * 1000,
			hour: 60 * 60 * 1000,
			day: 24 * 60 * 60 * 1000,
			week: 7 * 24 * 60 * 60 * 1000,
			month: 30 * 24 * 60 * 60 * 1000,
			year: 365 * 24 * 60 * 60 * 1000,
		};
		const ms = multipliers[unit];
		if (ms) {
			return new Date(now.getTime() - amount * ms);
		}
	}

	// Try standard date parsing
	const parsed = new Date(trimmed);
	if (!Number.isNaN(parsed.getTime())) {
		return parsed;
	}

	return undefined;
}

function parseChapterNumber(chapterName: string): number | undefined {
	// Match patterns like "Chapter 123", "Ch.123", "Chapter 12.5"
	const match = chapterName.match(/(?:chapter|ch\.?)\s*([\d.]+)/i);
	if (match) {
		const num = Number.parseFloat(match[1]);
		return Number.isNaN(num) ? undefined : num;
	}
	return undefined;
}

function parseChaptersFromHtml(
	$: CheerioAPI,
	_mangaUrl: string,
): SourceChapter[] {
	const chapters: SourceChapter[] = [];

	$(".wp-manga-chapter").each((_i, el) => {
		const link = $(el).find("a").first();
		const href = link.attr("href");
		if (!href) {
			return;
		}

		const name = link.text().trim();
		const url = href.startsWith("http") ? new URL(href).pathname : href;

		const dateText = $(el).find(".chapter-release-date").text();
		const dateUpload = parseChapterDate(dateText);

		const chapterNumber = parseChapterNumber(name);

		chapters.push({
			url,
			name,
			chapterNumber,
			dateUpload,
		});
	});

	return chapters;
}

function mapStatus(text: string): MangaDetails["status"] | undefined {
	const lower = text.toLowerCase().trim();
	if (lower.includes("ongoing") || lower.includes("updating")) {
		return "ongoing";
	}
	if (lower.includes("completed") || lower.includes("finished")) {
		return "complete";
	}
	if (lower.includes("hiatus") || lower.includes("on hold")) {
		return "hiatus";
	}
	if (
		lower.includes("cancelled") ||
		lower.includes("canceled") ||
		lower.includes("dropped")
	) {
		return "cancelled";
	}
	return undefined;
}

function isTrackingPixel(el: Cheerio<AnyNode>): boolean {
	const width = Number.parseInt(el.attr("width") ?? "999", 10);
	const height = Number.parseInt(el.attr("height") ?? "999", 10);
	return width < 5 || height < 5;
}

// --- MadaraEngine ---

export class MadaraEngine extends HtmlEngine {
	private readonly mangaSubString: string;

	constructor(config: MadaraEngineConfig) {
		super(config);
		this.mangaSubString = config.mangaSubString ?? "manga";
	}

	async getPopularManga(page: number): Promise<MangaPage> {
		const url = `${this.baseUrl}/${this.mangaSubString}/page/${page}/?m_orderby=views`;
		const $ = await this.fetchDocument(url);
		const manga = parseMangaList($, this.baseUrl);

		return {
			manga,
			hasNextPage: manga.length >= MANGA_PER_PAGE,
		};
	}

	async getLatestUpdates(page: number): Promise<MangaPage> {
		const url = `${this.baseUrl}/${this.mangaSubString}/page/${page}/?m_orderby=latest`;
		const $ = await this.fetchDocument(url);
		const manga = parseMangaList($, this.baseUrl);

		return {
			manga,
			hasNextPage: manga.length >= MANGA_PER_PAGE,
		};
	}

	async searchManga(
		page: number,
		query: string,
		_filters?: FilterList,
	): Promise<MangaPage> {
		const url =
			`${this.baseUrl}/page/${page}/` +
			`?s=${encodeURIComponent(query)}&post_type=wp-manga`;
		const $ = await this.fetchDocument(url);
		const manga = parseMangaList($, this.baseUrl);

		return {
			manga,
			hasNextPage: manga.length >= MANGA_PER_PAGE,
		};
	}

	async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
		const fullUrl = this.absUrl(mangaUrl);
		const $ = await this.fetchDocument(fullUrl);

		// Title
		const title =
			$(".post-title h1").text().trim() ||
			$("#manga-title").text().trim() ||
			$(".post-title").text().trim() ||
			"Unknown";

		// Cover image
		const coverEl = $(".summary_image img").first();
		const thumbnailUrl = HtmlEngine.imgAttr(coverEl) || undefined;

		// Description
		const description =
			$(".description-summary .summary__content").text().trim() ||
			$(".summary__content").text().trim() ||
			undefined;

		// Status
		const statusContainers = $(".post-status .summary-content");
		let status: MangaDetails["status"] | undefined;
		statusContainers.each((_i, el) => {
			const text = $(el).text();
			const mapped = mapStatus(text);
			if (mapped) {
				status = mapped;
			}
		});

		// Genres
		const genres: string[] = [];
		$(".genres-content a").each((_i, el) => {
			const genre = $(el).text().trim();
			if (genre) {
				genres.push(genre);
			}
		});

		// Author
		const author = $(".author-content a").first().text().trim() || undefined;

		// Artist
		const artist = $(".artist-content a").first().text().trim() || undefined;

		return {
			title,
			author,
			artist,
			description: description || undefined,
			genres: genres.length > 0 ? genres : undefined,
			status,
			thumbnailUrl,
		};
	}

	async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
		const fullUrl = this.absUrl(mangaUrl);

		// Strategy 1: AJAX endpoint for chapters
		const ajaxUrl = `${fullUrl.replace(/\/$/, "")}/ajax/chapters/`;
		try {
			const html = await this.fetcher.fetch<string>(
				`chapters:${mangaUrl}`,
				async () => {
					const response = await fetch(ajaxUrl, {
						method: "POST",
						headers: {
							...HtmlEngine.buildHeaders(ajaxUrl),
							"Content-Type": "application/x-www-form-urlencoded",
						},
						body: "",
						signal: AbortSignal.timeout(15_000),
					});
					if (!response.ok) {
						throw new Error(`HTTP ${response.status}: ${ajaxUrl}`);
					}
					return response.text();
				},
			);

			const $ = cheerio.load(html);
			const chapters = parseChaptersFromHtml($, mangaUrl);
			if (chapters.length > 0) {
				return chapters;
			}
		} catch {
			// AJAX failed, fall through to page scraping
		}

		// Strategy 2: Parse chapters from the manga detail page
		const $ = await this.fetchDocument(
			fullUrl,
			`detail-for-chapters:${mangaUrl}`,
		);
		return parseChaptersFromHtml($, mangaUrl);
	}

	async getPageList(chapterUrl: string): Promise<PageUrl[]> {
		const fullUrl = this.absUrl(chapterUrl);
		const $ = await this.fetchDocument(fullUrl);

		const pages: PageUrl[] = [];

		$(".reading-content img").each((_i, el) => {
			const img = $(el);

			// Filter out tracking pixels
			if (isTrackingPixel(img)) {
				return;
			}

			const src = HtmlEngine.imgAttr(img).trim();
			if (src) {
				pages.push(src);
			}
		});

		return pages;
	}
}
