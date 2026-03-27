import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import TmdbShowSearch from "src/components/tv/tmdb-show-search";
import { userSettingsQuery } from "src/lib/queries/user-settings";

export const Route = createFileRoute("/_authed/tv/add")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(userSettingsQuery("tv"));
  },
  component: AddShowPage,
});

function AddShowPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          to="/tv"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to TV Shows
        </Link>
        <PageHeader title="Add TV Show" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search TMDB</CardTitle>
        </CardHeader>
        <CardContent>
          <TmdbShowSearch />
        </CardContent>
      </Card>
    </div>
  );
}
