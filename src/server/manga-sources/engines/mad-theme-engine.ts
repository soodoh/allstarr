import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { HtmlEngine } from "./html-engine";
import type { HtmlEngineConfig } from "./html-engine";
import type {
  MangaPage,
  MangaDetails,
  SourceChapter,
  PageUrl,
  SourceManga,
  FilterList,
} from "../types";

// --- Module-level helpers (avoid class-methods-use-this lint rule) ---

const MANGA_PER_PAGE = 24;

function parseMangaCard(el: Cheerio<AnyNode>): SourceManga | null {
  const link = el.find(".title a").first();
  const href = link.attr("href") ?? el.find("a").first().attr("href");
  if (!href) {
    return null;
  }

  const title =
    link.text().trim() ||
    el.find("a").first().attr("title")?.trim() ||
    el.find("img").first().attr("alt")?.trim() ||
    "";

  const img = el.find(".thumb img").first();
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

  // MadTheme uses .book-item or .item
  let items = $(".book-item");
  if (items.length === 0) {
    items = $(".item");
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
  return $(".paging .next").length > 0 || $('a[rel="next"]').length > 0;
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

function parseChaptersFromHtml($: CheerioAPI): SourceChapter[] {
  const chapters: SourceChapter[] = [];

  if ($(".chapter-list .chapter-item").length > 0) {
    $(".chapter-list .chapter-item").each((_i, el) => {
      const item = $(el);
      const link = item.find("a").first();
      const href = link.attr("href");
      if (!href) {
        return;
      }

      const name = link.text().trim();
      const url = href.startsWith("http") ? new URL(href).pathname : href;
      const dateText = item.find(".time, .date").text();
      const dateUpload = parseChapterDate(dateText);
      const chapterNumber = parseChapterNumber(name);

      chapters.push({ url, name, chapterNumber, dateUpload });
    });
  } else {
    $(".list-chapters a").each((_i, el) => {
      const link = $(el);
      const href = link.attr("href");
      if (!href) {
        return;
      }

      const name = link.text().trim();
      const url = href.startsWith("http") ? new URL(href).pathname : href;
      const chapterNumber = parseChapterNumber(name);

      chapters.push({ url, name, chapterNumber });
    });
  }

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
    $(".detail h1").text().trim() ||
    $(".name h1").text().trim() ||
    $("h1").first().text().trim() ||
    "Unknown";

  // Cover image
  const coverEl = $(".detail .img-cover img").first();
  const thumbnailUrl = HtmlEngine.imgAttr(coverEl) || undefined;

  // Description
  const description =
    $(".summary .content").text().trim() ||
    $(".description").text().trim() ||
    undefined;

  // Status — find span containing "Status" then read next sibling/element
  let status: MangaDetails["status"] | undefined;
  $(".detail .meta span, .detail .meta div").each((_i, el) => {
    const item = $(el);
    const text = item.text();
    if (text.toLowerCase().includes("status")) {
      // Try the next element sibling
      const nextText = item.next().text();
      if (nextText) {
        const mapped = mapStatus(nextText);
        if (mapped) {
          status = mapped;
        }
      }
    }
  });

  // Genres
  const genres: string[] = [];
  $(".detail .meta .genres a, .detail .meta a[href*='genre']").each(
    (_i, el) => {
      const genre = $(el).text().trim();
      if (genre) {
        genres.push(genre);
      }
    },
  );

  // Author
  const author =
    $(".detail .meta .author a").first().text().trim() || undefined;

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

  // MadTheme uses #chapter-images or .chapter-images
  const container =
    $("#chapter-images").length > 0
      ? $("#chapter-images img")
      : $(".chapter-images img");

  container.each((_i, el) => {
    const src = HtmlEngine.imgAttr($(el)).trim();
    if (src) {
      pages.push(src);
    }
  });

  return pages;
}

// --- MadThemeEngine ---

export class MadThemeEngine extends HtmlEngine {
  async getPopularManga(page: number): Promise<MangaPage> {
    // Try /az-list first, fallback to /trending
    const url = `${this.baseUrl}/az-list/page/${page}`;
    const $ = await this.fetchDocument(url);
    const manga = parseMangaList($);

    if (manga.length > 0) {
      return {
        manga,
        hasNextPage: manga.length >= MANGA_PER_PAGE || hasNextPage($),
      };
    }

    // Fallback: /trending
    const trendingUrl = `${this.baseUrl}/trending/page/${page}`;
    const $t = await this.fetchDocument(trendingUrl);
    const trendingManga = parseMangaList($t);

    return {
      manga: trendingManga,
      hasNextPage: trendingManga.length >= MANGA_PER_PAGE || hasNextPage($t),
    };
  }

  async getLatestUpdates(page: number): Promise<MangaPage> {
    // Try /latest-manga first, fallback to /latest
    const url = `${this.baseUrl}/latest-manga/page/${page}`;
    const $ = await this.fetchDocument(url);
    const manga = parseMangaList($);

    if (manga.length > 0) {
      return {
        manga,
        hasNextPage: manga.length >= MANGA_PER_PAGE || hasNextPage($),
      };
    }

    // Fallback: /latest
    const latestUrl = `${this.baseUrl}/latest/page/${page}`;
    const $l = await this.fetchDocument(latestUrl);
    const latestManga = parseMangaList($l);

    return {
      manga: latestManga,
      hasNextPage: latestManga.length >= MANGA_PER_PAGE || hasNextPage($l),
    };
  }

  async searchManga(
    page: number,
    query: string,
    _filters?: FilterList,
  ): Promise<MangaPage> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&page=${page}`;
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
    // Extract slug from URL path
    const slug = mangaUrl.replaceAll(/^\/+|\/+$/g, "");

    // Try the API endpoint first
    const apiUrl = `${this.baseUrl}/api/manga/${slug}/chapters?source=detail`;
    try {
      const html = await this.fetcher.fetch<string>(
        `chapters:${mangaUrl}`,
        async () => {
          const response = await fetch(apiUrl, {
            headers: HtmlEngine.getHeaders(),
            signal: AbortSignal.timeout(15_000),
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${apiUrl}`);
          }
          return response.text();
        },
      );

      const $ = cheerio.load(html);
      const chapters = parseChaptersFromHtml($);
      if (chapters.length > 0) {
        return chapters;
      }
    } catch {
      // API failed, fall through to detail page scraping
    }

    // Fallback: parse from detail page
    const fullUrl = this.absUrl(mangaUrl);
    const $ = await this.fetchDocument(
      fullUrl,
      `detail-for-chapters:${mangaUrl}`,
    );
    return parseChaptersFromHtml($);
  }

  async getPageList(chapterUrl: string): Promise<PageUrl[]> {
    const fullUrl = this.absUrl(chapterUrl);
    const $ = await this.fetchDocument(fullUrl);
    return parseImagesFromPage($);
  }
}

export default MadThemeEngine;
