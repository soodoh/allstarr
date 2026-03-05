import { BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import type { JSX } from "react";
import { cn } from "src/lib/utils";

type BookCoverProps = {
  title: string;
  images: Array<{ url: string; coverType: string }>;
  className?: string;
};

export default function BookCover({
  title,
  images,
  className,
}: BookCoverProps): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);

  const imageUrl =
    images?.find((img) => img.coverType === "cover")?.url ?? images?.[0]?.url;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <div
      className={cn(
        "aspect-[2/3] w-full max-w-56 overflow-hidden rounded-xl border bg-muted shadow-sm",
        className,
      )}
    >
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt={`${title} cover`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <BookOpen className="h-8 w-8" />
          <span className="text-xs">No cover</span>
        </div>
      )}
    </div>
  );
}
