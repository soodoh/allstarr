import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Tv, LayoutGrid, List, Plus, Search } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import PageHeader from "src/components/shared/page-header";
import EmptyState from "src/components/shared/empty-state";
import ShowCard from "src/components/tv/show-card";
import ShowTable from "src/components/tv/show-table";
import Skeleton from "src/components/ui/skeleton";
import { showsListQuery } from "src/lib/queries/shows";

export const Route = createFileRoute("/_authed/tv/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(showsListQuery()),
  component: ShowsPage,
  pendingComponent: ShowsPageSkeleton,
});

function ShowsPage() {
  const [view, setView] = useState<"table" | "grid">("grid");
  const [search, setSearch] = useState("");

  const { data: shows } = useSuspenseQuery(showsListQuery());

  const filtered = useMemo(() => {
    if (!search.trim()) {
      return shows;
    }
    const q = search.toLowerCase();
    return shows.filter((s) => s.title.toLowerCase().includes(q));
  }, [shows, search]);

  if (shows.length === 0 && !search) {
    return (
      <div>
        <PageHeader
          title="TV Shows"
          actions={
            <Button asChild>
              <Link to="/tv/add">
                <Plus className="mr-2 h-4 w-4" />
                Add Show
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={Tv}
          title="No TV shows yet"
          description="Add your first show to start building your collection."
          action={
            <Button asChild>
              <Link to="/tv/add">
                <Plus className="mr-2 h-4 w-4" />
                Add Show
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const description = search
    ? `${filtered.length} matching series`
    : `${shows.length} series`;

  return (
    <div>
      <PageHeader
        title="TV Shows"
        description={description}
        actions={
          <div className="flex gap-2">
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
            <Button asChild>
              <Link to="/tv/add">
                <Plus className="mr-2 h-4 w-4" />
                Add Show
              </Link>
            </Button>
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
          description={`No shows match "${search}".`}
        />
      )}

      {filtered.length > 0 && view === "table" && (
        <ShowTable shows={filtered} />
      )}

      {filtered.length > 0 && view === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {filtered.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShowsPageSkeleton() {
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
