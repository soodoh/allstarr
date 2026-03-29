/**
 * Wikipedia wikitext parser for manga volume/chapter mappings.
 * Parses "List of X chapters" pages to enrich volume grouping data.
 */

import { createApiFetcher } from "./api-cache";
import { parseChapterNumber } from "./manga-chapter-utils";

// ─── Types ────────────────────────────────────────────────────────────────

export type WikipediaVolumeMapping = {
  volumeNumber: number;
  firstChapter: number;
  lastChapter: number;
};

type WikiSearchResult = {
  query?: {
    search?: Array<{ title: string }>;
  };
};

type WikiParseResult = {
  parse?: {
    wikitext?: {
      "*": string;
    };
  };
};

// ─── API Client ───────────────────────────────────────────────────────────

const wikipedia = createApiFetcher({
  name: "wikipedia",
  cache: { ttlMs: 10 * 60 * 1000, maxEntries: 500 },
  rateLimit: { maxRequests: 1, windowMs: 1000 },
  retry: { maxRetries: 3, baseDelayMs: 1000 },
});

const WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php";
const REQUEST_TIMEOUT_MS = 15_000;

async function wikipediaFetch<T>(cacheKey: string, url: string): Promise<T> {
  return wikipedia.fetch<T>(cacheKey, async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(
          `Wikipedia API error: ${response.status} ${response.statusText}`,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Wikipedia API request timed out.", { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  });
}

// ─── Pure Parser Functions ────────────────────────────────────────────────

/**
 * Extracts all `{{Graphic novel list ...}}` blocks from wikitext.
 * Skips `/header` and `/footer` variants.
 * Handles nested `{{...}}` by tracking brace depth.
 */
export function extractGraphicNovelListBlocks(wikitext: string): string[] {
  const blocks: string[] = [];
  let i = 0;

  while (i < wikitext.length) {
    // Find the next opening {{
    const start = wikitext.indexOf("{{", i);
    if (start === -1) {
      break;
    }

    // Peek ahead to check if it's a Graphic novel list block
    const afterOpen = wikitext.slice(start + 2);
    const isHeader = /^Graphic novel list\/header/i.test(afterOpen);
    const isFooter = /^Graphic novel list\/footer/i.test(afterOpen);
    const isBlock = /^Graphic novel list[\s\n|]/i.test(afterOpen);

    if (!isHeader && !isFooter && !isBlock) {
      i = start + 2;
      continue;
    }

    if (isHeader || isFooter) {
      // Skip past this template without capturing
      i = start + 2;
      continue;
    }

    // Walk forward tracking brace depth to find the matching closing }}
    let depth = 1;
    let j = start + 2;
    while (j < wikitext.length && depth > 0) {
      if (wikitext[j] === "{" && wikitext[j + 1] === "{") {
        depth += 1;
        j += 2;
      } else if (wikitext[j] === "}" && wikitext[j + 1] === "}") {
        depth -= 1;
        j += 2;
      } else {
        j += 1;
      }
    }

    if (depth === 0) {
      blocks.push(wikitext.slice(start, j));
    }

    i = j;
  }

  return blocks;
}

/**
 * Extracts the VolumeNumber from a `{{Graphic novel list ...}}` block.
 * Returns null if not found.
 */
export function extractVolumeNumber(block: string): number | null {
  const match = block.match(/\|\s*VolumeNumber\s*=\s*(\d+(?:\.\d+)?)/i);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

/**
 * Extracts the first chapter number from a `{{Graphic novel list ...}}` block.
 * Tries multiple strategies in order:
 * 1. `{{Numbered list|start=N}}`
 * 2. `<li value="N">`
 * 3. `* NNN.` (bullet with number prefix)
 * 4. `# NNN.` (ordered with number prefix)
 * 5. `Mission/Chapter: X`
 */
export function extractFirstChapterNumber(block: string): number | null {
  // Strategy 1: {{Numbered list|start=N}}
  const numberedListMatch = block.match(
    /\{\{Numbered list\s*\|\s*start\s*=\s*(\d+)/i,
  );
  if (numberedListMatch) {
    return Number(numberedListMatch[1]);
  }

  // Strategy 2: <li value="N"> or <li value=N>
  const liValueMatch = block.match(/<li\s+value=["']?(\d+)["']?/i);
  if (liValueMatch) {
    return Number(liValueMatch[1]);
  }

  // Strategy 3: * NNN. (bullet list with numeric chapter prefix)
  const bulletMatch = block.match(/^\s*\*\s+(\d+)\./m);
  if (bulletMatch) {
    return Number(bulletMatch[1]);
  }

  // Strategy 4: # NNN. (ordered list with numeric chapter prefix)
  const orderedMatch = block.match(/^\s*#\s+(\d+)\./m);
  if (orderedMatch) {
    return Number(orderedMatch[1]);
  }

  // Strategy 5: Mission/Chapter: X
  const missionMatch = block.match(/(?:Mission|Chapter)\s*:\s*(\d+)/i);
  if (missionMatch) {
    return Number(missionMatch[1]);
  }

  // Strategy 6: * Chapters X-Y (Witch Hat Atelier style, en-dash or hyphen)
  const chaptersRangeMatch = block.match(/Chapters?\s+(\d+)/i);
  if (chaptersRangeMatch) {
    return Number(chaptersRangeMatch[1]);
  }

  return null;
}

/**
 * Extracts subpage links from:
 * 1. `{{further|...}}` and `{{main|...}}` templates
 * 2. Plain wikilinks matching chapter list subpage patterns:
 *    `[[List of X chapters (N–M)|...]]`
 */
export function extractSubpageLinks(wikitext: string): string[] {
  const links: string[] = [];

  // Pattern 1: {{further|...}} and {{main|...}} templates
  const templatePattern = /\{\{(?:further|main)\s*\|([^}]+)\}\}/gi;
  let match: RegExpExecArray | null;

  while ((match = templatePattern.exec(wikitext)) !== null) {
    const args = match[1].split("|");
    const title = args[0].trim();
    if (title) {
      links.push(title);
    }
  }

  // Pattern 2: plain wikilinks to chapter list subpages
  // Matches: [[List of X chapters (N–M)|display text]] or [[List of X chapters (N–M)]]
  const wikilinkPattern =
    /\[\[(List of [^[\]]+chapters\s*\([^)]+\))(?:\|[^\]]+)?\]\]/gi;
  while ((match = wikilinkPattern.exec(wikitext)) !== null) {
    const title = match[1].trim();
    if (title && !links.includes(title)) {
      links.push(title);
    }
  }

  return links;
}

/**
 * Combines block extraction, volume number, and chapter number extraction
 * into a single pass over the wikitext.
 */
export function extractVolumesFromWikitext(
  wikitext: string,
): Array<{ volumeNumber: number; firstChapter: number | null }> {
  const blocks = extractGraphicNovelListBlocks(wikitext);
  return blocks.map((block) => ({
    volumeNumber: extractVolumeNumber(block) ?? 0,
    firstChapter: extractFirstChapterNumber(block),
  }));
}

/**
 * Converts a list of volumes with firstChapter into full ranges.
 * For each volume, lastChapter = next volume's firstChapter - 1.
 * For the final volume, lastChapter = latestChapter (if provided) or firstChapter.
 */
export function deriveVolumeRanges(
  volumes: Array<{ volumeNumber: number; firstChapter: number | null }>,
  latestChapter?: number,
): WikipediaVolumeMapping[] {
  if (volumes.length === 0) {
    return [];
  }

  // Filter to volumes with known firstChapter
  const valid = volumes.filter(
    (v): v is { volumeNumber: number; firstChapter: number } =>
      v.firstChapter !== null,
  );

  if (valid.length === 0) {
    return [];
  }

  const result: WikipediaVolumeMapping[] = [];

  for (let i = 0; i < valid.length; i += 1) {
    const vol = valid[i];
    const next = valid[i + 1];

    const lastChapter =
      next === undefined ? vol.firstChapter : next.firstChapter - 1;

    result.push({
      volumeNumber: vol.volumeNumber,
      firstChapter: vol.firstChapter,
      lastChapter,
    });
  }

  return result;
}

/**
 * Applies volume mappings to a chapter list.
 * Assigns `volume` to any chapter whose numeric value falls within a mapping range.
 * Returns a new array; does not mutate the input.
 * Non-numeric chapters (or those outside all ranges) are left with their existing volume.
 */
export function applyWikipediaVolumeMappings<
  T extends { chapterNumber: string; volume: string | null },
>(chapters: T[], mappings: WikipediaVolumeMapping[]): T[] {
  if (mappings.length === 0) {
    return chapters.map((c) => ({ ...c }));
  }

  return chapters.map((chapter) => {
    const num = parseChapterNumber(chapter.chapterNumber);
    if (num === null) {
      return { ...chapter };
    }

    const mapping = mappings.find(
      (m) => num >= m.firstChapter && num <= m.lastChapter,
    );
    if (!mapping) {
      return { ...chapter };
    }

    return { ...chapter, volume: String(mapping.volumeNumber) };
  });
}

// ─── API Client Functions ─────────────────────────────────────────────────

/**
 * Picks the best search result for a chapter list page.
 * Prefers pages with "chapters" in the title, deprioritizes "volumes".
 * Returns null if no suitable page found.
 */
export function pickBestSearchResult(
  hits: Array<{ title: string }>,
): string | null {
  const chapterPages: string[] = [];

  for (const hit of hits) {
    if (
      /lists? of .* chapters/i.test(hit.title) &&
      !/volumes/i.test(hit.title)
    ) {
      chapterPages.push(hit.title);
    }
  }

  return chapterPages[0] ?? null;
}

/**
 * Searches Wikipedia for a chapter list page matching the manga title.
 * Returns the page title, or null if not found.
 */
export async function searchChapterListPage(
  mangaTitle: string,
): Promise<string | null> {
  const srsearch = `intitle:"List of" intitle:"chapters" "${mangaTitle}"`;
  const url = new URL(WIKIPEDIA_API_URL);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", srsearch);
  url.searchParams.set("srlimit", "5");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const cacheKey = `search:${mangaTitle}`;
  const result = await wikipediaFetch<WikiSearchResult>(
    cacheKey,
    url.toString(),
  );

  const hits = result.query?.search ?? [];
  return pickBestSearchResult(hits);
}

/**
 * Fetches the raw wikitext for a Wikipedia page by title.
 * Returns null if the page does not exist or has no wikitext.
 */
export async function fetchPageWikitext(
  pageTitle: string,
): Promise<string | null> {
  const url = new URL(WIKIPEDIA_API_URL);
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", pageTitle);
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const cacheKey = `wikitext:${pageTitle}`;
  try {
    const result = await wikipediaFetch<WikiParseResult>(
      cacheKey,
      url.toString(),
    );
    return result.parse?.wikitext?.["*"] ?? null;
  } catch {
    return null;
  }
}

/**
 * Main entry point. Fetches and parses Wikipedia volume mappings for a manga.
 * Handles subpages by fetching additional pages and deduplicating volumes.
 * Returns mappings and page title, or null if no page found or no volumes parsed.
 */
export async function getWikipediaVolumeMappings(
  mangaTitle: string,
  latestChapter?: number,
): Promise<{ mappings: WikipediaVolumeMapping[]; pageTitle: string } | null> {
  const pageTitle = await searchChapterListPage(mangaTitle);
  if (!pageTitle) {
    return null;
  }

  const wikitext = await fetchPageWikitext(pageTitle);
  if (!wikitext) {
    return null;
  }

  // Validate that the page contains {{Graphic novel list}} templates
  const hasTemplates = wikitext.toLowerCase().includes("{{graphic novel list");
  const subpageLinks = extractSubpageLinks(wikitext);

  if (!hasTemplates && subpageLinks.length === 0) {
    return null;
  }

  // Collect volumes from the main page, filtering out entries with null firstChapter
  const allVolumes: Array<{ volumeNumber: number; firstChapter: number }> = [];
  if (hasTemplates) {
    for (const v of extractVolumesFromWikitext(wikitext)) {
      if (v.firstChapter !== null) {
        allVolumes.push({
          volumeNumber: v.volumeNumber,
          firstChapter: v.firstChapter,
        });
      }
    }
  }

  // Follow subpages
  for (const link of subpageLinks) {
    const subWikitext = await fetchPageWikitext(link);
    if (subWikitext) {
      for (const v of extractVolumesFromWikitext(subWikitext)) {
        if (v.firstChapter !== null) {
          allVolumes.push({
            volumeNumber: v.volumeNumber,
            firstChapter: v.firstChapter,
          });
        }
      }
    }
  }

  // Deduplicate by volumeNumber (keep first occurrence)
  const seen = new Set<number>();
  const deduplicated = allVolumes.filter((v) => {
    if (seen.has(v.volumeNumber)) {
      return false;
    }
    seen.add(v.volumeNumber);
    return true;
  });

  // Sort by volumeNumber ascending before deriving ranges
  deduplicated.sort((a, b) => a.volumeNumber - b.volumeNumber);

  const mappings = deriveVolumeRanges(deduplicated, latestChapter);
  return mappings.length > 0 ? { mappings, pageTitle } : null;
}
