// oxlint-disable import/prefer-default-export
/**
 * Centralised query-key factory.
 *
 * Each domain has an `all` key (e.g. `["authors"]`) which is used for
 * prefix-based bulk invalidation. More specific keys (lists, detail, etc.)
 * are nested under it so that `invalidateQueries({ queryKey: queryKeys.authors.all })`
 * wipes every `authors.*` cache entry at once.
 */

export const queryKeys = {
  // ─── Authors ─────────────────────────────────────────────────────────────
  authors: {
    all: ["authors"] as const,
    lists: () => ["authors", "list"] as const,
    infinite: (search: string) => ["authors", "infinite", search] as const,
    booksInfinite: (
      authorId: number,
      search: string,
      language: string,
      sortKey?: string,
      sortDir?: string,
    ) =>
      [
        "authors",
        "booksInfinite",
        authorId,
        search,
        language,
        sortKey,
        sortDir,
      ] as const,
    detail: (id: number) => ["authors", "detail", id] as const,
    existence: (foreignId: string) =>
      ["authors", "existence", foreignId] as const,
  },

  // ─── Books ───────────────────────────────────────────────────────────────
  books: {
    all: ["books"] as const,
    lists: () => ["books", "list"] as const,
    infinite: (
      search: string,
      monitored?: boolean,
      sortKey?: string,
      sortDir?: string,
    ) => ["books", "infinite", search, monitored, sortKey, sortDir] as const,
    editionsInfinite: (bookId: number, sortKey?: string, sortDir?: string) =>
      ["books", "editionsInfinite", bookId, sortKey, sortDir] as const,
    detail: (id: number) => ["books", "detail", id] as const,
    existence: (foreignBookIds: string[]) =>
      ["books", "existence", ...foreignBookIds] as const,
  },

  // ─── Movies ──────────────────────────────────────────────────────────────
  movies: {
    all: ["movies"] as const,
    lists: () => ["movies", "list"] as const,
    detail: (id: number) => ["movies", "detail", id] as const,
    existence: (tmdbId: number) => ["movies", "existence", tmdbId] as const,
  },

  // ─── Movie Collections ────────────────────────────────────────────────
  movieCollections: {
    all: ["movieCollections"] as const,
    list: () => ["movieCollections", "list"] as const,
  },

  // ─── Shows ───────────────────────────────────────────────────────────────
  shows: {
    all: ["shows"] as const,
    lists: () => ["shows", "list"] as const,
    detail: (id: number) => ["shows", "detail", id] as const,
    existence: (tmdbId: number) => ["shows", "existence", tmdbId] as const,
  },

  // ─── Manga ──────────────────────────────────────────────────────────────
  manga: {
    all: ["manga"] as const,
    lists: () => ["manga", "list"] as const,
    detail: (id: number) => ["manga", "detail", id] as const,
    existence: (mangaUpdatesId: number) =>
      ["manga", "existence", mangaUpdatesId] as const,
  },

  // ─── MangaUpdates ─────────────────────────────────────────────────────
  mangaUpdates: {
    all: ["mangaUpdates"] as const,
    search: (query: string) => ["mangaUpdates", "search", query] as const,
    detail: (seriesId: number) => ["mangaUpdates", "detail", seriesId] as const,
    releases: (seriesId: number) =>
      ["mangaUpdates", "releases", seriesId] as const,
    groups: (seriesId: number) => ["mangaUpdates", "groups", seriesId] as const,
  },

  // ─── TMDB ────────────────────────────────────────────────────────────────
  tmdb: {
    all: ["tmdb"] as const,
    searchMovies: (query: string) => ["tmdb", "searchMovies", query] as const,
    searchShows: (query: string) => ["tmdb", "searchShows", query] as const,
    searchMulti: (query: string) => ["tmdb", "searchMulti", query] as const,
  },

  // ─── History ─────────────────────────────────────────────────────────────
  history: {
    all: ["history"] as const,
    list: (params: { page?: number; limit?: number; eventType?: string }) =>
      ["history", "list", params] as const,
  },

  // ─── Download Profiles ──────────────────────────────────────────────────
  downloadProfiles: {
    all: ["downloadProfiles"] as const,
    lists: () => ["downloadProfiles", "list"] as const,
    detail: (id: number) => ["downloadProfiles", "detail", id] as const,
  },

  // ─── Download Formats ─────────────────────────────────────────────────
  downloadFormats: {
    all: ["downloadFormats"] as const,
    lists: () => ["downloadFormats", "list"] as const,
  },

  // ─── Custom Formats ───────────────────────────────────────────────────
  customFormats: {
    all: ["customFormats"] as const,
    lists: () => [...queryKeys.customFormats.all, "list"] as const,
    detail: (id: number) =>
      [...queryKeys.customFormats.all, "detail", id] as const,
    profileScores: (profileId: number) =>
      [...queryKeys.customFormats.all, "profileScores", profileId] as const,
  },

  // ─── Dashboard ──────────────────────────────────────────────────────────
  dashboard: {
    all: ["dashboard"] as const,
  },

  // ─── Settings ────────────────────────────────────────────────────────────
  settings: {
    all: ["settings"] as const,
    map: () => ["settings", "map"] as const,
  },

  // ─── Import Exclusions ────────────────────────────────────────────────
  importExclusions: {
    all: ["importExclusions"] as const,
    books: () => ["importExclusions", "books"] as const,
    movies: () => ["importExclusions", "movies"] as const,
  },

  // ─── Metadata Profile ──────────────────────────────────────────────────
  metadataProfile: {
    all: ["metadataProfile"] as const,
  },

  // ─── Download Clients ────────────────────────────────────────────────────
  downloadClients: {
    all: ["downloadClients"] as const,
    lists: () => ["downloadClients", "list"] as const,
  },

  // ─── Indexers ────────────────────────────────────────────────────────────
  indexers: {
    all: ["indexers"] as const,
    lists: () => ["indexers", "list"] as const,
    hasEnabled: () => ["indexers", "hasEnabled"] as const,
    search: (bookId: number) => ["indexers", "search", bookId] as const,
    releaseStatus: (bookId: number) =>
      ["indexers", "releaseStatus", bookId] as const,
  },

  // ─── Synced Indexers (pushed from Prowlarr) ───────────────────────────────
  syncedIndexers: {
    all: ["syncedIndexers"] as const,
    lists: () => ["syncedIndexers", "list"] as const,
  },

  // ─── Hardcover ───────────────────────────────────────────────────────────
  hardcover: {
    all: ["hardcover"] as const,
    search: (query: string, type: string) =>
      ["hardcover", "search", query, type] as const,
    author: (
      foreignAuthorId: number,
      params: {
        page: number;
        pageSize: number;
        language: string;
        sortBy: string;
        sortDir: string;
      },
    ) => ["hardcover", "author", foreignAuthorId, params] as const,
    authorSeries: (slug: string, lang: string) =>
      ["hardcover", "authorSeries", slug, lang] as const,
    seriesBooks: (id: number, lang: string) =>
      ["hardcover", "seriesBooks", id, lang] as const,
    bookEditions: (
      foreignBookId: number,
      params: {
        page: number;
        pageSize: number;
        sortBy: string;
        sortDir: string;
      },
    ) => ["hardcover", "bookEditions", foreignBookId, params] as const,
    bookLanguages: (foreignBookId: number) =>
      ["hardcover", "bookLanguages", foreignBookId] as const,
    bookDetail: (foreignBookId: number) =>
      ["hardcover", "bookDetail", foreignBookId] as const,
    seriesComplete: (
      foreignSeriesIds: number[],
      excludeForeignAuthorId?: number,
    ) =>
      [
        "hardcover",
        "seriesComplete",
        excludeForeignAuthorId ?? 0,
        ...foreignSeriesIds,
      ] as const,
  },

  // ─── Queue ─────────────────────────────────────────────────────────────
  queue: {
    all: ["queue"] as const,
    list: () => ["queue", "list"] as const,
  },

  // ─── Blocklist ────────────────────────────────────────────────────────
  blocklist: {
    all: ["blocklist"] as const,
    list: (params: { page?: number; limit?: number }) =>
      ["blocklist", "list", params] as const,
  },

  // ─── Commands ──────────────────────────────────────────────────────────
  commands: {
    all: ["commands"] as const,
    active: () => ["commands", "active"] as const,
  },

  // ─── Tasks ─────────────────────────────────────────────────────────────
  tasks: {
    all: ["tasks"] as const,
    list: () => ["tasks", "list"] as const,
  },

  // ─── User Settings ────────────────────────────────────────────────────
  userSettings: {
    all: ["userSettings"] as const,
    byTable: (tableId: string) => ["userSettings", tableId] as const,
  },

  // ─── System Status ──────────────────────────────────────────────────────
  systemStatus: {
    all: ["systemStatus"] as const,
    detail: () => ["systemStatus", "detail"] as const,
  },

  // ─── Filesystem ──────────────────────────────────────────────────────────
  filesystem: {
    all: ["filesystem"] as const,
    browse: (path: string) => ["filesystem", "browse", path] as const,
  },
} as const;
