import type { JSX } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "src/components/ui/accordion";
import EpisodeRow from "src/components/tv/episode-row";

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

type Season = {
  id: number;
  seasonNumber: number;
  monitored: boolean | null;
  overview: string | null;
  posterUrl: string | null;
  episodes: Episode[];
};

type SeasonAccordionProps = {
  season: Season;
  seriesType: string;
};

export default function SeasonAccordion({
  season,
  seriesType,
}: SeasonAccordionProps): JSX.Element {
  const sortedEpisodes = [...season.episodes].toSorted(
    (a, b) => a.episodeNumber - b.episodeNumber,
  );

  const fileCount = sortedEpisodes.filter((ep) => ep.hasFile).length;
  const totalCount = sortedEpisodes.length;
  const seasonLabel =
    season.seasonNumber === 0 ? "Specials" : `Season ${season.seasonNumber}`;

  const MonitorIcon = season.monitored ? Eye : EyeOff;

  // Color the progress based on completeness
  let progressColor = "text-muted-foreground";
  if (totalCount > 0) {
    if (fileCount === totalCount) {
      progressColor = "text-green-500";
    } else if (fileCount > 0) {
      progressColor = "text-yellow-500";
    }
  }

  return (
    <AccordionItem value={`season-${season.id}`}>
      <AccordionTrigger className="hover:no-underline px-3">
        <div className="flex flex-1 items-center gap-4">
          <span className="font-medium">{seasonLabel}</span>
          <span className="text-muted-foreground text-xs">
            {totalCount} episode{totalCount === 1 ? "" : "s"}
          </span>
          <span className={`text-xs font-mono ${progressColor}`}>
            {fileCount}/{totalCount}
          </span>
          <MonitorIcon
            className={`h-4 w-4 ${
              season.monitored
                ? "text-muted-foreground"
                : "text-muted-foreground/40"
            }`}
          />
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-0 pb-0">
        {/* Column headers */}
        <div className="flex items-center gap-4 px-3 py-1.5 text-xs text-muted-foreground border-b font-medium">
          <span className="w-20 shrink-0">#</span>
          <span className="flex-1 min-w-0">Title</span>
          <span className="w-28 shrink-0 text-right">Air Date</span>
          <span className="w-12 shrink-0 text-right">Time</span>
          <span className="w-8 shrink-0 text-center">File</span>
          <span className="w-8 shrink-0 text-center">Mon.</span>
        </div>
        {sortedEpisodes.map((episode) => (
          <EpisodeRow
            key={episode.id}
            episode={episode}
            seriesType={seriesType}
          />
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}
