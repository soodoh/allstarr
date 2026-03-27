import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./middleware";
import {
  searchMangaUpdatesSeries,
  getMangaUpdatesSeriesDetail,
  getMangaUpdatesReleases,
  getMangaUpdatesSeriesGroups,
} from "./manga-updates";
import {
  searchMangaUpdatesSchema,
  getMangaUpdatesDetailSchema,
} from "src/lib/validators";

export const searchMangaFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => searchMangaUpdatesSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { query } = data;
    const result = await searchMangaUpdatesSeries(query);
    return result;
  });

export const getMangaUpdatesDetailFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => getMangaUpdatesDetailSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const detail = await getMangaUpdatesSeriesDetail(data.seriesId);
    return detail;
  });

export const getMangaUpdatesReleasesFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => getMangaUpdatesDetailSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const detail = await getMangaUpdatesSeriesDetail(data.seriesId);
    // Fetch all releases, paginating if needed
    const allReleases: Awaited<
      ReturnType<typeof getMangaUpdatesReleases>
    >["results"] = [];
    let page = 1;
    let totalHits = 0;
    do {
      const result = await getMangaUpdatesReleases(detail.title, 100, page);
      totalHits = result.totalHits;
      allReleases.push(...result.results);
      page += 1;
    } while (allReleases.length < totalHits && page <= 50);

    return { releases: allReleases, totalHits };
  });

export const getMangaUpdatesGroupsFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => getMangaUpdatesDetailSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const groups = await getMangaUpdatesSeriesGroups(data.seriesId);
    return groups;
  });
