import { Link } from "@tanstack/react-router";
import AuthorPhoto from "~/components/authors/author-photo";

type AuthorCardProps = {
  author: {
    id: number;
    name: string;
    slug?: string | undefined;
    bookCount: number;
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
      className="block group"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <AuthorPhoto
          name={author.name}
          imageUrl={imageUrl}
          className="w-full transition-shadow group-hover:shadow-lg"
        />
        <p className="text-sm font-medium leading-tight truncate w-full">
          {author.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {author.bookCount} {author.bookCount === 1 ? "book" : "books"}
        </p>
      </div>
    </Link>
  );
}
