import type { JSX } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { CalendarDays } from "lucide-react";
import { useBookDetailModal } from "src/components/books/book-detail-modal-provider";

type UpcomingBook = {
  id: number;
  title: string;
  authorName: string | undefined;
  releaseDate: string | undefined;
};

type CalendarWidgetProps = {
  upcomingBooks: UpcomingBook[];
};

export default function CalendarWidget({
  upcomingBooks,
}: CalendarWidgetProps): JSX.Element {
  const { openBookModal } = useBookDetailModal();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Upcoming Releases</CardTitle>
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {upcomingBooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming releases.</p>
        ) : (
          <div className="space-y-3">
            {upcomingBooks.map((book) => (
              <div
                key={book.id}
                className="flex items-center justify-between text-sm"
              >
                <div>
                  <button
                    type="button"
                    onClick={() => openBookModal(book.id)}
                    className="font-medium hover:underline text-left"
                  >
                    {book.title}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {book.authorName || "Unknown author"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {book.releaseDate}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
