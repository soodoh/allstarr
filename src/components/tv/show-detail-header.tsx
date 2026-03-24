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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import PageHeader from "src/components/shared/page-header";
import ActionButtonGroup from "src/components/shared/action-button-group";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import UnmonitorDialog from "src/components/shared/unmonitor-dialog";
import ShowPoster from "src/components/tv/show-poster";
import {
  useUpdateShow,
  useDeleteShow,
  useRefreshShowMetadata,
} from "src/hooks/mutations/shows";
import {
  useBulkMonitorEpisodeProfile,
  useBulkUnmonitorEpisodeProfile,
} from "src/hooks/mutations/episode-profiles";

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
  downloadProfileIds: number[];
  seasons: Array<{
    id: number;
    seasonNumber: number;
    episodes: Array<{
      id: number;
      hasFile: boolean | null;
      downloadProfileIds: number[];
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
  const refreshMetadata = useRefreshShowMetadata();
  const bulkMonitor = useBulkMonitorEpisodeProfile();
  const bulkUnmonitor = useBulkUnmonitorEpisodeProfile();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editProfilesOpen, setEditProfilesOpen] = useState(false);
  const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>(
    show.downloadProfileIds,
  );
  const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(
    null,
  );

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

  const handleRefreshMetadata = () => {
    refreshMetadata.mutate(show.id, {
      onSuccess: () => router.invalidate(),
    });
  };

  const tmdbUrl = `https://www.themoviedb.org/tv/${show.tmdbId}`;

  // Compute episode counts across all seasons
  const allEpisodes = show.seasons.flatMap((s) => s.episodes);
  const episodeCount = allEpisodes.length;
  const episodeFileCount = allEpisodes.filter((ep) => ep.hasFile).length;

  const showActiveProfileIds = useMemo(
    () =>
      show.downloadProfileIds.filter(
        (pid) =>
          allEpisodes.length > 0 &&
          allEpisodes.every((ep) => ep.downloadProfileIds.includes(pid)),
      ),
    [show.downloadProfileIds, allEpisodes],
  );

  const showPartialProfileIds = useMemo(
    () =>
      show.downloadProfileIds.filter(
        (pid) =>
          !showActiveProfileIds.includes(pid) &&
          allEpisodes.some((ep) => ep.downloadProfileIds.includes(pid)),
      ),
    [show.downloadProfileIds, showActiveProfileIds, allEpisodes],
  );

  const filteredProfiles = useMemo(
    () => tvProfiles.filter((p) => show.downloadProfileIds.includes(p.id)),
    [tvProfiles, show.downloadProfileIds],
  );

  const handleShowProfileToggle = (profileId: number) => {
    const isActive = showActiveProfileIds.includes(profileId);
    if (isActive) {
      setUnmonitorProfileId(profileId);
    } else {
      const episodeIds = allEpisodes.map((ep) => ep.id);
      bulkMonitor.mutate(
        { episodeIds, downloadProfileId: profileId },
        { onSuccess: () => router.invalidate() },
      );
    }
  };

  const handleShowUnmonitorConfirm = (deleteFiles: boolean) => {
    if (unmonitorProfileId === null) {
      return;
    }
    const episodeIds = allEpisodes.map((ep) => ep.id);
    bulkUnmonitor.mutate(
      { episodeIds, downloadProfileId: unmonitorProfileId, deleteFiles },
      {
        onSuccess: () => {
          setUnmonitorProfileId(null);
          router.invalidate();
        },
      },
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
        <ActionButtonGroup
          onRefreshMetadata={handleRefreshMetadata}
          isRefreshing={refreshMetadata.isPending}
          onEdit={() => {
            setSelectedProfileIds(show.downloadProfileIds);
            setEditProfilesOpen(true);
          }}
          onDelete={() => setDeleteOpen(true)}
          externalUrl={tmdbUrl}
          externalLabel="Open in TMDB"
        />
      </div>

      {/* Page header */}
      <div className="flex items-start gap-3">
        {show.downloadProfileIds.length > 0 && (
          <ProfileToggleIcons
            profiles={filteredProfiles}
            activeProfileIds={showActiveProfileIds}
            partialProfileIds={showPartialProfileIds}
            onToggle={handleShowProfileToggle}
            isPending={bulkMonitor.isPending || bulkUnmonitor.isPending}
            size="lg"
            direction="vertical"
          />
        )}
        <div className="flex-1 min-w-0">
          <PageHeader
            title={show.title}
            description={
              show.year > 0
                ? `${show.year}${show.network ? ` - ${show.network}` : ""}`
                : show.network || undefined
            }
          />
        </div>
      </div>

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

      <UnmonitorDialog
        open={unmonitorProfileId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUnmonitorProfileId(null);
          }
        }}
        profileName={
          tvProfiles.find((p) => p.id === unmonitorProfileId)?.name ?? ""
        }
        itemTitle={show.title}
        itemType="show"
        fileCount={0}
        onConfirm={handleShowUnmonitorConfirm}
        isPending={bulkUnmonitor.isPending}
      />
    </>
  );
}
