import type { ThemeSiteConfig } from "../types";
import { MadThemeEngine } from "../engines/mad-theme-engine";
import { registerSource } from "../registry";

const madThemeSites: ThemeSiteConfig[] = [
  { name: "MangaBuddy", url: "https://mangabuddy.com", lang: "en" },
  { name: "MangaForest", url: "https://mangaforest.me", lang: "en" },
  { name: "MangaPuma", url: "https://mangapuma.com", lang: "en" },
  { name: "MangaFab", url: "https://mangafab.com", lang: "en" },
  { name: "MangaXYZ", url: "https://mangaxyz.com", lang: "en" },
  { name: "MangaMonk", url: "https://mangamonk.com", lang: "en" },
  { name: "MangaCute", url: "https://mangacute.com", lang: "en" },
  { name: "MangaSpin", url: "https://mangaspin.com", lang: "en" },
  { name: "MangaSaga", url: "https://mangasaga.com", lang: "en" },
  { name: "ManhuaNow", url: "https://manhuanow.com", lang: "en" },
  { name: "ManhuaSite", url: "https://manhuasite.com", lang: "en" },
  { name: "ToonilyMe", url: "https://toonily.me", lang: "en" },
  { name: "TooniTube", url: "https://toonitube.com", lang: "en" },
  { name: "BoxManhwa", url: "https://boxmanhwa.com", lang: "en" },
  { name: "KaliScan", url: "https://kaliscan.com", lang: "en" },
  { name: "KaliScan.io", url: "https://kaliscan.io", lang: "en" },
  { name: "KaliScan.me", url: "https://kaliscan.me", lang: "en" },
  { name: "BeeHentai", url: "https://beehentai.com", lang: "en" },
  { name: "MGJinx", url: "https://mgjinx.com", lang: "en" },
];

for (const site of madThemeSites) {
  const siteId = `madtheme:${site.name.toLowerCase().replaceAll(/\s+/g, "-")}`;
  registerSource({
    id: siteId,
    name: site.name,
    lang: site.lang,
    group: "madtheme",
    factory: () =>
      new MadThemeEngine({
        id: siteId,
        name: site.name,
        baseUrl: site.url,
        lang: site.lang,
        supportsLatest: true,
      }),
  });
}
