import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { LayoutGrid, List, Users } from "lucide-react";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/shared/page-header";
import { AuthorTable } from "~/components/authors/author-table";
import { AuthorCard } from "~/components/authors/author-card";
import { ConfirmDialog } from "~/components/shared/confirm-dialog";
import { EmptyState } from "~/components/shared/empty-state";
import { TableSkeleton } from "~/components/shared/loading-skeleton";
import { getAuthorsFn, deleteAuthorFn } from "~/server/authors";

export const Route = createFileRoute("/_authed/authors/")({
  loader: () => getAuthorsFn(),
  component: AuthorsPage,
  pendingComponent: TableSkeleton,
});

function AuthorsPage() {
  const authors = Route.useLoaderData();
  const router = useRouter();
  const [view, setView] = useState<"table" | "grid">("table");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteAuthorFn({ data: { id: deleteId } });
      toast.success("Author deleted");
      setDeleteId(null);
      router.invalidate();
    } catch {
      toast.error("Failed to delete author");
    } finally {
      setDeleting(false);
    }
  };

  if (authors.length === 0) {
    return (
      <div>
        <PageHeader title="Authors" />
        <EmptyState
          icon={Users}
          title="No authors yet"
          description="Add your first author to start building your library."
          action={
            <Button asChild>
              <Link to="/add/author">Add Author</Link>
            </Button>
          }
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
            <Button asChild>
              <Link to="/add/author">Add Author</Link>
            </Button>
          </div>
        }
      />

      {view === "table" ? (
        <AuthorTable
          authors={authors}
          onDelete={(id) => setDeleteId(id)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {authors.map((author) => (
            <AuthorCard key={author.id} author={author} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Author"
        description="Are you sure you want to delete this author? This will also delete all associated books and cannot be undone."
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
