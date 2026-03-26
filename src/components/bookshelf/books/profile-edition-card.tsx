import type { JSX } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "src/components/ui/button";
import OptimizedImage from "src/components/shared/optimized-image";
import { getProfileIcon } from "src/lib/profile-icons";
import { cn } from "src/lib/utils";

export type EditionData = {
  id: number;
  title: string;
  publisher: string | null;
  format: string | null;
  pageCount: number | null;
  audioLength: number | null;
  language: string | null;
  isbn13: string | null;
  isbn10: string | null;
  asin: string | null;
  usersCount: number | null;
  score: number | null;
  editionInformation: string | null;
  images: Array<{ url: string }> | null;
};

type ProfileEditionCardProps = {
  profile: {
    id: number;
    name: string;
    icon: string;
    contentType: "ebook" | "audiobook";
  };
  edition: EditionData | null;
  onChooseEdition: () => void;
  onUnmonitor: () => void;
};

function formatDuration(minutes: number): string {
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

function EditionDetails({
  edition,
  fallbackIcon: _Icon,
}: {
  edition: EditionData;
  fallbackIcon: LucideIcon;
}): JSX.Element {
  const coverUrl = edition.images?.[0]?.url ?? null;

  return (
    <>
      <OptimizedImage
        src={coverUrl}
        alt={edition.title}
        type="book"
        width={48}
        height={72}
        className="h-[72px] w-[48px] rounded shrink-0"
      />

      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-sm font-medium truncate">{edition.title}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {edition.publisher && <span>{edition.publisher}</span>}
          {edition.format && <span>{edition.format}</span>}
          {edition.pageCount !== null && edition.pageCount > 0 && (
            <span>{edition.pageCount} pages</span>
          )}
          {edition.audioLength !== null && edition.audioLength > 0 && (
            <span>{formatDuration(edition.audioLength)}</span>
          )}
          {edition.language && <span>{edition.language}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {edition.isbn13 && <span>ISBN: {edition.isbn13}</span>}
          {edition.asin && <span>ASIN: {edition.asin}</span>}
        </div>
        {edition.usersCount !== null && edition.usersCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {edition.usersCount.toLocaleString()} readers
          </span>
        )}
      </div>
    </>
  );
}

export default function ProfileEditionCard({
  profile,
  edition,
  onChooseEdition,
  onUnmonitor,
}: ProfileEditionCardProps): JSX.Element {
  const Icon = getProfileIcon(profile.icon);
  const isMonitored = edition !== null;

  return (
    <div
      className={cn(
        "flex items-stretch gap-4 rounded-lg border p-4 transition-colors",
        isMonitored
          ? "border-blue-500/30 bg-blue-500/5"
          : "border-border bg-card",
      )}
    >
      {/* Left: profile icon + name */}
      <div
        className={cn(
          "flex flex-col items-center gap-2 w-20 shrink-0 pt-1",
          !isMonitored && "opacity-50",
        )}
      >
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            isMonitored
              ? "bg-blue-500/15 text-blue-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <span
          className={cn(
            "text-xs font-medium text-center leading-tight",
            isMonitored ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {profile.name}
        </span>
      </div>

      {/* Middle: edition details or placeholder */}
      <div className="flex flex-1 items-center gap-4 min-w-0">
        {isMonitored ? (
          <EditionDetails edition={edition} fallbackIcon={Icon} />
        ) : (
          <p className="text-sm text-muted-foreground">No edition selected</p>
        )}
      </div>

      {/* Right: action buttons */}
      <div className="flex flex-col gap-2 shrink-0 justify-center">
        {isMonitored ? (
          <>
            <Button variant="outline" size="sm" onClick={onChooseEdition}>
              Change
            </Button>
            <Button variant="destructive" size="sm" onClick={onUnmonitor}>
              Unmonitor
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={onChooseEdition}>
            Choose Edition
          </Button>
        )}
      </div>
    </div>
  );
}
