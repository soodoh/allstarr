import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type {
	FilterList,
	MangaDetails,
	MangaPage,
	PageUrl,
	SourceChapter,
	SourceManga,
} from "../types";
import { HtmlEngine } from "./html-engine";

// --- Module-level helpers (avoid class-methods-use-this lint rule) ---

const MANGA_PER_PAGE = 24;

function parseMangaCard(el: Cheerio<AnyNode>): SourceManga | null {
	const link = el.find("h3 a").first();
	const href = link.attr("href") ?? el.find("a").first().attr("href");
	if (!href) {
		return null;
	}

	const title = link.text().trim() || link.attr("title")?.trim() || "";

	const img = el
		.find(".content-genres-item img, .list-truyen-item-wrap img")
		.first();
	const thumbnailUrl = HtmlEngine.imgAttr(img) || undefined;

	const url = href.startsWith("http") ? new URL(href).pathname : href;

	return {
		url,
		title,
		thumbnailUrl,
	};
}

function parseMangaList($: CheerioAPI): SourceManga[] {
	const manga: SourceManga[] = [];

	// MangaBox uses .content-genres-item or .list-truyen-item-wrap
	let items = $(".content-genres-item");
	if (items.length === 0) {
		items = $(".list-truyen-item-wrap");
	}

	items.each((_i, el) => {
		const entry = parseMangaCard($(el));
		if (entry) {
			manga.push(entry);
		}
	});

	return manga;
}

function hasNextPage($: CheerioAPI): boolean {
	return (
		$('a[rel="next"]').length > 0 || $(".panel-page-number .next").length > 0
	);
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
	const match = chapterName.match(/(?:chapter|ch\.?)\s*([\d.]+)/i);
	if (match) {
		const num = Number.parseFloat(match[1]);
		return Number.isNaN(num) ? undefined : num;
	}
	return undefined;
}

function parseChaptersFromPage($: CheerioAPI): SourceChapter[] {
	const chapters: SourceChapter[] = [];

	// MangaBox: .row-content-chapter li a or .chapter-list .row span a
	const chapterLinks =
		$(".row-content-chapter li a").length > 0
			? $(".row-content-chapter li a")
			: $(".chapter-list .row span a");

	chapterLinks.each((_i, el) => {
		const link = $(el);
		const href = link.attr("href");
		if (!href) {
			return;
		}

		const name = link.text().trim();
		const url = href.startsWith("http") ? new URL(href).pathname : href;

		// Date is often in a sibling span
		const row = link.closest("li, .row");
		const dateText = row
			.find(".chapter-time, .chapter-update, span")
			.last()
			.text();
		const dateUpload = parseChapterDate(dateText);

		const chapterNumber = parseChapterNumber(name);

		chapters.push({ url, name, chapterNumber, dateUpload });
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

function parseDetailsFromPage($: CheerioAPI): MangaDetails {
	// Title
	const title =
		$("h1").first().text().trim() ||
		$(".manga-info-text h1").text().trim() ||
		"Unknown";

	// Cover image
	const coverEl = $(".manga-info-pic img").first();
	const thumbnailUrl = HtmlEngine.imgAttr(coverEl) || undefined;

	// Description
	const description =
		$("#panel-story-info-description")
			.text()
			.replace(/^Description\s*:?\s*/i, "")
			.trim() ||
		$("#noidungm").text().trim() ||
		undefined;

	// Status — look through info table rows
	let status: MangaDetails["status"] | undefined;
	$(".manga-info-text li, .table-value").each((_i, el) => {
		const item = $(el);
		const text = item.text();
		if (text.toLowerCase().includes("status")) {
			const statusText =
				item.find("a").text() || item.text().replace(/status\s*:/i, "");
			const mapped = mapStatus(statusText);
			if (mapped) {
				status = mapped;
			}
		}
	});

	// Genres
	const genres: string[] = [];
	$(
		".manga-info-text .genres a, .story-info-right .info-item a[href*='genre']",
	).each((_i, el) => {
		const genre = $(el).text().trim();
		if (genre) {
			genres.push(genre);
		}
	});

	// Author
	const author =
		$(".manga-info-text li:contains('Author') a, .story-info-right .author a")
			.first()
			.text()
			.trim() || undefined;

	return {
		title,
		author,
		description: description || undefined,
		genres: genres.length > 0 ? genres : undefined,
		status,
		thumbnailUrl,
	};
}

function parseImagesFromPage($: CheerioAPI): PageUrl[] {
	const pages: PageUrl[] = [];

	// MangaBox uses .container-chapter-reader img or #vungdoc img
	const container =
		$(".container-chapter-reader img").length > 0
			? $(".container-chapter-reader img")
			: $("#vungdoc img");

	container.each((_i, el) => {
		const src = HtmlEngine.imgAttr($(el)).trim();
		if (src) {
			pages.push(src);
		}
	});

	return pages;
}

// --- MangaBoxEngine ---

export class MangaBoxEngine extends HtmlEngine {
	async getPopularManga(page: number): Promise<MangaPage> {
		const url = `${this.baseUrl}/manga_list?type=topview&category=all&state=all&page=${page}`;
		const $ = await this.fetchDocument(url);
		const manga = parseMangaList($);

		return {
			manga,
			hasNextPage: manga.length >= MANGA_PER_PAGE || hasNextPage($),
		};
	}

	async getLatestUpdates(page: number): Promise<MangaPage> {
		const url = `${this.baseUrl}/manga_list?type=latest&category=all&state=all&page=${page}`;
		const $ = await this.fetchDocument(url);
		const manga = parseMangaList($);

		return {
			manga,
			hasNextPage: manga.length >= MANGA_PER_PAGE || hasNextPage($),
		};
	}

	async searchManga(
		page: number,
		query: string,
		_filters?: FilterList,
	): Promise<MangaPage> {
		// Replace spaces with underscores per MangaBox convention
		const encodedQuery = query.replaceAll(/\s+/g, "_");
		const url = `${this.baseUrl}/search/story/${encodedQuery}?page=${page}`;
		const $ = await this.fetchDocument(url);
		const manga = parseMangaList($);

		return {
			manga,
			hasNextPage: manga.length >= MANGA_PER_PAGE || hasNextPage($),
		};
	}

	async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
		const fullUrl = this.absUrl(mangaUrl);
		const $ = await this.fetchDocument(fullUrl);
		return parseDetailsFromPage($);
	}

	async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
		// MangaBox chapters are on the detail page itself
		const fullUrl = this.absUrl(mangaUrl);
		const $ = await this.fetchDocument(
			fullUrl,
			`detail-for-chapters:${mangaUrl}`,
		);
		return parseChaptersFromPage($);
	}

	async getPageList(chapterUrl: string): Promise<PageUrl[]> {
		const fullUrl = this.absUrl(chapterUrl);
		const $ = await this.fetchDocument(fullUrl);
		return parseImagesFromPage($);
	}
}

export default MangaBoxEngine;
