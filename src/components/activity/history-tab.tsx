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
import ContentTypeFilter from "src/components/activity/content-type-filter";
import type { ContentType } from "src/components/activity/content-type-filter";
import { historyListQuery } from "src/lib/queries";
import type { HistoryItem, HistoryResult } from "src/lib/queries";
import { formatBytes } from "src/lib/format";

const eventTypeLabels: Record<string, string> = {
  authorAdded: "Author Added",
  authorUpdated: "Author Updated",
  authorDeleted: "Author Deleted",
  bookAdded: "Book Added",
  bookUpdated: "Book Updated",
  bookDeleted: "Book Deleted",
  bookGrabbed: "Grabbed",
  bookFileAdded: "File Added",
  bookFileRemoved: "File Removed",
  movieAdded: "Movie Added",
  movieDeleted: "Movie Deleted",
  movieFileImported: "Movie File Imported",
  movieFileDeleted: "Movie File Deleted",
  showAdded: "Show Added",
  showDeleted: "Show Deleted",
  episodeFileImported: "Episode File Imported",
  episodeFileDeleted: "Episode File Deleted",
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
  bookFileAdded: "default",
  bookFileRemoved: "destructive",
  movieAdded: "default",
  movieDeleted: "destructive",
  movieFileImported: "default",
  movieFileDeleted: "destructive",
  showAdded: "default",
  showDeleted: "destructive",
  episodeFileImported: "default",
  episodeFileDeleted: "destructive",
};

function matchesContentType(eventType: string, contentType: ContentType) {
  if (contentType === "all") {
    return true;
  }
  if (contentType === "books") {
    return eventType.startsWith("author") || eventType.startsWith("book");
  }
  if (contentType === "tv") {
    return eventType.startsWith("show") || eventType.startsWith("episode");
  }
  if (contentType === "movies") {
    return eventType.startsWith("movie");
  }
  return true;
}

export default function HistoryTab(): JSX.Element {
  const [contentType, setContentType] = useState<ContentType>("all");
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

  const filteredItems = typedData.items.filter((item) =>
    matchesContentType(item.eventType, contentType),
  );

  const handleContentTypeChange = (value: ContentType) => {
    setContentType(value);
    setPage(1);
  };

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ContentTypeFilter
          value={contentType}
          onChange={handleContentTypeChange}
        />
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
            <SelectItem value="bookFileAdded">File Added</SelectItem>
            <SelectItem value="bookFileRemoved">File Removed</SelectItem>
            <SelectItem value="movieAdded">Movie Added</SelectItem>
            <SelectItem value="movieDeleted">Movie Deleted</SelectItem>
            <SelectItem value="movieFileImported">
              Movie File Imported
            </SelectItem>
            <SelectItem value="movieFileDeleted">Movie File Deleted</SelectItem>
            <SelectItem value="showAdded">Show Added</SelectItem>
            <SelectItem value="showDeleted">Show Deleted</SelectItem>
            <SelectItem value="episodeFileImported">
              Episode File Imported
            </SelectItem>
            <SelectItem value="episodeFileDeleted">
              Episode File Deleted
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredItems.length === 0 ? (
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
              {filteredItems.map((item) => (
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
                  <TableCell>{renderMediaTitle(item)}</TableCell>
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

function renderMediaTitle(item: HistoryItem): JSX.Element {
  if (item.bookId) {
    return (
      <Link
        to="/bookshelf/books/$bookId"
        params={{ bookId: String(item.bookId) }}
        className="hover:underline"
      >
        {item.bookTitle || `Book #${item.bookId}`}
      </Link>
    );
  }

  const isMovieEvent = item.eventType.startsWith("movie");
  const isShowEvent =
    item.eventType.startsWith("show") || item.eventType.startsWith("episode");

  if (isMovieEvent && item.data?.title) {
    return <span>{String(item.data.title)}</span>;
  }

  if (isShowEvent) {
    const title = item.data?.title ?? item.data?.showTitle;
    if (title) {
      return <span>{String(title)}</span>;
    }
  }

  return <span className="text-muted-foreground">-</span>;
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
