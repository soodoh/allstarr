import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Users } from "lucide-react";

interface AuthorCardProps {
  author: {
    id: number;
    name: string;
    status: string;
    monitored: boolean;
    bookCount: number;
    overview?: string | null;
  };
}

export function AuthorCard({ author }: AuthorCardProps) {
  return (
    <Link
      to="/authors/$authorId"
      params={{ authorId: String(author.id) }}
      className="block"
    >
      <Card className="hover:bg-accent/50 transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base">{author.name}</CardTitle>
            <Badge variant={author.monitored ? "default" : "outline"}>
              {author.monitored ? "Monitored" : "Unmonitored"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {author.overview && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
              {author.overview}
            </p>
          )}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>
              {author.bookCount} {author.bookCount === 1 ? "book" : "books"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
