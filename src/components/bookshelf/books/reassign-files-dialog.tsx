import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import { cn } from "src/lib/utils";
import { useReassignBookFiles } from "src/hooks/mutations";
import { getBooksFn } from "src/server/books";

type ReassignFilesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromBookId: number;
  fromBookTitle: string;
  fileCount: number;
  onSuccess?: () => void;
};

export default function ReassignFilesDialog({
  open,
  onOpenChange,
  fromBookId,
  fromBookTitle,
  fileCount,
  onSuccess,
}: ReassignFilesDialogProps): JSX.Element {
  const [search, setSearch] = useState("");
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const reassign = useReassignBookFiles();

  const { data: allBooks, isLoading } = useQuery({
    queryKey: ["books", "all-for-reassign"],
    queryFn: () => getBooksFn(),
    enabled: open,
  });

  const filteredBooks = (allBooks ?? []).filter((b) => {
    if (b.id === fromBookId) {
      return false;
    }
    if (!search) {
      return true;
    }
    return b.title.toLowerCase().includes(search.toLowerCase());
  });

  const selectedBook = filteredBooks.find((b) => b.id === selectedBookId);

  const handleReassign = () => {
    if (!selectedBookId) {
      return;
    }
    reassign.mutate(
      { fromBookId, toBookId: selectedBookId },
      {
        onSuccess: () => {
          onOpenChange(false);
          setSelectedBookId(null);
          setSearch("");
          onSuccess?.();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setSelectedBookId(null);
          setSearch("");
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign Files</DialogTitle>
          <DialogDescription>
            Move {fileCount} file(s) from &ldquo;{fromBookTitle}&rdquo; to
            another book.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Search books..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-60 overflow-y-auto rounded-md border">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && filteredBooks.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No books found.
              </p>
            )}
            {!isLoading &&
              filteredBooks.map((book) => (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => setSelectedBookId(book.id)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                    selectedBookId === book.id && "bg-accent",
                  )}
                >
                  <span className="font-medium">{book.title}</span>
                  {book.authorName && (
                    <span className="ml-2 text-muted-foreground">
                      by {book.authorName}
                    </span>
                  )}
                </button>
              ))}
          </div>

          {selectedBook && (
            <p className="text-sm text-muted-foreground">
              Selected:{" "}
              <span className="font-medium">{selectedBook.title}</span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleReassign}
            disabled={!selectedBookId || reassign.isPending}
          >
            {reassign.isPending ? "Reassigning..." : "Reassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
