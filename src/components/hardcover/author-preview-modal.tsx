import { useState } from "react";
import type { JSX } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import AuthorPhoto from "src/components/authors/author-photo";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import Skeleton from "src/components/ui/skeleton";
import type {
  HardcoverAuthorDetail,
  HardcoverSearchItem,
} from "src/server/search";
import {
  hardcoverAuthorQuery,
  qualityProfilesListQuery,
  rootFoldersListQuery,
  authorExistsQuery,
} from "src/lib/queries";
import { useImportHardcoverAuthor } from "src/hooks/mutations";

const DEFAULT_PARAMS = {
  page: 1,
  pageSize: 1,
  language: "en",
  sortBy: "year" as const,
  sortDir: "desc" as const,
};

// ── Add-to-library inline form ────────────────────────────────────────────────

type AddFormProps = {
  fullAuthor: HardcoverAuthorDetail;
  onSuccess: () => void;
  onCancel: () => void;
};

function AddForm({ fullAuthor, onSuccess, onCancel }: AddFormProps) {
  const { data: qualityProfiles = [] } = useQuery(qualityProfilesListQuery());
  const { data: rootFolders = [] } = useQuery(rootFoldersListQuery());

  const [qualityProfileId, setQualityProfileId] = useState<string>(
    qualityProfiles[0] ? String(qualityProfiles[0].id) : "",
  );
  const [rootFolderPath, setRootFolderPath] = useState<string>(
    rootFolders[0]?.path ?? "",
  );
  const importAuthor = useImportHardcoverAuthor();

  const handleSubmit = () => {
    importAuthor.mutate({
      foreignAuthorId: Number(fullAuthor.id),
      qualityProfileId: qualityProfileId
        ? Number.parseInt(qualityProfileId, 10)
        : null,
      rootFolderPath: rootFolderPath || null,
    });
    onSuccess();
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">Add to Library</p>

      <div className="space-y-1.5">
        <Label>Quality Profile</Label>
        <Select value={qualityProfileId} onValueChange={setQualityProfileId}>
          <SelectTrigger>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            {qualityProfiles.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Root Folder</Label>
        <Select value={rootFolderPath} onValueChange={setRootFolderPath}>
          <SelectTrigger>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            {rootFolders.map((f) => (
              <SelectItem key={f.id} value={f.path}>
                {f.path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={handleSubmit}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}

// ── Bio section ───────────────────────────────────────────────────────────────

function BioSection({
  loading,
  bio,
}: {
  loading: boolean;
  bio: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-1.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    );
  }
  if (!bio) {
    return null;
  }
  return (
    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-5">
      {bio}
    </p>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

type AuthorPreviewModalProps = {
  author: HardcoverSearchItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// oxlint-disable-next-line complexity -- Modal manages loading, library-status, and add-form states together
export default function AuthorPreviewModal({
  author,
  open,
  onOpenChange,
}: AuthorPreviewModalProps): JSX.Element {
  const authorId = author.id ? Number(author.id) : 0;

  const { data: fullAuthor, isLoading: authorLoading } = useQuery({
    ...hardcoverAuthorQuery(authorId, DEFAULT_PARAMS),
    enabled: open && authorId > 0,
  });

  const { data: existingAuthor } = useQuery({
    ...authorExistsQuery(fullAuthor?.id ?? author.id),
    enabled: open && Boolean(fullAuthor?.id ?? author.id),
  });

  const [addOpen, setAddOpen] = useState(false);

  const inLibrary = Boolean(existingAuthor);

  const lifespan =
    fullAuthor?.bornYear || fullAuthor?.deathYear
      ? `${fullAuthor.bornYear ?? "?"}–${fullAuthor.deathYear ?? "Present"}`
      : null;

  const displayName = fullAuthor?.name ?? author.title;
  const displayImage = fullAuthor?.imageUrl ?? author.coverUrl ?? null;
  const displayBio = fullAuthor?.bio ?? author.description ?? null;
  const displayBooksCount = fullAuthor?.booksCount;
  const hardcoverUrl = fullAuthor?.hardcoverUrl ?? author.hardcoverUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">{displayName}</DialogTitle>
        </DialogHeader>

        {/* ── Author identity ── */}
        <div className="flex gap-4">
          <div className="shrink-0">
            {authorLoading ? (
              <Skeleton className="h-20 w-20 rounded-full" />
            ) : (
              <AuthorPhoto
                name={displayName}
                imageUrl={displayImage}
                className="h-20 w-20 rounded-full"
              />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1 pt-1">
            {authorLoading ? (
              <>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold leading-tight">
                  {displayName}
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                  {lifespan && <span>{lifespan}</span>}
                  {displayBooksCount !== null && displayBooksCount !== undefined && (
                    <span>
                      {displayBooksCount}{" "}
                      {displayBooksCount === 1 ? "book" : "books"}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Bio ── */}
        <BioSection loading={authorLoading} bio={displayBio} />

        {/* ── Actions ── */}
        {!inLibrary && !addOpen && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              className="flex-1"
              onClick={() => setAddOpen(true)}
              disabled={authorLoading || !fullAuthor}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add to Library
            </Button>
            {hardcoverUrl && (
              <Button variant="outline" size="icon" asChild>
                <a
                  href={hardcoverUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open on Hardcover"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        )}

        {inLibrary && (
          <div className="flex items-center gap-2 pt-1">
            <Button variant="secondary" className="flex-1" asChild>
              <Link
                to="/library/authors/$authorId"
                params={{ authorId: String(existingAuthor?.id ?? "") }}
                onClick={() => onOpenChange(false)}
              >
                View in library
              </Link>
            </Button>
            {hardcoverUrl && (
              <Button variant="outline" size="icon" asChild>
                <a
                  href={hardcoverUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open on Hardcover"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        )}

        {addOpen && !inLibrary && fullAuthor && (
          <AddForm
            fullAuthor={fullAuthor}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => setAddOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
