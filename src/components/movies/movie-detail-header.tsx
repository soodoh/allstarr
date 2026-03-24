import { useState, useMemo } from "react";
import type { JSX } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import { Badge } from "src/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import Switch from "src/components/ui/switch";
import PageHeader from "src/components/shared/page-header";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
import MoviePoster from "src/components/movies/movie-poster";
import { useUpdateMovie, useDeleteMovie } from "src/hooks/mutations/movies";

type MovieDetail = {
  id: number;
  title: string;
  overview: string;
  tmdbId: number;
  imdbId: string | null;
  status: string;
  studio: string;
  year: number;
  runtime: number;
  genres: string[] | null;
  posterUrl: string;
  monitored: boolean | null;
  minimumAvailability: string;
  downloadProfileIds: number[];
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
  contentType: string;
  enabled: boolean;
};

type MovieDetailHeaderProps = {
  movie: MovieDetail;
  downloadProfiles: DownloadProfile[];
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

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

function availabilityLabel(value: string): string {
  switch (value) {
    case "inCinemas": {
      return "In Cinemas";
    }
    case "announced": {
      return "Announced";
    }
    case "released": {
      return "Released";
    }
    default: {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
  }
}

export default function MovieDetailHeader({
  movie,
  downloadProfiles,
}: MovieDetailHeaderProps): JSX.Element {
  const navigate = useNavigate();
  const router = useRouter();
  const updateMovie = useUpdateMovie();
  const deleteMovie = useDeleteMovie();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editProfilesOpen, setEditProfilesOpen] = useState(false);
  const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>(
    movie.downloadProfileIds,
  );

  // Wrap in useMemo to satisfy linter
  const movieProfiles = useMemo(
    () =>
      downloadProfiles.filter((p) => p.contentType === "movie" && p.enabled),
    [downloadProfiles],
  );

  const profileNames = downloadProfiles
    .filter((p) => movie.downloadProfileIds.includes(p.id))
    .map((p) => p.name);

  const toggleProfile = (id: number) => {
    setSelectedProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleSaveProfiles = () => {
    updateMovie.mutate(
      { id: movie.id, downloadProfileIds: selectedProfileIds },
      {
        onSuccess: () => {
          setEditProfilesOpen(false);
          router.invalidate();
        },
      },
    );
  };

  const tmdbUrl = `https://www.themoviedb.org/movie/${movie.tmdbId}`;
  const imdbUrl = movie.imdbId
    ? `https://www.imdb.com/title/${movie.imdbId}`
    : null;

  const handleMonitorToggle = (checked: boolean) => {
    updateMovie.mutate(
      { id: movie.id, monitored: checked },
      { onSuccess: () => router.invalidate() },
    );
  };

  const handleDelete = () => {
    deleteMovie.mutate(
      { id: movie.id, deleteFiles: true },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          navigate({ to: "/movies" });
        },
      },
    );
  };

  return (
    <>
      {/* Back link + action buttons */}
      <div className="flex items-center justify-between">
        <Link
          to="/movies"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Movies
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={tmdbUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" />
              TMDB
            </a>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Page header */}
      <PageHeader
        title={movie.title}
        description={
          movie.year > 0
            ? `${movie.year}${movie.studio ? ` - ${movie.studio}` : ""}`
            : movie.studio || undefined
        }
      />

      {/* Three-column layout */}
      <div className="flex flex-col gap-6 xl:flex-row">
        {/* Left: Poster */}
        <MoviePoster
          posterUrl={movie.posterUrl || null}
          title={movie.title}
          className="w-full xl:w-44 shrink-0"
        />

        {/* Center: Details */}
        <Card className="w-full xl:w-72 xl:shrink-0">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {movie.year > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Year</dt>
                  <dd>{movie.year}</dd>
                </div>
              )}
              {movie.studio && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Studio</dt>
                  <dd className="text-right">{movie.studio}</dd>
                </div>
              )}
              {movie.runtime > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Runtime</dt>
                  <dd>{formatRuntime(movie.runtime)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge
                    className={`text-xs ${STATUS_COLORS[movie.status] ?? STATUS_COLORS.tba}`}
                  >
                    {statusLabel(movie.status)}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Min. Availability</dt>
                <dd>{availabilityLabel(movie.minimumAvailability)}</dd>
              </div>
              {movie.genres && movie.genres.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Genres</dt>
                  <dd className="text-right">{movie.genres.join(", ")}</dd>
                </div>
              )}
              {imdbUrl && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">IMDB</dt>
                  <dd>
                    <a
                      href={imdbUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {movie.imdbId}
                    </a>
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4 items-center">
                <dt className="text-muted-foreground">Monitored</dt>
                <dd>
                  <Switch
                    checked={movie.monitored ?? false}
                    onCheckedChange={handleMonitorToggle}
                    disabled={updateMovie.isPending}
                  />
                </dd>
              </div>
              {profileNames.length > 0 && (
                <div className="flex justify-between gap-4 items-center">
                  <dt className="text-muted-foreground">Download Profiles</dt>
                  <dd className="flex items-center gap-2">
                    <span className="text-right">
                      {profileNames.join(", ")}
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSelectedProfileIds(movie.downloadProfileIds);
                        setEditProfilesOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Right: Description */}
        <Card className="w-full xl:flex-1">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            {movie.overview ? (
              <p className="text-sm leading-relaxed">{movie.overview}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No description available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit profiles dialog */}
      <Dialog open={editProfilesOpen} onOpenChange={setEditProfilesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Download Profiles</DialogTitle>
          </DialogHeader>
          <ProfileCheckboxGroup
            profiles={movieProfiles}
            selectedIds={selectedProfileIds}
            onToggle={toggleProfile}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditProfilesOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProfiles}
              disabled={updateMovie.isPending}
            >
              {updateMovie.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Movie"
        description={`Are you sure you want to delete "${movie.title}"? This will also remove any downloaded files.`}
        onConfirm={handleDelete}
        loading={deleteMovie.isPending}
        variant="destructive"
      />
    </>
  );
}
