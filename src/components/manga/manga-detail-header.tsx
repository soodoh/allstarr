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
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
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
import OptimizedImage from "src/components/shared/optimized-image";
import {
  useUpdateManga,
  useDeleteManga,
  useRefreshMangaMetadata,
  useUnmonitorMangaProfile,
} from "src/hooks/mutations/manga";
import {
  useBulkMonitorMangaChapterProfile,
  useBulkUnmonitorMangaChapterProfile,
} from "src/hooks/mutations/manga-chapter-profiles";

type Chapter = {
  id: number;
  chapterNumber: string;
  hasFile: boolean | null;
  monitored: boolean | null;
};

type Volume = {
  id: number;
  volumeNumber: number | null;
  chapters: Chapter[];
};

type MangaDetail = {
  id: number;
  title: string;
  overview: string;
  mangaUpdatesId: number;
  mangaUpdatesSlug: string | null;
  type: string;
  year: string | null;
  status: string;
  latestChapter: number | null;
  posterUrl: string;
  genres: string[] | null;
  monitorNewChapters: string;
  downloadProfileIds: number[];
  volumes: Volume[];
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
  contentType: string;
};

type MangaDetailHeaderProps = {
  manga: MangaDetail;
  downloadProfiles: DownloadProfile[];
};

const STATUS_COLORS: Record<string, string> = {
  ongoing: "bg-green-600",
  complete: "bg-blue-600",
  hiatus: "bg-yellow-600",
  cancelled: "bg-red-600",
};

const TYPE_LABELS: Record<string, string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
};

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getDescription(year: string | null, type: string): string | undefined {
  const typeLabel = type === "manga" ? "" : (TYPE_LABELS[type] ?? type);
  if (year && typeLabel) {
    return `${year} - ${typeLabel}`;
  }
  if (year) {
    return year;
  }
  if (typeLabel) {
    return typeLabel;
  }
  return undefined;
}

type EditMangaDialogProps = {
  manga: MangaDetail;
  mangaProfiles: Array<{
    id: number;
    name: string;
    icon: string;
  }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function EditMangaDialog({
  manga,
  mangaProfiles,
  open,
  onOpenChange,
}: EditMangaDialogProps): JSX.Element {
  const router = useRouter();
  const updateManga = useUpdateManga();
  const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>(
    manga.downloadProfileIds,
  );
  const [monitorNewChapters, setMonitorNewChapters] = useState(
    manga.monitorNewChapters ?? "all",
  );

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedProfileIds(manga.downloadProfileIds);
      setMonitorNewChapters(manga.monitorNewChapters ?? "all");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleProfile = (id: number) => {
    setSelectedProfileIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id],
    );
  };

  const handleSave = () => {
    updateManga.mutate(
      {
        id: manga.id,
        downloadProfileIds: selectedProfileIds,
        monitorNewChapters: monitorNewChapters as
          | "all"
          | "future"
          | "missing"
          | "none",
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Download Profiles</DialogTitle>
        </DialogHeader>

        <DialogBody>
          {/* Monitor New Chapters */}
          <div className="space-y-2">
            <Label>Monitor New Chapters</Label>
            <Select
              value={monitorNewChapters}
              onValueChange={setMonitorNewChapters}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Chapters</SelectItem>
                <SelectItem value="future">Future Chapters Only</SelectItem>
                <SelectItem value="missing">Missing Chapters Only</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ProfileCheckboxGroup
            profiles={mangaProfiles}
            selectedIds={selectedProfileIds}
            onToggle={toggleProfile}
          />
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateManga.isPending}>
            {updateManga.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MangaDetailHeader({
  manga,
  downloadProfiles,
}: MangaDetailHeaderProps): JSX.Element {
  const navigate = useNavigate();
  const router = useRouter();
  const deleteManga = useDeleteManga();
  const refreshMetadata = useRefreshMangaMetadata();
  const bulkMonitor = useBulkMonitorMangaChapterProfile();
  const bulkUnmonitor = useBulkUnmonitorMangaChapterProfile();
  const unmonitorMangaProfile = useUnmonitorMangaProfile();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editProfilesOpen, setEditProfilesOpen] = useState(false);
  const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(
    null,
  );

  const mangaProfiles = useMemo(
    () => downloadProfiles.filter((p) => p.contentType === "manga"),
    [downloadProfiles],
  );

  // Only profiles assigned to this manga (for header toggle icons)
  const assignedProfiles = useMemo(() => {
    const idSet = new Set(manga.downloadProfileIds);
    return mangaProfiles.filter((p) => idSet.has(p.id));
  }, [mangaProfiles, manga.downloadProfileIds]);

  const handleRefreshMetadata = () => {
    refreshMetadata.mutate(manga.id, {
      onSuccess: () => router.invalidate(),
    });
  };

  const mangaUpdatesUrl = manga.mangaUpdatesSlug
    ? `https://www.mangaupdates.com/series/${manga.mangaUpdatesSlug}`
    : null;

  // Compute chapter counts across all volumes
  const allChapters = manga.volumes.flatMap((v) => v.chapters);
  const chapterCount = allChapters.length;
  const chapterFileCount = allChapters.filter((ch) => ch.hasFile).length;

  const mangaActiveProfileIds = useMemo(
    () =>
      manga.downloadProfileIds.filter(
        (_pid) =>
          allChapters.length > 0 && allChapters.every((ch) => ch.monitored),
      ),
    [manga.downloadProfileIds, allChapters],
  );

  const mangaPartialProfileIds = useMemo(
    () =>
      manga.downloadProfileIds.filter(
        (pid) =>
          !mangaActiveProfileIds.includes(pid) &&
          allChapters.some((ch) => ch.monitored),
      ),
    [manga.downloadProfileIds, mangaActiveProfileIds, allChapters],
  );

  const handleMangaProfileToggle = (profileId: number) => {
    const isActive = mangaActiveProfileIds.includes(profileId);

    if (isActive) {
      setUnmonitorProfileId(profileId);
    } else {
      // Partial or inactive — monitor all chapters for this profile
      const chapterIds = allChapters.map((ch) => ch.id);
      bulkMonitor.mutate(
        { chapterIds, downloadProfileId: profileId },
        { onSuccess: () => router.invalidate() },
      );
    }
  };

  const handleMangaUnmonitorConfirm = (deleteFiles: boolean) => {
    if (unmonitorProfileId === null) {
      return;
    }
    const chapterIds = allChapters.map((ch) => ch.id);
    bulkUnmonitor.mutate(
      { chapterIds, downloadProfileId: unmonitorProfileId, deleteFiles },
      {
        onSuccess: () => {
          unmonitorMangaProfile.mutate(
            { mangaId: manga.id, downloadProfileId: unmonitorProfileId },
            {
              onSuccess: () => {
                setUnmonitorProfileId(null);
                router.invalidate();
              },
            },
          );
        },
      },
    );
  };

  const handleDelete = () => {
    deleteManga.mutate(
      { id: manga.id, deleteFiles: true },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          navigate({ to: "/manga" });
        },
      },
    );
  };

  return (
    <>
      {/* Back link + action buttons */}
      <div className="flex items-center justify-between">
        <Link
          to="/manga"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Manga
        </Link>
        <ActionButtonGroup
          onRefreshMetadata={handleRefreshMetadata}
          isRefreshing={refreshMetadata.isPending}
          onEdit={() => setEditProfilesOpen(true)}
          onDelete={() => setDeleteOpen(true)}
          externalUrl={mangaUpdatesUrl}
          externalLabel="Open in MangaUpdates"
        />
      </div>

      {/* Page header */}
      <div className="flex items-start gap-3">
        <ProfileToggleIcons
          profiles={assignedProfiles}
          activeProfileIds={mangaActiveProfileIds}
          partialProfileIds={mangaPartialProfileIds}
          onToggle={handleMangaProfileToggle}
          size="lg"
          direction="vertical"
        />
        <div className="flex-1 min-w-0">
          <PageHeader
            title={manga.title}
            description={getDescription(manga.year, manga.type)}
          />
        </div>
      </div>

      {/* Three-column layout */}
      <div className="flex flex-col gap-6 xl:flex-row">
        {/* Left: Poster */}
        <OptimizedImage
          src={manga.posterUrl || null}
          alt={`${manga.title} poster`}
          type="manga"
          width={224}
          height={336}
          priority
          className="aspect-[2/3] w-full max-w-56 xl:w-44 shrink-0"
        />

        {/* Center: Details */}
        <Card className="w-full xl:w-72 xl:shrink-0">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {manga.year && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Year</dt>
                  <dd>{manga.year}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Type</dt>
                <dd>
                  <Badge variant="outline" className="text-xs">
                    {TYPE_LABELS[manga.type] ?? manga.type}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge
                    className={`text-xs ${STATUS_COLORS[manga.status] ?? "bg-zinc-600"}`}
                  >
                    {statusLabel(manga.status)}
                  </Badge>
                </dd>
              </div>
              {manga.genres && manga.genres.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Genres</dt>
                  <dd className="text-right">{manga.genres.join(", ")}</dd>
                </div>
              )}
              {manga.latestChapter !== null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Latest Chapter</dt>
                  <dd>{manga.latestChapter}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Chapters</dt>
                <dd>
                  {chapterFileCount}/{chapterCount} chapters
                </dd>
              </div>
              {mangaUpdatesUrl && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">MangaUpdates</dt>
                  <dd>
                    <a
                      href={mangaUpdatesUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {manga.mangaUpdatesId}
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
            {manga.overview ? (
              <p className="text-sm leading-relaxed">{manga.overview}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No description available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit profiles dialog */}
      <EditMangaDialog
        manga={manga}
        mangaProfiles={mangaProfiles}
        open={editProfilesOpen}
        onOpenChange={setEditProfilesOpen}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Manga"
        description={`Are you sure you want to delete "${manga.title}"? This will also remove any downloaded files.`}
        onConfirm={handleDelete}
        loading={deleteManga.isPending}
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
          mangaProfiles.find((p) => p.id === unmonitorProfileId)?.name ?? ""
        }
        itemTitle={manga.title}
        itemType="manga"
        fileCount={0}
        onConfirm={handleMangaUnmonitorConfirm}
        isPending={bulkUnmonitor.isPending}
      />
    </>
  );
}
