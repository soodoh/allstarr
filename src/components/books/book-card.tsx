import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { BookOpen } from "lucide-react";

interface BookCardProps {
  book: {
    id: number;
    title: string;
    authorName: string | null;
    releaseDate: string | null;
    monitored: boolean;
    overview?: string | null;
  };
}

export function BookCard({ book }: BookCardProps) {
  return (
    <Link
      to="/books/$bookId"
      params={{ bookId: String(book.id) }}
      className="block"
    >
      <Card className="hover:bg-accent/50 transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base">{book.title}</CardTitle>
            <Badge variant={book.monitored ? "default" : "outline"}>
              {book.monitored ? "Monitored" : "Unmonitored"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            <BookOpen className="h-3 w-3" />
            <span>{book.authorName || "Unknown author"}</span>
          </div>
          {book.releaseDate && (
            <p className="text-xs text-muted-foreground">
              {book.releaseDate}
            </p>
          )}
          {book.overview && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
              {book.overview}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
