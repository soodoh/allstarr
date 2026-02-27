// ---------------------------------------------------------------------------
// Optimized GraphQL queries for Hardcover import operations
// ---------------------------------------------------------------------------

import type {
  GraphQLResponse,
  HardcoverRawAuthor,
  HardcoverRawBook,
  HardcoverRawContribution,
  HardcoverRawBookSeries,
  HardcoverRawEdition,
  HardcoverRawSeries,
  HardcoverRawSeriesBook,
} from "./types";

const HARDCOVER_GRAPHQL_URL = "https://api.hardcover.app/v1/graphql";
const REQUEST_TIMEOUT_MS = 30_000;
const EDITIONS_BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const BATCH_DELAY_MS = 500;
const EDITIONS_CONCURRENCY = 3;

// ---------------------------------------------------------------------------
// Shared GraphQL helpers (duplicated from search.ts to avoid coupling)
// ---------------------------------------------------------------------------

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => toRecord(entry)).filter(Boolean) as Array<
    Record<string, unknown>
  >;
}

function firstString(
  record: Record<string, unknown>,
  paths: string[][],
): string | undefined {
  for (const path of paths) {
    let current: unknown = record;
    for (const key of path) {
      const next = toRecord(current);
      if (!next || !(key in next)) {
        current = undefined;
        break;
      }
      current = next[key];
    }
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (trimmed.length > 0) {return trimmed;}
    }
  }
  return undefined;
}

function firstNumber(
  record: Record<string, unknown>,
  paths: string[][],
): number | undefined {
  for (const path of paths) {
    let current: unknown = record;
    for (const key of path) {
      const next = toRecord(current);
      if (!next || !(key in next)) {
        current = undefined;
        break;
      }
      current = next[key];
    }
    if (typeof current === "number" && Number.isFinite(current)) {return current;}
    if (typeof current === "string") {
      const parsed = Number(current);
      if (Number.isFinite(parsed)) {return parsed;}
    }
  }
  return undefined;
}

function getCoverUrl(record: Record<string, unknown>): string | undefined {
  const imageRecord = toRecord(record.image);
  if (imageRecord) {
    const imageUrl = firstString(imageRecord, [["url"], ["large"], ["medium"]]);
    if (imageUrl) {return imageUrl;}
  }
  return undefined;
}

async function fetchGraphQL<T = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown>,
  authorization: string,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(HARDCOVER_GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        clearTimeout(timeoutId);
        const delay = 2000 * 2 ** attempt; // 2s, 4s, 8s, 16s, 32s
        await new Promise((resolve) => { setTimeout(resolve, delay); });
        continue;
      }

      const rawText = await response.text();
      let body: GraphQLResponse<T>;
      try {
        body = JSON.parse(rawText) as GraphQLResponse<T>;
      } catch {
        throw new Error(`Hardcover API returned non-JSON (status ${response.status})`);
      }
      if (!response.ok) {
        throw new Error(`Hardcover API request failed (status ${response.status}).`);
      }
      if (body.errors && body.errors.length > 0) {
        throw new Error(body.errors[0]?.message || "Hardcover API error.");
      }
      if (!body.data) {
        throw new Error("No data in Hardcover API response.");
      }
      return body.data;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Hardcover API request timed out.", { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error("Hardcover API rate limit exceeded after retries.");
}

export function getAuthorizationHeader(): string {
  const rawToken = process.env.HARDCOVER_TOKEN?.trim();
  if (!rawToken) {
    throw new Error("HARDCOVER_TOKEN is not configured.");
  }
  return rawToken.startsWith("Bearer ") ? rawToken : `Bearer ${rawToken}`;
}

// ---------------------------------------------------------------------------
// Query 1: Author Complete — author meta + ALL books in one call
// ---------------------------------------------------------------------------

const AUTHOR_COMPLETE_QUERY = `
query AuthorComplete($authorId: Int!, $limit: Int!, $offset: Int!) {
  authors(where: { id: { _eq: $authorId } }, limit: 1) {
    id
    name
    slug
    bio
    born_year
    death_year
    image { url }
  }
  books(
    where: {
      contributions: { author_id: { _eq: $authorId } }
      compilation: { _neq: true }
    }
    limit: $limit
    offset: $offset
    order_by: [{ release_year: desc_nulls_last }, { id: desc }]
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
    image { url }
    contributions(order_by: [{ id: asc }], limit: 10) {
      contribution
      author {
        id
        name
        slug
        image { url }
      }
    }
    book_series {
      position
      series {
        id
        name
        slug
        is_completed
      }
    }
  }
  books_aggregate(
    where: {
      contributions: { author_id: { _eq: $authorId } }
      compilation: { _neq: true }
    }
  ) {
    aggregate { count }
  }
}
`;

function parseRawBook(bookRecord: Record<string, unknown>): HardcoverRawBook | undefined {
  const id = firstNumber(bookRecord, [["id"]]);
  const title = firstString(bookRecord, [["title"]]);
  if (!id || !title) {return undefined;}

  const contributions: HardcoverRawContribution[] = toRecordArray(
    bookRecord.contributions,
  ).map((c, i) => {
    const authorRecord = toRecord(c.author);
    return {
      authorId: authorRecord ? firstNumber(authorRecord, [["id"]]) ?? 0 : 0,
      authorName: authorRecord
        ? firstString(authorRecord, [["name"]]) ?? ""
        : "",
      authorSlug: authorRecord
        ? firstString(authorRecord, [["slug"]])
        : undefined,
      authorImageUrl: authorRecord ? getCoverUrl(authorRecord) : undefined,
      contribution:
        typeof c.contribution === "string" ? c.contribution : undefined,
      position: i,
    };
  });

  const bookSeriesEntries = toRecordArray(bookRecord.book_series);
  const series: HardcoverRawBookSeries[] = bookSeriesEntries
    .map((entry) => {
      const seriesRecord = toRecord(entry.series);
      if (!seriesRecord) {return undefined;}
      const seriesId = firstNumber(seriesRecord, [["id"]]);
      const seriesTitle = firstString(seriesRecord, [["name"], ["title"]]);
      if (!seriesId || !seriesTitle) {return undefined;}
      return {
        seriesId,
        seriesTitle,
        seriesSlug: firstString(seriesRecord, [["slug"]]),
        isCompleted:
          typeof seriesRecord.is_completed === "boolean"
            ? seriesRecord.is_completed
            : undefined,
        position:
          firstNumber(entry, [["position"]])?.toString() ??
          firstString(entry, [["position"]]),
      };
    })
    .filter(Boolean) as HardcoverRawBookSeries[];

  return {
    id,
    title,
    slug: firstString(bookRecord, [["slug"]]),
    description: firstString(bookRecord, [["description"]]),
    releaseDate: firstString(bookRecord, [["release_date"]]),
    releaseYear: firstNumber(bookRecord, [["release_year"]]),
    rating: firstNumber(bookRecord, [["rating"]]),
    ratingsCount: firstNumber(bookRecord, [["ratings_count"]]),
    usersCount: firstNumber(bookRecord, [["users_count"]]),
    coverUrl: getCoverUrl(bookRecord),
    isCompilation: bookRecord.compilation === true,
    contributions,
    series,
  };
}

export async function fetchAuthorComplete(
  authorId: number,
  authorization: string,
): Promise<{ author: HardcoverRawAuthor; books: HardcoverRawBook[] }> {
  const BATCH_SIZE = 500;
  let offset = 0;
  const allBooks: HardcoverRawBook[] = [];
  // oxlint-disable-next-line prefer-const -- assigned after API call
  let author: HardcoverRawAuthor | undefined;
  let totalBooks = 0;

  // First page — also fetches author meta
  const firstPage = await fetchGraphQL<{
    authors: unknown;
    books: unknown;
    books_aggregate: unknown;
  }>(AUTHOR_COMPLETE_QUERY, { authorId, limit: BATCH_SIZE, offset: 0 }, authorization);

  const authors = toRecordArray(firstPage.authors);
  const authorRecord = authors[0];
  if (!authorRecord) {
    throw new Error("Author not found on Hardcover.");
  }

  author = {
    id: firstNumber(authorRecord, [["id"]]) ?? authorId,
    name: firstString(authorRecord, [["name"]]) ?? "",
    slug: firstString(authorRecord, [["slug"]]),
    bio: firstString(authorRecord, [["bio"]]),
    bornYear: firstNumber(authorRecord, [["born_year"]]),
    deathYear: firstNumber(authorRecord, [["death_year"]]),
    imageUrl: getCoverUrl(authorRecord),
  };

  const aggRecord = toRecord(firstPage.books_aggregate);
  const aggInner = aggRecord ? toRecord(aggRecord.aggregate) : undefined;
  totalBooks = aggInner ? firstNumber(aggInner, [["count"]]) ?? 0 : 0;

  const firstPageBooks = toRecordArray(firstPage.books)
    .map(parseRawBook)
    .filter(Boolean) as HardcoverRawBook[];
  allBooks.push(...firstPageBooks);
  offset += BATCH_SIZE;

  // Paginate remaining books
  while (offset < totalBooks) {
    const page = await fetchGraphQL<{ books: unknown }>(
      AUTHOR_COMPLETE_QUERY,
      { authorId, limit: BATCH_SIZE, offset },
      authorization,
    );
    const pageBooks = toRecordArray(page.books)
      .map(parseRawBook)
      .filter(Boolean) as HardcoverRawBook[];
    allBooks.push(...pageBooks);
    offset += BATCH_SIZE;
    if (pageBooks.length < BATCH_SIZE) {break;}
  }

  return { author, books: allBooks };
}

// ---------------------------------------------------------------------------
// Query 2: Series Complete — all series + their books in one call
// ---------------------------------------------------------------------------

const SERIES_COMPLETE_QUERY = `
query SeriesComplete($seriesIds: [Int!]!) {
  series(where: { id: { _in: $seriesIds } }) {
    id
    name
    slug
    is_completed
    book_series(
      where: { compilation: { _neq: true } }
      order_by: [{ position: asc_nulls_last }, { book: { users_count: desc } }]
    ) {
      position
      compilation
      book {
        id
        title
        slug
        release_date
        release_year
        rating
        users_count
        image { url }
        contributions(
          where: { contribution: { _is_null: true } }
          order_by: [{ id: asc }]
          limit: 1
        ) {
          author {
            id
            name
            slug
            image { url }
          }
        }
      }
    }
  }
}
`;

export async function fetchSeriesComplete(
  seriesIds: number[],
  authorization: string,
): Promise<HardcoverRawSeries[]> {
  if (seriesIds.length === 0) {return [];}

  const data = await fetchGraphQL<{ series: unknown }>(
    SERIES_COMPLETE_QUERY,
    { seriesIds },
    authorization,
  );

  return toRecordArray(data.series)
    .map((s) => {
      const id = firstNumber(s, [["id"]]);
      const title = firstString(s, [["name"], ["title"]]);
      if (!id || !title) {return undefined;}

      const bookEntries = toRecordArray(s.book_series);
      // Deduplicate by position
      const seen = new Set<number>();
      const books: HardcoverRawSeriesBook[] = bookEntries
        .map((entry) => {
          const position = firstNumber(entry, [["position"]]);
          // Skip null position entries
          if (position === undefined) {return undefined;}
          if (seen.has(position)) {return undefined;}
          seen.add(position);

          const bookRecord = toRecord(entry.book);
          if (!bookRecord) {return undefined;}
          const bookId = firstNumber(bookRecord, [["id"]]);
          const bookTitle = firstString(bookRecord, [["title"]]);
          if (!bookId || !bookTitle) {return undefined;}

          const contributions = toRecordArray(bookRecord.contributions);
          const primaryContribution =
            contributions.length > 0 ? contributions[0] : undefined;
          const primaryAuthor = primaryContribution
            ? toRecord(primaryContribution.author)
            : undefined;

          return {
            bookId,
            bookTitle,
            bookSlug: firstString(bookRecord, [["slug"]]),
            position: position.toString(),
            isCompilation: entry.compilation === true,
            releaseDate: firstString(bookRecord, [["release_date"]]),
            releaseYear: firstNumber(bookRecord, [["release_year"]]),
            rating: firstNumber(bookRecord, [["rating"]]),
            usersCount: firstNumber(bookRecord, [["users_count"]]),
            coverUrl: getCoverUrl(bookRecord),
            authorId: primaryAuthor
              ? firstNumber(primaryAuthor, [["id"]])
              : undefined,
            authorName: primaryAuthor
              ? firstString(primaryAuthor, [["name"]])
              : undefined,
            authorSlug: primaryAuthor
              ? firstString(primaryAuthor, [["slug"]])
              : undefined,
            authorImageUrl: primaryAuthor
              ? getCoverUrl(primaryAuthor)
              : undefined,
          };
        })
        .filter(Boolean) as HardcoverRawSeriesBook[];

      return {
        id,
        title,
        slug: firstString(s, [["slug"]]),
        isCompleted:
          typeof s.is_completed === "boolean" ? s.is_completed : undefined,
        books,
      };
    })
    .filter(Boolean) as HardcoverRawSeries[];
}

// ---------------------------------------------------------------------------
// Query 3: Batched Book Editions — uses alias pattern
// ---------------------------------------------------------------------------

function buildBatchedEditionsQuery(bookIds: number[]): string {
  const fragments = bookIds
    .map(
      (bookId, i) => `  b${i}: editions(
    where: { book_id: { _eq: ${bookId} } }
    order_by: [{ users_count: desc_nulls_last }]
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
    edition_information
  }`,
    )
    .join("\n");

  return `query BatchedEditions {\n${fragments}\n}`;
}

function parseEdition(
  record: Record<string, unknown>,
  bookId: number,
): HardcoverRawEdition | undefined {
  const id = firstNumber(record, [["id"]]);
  if (!id) {return undefined;}

  const publisherRecord = toRecord(record.publisher);
  const readingFormatRecord = toRecord(record.reading_format);
  const languageRecord = toRecord(record.language);
  const countryRecord = toRecord(record.country);

  const cachedContributors = Array.isArray(record.cached_contributors)
    ? record.cached_contributors
    : [];
  const contributors = cachedContributors
    .map((c: unknown) => {
      const cr = toRecord(c);
      if (!cr) {return undefined;}
      const authorRecord = toRecord(cr.author);
      return {
        authorId: String(
          authorRecord ? firstNumber(authorRecord, [["id"]]) ?? "" : "",
        ),
        name: authorRecord
          ? firstString(authorRecord, [["name"]]) ?? ""
          : "",
        contribution:
          typeof cr.contribution === "string" ? cr.contribution : undefined,
      };
    })
    .filter(Boolean) as Array<{
    authorId: string;
    name: string;
    contribution: string | undefined;
  }>;

  return {
    id,
    bookId,
    title: firstString(record, [["title"]]) ?? "",
    isbn10: firstString(record, [["isbn_10"]]),
    isbn13: firstString(record, [["isbn_13"]]),
    asin: firstString(record, [["asin"]]),
    format: readingFormatRecord
      ? firstString(readingFormatRecord, [["format"]])
      : undefined,
    pageCount: firstNumber(record, [["pages"]]),
    publisher: publisherRecord
      ? firstString(publisherRecord, [["name"]])
      : undefined,
    editionInformation: firstString(record, [["edition_information"]]),
    releaseDate: firstString(record, [["release_date"]]),
    language: languageRecord
      ? firstString(languageRecord, [["language"]])
      : undefined,
    languageCode: languageRecord
      ? firstString(languageRecord, [["code2"]])
      : undefined,
    country: countryRecord
      ? firstString(countryRecord, [["name"]])
      : undefined,
    usersCount: firstNumber(record, [["users_count"]]) ?? 0,
    score: firstNumber(record, [["score"]]) ?? 0,
    coverUrl: getCoverUrl(record),
    contributors,
  };
}

export async function fetchBatchedEditions(
  bookIds: number[],
  authorization: string,
): Promise<Map<number, HardcoverRawEdition[]>> {
  const result = new Map<number, HardcoverRawEdition[]>();
  if (bookIds.length === 0) {return result;}

  // Split into batches
  const batches: number[][] = [];
  for (let i = 0; i < bookIds.length; i += EDITIONS_BATCH_SIZE) {
    batches.push(bookIds.slice(i, i + EDITIONS_BATCH_SIZE));
  }

  // Process in concurrent groups
  for (let g = 0; g < batches.length; g += EDITIONS_CONCURRENCY) {
    if (g > 0) {
      await new Promise((resolve) => { setTimeout(resolve, BATCH_DELAY_MS); });
    }

    const group = batches.slice(g, g + EDITIONS_CONCURRENCY);
    const results = await Promise.all(
      group.map(async (batch) => {
        const query = buildBatchedEditionsQuery(batch);
        const data = await fetchGraphQL<Record<string, unknown>>(
          query,
          {},
          authorization,
        );
        return { batch, data };
      }),
    );

    for (const { batch, data } of results) {
      for (let j = 0; j < batch.length; j += 1) {
        const bookId = batch[j];
        const eds = toRecordArray(data[`b${j}`])
          .map((r) => parseEdition(r, bookId))
          .filter(Boolean) as HardcoverRawEdition[];
        result.set(bookId, eds);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Query 4: Book Complete — single book with editions + contributions
// ---------------------------------------------------------------------------

const BOOK_COMPLETE_QUERY = `
query BookComplete($bookId: Int!) {
  books(where: { id: { _eq: $bookId } }, limit: 1) {
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
    contributions(order_by: [{ id: asc }], limit: 10) {
      contribution
      author {
        id
        name
        slug
        image { url }
      }
    }
    book_series {
      position
      series {
        id
        name
        slug
        is_completed
      }
    }
  }
  editions(
    where: { book_id: { _eq: $bookId } }
    order_by: [{ users_count: desc_nulls_last }]
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
    edition_information
  }
}
`;

export async function fetchBookComplete(
  foreignBookId: number,
  authorization: string,
): Promise<{
  book: HardcoverRawBook;
  editions: HardcoverRawEdition[];
} | undefined> {
  const data = await fetchGraphQL<{ books: unknown; editions: unknown }>(
    BOOK_COMPLETE_QUERY,
    { bookId: foreignBookId },
    authorization,
  );

  const booksArray = toRecordArray(data.books);
  if (booksArray.length === 0) {return undefined;}

  const book = parseRawBook(booksArray[0]);
  if (!book) {return undefined;}

  const editions = toRecordArray(data.editions)
    .map((r) => parseEdition(r, foreignBookId))
    .filter(Boolean) as HardcoverRawEdition[];

  return { book, editions };
}
