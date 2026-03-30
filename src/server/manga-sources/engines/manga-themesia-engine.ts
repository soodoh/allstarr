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

function parseMangaCard(
  el: Cheerio<AnyNode>,
  _$: CheerioAPI,
  _baseUrl: string,
): SourceManga | null {
  const link = el.find("a").first();
  const href = link.attr("href");
  if (!href) {
    return null;
  }

  const title =
    el.find(".bigor .tt").text().trim() ||
    link.attr("title")?.trim() ||
    el.find("img").first().attr("alt")?.trim() ||
    "";

  const img = el.find("img").first();
  const thumbnailUrl = HtmlEngine.imgAttr(img) || undefined;

  const url = href.startsWith("http") ? new URL(href).pathname : href;

  return {
    url,
    title,
    thumbnailUrl,
  };
}

function parseMangaList($: CheerioAPI, baseUrl: string): SourceManga[] {
  const manga: SourceManga[] = [];

  // MangaThemesia uses .bsx or .bs items
  let items = $(".bsx");
  if (items.length === 0) {
    items = $(".bs");
  }

  items.each((_i, el) => {
    const entry = parseMangaCard($(el), $, baseUrl);
    if (entry) {
      manga.push(entry);
    }
  });

  return manga;
}

function hasNextPage($: CheerioAPI): boolean {
  // Check for next page button
  return $(".hpage .r").length > 0 || $(".next").length > 0;
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

  $("#chapterlist li").each((_i, el) => {
    const item = $(el);
    const link = item.find("a").first();
    const href = link.attr("href");
    if (!href) {
      return;
    }

    const name = item.find(".chapternum").text().trim() || link.text().trim();
    const url = href.startsWith("http") ? new URL(href).pathname : href;

    const dateText = item.find(".chapterdate").text();
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

function parseDetailsFromPage($: CheerioAPI): MangaDetails {
  // Title
  const title = $(".entry-title").text().trim() || "Unknown";

  // Cover image
  const coverEl = $(".thumb img").first();
  const thumbnailUrl = HtmlEngine.imgAttr(coverEl) || undefined;

  // Description
  const description =
    $(".entry-content[itemprop='description']").text().trim() ||
    $(".summary .sstory").text().trim() ||
    undefined;

  // Status
  let status: MangaDetails["status"] | undefined;
  $(".tsinfo .imptdt").each((_i, el) => {
    const item = $(el);
    if (item.text().toLowerCase().includes("status")) {
      const statusText = item.find("i").text();
      const mapped = mapStatus(statusText);
      if (mapped) {
        status = mapped;
      }
    }
  });

  // Genres
  const genres: string[] = [];
  $(".mgen a").each((_i, el) => {
    const genre = $(el).text().trim();
    if (genre) {
      genres.push(genre);
    }
  });

  // Author — try tsinfo first, then fmed fallback
  let author: string | undefined;
  $(".tsinfo .imptdt").each((_i, el) => {
    const item = $(el);
    if (item.text().toLowerCase().includes("author")) {
      const text = item.find("i").text().trim();
      if (text) {
        author = text;
      }
    }
  });
  if (!author) {
    // Fallback: .fmed b:contains("Author") + span
    $(".fmed").each((_i, el) => {
      const fmed = $(el);
      if (fmed.find("b").text().toLowerCase().includes("author")) {
        const text = fmed.find("span").text().trim();
        if (text) {
          author = text;
        }
      }
    });
  }

  return {
    title,
    author,
    description: description || undefined,
    genres: genres.length > 0 ? genres : undefined,
    status,
    thumbnailUrl,
  };
}

function parseImagesFromReader($: CheerioAPI, baseUrl: string): PageUrl[] {
  const pages: PageUrl[] = [];

  $("#readerarea img").each((_i, el) => {
    const img = $(el);
    const src = HtmlEngine.imgAttr(img).trim();
    if (src) {
      const absolute = src.startsWith("http")
        ? src
        : `${baseUrl}${src.startsWith("/") ? "" : "/"}${src}`;
      pages.push(absolute);
    }
  });

  return pages;
}

function parseImagesFromJs(html: string): PageUrl[] {
  const tsReaderMatch = html.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
  if (tsReaderMatch) {
    try {
      const data = JSON.parse(tsReaderMatch[1]) as {
        sources?: Array<{ images?: string[] }>;
      };
      const images = data.sources?.[0]?.images ?? [];
      return images;
    } catch {
      // JSON parse failed, return empty
    }
  }
  return [];
}

// --- MangaThemesiaEngine ---

export class MangaThemesiaEngine extends HtmlEngine {
  async getPopularManga(page: number): Promise<MangaPage> {
    const url = `${this.baseUrl}/manga/?page=${page}&order=popular`;
    const $ = await this.fetchDocument(url);
    const manga = parseMangaList($, this.baseUrl);

    return {
      manga,
      hasNextPage: manga.length >= MANGA_PER_PAGE || hasNextPage($),
    };
  }

  async getLatestUpdates(page: number): Promise<MangaPage> {
    const url = `${this.baseUrl}/manga/?page=${page}&order=update`;
    const $ = await this.fetchDocument(url);
    const manga = parseMangaList($, this.baseUrl);

    return {
      manga,
      hasNextPage: manga.length >= MANGA_PER_PAGE || hasNextPage($),
    };
  }

  async searchManga(
    _page: number,
    query: string,
    _filters?: FilterList,
  ): Promise<MangaPage> {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
    const $ = await this.fetchDocument(url);
    const manga = parseMangaList($, this.baseUrl);

    return {
      manga,
      hasNextPage: hasNextPage($),
    };
  }

  async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
    const fullUrl = this.absUrl(mangaUrl);
    const $ = await this.fetchDocument(fullUrl);
    return parseDetailsFromPage($);
  }

  async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
    const fullUrl = this.absUrl(mangaUrl);
    const $ = await this.fetchDocument(
      fullUrl,
      `detail-for-chapters:${mangaUrl}`,
    );
    return parseChaptersFromPage($);
  }

  async getPageList(chapterUrl: string): Promise<PageUrl[]> {
    const fullUrl = this.absUrl(chapterUrl);

    // Fetch raw HTML so we can try both strategies
    const html = await this.fetcher.fetch<string>(
      `raw:${fullUrl}`,
      async () => {
        const response = await fetch(fullUrl, {
          headers: HtmlEngine.getHeaders(),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${fullUrl}`);
        }
        return response.text();
      },
    );

    // Strategy 1: parse <img> tags inside #readerarea
    const $ = cheerio.load(html);
    const pages = parseImagesFromReader($, this.baseUrl);
    if (pages.length > 0) {
      return pages;
    }

    // Strategy 2: extract from ts_reader.run() JS call
    return parseImagesFromJs(html);
  }
}

export default MangaThemesiaEngine;
