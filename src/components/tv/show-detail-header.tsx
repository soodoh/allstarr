import { useState, useMemo, useEffect } from "react";
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
import Switch from "src/components/ui/switch";
import Label from "src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
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
  monitorNewSeasons: string;
  useSeasonFolder: number | null;
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
  seriesTypes: string[] | unknown;
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

type ProfileConflict = {
  profileId: number;
  profileName: string;
  resolution: "remove" | "migrate" | null;
  migrateToId?: number;
};

type EditShowDialogProps = {
  show: ShowDetail;
  tvProfiles: Array<{
    id: number;
    name: string;
    icon: string;
    seriesTypes: string[];
  }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function EditShowDialog({
  show,
  tvProfiles,
  open,
  onOpenChange,
}: EditShowDialogProps): JSX.Element {
  const router = useRouter();
  const updateShow = useUpdateShow();
  const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>(
    show.downloadProfileIds,
  );
  const [monitorNewSeasons, setMonitorNewSeasons] = useState(
    show.monitorNewSeasons ?? "all",
  );
  const [useSeasonFolder, setUseSeasonFolder] = useState(
    Boolean(show.useSeasonFolder),
  );
  const [seriesType, setSeriesType] = useState(show.seriesType ?? "standard");
  const [conflicts, setConflicts] = useState<ProfileConflict[]>([]);

  // Filter available profiles by current series type
  const availableProfiles = useMemo(
    () => tvProfiles.filter((p) => p.seriesTypes.includes(seriesType)),
    [tvProfiles, seriesType],
  );

  // Filter selected profile IDs to only those available for current series type
  const visibleSelectedIds = useMemo(
    () =>
      selectedProfileIds.filter((id) =>
        availableProfiles.some((p) => p.id === id),
      ),
    [selectedProfileIds, availableProfiles],
  );

  // Detect conflicts when series type changes
  useEffect(() => {
    if (seriesType === (show.seriesType ?? "standard")) {
      setConflicts([]);
      return;
    }
    const availableIds = new Set(availableProfiles.map((p) => p.id));
    const conflicting = selectedProfileIds
      .filter((id) => !availableIds.has(id))
      .map((id) => {
        const profile = tvProfiles.find((p) => p.id === id);
        return {
          profileId: id,
          profileName: profile?.name ?? `Profile ${id}`,
          resolution: null as "remove" | "migrate" | null,
        };
      });
    setConflicts(conflicting);
  }, [
    seriesType,
    selectedProfileIds,
    availableProfiles,
    tvProfiles,
    show.seriesType,
  ]);

  const allConflictsResolved = conflicts.every((c) => c.resolution !== null);
  const hasConflicts = conflicts.length > 0;

  // Reset state when dialog opens
  const handleOpenChange = (value: boolean) => {
    if (value) {
      setSelectedProfileIds(show.downloadProfileIds);
      setMonitorNewSeasons(show.monitorNewSeasons ?? "all");
      setUseSeasonFolder(Boolean(show.useSeasonFolder));
      setSeriesType(show.seriesType ?? "standard");
      setConflicts([]);
    }
    onOpenChange(value);
  };

  const toggleProfile = (id: number) => {
    setSelectedProfileIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id],
    );
  };

  const handleSave = () => {
    const removedIds = new Set(
      conflicts
        .filter((c) => c.resolution === "remove")
        .map((c) => c.profileId),
    );
    const migrateProfiles = conflicts
      .filter((c) => c.resolution === "migrate" && c.migrateToId)
      .map((c) => ({
        fromProfileId: c.profileId,
        toProfileId: c.migrateToId!,
      }));

    const finalProfileIds = [
      ...selectedProfileIds.filter(
        (id) =>
          !removedIds.has(id) &&
          !migrateProfiles.some((m) => m.fromProfileId === id),
      ),
      ...migrateProfiles.map((m) => m.toProfileId),
    ];
    const uniqueProfileIds = [...new Set(finalProfileIds)];

    updateShow.mutate(
      {
        id: show.id,
        downloadProfileIds: uniqueProfileIds,
        monitorNewSeasons: monitorNewSeasons as "all" | "none" | "new",
        useSeasonFolder,
        seriesType: seriesType as "standard" | "daily" | "anime",
        migrateProfiles:
          migrateProfiles.length > 0 ? migrateProfiles : undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          router.invalidate();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Download Profiles</DialogTitle>
        </DialogHeader>

        {/* Monitor New Seasons */}
        <div className="space-y-2">
          <Label>Monitor New Seasons</Label>
          <Select
            value={monitorNewSeasons}
            onValueChange={setMonitorNewSeasons}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Seasons</SelectItem>
              <SelectItem value="none">No New Seasons</SelectItem>
              <SelectItem value="new">New Seasons Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Series Type */}
        <div className="space-y-2">
          <Label>Series Type</Label>
          <Select value={seriesType} onValueChange={setSeriesType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="anime">Anime</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ProfileCheckboxGroup
          profiles={availableProfiles}
          selectedIds={visibleSelectedIds}
          onToggle={toggleProfile}
        />

        {conflicts.length > 0 && (
          <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">
              Profile conflicts detected
            </p>
            {conflicts.map((conflict) => (
              <div key={conflict.profileId} className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">{conflict.profileName}</span> is
                  not available for {seriesType} series
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={
                      conflict.resolution === "remove" ? "default" : "outline"
                    }
                    onClick={() =>
                      setConflicts((prev) =>
                        prev.map((c) =>
                          c.profileId === conflict.profileId
                            ? {
                                ...c,
                                resolution: "remove",
                                migrateToId: undefined,
                              }
                            : c,
                        ),
                      )
                    }
                  >
                    Remove
                  </Button>
                  {availableProfiles.length > 0 && (
                    <Select
                      value={
                        conflict.resolution === "migrate"
                          ? String(conflict.migrateToId)
                          : ""
                      }
                      onValueChange={(val) =>
                        setConflicts((prev) =>
                          prev.map((c) =>
                            c.profileId === conflict.profileId
                              ? {
                                  ...c,
                                  resolution: "migrate",
                                  migrateToId: Number(val),
                                }
                              : c,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Migrate to..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableProfiles.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Use Season Folder toggle */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="space-y-1">
            <Label>Use Season Folder</Label>
            <p className="text-sm text-muted-foreground">
              Organize episodes into season-based folder structure.
            </p>
          </div>
          <Switch
            checked={useSeasonFolder}
            onCheckedChange={setUseSeasonFolder}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              updateShow.isPending || (hasConflicts && !allConflictsResolved)
            }
          >
            {updateShow.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ShowDetailHeader({
  show,
  downloadProfiles,
}: ShowDetailHeaderProps): JSX.Element {
  const navigate = useNavigate();
  const router = useRouter();
  const deleteShow = useDeleteShow();
  const refreshMetadata = useRefreshShowMetadata();
  const bulkMonitor = useBulkMonitorEpisodeProfile();
  const bulkUnmonitor = useBulkUnmonitorEpisodeProfile();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editProfilesOpen, setEditProfilesOpen] = useState(false);
  const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(
    null,
  );

  const tvProfiles = useMemo(
    () =>
      downloadProfiles
        .filter((p) => p.contentType === "tv")
        .map((p) =>
          Object.assign(p, {
            seriesTypes: (p.seriesTypes ?? [
              "standard",
              "daily",
              "anime",
            ]) as string[],
          }),
        ),
    [downloadProfiles],
  );

  const handleRefreshMetadata = () => {
    refreshMetadata.mutate(show.id, {
      onSuccess: () => router.invalidate(),
    });
  };

  const tmdbUrl = `https://www.themoviedb.org/tv/${show.tmdbId}`;
  const imdbUrl = show.imdbId
    ? `https://www.imdb.com/title/${show.imdbId}`
    : null;

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
          onEdit={() => setEditProfilesOpen(true)}
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
                      {show.imdbId}
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
      <EditShowDialog
        show={show}
        tvProfiles={tvProfiles}
        open={editProfilesOpen}
        onOpenChange={setEditProfilesOpen}
      />

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
