import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  LayoutGrid,
  List,
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import Input from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import PageHeader from "~/components/shared/page-header";
import AuthorTable from "~/components/authors/author-table";
import AuthorCard from "~/components/authors/author-card";
import EmptyState from "~/components/shared/empty-state";
import { TableSkeleton } from "~/components/shared/loading-skeleton";
import { authorsListQuery } from "~/lib/queries";

const PAGE_SIZES = [25, 50, 100] as const;

export const Route = createFileRoute("/_authed/authors/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(authorsListQuery()),
  component: AuthorsPage,
  pendingComponent: TableSkeleton,
});

function AuthorsPage() {
  const { data: authors } = useSuspenseQuery(authorsListQuery());

  const [view, setView] = useState<"table" | "grid">("table");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const filteredAuthors = useMemo(() => {
    if (!searchQuery) {return authors;}
    const q = searchQuery.toLowerCase();
    return authors.filter((a) => a.name.toLowerCase().includes(q));
  }, [authors, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredAuthors.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedAuthors = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAuthors.slice(start, start + pageSize);
  }, [filteredAuthors, currentPage, pageSize]);

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

  const description = searchQuery
    ? `${filteredAuthors.length} of ${authors.length} authors`
    : `${authors.length} authors in your library`;

  return (
    <div>
      <PageHeader
        title="Authors"
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
          </div>
        }
      />

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {view === "table" ? (
        <AuthorTable authors={paginatedAuthors} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {paginatedAuthors.map((author) => (
            <AuthorCard
              key={author.id}
              author={{ ...author, images: author.images ?? undefined }}
            />
          ))}
        </div>
      )}

      {filteredAuthors.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
