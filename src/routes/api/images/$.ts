import { createFileRoute } from "@tanstack/react-router";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import sharp from "sharp";
import { resolveImagePath } from "src/server/image-cache";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

const OUTPUT_FORMATS = new Set(["webp", "avif", "jpg", "jpeg", "png"]);

/**
 * Finds the image file for a given path (without extension),
 * trying common image extensions.
 */
function findImageFile(basePath: string): string | null {
  // Try exact path first (if it has an extension)
  if (existsSync(basePath)) {
    return basePath;
  }
  // Try common extensions
  for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]) {
    const candidate = basePath + ext;
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  // Try matching by filename prefix in the directory
  const dir = join(basePath, "..");
  const base = basePath.split("/").pop()!;
  if (existsSync(dir)) {
    const files = readdirSync(dir);
    const match = files.find((f) => f.startsWith(`${base}.`));
    if (match) {
      return join(dir, match);
    }
  }
  return null;
}

/** Apply format-specific encoding to a sharp pipeline. */
function applyOutputFormat(
  pipeline: sharp.Sharp,
  outputFormat: string,
  quality: number,
): sharp.Sharp {
  switch (outputFormat) {
    case "webp": {
      return pipeline.webp({ quality });
    }
    case "avif": {
      return pipeline.avif({ quality });
    }
    case "jpg":
    case "jpeg": {
      return pipeline.jpeg({ quality });
    }
    case "png": {
      return pipeline.png();
    }
    default: {
      return pipeline.webp({ quality });
    }
  }
}

export const Route = createFileRoute("/api/images/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        // Extract the path after /api/images/
        const imagePath = url.pathname.replace(/^\/api\/images\//, "");
        if (!imagePath) {
          return new Response("Not found", { status: 404 });
        }

        const absolutePath = resolveImagePath(imagePath);
        const filePath = findImageFile(absolutePath);
        if (!filePath) {
          return new Response("Not found", { status: 404 });
        }

        const w = url.searchParams.get("w");
        const h = url.searchParams.get("h");
        const q = url.searchParams.get("q");
        const format = url.searchParams.get("format");

        const width = w ? Number.parseInt(w, 10) : undefined;
        const height = h ? Number.parseInt(h, 10) : undefined;
        const quality = q ? Number.parseInt(q, 10) : 80;

        const sourceExt = extname(filePath).toLowerCase();
        const needsTransform =
          width || height || (format && `.${format}` !== sourceExt);

        if (!needsTransform) {
          // Serve the original file
          const data = await readFile(filePath);
          const mimeType = MIME_TYPES[sourceExt] || "application/octet-stream";
          return new Response(new Uint8Array(data), {
            headers: {
              "Content-Type": mimeType,
              "Cache-Control": "public, max-age=86400",
            },
          });
        }

        // Transform with sharp
        let pipeline = sharp(filePath);

        if (width || height) {
          pipeline = pipeline.resize(width, height, { fit: "cover" });
        }

        const outputFormat =
          format && OUTPUT_FORMATS.has(format) ? format : "webp";
        const outputMime = MIME_TYPES[`.${outputFormat}`] || "image/webp";

        pipeline = applyOutputFormat(pipeline, outputFormat, quality);

        const outputBuffer = await pipeline.toBuffer();
        return new Response(new Uint8Array(outputBuffer), {
          headers: {
            "Content-Type": outputMime,
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
