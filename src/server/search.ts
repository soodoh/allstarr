import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./middleware";
import { AUTHOR_ROLE_FILTER } from "./hardcover/constants";

const HARDCOVER_GRAPHQL_URL = "https://api.hardcover.app/v1/graphql";

export type HardcoverSearchMode = "all" | "books" | "authors";
type HardcoverQueryType = "Book" | "Author";

export type HardcoverEdition = {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  type: string | null;
  pages: number | null;
  releaseDate: string | null;
  isbn10: string | null;
  isbn13: string | null;
  asin: string | null;
  language: string | null;
  country: string | null;
  readers: number;
  score: number;
  coverUrl: string | null;
};

export type HardcoverBookEditionsResult = {
  editions: HardcoverEdition[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type EditionSortKey =
  | "title"
  | "publisher"
  | "type"
  | "pages"
  | "releaseDate"
  | "isbn10"
  | "isbn13"
  | "asin"
  | "language"
  | "country"
  | "readers"
  | "score";

export type HardcoverSearchItem = {
  id: string;
  type: "book" | "author";
  slug: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  releaseYear: number | null;
  readers: number | null;
  coverUrl: string | null;
  hardcoverUrl: string | null;
};

export type HardcoverAuthorBookSeries = {
  id: string;
  title: string;
  position: string | null;
};

export type HardcoverAuthorBook = {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  rating: number | null;
  ratingsCount: number | null;
  usersCount: number | null;
  coverUrl: string | null;
  contribution: string | null;
  contributors: string | null;
  languageCode: string | null;
  languageName: string | null;
  hardcoverUrl: string | null;
  series: HardcoverAuthorBookSeries[];
};

export type HardcoverSeriesBook = {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  rating: number | null;
  usersCount: number | null;
  coverUrl: string | null;
  position: number | null;
  hardcoverUrl: string | null;
  isCompilation: boolean;
  authorName: string | null;
  languageName: string | null;
};

export type HardcoverSeriesBooksResult = {
  seriesId: string;
  seriesTitle: string;
  books: HardcoverSeriesBook[];
};

export type HardcoverAuthorSeries = {
  id: string;
  name: string;
  slug: string;
  booksCount: number;
  isCompleted: boolean | null;
};

export type HardcoverLanguageOption = {
  code: string;
  name: string;
};

export type HardcoverAuthorDetail = {
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
};

const searchInputSchema = z.object({
  query: z.string().trim().min(2).max(120),
  type: z.enum(["all", "books", "authors"]).default("all"),
  limit: z.number().int().min(1).max(50).default(20),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(all|[a-z]{2,3})$/)
    .default("all"),
});

const authorDetailsInputSchema = z.object({
  foreignAuthorId: z.number().int().min(1),
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

const bookLanguageFilterQuery = `
query BookLanguageFilter($ids: [Int!]!, $langCode: String!) {
  books(where: { id: { _in: $ids }, editions: { language: { code2: { _eq: $langCode } } } }) {
    id
  }
}
`;

const authorDetailsMetaQuery = `
query HardcoverAuthorMeta($authorId: Int!) {
  authors(where: { id: { _eq: $authorId } }, limit: 1) {
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
      book: { contributions: { author: { id: { _eq: $authorId } } } }
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

/** Alias for backward-compatible references within this file */
const NON_AUTHOR_CONTRIBUTION_FILTER = AUTHOR_ROLE_FILTER;

/** GraphQL where clause for selecting author-role contributions to display (stricter whitelist). */
const AUTHOR_CONTRIBUTION_WHERE = `_or: [{ contribution: { _is_null: true } }, { contribution: { _in: ["Writer", "Contributor"] } }]`;

// ---------------------------------------------------------------------------
// Filter composition helpers
// ---------------------------------------------------------------------------

/**
 * Composes the `where` clause for the top-level `books` / `books_aggregate`
 * queries on the author books page.
 */
function bookWhereFilters(opts: { hasLanguage: boolean }): string {
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
  const where = bookWhereFilters({ hasLanguage });
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
    description
    release_date
    release_year
    rating
    ratings_count
    users_count
    image {
      url
    }
    contributions(
      where: { author: { slug: { _eq: $slug } } }
      limit: 1
    ) {
      contribution
    }
    all_contributions: contributions(
      where: { ${AUTHOR_CONTRIBUTION_WHERE} }
      order_by: [{ id: asc }]
      limit: 5
    ) {
      author {
        name
      }
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
      description
      release_date
      release_year
      rating
      users_count
      image {
        url
      }
      contributions(
        where: { ${AUTHOR_CONTRIBUTION_WHERE} }
        order_by: [{ id: asc }]
        limit: 5
      ) {
        author {
          name
        }
      }
      editions(
        limit: 1
        where: { language_id: { _is_null: false } }
        order_by: [{ id: asc }]
      ) {
        language {
          code2
          language
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

  const authorBooksWhere = hasLanguage
    ? `book: {
          contributions: { author: { slug: { _eq: $slug } }, ${NON_AUTHOR_CONTRIBUTION_FILTER} }
          editions: { language: { code2: { _eq: $lang } } }
        }`
    : `book: { contributions: { author: { slug: { _eq: $slug } }, ${NON_AUTHOR_CONTRIBUTION_FILTER} } }`;

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
    author_books: book_series(
      where: {
        ${authorBooksWhere}
      }
    ) {
      book {
        primary_authors: contributions_aggregate(where: { ${AUTHOR_CONTRIBUTION_WHERE} }) {
          aggregate { count }
        }
      }
    }
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
function deduplicateSeriesBooks(
  books: HardcoverSeriesBook[],
): HardcoverSeriesBook[] {
  const seen = new Set<number>();
  return books.filter((b) => {
    if (b.position === null) {
      return false;
    }
    if (seen.has(b.position)) {
      return false;
    }
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

type GraphQLSeriesBooksResponse = {
  data?: {
    series_by_pk?: unknown;
    book_series?: unknown;
  };
  errors?: Array<{ message?: string }>;
};

async function fetchSeriesBooks(
  seriesId: number,
  language: string,
  authorization: string,
): Promise<HardcoverSeriesBooksResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
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
    if (!response.ok) {
      throw new Error("Hardcover series request failed.");
    }
    if (body.errors && body.errors.length > 0) {
      throw new Error(
        body.errors[0]?.message || "Hardcover series request failed.",
      );
    }

    const seriesRecord = toRecord(body.data?.series_by_pk);
    if (!seriesRecord) {
      throw new Error("Series not found on Hardcover.");
    }

    const seriesTitle =
      firstString(seriesRecord, [["name"]]) ?? String(seriesId);

    const books: HardcoverSeriesBook[] = toRecordArray(body.data?.book_series)
      .map((entry) => {
        const bookRecord = toRecord(entry.book);
        if (!bookRecord) {
          return undefined;
        }
        const title = firstString(bookRecord, [["title"]]);
        if (!title) {
          return undefined;
        }
        const slug = firstString(bookRecord, [["slug"]]);
        const id = firstId(bookRecord, [["id"]]) ?? slug ?? title;
        const position = firstNumber(entry, [["position"]]);
        const isCompilation = entry.compilation === true;
        const authorName =
          toRecordArray(bookRecord.contributions)
            .map((c) => {
              const authorRecord = toRecord(c.author);
              return authorRecord
                ? firstString(authorRecord, [["name"]])
                : undefined;
            })
            .filter((n): n is string => n !== undefined)
            .join(", ") || null;
        const editions = toRecordArray(bookRecord.editions);
        const languageRecord =
          editions.length > 0 ? toRecord(editions[0].language) : undefined;
        const languageName = languageRecord
          ? (firstString(languageRecord, [["language"]]) ?? null)
          : null;
        return {
          id,
          title,
          slug: slug ?? null,
          description: firstString(bookRecord, [["description"]]) ?? null,
          releaseDate: firstString(bookRecord, [["release_date"]]) ?? null,
          releaseYear: firstNumber(bookRecord, [["release_year"]]) ?? null,
          rating: firstNumber(bookRecord, [["rating"]]) ?? null,
          usersCount: firstNumber(bookRecord, [["users_count"]]) ?? null,
          coverUrl: getCoverUrl(bookRecord) ?? null,
          position: position ?? null,
          hardcoverUrl: slug ? `https://hardcover.app/books/${slug}` : null,
          isCompilation,
          authorName,
          languageName,
        };
      })
      .filter(Boolean) as HardcoverSeriesBook[];

    return {
      seriesId: String(seriesId),
      seriesTitle,
      books: deduplicateSeriesBooks(books),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hardcover series request timed out.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

type SearchHit = {
  document?: unknown;
};

type SearchPayload = {
  hits?: unknown;
};

type GraphQLSearchResponse = {
  data?: {
    search?: {
      error?: string | undefined;
      results?: unknown;
    };
  };
  errors?: Array<{
    message?: string;
  }>;
};

type GraphQLAuthorDetailsResponse = {
  data?: {
    authors?: unknown;
    editions?: unknown;
    books?: unknown;
    books_aggregate?: unknown;
  };
  errors?: Array<{
    message?: string;
  }>;
};

function getAuthorizationHeader() {
  const rawToken = process.env.HARDCOVER_TOKEN?.trim();
  if (!rawToken) {
    throw new Error("HARDCOVER_TOKEN is not configured.");
  }
  return rawToken.startsWith("Bearer ") ? rawToken : `Bearer ${rawToken}`;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function getNestedValue(
  record: Record<string, unknown>,
  path: string[],
): unknown {
  let current: unknown = record;
  for (const key of path) {
    const next = toRecord(current);
    if (!next || !(key in next)) {
      return undefined;
    }
    current = next[key];
  }
  return current;
}

function firstString(
  record: Record<string, unknown>,
  paths: string[][],
): string | undefined {
  for (const path of paths) {
    const value = getNestedValue(record, path);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function firstNumber(
  record: Record<string, unknown>,
  paths: string[][],
): number | undefined {
  for (const path of paths) {
    const value = getNestedValue(record, path);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function firstId(
  record: Record<string, unknown>,
  paths: string[][],
): string | undefined {
  const asString = firstString(record, paths);
  if (asString) {
    return asString;
  }
  const asNumber = firstNumber(record, paths);
  if (asNumber === undefined) {
    return undefined;
  }
  return String(asNumber);
}

function getStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function parseYear(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const yearMatch = value.match(/\b(\d{4})\b/);
  if (!yearMatch) {
    return undefined;
  }
  const year = Number(yearMatch[1]);
  return Number.isFinite(year) ? year : undefined;
}

function normalizeLanguageCode(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => toRecord(entry)).filter(Boolean) as Array<
    Record<string, unknown>
  >;
}

function parseAggregateCount(value: unknown): number {
  const aggregate = toRecord(value);
  const aggregateInner = aggregate ? toRecord(aggregate.aggregate) : undefined;
  const count = aggregateInner
    ? firstNumber(aggregateInner, [["count"]])
    : undefined;
  return count ?? 0;
}

function extractBookAuthorName(
  record: Record<string, unknown>,
): string | undefined {
  const authorNames = getStringList(record.author_names);
  if (authorNames.length > 0) {
    return authorNames.join(", ");
  }

  const contributions = Array.isArray(record.contributions)
    ? record.contributions
    : [];
  for (const contribution of contributions) {
    const contributionRecord = toRecord(contribution);
    const authorRecord = contributionRecord
      ? toRecord(contributionRecord.author)
      : undefined;
    const name = authorRecord
      ? firstString(authorRecord, [["name"]])
      : undefined;
    if (name) {
      return name;
    }
  }

  return firstString(record, [
    ["authorName"],
    ["author_name"],
    ["author", "name"],
  ]);
}

function getCoverUrl(record: Record<string, unknown>): string | undefined {
  const imageRecord = toRecord(record.image);
  if (imageRecord) {
    const imageUrl = firstString(imageRecord, [["url"], ["large"], ["medium"]]);
    if (imageUrl) {
      return imageUrl;
    }
  }

  if (Array.isArray(record.images)) {
    for (const image of record.images) {
      const imageRecordFromList = toRecord(image);
      if (!imageRecordFromList) {
        continue;
      }
      const imageUrl = firstString(imageRecordFromList, [["url"]]);
      if (imageUrl) {
        return imageUrl;
      }
    }
  }

  return firstString(record, [["coverUrl"], ["cover", "url"]]);
}

function toHardcoverAuthorBook(
  bookRecord: Record<string, unknown>,
): HardcoverAuthorBook | undefined {
  const title = firstString(bookRecord, [["title"], ["name"]]);
  if (!title) {
    return undefined;
  }
  const slug = firstString(bookRecord, [["slug"]]);
  const id =
    firstId(bookRecord, [["id"], ["book_id"], ["foreign_book_id"]]) ??
    slug ??
    title;
  const contributions = toRecordArray(bookRecord.contributions);
  const contribution =
    contributions.length > 0
      ? (firstString(contributions[0], [["contribution"]]) ?? null)
      : null;
  const allContributions = toRecordArray(bookRecord.all_contributions);
  const contributors =
    allContributions
      .map((c) => {
        const authorRecord = toRecord(c.author);
        return authorRecord ? firstString(authorRecord, [["name"]]) : undefined;
      })
      .filter((n): n is string => n !== undefined)
      .join(", ") || null;
  const editions = toRecordArray(bookRecord.editions);
  const languageRecord =
    editions.length > 0 ? toRecord(editions[0].language) : undefined;
  const languageCode = languageRecord
    ? (normalizeLanguageCode(
        firstString(languageRecord, [["code2"], ["code3"]]),
      ) ?? null)
    : null;
  const languageName = languageRecord
    ? (firstString(languageRecord, [["language"]]) ?? null)
    : null;

  const bookSeriesEntries = toRecordArray(bookRecord.book_series);
  const series: HardcoverAuthorBookSeries[] = bookSeriesEntries
    .map((entry) => {
      const seriesRecord = toRecord(entry.series);
      if (!seriesRecord) {
        return undefined;
      }
      const seriesId = firstId(seriesRecord, [["id"]]);
      const seriesTitle = firstString(seriesRecord, [["name"], ["title"]]);
      if (!seriesId || !seriesTitle) {
        return undefined;
      }
      return {
        id: seriesId,
        title: seriesTitle,
        position:
          firstNumber(entry, [["position"]])?.toString() ??
          firstString(entry, [["position"]]) ??
          null,
      };
    })
    .filter(Boolean) as HardcoverAuthorBookSeries[];

  return {
    id,
    title,
    slug: slug ?? null,
    description: firstString(bookRecord, [["description"]]) ?? null,
    releaseDate:
      firstString(bookRecord, [["release_date"], ["published_date"]]) ?? null,
    releaseYear:
      firstNumber(bookRecord, [
        ["release_year"],
        ["published_year"],
        ["year"],
      ]) ??
      parseYear(
        firstString(bookRecord, [["release_date"], ["published_date"]]),
      ) ??
      null,
    rating: firstNumber(bookRecord, [["rating"]]) ?? null,
    ratingsCount: firstNumber(bookRecord, [["ratings_count"]]) ?? null,
    usersCount: firstNumber(bookRecord, [["users_count"]]) ?? null,
    coverUrl: getCoverUrl(bookRecord) ?? null,
    contribution,
    contributors,
    languageCode,
    languageName,
    hardcoverUrl: slug ? `https://hardcover.app/books/${slug}` : null,
    series,
  };
}

function toBookResult(
  document: Record<string, unknown>,
): HardcoverSearchItem | undefined {
  const title = firstString(document, [["title"], ["name"]]);
  if (!title) {
    return undefined;
  }

  // Filter out compilation books (matches BOOK_COMPILATION_FILTER used on author pages)
  if (document.compilation === true) {
    return undefined;
  }

  // Filter out books without an author
  const subtitle = extractBookAuthorName(document);
  if (!subtitle) {
    return undefined;
  }
  const releaseYear =
    firstNumber(document, [["release_year"], ["published_year"], ["year"]]) ??
    parseYear(firstString(document, [["release_date"], ["published_date"]]));
  const description = firstString(document, [
    ["description"],
    ["overview"],
    ["blurb"],
  ]);
  const slug = firstString(document, [["slug"]]);
  const rawId = firstId(document, [["id"], ["book_id"], ["foreign_book_id"]]);
  const id = rawId ?? slug ?? title;

  return {
    id,
    type: "book",
    slug: slug ?? null,
    title,
    subtitle,
    description: description ?? null,
    releaseYear: releaseYear ?? null,
    readers: firstNumber(document, [["users_count"]]) ?? null,
    coverUrl: getCoverUrl(document) ?? null,
    hardcoverUrl: slug ? `https://hardcover.app/books/${slug}` : null,
  };
}

function toAuthorResult(
  document: Record<string, unknown>,
): HardcoverSearchItem | undefined {
  const name = firstString(document, [["name"], ["title"]]);
  if (!name) {
    return undefined;
  }

  const booksCount = firstNumber(document, [["books_count"], ["book_count"]]);
  const personalName = firstString(document, [["name_personal"]]);
  let subtitle: string | null = null;
  if (booksCount !== undefined) {
    subtitle = `${booksCount} ${booksCount === 1 ? "book" : "books"}`;
  } else if (personalName && personalName !== name) {
    subtitle = personalName;
  }
  const description = firstString(document, [
    ["description"],
    ["bio"],
    ["overview"],
  ]);
  const slug = firstString(document, [["slug"]]);
  const rawId = firstId(document, [
    ["id"],
    ["author_id"],
    ["foreign_author_id"],
  ]);
  const id = rawId ?? slug ?? name;

  return {
    id,
    type: "author",
    slug: slug ?? null,
    title: name,
    subtitle,
    description: description ?? null,
    releaseYear: null,
    readers: firstNumber(document, [["users_count"]]) ?? null,
    coverUrl: getCoverUrl(document) ?? null,
    hardcoverUrl: slug ? `https://hardcover.app/authors/${slug}` : null,
  };
}

function parseSearchPayload(payload: unknown): SearchHit[] {
  const payloadRecord = toRecord(payload) as SearchPayload | undefined;
  if (!payloadRecord) {
    return [];
  }
  return Array.isArray(payloadRecord.hits)
    ? (payloadRecord.hits as SearchHit[])
    : [];
}

function interleave<T>(left: T[], right: T[], limit: number): T[] {
  const merged: T[] = [];
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    if (i < left.length) {
      merged.push(left[i]);
    }
    if (i < right.length) {
      merged.push(right[i]);
    }
    if (merged.length >= limit) {
      break;
    }
  }
  return merged.slice(0, limit);
}

function sortByReaders(items: HardcoverSearchItem[]): HardcoverSearchItem[] {
  return items.toSorted((a, b) => (b.readers ?? 0) - (a.readers ?? 0));
}

/**
 * Filters search results to only include books that have at least one edition
 * matching the selected language. The Hardcover search index doesn't include
 * language data, so this uses a secondary GraphQL query with Hasura's
 * relationship filter to check for any matching edition.
 */
async function applyLanguageFilter(
  items: HardcoverSearchItem[],
  language: string,
  authorization: string,
): Promise<HardcoverSearchItem[]> {
  const bookIds = items
    .map((item) => Number(item.id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (bookIds.length === 0) {
    return items;
  }

  try {
    const response = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        query: bookLanguageFilterQuery,
        variables: { ids: bookIds, langCode: language },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return items;
    }

    const body = (await response.json()) as {
      data?: { books?: unknown[] };
      errors?: Array<{ message: string }>;
    };
    if (body.errors && body.errors.length > 0) {
      return items;
    }

    const matchingIds = new Set<string>();
    for (const book of toRecordArray(body.data?.books)) {
      const bookId = firstId(book, [["id"]]);
      if (bookId) {
        matchingIds.add(bookId);
      }
    }

    return items.filter((item) => matchingIds.has(item.id));
  } catch {
    // If the language lookup fails, return unfiltered rather than breaking search
    return items;
  }
}

/**
 * Builds a batched GraphQL query that fetches the filtered book count for
 * multiple authors in a single request. Uses the same filters as the author
 * detail page: non-compilation, non-editor/translator contributions, and
 * optionally by language.
 */
function buildAuthorBookCountsQuery(
  slugs: string[],
  hasLanguage: boolean,
): string {
  const varDefs = hasLanguage ? `($languageCode: String!)` : "";
  const languageFilter = hasLanguage
    ? `\n        editions: { language: { code2: { _eq: $languageCode } } }`
    : "";

  const fragments = slugs
    .map((slug, i) => {
      // Escape any quotes in slug for safe embedding in GraphQL string literal
      const safeSlug = slug
        .replaceAll("\\", String.raw`\\`)
        .replaceAll('"', String.raw`\"`);
      return `  a${i}: books_aggregate(where: {
      contributions: { author: { slug: { _eq: "${safeSlug}" } }, ${NON_AUTHOR_CONTRIBUTION_FILTER} }
      ${BOOK_COMPILATION_FILTER}${languageFilter}
    }) {
      aggregate { count }
    }`;
    })
    .join("\n  ");

  return `query AuthorBookCounts${varDefs} {\n  ${fragments}\n}`;
}

/**
 * Fetches the filtered book count for each author result and updates their
 * subtitle. Uses the same filters as the author detail page (non-compilation,
 * non-editor contributions, language).
 */
async function applyAuthorBookCounts(
  items: HardcoverSearchItem[],
  language: string,
  authorization: string,
): Promise<HardcoverSearchItem[]> {
  const authorSlugs = items
    .filter((item) => item.slug)
    .map((item) => item.slug as string);
  if (authorSlugs.length === 0) {
    return items;
  }

  const hasLanguage = language !== "all";

  try {
    const query = buildAuthorBookCountsQuery(authorSlugs, hasLanguage);
    const variables: Record<string, string> = {};
    if (hasLanguage) {
      variables.languageCode = language;
    }

    const response = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });

    if (!response.ok) {
      return items;
    }

    const body = (await response.json()) as {
      data?: Record<string, unknown>;
      errors?: Array<{ message: string }>;
    };
    if (body.errors && body.errors.length > 0) {
      return items;
    }

    // Build a slug → count map from the aliased results
    const countBySlug = new Map<string, number>();
    for (let i = 0; i < authorSlugs.length; i += 1) {
      const count = parseAggregateCount(body.data?.[`a${i}`]);
      countBySlug.set(authorSlugs[i], count);
    }

    const filtered = items.filter((item) => {
      if (!item.slug || !countBySlug.has(item.slug)) {
        return true;
      }
      return countBySlug.get(item.slug)! > 0;
    });

    for (const item of filtered) {
      if (item.slug && countBySlug.has(item.slug)) {
        const count = countBySlug.get(item.slug)!;
        item.subtitle = `${count} ${count === 1 ? "book" : "books"}`;
      }
    }

    return filtered;
  } catch {
    // If the count lookup fails, return items with original subtitles
    return items;
  }
}

/**
 * Builds a batched GraphQL query that fetches author-role contributions for
 * multiple books in a single request, so search result cards can display the
 * same filtered author list as the book detail modal.
 */
function buildBookContributorsQuery(bookIds: number[]): string {
  const fragments = bookIds
    .map(
      (id, i) => `  b${i}: books(where: { id: { _eq: ${id} } }) {
      contributions(
        where: { ${AUTHOR_CONTRIBUTION_WHERE} }
        order_by: [{ id: asc }]
      ) {
        author { name }
      }
    }`,
    )
    .join("\n  ");

  return `query BookContributors {\n  ${fragments}\n}`;
}

/**
 * Fetches author-role contributors for each book result and updates the
 * subtitle to show only primary author + co-authors (excluding translators,
 * editors, etc.).
 */
async function applyBookContributors(
  items: HardcoverSearchItem[],
  authorization: string,
): Promise<HardcoverSearchItem[]> {
  const bookEntries = items
    .filter((item) => item.type === "book")
    .map((item) => ({ item, id: Number(item.id) }))
    .filter(({ id }) => Number.isFinite(id) && id > 0);
  if (bookEntries.length === 0) {
    return items;
  }

  try {
    const query = buildBookContributorsQuery(bookEntries.map((e) => e.id));
    const response = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });

    if (!response.ok) {
      return items;
    }

    const body = (await response.json()) as {
      data?: Record<string, unknown>;
      errors?: Array<{ message: string }>;
    };
    if (body.errors && body.errors.length > 0) {
      return items;
    }

    for (let i = 0; i < bookEntries.length; i += 1) {
      const booksArray = toRecordArray(body.data?.[`b${i}`]);
      if (booksArray.length === 0) {
        continue;
      }
      const contributors = toRecordArray(booksArray[0].contributions)
        .map((c) => {
          const authorRecord = toRecord(c.author);
          return authorRecord
            ? firstString(authorRecord, [["name"]])
            : undefined;
        })
        .filter(Boolean) as string[];
      if (contributors.length > 0) {
        bookEntries[i].item.subtitle = contributors.join(", ");
      }
    }

    return items;
  } catch {
    return items;
  }
}

async function fetchSearchResults(
  query: string,
  queryType: HardcoverQueryType,
  limit: number,
  authorization: string,
  language?: string,
): Promise<HardcoverSearchItem[]> {
  const filterByLanguage = language && language !== "all";
  // Request extra results when filtering by language to compensate for
  // books that will be removed, so we can still fill up to `limit`.
  const requestLimit = filterByLanguage ? Math.min(limit * 3, 50) : limit;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

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
          perPage: requestLimit,
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
    if (apiError) {
      throw new Error(apiError);
    }

    const hits = parseSearchPayload(body.data?.search?.results);
    const documents = hits
      .map((hit) => toRecord(hit.document))
      .filter(Boolean) as Array<Record<string, unknown>>;
    let mapped = documents
      .map((document) =>
        queryType === "Book"
          ? toBookResult(document)
          : toAuthorResult(document),
      )
      .filter(Boolean) as HardcoverSearchItem[];

    if (filterByLanguage && queryType === "Book") {
      mapped = await applyLanguageFilter(mapped, language, authorization);
    }

    if (queryType === "Book") {
      mapped = await applyBookContributors(mapped, authorization);
    }

    if (queryType === "Author" && language) {
      mapped = await applyAuthorBookCounts(mapped, language, authorization);
    }

    return mapped.slice(0, limit);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hardcover search timed out.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildOrderBy(
  sortBy: "title" | "year" | "rating",
  sortDir: "asc" | "desc",
): Array<Record<string, unknown>> {
  const dir = sortDir;
  const dirNullsLast = sortDir === "asc" ? "asc_nulls_last" : "desc_nulls_last";
  if (sortBy === "title") {
    return [{ title: dir }, { id: "asc" }];
  }
  if (sortBy === "rating") {
    return [{ rating: dirNullsLast }, { id: "asc" }];
  }
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
  authorization: string,
): Promise<{ books: HardcoverAuthorBook[]; totalBooks: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
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
      throw new Error(
        body.errors[0]?.message || "Hardcover books request failed.",
      );
    }

    const books = toRecordArray(body.data?.books)
      .map((bookRecord) => toHardcoverAuthorBook(bookRecord))
      .filter(Boolean) as HardcoverAuthorBook[];
    const totalBooks = parseAggregateCount(body.data?.books_aggregate);
    return { books, totalBooks };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hardcover books request timed out.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// oxlint-disable-next-line complexity -- Complex data-fetching function with many validation steps
async function fetchAuthorDetails(
  authorId: number,
  page: number,
  pageSize: number,
  language: string,
  sortBy: "title" | "year" | "rating",
  sortDir: "asc" | "desc",
  authorization: string,
): Promise<HardcoverAuthorDetail> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const metaResponse = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        query: authorDetailsMetaQuery,
        variables: { authorId },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const metaBody =
      (await metaResponse.json()) as GraphQLAuthorDetailsResponse;
    if (!metaResponse.ok) {
      throw new Error("Hardcover author request failed.");
    }
    if (metaBody.errors && metaBody.errors.length > 0) {
      throw new Error(
        metaBody.errors[0]?.message || "Hardcover author request failed.",
      );
    }

    const authors = toRecordArray(metaBody.data?.authors);
    const author = authors.length > 0 ? authors[0] : undefined;
    if (!author) {
      throw new Error("Author not found on Hardcover.");
    }

    const languagesMap = new Map<string, string>();
    for (const edition of toRecordArray(metaBody.data?.editions)) {
      const languageRecord = toRecord(edition.language);
      if (!languageRecord) {
        continue;
      }
      const code = normalizeLanguageCode(
        firstString(languageRecord, [["code2"], ["code3"]]),
      );
      const name = firstString(languageRecord, [["language"]]);
      if (!code || !name) {
        continue;
      }
      if (!languagesMap.has(code)) {
        languagesMap.set(code, name);
      }
    }
    if (!languagesMap.has("en")) {
      languagesMap.set("en", "English");
    }

    const selectedLanguageRaw = normalizeLanguageCode(language) || "en";
    const selectedLanguage =
      selectedLanguageRaw === "all" || languagesMap.has(selectedLanguageRaw)
        ? selectedLanguageRaw
        : "en";

    const authorSlug = firstString(author, [["slug"]]) || String(authorId);

    const booksPage = await fetchAuthorBooksPage(
      authorSlug,
      page,
      pageSize,
      selectedLanguage,
      sortBy,
      sortDir,
      authorization,
    );
    const totalPages = Math.max(1, Math.ceil(booksPage.totalBooks / pageSize));
    const safePage = Math.min(page, totalPages);
    let pagedBooks: HardcoverAuthorBook[];
    if (safePage === page) {
      pagedBooks = booksPage.books;
    } else {
      const safePageResult = await fetchAuthorBooksPage(
        authorSlug,
        safePage,
        pageSize,
        selectedLanguage,
        sortBy,
        sortDir,
        authorization,
      );
      pagedBooks = safePageResult.books;
    }
    const authorName = firstString(author, [["name"], ["title"]]);
    if (!authorName) {
      throw new Error("Author name is missing in Hardcover response.");
    }

    const languageOptions: HardcoverLanguageOption[] = [
      { code: "all", name: "All Languages" },
      ...[...languagesMap.entries()]
        .map(([code, name]) => ({ code, name }))
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    ];

    return {
      id:
        firstId(author, [["id"], ["author_id"], ["foreign_author_id"]]) ||
        authorSlug,
      slug: authorSlug,
      name: authorName,
      bio: firstString(author, [["bio"], ["overview"]]) ?? null,
      booksCount: booksPage.totalBooks,
      bornYear: firstNumber(author, [["born_year"]]) ?? null,
      deathYear: firstNumber(author, [["death_year"]]) ?? null,
      imageUrl: getCoverUrl(author) ?? null,
      hardcoverUrl: authorSlug
        ? `https://hardcover.app/authors/${authorSlug}`
        : null,
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
      throw new Error("Hardcover author request timed out.", { cause: error });
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
    const { query, type, limit, language } = data;

    if (type === "books") {
      const results = sortByReaders(
        await fetchSearchResults(query, "Book", limit, authorization, language),
      );
      return { query, type, results, total: results.length };
    }

    if (type === "authors") {
      const results = sortByReaders(
        await fetchSearchResults(
          query,
          "Author",
          limit,
          authorization,
          language,
        ),
      );
      return { query, type, results, total: results.length };
    }

    const [bookResults, authorResults] = await Promise.all([
      fetchSearchResults(query, "Book", limit, authorization, language),
      fetchSearchResults(query, "Author", limit, authorization, language),
    ]);
    const results = interleave(
      sortByReaders(bookResults),
      sortByReaders(authorResults),
      limit,
    );

    return { query, type, results, total: results.length };
  });

export const getHardcoverAuthorFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => authorDetailsInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    const authorization = getAuthorizationHeader();
    return fetchAuthorDetails(
      data.foreignAuthorId,
      data.page,
      data.pageSize,
      data.language,
      data.sortBy,
      data.sortDir,
      authorization,
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
  slug: z.string().min(1),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(all|[a-z]{2,3})$/)
    .default("all"),
});

type GraphQLAuthorSeriesResponse = {
  data?: { series?: unknown };
  errors?: Array<{ message?: string }>;
};

async function fetchAuthorSeries(
  slug: string,
  language: string,
  authorization: string,
): Promise<HardcoverAuthorSeries[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  const hasLanguageFilter = language !== "all";
  try {
    const response = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        query: buildAuthorSeriesQuery(hasLanguageFilter),
        variables: hasLanguageFilter ? { slug, lang: language } : { slug },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    const body = (await response.json()) as GraphQLAuthorSeriesResponse;
    if (!response.ok) {
      throw new Error("Hardcover series request failed.");
    }
    if (body.errors && body.errors.length > 0) {
      throw new Error(
        body.errors[0]?.message || "Hardcover series request failed.",
      );
    }
    return toRecordArray(body.data?.series)
      .map((s) => {
        // Count distinct non-null positions — mirrors the deduplicateSeriesBooks
        // logic so this number matches exactly what the expanded view will show.
        const positionRows = toRecordArray(s.positions);
        const distinctPositions = new Set(
          positionRows
            .map((p) => firstNumber(p, [["position"]]))
            .filter((p): p is number => p !== undefined),
        );
        const booksCount = distinctPositions.size;

        // Check if the author's association is only through anthologies.
        // If every book the author contributed to in this series has many
        // primary authors (> 4), it's likely an anthology — not a real
        // series association for this author.
        const authorBookEntries = toRecordArray(s.author_books);
        const hasNonAnthology = authorBookEntries.some((entry) => {
          const bookRecord = toRecord(entry.book);
          if (!bookRecord) {
            return false;
          }
          const aggRecord = toRecord(bookRecord.primary_authors);
          const aggregate = aggRecord
            ? toRecord(aggRecord.aggregate)
            : undefined;
          const count = aggregate
            ? firstNumber(aggregate, [["count"]])
            : undefined;
          return count !== undefined && count <= 4;
        });
        // If author_books is empty or all entries are anthologies, skip
        if (authorBookEntries.length > 0 && !hasNonAnthology) {
          return undefined;
        }

        return {
          id: String(firstId(s, [["id"]]) ?? ""),
          name: firstString(s, [["name"]]) ?? "",
          slug: firstString(s, [["slug"]]) ?? "",
          booksCount,
          isCompleted:
            typeof s.is_completed === "boolean" ? s.is_completed : null,
          hardcoverUrl: `https://hardcover.app/series/${firstString(s, [["slug"]]) ?? ""}`,
        };
      })
      .filter(
        (s): s is NonNullable<typeof s> =>
          s !== undefined &&
          s !== null &&
          s.id !== "" &&
          s.name !== "" &&
          s.booksCount > 0,
      );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hardcover series request timed out.", { cause: error });
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

// ---------------------------------------------------------------------------
// Book editions (paginated, sorted)
// ---------------------------------------------------------------------------

const bookEditionsQuery = `
query HardcoverBookEditions($bookId: Int!, $limit: Int!, $offset: Int!, $orderBy: [editions_order_by!]!) {
  books(where: { id: { _eq: $bookId } }) {
    editions_count
  }
  editions(
    where: { book_id: { _eq: $bookId } }
    limit: $limit
    offset: $offset
    order_by: $orderBy
  ) {
    id
    title
    isbn_10
    isbn_13
    asin
    pages
    release_date
    users_count
    score
    cached_contributors
    image { url }
    language { code2 language }
    country { name }
    publisher { name }
    reading_format { format }
  }
}
`;

function buildEditionsOrderBy(
  sortBy: EditionSortKey,
  sortDir: "asc" | "desc",
): Array<Record<string, unknown>> {
  const dir = sortDir;
  const dirNullsLast = sortDir === "asc" ? "asc_nulls_last" : "desc_nulls_last";
  const map: Record<EditionSortKey, Array<Record<string, unknown>>> = {
    title: [{ title: dirNullsLast }, { id: "asc" }],
    publisher: [{ publisher: { name: dirNullsLast } }, { id: "asc" }],
    type: [{ reading_format: { format: dirNullsLast } }, { id: "asc" }],
    pages: [{ pages: dirNullsLast }, { id: "asc" }],
    releaseDate: [{ release_date: dirNullsLast }, { id: "asc" }],
    isbn10: [{ isbn_10: dirNullsLast }, { id: "asc" }],
    isbn13: [{ isbn_13: dirNullsLast }, { id: "asc" }],
    asin: [{ asin: dirNullsLast }, { id: "asc" }],
    language: [{ language: { language: dirNullsLast } }, { id: "asc" }],
    country: [{ country: { name: dirNullsLast } }, { id: "asc" }],
    readers: [{ users_count: dir }, { id: "asc" }],
    score: [{ score: dir }, { id: "asc" }],
  };
  return map[sortBy];
}

type GraphQLBookEditionsResponse = {
  data?: {
    books?: unknown;
    editions?: unknown;
  };
  errors?: Array<{ message?: string }>;
};

async function fetchBookEditions(
  foreignBookId: number,
  page: number,
  pageSize: number,
  sortBy: EditionSortKey,
  sortDir: "asc" | "desc",
  authorization: string,
): Promise<HardcoverBookEditionsResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  const offset = (page - 1) * pageSize;

  try {
    const response = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        query: bookEditionsQuery,
        variables: {
          bookId: foreignBookId,
          limit: pageSize,
          offset,
          orderBy: buildEditionsOrderBy(sortBy, sortDir),
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const body = (await response.json()) as GraphQLBookEditionsResponse;
    if (!response.ok) {
      throw new Error("Hardcover editions request failed.");
    }
    if (body.errors && body.errors.length > 0) {
      throw new Error(
        body.errors[0]?.message || "Hardcover editions request failed.",
      );
    }

    const booksArray = toRecordArray(body.data?.books);
    const total =
      booksArray.length > 0
        ? (firstNumber(booksArray[0], [["editions_count"]]) ?? 0)
        : 0;
    const editions: HardcoverEdition[] = toRecordArray(body.data?.editions)
      .map((record) => {
        const id = firstId(record, [["id"]]);
        if (!id) {
          return undefined;
        }
        const title = firstString(record, [["title"]]) ?? "";

        // Author from cached_contributors
        const contributors = Array.isArray(record.cached_contributors)
          ? record.cached_contributors
          : [];
        const authorNames = contributors
          .map((c: unknown) => {
            const contributorRecord = toRecord(c);
            const authorRecord = contributorRecord
              ? toRecord(contributorRecord.author)
              : undefined;
            return authorRecord
              ? firstString(authorRecord, [["name"]])
              : undefined;
          })
          .filter(
            (n: unknown): n is string => typeof n === "string" && n.length > 0,
          );
        const author = authorNames.length > 0 ? authorNames.join(", ") : null;

        const publisherRecord = toRecord(record.publisher);
        const publisher = publisherRecord
          ? (firstString(publisherRecord, [["name"]]) ?? null)
          : null;

        const readingFormatRecord = toRecord(record.reading_format);
        const type = readingFormatRecord
          ? (firstString(readingFormatRecord, [["format"]]) ?? null)
          : null;

        const languageRecord = toRecord(record.language);
        const language = languageRecord
          ? (firstString(languageRecord, [["language"]]) ?? null)
          : null;

        const countryRecord = toRecord(record.country);
        const country = countryRecord
          ? (firstString(countryRecord, [["name"]]) ?? null)
          : null;

        return {
          id,
          title,
          author,
          publisher,
          type,
          pages: firstNumber(record, [["pages"]]) ?? null,
          releaseDate: firstString(record, [["release_date"]]) ?? null,
          isbn10: firstString(record, [["isbn_10"]]) ?? null,
          isbn13: firstString(record, [["isbn_13"]]) ?? null,
          asin: firstString(record, [["asin"]]) ?? null,
          language,
          country,
          readers: firstNumber(record, [["users_count"]]) ?? 0,
          score: firstNumber(record, [["score"]]) ?? 0,
          coverUrl: getCoverUrl(record) ?? null,
        };
      })
      .filter(Boolean) as HardcoverEdition[];

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return { editions, total, page, pageSize, totalPages };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hardcover editions request timed out.", {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

const bookEditionsInputSchema = z.object({
  foreignBookId: z.number().int().min(1),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  sortBy: z
    .enum([
      "title",
      "publisher",
      "type",
      "pages",
      "releaseDate",
      "isbn10",
      "isbn13",
      "asin",
      "language",
      "country",
      "readers",
      "score",
    ])
    .default("readers"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const getHardcoverBookEditionsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => bookEditionsInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    const authorization = getAuthorizationHeader();
    return fetchBookEditions(
      data.foreignBookId,
      data.page,
      data.pageSize,
      data.sortBy,
      data.sortDir,
      authorization,
    );
  });

// ── Book edition languages ──────────────────────────────────────────────────

export type BookLanguage = {
  name: string;
  code: string;
  readers: number;
};

const bookEditionLanguagesQuery = `
query HardcoverBookEditionLanguages($bookId: Int!) {
  editions(where: { book_id: { _eq: $bookId } }) {
    users_count
    language { code2 language }
  }
}
`;

async function fetchBookEditionLanguages(
  foreignBookId: number,
  authorization: string,
): Promise<BookLanguage[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        query: bookEditionLanguagesQuery,
        variables: { bookId: foreignBookId },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const body = (await response.json()) as {
      data?: { editions?: unknown };
      errors?: Array<{ message?: string }>;
    };
    if (!response.ok || (body.errors && body.errors.length > 0)) {
      return [];
    }

    const editions = toRecordArray(body.data?.editions);
    const langMap = new Map<
      string,
      { name: string; code: string; readers: number }
    >();

    for (const edition of editions) {
      const langRecord = toRecord(edition.language);
      if (!langRecord) {
        continue;
      }
      const code = firstString(langRecord, [["code2"]]);
      const name = firstString(langRecord, [["language"]]);
      if (!code || !name) {
        continue;
      }
      const readers = firstNumber(edition, [["users_count"]]) ?? 0;

      const existing = langMap.get(code);
      if (existing) {
        existing.readers += readers;
      } else {
        langMap.set(code, { name, code, readers });
      }
    }

    return [...langMap.values()].toSorted((a, b) => b.readers - a.readers);
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

const bookLanguagesInputSchema = z.object({
  foreignBookId: z.number().int().min(1),
});

export const getHardcoverBookLanguagesFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => bookLanguagesInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    const authorization = getAuthorizationHeader();
    return fetchBookEditionLanguages(data.foreignBookId, authorization);
  });

// ── Single book detail from Hardcover ───────────────────────────────────────

export type HardcoverBookDetail = {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  rating: number | null;
  ratingsCount: number | null;
  usersCount: number | null;
  coverUrl: string | null;
  series: HardcoverAuthorBookSeries[];
  contributors: Array<{ id: string; name: string }>;
};

const singleBookQuery = `
query HardcoverSingleBook($bookId: Int!) {
  books(where: { id: { _eq: $bookId } }) {
    id
    title
    slug
    description
    release_date
    release_year
    rating
    ratings_count
    users_count
    image { url }
    book_series {
      position
      series {
        id
        name
      }
    }
    contributions(
      where: { ${AUTHOR_CONTRIBUTION_WHERE} }
      order_by: [{ id: asc }]
    ) {
      author { id name }
    }
  }
}
`;

async function fetchSingleBook(
  bookId: number,
  authorization: string,
): Promise<HardcoverBookDetail | undefined> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        query: singleBookQuery,
        variables: { bookId },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const body = (await response.json()) as {
      data?: { books?: unknown };
      errors?: Array<{ message?: string }>;
    };
    if (!response.ok || (body.errors && body.errors.length > 0)) {
      return undefined;
    }

    const booksArray = toRecordArray(body.data?.books);
    if (booksArray.length === 0) {
      return undefined;
    }

    const bookRecord = booksArray[0];
    const id = firstId(bookRecord, [["id"]]);
    if (!id) {
      return undefined;
    }

    const bookSeriesEntries = toRecordArray(bookRecord.book_series);
    const series: HardcoverAuthorBookSeries[] = bookSeriesEntries
      .map((entry) => {
        const seriesRecord = toRecord(entry.series);
        if (!seriesRecord) {
          return undefined;
        }
        const seriesId = firstId(seriesRecord, [["id"]]);
        const seriesTitle = firstString(seriesRecord, [["name"], ["title"]]);
        if (!seriesId || !seriesTitle) {
          return undefined;
        }
        return {
          id: seriesId,
          title: seriesTitle,
          position:
            firstNumber(entry, [["position"]])?.toString() ??
            firstString(entry, [["position"]]) ??
            null,
        };
      })
      .filter(Boolean) as HardcoverAuthorBookSeries[];

    const contributors = toRecordArray(bookRecord.contributions)
      .map((c) => {
        const authorRecord = toRecord(c.author);
        if (!authorRecord) {
          return undefined;
        }
        const authorId = firstId(authorRecord, [["id"]]);
        const authorName = firstString(authorRecord, [["name"]]);
        if (!authorId || !authorName) {
          return undefined;
        }
        return { id: authorId, name: authorName };
      })
      .filter(Boolean) as Array<{ id: string; name: string }>;

    return {
      id,
      title: firstString(bookRecord, [["title"]]) ?? "",
      slug: firstString(bookRecord, [["slug"]]) ?? null,
      description: firstString(bookRecord, [["description"]]) ?? null,
      releaseDate: firstString(bookRecord, [["release_date"]]) ?? null,
      releaseYear: firstNumber(bookRecord, [["release_year"]]) ?? null,
      rating: firstNumber(bookRecord, [["rating"]]) ?? null,
      ratingsCount: firstNumber(bookRecord, [["ratings_count"]]) ?? null,
      usersCount: firstNumber(bookRecord, [["users_count"]]) ?? null,
      coverUrl: getCoverUrl(bookRecord) ?? null,
      series,
      contributors,
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeoutId);
  }
}

const singleBookInputSchema = z.object({
  foreignBookId: z.number().int().min(1),
});

export const getHardcoverBookDetailFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => singleBookInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    const authorization = getAuthorizationHeader();
    return fetchSingleBook(data.foreignBookId, authorization);
  });
