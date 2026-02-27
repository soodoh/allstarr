import { useMemo, useState } from "react";
import type { JSX } from "react";
import { ExternalLink, Loader2, Plus } from "lucide-react";
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
import Switch from "src/components/ui/switch";
import type {
  HardcoverAuthorDetail,
  HardcoverBookDetail,
  HardcoverSearchItem,
} from "src/server/search";
import { searchHardcoverFn } from "src/server/search";
import {
  booksExistQuery,
  hardcoverAuthorQuery,
  hardcoverBookLanguagesQuery,
  hardcoverSingleBookQuery,
  authorExistsQuery,
  qualityProfilesListQuery,
  rootFoldersListQuery,
} from "src/lib/queries";
import BookDetailContent from "src/components/books/book-detail-content";
import { useBookDetailModal } from "src/components/books/book-detail-modal-provider";
import {
  useImportHardcoverAuthor,
  useImportHardcoverBook,
} from "src/hooks/mutations";

const AUTHOR_FETCH_PARAMS = {
  page: 1,
  pageSize: 1,
  language: "en",
  sortBy: "year" as const,
  sortDir: "desc" as const,
};

// ── Add-to-library inline form ──────────────────────────────────────────────

type AddBookFormProps = {
  book: HardcoverSearchItem;
  bookDetail: HardcoverBookDetail | undefined;
  fullAuthor: HardcoverAuthorDetail;
  existingAuthorId: number | undefined;
  onSuccess: () => void;
  onCancel: () => void;
};

function AddBookForm({
  book,
  bookDetail,
  fullAuthor,
  existingAuthorId,
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
  const [monitored, setMonitored] = useState(true);

  const importAuthor = useImportHardcoverAuthor();
  const importBook = useImportHardcoverBook();

  const loading = importAuthor.isPending || importBook.isPending;

  // oxlint-disable-next-line complexity -- Import flow with author creation, book data assembly, and error handling
  const handleSubmit = async () => {
    try {
      let authorId = existingAuthorId;

      if (authorId === undefined) {
        const result = await importAuthor.mutateAsync({
          name: fullAuthor.name,
          foreignAuthorId: fullAuthor.id,
          overview: fullAuthor.bio ?? undefined,
          status: fullAuthor.deathYear ? "deceased" : "continuing",
          qualityProfileId: qualityProfileId
            ? Number.parseInt(qualityProfileId, 10)
            : undefined,
          rootFolderPath: rootFolderPath || undefined,
          images: fullAuthor.imageUrl
            ? [{ url: fullAuthor.imageUrl, coverType: "poster" }]
            : undefined,
          books: [],
        });
        authorId = result.authorId;
      }

      const releaseDate =
        bookDetail?.releaseDate ??
        (book.releaseYear ? `${book.releaseYear}-01-01` : undefined);

      const rating = bookDetail?.rating;
      const readers = bookDetail?.usersCount ?? book.readers ?? undefined;
      const overview =
        bookDetail?.description ?? book.description ?? undefined;
      const coverUrl = bookDetail?.coverUrl ?? book.coverUrl;

      await importBook.mutateAsync({
        authorId,
        title: book.title,
        foreignBookId: book.id,
        releaseDate,
        overview,
        monitored,
        images: coverUrl
          ? [{ url: coverUrl, coverType: "cover" }]
          : undefined,
        ratings:
          rating === undefined
            ? undefined
            : { value: rating, votes: bookDetail?.ratingsCount ?? 0 },
        readers,
        series: (bookDetail?.series ?? []).map((s) => ({
          foreignSeriesId: s.id,
          title: s.title,
          position: s.position,
        })),
      });

      onSuccess();
    } catch {
      // Errors handled by mutation hooks (toast notifications)
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">Add to Library</p>

      {!existingAuthorId && (
        <>
          <div className="space-y-1.5">
            <Label>Quality Profile</Label>
            <Select
              value={qualityProfileId}
              onValueChange={setQualityProfileId}
            >
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
        </>
      )}

      <div className="flex items-center gap-2">
        <Switch
          id="preview-book-monitored"
          checked={monitored}
          onCheckedChange={setMonitored}
        />
        <Label htmlFor="preview-book-monitored">Monitored</Label>
      </div>

      {!existingAuthorId && (
        <p className="text-xs text-muted-foreground">
          Author &ldquo;{fullAuthor.name}&rdquo; will also be added to your
          library.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding…
            </>
          ) : (
            "Confirm"
          )}
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

// oxlint-disable-next-line complexity -- Modal manages loading, library-status, author-resolution, and add-form states together
export default function BookPreviewModal({
  book,
  open,
  onOpenChange,
}: BookPreviewModalProps): JSX.Element {
  const foreignBookIds = book.id ? [book.id] : [];
  const authorName = book.subtitle;

  // ── Check if book already in library ──
  const { data: existingBooks = [] } = useQuery({
    ...booksExistQuery(foreignBookIds),
    enabled: open && foreignBookIds.length > 0,
  });
  const localBook = existingBooks.length > 0 ? existingBooks[0] : undefined;

  // ── Resolve author from Hardcover (only when book is not in library) ──
  const { data: authorSearch, isLoading: authorSearching } = useQuery({
    queryKey: ["hardcover", "author-for-book", authorName],
    queryFn: () =>
      searchHardcoverFn({
        data: { query: authorName ?? "", type: "authors" as const, limit: 1 },
      }),
    enabled: open && !localBook && Boolean(authorName),
  });
  const resolvedAuthorId = authorSearch?.results[0]?.id ? Number(authorSearch.results[0].id) : 0;

  const { data: fullAuthor, isLoading: authorDetailLoading } = useQuery({
    ...hardcoverAuthorQuery(resolvedAuthorId, AUTHOR_FETCH_PARAMS),
    enabled: open && resolvedAuthorId > 0,
  });

  // ── Check if this author already exists locally ──
  const { data: existingAuthor } = useQuery({
    ...authorExistsQuery(fullAuthor?.id ?? ""),
    enabled: open && Boolean(fullAuthor?.id),
  });

  const { openBookModal } = useBookDetailModal();

  const [addOpen, setAddOpen] = useState(false);
  const [added, setAdded] = useState(false);

  const inLibrary = Boolean(localBook) || added;
  const authorLoading = authorSearching || authorDetailLoading;

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
  const bookDetailData = useMemo(
    () => ({
      title: book.title,
      coverUrl: hcBook?.coverUrl ?? book.coverUrl,
      authorName: book.subtitle,
      releaseDate:
        hcBook?.releaseDate ??
        (book.releaseYear ? String(book.releaseYear) : undefined),
      availableLanguages: languages,
      series: hcBook?.series.map((s) => ({
        title: s.title,
        position: s.position,
      })),
      rating: hcBook?.rating,
      ratingVotes: hcBook?.ratingsCount,
      readers: hcBook?.usersCount ?? book.readers,
      overview: hcBook?.description ?? book.description,
      hardcoverUrl: book.hardcoverUrl,
    }),
    [book, hcBook, languages],
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
              <Button
                className="flex-1"
                onClick={() => setAddOpen(true)}
                disabled={authorLoading || !fullAuthor}
              >
                <Plus className="mr-2 h-4 w-4" />
                {authorLoading ? "Loading…" : "Add to Library"}
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
                  if (localBook) {
                    openBookModal(localBook.id);
                  }
                  onOpenChange(false);
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

          {addOpen && !inLibrary && fullAuthor && (
            <AddBookForm
              book={book}
              bookDetail={hcBook}
              fullAuthor={fullAuthor}
              existingAuthorId={existingAuthor?.id}
              onSuccess={() => {
                setAdded(true);
                setAddOpen(false);
              }}
              onCancel={() => setAddOpen(false)}
            />
          )}
        </BookDetailContent>
      </DialogContent>
    </Dialog>
  );
}
