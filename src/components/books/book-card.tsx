import type { JSX } from "react";
import { useNavigate } from "@tanstack/react-router";
import BookCover from "src/components/books/book-cover";

type BookCardProps = {
  book: {
    id: number;
    title: string;
    authorName?: string;
    releaseDate?: string;
    description?: string;
    images?: Array<{ url: string; coverType: string }>;
  };
};

export default function BookCard({ book }: BookCardProps): JSX.Element {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="block cursor-pointer w-full text-left group"
      onClick={() => navigate({ to: "/library/books/$bookId", params: { bookId: String(book.id) } })}
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
