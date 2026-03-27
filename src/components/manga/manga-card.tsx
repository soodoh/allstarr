import { Link } from "@tanstack/react-router";
import type { JSX } from "react";
import { Badge } from "src/components/ui/badge";
import OptimizedImage from "src/components/shared/optimized-image";

type MangaCardProps = {
  manga: {
    id: number;
    title: string;
    type: string;
    year: number;
    posterUrl: string;
    status: string;
    chapterCount: number;
    chapterFileCount: number;
  };
};

const STATUS_COLORS: Record<string, string> = {
  ongoing: "bg-green-600",
  complete: "bg-blue-600",
  hiatus: "bg-yellow-600",
  cancelled: "bg-red-600",
};

const TYPE_LABELS: Record<string, string> = {
  manhwa: "Manhwa",
  manhua: "Manhua",
};

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function MangaCard({ manga }: MangaCardProps): JSX.Element {
  return (
    <Link
      to="/manga/series/$mangaId"
      params={{ mangaId: String(manga.id) }}
      className="block group"
    >
      <div className="flex flex-col gap-2">
        <div className="relative">
          <OptimizedImage
            src={manga.posterUrl || null}
            alt={`${manga.title} cover`}
            type="manga"
            width={224}
            height={336}
            className="aspect-[2/3] w-full max-w-56 transition-shadow group-hover:shadow-lg"
          />
          <div className="absolute bottom-2 left-2">
            <Badge className="bg-black/70 text-white text-xs px-1.5 py-0.5">
              {manga.chapterFileCount}/{manga.chapterCount}
            </Badge>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight truncate">
            {manga.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {manga.year > 0 && (
              <span className="text-xs text-muted-foreground">
                {manga.year}
              </span>
            )}
            <Badge
              className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[manga.status] ?? "bg-zinc-600"}`}
            >
              {statusLabel(manga.status)}
            </Badge>
            {TYPE_LABELS[manga.type] && (
              <Badge className="text-[10px] px-1.5 py-0 bg-zinc-600">
                {TYPE_LABELS[manga.type]}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
