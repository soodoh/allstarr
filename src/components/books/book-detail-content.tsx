import { useMemo } from "react";
import type { JSX, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import BookCover from "src/components/books/book-cover";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "src/components/ui/popover";

type AuthorLink = {
  id: number;
  name: string;
};

export type BookLanguageEntry = {
  name: string;
  code: string;
};

export type BookDetailData = {
  title: string;
  coverUrl: string | null;
  images: Array<{ url: string; coverType: string }> | null;
  author: AuthorLink | null;
  authorName: string | null;
  additionalAuthors: string[] | null;
  releaseDate: string | null;
  availableLanguages: BookLanguageEntry[] | null;
  series: Array<{ title: string; position: string | null }> | null;
  rating: number | null;
  ratingVotes: number | null;
  readers: number | null;
  overview: string | null;
  hardcoverUrl: string | null;
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
      (book.coverUrl ? [{ url: book.coverUrl, coverType: "cover" }] : null),
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
        <div className="flex flex-col justify-end space-y-3 text-sm min-w-0">
          {displayAuthor && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground shrink-0">Author: </span>
              <span>
                {book.author && onCloseModal ? (
                  <Link
                    to="/library/authors/$authorId"
                    params={{
                      authorId: String(book.author.id),
                    }}
                    className="hover:underline"
                    onClick={onCloseModal}
                  >
                    {displayAuthor}
                  </Link>
                ) : (
                  displayAuthor
                )}
                {book.additionalAuthors && book.additionalAuthors.length > 0 && (
                  <>, {book.additionalAuthors.join(", ")}</>
                )}
              </span>
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
          {book.rating !== null && (
            <div>
              <span className="text-muted-foreground">Rating: </span>
              {book.rating.toFixed(1)}/5
              {book.ratingVotes !== null && book.ratingVotes > 0 && (
                <span className="text-muted-foreground ml-1">
                  ({book.ratingVotes.toLocaleString()}{" "}
                  {book.ratingVotes === 1 ? "vote" : "votes"})
                </span>
              )}
            </div>
          )}
          {book.readers !== null && book.readers > 0 && (
            <div>
              <span className="text-muted-foreground">Readers: </span>
              {book.readers.toLocaleString()}
            </div>
          )}
          {book.availableLanguages && book.availableLanguages.length > 0 && (
            <div>
              <span className="text-muted-foreground">Languages: </span>
              <Popover>
                <PopoverTrigger className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                  {book.availableLanguages.length === 1
                    ? book.availableLanguages[0].name
                    : `${book.availableLanguages[0].name} and ${book.availableLanguages.length - 1} other${book.availableLanguages.length - 1 === 1 ? "" : "s"}`}
                  {book.availableLanguages.length > 1 && (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </PopoverTrigger>
                {book.availableLanguages.length > 1 && (
                  <PopoverContent align="start" className="w-48 p-0">
                    <ul className="max-h-64 overflow-y-auto py-1">
                      {book.availableLanguages.map((l) => (
                        <li
                          key={l.code}
                          className="px-3 py-1.5 text-sm"
                        >
                          {l.name}
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                )}
              </Popover>
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
