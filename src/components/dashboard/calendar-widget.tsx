import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { CalendarDays } from "lucide-react";

interface UpcomingBook {
  id: number;
  title: string;
  authorName: string | null;
  releaseDate: string | null;
}

interface CalendarWidgetProps {
  upcomingBooks: UpcomingBook[];
}

export function CalendarWidget({ upcomingBooks }: CalendarWidgetProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Upcoming Releases</CardTitle>
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {upcomingBooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming releases.
          </p>
        ) : (
          <div className="space-y-3">
            {upcomingBooks.map((book) => (
              <div
                key={book.id}
                className="flex items-center justify-between text-sm"
              >
                <div>
                  <Link
                    to="/books/$bookId"
                    params={{ bookId: String(book.id) }}
                    className="font-medium hover:underline"
                  >
                    {book.title}
                  </Link>
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
