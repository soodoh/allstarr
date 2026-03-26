import { Link } from "@tanstack/react-router";
import type { JSX } from "react";
import OptimizedImage from "src/components/shared/optimized-image";

type AuthorCardProps = {
  author: {
    id: number;
    name: string;
    bookCount: number;
    images: Array<{ url: string; coverType: string }>;
  };
};

export default function AuthorCard({ author }: AuthorCardProps): JSX.Element {
  const imageUrl =
    author.images?.find((img) => img.coverType === "poster")?.url ??
    author.images?.[0]?.url ??
    null;

  return (
    <Link
      to="/authors/$authorId"
      params={{ authorId: String(author.id) }}
      className="block group"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <OptimizedImage
          src={imageUrl}
          alt={`${author.name} photo`}
          type="author"
          width={224}
          height={298}
          className="aspect-[3/4] w-full max-w-56 transition-shadow group-hover:shadow-lg"
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
