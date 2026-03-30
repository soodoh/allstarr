import { ApiEngine } from "../engines/api-engine";
import { createApiFetcher } from "src/server/api-cache";
import { registerSource } from "../registry";
import type {
  MangaPage,
  MangaDetails,
  SourceChapter,
  PageUrl,
  SourceManga,
  FilterList,
} from "../types";

// --- MangaPlus API response types ---

type MangaPlusTitle = {
  titleId: number;
  name: string;
  author: string;
  portraitImageUrl: string;
  landscapeImageUrl?: string;
  viewCount?: number;
  language?: string;
};

type MangaPlusTitleGroup = {
  titles?: MangaPlusTitle[];
};

type MangaPlusAllTitlesResponse = {
  success?: {
    allTitlesViewV2?: {
      AllTitlesGroup?: MangaPlusTitleGroup[];
    };
  };
};

type MangaPlusChapter = {
  chapterId: number;
  name: string;
  subTitle: string | null;
  startTimeStamp: number;
  endTimeStamp?: number;
  isVerticalOnly?: boolean;
};

type MangaPlusChapterGroup = {
  chapterList?: MangaPlusChapter[];
  firstChapterList?: MangaPlusChapter[];
  lastChapterList?: MangaPlusChapter[];
  midChapterList?: MangaPlusChapter[];
};

type MangaPlusTitleDetail = {
  title: MangaPlusTitle;
  titleImageUrl?: string;
  overview?: string;
  viewingPeriodDescription?: string;
  nonAppearanceInfo?: string;
  chapterListGroup?: MangaPlusChapterGroup[];
  isSimulReleased?: boolean;
  isSubscribed?: boolean;
};

type MangaPlusTitleDetailResponse = {
  success?: {
    titleDetailView?: MangaPlusTitleDetail;
  };
};

type MangaPlusPage = {
  mangaPage?: {
    imageUrl: string;
    width: number;
    height: number;
    encryptionKey?: string;
  };
};

type MangaPlusMangaViewerResponse = {
  success?: {
    mangaViewer?: {
      pages?: MangaPlusPage[];
    };
  };
};

// --- Constants ---

const MANGAPLUS_BASE = "https://jumpg-webapi.tokyo-cdn.com";

// --- Helper functions ---

function titleToSourceManga(title: MangaPlusTitle): SourceManga {
  return {
    url: String(title.titleId),
    title: title.name,
    thumbnailUrl: title.portraitImageUrl,
  };
}

function mapStatus(
  detail: MangaPlusTitleDetail,
): MangaDetails["status"] | undefined {
  // MangaPlus doesn't expose a direct status field.
  // If nonAppearanceInfo is set, it typically means the series is on hiatus or completed.
  if (detail.nonAppearanceInfo) {
    return "complete";
  }
  return "ongoing";
}

function extractAllChapters(
  chapterGroups?: MangaPlusChapterGroup[],
): MangaPlusChapter[] {
  if (!chapterGroups) {
    return [];
  }

  const chapters: MangaPlusChapter[] = [];
  for (const group of chapterGroups) {
    if (group.firstChapterList) {
      chapters.push(...group.firstChapterList);
    }
    if (group.midChapterList) {
      chapters.push(...group.midChapterList);
    }
    if (group.lastChapterList) {
      chapters.push(...group.lastChapterList);
    }
    if (group.chapterList) {
      chapters.push(...group.chapterList);
    }
  }
  return chapters;
}

function parseChapterNumber(name: string): number | undefined {
  // MangaPlus chapter names follow patterns like "#001", "#123", "ex1", etc.
  const match = name.match(/#(\d+)/);
  if (match) {
    return Number.parseInt(match[1], 10);
  }
  return undefined;
}

// --- MangaPlus source ---

class MangaPlusSource extends ApiEngine {
  // Separate fetcher with longer TTL for the title list (it's a large payload)
  private readonly titleListFetcher: ReturnType<typeof createApiFetcher>;

  constructor() {
    super({
      id: "mangaplus",
      name: "MangaPlus",
      baseUrl: MANGAPLUS_BASE,
      lang: "en",
      supportsLatest: false,
      rateLimit: { maxRequests: 2, windowMs: 1000 },
    });

    this.titleListFetcher = createApiFetcher({
      name: "manga-source-mangaplus-titles",
      cache: { ttlMs: 30 * 60 * 1000, maxEntries: 10 },
      rateLimit: { maxRequests: 2, windowMs: 1000 },
      retry: { maxRetries: 2, baseDelayMs: 1000 },
    });
  }

  private async fetchAllTitles(): Promise<MangaPlusTitle[]> {
    const url = `${this.baseUrl}/api/title_list/allV2`;
    const data = await this.titleListFetcher.fetch<MangaPlusAllTitlesResponse>(
      "mangaplus:all-titles",
      async () => {
        const response = await fetch(url, {
          headers: MangaPlusSource.getHeaders(),
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${url}`);
        }
        return response.json() as Promise<MangaPlusAllTitlesResponse>;
      },
    );

    const groups = data.success?.allTitlesViewV2?.AllTitlesGroup ?? [];
    const titles: MangaPlusTitle[] = [];
    for (const group of groups) {
      if (group.titles) {
        titles.push(...group.titles);
      }
    }
    return titles;
  }

  async searchManga(
    page: number,
    query: string,
    _filters?: FilterList,
  ): Promise<MangaPage> {
    // MangaPlus doesn't have a search endpoint — filter the full title list
    const allTitles = await this.fetchAllTitles();
    const lowerQuery = query.toLowerCase();

    const matching = allTitles.filter(
      (t) =>
        t.name.toLowerCase().includes(lowerQuery) ||
        t.author.toLowerCase().includes(lowerQuery),
    );

    const PAGE_SIZE = 20;
    const start = (page - 1) * PAGE_SIZE;
    const paged = matching.slice(start, start + PAGE_SIZE);

    return {
      manga: paged.map(titleToSourceManga),
      hasNextPage: start + PAGE_SIZE < matching.length,
    };
  }

  async getPopularManga(page: number): Promise<MangaPage> {
    const allTitles = await this.fetchAllTitles();

    // Sort by view count descending (popular)
    const sorted = [...allTitles].toSorted(
      (a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0),
    );

    const PAGE_SIZE = 20;
    const start = (page - 1) * PAGE_SIZE;
    const paged = sorted.slice(start, start + PAGE_SIZE);

    return {
      manga: paged.map(titleToSourceManga),
      hasNextPage: start + PAGE_SIZE < sorted.length,
    };
  }

  async getLatestUpdates(_page: number): Promise<MangaPage> {
    // MangaPlus doesn't support a "latest" sort (supportsLatest is false)
    void this.baseUrl;
    return { manga: [], hasNextPage: false };
  }

  async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
    const titleId = mangaUrl;
    const url = `${this.baseUrl}/api/title_detailV3?title_id=${titleId}`;

    const data = await this.fetchJson<MangaPlusTitleDetailResponse>(url);
    const detail = data.success?.titleDetailView;

    if (!detail) {
      throw new Error(`MangaPlus: no detail found for title ${titleId}`);
    }

    const { title } = detail;

    return {
      title: title.name,
      author: title.author || undefined,
      description: detail.overview,
      status: mapStatus(detail),
      type: "manga",
      thumbnailUrl: title.portraitImageUrl,
    };
  }

  async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
    const titleId = mangaUrl;
    const url = `${this.baseUrl}/api/title_detailV3?title_id=${titleId}`;

    const data = await this.fetchJson<MangaPlusTitleDetailResponse>(url);
    const detail = data.success?.titleDetailView;
    if (!detail) {
      return [];
    }

    const rawChapters = extractAllChapters(detail.chapterListGroup);

    // Deduplicate by chapterId
    const seen = new Set<number>();
    const chapters: SourceChapter[] = [];

    for (const ch of rawChapters) {
      if (seen.has(ch.chapterId)) {
        continue;
      }
      seen.add(ch.chapterId);

      const chapterNum = parseChapterNumber(ch.name);

      const name = ch.subTitle ? `${ch.name}: ${ch.subTitle}` : ch.name;

      chapters.push({
        url: String(ch.chapterId),
        name,
        chapterNumber: chapterNum,
        dateUpload: new Date(ch.startTimeStamp * 1000),
      });
    }

    return chapters;
  }

  async getPageList(chapterUrl: string): Promise<PageUrl[]> {
    const chapterId = chapterUrl;
    const url =
      `${this.baseUrl}/api/manga_viewer` +
      `?chapter_id=${chapterId}&split=yes&img_quality=high`;

    // Don't cache page URLs (they may expire)
    const cacheKey = `mangaplus-pages:${chapterId}:${Date.now()}`;
    const data = await this.fetchJson<MangaPlusMangaViewerResponse>(
      url,
      cacheKey,
    );

    const pages = data.success?.mangaViewer?.pages ?? [];
    return pages
      .filter((p) => p.mangaPage?.imageUrl)
      .map((p) => p.mangaPage!.imageUrl);
  }

  protected static override getHeaders(): Record<string, string> {
    return {
      "User-Agent": "Allstarr/1.0",
      "Session-Token": crypto.randomUUID(),
    };
  }
}

registerSource({
  id: "mangaplus",
  name: "MangaPlus",
  lang: "en",
  group: "api",
  factory: () => new MangaPlusSource(),
});
