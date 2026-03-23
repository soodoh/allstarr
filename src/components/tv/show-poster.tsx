import { Tv } from "lucide-react";
import { useEffect, useState } from "react";
import type { JSX } from "react";
import { cn } from "src/lib/utils";

type ShowPosterProps = {
  posterUrl: string | null;
  title: string;
  className?: string;
};

export default function ShowPoster({
  posterUrl,
  title,
  className,
}: ShowPosterProps): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [posterUrl]);

  return (
    <div
      className={cn(
        "aspect-[2/3] w-full max-w-56 overflow-hidden rounded-xl border bg-muted shadow-sm",
        className,
      )}
    >
      {posterUrl && !imageFailed ? (
        <img
          src={posterUrl}
          alt={`${title} poster`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <Tv className="h-8 w-8" />
          <span className="text-xs">No poster</span>
        </div>
      )}
    </div>
  );
}
