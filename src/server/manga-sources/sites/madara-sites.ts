import type { ThemeSiteConfig } from "../types";
import { MadaraEngine } from "../engines/madara-engine";
import { registerSource } from "../registry";

const madaraSites: ThemeSiteConfig[] = [
  { name: "ManhuaUS", url: "https://manhuaus.com", lang: "en" },
  { name: "ManhwaClan", url: "https://manhwaclan.com", lang: "en" },
  { name: "ManhuaTop", url: "https://mangatop.org", lang: "en" },
  { name: "Toonily", url: "https://toonily.com", lang: "en" },
  { name: "KunManga", url: "https://kunmanga.com", lang: "en" },
  { name: "CoffeeManga", url: "https://coffeemanga.ink", lang: "en" },
  { name: "Hiperdex", url: "https://hiperdex.com", lang: "en" },
  { name: "ZinManga", url: "https://mangazin.org", lang: "en" },
  { name: "HariManga", url: "https://harimanga.me", lang: "en" },
  { name: "WebtoonXYZ", url: "https://www.webtoon.xyz", lang: "en" },
  { name: "ManhuaPlus", url: "https://manhuaplus.com", lang: "en" },
  { name: "Manga18fx", url: "https://manga18fx.com", lang: "en" },
  { name: "ToonClash", url: "https://toonclash.com", lang: "en" },
  { name: "ManhuaHot", url: "https://manhuahot.com", lang: "en" },
  { name: "MangaRead", url: "https://mangaread.co", lang: "en" },
  { name: "S2Manga", url: "https://s2manga.com", lang: "en" },
  { name: "ManhwaTop", url: "https://manhwatop.com", lang: "en" },
  { name: "MangaDistrict", url: "https://mangadistrict.com", lang: "en" },
  { name: "Toonizy", url: "https://toonizy.com", lang: "en" },
  { name: "NovelCool", url: "https://www.novelcool.com", lang: "all" },
];

for (const site of madaraSites) {
  const siteId = `madara:${site.name.toLowerCase().replaceAll(/\s+/g, "-")}`;
  registerSource({
    id: siteId,
    name: site.name,
    lang: site.lang,
    group: "madara",
    factory: () =>
      new MadaraEngine({
        id: siteId,
        name: site.name,
        baseUrl: site.url,
        lang: site.lang,
        supportsLatest: true,
        mangaSubString: (site.overrides?.mangaSubString as string) ?? undefined,
      }),
  });
}
