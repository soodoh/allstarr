// oxlint-disable react/no-array-index-key -- Skeleton arrays have no meaningful data keys
import type { JSX } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, CardContent } from "src/components/ui/card";
import { Accordion } from "src/components/ui/accordion";
import Skeleton from "src/components/ui/skeleton";
import MangaDetailHeader from "src/components/manga/manga-detail-header";
import VolumeAccordion from "src/components/manga/volume-accordion";
import NotFound from "src/components/NotFound";
import { mangaDetailQuery, downloadProfilesListQuery } from "src/lib/queries";
import { splitUngroupedVolumes } from "src/lib/manga-display-utils";
import type { DisplayVolume } from "src/lib/manga-display-utils";

export const Route = createFileRoute("/_authed/manga/series/$mangaId")({
  loader: async ({ params, context }) => {
    const id = Number(params.mangaId);
    if (!Number.isFinite(id) || id <= 0) {
      throw notFound();
    }
    const [mangaData] = await Promise.all([
      context.queryClient
        .ensureQueryData(mangaDetailQuery(id))
        .catch((error) => {
          if (error instanceof Error && error.message.includes("not found")) {
            throw notFound();
          }
          throw error;
        }),
      context.queryClient.ensureQueryData(downloadProfilesListQuery()),
    ]);
    if (!mangaData) {
      throw notFound();
    }
  },
  component: MangaDetailPage,
  notFoundComponent: NotFound,
  pendingComponent: MangaDetailSkeleton,
});

function MangaDetailPage(): JSX.Element {
  const { mangaId } = Route.useParams();

  const { data: mangaData } = useSuspenseQuery(
    mangaDetailQuery(Number(mangaId)),
  );
  const { data: downloadProfiles } = useSuspenseQuery(
    downloadProfilesListQuery(),
  );

  if (!mangaData) {
    return <NotFound />;
  }

  // Split ungrouped chapters into positional groups interleaved with known volumes
  const displayGroups = splitUngroupedVolumes(
    mangaData.volumes as DisplayVolume[],
  );

  // oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop -- Pre-filtered once before map
  const mangaDownloadProfiles = downloadProfiles.filter(
    (p) =>
      p.contentType === "manga" && mangaData.downloadProfileIds.includes(p.id),
  );

  return (
    <div className="space-y-6">
      <MangaDetailHeader
        manga={mangaData}
        downloadProfiles={downloadProfiles}
      />

      {/* Volumes */}
      <Card>
        <CardContent className="p-0">
          <Accordion type="multiple" className="w-full">
            {displayGroups.map((group) => (
              <VolumeAccordion
                key={group.key}
                volume={
                  group.volume ?? {
                    id: -1,
                    volumeNumber: null,
                    title: null,
                    chapters: group.chapters,
                  }
                }
                downloadProfiles={mangaDownloadProfiles}
                displayTitle={group.displayTitle}
                accordionValue={group.key}
              />
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

function MangaDetailSkeleton(): JSX.Element {
  return (
    <div className="space-y-6">
      {/* Back link */}
      <Skeleton className="h-5 w-36" />

      {/* Page header */}
      <div className="flex justify-between items-start">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>

      {/* Three-column layout */}
      <div className="flex flex-col gap-6 xl:flex-row">
        <Skeleton className="w-full xl:w-44 aspect-[2/3] xl:aspect-auto xl:h-64 rounded-lg shrink-0" />
        <Card className="w-full xl:w-72 xl:shrink-0">
          <CardContent className="pt-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex justify-between gap-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="w-full xl:flex-1">
          <CardContent className="pt-6 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>

      {/* Volumes accordion */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-3 border-b last:border-b-0"
            >
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
