import type { JSX } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import OptimizedImage from "src/components/shared/optimized-image";
import { resizeTmdbUrl } from "src/lib/utils";
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
import { moviesListQuery } from "src/lib/queries/movies";

export const Route = createFileRoute("/_authed/movies/calendar")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(moviesListQuery()),
  component: MovieCalendarPage,
});

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  released: { className: "bg-green-600", label: "Released" },
  inCinemas: { className: "bg-blue-600", label: "In Cinemas" },
  announced: { className: "bg-yellow-600", label: "Announced" },
  tba: { className: "bg-zinc-600", label: "TBA" },
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function MovieCalendarPage(): JSX.Element {
  const { data: movies } = useSuspenseQuery(moviesListQuery());

  const grouped = useMemo(() => {
    const upcoming = movies.filter(
      (m) => m.status === "announced" || m.status === "inCinemas",
    );

    // Group by "YYYY-MM" key using the movie's year; month defaults to 0 (January)
    // if there's no more granular release date available.
    const map = new Map<string, typeof upcoming>();

    for (const movie of upcoming) {
      const year = movie.year > 0 ? movie.year : new Date().getFullYear();
      // We only have year-level granularity from the stored data, so group all
      // movies from the same year under the first month of that year unless a
      // finer date is available. Use January as the default bucket.
      const key = `${year}-00`;
      const bucket = map.get(key) ?? [];
      bucket.push(movie);
      map.set(key, bucket);
    }

    // Sort entries chronologically
    const sorted = [...map.entries()].toSorted(([a], [b]) =>
      a.localeCompare(b),
    );

    return sorted.map(([key, items]) => {
      const [yearStr, monthStr] = key.split("-");
      const year = Number(yearStr);
      const monthIndex = Number(monthStr);
      const label =
        monthIndex === 0
          ? String(year)
          : `${MONTH_NAMES[monthIndex - 1]} ${year}`;
      return { key, label, movies: items };
    });
  }, [movies]);

  if (grouped.length === 0) {
    return (
      <div>
        <PageHeader title="Calendar" />
        <EmptyState
          icon={Calendar}
          title="No upcoming movies"
          description="There are no announced or in-cinemas movies to display."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Calendar" description="Upcoming movie releases" />

      <div className="space-y-6">
        {grouped.map(({ key, label, movies: sectionMovies }) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">{label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sectionMovies.map((movie) => {
                const badge = STATUS_BADGE[movie.status] ?? STATUS_BADGE.tba;
                return (
                  <Link
                    key={movie.id}
                    to="/movies/$movieId"
                    params={{ movieId: String(movie.id) }}
                    className="flex items-center gap-3 rounded-md p-2 hover:bg-accent/50 transition-colors"
                  >
                    {/* Small poster */}
                    <div className="w-12 shrink-0">
                      <OptimizedImage
                        src={resizeTmdbUrl(movie.posterUrl, "w154")}
                        alt={movie.title}
                        type="movie"
                        width={48}
                        height={72}
                        className="w-12 aspect-[2/3] rounded-sm"
                      />
                    </div>

                    {/* Title + year */}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{movie.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {movie.year > 0 ? movie.year : "TBA"}
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
