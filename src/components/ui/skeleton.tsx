import type { ComponentProps, JSX } from "react";
import { cn } from "src/lib/utils";

export default function Skeleton({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  );
}
