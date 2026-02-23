import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

type RecentBook = {
  id: number;
  title: string;
  authorName: string | undefined;
  releaseDate: string | undefined;
  createdAt: Date;
}

type RecentActivityProps = {
  recentBooks: RecentBook[];
}

export default function RecentActivity({ recentBooks }: RecentActivityProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Additions</CardTitle>
      </CardHeader>
      <CardContent>
        {recentBooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recent additions.
          </p>
        ) : (
          <div className="space-y-3">
            {recentBooks.map((book) => (
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
                  {new Date(book.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
