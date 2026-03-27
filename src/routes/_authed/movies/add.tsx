import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import TmdbMovieSearch from "src/components/movies/tmdb-movie-search";
import { userSettingsQuery } from "src/lib/queries/user-settings";

export const Route = createFileRoute("/_authed/movies/add")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(userSettingsQuery("movies"));
  },
  component: AddMoviePage,
});

function AddMoviePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          to="/movies"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Movies
        </Link>
        <PageHeader title="Add Movie" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search TMDB</CardTitle>
        </CardHeader>
        <CardContent>
          <TmdbMovieSearch />
        </CardContent>
      </Card>
    </div>
  );
}
