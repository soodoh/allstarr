import type { JSX } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Calendar, Tv } from "lucide-react";
import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Badge } from "src/components/ui/badge";
import PageHeader from "src/components/shared/page-header";
import EmptyState from "src/components/shared/empty-state";
import { showsListQuery } from "src/lib/queries/shows";

export const Route = createFileRoute("/_authed/tv/calendar")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(showsListQuery()),
  component: TvCalendarPage,
});

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  continuing: { className: "bg-green-600", label: "Continuing" },
  upcoming: { className: "bg-blue-600", label: "Upcoming" },
};

const SECTION_ORDER = ["continuing", "upcoming"] as const;
const SECTION_LABEL: Record<string, string> = {
  continuing: "Currently Airing",
  upcoming: "Upcoming",
};

function TvCalendarPage(): JSX.Element {
  const { data: shows } = useSuspenseQuery(showsListQuery());

  const grouped = useMemo(() => {
    const filtered = shows.filter(
      (s) => s.status === "continuing" || s.status === "upcoming",
    );

    const map = new Map<string, typeof filtered>();
    for (const show of filtered) {
      const bucket = map.get(show.status) ?? [];
      bucket.push(show);
      map.set(show.status, bucket);
    }

    return SECTION_ORDER.filter((key) => map.has(key)).map((key) => ({
      key,
      label: SECTION_LABEL[key],
      shows: map.get(key)!,
    }));
  }, [shows]);

  if (grouped.length === 0) {
    return (
      <div>
        <PageHeader title="Calendar" />
        <EmptyState
          icon={Calendar}
          title="No upcoming shows"
          description="There are no currently airing or upcoming shows to display."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Currently airing and upcoming shows"
      />

      <div className="space-y-6">
        {grouped.map(({ key, label, shows: sectionShows }) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">{label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sectionShows.map((show) => {
                const badge =
                  STATUS_BADGE[show.status] ?? STATUS_BADGE.continuing;
                return (
                  <Link
                    key={show.id}
                    to="/tv/series/$showId"
                    params={{ showId: String(show.id) }}
                    className="flex items-center gap-3 rounded-md p-2 hover:bg-accent/50 transition-colors"
                  >
                    {/* Small poster */}
                    <div className="w-12 shrink-0">
                      {show.posterUrl ? (
                        <img
                          src={show.posterUrl}
                          alt={show.title}
                          className="w-12 aspect-[2/3] rounded-sm object-cover"
                        />
                      ) : (
                        <div className="w-12 aspect-[2/3] rounded-sm bg-muted flex items-center justify-center">
                          <Tv className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Title + year + network */}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{show.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {show.year > 0 ? show.year : "TBA"}
                        {show.network ? ` · ${show.network}` : ""}
                      </p>
                    </div>

                    {/* Status badge */}
                    <Badge className={badge.className}>{badge.label}</Badge>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
