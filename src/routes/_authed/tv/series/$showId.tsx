// oxlint-disable react/no-array-index-key -- Skeleton arrays have no meaningful data keys
import type { JSX } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, CardContent } from "src/components/ui/card";
import { Accordion } from "src/components/ui/accordion";
import Skeleton from "src/components/ui/skeleton";
import ShowDetailHeader from "src/components/tv/show-detail-header";
import SeasonAccordion from "src/components/tv/season-accordion";
import NotFound from "src/components/NotFound";
import { showDetailQuery, downloadProfilesListQuery } from "src/lib/queries";

export const Route = createFileRoute("/_authed/tv/series/$showId")({
  loader: async ({ params, context }) => {
    const id = Number(params.showId);
    if (!Number.isFinite(id) || id <= 0) {
      throw notFound();
    }
    await Promise.all([
      context.queryClient.ensureQueryData(showDetailQuery(id)),
      context.queryClient.ensureQueryData(downloadProfilesListQuery()),
    ]);
  },
  component: ShowDetailPage,
  notFoundComponent: NotFound,
  pendingComponent: ShowDetailSkeleton,
});

function ShowDetailPage(): JSX.Element {
  const { showId } = Route.useParams();

  const { data: show } = useSuspenseQuery(showDetailQuery(Number(showId)));
  const { data: downloadProfiles } = useSuspenseQuery(
    downloadProfilesListQuery(),
  );

  if (!show) {
    return <NotFound />;
  }

  // Sort seasons: regular seasons ascending, specials (season 0) at the end
  const sortedSeasons = [...show.seasons].toSorted((a, b) => {
    if (a.seasonNumber === 0) {
      return 1;
    }
    if (b.seasonNumber === 0) {
      return -1;
    }
    return a.seasonNumber - b.seasonNumber;
  });

  return (
    <div className="space-y-6">
      <ShowDetailHeader show={show} downloadProfiles={downloadProfiles} />

      {/* Seasons */}
      <Card>
        <CardContent className="p-0">
          <Accordion type="multiple" className="w-full">
            {sortedSeasons.map((season) => (
              <SeasonAccordion
                key={season.id}
                season={season}
                seriesType={show.seriesType}
              />
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

function ShowDetailSkeleton(): JSX.Element {
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

      {/* Seasons accordion */}
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
