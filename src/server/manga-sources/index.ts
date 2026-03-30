// oxlint-disable import/no-unassigned-import -- Side-effect imports register all sources in the registry
// API sources
import "./sources/mangadex";
import "./sources/comick";
import "./sources/mangaplus";
import "./sources/asura-scans";

// Theme sites (each file registers its sites)
import "./sites/madara-sites";
import "./sites/themesia-sites";
import "./sites/mad-theme-sites";
import "./sites/manga-box-sites";

// Standalone scrapers
import "./sources/mangafire";
import "./sources/webtoons";
import "./sources/ninemanga";
// oxlint-enable import/no-unassigned-import

// Re-export public API
export {
  getSource,
  getEnabledSources,
  getAllSourceDefinitions,
  setSourceEnabled,
  setSourceConfig,
  seedSourcesIfNeeded,
} from "./registry";
export type {
  MangaSource,
  MangaPage,
  SourceManga,
  MangaDetails,
  SourceChapter,
  PageUrl,
  SourceDefinition,
} from "./types";
