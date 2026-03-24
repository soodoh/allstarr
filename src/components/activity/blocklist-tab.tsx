import type { JSX } from "react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ShieldBan, Trash2 } from "lucide-react";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import Checkbox from "src/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import TablePagination from "src/components/shared/table-pagination";
import EmptyState from "src/components/shared/empty-state";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import ContentTypeFilter from "src/components/activity/content-type-filter";
import type { ContentType } from "src/components/activity/content-type-filter";
import { blocklistListQuery } from "src/lib/queries";
import type { BlocklistItem, BlocklistResult } from "src/lib/queries";
import {
  useRemoveFromBlocklist,
  useBulkRemoveFromBlocklist,
} from "src/hooks/mutations";

function matchesContentType(item: BlocklistItem, contentType: ContentType) {
  if (contentType === "all") {
    return true;
  }
  if (contentType === "books") {
    return item.bookId !== null;
  }
  if (contentType === "tv") {
    return item.showId !== null;
  }
  if (contentType === "movies") {
    return item.movieId !== null;
  }
  return true;
}

export default function BlocklistTab(): JSX.Element {
  const [contentType, setContentType] = useState<ContentType>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  const queryResult = useSuspenseQuery(
    blocklistListQuery({ page, limit: pageSize }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedData = queryResult.data as unknown as BlocklistResult;

  const removeMutation = useRemoveFromBlocklist();
  const bulkRemoveMutation = useBulkRemoveFromBlocklist();

  const filteredItems = typedData.items.filter((item) =>
    matchesContentType(item, contentType),
  );

  const handleContentTypeChange = (value: ContentType) => {
    setContentType(value);
    setPage(1);
    setSelected(new Set());
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredItems.map((item) => item.id)));
    }
  };

  const handleBulkRemove = () => {
    bulkRemoveMutation.mutate([...selected], {
      onSuccess: () => {
        setSelected(new Set());
        setConfirmBulk(false);
      },
    });
  };

  if (typedData.items.length === 0) {
    return (
      <>
        <div className="mb-4">
          <ContentTypeFilter
            value={contentType}
            onChange={handleContentTypeChange}
          />
        </div>
        <EmptyState
          icon={ShieldBan}
          title="No blocked releases"
          description="Releases that are blocked will appear here."
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ContentTypeFilter
          value={contentType}
          onChange={handleContentTypeChange}
        />
        {selected.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {selected.size} selected
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmBulk(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Remove Selected
            </Button>
          </div>
        )}
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No blocked releases for the selected content type.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    filteredItems.length > 0 &&
                    selected.size === filteredItems.length
                  }
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Release Title</TableHead>
              <TableHead>Book</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead>Indexer</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(item.id)}
                    onCheckedChange={() => toggleSelected(item.id)}
                  />
                </TableCell>
                <TableCell className="font-medium max-w-xs truncate">
                  {item.sourceTitle}
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
                <TableCell>
                  {item.protocol ? (
                    <Badge variant="outline">{item.protocol}</Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{item.indexer || "-"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.source}</Badge>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {new Date(item.date).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeMutation.mutate(item.id)}
                    disabled={removeMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <TablePagination
        page={page}
        pageSize={pageSize}
        totalItems={typedData.total}
        totalPages={typedData.totalPages}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
      />

      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title="Remove from blocklist"
        description={`Remove ${selected.size} items from the blocklist? These releases will be available for download again.`}
        onConfirm={handleBulkRemove}
        loading={bulkRemoveMutation.isPending}
      />
    </div>
  );
}
