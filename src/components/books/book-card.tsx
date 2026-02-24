import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { BookOpen } from "lucide-react";
import { useBookDetailModal } from "~/components/books/book-detail-modal-provider";
import BookCover from "~/components/books/book-cover";

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

export default function BookCard({ book }: BookCardProps): React.JSX.Element {
  const { openBookModal } = useBookDetailModal();

  return (
    <button
      type="button"
      className="block cursor-pointer w-full text-left"
      onClick={() => openBookModal(book.id)}
    >
      <Card className="hover:bg-accent/50 transition-colors overflow-hidden">
        <div className="flex">
          <div className="w-20 shrink-0">
            <BookCover
              title={book.title}
              images={book.images ?? undefined}
              className="h-full w-full max-w-none rounded-none border-0 shadow-none"
            />
          </div>
          <div className="flex-1 min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base truncate">{book.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                <BookOpen className="h-3 w-3" />
                <span>{book.authorName || "Unknown author"}</span>
              </div>
              {book.releaseDate && (
                <p className="text-xs text-muted-foreground">{book.releaseDate}</p>
              )}
              {book.overview && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                  {book.overview}
                </p>
              )}
            </CardContent>
          </div>
        </div>
      </Card>
    </button>
  );
}
