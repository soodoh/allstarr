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
}

const searchInputSchema = z.object({
  query: z.string().trim().min(2).max(120),
  type: z.enum(["all", "books", "authors"]).default("all"),
  limit: z.number().int().min(1).max(50).default(20),
});

const authorDetailsInputSchema = z.object({
  slug: z.string().trim().min(1).max(160),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(all|[a-z]{2,3})$/)
    .default("en"),
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

const authorBooksPageQuery = `
query HardcoverAuthorBooksPage($slug: String!, $limit: Int!, $offset: Int!) {
  books_aggregate(where: { contributions: { author: { slug: { _eq: $slug } } } }) {
    aggregate {
      count
    }
  }
  books(
    where: { contributions: { author: { slug: { _eq: $slug } } } }
    limit: $limit
    offset: $offset
    order_by: [{ release_year: desc_nulls_last }, { id: desc }]
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
      where: { language: { code2: { _is_null: false } } }
      order_by: [{ id: asc }]
    ) {
      language {
        code2
        code3
        language
      }
    }
  }
}
`;

const authorBooksPageByLanguageQuery = `
query HardcoverAuthorBooksPageByLanguage(
  $slug: String!
  $limit: Int!
  $offset: Int!
  $languageCode: String!
) {
  books_aggregate(
    where: {
      contributions: { author: { slug: { _eq: $slug } } }
      editions: { language: { code2: { _eq: $languageCode } } }
    }
  ) {
    aggregate {
      count
    }
  }
  books(
    where: {
      contributions: { author: { slug: { _eq: $slug } } }
      editions: { language: { code2: { _eq: $languageCode } } }
    }
    limit: $limit
    offset: $offset
    order_by: [{ release_year: desc_nulls_last }, { id: desc }]
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
      where: { language: { code2: { _eq: $languageCode } } }
      order_by: [{ id: asc }]
    ) {
      language {
        code2
        code3
        language
      }
    }
  }
}
`;

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

async function fetchAuthorBooksPage(
  slug: string,
  page: number,
  pageSize: number,
  selectedLanguage: string,
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
        query: hasLanguageFilter
          ? authorBooksPageByLanguageQuery
          : authorBooksPageQuery,
        variables: {
          slug,
          limit: pageSize,
          offset,
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
      booksCount:
        firstNumber(author, [["books_count"], ["book_count"]]) ??
        booksPage.totalBooks,
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
      authorization
    );
  });
