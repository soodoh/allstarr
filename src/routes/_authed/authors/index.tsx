import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/shared/page-header";
import { AuthorTable } from "~/components/authors/author-table";
import { AuthorCard } from "~/components/authors/author-card";
import { getAuthorsFn, deleteAuthorFn } from "~/server/authors";

export const Route = createFileRoute("/_authed/authors/")({
  loader: () => getAuthorsFn(),
  component: AuthorsPage,
});

function AuthorsPage() {
  const authors = Route.useLoaderData();
  const router = useRouter();
  const [view, setView] = useState<"table" | "grid">("table");

  const handleDelete = async (id: number) => {
    try {
      await deleteAuthorFn({ data: { id } });
      toast.success("Author deleted");
      router.invalidate();
    } catch {
      toast.error("Failed to delete author");
    }
  };

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
            <Button asChild>
              <Link to="/add/author">Add Author</Link>
            </Button>
          </div>
        }
      />

      {view === "table" ? (
        <AuthorTable authors={authors} onDelete={handleDelete} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {authors.length === 0 ? (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No authors found. Add one to get started.
            </div>
          ) : (
            authors.map((author) => (
              <AuthorCard key={author.id} author={author} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
