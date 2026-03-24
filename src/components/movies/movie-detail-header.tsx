import { useState, useMemo } from "react";
import type { JSX } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "src/components/ui/button";
import { Badge } from "src/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import PageHeader from "src/components/shared/page-header";
import ActionButtonGroup from "src/components/shared/action-button-group";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import UnmonitorDialog from "src/components/shared/unmonitor-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
import MoviePoster from "src/components/movies/movie-poster";
import {
  useUpdateMovie,
  useDeleteMovie,
  useRefreshMovieMetadata,
} from "src/hooks/mutations/movies";

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
  minimumAvailability: string;
  downloadProfileIds: number[];
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
  contentType: string;
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
  const refreshMetadata = useRefreshMovieMetadata();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editProfilesOpen, setEditProfilesOpen] = useState(false);
  const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>(
    movie.downloadProfileIds,
  );

  const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(
    null,
  );

  // Wrap in useMemo to satisfy linter
  const movieProfiles = useMemo(
    () => downloadProfiles.filter((p) => p.contentType === "movie"),
    [downloadProfiles],
  );

  const activeMovieProfiles = useMemo(
    () => movieProfiles.filter((p) => movie.downloadProfileIds.includes(p.id)),
    [movieProfiles, movie.downloadProfileIds],
  );

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

  const handleProfileToggle = (profileId: number) => {
    if (movie.downloadProfileIds.includes(profileId)) {
      setUnmonitorProfileId(profileId);
    } else {
      updateMovie.mutate(
        {
          id: movie.id,
          downloadProfileIds: [...movie.downloadProfileIds, profileId],
        },
        { onSuccess: () => router.invalidate() },
      );
    }
  };

  const handleUnmonitorConfirm = (_deleteFiles: boolean) => {
    if (unmonitorProfileId === null) {
      return;
    }
    updateMovie.mutate(
      {
        id: movie.id,
        downloadProfileIds: movie.downloadProfileIds.filter(
          (id) => id !== unmonitorProfileId,
        ),
      },
      {
        onSuccess: () => {
          setUnmonitorProfileId(null);
          router.invalidate();
        },
      },
    );
  };

  const handleRefreshMetadata = () => {
    refreshMetadata.mutate(movie.id, {
      onSuccess: () => router.invalidate(),
    });
  };

  const tmdbUrl = `https://www.themoviedb.org/movie/${movie.tmdbId}`;
  const imdbUrl = movie.imdbId
    ? `https://www.imdb.com/title/${movie.imdbId}`
    : null;

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
        <ActionButtonGroup
          onRefreshMetadata={handleRefreshMetadata}
          isRefreshing={refreshMetadata.isPending}
          onEdit={() => {
            setSelectedProfileIds(movie.downloadProfileIds);
            setEditProfilesOpen(true);
          }}
          onDelete={() => setDeleteOpen(true)}
          externalUrl={tmdbUrl}
          externalLabel="Open in TMDB"
        />
      </div>

      {/* Page header */}
      <div className="flex items-start gap-3">
        {movie.downloadProfileIds.length > 0 && (
          <ProfileToggleIcons
            profiles={activeMovieProfiles}
            activeProfileIds={movie.downloadProfileIds}
            onToggle={handleProfileToggle}
            isPending={updateMovie.isPending}
            size="lg"
            direction="vertical"
          />
        )}
        <div className="flex-1 min-w-0">
          <PageHeader
            title={movie.title}
            description={
              movie.year > 0
                ? `${movie.year}${movie.studio ? ` - ${movie.studio}` : ""}`
                : movie.studio || undefined
            }
          />
        </div>
      </div>

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

      <UnmonitorDialog
        open={unmonitorProfileId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUnmonitorProfileId(null);
          }
        }}
        profileName={
          movieProfiles.find((p) => p.id === unmonitorProfileId)?.name ?? ""
        }
        itemTitle={movie.title}
        itemType="movie"
        fileCount={0}
        onConfirm={handleUnmonitorConfirm}
        isPending={updateMovie.isPending}
      />
    </>
  );
}
