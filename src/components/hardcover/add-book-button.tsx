import { useState } from "react";
import type { JSX, MouseEvent } from "react";
import { BookMarked, Loader2 } from "lucide-react";
import { cn } from "src/lib/utils";
import { useUpdateBook, useMonitorBook } from "src/hooks/mutations";

type BookMonitorToggleProps = {
  bookId: number;
  title: string;
  monitored: boolean;
  onToggled?: (bookId: number, monitored: boolean) => void;
};

export default function BookMonitorToggle({
  bookId,
  title,
  monitored: initialMonitored,
  onToggled,
}: BookMonitorToggleProps): JSX.Element {
  const [monitored, setMonitored] = useState(initialMonitored);
  const updateBook = useUpdateBook();
  const monitorBook = useMonitorBook();

  const isPending = updateBook.isPending || monitorBook.isPending;

  const handleClick = async (e: MouseEvent) => {
    e.stopPropagation();
    if (isPending) {
      return;
    }

    if (monitored) {
      // Unmonitor — simple toggle
      updateBook.mutate(
        { id: bookId, monitored: false },
        {
          onSuccess: () => {
            setMonitored(false);
            onToggled?.(bookId, false);
          },
        },
      );
    } else {
      // Monitor — fetches contributors, sets monitored
      monitorBook.mutate(bookId, {
        onSuccess: () => {
          setMonitored(true);
          onToggled?.(bookId, true);
        },
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={monitored ? `Unmonitor "${title}"` : `Monitor "${title}"`}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
        monitored
          ? "bg-primary/15 text-primary cursor-pointer hover:bg-destructive/15 hover:text-destructive"
          : "bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary cursor-pointer",
      )}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <BookMarked className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
