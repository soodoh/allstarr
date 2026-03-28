// oxlint-disable no-console -- Server-side logging for image cache failures
import * as fs from "node:fs";
import { writeFile } from "node:fs/promises";
import * as path from "node:path";

export type ImageEntityType =
  | "authors"
  | "books"
  | "editions"
  | "movies"
  | "shows"
  | "seasons"
  | "manga";

function getExtensionFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg",
  };
  return map[contentType] || "jpg";
}

function getImagesDir(): string {
  return path.join(
    path.dirname(process.env.DATABASE_URL || "data/sqlite.db"),
    "images",
  );
}

/**
 * Downloads an image from an external URL and saves it locally.
 * Returns the relative path (e.g. "authors/42.jpg") on success, null on failure.
 */
export async function cacheImage(
  url: string,
  type: ImageEntityType,
  id: number,
  suffix?: string,
): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(
        `[image-cache] Failed to download ${url}: ${response.status}`,
      );
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const ext = getExtensionFromContentType(contentType);
    const filename = suffix ? `${id}-${suffix}.${ext}` : `${id}.${ext}`;
    const relativePath = `${type}/${filename}`;
    const imagesDir = getImagesDir();
    const absolutePath = path.join(imagesDir, relativePath);

    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const buffer = await response.arrayBuffer();
    await writeFile(absolutePath, Buffer.from(buffer));

    return relativePath;
  } catch (error) {
    console.warn(`[image-cache] Error caching image from ${url}:`, error);
    return null;
  }
}

/**
 * Resolves a relative cached image path to an absolute filesystem path.
 */
export function resolveImagePath(relativePath: string): string {
  return path.join(getImagesDir(), relativePath);
}

/**
 * Ensures the images directory exists.
 */
export function ensureImagesDir(): void {
  const imagesDir = getImagesDir();
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
}
