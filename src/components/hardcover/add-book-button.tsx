import { useState } from "react";
import type { JSX, MouseEvent } from "react";
import { BookMarked, Loader2 } from "lucide-react";
import { cn } from "src/lib/utils";
import { useToggleBookMonitor } from "src/hooks/mutations";

type BookMonitorToggleProps = {
  bookId: number;
  title: string;
  monitored: boolean;
  size?: "sm" | "lg";
  onToggled?: (bookId: number, monitored: boolean) => void;
};

export default function BookMonitorToggle({
  bookId,
  title,
  monitored: initialMonitored,
  size = "sm",
  onToggled,
}: BookMonitorToggleProps): JSX.Element {
  const [monitored, setMonitored] = useState(initialMonitored);
  const toggleMonitor = useToggleBookMonitor();

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (toggleMonitor.isPending) {
      return;
    }

    const newState = !monitored;
    toggleMonitor.mutate(
      { bookId, monitor: newState },
      {
        onSuccess: () => {
          setMonitored(newState);
          onToggled?.(bookId, newState);
        },
      },
    );
  };

  const isLg = size === "lg";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={toggleMonitor.isPending}
      aria-label={monitored ? `Unmonitor "${title}"` : `Monitor "${title}"`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded transition-colors",
        isLg ? "h-9 w-9" : "h-6 w-6",
        monitored
          ? "bg-primary/15 text-primary cursor-pointer hover:bg-destructive/15 hover:text-destructive"
          : "bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary cursor-pointer",
      )}
    >
      {toggleMonitor.isPending ? (
        <Loader2
          className={cn("animate-spin", isLg ? "h-5 w-5" : "h-3.5 w-3.5")}
        />
      ) : (
        <BookMarked
          className={cn(isLg ? "h-5 w-5" : "h-3.5 w-3.5")}
        />
      )}
    </button>
  );
}
