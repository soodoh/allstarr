import { useMemo } from "react";
import type { JSX, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import BookCover from "src/components/books/book-cover";

type AuthorLink = {
  id: number;
  slug: string | undefined;
  name: string;
};

export type BookLanguageEntry = {
  name: string;
  code: string;
  readers: number;
};

export type BookDetailData = {
  title: string;
  coverUrl?: string | undefined;
  images?: Array<{ url: string; coverType: string }> | undefined;
  author?: AuthorLink | undefined;
  authorName?: string | undefined;
  releaseDate?: string | undefined;
  availableLanguages?: BookLanguageEntry[] | undefined;
  series?: Array<{ title: string; position?: string | undefined }> | undefined;
  rating?: number | undefined;
  ratingVotes?: number | undefined;
  readers?: number | undefined;
  isbn?: string | undefined;
  asin?: string | undefined;
  overview?: string | undefined;
  hardcoverUrl?: string | undefined;
};

type BookDetailContentProps = {
  book: BookDetailData;
  onCloseModal?: () => void;
  children?: ReactNode;
};

// oxlint-disable-next-line complexity -- Rendering many optional book detail fields in a single layout
export default function BookDetailContent({
  book,
  onCloseModal,
  children,
}: BookDetailContentProps): JSX.Element {
  const coverImages = useMemo(
    () =>
      book.images ??
      (book.coverUrl ? [{ url: book.coverUrl, coverType: "cover" }] : undefined),
    [book.images, book.coverUrl],
  );

  const displayAuthor = book.author?.name ?? book.authorName;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[auto_1fr] gap-6">
        <BookCover
          title={book.title}
          images={coverImages}
          className="w-40"
        />
        <div className="flex flex-col justify-end space-y-3 text-sm">
          {displayAuthor && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Author: </span>
              {book.author && onCloseModal ? (
                <Link
                  to="/library/authors/$authorSlug"
                  params={{
                    authorSlug:
                      book.author.slug || String(book.author.id),
                  }}
                  className="hover:underline"
                  onClick={onCloseModal}
                >
                  {displayAuthor}
                </Link>
              ) : (
                <span>{displayAuthor}</span>
              )}
            </div>
          )}
          {book.releaseDate && (
            <div>
              <span className="text-muted-foreground">Release Date: </span>
              {book.releaseDate}
            </div>
          )}
          {book.series && book.series.length > 0 && (
            <div>
              <span className="text-muted-foreground">Series: </span>
              {book.series
                .map((s) =>
                  s.position ? `${s.title} #${s.position}` : s.title,
                )
                .join(", ")}
            </div>
          )}
          {book.rating !== undefined && (
            <div>
              <span className="text-muted-foreground">Rating: </span>
              {book.rating.toFixed(1)}/5
              {book.ratingVotes !== undefined && book.ratingVotes > 0 && (
                <span className="text-muted-foreground ml-1">
                  ({book.ratingVotes.toLocaleString()}{" "}
                  {book.ratingVotes === 1 ? "vote" : "votes"})
                </span>
              )}
            </div>
          )}
          {book.readers !== undefined && book.readers > 0 && (
            <div>
              <span className="text-muted-foreground">Readers: </span>
              {book.readers.toLocaleString()}
            </div>
          )}
          {book.availableLanguages && book.availableLanguages.length > 0 && (
            <div>
              <span className="text-muted-foreground">Available Languages: </span>
              {book.availableLanguages.map((l) => l.name).join(", ")}
            </div>
          )}
          {book.isbn && (
            <div>
              <span className="text-muted-foreground">ISBN: </span>
              <span className="font-mono text-xs">{book.isbn}</span>
            </div>
          )}
          {book.asin && (
            <div>
              <span className="text-muted-foreground">ASIN: </span>
              <span className="font-mono text-xs">{book.asin}</span>
            </div>
          )}
          {book.hardcoverUrl && (
            <div>
              <a
                href={book.hardcoverUrl}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                View on Hardcover
              </a>
            </div>
          )}
        </div>
      </div>
      {book.overview && (
        <div className="text-sm">
          <h4 className="text-muted-foreground font-medium mb-1">
            Description
          </h4>
          <p className="leading-relaxed">{book.overview}</p>
        </div>
      )}
      {children}
    </div>
  );
}
