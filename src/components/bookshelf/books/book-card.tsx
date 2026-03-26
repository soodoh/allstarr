import type { JSX } from "react";
import { useNavigate } from "@tanstack/react-router";
import OptimizedImage from "src/components/shared/optimized-image";
import { getCoverUrl } from "src/lib/utils";
import type { BookAuthorEntry } from "src/components/bookshelf/books/additional-authors";

type BookCardProps = {
  book: {
    id: number;
    title: string;
    editionId: number;
    editionTitle: string;
    editionImages: Array<{ url: string; coverType: string }>;
    bookAuthors: BookAuthorEntry[];
    releaseDate: string | null;
    description: string | null;
    images: Array<{ url: string; coverType: string }>;
  };
};

export default function BookCard({ book }: BookCardProps): JSX.Element {
  const navigate = useNavigate();

  // Sort: primary first, then by name
  const sortedAuthors = [...book.bookAuthors].toSorted((a, b) => {
    if (a.isPrimary !== b.isPrimary) {
      return a.isPrimary ? -1 : 1;
    }
    return a.authorName.localeCompare(b.authorName);
  });

  return (
    <button
      type="button"
      className="block cursor-pointer w-full text-left group"
      onClick={() =>
        navigate({
          to: "/books/$bookId",
          params: { bookId: String(book.id) },
        })
      }
    >
      <div className="flex flex-col gap-2">
        <OptimizedImage
          src={getCoverUrl(book.editionImages ?? book.images)}
          alt={`${book.editionTitle} cover`}
          type="book"
          width={224}
          height={336}
          className="aspect-[2/3] w-full max-w-56 transition-shadow group-hover:shadow-lg"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight truncate">
            {book.editionTitle}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {(() => {
              if (sortedAuthors.length === 0) {
                return "Unknown author";
              }
              if (sortedAuthors.length <= 3) {
                return sortedAuthors.map((a) => a.authorName).join(", ");
              }
              return `${sortedAuthors
                .slice(0, 3)
                .map((a) => a.authorName)
                .join(", ")}, and ${sortedAuthors.length - 3} more`;
            })()}
          </p>
          {book.releaseDate && (
            <p className="text-xs text-muted-foreground">{book.releaseDate}</p>
          )}
        </div>
      </div>
    </button>
  );
}
