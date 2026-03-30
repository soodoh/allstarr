import type { ThemeSiteConfig } from "../types";
import { MangaThemesiaEngine } from "../engines/manga-themesia-engine";
import { registerSource } from "../registry";

const themesiaSites: ThemeSiteConfig[] = [
  { name: "Comic Asura", url: "https://comicasura.net", lang: "en" },
  { name: "Rizz Fables", url: "https://rizzfables.com", lang: "en" },
  { name: "Rage Scans", url: "https://ragescans.com", lang: "en" },
  { name: "Violet Scans", url: "https://violetscans.org", lang: "en" },
  { name: "Drake Scans", url: "https://drakecomic.org", lang: "en" },
  { name: "MangaTX", url: "https://mangatx.cc", lang: "en" },
  { name: "Eva Scans", url: "https://evascans.org", lang: "en" },
  { name: "Kappa Beast", url: "https://kappabeast.com", lang: "en" },
  { name: "Rest Scans", url: "https://restscans.com", lang: "en" },
  { name: "Galaxy Manga", url: "https://galaxymanga.io", lang: "en" },
];

for (const site of themesiaSites) {
  const siteId = `themesia:${site.name.toLowerCase().replaceAll(/\s+/g, "-")}`;
  registerSource({
    id: siteId,
    name: site.name,
    lang: site.lang,
    group: "mangathemesia",
    factory: () =>
      new MangaThemesiaEngine({
        id: siteId,
        name: site.name,
        baseUrl: site.url,
        lang: site.lang,
        supportsLatest: true,
      }),
  });
}
