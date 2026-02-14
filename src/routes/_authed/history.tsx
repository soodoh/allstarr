import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { PageHeader } from "~/components/shared/page-header";
import { TableSkeleton } from "~/components/shared/loading-skeleton";
import { getHistoryFn } from "~/server/history";

export const Route = createFileRoute("/_authed/history")({
  loader: () => getHistoryFn({ data: {} }),
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
  const data = Route.useLoaderData();
  const router = useRouter();
  const [eventType, setEventType] = useState<string>("all");
  const [page, setPage] = useState(1);

  const handleFilterChange = async (value: string) => {
    setEventType(value);
    setPage(1);
    router.invalidate();
  };

  const currentData =
    eventType === "all"
      ? data
      : {
          ...data,
          items: data.items.filter((item) => item.eventType === eventType),
        };

  return (
    <div>
      <PageHeader
        title="History"
        description="Activity log for your library"
        actions={
          <Select value={eventType} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-48">
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

      {currentData.items.length === 0 ? (
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
              {currentData.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm">
                    {new Date(item.date).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        eventTypeVariants[item.eventType] || "secondary"
                      }
                    >
                      {eventTypeLabels[item.eventType] || item.eventType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.authorId ? (
                      <Link
                        to="/authors/$authorId"
                        params={{ authorId: String(item.authorId) }}
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
                      <Link
                        to="/books/$bookId"
                        params={{ bookId: String(item.bookId) }}
                        className="hover:underline"
                      >
                        {item.bookTitle || `Book #${item.bookId}`}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.data
                      ? Object.entries(
                          item.data as Record<string, unknown>
                        )
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ")
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data.totalPages > 1 && (
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
                Page {page} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
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
