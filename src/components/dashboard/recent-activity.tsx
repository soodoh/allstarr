import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { useBookDetailModal } from "src/components/books/book-detail-modal-provider";

type RecentBook = {
  id: number;
  title: string;
  authorName: string | undefined;
  releaseDate: string | undefined;
  createdAt: Date;
};

type RecentActivityProps = {
  recentBooks: RecentBook[];
};

export default function RecentActivity({
  recentBooks,
}: RecentActivityProps): React.JSX.Element {
  const { openBookModal } = useBookDetailModal();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Additions</CardTitle>
      </CardHeader>
      <CardContent>
        {recentBooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent additions.</p>
        ) : (
          <div className="space-y-3">
            {recentBooks.map((book) => (
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
