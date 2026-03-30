import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import MangaSourceSearch from "src/components/manga/manga-source-search";
import { userSettingsQuery } from "src/lib/queries/user-settings";

export const Route = createFileRoute("/_authed/manga/add")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(userSettingsQuery("manga"));
  },
  component: AddMangaPage,
});

function AddMangaPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          to="/manga"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Manga
        </Link>
        <PageHeader title="Add Manga" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Manga Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <MangaSourceSearch />
        </CardContent>
      </Card>
    </div>
  );
}
