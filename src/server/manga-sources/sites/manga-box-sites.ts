import type { ThemeSiteConfig } from "../types";
import { MangaBoxEngine } from "../engines/manga-box-engine";
import { registerSource } from "../registry";

const mangaBoxSites: ThemeSiteConfig[] = [
  { name: "Mangakakalot", url: "https://www.mangakakalot.gg", lang: "en" },
  { name: "Manganato", url: "https://www.natomanga.com", lang: "en" },
  { name: "Mangabat", url: "https://www.mangabats.com", lang: "en" },
];

for (const site of mangaBoxSites) {
  const siteId = `mangabox:${site.name.toLowerCase().replaceAll(/\s+/g, "-")}`;
  registerSource({
    id: siteId,
    name: site.name,
    lang: site.lang,
    group: "mangabox",
    factory: () =>
      new MangaBoxEngine({
        id: siteId,
        name: site.name,
        baseUrl: site.url,
        lang: site.lang,
        supportsLatest: true,
      }),
  });
}
