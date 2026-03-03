import { useState, useCallback } from "react";
import type { JSX, MouseEvent } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "src/components/ui/popover";
import { Button } from "src/components/ui/button";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import { useDeleteBook, useDeleteEdition } from "src/hooks/mutations";
import { cn } from "src/lib/utils";

type MetadataWarningProps = {
  type: "book" | "edition" | "book-editions";
  missingSince: Date;
  missingEditionsCount?: number;
  itemId: number;
  itemTitle: string;
  fileCount?: number;
  size?: "sm" | "lg";
  onDeleted?: () => void;
  onReassignFiles?: () => void;
};

export default function MetadataWarning({
  type,
  missingSince,
  missingEditionsCount,
  itemId,
  itemTitle,
  fileCount = 0,
  size = "sm",
  onDeleted,
  onReassignFiles,
}: MetadataWarningProps): JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const deleteBook = useDeleteBook();
  const deleteEdition = useDeleteEdition();

  const isLg = size === "lg";
  const formattedDate = new Date(missingSince).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const reasonMap = {
    book: "This book is no longer available on Hardcover",
    edition: "This edition is no longer available on Hardcover",
    "book-editions": `${missingEditionsCount} edition(s) of this book are no longer available on Hardcover`,
  };
  const reason = reasonMap[type];

  const deleteLabel = type === "edition" ? "Delete Edition" : "Delete Book";

  const handleDelete = () => {
    if (type === "edition") {
      deleteEdition.mutate(itemId, {
        onSuccess: () => {
          setConfirmDelete(false);
          setPopoverOpen(false);
          onDeleted?.();
        },
      });
    } else {
      deleteBook.mutate(itemId, {
        onSuccess: () => {
          setConfirmDelete(false);
          setPopoverOpen(false);
          onDeleted?.();
        },
      });
    }
  };

  const handleClick = useCallback((e: MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            aria-label={`Metadata warning for "${itemTitle}"`}
            className={cn(
              "flex shrink-0 items-center justify-center rounded transition-colors",
              "bg-yellow-500/15 text-yellow-500 cursor-pointer hover:bg-yellow-500/25",
              isLg ? "h-9 w-9" : "h-6 w-6",
            )}
          >
            <AlertTriangle className={cn(isLg ? "h-5 w-5" : "h-3.5 w-3.5")} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 space-y-3"
          align="start"
          onClick={handleClick}
        >
          <div>
            <p className="font-medium text-sm">Missing from Hardcover</p>
            <p className="text-xs text-muted-foreground">
              Since {formattedDate}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{reason}</p>
          {type !== "book-editions" && (
            <div className="flex flex-col gap-2">
              {fileCount > 0 && onReassignFiles && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setPopoverOpen(false);
                    onReassignFiles();
                  }}
                >
                  Reassign {fileCount} File(s)
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => setConfirmDelete(true)}
              >
                {deleteLabel}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${type === "edition" ? "Edition" : "Book"}`}
        description={`Are you sure you want to delete "${itemTitle}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        loading={deleteBook.isPending || deleteEdition.isPending}
      />
    </>
  );
}
