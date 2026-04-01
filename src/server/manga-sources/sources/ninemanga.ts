import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { HtmlEngine } from "../engines/html-engine";
import { registerSource } from "../registry";
import type {
	FilterList,
	MangaDetails,
	MangaPage,
	PageUrl,
	SourceChapter,
	SourceManga,
} from "../types";

// --- Constants ---

const BASE_URL = "https://www.ninemanga.com";
const PAGE_SIZE = 30;

// --- Module-level helpers ---

function mapStatus(text: string): MangaDetails["status"] | undefined {
	const lower = text.toLowerCase().trim();
	if (lower.includes("ongoing")) {
		return "ongoing";
	}
	if (lower.includes("completed") || lower.includes("finished")) {
		return "complete";
	}
	if (lower.includes("hiatus")) {
		return "hiatus";
	}
	if (lower.includes("cancelled") || lower.includes("canceled")) {
		return "cancelled";
	}
	return undefined;
}

function parseChapterNumber(name: string): number | undefined {
	const match = name.match(/(?:chapter|ch\.?)\s*([\d.]+)/i);
	if (match) {
		const num = Number.parseFloat(match[1]);
		return Number.isNaN(num) ? undefined : num;
	}
	// Try trailing number
	const numMatch = name.match(/([\d.]+)\s*$/);
	if (numMatch) {
		const num = Number.parseFloat(numMatch[1]);
		return Number.isNaN(num) ? undefined : num;
	}
	return undefined;
}

function parseMangaCard(el: Cheerio<AnyNode>): SourceManga | null {
	const link = el.find("a.bookname").first();
	const href = link.attr("href");
	if (!href) {
		return null;
	}

	const title = link.text().trim() || link.attr("title")?.trim() || "";
	if (!title) {
		return null;
	}

	const img = el.find("img").first();
	const thumbnailUrl = HtmlEngine.imgAttr(img) || undefined;

	const url = href.startsWith("http") ? new URL(href).pathname : href;

	return { url, title, thumbnailUrl };
}

function parseMangaList($: CheerioAPI): SourceManga[] {
	const manga: SourceManga[] = [];

	$("dl.bookinfo").each((_i, el) => {
		const entry = parseMangaCard($(el));
		if (entry) {
			manga.push(entry);
		}
	});

	return manga;
}

function parseChaptersFromPage($: CheerioAPI): SourceChapter[] {
	const chapters: SourceChapter[] = [];

	$(".chapterbox .tips a, .chapter-list a, #chapterlist a").each((_i, el) => {
		const link = $(el);
		const href = link.attr("href");
		if (!href) {
			return;
		}

		const name = link.text().trim() || link.attr("title")?.trim() || "";
		const url = href.startsWith("http") ? new URL(href).pathname : href;
		const chapterNumber = parseChapterNumber(name);

		// Date is often in sibling element
		const parent = link.parent();
		const dateText = parent
			.siblings(".update_time, .time")
			.first()
			.text()
			.trim();
		let dateUpload: Date | undefined;
		if (dateText) {
			const parsed = new Date(dateText);
			if (!Number.isNaN(parsed.getTime())) {
				dateUpload = parsed;
			}
		}

		chapters.push({ url, name, chapterNumber, dateUpload });
	});

	return chapters;
}

// --- NineManga source ---

class NineMangaSource extends HtmlEngine {
	constructor() {
		super({
			id: "ninemanga",
			name: "NineManga",
			baseUrl: BASE_URL,
			lang: "en",
			supportsLatest: true,
			rateLimit: { maxRequests: 1, windowMs: 1000 },
		});
	}

	async searchManga(
		page: number,
		query: string,
		_filters?: FilterList,
	): Promise<MangaPage> {
		const url = `${BASE_URL}/search/?wd=${encodeURIComponent(query)}&page=${page}`;
		const $ = await this.fetchDocument(url);
		const manga = parseMangaList($);
		return { manga, hasNextPage: manga.length >= PAGE_SIZE };
	}

	async getPopularManga(page: number): Promise<MangaPage> {
		const url = `${BASE_URL}/category/index_${page}.html`;
		const $ = await this.fetchDocument(url);
		const manga = parseMangaList($);
		return { manga, hasNextPage: manga.length >= PAGE_SIZE };
	}

	async getLatestUpdates(page: number): Promise<MangaPage> {
		const url = `${BASE_URL}/list/New-Update/page/${page}`;
		const $ = await this.fetchDocument(url);
		const manga = parseMangaList($);
		return { manga, hasNextPage: manga.length >= PAGE_SIZE };
	}

	async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
		const fullUrl = this.absUrl(mangaUrl);
		const $ = await this.fetchDocument(fullUrl);

		const title =
			$(".ttline h1").first().text().trim() ||
			$("h1").first().text().trim() ||
			"Unknown";

		const coverEl = $(".bookface img").first();
		const thumbnailUrl = HtmlEngine.imgAttr(coverEl) || undefined;

		const description =
			$("p[itemprop='description']").text().trim() ||
			$(".bookintro").text().trim() ||
			undefined;

		// Status — find <li> in .bookinfo containing "Status"
		let status: MangaDetails["status"] | undefined;
		$(".bookinfo li, .detail-info li").each((_i, el) => {
			const text = $(el).text();
			if (text.toLowerCase().includes("status")) {
				const mapped = mapStatus(text);
				if (mapped) {
					status = mapped;
				}
			}
		});

		// Genres
		const genres: string[] = [];
		$(
			".bookinfo a[href*='genre'], .detail-info a[href*='genre'], .category a",
		).each((_i, el) => {
			const genre = $(el).text().trim();
			if (genre) {
				genres.push(genre);
			}
		});

		// Author
		const author =
			$(".bookinfo li a[href*='author'], [itemprop='author']")
				.first()
				.text()
				.trim() || undefined;

		return {
			title,
			author: author || undefined,
			description: description || undefined,
			genres: genres.length > 0 ? genres : undefined,
			status,
			thumbnailUrl,
		};
	}

	async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
		const fullUrl = this.absUrl(mangaUrl);
		const $ = await this.fetchDocument(
			fullUrl,
			`ninemanga-chapters:${mangaUrl}`,
		);
		return parseChaptersFromPage($);
	}

	async getPageList(chapterUrl: string): Promise<PageUrl[]> {
		const fullUrl = this.absUrl(chapterUrl);
		const $ = await this.fetchDocument(fullUrl);

		const pages: PageUrl[] = [];

		// Primary selectors for NineManga
		const selectors = [
			"#manga_pic_1",
			".pic_download img",
			".read-manga img",
			"#pic_1",
		];

		// NineManga loads pages one-by-one; try to get all from a select list
		// The page count is often in a <select> dropdown — noted for future multi-page support.

		// Get the image on the current page
		for (const sel of selectors) {
			const img = $(sel);
			if (img.length > 0) {
				const src = HtmlEngine.imgAttr(img.first()).trim();
				if (src) {
					pages.push(src);
					break;
				}
			}
		}

		// If we found a page image, also look for all page links to get full chapter
		if (pages.length > 0) {
			// NineManga uses a select or numbered links for page navigation
			$("select option, .pager a, .page_select option").each((_i, el) => {
				const optEl = $(el);
				const val = optEl.attr("value") || optEl.attr("href");
				if (val && val !== fullUrl && val.startsWith("http")) {
					// We can't fetch all sub-pages here synchronously,
					// so we return what we can parse from the landing page
				}
			});
		}

		return pages;
	}
}

registerSource({
	id: "ninemanga",
	name: "NineManga",
	lang: "en",
	group: "standalone",
	factory: () => new NineMangaSource(),
});
