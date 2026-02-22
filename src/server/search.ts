import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./middleware";

const HARDCOVER_GRAPHQL_URL = "https://api.hardcover.app/v1/graphql";

export type HardcoverSearchMode = "all" | "books" | "authors";
type HardcoverQueryType = "Book" | "Author";

export interface HardcoverSearchItem {
  id: string;
  type: "book" | "author";
  slug: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
  hardcoverUrl: string | null;
}

export interface HardcoverAuthorBookSeries {
  id: string;
  title: string;
  position: string | null;
}

export interface HardcoverAuthorBook {
  id: string;
  title: string;
  slug: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  rating: number | null;
  coverUrl: string | null;
  contribution: string | null;
  languageCode: string | null;
  languageName: string | null;
  hardcoverUrl: string | null;
  series: HardcoverAuthorBookSeries[];
}

export interface HardcoverSeriesBook {
  id: string;
  title: string;
  slug: string | null;
  releaseYear: number | null;
  rating: number | null;
  coverUrl: string | null;
  position: number | null;
  hardcoverUrl: string | null;
  isCompilation: boolean;
  authorName: string | null;
}

export interface HardcoverSeriesBooksResult {
  seriesId: string;
  seriesTitle: string;
  books: HardcoverSeriesBook[];
}

export interface HardcoverAuthorSeries {
  id: string;
  name: string;
  slug: string;
  booksCount: number;
  isCompleted: boolean | null;
}

export interface HardcoverLanguageOption {
  code: string;
  name: string;
}

export interface HardcoverAuthorDetail {
  id: string;
  slug: string;
  name: string;
  bio: string | null;
  booksCount: number | null;
  bornYear: number | null;
  deathYear: number | null;
  imageUrl: string | null;
  hardcoverUrl: string | null;
  selectedLanguage: string;
  page: number;
  pageSize: number;
  totalBooks: number;
  totalPages: number;
  languages: HardcoverLanguageOption[];
  books: HardcoverAuthorBook[];
  sortBy: "title" | "year" | "rating";
  sortDir: "asc" | "desc";
}

const searchInputSchema = z.object({
  query: z.string().trim().min(2).max(120),
  type: z.enum(["all", "books", "authors"]).default("all"),
  limit: z.number().int().min(1).max(50).default(20),
});

const authorDetailsInputSchema = z.object({
  slug: z.string().trim().min(1).max(160),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(500).default(25),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(all|[a-z]{2,3})$/)
    .default("en"),
  sortBy: z.enum(["title", "year", "rating"]).default("year"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

const searchQuery = `
query Search($query: String!, $queryType: String, $perPage: Int!, $page: Int!) {
  search(query: $query, query_type: $queryType, per_page: $perPage, page: $page) {
    error
    results
  }
}
`;

const authorDetailsMetaQuery = `
query HardcoverAuthorMeta($slug: String!) {
  authors(where: { slug: { _eq: $slug } }, limit: 1) {
    id
    name
    slug
    bio
    books_count
    born_year
    death_year
    image {
      url
    }
  }
  editions(
    distinct_on: language_id
    where: {
      book: { contributions: { author: { slug: { _eq: $slug } } } }
      language_id: { _is_null: false }
    }
    order_by: [{ language_id: asc }, { id: asc }]
  ) {
    language {
      code2
      code3
      language
    }
  }
}
`;


// ---------------------------------------------------------------------------
// Filter fragment constants — single source of truth for shared Hasura filters
// ---------------------------------------------------------------------------

/** Excludes compilation books from the `books` table */
const BOOK_COMPILATION_FILTER = "compilation: { _neq: true }";

/** Excludes compilation entries from the `book_series` join table */
const BOOK_SERIES_COMPILATION_FILTER = "compilation: { _neq: true }";

/**
 * Non-author contribution roles to exclude from the author's book listings.
 * The `contribution` field is `null` for primary authors; these are the
 * known secondary roles where the person did not originate the content.
 * We use `_nin` (not-in) paired with `_is_null: true` so that:
 *   - `null`  → primary author    → included
 *   - "Writer" / "Contributor" / etc. → named author-like roles → included
 *   - "Editor" / "Translator" / etc.  → non-originating roles   → excluded
 */
const NON_AUTHOR_CONTRIBUTION_ROLES = [
  // Editorial
  "Editor", "editor", "Series Editor", "Editor and Contributor",
  "Editor/Introduction",
  // Translation / adaptation
  "Translator", "Adapted by", "Adapter", "Adaptor",
  // Art / production
  "Illustrator", "illustrator",
  // Supplementary content
  "Introduction", "Afterword",
  // Other non-originating
  "Compiler", "Pseudonym", "pseudonym", "Compilation",
  "as \"Anonymous\"",
];

const NON_AUTHOR_CONTRIBUTION_FILTER =
  `_or: [{ contribution: { _is_null: true } }, { contribution: { _nin: [${NON_AUTHOR_CONTRIBUTION_ROLES.map((r) => JSON.stringify(r)).join(", ")}] } }]`;

// ---------------------------------------------------------------------------
// Filter composition helpers
// ---------------------------------------------------------------------------

/**
 * Composes the `where` clause for the top-level `books` / `books_aggregate`
 * queries on the author books page.
 */
function bookWhereFilters(opts: { slug: string; hasLanguage: boolean }): string {
  const parts: string[] = [
    `contributions: { author: { slug: { _eq: $slug } }, ${NON_AUTHOR_CONTRIBUTION_FILTER} }`,
    BOOK_COMPILATION_FILTER,
  ];
  if (opts.hasLanguage) {
    parts.push(`editions: { language: { code2: { _eq: $languageCode } } }`);
  }
  return parts.join("\n      ");
}

/**
 * Composes the `where` clause for `book_series` queries (series books page).
 * Uses only the entry-level compilation flag — the book-level flag is
 * unreliable in series context (some legitimate volumes are miscategorised
 * as compilations on Hardcover).
 */
function bookSeriesWhereFilters(opts: { hasLanguage: boolean }): string {
  const parts: string[] = [
    `series_id: { _eq: $seriesId }`,
    BOOK_SERIES_COMPILATION_FILTER,
  ];
  if (opts.hasLanguage) {
    parts.push(`book: { editions: { language: { code2: { _eq: $lang } } } }`);
  }
  return parts.join("\n      ");
}

/**
 * Composes the `where` clause for the `book_series` positions fetch inside the
 * author series listing. Only includes entries with a non-null position so the
 * count of distinct positions matches what `deduplicateSeriesBooks` will display.
 * Uses only the entry-level compilation flag for the same reason as above.
 */
function seriesPositionsWhereFilters(opts: { hasLanguage: boolean }): string {
  const parts: string[] = [
    BOOK_SERIES_COMPILATION_FILTER,
    `position: { _is_null: false }`,
  ];
  if (opts.hasLanguage) {
    parts.push(`book: { editions: { language: { code2: { _eq: $lang } } } }`);
  }
  return parts.join("\n        ");
}

// ---------------------------------------------------------------------------
// Query builder functions — replace the 6 static query strings
// ---------------------------------------------------------------------------

/**
 * Builds the author books page query. Accepts `hasLanguage` so that the same
 * builder covers both the "all languages" and "specific language" variants.
 */
function buildAuthorBooksPageQuery(hasLanguage: boolean): string {
  const varDefs = hasLanguage
    ? `$slug: String!, $limit: Int!, $offset: Int!, $languageCode: String!, $orderBy: [books_order_by!]!`
    : `$slug: String!, $limit: Int!, $offset: Int!, $orderBy: [books_order_by!]!`;
  const queryName = hasLanguage
    ? "HardcoverAuthorBooksPageByLanguage"
    : "HardcoverAuthorBooksPage";
  const where = bookWhereFilters({ slug: "$slug", hasLanguage });
  const editionsWhere = hasLanguage
    ? `where: { language: { code2: { _eq: $languageCode } } }`
    : `where: { language: { code2: { _is_null: false } } }`;

  return `
query ${queryName}(${varDefs}) {
  books_aggregate(where: {
    ${where}
  }) {
    aggregate {
      count
    }
  }
  books(
    where: {
      ${where}
    }
    limit: $limit
    offset: $offset
    order_by: $orderBy
  ) {
    id
    title
    slug
    release_date
    release_year
    rating
    image {
      url
    }
    contributions(
      where: { author: { slug: { _eq: $slug } } }
      limit: 1
    ) {
      contribution
    }
    editions(
      limit: 1
      ${editionsWhere}
      order_by: [{ id: asc }]
    ) {
      language {
        code2
        code3
        language
      }
    }
    book_series {
      position
      series {
        id
        name
      }
    }
  }
}
`;
}

/**
 * Builds the series books query (used when expanding a series row).
 */
function buildSeriesBooksQuery(hasLanguage: boolean): string {
  const varDefs = hasLanguage
    ? `$seriesId: Int!, $lang: String!`
    : `$seriesId: Int!`;
  const queryName = hasLanguage
    ? "HardcoverSeriesBooksByLanguage"
    : "HardcoverSeriesBooks";
  const where = bookSeriesWhereFilters({ hasLanguage });

  return `
query ${queryName}(${varDefs}) {
  series_by_pk(id: $seriesId) {
    id
    name
  }
  book_series(
    where: {
      ${where}
    }
    order_by: [{ position: asc_nulls_last }, { book: { users_count: desc } }]
  ) {
    position
    compilation
    book {
      id
      title
      slug
      release_year
      rating
      users_count
      image {
        url
      }
      contributions(
        where: { contribution: { _is_null: true } }
        order_by: [{ id: asc }]
        limit: 3
      ) {
        author {
          name
        }
      }
    }
  }
}
`;
}

/**
 * Builds the author series listing query.
 */
function buildAuthorSeriesQuery(hasLanguage: boolean): string {
  const varDefs = hasLanguage
    ? `$slug: String!, $lang: String!`
    : `$slug: String!`;
  const queryName = hasLanguage
    ? "HardcoverAuthorSeriesByLanguage"
    : "HardcoverAuthorSeries";

  const seriesWhere = hasLanguage
    ? `canonical_id: { _is_null: true }
      book_series: {
        book: {
          contributions: { author: { slug: { _eq: $slug } }, ${NON_AUTHOR_CONTRIBUTION_FILTER} }
          editions: { language: { code2: { _eq: $lang } } }
        }
      }`
    : `canonical_id: { _is_null: true }
      book_series: { book: { contributions: { author: { slug: { _eq: $slug } }, ${NON_AUTHOR_CONTRIBUTION_FILTER} } } }`;

  const positionsWhere = seriesPositionsWhereFilters({ hasLanguage });

  return `
query ${queryName}(${varDefs}) {
  series(
    where: {
      ${seriesWhere}
    }
    order_by: [{ name: asc }]
  ) {
    id
    name
    slug
    is_completed
    positions: book_series(
      where: {
        ${positionsWhere}
      }
      order_by: [{ position: asc }]
    ) { position }
  }
}
`;
}

// ---------------------------------------------------------------------------
// Series books deduplication helper (extracted from inline IIFE)
// ---------------------------------------------------------------------------

/**
 * Removes entries with null position and keeps only the first (highest
 * users_count) entry per position. The query already orders by
 * `position asc_nulls_last, users_count desc`, so the first entry per
 * position is the canonical book.
 */
function deduplicateSeriesBooks(books: HardcoverSeriesBook[]): HardcoverSeriesBook[] {
  const seen = new Set<number>();
  return books.filter((b) => {
    if (b.position === null) return false;
    if (seen.has(b.position)) return false;
    seen.add(b.position);
    return true;
  });
}

const seriesBooksInputSchema = z.object({
  seriesId: z.number().int().min(1),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(all|[a-z]{2,3})$/)
    .default("all"),
});

interface GraphQLSeriesBooksResponse {
  data?: {
    series_by_pk?: unknown;
    book_series?: unknown;
  };
  errors?: Array<{ message?: string }>;
}

async function fetchSeriesBooks(
  seriesId: number,
  language: string,
  authorization: string
): Promise<HardcoverSeriesBooksResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const hasLanguageFilter = language !== "all";

  try {
    const response = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        query: buildSeriesBooksQuery(hasLanguageFilter),
        variables: hasLanguageFilter
          ? { seriesId, lang: language }
          : { seriesId },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const body = (await response.json()) as GraphQLSeriesBooksResponse;
    if (!response.ok) throw new Error("Hardcover series request failed.");
    if (body.errors && body.errors.length > 0) {
      throw new Error(body.errors[0]?.message || "Hardcover series request failed.");
    }

    const seriesRecord = toRecord(body.data?.series_by_pk);
    if (!seriesRecord) throw new Error("Series not found on Hardcover.");

    const seriesTitle = firstString(seriesRecord, [["name"]]) ?? String(seriesId);

    const books: HardcoverSeriesBook[] = toRecordArray(body.data?.book_series)
      .map((entry) => {
        const bookRecord = toRecord(entry.book);
        if (!bookRecord) return null;
        const title = firstString(bookRecord, [["title"]]);
        if (!title) return null;
        const slug = firstString(bookRecord, [["slug"]]);
        const id = firstId(bookRecord, [["id"]]) ?? slug ?? title;
        const position = firstNumber(entry, [["position"]]);
        const isCompilation = entry.compilation === true;
        const authorName =
          toRecordArray(bookRecord.contributions)
            .map((c) => {
              const authorRecord = toRecord(c.author);
              return authorRecord ? firstString(authorRecord, [["name"]]) : null;
            })
            .filter((n): n is string => n !== null)
            .join(", ") || null;
        return {
          id,
          title,
          slug,
          releaseYear: firstNumber(bookRecord, [["release_year"]]),
          rating: firstNumber(bookRecord, [["rating"]]),
          coverUrl: getCoverUrl(bookRecord),
          position,
          hardcoverUrl: slug ? `https://hardcover.app/books/${slug}` : null,
          isCompilation,
          authorName,
        };
      })
      .filter((b): b is HardcoverSeriesBook => Boolean(b));

    return {
      seriesId: String(seriesId),
      seriesTitle,
      books: deduplicateSeriesBooks(books),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hardcover series request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface SearchHit {
  document?: unknown;
}

interface SearchPayload {
  hits?: unknown;
}

interface GraphQLSearchResponse {
  data?: {
    search?: {
      error?: string | null;
      results?: unknown;
    };
  };
  errors?: Array<{
    message?: string;
  }>;
}

interface GraphQLAuthorDetailsResponse {
  data?: {
    authors?: unknown;
    editions?: unknown;
    books?: unknown;
    books_aggregate?: unknown;
  };
  errors?: Array<{
    message?: string;
  }>;
}

function getAuthorizationHeader() {
  const rawToken = process.env.HARDCOVER_TOKEN?.trim();
  if (!rawToken) {
    throw new Error("HARDCOVER_TOKEN is not configured.");
  }
  return rawToken.startsWith("Bearer ") ? rawToken : `Bearer ${rawToken}`;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function getNestedValue(
  record: Record<string, unknown>,
  path: string[]
): unknown {
  let current: unknown = record;
  for (const key of path) {
    const next = toRecord(current);
    if (!next || !(key in next)) return null;
    current = next[key];
  }
  return current;
}

function firstString(
  record: Record<string, unknown>,
  paths: string[][]
): string | null {
  for (const path of paths) {
    const value = getNestedValue(record, path);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

function firstNumber(
  record: Record<string, unknown>,
  paths: string[][]
): number | null {
  for (const path of paths) {
    const value = getNestedValue(record, path);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function firstId(
  record: Record<string, unknown>,
  paths: string[][]
): string | null {
  const asString = firstString(record, paths);
  if (asString) return asString;
  const asNumber = firstNumber(record, paths);
  return asNumber !== null ? String(asNumber) : null;
}

function getStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function parseYear(value: string | null): number | null {
  if (!value) return null;
  const yearMatch = value.match(/\b(\d{4})\b/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);
  return Number.isFinite(year) ? year : null;
}

function normalizeLanguageCode(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function parseAggregateCount(value: unknown): number {
  const aggregate = toRecord(value);
  const aggregateInner = aggregate ? toRecord(aggregate.aggregate) : null;
  const count = aggregateInner ? firstNumber(aggregateInner, [["count"]]) : null;
  return count ?? 0;
}

function extractBookAuthorName(record: Record<string, unknown>): string | null {
  const authorNames = getStringList(record.author_names);
  if (authorNames.length > 0) return authorNames.join(", ");

  const contributions = Array.isArray(record.contributions)
    ? record.contributions
    : [];
  for (const contribution of contributions) {
    const contributionRecord = toRecord(contribution);
    const authorRecord = contributionRecord
      ? toRecord(contributionRecord.author)
      : null;
    const name = authorRecord ? firstString(authorRecord, [["name"]]) : null;
    if (name) return name;
  }

  return firstString(record, [["authorName"], ["author_name"], ["author", "name"]]);
}

function getCoverUrl(record: Record<string, unknown>): string | null {
  const imageRecord = toRecord(record.image);
  if (imageRecord) {
    const imageUrl = firstString(imageRecord, [["url"], ["large"], ["medium"]]);
    if (imageUrl) return imageUrl;
  }

  if (Array.isArray(record.images)) {
    for (const image of record.images) {
      const imageRecordFromList = toRecord(image);
      if (!imageRecordFromList) continue;
      const imageUrl = firstString(imageRecordFromList, [["url"]]);
      if (imageUrl) return imageUrl;
    }
  }

  return firstString(record, [["coverUrl"], ["cover", "url"]]);
}

function toHardcoverAuthorBook(
  bookRecord: Record<string, unknown>
): HardcoverAuthorBook | null {
  const title = firstString(bookRecord, [["title"], ["name"]]);
  if (!title) return null;
  const slug = firstString(bookRecord, [["slug"]]);
  const id = firstId(bookRecord, [["id"], ["book_id"], ["foreign_book_id"]]) ?? slug ?? title;
  const contributions = toRecordArray(bookRecord.contributions);
  const contribution = contributions.length
    ? firstString(contributions[0], [["contribution"]])
    : null;
  const editions = toRecordArray(bookRecord.editions);
  const languageRecord = editions.length
    ? toRecord(editions[0].language)
    : null;
  const languageCode = languageRecord
    ? normalizeLanguageCode(
        firstString(languageRecord, [["code2"], ["code3"]])
      )
    : null;
  const languageName = languageRecord
    ? firstString(languageRecord, [["language"]])
    : null;

  const bookSeriesEntries = toRecordArray(bookRecord.book_series);
  const series: HardcoverAuthorBookSeries[] = bookSeriesEntries
    .map((entry) => {
      const seriesRecord = toRecord(entry.series);
      if (!seriesRecord) return null;
      const seriesId = firstId(seriesRecord, [["id"]]);
      const seriesTitle = firstString(seriesRecord, [["name"], ["title"]]);
      if (!seriesId || !seriesTitle) return null;
      return {
        id: seriesId,
        title: seriesTitle,
        position: firstString(entry, [["position"]]),
      };
    })
    .filter((s): s is HardcoverAuthorBookSeries => Boolean(s));

  return {
    id,
    title,
    slug,
    releaseDate: firstString(bookRecord, [["release_date"], ["published_date"]]),
    releaseYear:
      firstNumber(bookRecord, [["release_year"], ["published_year"], ["year"]]) ??
      parseYear(firstString(bookRecord, [["release_date"], ["published_date"]])),
    rating: firstNumber(bookRecord, [["rating"]]),
    coverUrl: getCoverUrl(bookRecord),
    contribution,
    languageCode,
    languageName,
    hardcoverUrl: slug ? `https://hardcover.app/books/${slug}` : null,
    series,
  };
}

function toBookResult(document: Record<string, unknown>): HardcoverSearchItem | null {
  const title = firstString(document, [["title"], ["name"]]);
  if (!title) return null;

  const subtitle = extractBookAuthorName(document);
  const releaseYear =
    firstNumber(document, [["release_year"], ["published_year"], ["year"]]) ??
    parseYear(firstString(document, [["release_date"], ["published_date"]]));
  const description = firstString(document, [["description"], ["overview"], ["blurb"]]);
  const slug = firstString(document, [["slug"]]);
  const rawId = firstId(document, [["id"], ["book_id"], ["foreign_book_id"]]);
  const id = rawId ?? slug ?? title;

  return {
    id,
    type: "book",
    slug,
    title,
    subtitle,
    description,
    releaseYear,
    coverUrl: getCoverUrl(document),
    hardcoverUrl: slug ? `https://hardcover.app/books/${slug}` : null,
  };
}

function toAuthorResult(document: Record<string, unknown>): HardcoverSearchItem | null {
  const name = firstString(document, [["name"], ["title"]]);
  if (!name) return null;

  const booksCount = firstNumber(document, [["books_count"], ["book_count"]]);
  const personalName = firstString(document, [["name_personal"]]);
  const subtitle =
    booksCount !== null
      ? `${booksCount} ${booksCount === 1 ? "book" : "books"}`
      : personalName && personalName !== name
        ? personalName
        : null;
  const description = firstString(document, [["description"], ["bio"], ["overview"]]);
  const slug = firstString(document, [["slug"]]);
  const rawId = firstId(document, [["id"], ["author_id"], ["foreign_author_id"]]);
  const id = rawId ?? slug ?? name;

  return {
    id,
    type: "author",
    slug,
    title: name,
    subtitle,
    description,
    releaseYear: null,
    coverUrl: getCoverUrl(document),
    hardcoverUrl: slug ? `https://hardcover.app/authors/${slug}` : null,
  };
}

function parseSearchPayload(payload: unknown): SearchHit[] {
  const payloadRecord = toRecord(payload) as SearchPayload | null;
  if (!payloadRecord) return [];
  return Array.isArray(payloadRecord.hits)
    ? (payloadRecord.hits as SearchHit[])
    : [];
}

function interleave<T>(left: T[], right: T[], limit: number): T[] {
  const merged: T[] = [];
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    if (i < left.length) merged.push(left[i]);
    if (i < right.length) merged.push(right[i]);
    if (merged.length >= limit) break;
  }
  return merged.slice(0, limit);
}

async function fetchSearchResults(
  query: string,
  queryType: HardcoverQueryType,
  limit: number,
  authorization: string
): Promise<HardcoverSearchItem[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        query: searchQuery,
        variables: {
          query,
          queryType,
          perPage: limit,
          page: 1,
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const body = (await response.json()) as GraphQLSearchResponse;
    if (!response.ok) {
      throw new Error("Hardcover search request failed.");
    }

    if (body.errors && body.errors.length > 0) {
      throw new Error(body.errors[0]?.message || "Hardcover search failed.");
    }

    const apiError = body.data?.search?.error;
    if (apiError) throw new Error(apiError);

    const hits = parseSearchPayload(body.data?.search?.results);
    const mapped = hits
      .map((hit) => toRecord(hit.document))
      .filter((document): document is Record<string, unknown> => Boolean(document))
      .map((document) =>
        queryType === "Book" ? toBookResult(document) : toAuthorResult(document)
      )
      .filter((item): item is HardcoverSearchItem => Boolean(item));

    return mapped.slice(0, limit);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hardcover search timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildOrderBy(
  sortBy: "title" | "year" | "rating",
  sortDir: "asc" | "desc"
): Record<string, unknown>[] {
  const dir = sortDir;
  const dirNullsLast = sortDir === "asc" ? "asc_nulls_last" : "desc_nulls_last";
  if (sortBy === "title") return [{ title: dir }, { id: "asc" }];
  if (sortBy === "rating") return [{ rating: dirNullsLast }, { id: "asc" }];
  // year (default)
  return [{ release_year: dirNullsLast }, { id: dir }];
}

async function fetchAuthorBooksPage(
  slug: string,
  page: number,
  pageSize: number,
  selectedLanguage: string,
  sortBy: "title" | "year" | "rating",
  sortDir: "asc" | "desc",
  authorization: string
): Promise<{ books: HardcoverAuthorBook[]; totalBooks: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const offset = (page - 1) * pageSize;
  const hasLanguageFilter = selectedLanguage !== "all";

  try {
    const response = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        query: buildAuthorBooksPageQuery(hasLanguageFilter),
        variables: {
          slug,
          limit: pageSize,
          offset,
          orderBy: buildOrderBy(sortBy, sortDir),
          ...(hasLanguageFilter ? { languageCode: selectedLanguage } : {}),
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const body = (await response.json()) as GraphQLAuthorDetailsResponse;
    if (!response.ok) {
      throw new Error("Hardcover books request failed.");
    }
    if (body.errors && body.errors.length > 0) {
      throw new Error(body.errors[0]?.message || "Hardcover books request failed.");
    }

    const books = toRecordArray(body.data?.books)
      .map((bookRecord) => toHardcoverAuthorBook(bookRecord))
      .filter((book): book is HardcoverAuthorBook => Boolean(book));
    const totalBooks = parseAggregateCount(body.data?.books_aggregate);
    return { books, totalBooks };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hardcover books request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAuthorDetails(
  slug: string,
  page: number,
  pageSize: number,
  language: string,
  sortBy: "title" | "year" | "rating",
  sortDir: "asc" | "desc",
  authorization: string
): Promise<HardcoverAuthorDetail> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const metaResponse = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        query: authorDetailsMetaQuery,
        variables: { slug },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const metaBody = (await metaResponse.json()) as GraphQLAuthorDetailsResponse;
    if (!metaResponse.ok) {
      throw new Error("Hardcover author request failed.");
    }
    if (metaBody.errors && metaBody.errors.length > 0) {
      throw new Error(metaBody.errors[0]?.message || "Hardcover author request failed.");
    }

    const authors = toRecordArray(metaBody.data?.authors);
    const author = authors.length ? authors[0] : null;
    if (!author) {
      throw new Error("Author not found on Hardcover.");
    }

    const languagesMap = new Map<string, string>();
    for (const edition of toRecordArray(metaBody.data?.editions)) {
      const languageRecord = toRecord(edition.language);
      if (!languageRecord) continue;
      const code = normalizeLanguageCode(
        firstString(languageRecord, [["code2"], ["code3"]])
      );
      const name = firstString(languageRecord, [["language"]]);
      if (!code || !name) continue;
      if (!languagesMap.has(code)) languagesMap.set(code, name);
    }
    if (!languagesMap.has("en")) {
      languagesMap.set("en", "English");
    }

    const selectedLanguageRaw = normalizeLanguageCode(language) || "en";
    const selectedLanguage =
      selectedLanguageRaw === "all" || languagesMap.has(selectedLanguageRaw)
        ? selectedLanguageRaw
        : "en";

    const booksPage = await fetchAuthorBooksPage(
      slug,
      page,
      pageSize,
      selectedLanguage,
      sortBy,
      sortDir,
      authorization
    );
    const totalPages = Math.max(1, Math.ceil(booksPage.totalBooks / pageSize));
    const safePage = Math.min(page, totalPages);
    const pagedBooks =
      safePage === page
        ? booksPage.books
        : (
            await fetchAuthorBooksPage(
              slug,
              safePage,
              pageSize,
              selectedLanguage,
              sortBy,
              sortDir,
              authorization
            )
          ).books;

    const authorSlug = firstString(author, [["slug"]]) || slug;
    const authorName = firstString(author, [["name"], ["title"]]);
    if (!authorName) {
      throw new Error("Author name is missing in Hardcover response.");
    }

    const languageOptions: HardcoverLanguageOption[] = [
      { code: "all", name: "All Languages" },
      ...Array.from(languagesMap.entries())
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ];

    return {
      id:
        firstId(author, [["id"], ["author_id"], ["foreign_author_id"]]) ||
        authorSlug,
      slug: authorSlug,
      name: authorName,
      bio: firstString(author, [["bio"], ["overview"]]),
      booksCount: booksPage.totalBooks,
      bornYear: firstNumber(author, [["born_year"]]),
      deathYear: firstNumber(author, [["death_year"]]),
      imageUrl: getCoverUrl(author),
      hardcoverUrl: authorSlug ? `https://hardcover.app/authors/${authorSlug}` : null,
      selectedLanguage,
      page: safePage,
      pageSize,
      totalBooks: booksPage.totalBooks,
      totalPages,
      languages: languageOptions,
      books: pagedBooks,
      sortBy,
      sortDir,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hardcover author request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const searchHardcoverFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => searchInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    const authorization = getAuthorizationHeader();
    const { query, type, limit } = data;

    if (type === "books") {
      const results = await fetchSearchResults(
        query,
        "Book",
        limit,
        authorization
      );
      return { query, type, results, total: results.length };
    }

    if (type === "authors") {
      const results = await fetchSearchResults(
        query,
        "Author",
        limit,
        authorization
      );
      return { query, type, results, total: results.length };
    }

    const [bookResults, authorResults] = await Promise.all([
      fetchSearchResults(query, "Book", limit, authorization),
      fetchSearchResults(query, "Author", limit, authorization),
    ]);
    const results = interleave(bookResults, authorResults, limit);

    return { query, type, results, total: results.length };
  });

export const getHardcoverAuthorFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => authorDetailsInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    const authorization = getAuthorizationHeader();
    return fetchAuthorDetails(
      data.slug,
      data.page,
      data.pageSize,
      data.language,
      data.sortBy,
      data.sortDir,
      authorization
    );
  });

export const getHardcoverSeriesBooksFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => seriesBooksInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    const authorization = getAuthorizationHeader();
    return fetchSeriesBooks(data.seriesId, data.language, authorization);
  });

const authorSeriesInputSchema = z.object({
  slug: z.string().trim().min(1).max(160),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(all|[a-z]{2,3})$/)
    .default("all"),
});

interface GraphQLAuthorSeriesResponse {
  data?: { series?: unknown };
  errors?: Array<{ message?: string }>;
}

async function fetchAuthorSeries(
  slug: string,
  language: string,
  authorization: string
): Promise<HardcoverAuthorSeries[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const hasLanguageFilter = language !== "all";
  try {
    const response = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify({
        query: buildAuthorSeriesQuery(hasLanguageFilter),
        variables: hasLanguageFilter ? { slug, lang: language } : { slug },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    const body = (await response.json()) as GraphQLAuthorSeriesResponse;
    if (!response.ok) throw new Error("Hardcover series request failed.");
    if (body.errors && body.errors.length > 0) {
      throw new Error(body.errors[0]?.message || "Hardcover series request failed.");
    }
    return toRecordArray(body.data?.series).map((s) => {
      // Count distinct non-null positions — mirrors the deduplicateSeriesBooks
      // logic so this number matches exactly what the expanded view will show.
      const positionRows = toRecordArray(s.positions);
      const distinctPositions = new Set(
        positionRows
          .map((p) => firstNumber(p, [["position"]]))
          .filter((p): p is number => p !== null)
      );
      const booksCount = distinctPositions.size;
      return {
        id: String(firstId(s, [["id"]]) ?? ""),
        name: firstString(s, [["name"]]) ?? "",
        slug: firstString(s, [["slug"]]) ?? "",
        booksCount,
        isCompleted:
          typeof s.is_completed === "boolean" ? s.is_completed : null,
        hardcoverUrl: `https://hardcover.app/series/${firstString(s, [["slug"]]) ?? ""}`,
      };
    }).filter((s) => s.id && s.name && s.booksCount > 0);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hardcover series request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const getHardcoverAuthorSeriesFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => authorSeriesInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    const authorization = getAuthorizationHeader();
    return fetchAuthorSeries(data.slug, data.language, authorization);
  });


