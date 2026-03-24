import type { JSX } from "react";
import { Check, Minus, Eye, EyeOff } from "lucide-react";

type Episode = {
  id: number;
  episodeNumber: number;
  absoluteNumber: number | null;
  title: string;
  airDate: string | null;
  runtime: number | null;
  hasFile: boolean | null;
  monitored: boolean | null;
};

type EpisodeRowProps = {
  episode: Episode;
  seriesType: string;
};

function isUnaired(airDate: string | null): boolean {
  if (!airDate) {
    return true;
  }
  const today = new Date().toISOString().split("T")[0];
  return airDate > today;
}

function formatAirDate(airDate: string | null): string {
  if (!airDate) {
    return "TBA";
  }
  try {
    return new Date(`${airDate}T00:00:00`).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return airDate;
  }
}

export default function EpisodeRow({
  episode,
  seriesType,
}: EpisodeRowProps): JSX.Element {
  const unaired = isUnaired(episode.airDate);
  const MonitorIcon = episode.monitored ? Eye : EyeOff;

  // Format episode number display
  let epLabel = `E${String(episode.episodeNumber).padStart(2, "0")}`;
  if (seriesType === "anime" && episode.absoluteNumber !== null) {
    epLabel += ` (${episode.absoluteNumber})`;
  }

  return (
    <div
      className={`flex items-center gap-4 px-3 py-2 text-sm border-b last:border-b-0 ${
        unaired ? "opacity-60" : ""
      }`}
    >
      {/* Episode number */}
      <span className="w-20 shrink-0 font-mono text-muted-foreground">
        {epLabel}
      </span>

      {/* Title */}
      <span className="flex-1 min-w-0 truncate" title={episode.title}>
        {episode.title || "TBA"}
      </span>

      {/* Air date */}
      <span
        className={`w-28 shrink-0 text-right ${
          unaired ? "text-muted-foreground" : ""
        }`}
      >
        {formatAirDate(episode.airDate)}
      </span>

      {/* Runtime */}
      <span className="w-12 shrink-0 text-right text-muted-foreground">
        {episode.runtime ? `${episode.runtime}m` : "-"}
      </span>

      {/* File status */}
      <span className="w-8 shrink-0 flex justify-center">
        {episode.hasFile ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Minus className="h-4 w-4 text-muted-foreground" />
        )}
      </span>

      {/* Monitored */}
      <span className="w-8 shrink-0 flex justify-center">
        <MonitorIcon
          className={`h-4 w-4 ${
            episode.monitored
              ? "text-muted-foreground"
              : "text-muted-foreground/40"
          }`}
        />
      </span>
    </div>
  );
}
