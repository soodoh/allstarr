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
	getAllSourceDefinitions,
	getEnabledSources,
	getSource,
	seedSourcesIfNeeded,
	setSourceConfig,
	setSourceEnabled,
} from "./registry";
export type {
	MangaDetails,
	MangaPage,
	MangaSource,
	PageUrl,
	SourceChapter,
	SourceDefinition,
	SourceManga,
} from "./types";
