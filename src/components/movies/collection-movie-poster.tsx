import type { JSX } from "react";
import { Link } from "@tanstack/react-router";
import { cn, resizeTmdbUrl } from "src/lib/utils";
import { Ban } from "lucide-react";
import OptimizedImage from "src/components/shared/optimized-image";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "src/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "src/components/ui/context-menu";

type CollectionMovie = {
  tmdbId: number;
  title: string;
  overview: string;
  posterUrl: string | null;
  year: number | null;
  isExisting: boolean;
  isExcluded: boolean;
  movieId: number | null;
};

type Props = {
  movie: CollectionMovie;
  onExclude?: (movie: CollectionMovie) => void;
  onAddMovie?: (movie: CollectionMovie) => void;
};

export default function CollectionMoviePoster({
  movie,
  onExclude,
  onAddMovie,
}: Props): JSX.Element {
  const poster = (
    <div
      className={cn(
        "relative w-[50px] h-[75px] rounded-sm border-2 flex-shrink-0 overflow-hidden",
        movie.isExisting && "border-green-500",
        !movie.isExisting && !movie.isExcluded && "border-red-500 opacity-60",
        movie.isExcluded && "border-muted opacity-40",
      )}
    >
      <OptimizedImage
        src={resizeTmdbUrl(movie.posterUrl, "w154")}
        alt={movie.title}
        type="movie"
        width={50}
        height={75}
        className="w-full h-full rounded-none border-0 shadow-none"
        imageClassName={movie.isExcluded ? "grayscale" : undefined}
      />
      {movie.isExcluded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Ban className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );

  function getTooltipLabel(): string {
    if (movie.isExcluded) {
      return `${movie.title} — Excluded from import`;
    }
    if (movie.isExisting) {
      return movie.title;
    }
    return `${movie.title} — Missing`;
  }
  const tooltipLabel = getTooltipLabel();

  // Existing movies link to their detail page
  if (movie.isExisting && movie.movieId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/movies/$movieId"
            params={{ movieId: String(movie.movieId) }}
          >
            {poster}
          </Link>
        </TooltipTrigger>
        <TooltipContent>{tooltipLabel}</TooltipContent>
      </Tooltip>
    );
  }

  // Missing movies: click to add, right-click to exclude
  if (!movie.isExisting && !movie.isExcluded) {
    return (
      <ContextMenu>
        <ContextMenuTrigger>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onAddMovie?.(movie)}
                className="cursor-pointer"
              >
                {poster}
              </button>
            </TooltipTrigger>
            <TooltipContent>{tooltipLabel}</TooltipContent>
          </Tooltip>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onExclude?.(movie)}>
            <Ban className="mr-2 h-4 w-4" />
            Exclude from import
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  // Excluded movies: just tooltip
  return (
    <Tooltip>
      <TooltipTrigger asChild>{poster}</TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}
