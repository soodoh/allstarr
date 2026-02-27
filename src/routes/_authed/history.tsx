import { createFileRoute, Link } from "@tanstack/react-router";
import { useBookDetailModal } from "src/components/books/book-detail-modal-provider";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import PageHeader from "src/components/shared/page-header";
import { TableSkeleton } from "src/components/shared/loading-skeleton";
import { historyListQuery } from "src/lib/queries";
import type { HistoryResult } from "src/lib/queries";

export const Route = createFileRoute("/_authed/history")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(historyListQuery()),
  component: HistoryPage,
  pendingComponent: TableSkeleton,
});

const eventTypeLabels: Record<string, string> = {
  authorAdded: "Author Added",
  authorUpdated: "Author Updated",
  authorDeleted: "Author Deleted",
  bookAdded: "Book Added",
  bookUpdated: "Book Updated",
  bookDeleted: "Book Deleted",
};

const eventTypeVariants: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  authorAdded: "default",
  authorUpdated: "secondary",
  authorDeleted: "destructive",
  bookAdded: "default",
  bookUpdated: "secondary",
  bookDeleted: "destructive",
};

function HistoryPage() {
  const { openBookModal } = useBookDetailModal();
  const [eventType, setEventType] = useState<string>("all");
  const [page, setPage] = useState(1);

  // Derive query params from UI state — changing them triggers a fresh fetch
  // (or cache hit if the same params were used recently)
  const queryParams: { page: number; eventType?: string } =
    eventType === "all" ? { page } : { page, eventType };

  const queryResult = useSuspenseQuery(historyListQuery(queryParams));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedData = queryResult.data as unknown as HistoryResult;

  const handleFilterChange = (value: string) => {
    setEventType(value);
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="History"
        description="Activity log for your library"
        actions={
          <Select value={eventType} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="authorAdded">Author Added</SelectItem>
              <SelectItem value="authorUpdated">Author Updated</SelectItem>
              <SelectItem value="authorDeleted">Author Deleted</SelectItem>
              <SelectItem value="bookAdded">Book Added</SelectItem>
              <SelectItem value="bookUpdated">Book Updated</SelectItem>
              <SelectItem value="bookDeleted">Book Deleted</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {typedData.items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No history events found.
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Book</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedData.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm">
                    {new Date(item.date).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={eventTypeVariants[item.eventType] || "secondary"}
                    >
                      {eventTypeLabels[item.eventType] || item.eventType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.authorId ? (
                      <Link
                        to="/library/authors/$authorId"
                        params={{
                          authorId: String(item.authorId),
                        }}
                        className="hover:underline"
                      >
                        {item.authorName || `Author #${item.authorId}`}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.bookId ? (
                      <button
                        type="button"
                        onClick={() => openBookModal(item.bookId!)}
                        className="hover:underline text-left"
                      >
                        {item.bookTitle || `Book #${item.bookId}`}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.data
                      ? Object.entries(item.data as Record<string, unknown>)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ")
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {typedData.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="flex items-center text-sm text-muted-foreground">
                Page {page} of {typedData.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= typedData.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
