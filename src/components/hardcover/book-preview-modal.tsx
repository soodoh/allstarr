import { useMemo, useState } from "react";
import type { JSX } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import type {
  HardcoverBookDetail,
  HardcoverSearchItem,
} from "src/server/search";
import {
  booksExistQuery,
  hardcoverBookLanguagesQuery,
  hardcoverSingleBookQuery,
  qualityProfilesListQuery,
  rootFoldersListQuery,
} from "src/lib/queries";
import { useNavigate } from "@tanstack/react-router";
import BookDetailContent from "src/components/books/book-detail-content";
import { useImportHardcoverBook } from "src/hooks/mutations";

// ── Add-to-library inline form ──────────────────────────────────────────────

type AddBookFormProps = {
  book: HardcoverSearchItem;
  bookDetail: HardcoverBookDetail | undefined;
  onSuccess: () => void;
  onCancel: () => void;
};

function AddBookForm({
  book,
  bookDetail: _bookDetail,
  onSuccess,
  onCancel,
}: AddBookFormProps) {
  const { data: qualityProfiles = [] } = useQuery(qualityProfilesListQuery());
  const { data: rootFolders = [] } = useQuery(rootFoldersListQuery());

  const [qualityProfileId, setQualityProfileId] = useState<string>(
    qualityProfiles[0] ? String(qualityProfiles[0].id) : "",
  );
  const [rootFolderPath, setRootFolderPath] = useState<string>(
    rootFolders[0]?.path ?? "",
  );

  const importBook = useImportHardcoverBook();

  const handleSubmit = () => {
    importBook.mutate({
      foreignBookId: Number(book.id),
      qualityProfileId: qualityProfileId
        ? Number.parseInt(qualityProfileId, 10)
        : null,
      rootFolderPath: rootFolderPath || null,
    });
    onSuccess();
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">Add Author & Monitor Book</p>
      <p className="text-xs text-muted-foreground">
        The author and all their books will be added to your library. This book
        will be monitored.
      </p>

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
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleSubmit}>
          Confirm
        </Button>
      </div>
    </div>
  );
}

// ── Main modal ──────────────────────────────────────────────────────────────

type BookPreviewModalProps = {
  book: HardcoverSearchItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function BookPreviewModal({
  book,
  open,
  onOpenChange,
}: BookPreviewModalProps): JSX.Element {
  const foreignBookIds = book.id ? [book.id] : [];

  // ── Check if book already in library ──
  const { data: existingBooks = [] } = useQuery({
    ...booksExistQuery(foreignBookIds),
    enabled: open && foreignBookIds.length > 0,
  });
  const localBook = existingBooks.length > 0 ? existingBooks[0] : undefined;

  const navigate = useNavigate();

  const [addOpen, setAddOpen] = useState(false);

  const inLibrary = Boolean(localBook);

  // ── Fetch book detail + languages from Hardcover ──
  const foreignBookId = book.id ? Number(book.id) : 0;

  const { data: hcBook } = useQuery({
    ...hardcoverSingleBookQuery(foreignBookId),
    enabled: open && foreignBookId > 0,
  });

  const { data: languages } = useQuery({
    ...hardcoverBookLanguagesQuery(foreignBookId),
    enabled: open && foreignBookId > 0,
  });

  // ── Build rich book detail from Hardcover data ──
  const { primaryAuthor, foreignAuthorIds } = useMemo(() => {
    const contributors = hcBook?.contributors ?? [];
    return {
      primaryAuthor:
        contributors.length > 0
          ? contributors[0].name
          : (book.subtitle ?? null),
      foreignAuthorIds:
        contributors.length > 1
          ? contributors
              .slice(1)
              .map((c) => ({ foreignAuthorId: c.id, name: c.name }))
          : null,
    };
  }, [hcBook?.contributors, book.subtitle]);

  const bookDetailData = useMemo(
    () => ({
      title: book.title,
      coverUrl: hcBook?.coverUrl ?? book.coverUrl ?? null,
      images: null as Array<{ url: string; coverType: string }> | null,
      author: null as { id: number; name: string } | null,
      authorName: primaryAuthor,
      foreignAuthorIds,
      resolvedAuthors: null,
      releaseDate:
        hcBook?.releaseDate ??
        (book.releaseYear ? String(book.releaseYear) : null),
      availableLanguages: languages ?? null,
      series:
        hcBook?.series.map((s) => ({
          title: s.title,
          position: s.position ?? null,
        })) ?? null,
      rating: hcBook?.rating ?? null,
      ratingVotes: hcBook?.ratingsCount ?? null,
      readers: hcBook?.usersCount ?? book.readers ?? null,
      overview: hcBook?.description ?? book.description ?? null,
      hardcoverUrl: book.hardcoverUrl ?? null,
    }),
    [book, hcBook, languages, primaryAuthor, foreignAuthorIds],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">{book.title}</DialogTitle>
        </DialogHeader>

        <BookDetailContent book={bookDetailData}>
          {/* ── Actions ── */}
          {!inLibrary && !addOpen && (
            <div className="flex items-center gap-2 pt-1">
              <Button className="flex-1" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Author & Monitor Book
              </Button>
              {book.hardcoverUrl && (
                <Button variant="outline" size="icon" asChild>
                  <a
                    href={book.hardcoverUrl}
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
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  onOpenChange(false);
                  if (localBook) {
                    navigate({
                      to: "/library/books/$bookId",
                      params: { bookId: String(localBook.id) },
                    });
                  }
                }}
              >
                View in Library
              </Button>
              {book.hardcoverUrl && (
                <Button variant="outline" size="icon" asChild>
                  <a
                    href={book.hardcoverUrl}
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

          {addOpen && !inLibrary && (
            <AddBookForm
              book={book}
              bookDetail={hcBook}
              onSuccess={() => onOpenChange(false)}
              onCancel={() => setAddOpen(false)}
            />
          )}
        </BookDetailContent>
      </DialogContent>
    </Dialog>
  );
}
