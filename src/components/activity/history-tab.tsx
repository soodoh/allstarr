import type { JSX } from "react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "src/components/ui/badge";
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
import TablePagination from "src/components/shared/table-pagination";
import { historyListQuery } from "src/lib/queries";
import type { HistoryResult } from "src/lib/queries";
import { formatBytes } from "src/lib/format";

const eventTypeLabels: Record<string, string> = {
  authorAdded: "Author Added",
  authorUpdated: "Author Updated",
  authorDeleted: "Author Deleted",
  bookAdded: "Book Added",
  bookUpdated: "Book Updated",
  bookDeleted: "Book Deleted",
  bookGrabbed: "Grabbed",
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
  bookGrabbed: "outline",
};

export default function HistoryTab(): JSX.Element {
  const [eventType, setEventType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const queryParams: { page: number; limit: number; eventType?: string } =
    eventType === "all"
      ? { page, limit: pageSize }
      : { page, limit: pageSize, eventType };

  const queryResult = useSuspenseQuery(historyListQuery(queryParams));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedData = queryResult.data as unknown as HistoryResult;

  const handleFilterChange = (value: string) => {
    setEventType(value);
    setPage(1);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
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
            <SelectItem value="bookGrabbed">Grabbed</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                  <TableCell className="text-sm whitespace-nowrap">
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
                        to="/bookshelf/authors/$authorId"
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
                        to="/bookshelf/books/$bookId"
                        params={{ bookId: String(item.bookId) }}
                        className="hover:underline"
                      >
                        {item.bookTitle || `Book #${item.bookId}`}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {renderDetails(item.eventType, item.data)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TablePagination
            page={page}
            pageSize={pageSize}
            totalItems={typedData.total}
            totalPages={typedData.totalPages}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      )}
    </div>
  );
}

function renderDetails(
  eventType: string,
  data: Record<string, string | number | boolean | null> | null,
): string {
  if (!data) {
    return "-";
  }

  if (eventType === "bookGrabbed") {
    const parts: string[] = [];
    if (data.downloadClientName) {
      parts.push(`Client: ${data.downloadClientName}`);
    }
    if (data.protocol) {
      parts.push(`Protocol: ${data.protocol}`);
    }
    if (typeof data.size === "number") {
      parts.push(formatBytes(data.size));
    }
    return parts.length > 0 ? parts.join(" · ") : "-";
  }

  return Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}
