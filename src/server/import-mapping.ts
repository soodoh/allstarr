import { basename } from "node:path";

export type MappedTvFile = {
  path: string;
  season: number;
  episode: number;
};

export type MappedMangaFile = {
  path: string;
  volume: number | null;
  chapter: number | null;
};

export type MappedBookFile = {
  path: string;
  extractedTitle: string;
};

const TV_EPISODE_PATTERN = /S(\d{1,2})E(\d{1,3})/i;
const MANGA_VOL_PATTERN = /\b(?:Vol(?:ume)?|v)\.?\s*(\d+)/i;
const MANGA_CH_PATTERN = /\b(?:Ch(?:apter)?|c)\.?\s*(\d+)/i;
const BOOK_AUTHOR_TITLE = /^(.+?)\s*-\s*(.+?)(?:\.\w+)?$/;

export function mapTvFiles(filePaths: string[]): MappedTvFile[] {
  const results: MappedTvFile[] = [];
  for (const filePath of filePaths) {
    const name = basename(filePath);
    const match = name.match(TV_EPISODE_PATTERN);
    if (match) {
      results.push({
        path: filePath,
        season: Number.parseInt(match[1], 10),
        episode: Number.parseInt(match[2], 10),
      });
    }
  }
  return results;
}

export function mapMangaFiles(filePaths: string[]): MappedMangaFile[] {
  const results: MappedMangaFile[] = [];
  for (const filePath of filePaths) {
    const name = basename(filePath);
    const volMatch = name.match(MANGA_VOL_PATTERN);
    const chMatch = name.match(MANGA_CH_PATTERN);

    if (volMatch || chMatch) {
      results.push({
        path: filePath,
        volume: volMatch ? Number.parseInt(volMatch[1], 10) : null,
        chapter: chMatch ? Number.parseInt(chMatch[1], 10) : null,
      });
    }
  }
  return results;
}

export function mapBookFiles(filePaths: string[]): MappedBookFile[] {
  const results: MappedBookFile[] = [];
  for (const filePath of filePaths) {
    const name = basename(filePath);
    const nameNoExt = name.replace(/\.\w+$/, "");
    const authorTitleMatch = nameNoExt.match(BOOK_AUTHOR_TITLE);
    const extractedTitle = authorTitleMatch
      ? authorTitleMatch[2].trim()
      : nameNoExt;
    results.push({ path: filePath, extractedTitle });
  }
  return results;
}
