import { Link } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import type { JSX } from "react";
import { Badge } from "src/components/ui/badge";
import ShowPoster from "src/components/tv/show-poster";

type ShowCardProps = {
  show: {
    id: number;
    title: string;
    year: number;
    posterUrl: string;
    status: string;
    monitored: boolean;
    episodeCount: number;
    episodeFileCount: number;
  };
};

const STATUS_COLORS: Record<string, string> = {
  continuing: "bg-green-600",
  ended: "bg-blue-600",
  upcoming: "bg-yellow-600",
  canceled: "bg-red-600",
};

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function ShowCard({ show }: ShowCardProps): JSX.Element {
  return (
    <Link
      to="/tv/series/$showId"
      params={{ showId: String(show.id) }}
      className="block group"
    >
      <div className="flex flex-col gap-2">
        <div className="relative">
          <ShowPoster
            posterUrl={show.posterUrl || null}
            title={show.title}
            className="w-full transition-shadow group-hover:shadow-lg"
          />
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {show.monitored ? (
              <span className="rounded-full bg-black/60 p-1" title="Monitored">
                <Eye className="h-3.5 w-3.5 text-green-400" />
              </span>
            ) : (
              <span
                className="rounded-full bg-black/60 p-1"
                title="Unmonitored"
              >
                <EyeOff className="h-3.5 w-3.5 text-zinc-400" />
              </span>
            )}
          </div>
          <div className="absolute bottom-2 left-2">
            <Badge className="bg-black/70 text-white text-xs px-1.5 py-0.5">
              {show.episodeFileCount}/{show.episodeCount}
            </Badge>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight truncate">
            {show.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {show.year > 0 && (
              <span className="text-xs text-muted-foreground">{show.year}</span>
            )}
            <Badge
              className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[show.status] ?? "bg-zinc-600"}`}
            >
              {statusLabel(show.status)}
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  );
}
