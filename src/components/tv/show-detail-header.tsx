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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import PageHeader from "src/components/shared/page-header";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
import ShowPoster from "src/components/tv/show-poster";
import { useUpdateShow, useDeleteShow } from "src/hooks/mutations/shows";

type ShowDetail = {
  id: number;
  title: string;
  overview: string;
  tmdbId: number;
  imdbId: string | null;
  status: string;
  seriesType: string;
  network: string;
  year: number;
  runtime: number;
  genres: string[] | null;
  posterUrl: string;
  monitored: boolean | null;
  downloadProfileIds: number[];
  seasons: Array<{
    episodes: Array<{
      hasFile: boolean | null;
    }>;
  }>;
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
  contentType: string;
};

type ShowDetailHeaderProps = {
  show: ShowDetail;
  downloadProfiles: DownloadProfile[];
};

const STATUS_COLORS: Record<string, string> = {
  continuing: "bg-green-600",
  ended: "bg-blue-600",
  upcoming: "bg-yellow-600",
  canceled: "bg-red-600",
};

const SERIES_TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  daily: "Daily",
  anime: "Anime",
};

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function ShowDetailHeader({
  show,
  downloadProfiles,
}: ShowDetailHeaderProps): JSX.Element {
  const navigate = useNavigate();
  const router = useRouter();
  const updateShow = useUpdateShow();
  const deleteShow = useDeleteShow();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editProfilesOpen, setEditProfilesOpen] = useState(false);
  const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>(
    show.downloadProfileIds,
  );

  const profileNames = downloadProfiles
    .filter((p) => show.downloadProfileIds.includes(p.id))
    .map((p) => p.name);

  const tvProfiles = useMemo(
    () => downloadProfiles.filter((p) => p.contentType === "tv"),
    [downloadProfiles],
  );

  const toggleProfile = (id: number) => {
    setSelectedProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleSaveProfiles = () => {
    updateShow.mutate(
      { id: show.id, downloadProfileIds: selectedProfileIds },
      {
        onSuccess: () => {
          setEditProfilesOpen(false);
          router.invalidate();
        },
      },
    );
  };

  const tmdbUrl = `https://www.themoviedb.org/tv/${show.tmdbId}`;

  // Compute episode counts across all seasons
  const allEpisodes = show.seasons.flatMap((s) => s.episodes);
  const episodeCount = allEpisodes.length;
  const episodeFileCount = allEpisodes.filter((ep) => ep.hasFile).length;

  const handleMonitorToggle = (checked: boolean) => {
    updateShow.mutate(
      { id: show.id, monitored: checked },
      { onSuccess: () => router.invalidate() },
    );
  };

  const handleDelete = () => {
    deleteShow.mutate(
      { id: show.id, deleteFiles: true },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          navigate({ to: "/tv" });
        },
      },
    );
  };

  return (
    <>
      {/* Back link + action buttons */}
      <div className="flex items-center justify-between">
        <Link
          to="/tv"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to TV Shows
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
        title={show.title}
        description={
          show.year > 0
            ? `${show.year}${show.network ? ` - ${show.network}` : ""}`
            : show.network || undefined
        }
      />

      {/* Three-column layout */}
      <div className="flex flex-col gap-6 xl:flex-row">
        {/* Left: Poster */}
        <ShowPoster
          posterUrl={show.posterUrl || null}
          title={show.title}
          className="w-full xl:w-44 shrink-0"
        />

        {/* Center: Details */}
        <Card className="w-full xl:w-72 xl:shrink-0">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {show.year > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Year</dt>
                  <dd>{show.year}</dd>
                </div>
              )}
              {show.network && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Network</dt>
                  <dd className="text-right">{show.network}</dd>
                </div>
              )}
              {show.runtime > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Runtime</dt>
                  <dd>{show.runtime}m</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge
                    className={`text-xs ${STATUS_COLORS[show.status] ?? "bg-zinc-600"}`}
                  >
                    {statusLabel(show.status)}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Series Type</dt>
                <dd>
                  <Badge variant="outline" className="text-xs">
                    {SERIES_TYPE_LABELS[show.seriesType] ?? show.seriesType}
                  </Badge>
                </dd>
              </div>
              {show.genres && show.genres.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Genres</dt>
                  <dd className="text-right">{show.genres.join(", ")}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Episodes</dt>
                <dd>
                  {episodeFileCount}/{episodeCount} episodes
                </dd>
              </div>
              <div className="flex justify-between gap-4 items-center">
                <dt className="text-muted-foreground">Monitored</dt>
                <dd>
                  <Switch
                    checked={show.monitored ?? false}
                    onCheckedChange={handleMonitorToggle}
                    disabled={updateShow.isPending}
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
                        setSelectedProfileIds(show.downloadProfileIds);
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
            {show.overview ? (
              <p className="text-sm leading-relaxed">{show.overview}</p>
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
            profiles={tvProfiles}
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
              disabled={updateShow.isPending}
            >
              {updateShow.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Show"
        description={`Are you sure you want to delete "${show.title}"? This will also remove any downloaded files.`}
        onConfirm={handleDelete}
        loading={deleteShow.isPending}
        variant="destructive"
      />
    </>
  );
}
