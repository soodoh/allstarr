import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function getCoverUrl(
  images: Array<{ url: string; coverType: string }> | undefined,
): string | null {
  return (
    images?.find((img) => img.coverType === "cover")?.url ??
    images?.[0]?.url ??
    null
  );
}

export function resizeTmdbUrl(url: string | null, size: string): string | null {
  if (!url) {
    return null;
  }
  return url.replace(/\/t\/p\/\w+\//, `/t/p/${size}/`);
}
