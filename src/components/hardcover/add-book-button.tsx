import type React from "react";
import { useState } from "react";
import { BookMarked, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";
import type { HardcoverAuthorBook } from "~/server/search";
import {
  useImportHardcoverAuthor,
  useImportHardcoverBook,
} from "~/hooks/mutations";

export type AuthorContext = {
  name: string;
  foreignAuthorId: string;
  slug: string | undefined;
  imageUrl: string | undefined;
  bio: string | undefined;
  deathYear: number | undefined;
  qualityProfileId: number | undefined;
  rootFolderPath: string | undefined;
};

type BookMonitorToggleProps = {
  book: HardcoverAuthorBook;
  authorContext: AuthorContext;
  localAuthorId: number | undefined;
  inLibrary: boolean;
  onAdded: (foreignBookId: string) => void;
  onAuthorCreated: (id: number) => void;
};

export function BookMonitorToggle({
  book,
  authorContext,
  localAuthorId,
  inLibrary: initialInLibrary,
  onAdded,
  onAuthorCreated,
}: BookMonitorToggleProps): React.JSX.Element {
  const [inLibrary, setInLibrary] = useState(initialInLibrary);

  const importAuthor = useImportHardcoverAuthor();
  const importBook = useImportHardcoverBook();

  const loading = importAuthor.isPending || importBook.isPending;

  const handleClick = async () => {
    if (inLibrary || loading) {
      return;
    }

    try {
      let authorId = localAuthorId;
      if (authorId === undefined) {
        const result = await importAuthor.mutateAsync({
          name: authorContext.name,
          foreignAuthorId: authorContext.foreignAuthorId,
          slug: authorContext.slug,
          overview: authorContext.bio,
          status: authorContext.deathYear ? "deceased" : "continuing",
          qualityProfileId: authorContext.qualityProfileId,
          rootFolderPath: authorContext.rootFolderPath,
          images: authorContext.imageUrl
            ? [{ url: authorContext.imageUrl, coverType: "poster" }]
            : undefined,
          books: [],
        });
        authorId = result.authorId;
        onAuthorCreated(authorId);
      }

      await importBook.mutateAsync({
        authorId,
        title: book.title,
        foreignBookId: book.id,
        releaseDate: book.releaseDate ?? undefined,
        monitored: true,
        images: book.coverUrl
          ? [{ url: book.coverUrl, coverType: "cover" }]
          : undefined,
        ratings:
          book.rating === undefined
            ? undefined
            : { value: book.rating, votes: 0 },
        series: book.series.map((s) => ({
          foreignSeriesId: s.id,
          title: s.title,
          position: s.position,
        })),
      });

      setInLibrary(true);
      onAdded(book.id);
    } catch {
      // Errors are handled by the mutation hooks (toast notifications)
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
          : "bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary cursor-pointer",
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
type SeriesBookMonitorToggleProps = {
  bookId: string;
  title: string;
  coverUrl: string | undefined;
  releaseYear: number | undefined;
  rating: number | undefined;
  authorContext: AuthorContext;
  localAuthorId: number | undefined;
  inLibrary: boolean;
  onAdded: (foreignBookId: string) => void;
  onAuthorCreated: (id: number) => void;
};

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
}: SeriesBookMonitorToggleProps): React.JSX.Element {
  const [inLibrary, setInLibrary] = useState(initialInLibrary);

  const importAuthor = useImportHardcoverAuthor();
  const importBook = useImportHardcoverBook();

  const loading = importAuthor.isPending || importBook.isPending;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // don't collapse the series row
    if (inLibrary || loading) {
      return;
    }

    try {
      let authorId = localAuthorId;
      if (authorId === undefined) {
        const result = await importAuthor.mutateAsync({
          name: authorContext.name,
          foreignAuthorId: authorContext.foreignAuthorId,
          slug: authorContext.slug,
          overview: authorContext.bio,
          status: authorContext.deathYear ? "deceased" : "continuing",
          qualityProfileId: authorContext.qualityProfileId,
          rootFolderPath: authorContext.rootFolderPath,
          images: authorContext.imageUrl
            ? [{ url: authorContext.imageUrl, coverType: "poster" }]
            : undefined,
          books: [],
        });
        authorId = result.authorId;
        onAuthorCreated(authorId);
      }

      await importBook.mutateAsync({
        authorId,
        title,
        foreignBookId: bookId,
        releaseDate: releaseYear ? `${releaseYear}-01-01` : undefined,
        monitored: true,
        images: coverUrl ? [{ url: coverUrl, coverType: "cover" }] : undefined,
        ratings: rating === undefined ? undefined : { value: rating, votes: 0 },
        series: [],
      });

      setInLibrary(true);
      onAdded(bookId);
    } catch {
      // Errors are handled by the mutation hooks (toast notifications)
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
          : "bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary cursor-pointer",
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
