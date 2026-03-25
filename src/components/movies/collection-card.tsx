import type { JSX } from "react";
import { Film, Pencil, PlusCircle } from "lucide-react";
import { Button } from "src/components/ui/button";
import CollectionMoviePoster from "./collection-movie-poster";

type CollectionMovie = {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  year: number | null;
  isExisting: boolean;
  isExcluded: boolean;
  movieId: number | null;
};

type Collection = {
  id: number;
  title: string;
  overview: string;
  posterUrl: string | null;
  monitored: boolean;
  minimumAvailability: string;
  downloadProfileIds: number[];
  movies: CollectionMovie[];
  missingMovies: number;
};

type Props = {
  collection: Collection;
  onEdit: (collection: Collection) => void;
  onAddMissing: (collectionId: number) => void;
  onExcludeMovie: (movie: CollectionMovie) => void;
  onAddMovie: (tmdbId: number) => void;
  onToggleMonitor: (collection: Collection) => void;
};

export default function CollectionCard({
  collection,
  onEdit,
  onAddMissing,
  onExcludeMovie,
  onAddMovie,
  onToggleMonitor,
}: Props): JSX.Element {
  const totalMovies = collection.movies.length;

  return (
    <div className="flex gap-4 rounded-lg border border-border bg-card p-4">
      {/* Poster */}
      <div className="w-[80px] h-[120px] flex-shrink-0 rounded-md overflow-hidden bg-muted">
        {collection.posterUrl ? (
          <img
            src={collection.posterUrl}
            alt={collection.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => onToggleMonitor(collection)}
              className="flex-shrink-0"
            >
              <div
                className={`w-3 h-3 rounded-full ${
                  collection.monitored ? "bg-green-500" : "bg-muted-foreground"
                }`}
              />
            </button>
            <h3 className="text-sm font-semibold truncate">
              {collection.title}
            </h3>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(collection)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {collection.missingMovies > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onAddMissing(collection.id)}
              >
                <PlusCircle className="mr-1 h-3.5 w-3.5" />
                Add Missing
              </Button>
            )}
          </div>
        </div>

        {/* Subtitle */}
        <p className="text-xs text-muted-foreground mt-0.5">
          {totalMovies} movie{totalMovies === 1 ? "" : "s"}
          {collection.missingMovies > 0 && (
            <span className="text-red-400">
              {" · "}
              {collection.missingMovies} missing
            </span>
          )}
        </p>

        {/* Overview */}
        {collection.overview && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {collection.overview}
          </p>
        )}

        {/* Movie posters row */}
        {collection.movies.length > 0 && (
          <div className="flex gap-1.5 mt-3 overflow-x-auto">
            {collection.movies.map((movie) => (
              <CollectionMoviePoster
                key={movie.tmdbId}
                movie={movie}
                onExclude={onExcludeMovie}
                onAddMovie={onAddMovie}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
