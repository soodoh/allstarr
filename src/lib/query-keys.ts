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
    detail: (id: number) => ["authors", "detail", id] as const,
    existence: (foreignId: string) =>
      ["authors", "existence", foreignId] as const,
    existenceBySlug: (slug: string) =>
      ["authors", "existenceBySlug", slug] as const,
  },

  // ─── Books ───────────────────────────────────────────────────────────────
  books: {
    all: ["books"] as const,
    lists: () => ["books", "list"] as const,
    infinite: (search: string) => ["books", "infinite", search] as const,
    detail: (id: number) => ["books", "detail", id] as const,
    existence: (foreignBookIds: string[]) =>
      ["books", "existence", ...foreignBookIds] as const,
  },

  // ─── Dashboard ───────────────────────────────────────────────────────────
  dashboard: {
    all: ["dashboard"] as const,
    stats: () => ["dashboard", "stats"] as const,
  },

  // ─── History ─────────────────────────────────────────────────────────────
  history: {
    all: ["history"] as const,
    list: (params: { page?: number; limit?: number; eventType?: string }) =>
      ["history", "list", params] as const,
  },

  // ─── Quality Profiles ────────────────────────────────────────────────────
  qualityProfiles: {
    all: ["qualityProfiles"] as const,
    lists: () => ["qualityProfiles", "list"] as const,
    detail: (id: number) => ["qualityProfiles", "detail", id] as const,
  },

  // ─── Quality Definitions ─────────────────────────────────────────────────
  qualityDefinitions: {
    all: ["qualityDefinitions"] as const,
    lists: () => ["qualityDefinitions", "list"] as const,
  },

  // ─── Root Folders ─────────────────────────────────────────────────────────
  rootFolders: {
    all: ["rootFolders"] as const,
    lists: () => ["rootFolders", "list"] as const,
  },

  // ─── Settings ────────────────────────────────────────────────────────────
  settings: {
    all: ["settings"] as const,
    map: () => ["settings", "map"] as const,
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
      slug: string,
      params: {
        page: number;
        pageSize: number;
        language: string;
        sortBy: string;
        sortDir: string;
      },
    ) => ["hardcover", "author", slug, params] as const,
    authorSeries: (slug: string, lang: string) =>
      ["hardcover", "authorSeries", slug, lang] as const,
    seriesBooks: (id: number, lang: string) =>
      ["hardcover", "seriesBooks", id, lang] as const,
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
