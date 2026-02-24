import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Users } from "lucide-react";
import AuthorPhoto from "~/components/authors/author-photo";

type AuthorCardProps = {
  author: {
    id: number;
    name: string;
    slug?: string | undefined;
    status: string;
    bookCount: number;
    overview?: string | undefined;
    images?: Array<{ url: string; coverType: string }> | undefined;
  };
};

export default function AuthorCard({
  author,
}: AuthorCardProps): React.JSX.Element {
  const imageUrl =
    author.images?.find((img) => img.coverType === "poster")?.url ??
    author.images?.[0]?.url;

  return (
    <Link
      to="/authors/$authorSlug"
      params={{ authorSlug: author.slug || String(author.id) }}
      className="block"
    >
      <Card className="hover:bg-accent/50 transition-colors overflow-hidden">
        <div className="flex">
          <div className="w-20 shrink-0">
            <AuthorPhoto
              name={author.name}
              imageUrl={imageUrl}
              className="h-full w-full max-w-none rounded-none border-0 shadow-none"
            />
          </div>
          <div className="flex-1 min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base truncate">{author.name}</CardTitle>
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
          </div>
        </div>
      </Card>
    </Link>
  );
}
