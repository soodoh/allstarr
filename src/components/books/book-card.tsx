import type { JSX } from "react";
import { useBookDetailModal } from "src/components/books/book-detail-modal-provider";
import BookCover from "src/components/books/book-cover";

type BookCardProps = {
  book: {
    id: number;
    title: string;
    authorName: string | undefined;
    releaseDate: string | undefined;
    overview?: string | undefined;
    images?: Array<{ url: string; coverType: string }> | undefined;
  };
};

export default function BookCard({ book }: BookCardProps): JSX.Element {
  const { openBookModal } = useBookDetailModal();

  return (
    <button
      type="button"
      className="block cursor-pointer w-full text-left group"
      onClick={() => openBookModal(book.id)}
    >
      <div className="flex flex-col gap-2">
        <BookCover
          title={book.title}
          images={book.images}
          className="w-full transition-shadow group-hover:shadow-lg"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight truncate">
            {book.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {book.authorName || "Unknown author"}
          </p>
          {book.releaseDate && (
            <p className="text-xs text-muted-foreground">{book.releaseDate}</p>
          )}
        </div>
      </div>
    </button>
  );
}
