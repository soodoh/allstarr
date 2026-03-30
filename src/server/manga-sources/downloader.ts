// oxlint-disable import/prefer-default-export -- Named export matches usage pattern across the codebase
import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as path from "node:path";
import { getSource } from "./registry";

type DownloadChapterOptions = {
  sourceId: string;
  chapterUrl: string;
  outputDir: string; // e.g., /books/manga-title/
  chapterFileName: string; // e.g., "Chapter 045.cbz"
};

type DownloadResult = {
  filePath: string;
  fileSize: number;
  pageCount: number;
};

export async function downloadChapterAsCbz(
  options: DownloadChapterOptions,
): Promise<DownloadResult> {
  const source = getSource(options.sourceId);

  // 1. Get page image URLs
  const pageUrls = await source.getPageList(options.chapterUrl);
  if (pageUrls.length === 0) {
    throw new Error("No pages found for chapter");
  }

  // 2. Fetch all page images (batched to respect rate limits)
  const images: Array<{ index: number; data: Buffer; ext: string }> = [];
  const batchSize = 5;

  for (let i = 0; i < pageUrls.length; i += batchSize) {
    const batch = pageUrls.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (url, batchIdx) => {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Referer: source.baseUrl,
          },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          throw new Error(
            `Failed to fetch page ${i + batchIdx + 1}: HTTP ${response.status}`,
          );
        }
        const data = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get("content-type") ?? "";
        let ext = "jpg";
        if (contentType.includes("png")) {
          ext = "png";
        } else if (contentType.includes("webp")) {
          ext = "webp";
        }
        return { index: i + batchIdx, data, ext };
      }),
    );
    images.push(...results);
  }

  // 3. Sort by index and package into CBZ
  images.sort((a, b) => a.index - b.index);
  const zip = new AdmZip();
  for (const img of images) {
    const pageName = `${String(img.index + 1).padStart(3, "0")}.${img.ext}`;
    zip.addFile(pageName, img.data);
  }

  // 4. Write to disk
  fs.mkdirSync(options.outputDir, { recursive: true });
  const filePath = path.join(options.outputDir, options.chapterFileName);
  zip.writeZip(filePath);

  const stats = fs.statSync(filePath);
  return {
    filePath,
    fileSize: stats.size,
    pageCount: images.length,
  };
}
