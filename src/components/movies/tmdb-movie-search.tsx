import { useState, useEffect } from "react";
import type { JSX, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Film, Search, Star } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import { Badge } from "src/components/ui/badge";
import { Card, CardContent } from "src/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import EmptyState from "src/components/shared/empty-state";
import { tmdbSearchMoviesQuery } from "src/lib/queries/tmdb";
import { movieExistenceQuery } from "src/lib/queries/movies";
import { downloadProfilesListQuery } from "src/lib/queries/download-profiles";
import { useAddMovie } from "src/hooks/mutations/movies";
import type { TmdbMovieResult } from "src/server/tmdb/types";

function extractYear(releaseDate: string): string | null {
  if (!releaseDate) {
    return null;
  }
  const year = releaseDate.split("-")[0];
  return year && year.length === 4 ? year : null;
}

// ── Preview Modal ──────────────────────────────────────────────────────────

type MoviePreviewModalProps = {
  movie: TmdbMovieResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function MoviePreviewModal({
  movie,
  open,
  onOpenChange,
}: MoviePreviewModalProps): JSX.Element {
  const navigate = useNavigate();
  const addMovie = useAddMovie();

  const { data: alreadyExists = false } = useQuery({
    ...movieExistenceQuery(movie.id),
    enabled: open && movie.id > 0,
  });

  const { data: allProfiles = [] } = useQuery({
    ...downloadProfilesListQuery(),
    enabled: open,
  });

  const movieProfiles = allProfiles.filter(
    (p) => p.contentType === "movie" && p.enabled,
  );

  const [downloadProfileId, setDownloadProfileId] = useState<string>("");
  const [minimumAvailability, setMinimumAvailability] =
    useState<string>("released");

  // Auto-select first profile when profiles load
  useEffect(() => {
    if (movieProfiles.length > 0 && !downloadProfileId) {
      setDownloadProfileId(String(movieProfiles[0].id));
    }
  }, [movieProfiles, downloadProfileId]);

  const year = extractYear(movie.release_date);

  const handleAdd = () => {
    if (!downloadProfileId) {
      return;
    }
    addMovie.mutate(
      {
        tmdbId: movie.id,
        downloadProfileId: Number(downloadProfileId),
        minimumAvailability: minimumAvailability as
          | "announced"
          | "inCinemas"
          | "released",
      },
      {
        onSuccess: (result) => {
          onOpenChange(false);
          navigate({
            to: "/movies/$movieId",
            params: { movieId: String(result.id) },
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="sr-only">{movie.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Poster + title row */}
          <div className="flex gap-4">
            <div className="h-48 w-32 shrink-0 overflow-hidden rounded border border-border bg-muted">
              {movie.poster_path ? (
                <img
                  src={movie.poster_path}
                  alt={`${movie.title} poster`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Film className="h-8 w-8" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="text-xl font-semibold leading-tight">
                {movie.title}
                {year && (
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    ({year})
                  </span>
                )}
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                {movie.vote_average > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="h-3 w-3" />
                    {movie.vote_average.toFixed(1)}
                  </Badge>
                )}
                {movie.popularity > 0 && (
                  <Badge variant="outline">
                    Popularity: {Math.round(movie.popularity)}
                  </Badge>
                )}
                {alreadyExists && <Badge>Already in library</Badge>}
              </div>

              {movie.overview && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {movie.overview}
                </p>
              )}
            </div>
          </div>

          {/* Add form */}
          {!alreadyExists && (
            <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-2">
                <Label>Download Profile</Label>
                {movieProfiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No movie download profiles available. Create one in
                    Settings.
                  </p>
                ) : (
                  <Select
                    value={downloadProfileId}
                    onValueChange={setDownloadProfileId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {movieProfiles.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label>Minimum Availability</Label>
                <Select
                  value={minimumAvailability}
                  onValueChange={setMinimumAvailability}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="announced">Announced</SelectItem>
                    <SelectItem value="inCinemas">In Cinemas</SelectItem>
                    <SelectItem value="released">Released</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                onClick={handleAdd}
                disabled={
                  !downloadProfileId ||
                  addMovie.isPending ||
                  movieProfiles.length === 0
                }
              >
                {addMovie.isPending ? "Adding..." : "Add Movie"}
              </Button>
            </div>
          )}

          {alreadyExists && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Result Card ────────────────────────────────────────────────────────────

function MovieResultCard({
  movie,
  onClick,
}: {
  movie: TmdbMovieResult;
  onClick: (movie: TmdbMovieResult) => void;
}): JSX.Element {
  const year = extractYear(movie.release_date);

  return (
    <button
      type="button"
      className="block w-full text-left"
      onClick={() => onClick(movie)}
    >
      <Card className="py-0 overflow-hidden hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="h-24 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted">
              {movie.poster_path ? (
                <img
                  src={movie.poster_path}
                  alt={`${movie.title} poster`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Film className="h-5 w-5" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {year && <Badge variant="outline">{year}</Badge>}
                {movie.vote_average > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="h-3 w-3" />
                    {movie.vote_average.toFixed(1)}
                  </Badge>
                )}
              </div>

              <h3 className="font-semibold leading-tight">{movie.title}</h3>

              {movie.overview && (
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  {movie.overview}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

// ── Main Search Component ──────────────────────────────────────────────────

export default function TmdbMovieSearch(): JSX.Element {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [previewMovie, setPreviewMovie] = useState<TmdbMovieResult | undefined>(
    undefined,
  );

  // Debounce the search query
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const {
    data: searchData,
    isLoading,
    isError,
    error,
  } = useQuery(tmdbSearchMoviesQuery(debouncedQuery));

  const results = searchData?.results ?? [];

  // Determine content to render
  let searchResultsContent: ReactNode;

  if (isError) {
    const message =
      error instanceof Error ? error.message : "Search request failed.";
    const isMissingKey =
      message.toLowerCase().includes("api key") ||
      message.toLowerCase().includes("tmdb") ||
      message.toLowerCase().includes("unauthorized");
    searchResultsContent = (
      <EmptyState
        icon={Film}
        title="Search failed"
        description={
          isMissingKey
            ? "Configure your TMDB API key in Settings > Metadata to search for movies."
            : message
        }
      />
    );
  } else if (!debouncedQuery || debouncedQuery.length < 2) {
    searchResultsContent = (
      <EmptyState
        icon={Search}
        title="Search for a movie"
        description="Enter a movie title above to search TMDB."
      />
    );
  } else if (isLoading) {
    searchResultsContent = (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground">Searching TMDB...</p>
        </CardContent>
      </Card>
    );
  } else if (results.length === 0) {
    searchResultsContent = (
      <EmptyState
        icon={Search}
        title="No results found"
        description={`No movies found for "${debouncedQuery}".`}
      />
    );
  } else {
    searchResultsContent = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Showing {results.length} result{results.length === 1 ? "" : "s"} for
          &ldquo;{debouncedQuery}&rdquo;.
        </p>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {results.map((movie) => (
            <MovieResultCard
              key={movie.id}
              movie={movie}
              onClick={setPreviewMovie}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a movie by title..."
          autoComplete="off"
          aria-label="Search movies"
          className="pl-9"
        />
      </div>

      <div className="mt-4">{searchResultsContent}</div>

      {previewMovie && (
        <MoviePreviewModal
          movie={previewMovie}
          open={Boolean(previewMovie)}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewMovie(undefined);
            }
          }}
        />
      )}
    </>
  );
}
