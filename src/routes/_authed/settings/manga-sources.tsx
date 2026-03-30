import { createFileRoute } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { mangaSourceListQuery } from "src/lib/queries/manga";
import { updateMangaSourceFn } from "src/server/manga-search";
import PageHeader from "src/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import Switch from "src/components/ui/switch";
import { Badge } from "src/components/ui/badge";
import { queryKeys } from "src/lib/query-keys";

export const Route = createFileRoute("/_authed/settings/manga-sources")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(mangaSourceListQuery());
  },
  component: MangaSourcesPage,
});

const SOURCE_GROUPS = [
  { key: "api", label: "API Sources" },
  { key: "madara", label: "Madara Sites" },
  { key: "mangathemesia", label: "MangaThemesia Sites" },
  { key: "madtheme", label: "MadTheme Sites" },
  { key: "mangabox", label: "MangaBox Sites" },
  { key: "standalone", label: "Standalone Scrapers" },
];

function MangaSourcesPage() {
  const { data: sources } = useSuspenseQuery(mangaSourceListQuery());
  const queryClient = useQueryClient();

  const toggleSource = useMutation({
    mutationFn: ({
      sourceId,
      enabled,
    }: {
      sourceId: string;
      enabled: boolean;
    }) => updateMangaSourceFn({ data: { sourceId, enabled } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.mangaSources.all }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manga Sources"
        description="Enable manga sources for chapter discovery and downloading."
      />

      {SOURCE_GROUPS.map((group) => {
        const groupSources = sources.filter((s) => s.group === group.key);
        if (groupSources.length === 0) {return null;}

        return (
          <Card key={group.key}>
            <CardHeader>
              <CardTitle>{group.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {groupSources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{source.name}</span>
                    <Badge variant="outline">{source.lang}</Badge>
                  </div>
                  <Switch
                    checked={source.enabled}
                    onCheckedChange={(checked: boolean) =>
                      toggleSource.mutate({
                        sourceId: source.id,
                        enabled: checked,
                      })
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
