import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { LayoutGrid, List, Users } from "lucide-react";
import { Button } from "~/components/ui/button";
import PageHeader from "~/components/shared/page-header";
import AuthorTable from "~/components/authors/author-table";
import AuthorCard from "~/components/authors/author-card";
import EmptyState from "~/components/shared/empty-state";
import { TableSkeleton } from "~/components/shared/loading-skeleton";
import { authorsListQuery } from "~/lib/queries";

export const Route = createFileRoute("/_authed/authors/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(authorsListQuery()),
  component: AuthorsPage,
  pendingComponent: TableSkeleton,
});

function AuthorsPage() {
  const { data: authors } = useSuspenseQuery(authorsListQuery());

  const [view, setView] = useState<"table" | "grid">("table");

  if (authors.length === 0) {
    return (
      <div>
        <PageHeader title="Authors" />
        <EmptyState
          icon={Users}
          title="No authors yet"
          description="Search Hardcover to add your first author."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Authors"
        description={`${authors.length} authors in your library`}
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
          </div>
        }
      />

      {view === "table" ? (
        <AuthorTable authors={authors} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {authors.map((author) => (
            <AuthorCard
              key={author.id}
              author={{ ...author, overview: author.overview ?? undefined }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
