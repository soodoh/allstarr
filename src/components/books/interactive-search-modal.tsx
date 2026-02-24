import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import SearchToolbar from "~/components/indexers/search-toolbar";
import ReleaseTable from "~/components/indexers/release-table";
import { useSearchIndexers, useGrabRelease } from "~/hooks/mutations";
import type { IndexerRelease } from "~/server/indexers/types";

type InteractiveSearchModalProps = {
  book: { id: number; title: string; authorName: string | undefined };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function InteractiveSearchModal({
  book,
  open,
  onOpenChange,
}: InteractiveSearchModalProps): React.JSX.Element {
  const searchIndexers = useSearchIndexers();
  const grabRelease = useGrabRelease();

  const defaultQuery = book.authorName
    ? `${book.authorName} ${book.title}`
    : book.title;

  // Auto-search when the modal opens
  const lastBookId = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (open && book.id !== lastBookId.current) {
      lastBookId.current = book.id;
      searchIndexers.reset();
      searchIndexers.mutate({ query: defaultQuery, bookId: book.id });
    }
  }, [open, book.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      lastBookId.current = undefined;
      searchIndexers.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const releases = useMemo(
    () => searchIndexers.data ?? [],
    [searchIndexers.data],
  );

  const handleSearch = (query: string) => {
    searchIndexers.mutate({ query, bookId: book.id });
  };

  const handleGrab = (release: IndexerRelease) => {
    grabRelease.mutate(
      {
        guid: release.guid,
        indexerId: release.allstarrIndexerId,
        title: release.title,
        downloadUrl: release.downloadUrl,
        protocol: release.protocol,
        size: release.size,
        bookId: book.id,
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
          />
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          {(searchIndexers.data || searchIndexers.isPending) && (
            <ReleaseTable
              releases={releases}
              grabbingGuid={
                grabRelease.isPending
                  ? grabRelease.variables?.guid
                  : undefined
              }
              onGrab={handleGrab}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
