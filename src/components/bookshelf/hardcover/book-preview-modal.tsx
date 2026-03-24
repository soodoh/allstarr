import { useEffect, useMemo, useState } from "react";
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
import type {
  BookLanguage,
  HardcoverBookDetail,
  HardcoverSearchItem,
} from "src/server/search";
import {
  booksExistQuery,
  hardcoverBookLanguagesQuery,
  hardcoverSingleBookQuery,
  downloadProfilesListQuery,
} from "src/lib/queries";
import { useNavigate } from "@tanstack/react-router";
import BookDetailContent from "src/components/bookshelf/books/book-detail-content";
import { useImportHardcoverBook } from "src/hooks/mutations";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";

// ── Add-to-bookshelf inline form ──────────────────────────────────────────────

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
  const { data: allProfiles = [] } = useQuery(downloadProfilesListQuery());
  const downloadProfiles = useMemo(
    () =>
      allProfiles.filter(
        (p) => p.contentType === "ebook" || p.contentType === "audiobook",
      ),
    [allProfiles],
  );

  const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>([]);

  useEffect(() => {
    if (downloadProfiles.length > 0 && downloadProfileIds.length === 0) {
      setDownloadProfileIds(downloadProfiles.map((p) => p.id));
    }
  }, [downloadProfiles, downloadProfileIds.length]);

  const importBook = useImportHardcoverBook();

  const toggleProfile = (id: number) => {
    setDownloadProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleSubmit = () => {
    importBook.mutate({
      foreignBookId: Number(book.id),
      downloadProfileIds,
    });
    onSuccess();
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">Add Author & Monitor Book</p>
      <p className="text-xs text-muted-foreground">
        The author and all their books will be added to your bookshelf. This
        book will be monitored.
      </p>

      <ProfileCheckboxGroup
        profiles={downloadProfiles}
        selectedIds={downloadProfileIds}
        onToggle={toggleProfile}
      />

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

function getHardcoverOverrides(
  book: HardcoverSearchItem,
  hcBook: HardcoverBookDetail | undefined,
) {
  return {
    coverUrl: hcBook?.coverUrl ?? book.coverUrl ?? null,
    releaseDate:
      hcBook?.releaseDate ??
      (book.releaseYear ? String(book.releaseYear) : null),
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
  };
}

function buildBookDetailData(
  book: HardcoverSearchItem,
  hcBook: HardcoverBookDetail | undefined,
  languages: BookLanguage[] | undefined,
  primaryAuthor: string | null,
  bookAuthors: Array<{
    authorId: null;
    foreignAuthorId: string;
    authorName: string;
    isPrimary: boolean;
  }>,
) {
  return {
    title: book.title,
    images: [] as Array<{ url: string; coverType: string }>,
    author: null as { id: number; name: string } | null,
    authorName: primaryAuthor,
    bookAuthors,
    availableLanguages: languages ?? null,
    ...getHardcoverOverrides(book, hcBook),
  };
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

  // ── Check if book already on bookshelf ──
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
  const { primaryAuthor, bookAuthors } = useMemo(() => {
    const contributors = hcBook?.contributors ?? [];
    return {
      primaryAuthor:
        contributors.length > 0
          ? contributors[0].name
          : (book.subtitle ?? null),
      bookAuthors: contributors.map((c, i) => ({
        authorId: null,
        foreignAuthorId: String(c.id),
        authorName: c.name,
        isPrimary: i === 0,
      })),
    };
  }, [hcBook?.contributors, book.subtitle]);

  const bookDetailData = useMemo(
    () =>
      buildBookDetailData(book, hcBook, languages, primaryAuthor, bookAuthors),
    [book, hcBook, languages, primaryAuthor, bookAuthors],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
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
                      to: "/bookshelf/books/$bookId",
                      params: { bookId: String(localBook.id) },
                    });
                  }
                }}
              >
                View on Bookshelf
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
