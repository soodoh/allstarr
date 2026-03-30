export type MangaSource = {
  id: string;
  name: string;
  baseUrl: string;
  lang: string;
  supportsLatest: boolean;

  searchManga(
    page: number,
    query: string,
    filters?: FilterList,
  ): Promise<MangaPage>;
  getPopularManga(page: number): Promise<MangaPage>;
  getLatestUpdates(page: number): Promise<MangaPage>;
  getMangaDetails(mangaUrl: string): Promise<MangaDetails>;
  getChapterList(mangaUrl: string): Promise<SourceChapter[]>;
  getPageList(chapterUrl: string): Promise<PageUrl[]>;
};

export type MangaPage = {
  manga: SourceManga[];
  hasNextPage: boolean;
};

export type SourceManga = {
  url: string;
  title: string;
  thumbnailUrl?: string;
};

export type MangaDetails = {
  title: string;
  author?: string;
  artist?: string;
  description?: string;
  genres?: string[];
  status?: "ongoing" | "complete" | "hiatus" | "cancelled";
  type?: "manga" | "manhwa" | "manhua";
  thumbnailUrl?: string;
};

export type SourceChapter = {
  url: string;
  name: string;
  chapterNumber?: number;
  volumeNumber?: number;
  scanlator?: string;
  dateUpload?: Date;
};

export type PageUrl = string;

export type FilterList = Filter[];
export type Filter =
  | { type: "select"; name: string; options: string[]; value: number }
  | { type: "checkbox"; name: string; value: boolean }
  | {
      type: "tristate";
      name: string;
      value: "include" | "exclude" | "ignore";
    }
  | { type: "text"; name: string; value: string }
  | {
      type: "sort";
      name: string;
      values: string[];
      ascending: boolean;
      index: number;
    }
  | { type: "group"; name: string; filters: Filter[] };

/** Config for a theme-based site (Madara, MangaThemesia, etc.) */
export type ThemeSiteConfig = {
  name: string;
  url: string;
  lang: string;
  overrides?: Record<string, unknown>;
};

/** Source definition used by the registry */
export type SourceDefinition = {
  id: string;
  name: string;
  lang: string;
  group:
    | "api"
    | "madara"
    | "mangathemesia"
    | "madtheme"
    | "mangabox"
    | "standalone";
  factory: () => MangaSource;
};
