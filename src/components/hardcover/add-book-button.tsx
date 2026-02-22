import { useState } from "react";
import { BookMarked, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import { importHardcoverAuthorFn, importHardcoverBookFn } from "~/server/import";
import type { HardcoverAuthorBook } from "~/server/search";

export interface AuthorContext {
  name: string;
  foreignAuthorId: string;
  imageUrl: string | null;
  bio: string | null;
  deathYear: number | null;
  qualityProfileId: number | null;
  rootFolderPath: string | null;
}

// Ensures the author exists in the local library, creating it if needed.
// Returns the local author id.
async function ensureAuthor(
  authorContext: AuthorContext,
  localAuthorId: number | null,
  onAuthorCreated: (id: number) => void
): Promise<number> {
  if (localAuthorId !== null) return localAuthorId;

  const result = await importHardcoverAuthorFn({
    data: {
      name: authorContext.name,
      foreignAuthorId: authorContext.foreignAuthorId,
      overview: authorContext.bio ?? null,
      status: authorContext.deathYear ? "deceased" : "continuing",
      monitored: true,
      qualityProfileId: authorContext.qualityProfileId,
      rootFolderPath: authorContext.rootFolderPath,
      images: authorContext.imageUrl
        ? [{ url: authorContext.imageUrl, coverType: "poster" }]
        : undefined,
      books: [],
    },
  });

  onAuthorCreated(result.authorId);
  return result.authorId;
}

interface BookMonitorToggleProps {
  book: HardcoverAuthorBook;
  authorContext: AuthorContext;
  localAuthorId: number | null;
  inLibrary: boolean;
  onAdded: (foreignBookId: string) => void;
  onAuthorCreated: (id: number) => void;
}

export function BookMonitorToggle({
  book,
  authorContext,
  localAuthorId,
  inLibrary: initialInLibrary,
  onAdded,
  onAuthorCreated,
}: BookMonitorToggleProps) {
  const [inLibrary, setInLibrary] = useState(initialInLibrary);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (inLibrary || loading) return;
    setLoading(true);
    try {
      const authorId = await ensureAuthor(authorContext, localAuthorId, onAuthorCreated);

      await importHardcoverBookFn({
        data: {
          authorId,
          title: book.title,
          foreignBookId: book.id,
          releaseDate: book.releaseDate ?? null,
          monitored: true,
          images: book.coverUrl
            ? [{ url: book.coverUrl, coverType: "cover" }]
            : undefined,
          ratings:
            book.rating != null ? { value: book.rating, votes: 0 } : null,
          series: book.series.map((s) => ({
            foreignSeriesId: s.id,
            title: s.title,
            position: s.position,
          })),
        },
      });

      setInLibrary(true);
      onAdded(book.id);
      toast.success(`"${book.title}" added to library.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add book."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-label={inLibrary ? "In library" : `Add "${book.title}" to library`}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
        inLibrary
          ? "bg-primary/15 text-primary cursor-default"
          : "bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary cursor-pointer"
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <BookMarked className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// Variant for series book rows — takes simpler book data shape
interface SeriesBookMonitorToggleProps {
  bookId: string;
  title: string;
  coverUrl: string | null;
  releaseYear: number | null;
  rating: number | null;
  authorContext: AuthorContext;
  localAuthorId: number | null;
  inLibrary: boolean;
  onAdded: (foreignBookId: string) => void;
  onAuthorCreated: (id: number) => void;
}

export function SeriesBookMonitorToggle({
  bookId,
  title,
  coverUrl,
  releaseYear,
  rating,
  authorContext,
  localAuthorId,
  inLibrary: initialInLibrary,
  onAdded,
  onAuthorCreated,
}: SeriesBookMonitorToggleProps) {
  const [inLibrary, setInLibrary] = useState(initialInLibrary);
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // don't collapse the series row
    if (inLibrary || loading) return;
    setLoading(true);
    try {
      const authorId = await ensureAuthor(authorContext, localAuthorId, onAuthorCreated);

      await importHardcoverBookFn({
        data: {
          authorId,
          title,
          foreignBookId: bookId,
          releaseDate: releaseYear ? `${releaseYear}-01-01` : null,
          monitored: true,
          images: coverUrl
            ? [{ url: coverUrl, coverType: "cover" }]
            : undefined,
          ratings: rating != null ? { value: rating, votes: 0 } : null,
          series: [],
        },
      });

      setInLibrary(true);
      onAdded(bookId);
      toast.success(`"${title}" added to library.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add book."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-label={inLibrary ? "In library" : `Add "${title}" to library`}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
        inLibrary
          ? "bg-primary/15 text-primary cursor-default"
          : "bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary cursor-pointer"
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <BookMarked className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
