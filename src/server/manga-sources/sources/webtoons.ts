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

const BASE_URL = "https://www.webtoons.com";
const PAGE_SIZE = 20;

// --- Module-level helpers ---

function parseTitleNo(url: string): string | undefined {
	const match = url.match(/[?&]title_no=(\d+)/);
	return match ? match[1] : undefined;
}

function parseSearchCard(el: Cheerio<AnyNode>): SourceManga | null {
	// Webtoons search result structure varies; try common selectors
	const link = el.find("a").first();
	const href = link.attr("href");
	if (!href) {
		return null;
	}

	const titleNo = parseTitleNo(href);
	if (!titleNo) {
		return null;
	}

	const title =
		el.find(".subj, .info .subj, h3, h4").first().text().trim() ||
		link.attr("title")?.trim() ||
		"";

	if (!title) {
		return null;
	}

	const img = el.find("img").first();
	const thumbnailUrl = HtmlEngine.imgAttr(img) || undefined;

	// Build canonical URL including title_no
	const urlPath = href.startsWith("http") ? new URL(href).pathname : href;
	const url = `${urlPath}?title_no=${titleNo}`;

	return { url, title, thumbnailUrl };
}

function parsePopularCard(el: Cheerio<AnyNode>): SourceManga | null {
	const link = el.find("a").first();
	const href = link.attr("href");
	if (!href) {
		return null;
	}

	const titleNo = parseTitleNo(href);
	if (!titleNo) {
		return null;
	}

	const title =
		el.find(".subj, .info .subj, h3, h4").first().text().trim() ||
		link.attr("title")?.trim() ||
		"";

	if (!title) {
		return null;
	}

	const img = el.find("img").first();
	const thumbnailUrl = HtmlEngine.imgAttr(img) || undefined;

	const urlPath = href.startsWith("http") ? new URL(href).pathname : href;
	const url = `${urlPath}?title_no=${titleNo}`;

	return { url, title, thumbnailUrl };
}

function parseChapterNumber(name: string): number | undefined {
	// Webtoons episodes: "Episode 123" or "#123"
	const epMatch = name.match(/(?:episode|ep\.?|#)\s*([\d.]+)/i);
	if (epMatch) {
		const num = Number.parseFloat(epMatch[1]);
		return Number.isNaN(num) ? undefined : num;
	}
	return undefined;
}

function parseChapterDate(dateText: string): Date | undefined {
	const trimmed = dateText.trim();
	if (!trimmed) {
		return undefined;
	}
	const parsed = new Date(trimmed);
	if (!Number.isNaN(parsed.getTime())) {
		return parsed;
	}
	return undefined;
}

function parseChaptersFromPage(
	$: CheerioAPI,
	titleNo: string,
): SourceChapter[] {
	const chapters: SourceChapter[] = [];

	// Webtoons episode list items
	$("li[id^='episode_'] a, #_listUl li a, .detail_lst li a").each((_i, el) => {
		const link = $(el);
		const href = link.attr("href");
		if (!href) {
			return;
		}

		const name =
			link.find(".subj span, .subj").first().text().trim() ||
			link.text().trim();

		const urlPath = href.startsWith("http") ? new URL(href).pathname : href;
		const episodeNo = href.match(/[?&]episode_no=(\d+)/)?.[1];
		const url = episodeNo
			? `${urlPath}?title_no=${titleNo}&episode_no=${episodeNo}`
			: urlPath;

		const chapterNumber = parseChapterNumber(name);

		const dateText = link
			.closest("li")
			.find(".date, .upload_date")
			.text()
			.trim();
		const dateUpload = parseChapterDate(dateText);

		chapters.push({ url, name, chapterNumber, dateUpload });
	});

	return chapters;
}

// --- Webtoons source ---

class WebtoonsSource extends HtmlEngine {
	constructor() {
		super({
			id: "webtoons",
			name: "Webtoons",
			baseUrl: BASE_URL,
			lang: "en",
			supportsLatest: false,
			rateLimit: { maxRequests: 2, windowMs: 1000 },
		});
	}

	async searchManga(
		page: number,
		query: string,
		_filters?: FilterList,
	): Promise<MangaPage> {
		const url =
			`${BASE_URL}/en/search?keyword=${encodeURIComponent(query)}` +
			`&searchType=WEBTOON&page=${page}`;
		const $ = await this.fetchDocument(url);

		const manga: SourceManga[] = [];

		// Search result cards
		$(
			".card_item, .search_lst li, .search_result li, [class*='search'] li",
		).each((_i, el) => {
			const entry = parseSearchCard($(el));
			if (entry) {
				manga.push(entry);
			}
		});

		return { manga, hasNextPage: manga.length >= PAGE_SIZE };
	}

	async getPopularManga(page: number): Promise<MangaPage> {
		// Webtoons top page — paginated via ?page= on genre or genre-less top
		const url =
			page === 1 ? `${BASE_URL}/en/top` : `${BASE_URL}/en/top?page=${page}`;
		const $ = await this.fetchDocument(url);

		const manga: SourceManga[] = [];

		$(".card_item, .top_lst li, .lst_type1 li, [class*='ranking'] li").each(
			(_i, el) => {
				const entry = parsePopularCard($(el));
				if (entry) {
					manga.push(entry);
				}
			},
		);

		return { manga, hasNextPage: manga.length >= PAGE_SIZE };
	}

	async getLatestUpdates(_page: number): Promise<MangaPage> {
		// supportsLatest is false; this should not be called
		void this.supportsLatest;
		return { manga: [], hasNextPage: false };
	}

	async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
		const fullUrl = this.absUrl(mangaUrl);
		const $ = await this.fetchDocument(fullUrl);

		const title =
			$(".detail_header .subj, .info .subj, h1.subj").first().text().trim() ||
			$("h1").first().text().trim() ||
			"Unknown";

		// Cover image
		const coverEl = $(
			".detail_header .thmb img, .info_lst .thmb img, .thumb img",
		).first();
		const thumbnailUrl = HtmlEngine.imgAttr(coverEl) || undefined;

		// Description
		const description =
			$(".detail_header .summary, .info .summary, [class*='summary']")
				.first()
				.text()
				.trim() || undefined;

		// Genre / genres
		const genres: string[] = [];
		$(
			".detail_header .genre, .info .genre, a[href*='/en/'][href*='/list']",
		).each((_i, el) => {
			const genre = $(el).text().trim();
			if (genre && !genre.includes("?")) {
				genres.push(genre);
			}
		});

		// Author
		const author =
			$(".detail_header .author, .info .author").first().text().trim() ||
			undefined;

		// Webtoons are always "ongoing" unless explicitly stated
		let status: MangaDetails["status"] | undefined;
		const statusText = $(".detail_header .grade_area, .complete_cont")
			.text()
			.toLowerCase();
		if (statusText.includes("complete")) {
			status = "complete";
		} else {
			status = "ongoing";
		}

		return {
			title,
			author: author || undefined,
			description: description || undefined,
			genres: genres.length > 0 ? genres : undefined,
			status,
			type: "manhwa",
			thumbnailUrl,
		};
	}

	async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
		const fullUrl = this.absUrl(mangaUrl);

		// Extract title_no from the URL
		const titleNo = parseTitleNo(mangaUrl) ?? parseTitleNo(fullUrl) ?? "0";

		const $ = await this.fetchDocument(
			fullUrl,
			`webtoons-chapters:${mangaUrl}`,
		);
		return parseChaptersFromPage($, titleNo);
	}

	async getPageList(chapterUrl: string): Promise<PageUrl[]> {
		const fullUrl = this.absUrl(chapterUrl);
		const $ = await this.fetchDocument(fullUrl);

		const pages: PageUrl[] = [];

		// Webtoons viewer image list
		$(
			"#_imageList img, ._images img, .viewer_lst img, [class*='viewer'] img",
		).each((_i, el) => {
			const src = HtmlEngine.imgAttr($(el)).trim();
			if (src) {
				pages.push(src);
			}
		});

		return pages;
	}
}

registerSource({
	id: "webtoons",
	name: "Webtoons",
	lang: "en",
	group: "standalone",
	factory: () => new WebtoonsSource(),
});
