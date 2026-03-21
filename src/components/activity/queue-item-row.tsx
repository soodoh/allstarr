import type { JSX } from "react";
import { ChevronDown, ChevronUp, Pause, Play, X } from "lucide-react";
import { Button } from "src/components/ui/button";
import { Badge } from "src/components/ui/badge";
import { formatBytes } from "src/lib/format";
import type { CanonicalStatus } from "src/server/download-clients/types";
import type { QueueItem } from "src/server/queue";

type QueueItemRowProps = {
  item: QueueItem;
  onPause: (item: QueueItem) => void;
  onResume: (item: QueueItem) => void;
  onRemove: (item: QueueItem) => void;
  onPriorityUp: (item: QueueItem) => void;
  onPriorityDown: (item: QueueItem) => void;
};

const statusColors: Record<
  CanonicalStatus,
  {
    bg: string;
    border: string;
    dot: string;
    text: string;
    glow: boolean;
  }
> = {
  downloading: {
    bg: "rgba(59,130,246,0.08)",
    border: "rgba(59,130,246,0.3)",
    dot: "bg-blue-500",
    text: "text-blue-500",
    glow: true,
  },
  completed: {
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.3)",
    dot: "bg-green-500",
    text: "text-green-500",
    glow: true,
  },
  paused: {
    bg: "rgba(245,158,11,0.06)",
    border: "rgba(245,158,11,0.3)",
    dot: "bg-amber-500",
    text: "text-amber-500",
    glow: false,
  },
  queued: {
    bg: "transparent",
    border: "transparent",
    dot: "bg-zinc-500",
    text: "text-muted-foreground",
    glow: false,
  },
  failed: {
    bg: "rgba(239,68,68,0.05)",
    border: "transparent",
    dot: "bg-red-500",
    text: "text-red-500",
    glow: true,
  },
};

const statusLabel: Record<CanonicalStatus, string> = {
  downloading: "",
  completed: "Done",
  paused: "Paused",
  queued: "Queued",
  failed: "Failed",
};

const rowOpacity: Record<CanonicalStatus, string> = {
  downloading: "opacity-100",
  completed: "opacity-100",
  failed: "opacity-100",
  paused: "opacity-70",
  queued: "opacity-60",
};

function formatTimeLeft(seconds: number | null): string {
  if (seconds === null || seconds <= 0) {
    return "\u2014";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function QueueItemRow({
  item,
  onPause,
  onResume,
  onRemove,
  onPriorityUp,
  onPriorityDown,
}: QueueItemRowProps): JSX.Element {
  const colors = statusColors[item.status];
  const opacity = rowOpacity[item.status];

  return (
    <div
      className={`relative overflow-hidden rounded-md border border-border bg-card px-3 py-2 ${opacity}`}
    >
      {/* Progress bar background */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
        style={{
          width: `${item.progress}%`,
          background: colors.bg,
          borderRight: `2px solid ${colors.border}`,
        }}
      />

      {/* Content */}
      <div className="relative flex flex-col gap-1">
        {/* Line 1 */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Status dot */}
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${colors.dot}${colors.glow ? " shadow-[0_0_6px_currentColor]" : ""}`}
          />

          {/* Download name */}
          <span className="flex-1 truncate text-sm font-medium leading-tight">
            {item.name}
          </span>

          {/* Author name */}
          {item.authorName && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {item.authorName}
            </span>
          )}

          {/* Progress % or status text */}
          <span className={`shrink-0 text-xs font-medium ${colors.text}`}>
            {item.status === "downloading"
              ? `${item.progress}%`
              : statusLabel[item.status]}
          </span>

          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-0.5">
            {item.status === "downloading" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Increase priority"
                  onClick={() => onPriorityUp(item)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Decrease priority"
                  onClick={() => onPriorityDown(item)}
                >
                  <ChevronDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Pause"
                  onClick={() => onPause(item)}
                >
                  <Pause />
                </Button>
              </>
            )}
            {item.status === "paused" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Resume"
                onClick={() => onResume(item)}
              >
                <Play />
              </Button>
            )}
            {item.status === "queued" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Increase priority"
                  onClick={() => onPriorityUp(item)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Decrease priority"
                  onClick={() => onPriorityDown(item)}
                >
                  <ChevronDown />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Remove"
              onClick={() => onRemove(item)}
            >
              <X />
            </Button>
          </div>
        </div>

        {/* Line 2 */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {item.status === "downloading" && (
            <>
              <span className="text-blue-500">
                &#8595; {formatBytes(item.downloadSpeed)}/s
              </span>
              {item.uploadSpeed > 0 && (
                <span className="text-green-500">
                  &#8593; {formatBytes(item.uploadSpeed)}/s
                </span>
              )}
              <span>
                {formatBytes(item.downloaded)} / {formatBytes(item.size)}
              </span>
              <span>ETA: {formatTimeLeft(item.estimatedTimeLeft)}</span>
            </>
          )}
          {item.status === "paused" && (
            <>
              <span>Paused</span>
              <span>
                {formatBytes(item.downloaded)} / {formatBytes(item.size)}
              </span>
            </>
          )}
          {item.status === "queued" && (
            <>
              <span>Waiting</span>
              <span>{formatBytes(item.size)}</span>
            </>
          )}
          {item.status === "failed" && (
            <>
              {item.outputPath ? (
                <span className="text-red-500 truncate max-w-xs">
                  {item.outputPath}
                </span>
              ) : (
                <span className="text-red-500">Download failed</span>
              )}
              <span>{formatBytes(item.size)}</span>
            </>
          )}
          {item.status === "completed" && <span>{formatBytes(item.size)}</span>}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Client badge */}
          <Badge variant="secondary">{item.downloadClientName}</Badge>

          {/* Protocol badge */}
          <Badge variant="secondary">{item.protocol}</Badge>
        </div>
      </div>
    </div>
  );
}
