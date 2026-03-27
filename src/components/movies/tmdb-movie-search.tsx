import { useState, useEffect, useMemo } from "react";
import type { JSX, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Film, Search, Star } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Checkbox from "src/components/ui/checkbox";
import { Badge } from "src/components/ui/badge";
import { Card, CardContent } from "src/components/ui/card";
import {
  Dialog,
  DialogBody,
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
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
import OptimizedImage from "src/components/shared/optimized-image";
import { resizeTmdbUrl } from "src/lib/utils";
import { tmdbSearchMoviesQuery } from "src/lib/queries/tmdb";
import { movieExistenceQuery } from "src/lib/queries/movies";
import { downloadProfilesListQuery } from "src/lib/queries/download-profiles";
import { useAddMovie } from "src/hooks/mutations/movies";
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
import { userSettingsQuery } from "src/lib/queries/user-settings";
import type { TmdbMovieResult } from "src/server/tmdb/types";

function extractYear(releaseDate: string): string | null {
  if (!releaseDate) {
    return null;
  }
  const year = releaseDate.split("-")[0];
  return year && year.length === 4 ? year : null;
}

// ── Preview Modal ──────────────────────────────────────────────────────────

export type MoviePreviewModalProps = {
  movie: TmdbMovieResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
  addDefaults?: Record<string, unknown> | null;
};

export function MoviePreviewModal({
  movie,
  open,
  onOpenChange,
  onAdded,
  addDefaults,
}: MoviePreviewModalProps): JSX.Element {
  const navigate = useNavigate();
  const addMovie = useAddMovie();
  const upsertSettings = useUpsertUserSettings();

  const { data: alreadyExists = false } = useQuery({
    ...movieExistenceQuery(movie.id),
    enabled: open && movie.id > 0,
  });

  const { data: allProfiles = [] } = useQuery({
    ...downloadProfilesListQuery(),
    enabled: open,
  });

  const movieProfiles = useMemo(
    () => allProfiles.filter((p) => p.contentType === "movie"),
    [allProfiles],
  );

  const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>(
    () => (addDefaults?.downloadProfileIds as number[] | undefined) ?? [],
  );
  const [minimumAvailability, setMinimumAvailability] = useState<string>(
    () =>
      (addDefaults?.minimumAvailability as string | undefined) ?? "released",
  );
  const [monitorOption, setMonitorOption] = useState<
    "movieOnly" | "movieAndCollection" | "none"
  >(
    () =>
      (addDefaults?.monitorOption as
        | "movieOnly"
        | "movieAndCollection"
        | "none"
        | undefined) ?? "movieOnly",
  );
  const [searchOnAdd, setSearchOnAdd] = useState(
    () => (addDefaults?.searchOnAdd as boolean | undefined) ?? false,
  );

  const toggleProfile = (id: number) => {
    setDownloadProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const year = extractYear(movie.release_date);

  const handleAdd = () => {
    if (monitorOption !== "none" && downloadProfileIds.length === 0) {
      return;
    }
    upsertSettings.mutate({
      tableId: "movies",
      addDefaults: {
        downloadProfileIds,
        minimumAvailability,
        monitorOption,
        searchOnAdd,
      },
    });
    addMovie.mutate(
      {
        tmdbId: movie.id,
        downloadProfileIds,
        minimumAvailability: minimumAvailability as
          | "announced"
          | "inCinemas"
          | "released",
        monitorOption,
        searchOnAdd,
      },
      {
        onSuccess: (result) => {
          onOpenChange(false);
          if (onAdded) {
            onAdded();
          } else {
            navigate({
              to: "/movies/$movieId",
              params: { movieId: String(result.id) },
            });
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="sr-only">{movie.title}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            {/* Poster + title row */}
            <div className="flex gap-4">
              <OptimizedImage
                src={resizeTmdbUrl(movie.poster_path ?? null, "w342")}
                alt={`${movie.title} poster`}
                type="movie"
                width={128}
                height={192}
                className="h-48 w-32 shrink-0 rounded"
              />

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
                <ProfileCheckboxGroup
                  profiles={movieProfiles}
                  selectedIds={downloadProfileIds}
                  onToggle={toggleProfile}
                />

                <div className="space-y-2">
                  <Label>Monitor</Label>
                  <Select
                    value={monitorOption}
                    onValueChange={(v) =>
                      setMonitorOption(
                        v as "movieOnly" | "movieAndCollection" | "none",
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="movieOnly">Movie Only</SelectItem>
                      <SelectItem value="movieAndCollection">
                        Movie &amp; Collection
                      </SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
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

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="search-on-add"
                    checked={searchOnAdd}
                    onCheckedChange={(checked) =>
                      setSearchOnAdd(checked === true)
                    }
                  />
                  <Label htmlFor="search-on-add">
                    Start search for missing movie
                  </Label>
                </div>

                <Button
                  className="w-full"
                  onClick={handleAdd}
                  disabled={
                    (monitorOption !== "none" &&
                      downloadProfileIds.length === 0) ||
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
        </DialogBody>
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
            <OptimizedImage
              src={resizeTmdbUrl(movie.poster_path ?? null, "w185")}
              alt={`${movie.title} poster`}
              type="movie"
              width={64}
              height={96}
              className="h-24 w-16 shrink-0 rounded"
            />

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

  const { data: settings } = useQuery(userSettingsQuery("movies"));

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
          autoFocus
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
          addDefaults={settings?.addDefaults}
        />
      )}
    </>
  );
}
