import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { Film, LayoutGrid, List, Pencil, Plus, Search, X } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import PageHeader from "src/components/shared/page-header";
import EmptyState from "src/components/shared/empty-state";
import MovieCard from "src/components/movies/movie-card";
import MovieTable from "src/components/movies/movie-table";
import MovieBulkBar from "src/components/movies/movie-bulk-bar";
import Skeleton from "src/components/ui/skeleton";
import { moviesListQuery } from "src/lib/queries/movies";
import { downloadProfilesListQuery } from "src/lib/queries/download-profiles";

export const Route = createFileRoute("/_authed/movies/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(moviesListQuery()),
  component: MoviesPage,
  pendingComponent: MoviesPageSkeleton,
});

function MoviesPage() {
  const [view, setView] = useState<"table" | "grid">("grid");
  const [search, setSearch] = useState("");
  const [massEditMode, setMassEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: movies } = useSuspenseQuery(moviesListQuery());
  const { data: allProfiles = [] } = useQuery({
    ...downloadProfilesListQuery(),
    enabled: massEditMode,
  });
  const movieProfiles = useMemo(
    () => allProfiles.filter((p) => p.contentType === "movie"),
    [allProfiles],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) {
      return movies;
    }
    const q = search.toLowerCase();
    return movies.filter((m) => m.title.toLowerCase().includes(q));
  }, [movies, search]);

  const exitMassEdit = useCallback(() => {
    setMassEditMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleMassEdit = useCallback(() => {
    if (massEditMode) {
      exitMassEdit();
    } else {
      setMassEditMode(true);
    }
  }, [massEditMode, exitMassEdit]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length) {
        return new Set();
      }
      return new Set(filtered.map((m) => m.id));
    });
  }, [filtered]);

  if (movies.length === 0 && !search) {
    return (
      <div>
        <PageHeader
          title="Movies"
          actions={
            <Button asChild>
              <Link to="/movies/add">
                <Plus className="mr-2 h-4 w-4" />
                Add Movie
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={Film}
          title="No movies yet"
          description="Add your first movie to start building your collection."
          action={
            <Button asChild>
              <Link to="/movies/add">
                <Plus className="mr-2 h-4 w-4" />
                Add Movie
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const description = search
    ? `${filtered.length} matching movies`
    : `${movies.length} movies`;

  return (
    <div className={massEditMode ? "pb-20" : ""}>
      <PageHeader
        title="Movies"
        description={description}
        actions={
          <div className="flex gap-2">
            {!massEditMode && (
              <div className="flex border border-border rounded-md">
                <Button
                  variant={view === "table" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setView("table")}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={view === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setView("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            )}
            <Button
              variant={massEditMode ? "destructive" : "outline"}
              onClick={toggleMassEdit}
            >
              {massEditMode ? (
                <>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </>
              ) : (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  Mass Editor
                </>
              )}
            </Button>
            {!massEditMode && (
              <Button asChild>
                <Link to="/movies/add">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Movie
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon={Search}
          title="No results"
          description={`No movies match "${search}".`}
        />
      )}

      {filtered.length > 0 && (massEditMode || view === "table") && (
        <MovieTable
          movies={filtered}
          selectable={massEditMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
        />
      )}

      {filtered.length > 0 && !massEditMode && view === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {filtered.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      )}

      {massEditMode && (
        <MovieBulkBar
          selectedIds={selectedIds}
          profiles={movieProfiles}
          onDone={exitMassEdit}
        />
      )}
    </div>
  );
}

function MoviesPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-sm" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- Skeleton placeholders have no meaningful key
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="w-full aspect-[2/3] rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
