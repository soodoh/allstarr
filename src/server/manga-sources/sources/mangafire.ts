import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { HtmlEngine } from "../engines/html-engine";
import { registerSource } from "../registry";
import type {
  MangaPage,
  MangaDetails,
  SourceChapter,
  PageUrl,
  SourceManga,
  FilterList,
} from "../types";

// --- Constants ---

const BASE_URL = "https://mangafire.to";
const PAGE_SIZE = 20;

// --- Module-level helpers ---

function mapStatus(text: string): MangaDetails["status"] | undefined {
  const lower = text.toLowerCase().trim();
  if (lower.includes("releasing") || lower.includes("ongoing")) {
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
    lower.includes("discontinued")
  ) {
    return "cancelled";
  }
  return undefined;
}

function parseChapterNumber(name: string): number | undefined {
  const match = name.match(/(?:chapter|ch\.?|ep\.?)\s*([\d.]+)/i);
  if (match) {
    const num = Number.parseFloat(match[1]);
    return Number.isNaN(num) ? undefined : num;
  }
  // Try plain number at end
  const numMatch = name.match(/([\d.]+)\s*$/);
  if (numMatch) {
    const num = Number.parseFloat(numMatch[1]);
    return Number.isNaN(num) ? undefined : num;
  }
  return undefined;
}

function parseMangaCard(el: Cheerio<AnyNode>): SourceManga | null {
  // Try various link selectors
  const link =
    el.find(".info a").first().attr("href") ??
    el.find("a.title").first().attr("href") ??
    el.find("a").first().attr("href");

  if (!link) {
    return null;
  }

  const img = el.find("img").first();
  const title =
    el.find(".info a").first().text().trim() ||
    img.attr("alt")?.trim() ||
    el.find("a.title").first().text().trim() ||
    el.find("a").first().attr("title")?.trim() ||
    "";

  if (!title) {
    return null;
  }

  const thumbnailUrl = HtmlEngine.imgAttr(img) || undefined;
  const url = link.startsWith("http") ? new URL(link).pathname : link;

  return { url, title, thumbnailUrl };
}

function parseMangaList($: CheerioAPI): SourceManga[] {
  const manga: SourceManga[] = [];

  // Try multiple container selectors that MangaFire uses
  const selectors = [
    ".unit .inner",
    ".original .unit",
    ".manga-list .unit",
    ".content .unit",
    ".unit",
  ];

  let items: Cheerio<AnyNode> | null = null;
  for (const sel of selectors) {
    const found = $(sel);
    if (found.length > 0) {
      items = found;
      break;
    }
  }

  if (!items || items.length === 0) {
    return manga;
  }

  items.each((_i, el) => {
    const entry = parseMangaCard($(el));
    if (entry) {
      manga.push(entry);
    }
  });

  return manga;
}

function parseChaptersFromPage($: CheerioAPI): SourceChapter[] {
  const chapters: SourceChapter[] = [];

  // MangaFire chapter list selectors
  const selectors = [
    "#chapter-list a",
    ".chapter-list a",
    ".chapter-item a",
    "[class*='chapter'] a",
  ];

  let items: Cheerio<AnyNode> | null = null;
  for (const sel of selectors) {
    const found = $(sel);
    if (found.length > 0) {
      items = found;
      break;
    }
  }

  if (!items || items.length === 0) {
    return chapters;
  }

  items.each((_i, el) => {
    const link = $(el);
    const href = link.attr("href");
    if (!href) {
      return;
    }

    const name = link.text().trim() || link.attr("title")?.trim() || "";
    const url = href.startsWith("http") ? new URL(href).pathname : href;
    const chapterNumber = parseChapterNumber(name);

    // Try to find date near the link
    const parent = link.parent();
    const dateText = parent.find(".date, .time, [class*='date']").text().trim();
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

// --- MangaFire source ---

class MangaFireSource extends HtmlEngine {
  constructor() {
    super({
      id: "mangafire",
      name: "MangaFire",
      baseUrl: BASE_URL,
      lang: "all",
      supportsLatest: true,
      rateLimit: { maxRequests: 2, windowMs: 1000 },
    });
  }

  async searchManga(
    page: number,
    query: string,
    _filters?: FilterList,
  ): Promise<MangaPage> {
    const url = `${BASE_URL}/filter?keyword=${encodeURIComponent(query)}&page=${page}`;
    const $ = await this.fetchDocument(url);
    const manga = parseMangaList($);
    return { manga, hasNextPage: manga.length >= PAGE_SIZE };
  }

  async getPopularManga(page: number): Promise<MangaPage> {
    const url = `${BASE_URL}/filter?sort=most_viewed&page=${page}`;
    const $ = await this.fetchDocument(url);
    const manga = parseMangaList($);
    return { manga, hasNextPage: manga.length >= PAGE_SIZE };
  }

  async getLatestUpdates(page: number): Promise<MangaPage> {
    const url = `${BASE_URL}/filter?sort=recently_updated&page=${page}`;
    const $ = await this.fetchDocument(url);
    const manga = parseMangaList($);
    return { manga, hasNextPage: manga.length >= PAGE_SIZE };
  }

  async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
    const fullUrl = this.absUrl(mangaUrl);
    const $ = await this.fetchDocument(fullUrl);

    const title =
      $("h1").first().text().trim() ||
      $(".manga-name").first().text().trim() ||
      "Unknown";

    const coverEl =
      $(".poster img").first().length > 0
        ? $(".poster img").first()
        : $(".cover img").first();
    const thumbnailUrl = HtmlEngine.imgAttr(coverEl) || undefined;

    const description =
      $(".info .summary").text().trim() ||
      $(".description").text().trim() ||
      $("[class*='synopsis']").text().trim() ||
      undefined;

    // Status — look for meta spans
    let status: MangaDetails["status"] | undefined;
    $(".info .meta span, .info .meta li").each((_i, el) => {
      const text = $(el).text();
      if (text.toLowerCase().includes("status")) {
        const mapped = mapStatus($(el).next().text() || text);
        if (mapped) {
          status = mapped;
        }
      }
    });
    // Also try direct status element
    if (!status) {
      const statusEl = $(".status, [class*='status']").first();
      if (statusEl.length > 0) {
        const mapped = mapStatus(statusEl.text());
        if (mapped) {
          status = mapped;
        }
      }
    }

    // Genres
    const genres: string[] = [];
    $(".info .meta a[href*='genre'], .genres a, [class*='genre'] a").each(
      (_i, el) => {
        const genre = $(el).text().trim();
        if (genre) {
          genres.push(genre);
        }
      },
    );

    // Author / artist
    const author =
      $(".info .meta a[href*='author']").first().text().trim() ||
      $(".author").first().text().trim() ||
      undefined;

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
      `mangafire-chapters:${mangaUrl}`,
    );
    return parseChaptersFromPage($);
  }

  async getPageList(chapterUrl: string): Promise<PageUrl[]> {
    const fullUrl = this.absUrl(chapterUrl);
    const $ = await this.fetchDocument(fullUrl);

    const pages: PageUrl[] = [];

    // Try reader container selectors
    const selectors = [
      ".reader-content img",
      "#reader-content img",
      ".chapter-images img",
      ".page img",
      "[class*='reader'] img",
      "[class*='chapter'] img",
    ];

    let found = false;
    for (const sel of selectors) {
      const imgs = $(sel);
      if (imgs.length > 0) {
        imgs.each((_i, el) => {
          const src = HtmlEngine.imgAttr($(el)).trim();
          if (src) {
            pages.push(src);
          }
        });
        found = true;
        break;
      }
    }

    // Fallback: all images that look like manga pages
    if (!found) {
      $("img").each((_i, el) => {
        const img = $(el);
        const src = HtmlEngine.imgAttr(img).trim();
        const width = Number.parseInt(img.attr("width") ?? "0", 10);
        const height = Number.parseInt(img.attr("height") ?? "0", 10);
        // Filter out small/navigation images
        if (
          src &&
          (width === 0 || width > 100) &&
          (height === 0 || height > 100)
        ) {
          pages.push(src);
        }
      });
    }

    return pages;
  }
}

registerSource({
  id: "mangafire",
  name: "MangaFire",
  lang: "all",
  group: "standalone",
  factory: () => new MangaFireSource(),
});
