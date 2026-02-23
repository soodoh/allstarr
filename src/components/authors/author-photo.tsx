import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";

type AuthorPhotoProps = {
  name: string;
  imageUrl?: string | undefined;
  className?: string;
}

export default function AuthorPhoto({ name, imageUrl, className }: AuthorPhotoProps): React.JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <div
      className={cn(
        "mx-auto aspect-[3/4] w-full max-w-56 overflow-hidden rounded-xl border bg-muted shadow-sm",
        className
      )}
    >
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt={`${name} photo`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <ImageOff className="h-8 w-8" />
          <span className="text-xs">No photo available</span>
        </div>
      )}
    </div>
  );
}
