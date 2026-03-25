import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useMemo, useCallback } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FolderOpen, RefreshCw, Search } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import PageHeader from "src/components/shared/page-header";
import EmptyState from "src/components/shared/empty-state";
import Skeleton from "src/components/ui/skeleton";
import { TooltipProvider } from "src/components/ui/tooltip";
import { movieCollectionsListQuery } from "src/lib/queries/movie-collections";
import CollectionCard from "src/components/movies/collection-card";
import EditCollectionDialog from "src/components/movies/edit-collection-dialog";
import {
  useRefreshCollections,
  useAddMissingCollectionMovies,
  useAddMovieImportExclusion,
  useUpdateMovieCollection,
} from "src/hooks/mutations/movie-collections";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";

export const Route = createFileRoute("/_authed/movies/collections")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(movieCollectionsListQuery()),
  component: CollectionsPage,
  pendingComponent: CollectionsPageSkeleton,
});

type QuickFilter = "all" | "missing" | "complete";
type SortOption = "title" | "missing";

function CollectionsPage() {
  const { data: collections } = useSuspenseQuery(movieCollectionsListQuery());
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sort, setSort] = useState<SortOption>("title");
  const [editCollection, setEditCollection] = useState<
    (typeof collections)[number] | null
  >(null);

  const refreshCollections = useRefreshCollections();
  const addMissing = useAddMissingCollectionMovies();
  const excludeMovie = useAddMovieImportExclusion();
  const updateCollection = useUpdateMovieCollection();

  const router = useRouter();
  const handleAddMovie = useCallback(
    (tmdbId: number) => {
      router.navigate({
        to: "/movies/add",
        search: { tmdbId: String(tmdbId) },
      });
    },
    [router],
  );

  const filtered = useMemo(() => {
    let result = collections;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.title.toLowerCase().includes(q));
    }

    if (quickFilter === "missing") {
      result = result.filter((c) => c.missingMovies > 0);
    } else if (quickFilter === "complete") {
      result = result.filter((c) => c.missingMovies === 0);
    }

    if (sort === "title") {
      result = [...result].toSorted((a, b) =>
        a.sortTitle.localeCompare(b.sortTitle),
      );
    } else {
      result = [...result].toSorted(
        (a, b) => b.missingMovies - a.missingMovies,
      );
    }

    return result;
  }, [collections, search, quickFilter, sort]);

  const handleToggleMonitor = useCallback(
    (collection: (typeof collections)[number]) => {
      updateCollection.mutate({
        id: collection.id,
        monitored: !collection.monitored,
      });
    },
    [updateCollection],
  );

  if (collections.length === 0) {
    return (
      <div>
        <PageHeader title="Collections" />
        <EmptyState
          icon={FolderOpen}
          title="No collections found"
          description="Collections are automatically discovered when you add movies that belong to a TMDB collection."
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div>
        <PageHeader
          title="Collections"
          description={`${collections.length} collection${collections.length === 1 ? "" : "s"}`}
          actions={
            <Button
              variant="outline"
              onClick={() => refreshCollections.mutate()}
              disabled={refreshCollections.isPending}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${refreshCollections.isPending ? "animate-spin" : ""}`}
              />
              Refresh All
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex border border-border rounded-md">
            {(["all", "missing", "complete"] as const).map((f) => (
              <Button
                key={f}
                variant={quickFilter === f ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setQuickFilter(f)}
                className="capitalize"
              >
                {f}
              </Button>
            ))}
          </div>

          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search collections..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="missing">Missing</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No results"
            description="No collections match your filters."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                onEdit={setEditCollection}
                onAddMissing={(id) => addMissing.mutate({ collectionId: id })}
                onExcludeMovie={(movie) =>
                  excludeMovie.mutate({
                    tmdbId: movie.tmdbId,
                    title: movie.title,
                    year: movie.year ?? undefined,
                  })
                }
                onAddMovie={handleAddMovie}
                onToggleMonitor={handleToggleMonitor}
              />
            ))}
          </div>
        )}

        <EditCollectionDialog
          collection={editCollection}
          open={editCollection !== null}
          onOpenChange={(open) => {
            if (!open) {
              setEditCollection(null);
            }
          }}
        />
      </div>
    </TooltipProvider>
  );
}

function CollectionsPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <div>
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-32" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        // oxlint-disable-next-line react/no-array-index-key -- Skeleton placeholders have no meaningful key
        <Skeleton key={`skel-${i}`} className="h-40 w-full rounded-lg" />
      ))}
    </div>
  );
}
