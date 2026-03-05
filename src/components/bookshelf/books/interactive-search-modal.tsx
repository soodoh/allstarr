import { useEffect, useMemo, useRef } from "react";
import type { JSX } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import SearchToolbar from "src/components/bookshelf/books/search-toolbar";
import ReleaseTable from "src/components/bookshelf/books/release-table";
import { hasEnabledIndexersQuery } from "src/lib/queries";
import { useSearchIndexers, useGrabRelease } from "src/hooks/mutations";
import type { IndexerRelease } from "src/server/indexers/types";

type InteractiveSearchModalProps = {
  book: { id: number; title: string; authorName: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function InteractiveSearchModal({
  book,
  open,
  onOpenChange,
}: InteractiveSearchModalProps): JSX.Element {
  const searchIndexers = useSearchIndexers();
  const grabRelease = useGrabRelease();

  const { data: hasIndexers } = useQuery({
    ...hasEnabledIndexersQuery(),
    enabled: open,
  });

  const defaultQuery = book.authorName
    ? `${book.authorName} ${book.title}`
    : book.title;

  // Auto-search when the modal opens
  const lastBookId = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (open && book.id !== lastBookId.current && hasIndexers === true) {
      lastBookId.current = book.id;
      searchIndexers.reset();
      searchIndexers.mutate({
        query: defaultQuery,
        bookId: book.id,
        categories: null,
      });
    }
  }, [open, book.id, hasIndexers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      lastBookId.current = undefined;
      searchIndexers.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const releases = useMemo(
    () => searchIndexers.data?.releases ?? [],
    [searchIndexers.data],
  );

  const handleSearch = (query: string) => {
    searchIndexers.mutate({ query, bookId: book.id, categories: null });
  };

  const handleGrab = (release: IndexerRelease) => {
    grabRelease.mutate(
      {
        guid: release.guid,
        indexerId: release.allstarrIndexerId,
        indexerSource: release.indexerSource,
        title: release.title,
        downloadUrl: release.downloadUrl,
        protocol: release.protocol,
        size: release.size,
        bookId: book.id,
        downloadClientId: null,
      },
      {
        onSuccess: (result) =>
          toast.success(`Sent to ${result.downloadClientName}`),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Interactive Search — {book.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <SearchToolbar
            defaultQuery={defaultQuery}
            onSearch={handleSearch}
            searching={searchIndexers.isPending}
            disabled={hasIndexers === false}
          />
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          {hasIndexers === false ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No indexers configured or enabled.</p>
              <p className="text-sm mt-1">
                Add indexers in{" "}
                <Link
                  to="/settings/indexers"
                  className="underline hover:text-foreground"
                  onClick={() => onOpenChange(false)}
                >
                  Settings
                </Link>{" "}
                to search for releases.
              </p>
            </div>
          ) : (
            (searchIndexers.data || searchIndexers.isPending) && (
              <ReleaseTable
                releases={releases}
                loading={searchIndexers.isPending}
                grabbingGuid={
                  grabRelease.isPending
                    ? grabRelease.variables?.guid
                    : undefined
                }
                onGrab={handleGrab}
              />
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
