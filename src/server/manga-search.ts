import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./middleware";
import {
  searchMangaUpdatesSeries,
  getMangaUpdatesSeriesDetail,
  getAllMangaUpdatesReleases,
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
    const allReleases = await getAllMangaUpdatesReleases(
      data.seriesId,
      detail.title,
    );
    return { releases: allReleases, totalHits: allReleases.length };
  });

export const getMangaUpdatesGroupsFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => getMangaUpdatesDetailSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const groups = await getMangaUpdatesSeriesGroups(data.seriesId);
    return groups;
  });
