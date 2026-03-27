import { useState } from "react";
import type { JSX } from "react";
import { Check, Minus } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import UnmonitorDialog from "src/components/shared/unmonitor-dialog";
import {
  useBulkMonitorMangaChapterProfile,
  useBulkUnmonitorMangaChapterProfile,
} from "src/hooks/mutations/manga-chapter-profiles";

type Chapter = {
  id: number;
  chapterNumber: string;
  title: string | null;
  releaseDate: string | null;
  scanlationGroup: string | null;
  hasFile: boolean | null;
  monitored: boolean | null;
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
};

type ChapterRowProps = {
  chapter: Chapter;
  downloadProfiles: DownloadProfile[];
};

function formatReleaseDate(releaseDate: string | null): string {
  if (!releaseDate) {
    return "TBA";
  }
  try {
    return new Date(`${releaseDate}T00:00:00`).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return releaseDate;
  }
}

export default function ChapterRow({
  chapter,
  downloadProfiles,
}: ChapterRowProps): JSX.Element {
  const router = useRouter();
  const monitorProfile = useBulkMonitorMangaChapterProfile();
  const unmonitorProfile = useBulkUnmonitorMangaChapterProfile();
  const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(
    null,
  );

  // Per-chapter profile active state: if the chapter is monitored, all assigned profiles are active
  // oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop -- Computed from chapter data
  const activeProfileIds = chapter.monitored
    ? downloadProfiles.map((p) => p.id)
    : [];

  const handleProfileToggle = (profileId: number) => {
    if (activeProfileIds.includes(profileId)) {
      setUnmonitorProfileId(profileId);
    } else {
      monitorProfile.mutate(
        { chapterIds: [chapter.id], downloadProfileId: profileId },
        { onSuccess: () => router.invalidate() },
      );
    }
  };

  const handleUnmonitorConfirm = (deleteFiles: boolean) => {
    if (unmonitorProfileId === null) {
      return;
    }
    unmonitorProfile.mutate(
      {
        chapterIds: [chapter.id],
        downloadProfileId: unmonitorProfileId,
        deleteFiles,
      },
      {
        onSuccess: () => {
          setUnmonitorProfileId(null);
          router.invalidate();
        },
      },
    );
  };

  return (
    <>
      <div className="flex items-center gap-4 px-3 py-2 text-sm border-b last:border-b-0">
        {/* Monitor icons — leftmost, no header */}
        <span className="w-14 shrink-0">
          {downloadProfiles.length > 0 && (
            <ProfileToggleIcons
              profiles={downloadProfiles}
              activeProfileIds={activeProfileIds}
              onToggle={handleProfileToggle}
              size="sm"
              direction="horizontal"
            />
          )}
        </span>

        {/* Chapter number */}
        <span className="w-20 shrink-0 font-mono text-muted-foreground">
          {chapter.chapterNumber}
        </span>

        {/* Title */}
        <span
          className="flex-1 min-w-0 truncate"
          title={chapter.title ?? undefined}
        >
          {chapter.title || "-"}
        </span>

        {/* Release date */}
        <span className="w-28 shrink-0 text-right">
          {formatReleaseDate(chapter.releaseDate)}
        </span>

        {/* Scanlation group */}
        <span
          className="w-28 shrink-0 text-right text-muted-foreground truncate"
          title={chapter.scanlationGroup ?? undefined}
        >
          {chapter.scanlationGroup || "-"}
        </span>

        {/* File status */}
        <span className="w-8 shrink-0 flex justify-center">
          {chapter.hasFile ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Minus className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      </div>

      <UnmonitorDialog
        open={unmonitorProfileId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUnmonitorProfileId(null);
          }
        }}
        profileName={
          downloadProfiles.find((p) => p.id === unmonitorProfileId)?.name ?? ""
        }
        itemTitle={chapter.title || `Chapter ${chapter.chapterNumber}`}
        itemType="chapter"
        fileCount={0}
        onConfirm={handleUnmonitorConfirm}
        isPending={unmonitorProfile.isPending}
      />
    </>
  );
}
