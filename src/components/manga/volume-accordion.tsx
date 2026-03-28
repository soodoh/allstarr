import { useState } from "react";
import type { JSX } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "src/components/ui/accordion";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import UnmonitorDialog from "src/components/shared/unmonitor-dialog";
import ChapterRow from "src/components/manga/chapter-row";
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

type Volume = {
  id: number;
  volumeNumber: number | null;
  title: string | null;
  chapters: Chapter[];
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
};

type VolumeAccordionProps = {
  volume: Volume;
  downloadProfiles: DownloadProfile[];
  displayTitle?: string;
  accordionValue?: string;
};

export default function VolumeAccordion({
  volume,
  downloadProfiles,
  displayTitle,
  accordionValue,
}: VolumeAccordionProps): JSX.Element {
  const router = useRouter();
  const bulkMonitor = useBulkMonitorMangaChapterProfile();
  const bulkUnmonitor = useBulkUnmonitorMangaChapterProfile();
  const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(
    null,
  );

  const sortedChapters = [...volume.chapters].toSorted((a, b) => {
    const aNum = Number.parseFloat(a.chapterNumber);
    const bNum = Number.parseFloat(b.chapterNumber);
    if (Number.isNaN(aNum) && Number.isNaN(bNum)) {
      return b.chapterNumber.localeCompare(a.chapterNumber);
    }
    if (Number.isNaN(aNum)) {
      return 1;
    }
    if (Number.isNaN(bNum)) {
      return -1;
    }
    return bNum - aNum;
  });

  const fileCount = sortedChapters.filter((ch) => ch.hasFile).length;
  const totalCount = sortedChapters.length;
  const volumeLabel =
    displayTitle ??
    (volume.volumeNumber === null
      ? "Ungrouped"
      : `Volume ${volume.volumeNumber}`);

  // Compute per-profile monitoring state for this volume
  // oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop -- Computed from chapter data, memoization not needed
  const activeProfileIds = downloadProfiles
    .filter(
      (_p) => totalCount > 0 && sortedChapters.every((ch) => ch.monitored),
    )
    .map((p) => p.id);

  // oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop -- Computed from chapter data, memoization not needed
  const partialProfileIds = downloadProfiles
    .filter(
      (p) =>
        !activeProfileIds.includes(p.id) &&
        sortedChapters.some((ch) => ch.monitored),
    )
    .map((p) => p.id);

  const handleVolumeProfileToggle = (profileId: number) => {
    const isActive = activeProfileIds.includes(profileId);
    if (isActive) {
      setUnmonitorProfileId(profileId);
    } else {
      const chapterIds = sortedChapters.map((ch) => ch.id);
      bulkMonitor.mutate(
        { chapterIds, downloadProfileId: profileId },
        { onSuccess: () => router.invalidate() },
      );
    }
  };

  const handleUnmonitorConfirm = (deleteFiles: boolean) => {
    if (unmonitorProfileId === null) {
      return;
    }
    const chapterIds = sortedChapters.map((ch) => ch.id);
    bulkUnmonitor.mutate(
      { chapterIds, downloadProfileId: unmonitorProfileId, deleteFiles },
      {
        onSuccess: () => {
          setUnmonitorProfileId(null);
          router.invalidate();
        },
      },
    );
  };

  // Color the progress based on completeness
  let progressColor = "text-muted-foreground";
  if (totalCount > 0) {
    if (fileCount === totalCount) {
      progressColor = "text-green-500";
    } else if (fileCount > 0) {
      progressColor = "text-yellow-500";
    }
  }

  return (
    <>
      <AccordionItem value={accordionValue ?? `volume-${volume.id}`}>
        <AccordionTrigger className="hover:no-underline px-3">
          <div className="flex flex-1 items-center gap-4">
            {downloadProfiles.length > 0 && (
              <ProfileToggleIcons
                profiles={downloadProfiles}
                activeProfileIds={activeProfileIds}
                partialProfileIds={partialProfileIds}
                onToggle={handleVolumeProfileToggle}
                size="sm"
                direction="horizontal"
              />
            )}
            <span className="font-medium">{volumeLabel}</span>
            <span className="text-muted-foreground text-xs">
              {totalCount} chapter{totalCount === 1 ? "" : "s"}
            </span>
            <span className={`text-xs font-mono ${progressColor}`}>
              {fileCount}/{totalCount}
            </span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-0 pb-0">
          {/* Column headers — no header for monitor column */}
          <div className="flex items-center gap-4 px-3 py-1.5 text-xs text-muted-foreground border-b font-medium">
            <span className="w-14 shrink-0" />
            <span className="w-20 shrink-0">#</span>
            <span className="flex-1 min-w-0">Title</span>
            <span className="w-28 shrink-0 text-right">Release Date</span>
            <span className="w-28 shrink-0 text-right">Group</span>
            <span className="w-8 shrink-0 text-center">File</span>
          </div>
          {sortedChapters.map((chapter) => (
            <ChapterRow
              key={chapter.id}
              chapter={chapter}
              downloadProfiles={downloadProfiles}
            />
          ))}
        </AccordionContent>
      </AccordionItem>

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
        itemTitle={volumeLabel}
        itemType="volume"
        fileCount={0}
        onConfirm={handleUnmonitorConfirm}
        isPending={bulkUnmonitor.isPending}
      />
    </>
  );
}
