import { Link } from "@tanstack/react-router";
import { HardDrive } from "lucide-react";
import type { JSX } from "react";
import { Badge } from "src/components/ui/badge";
import OptimizedImage from "src/components/shared/optimized-image";

type MovieCardProps = {
  movie: {
    id: number;
    title: string;
    year: number;
    posterUrl: string;
    status: string;
    hasFile: boolean;
  };
};

const STATUS_COLORS: Record<string, string> = {
  released: "bg-green-600",
  inCinemas: "bg-blue-600",
  announced: "bg-yellow-600",
  tba: "bg-zinc-600",
};

function statusLabel(status: string): string {
  switch (status) {
    case "inCinemas": {
      return "In Cinemas";
    }
    case "tba": {
      return "TBA";
    }
    default: {
      return status.charAt(0).toUpperCase() + status.slice(1);
    }
  }
}

export default function MovieCard({ movie }: MovieCardProps): JSX.Element {
  return (
    <Link
      to="/movies/$movieId"
      params={{ movieId: String(movie.id) }}
      className="block group"
    >
      <div className="flex flex-col gap-2">
        <div className="relative">
          <OptimizedImage
            src={movie.posterUrl || null}
            alt={`${movie.title} poster`}
            type="movie"
            width={224}
            height={336}
            className="aspect-[2/3] w-full max-w-56 transition-shadow group-hover:shadow-lg"
          />
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {movie.hasFile && (
              <span className="rounded-full bg-black/60 p-1" title="On disk">
                <HardDrive className="h-3.5 w-3.5 text-blue-400" />
              </span>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight truncate">
            {movie.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {movie.year > 0 && (
              <span className="text-xs text-muted-foreground">
                {movie.year}
              </span>
            )}
            <Badge
              className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[movie.status] ?? STATUS_COLORS.tba}`}
            >
              {statusLabel(movie.status)}
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  );
}
